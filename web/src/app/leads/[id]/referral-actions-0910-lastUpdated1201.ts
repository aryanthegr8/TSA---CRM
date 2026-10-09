"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

type LeadRow = RowDataPacket & { owner_id: number | null; school_type: string; status: string; enquiry_category: string };
type SchoolRow = RowDataPacket & { school_type: string };
type ReferralRow = RowDataPacket & { id: number; status: string; partner_school_id: number };
type TaskRow = RowDataPacket & { id: number };
import { referralTransitions as transitions, transferChannels } from "@/lib/referral-workflow";
const leadAccess = async (leadId: number, userId: number, role: string, connection: import("mysql2/promise").PoolConnection) => {
  const [rows] = await connection.execute<LeadRow[]>(
    "SELECT owner_id, school_type, status, enquiry_category FROM leads WHERE id = ? FOR UPDATE", [leadId]
  );
  const lead = rows[0];
  if (!lead || (role === "counsellor" && lead.owner_id !== userId)) notFound();
  if (lead.enquiry_category === "school_owner") notFound();
  if (lead.status === "admitted" || lead.status === "lost") redirect(`/leads/${leadId}?referralError=closed`);
  return lead;
};
const allowedId = (id: number) => Number.isSafeInteger(id) && id > 0;
const refresh = (leadId: number) => { revalidatePath("/leads/boarding-parents"); revalidatePath("/leads/school-owners"); revalidatePath("/leads"); revalidatePath(`/leads/${leadId}`); revalidatePath(`/leads/${leadId}/refer`); revalidatePath("/dashboard"); };

export async function shortlistSchool(leadId: number, schoolId: number, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedId(leadId) || !allowedId(schoolId)) notFound();
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length > 1000) redirect(`/leads/${leadId}/refer?error=reason`);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const lead = await leadAccess(leadId, user.id, user.role, connection);
    const [schools] = await connection.execute<SchoolRow[]>(
      "SELECT school_type FROM partner_schools WHERE id = ? AND is_active = 1", [schoolId]
    );
    const school = schools[0];
    if (!school || (lead.school_type !== "undecided" && school.school_type !== "both" && school.school_type !== lead.school_type)) notFound();
    const [existing] = await connection.execute<ReferralRow[]>(
      "SELECT id FROM referrals WHERE lead_id = ? AND partner_school_id = ? FOR UPDATE", [leadId, schoolId]
    );
    if (existing.length) {
      await connection.commit();
      redirect(`/leads/${leadId}?referralError=duplicate`);
    }
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO referrals (lead_id, partner_school_id, counsellor_id, reason_for_match) VALUES (?, ?, ?, ?)",
      [leadId, schoolId, user.id, reason || null]
    );
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'shortlisted', 'School shortlisted', UTC_TIMESTAMP(3))",
      [leadId, result.insertId, user.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  refresh(leadId);
  redirect(`/leads/${leadId}?referralSaved=1`);
}

export async function updateReferral(leadId: number, referralId: number, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedId(leadId) || !allowedId(referralId)) notFound();
  const status = String(form.get("status") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const contactRaw = String(form.get("contact") ?? "");
  const contactId = contactRaw ? Number(contactRaw) : null;
  const due = String(form.get("followUp") ?? "");
  const channel = String(form.get("channel") ?? "");
  const recipient = String(form.get("recipient") ?? "").trim();
  const visit = String(form.get("visitAt") ?? "");
  if (status === "sent_to_school" && (!transferChannels.includes(channel) || !recipient || recipient.length > 255)) {
    redirect(`/leads/${leadId}?referralError=transfer`);
  }
  let visitUtc: string | null = null;
  if (status === "visit_scheduled") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(visit)) redirect(`/leads/${leadId}?referralError=visit`);
    const date = new Date(`${visit}:00+05:30`);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) redirect(`/leads/${leadId}?referralError=visit`);
    visitUtc = date.toISOString().slice(0, 23).replace("T", " ");
  }
  if (!note || note.length > 2000 || (contactId !== null && !allowedId(contactId))) redirect(`/leads/${leadId}?referralError=fields`);
  let dueUtc: string | null = null;
  if (due) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)) redirect(`/leads/${leadId}?referralError=due`);
    const date = new Date(`${due}:00+05:30`);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) redirect(`/leads/${leadId}?referralError=due`);
    dueUtc = date.toISOString().slice(0, 23).replace("T", " ");
  }
  if (["sent_to_school", "school_responded", "visit_scheduled", "school_visited", "application_started", "applied"].includes(status) && !dueUtc) {
    redirect(`/leads/${leadId}?referralError=due`);
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const lead = await leadAccess(leadId, user.id, user.role, connection);
    const [refs] = await connection.execute<ReferralRow[]>(
      "SELECT id, status, partner_school_id FROM referrals WHERE id = ? AND lead_id = ? FOR UPDATE", [referralId, leadId]
    );
    const referral = refs[0];
    if (!referral || !transitions[referral.status]?.includes(status)) redirect(`/leads/${leadId}?referralError=transition`);
    if (contactId) {
      const [contacts] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM school_contacts WHERE id = ? AND partner_school_id = ? AND is_active = 1", [contactId, referral.partner_school_id]
      );
      if (!contacts.length) redirect(`/leads/${leadId}?referralError=contact`);
    }
    await connection.execute(
      `UPDATE referrals SET status = ?, school_contact_id = COALESCE(?, school_contact_id),
       shared_at = CASE WHEN ? IN ('shared_with_parent','parent_interested') AND shared_at IS NULL THEN UTC_TIMESTAMP(3) ELSE shared_at END,
       sent_at = CASE WHEN ? = 'sent_to_school' AND sent_at IS NULL THEN UTC_TIMESTAMP(3) ELSE sent_at END,
       applied_at = CASE WHEN ? = 'applied' AND applied_at IS NULL THEN UTC_TIMESTAMP(3) ELSE applied_at END,
       admitted_at = CASE WHEN ? = 'admitted' AND admitted_at IS NULL THEN UTC_TIMESTAMP(3) ELSE admitted_at END,
       school_response = CASE WHEN ? = 'school_responded' THEN ? ELSE school_response END,
       closed_reason = CASE WHEN ? = 'not_proceeding' THEN ? ELSE closed_reason END
       WHERE id = ?`, [status, contactId, status, status, status, status, status, note, status, note.slice(0, 255), referralId]
    );
    if (status === "sent_to_school") await connection.execute(
      "UPDATE referrals SET sent_by_user_id = ?, transfer_channel = ?, transfer_recipient = ? WHERE id = ?",
      [user.id, channel, recipient, referralId]
    );
    if (status === "visit_scheduled") await connection.execute(
      "UPDATE referrals SET visit_scheduled_at = ? WHERE id = ?", [visitUtc, referralId]
    );
    if (status === "school_visited") await connection.execute(
      "UPDATE referrals SET visited_at = COALESCE(visited_at, UTC_TIMESTAMP(3)) WHERE id = ?", [referralId]
    );
    const [tasks] = await connection.execute<TaskRow[]>(
      "SELECT id FROM tasks WHERE referral_id = ? AND completed_at IS NULL ORDER BY due_at, id LIMIT 1 FOR UPDATE", [referralId]
    );
    if (tasks[0]) await connection.execute(
      "UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE id = ?", [note, tasks[0].id]
    );
    if (status === "admitted" || status === "not_proceeding") await connection.execute(
      "UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE referral_id = ? AND completed_at IS NULL",
      [note, referralId]
    );
    if (dueUtc && status !== "admitted" && status !== "not_proceeding") await connection.execute(
      "INSERT INTO tasks (lead_id, referral_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, 'Follow up with school', 'contact_school', ?)",
      [leadId, referralId, lead.owner_id ?? user.id, dueUtc]
    );
    if (status === "application_started" || status === "applied") await connection.execute(
      "UPDATE leads SET status = 'application_in_progress' WHERE id = ?", [leadId]
    );
    if (status === "admitted") {
      await connection.execute("UPDATE leads SET status = 'admitted' WHERE id = ?", [leadId]);
      await connection.execute(
        "UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = 'Admission confirmed' WHERE lead_id = ? AND completed_at IS NULL", [leadId]
      );
    }
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', ?, ?, UTC_TIMESTAMP(3))",
      [leadId, referralId, user.id, status, (status === "sent_to_school" ? `Shared via ${channel} with ${recipient}. ${note}` : status === "visit_scheduled" ? `Visit scheduled for ${visit.replace("T", " ")} IST. ${note}` : note)]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  refresh(leadId);
  revalidatePath("/leads");
  redirect(`/leads/${leadId}?referralSaved=1`);
}

export async function shortlistSchools(leadId: number, _previous: { message: string }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const raw = form.getAll("schoolId");
  const ids = [...new Set(raw.map(Number))].sort((a, b) => a - b);
  const reason = String(form.get("reason") ?? "").trim();
  if (!allowedId(leadId) || !ids.length || raw.length > 100 || ids.some(id => !allowedId(id)) || reason.length > 1000) {
    return { message: "Select up to 100 schools and keep the match reason within 1,000 characters." };
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const lead = await leadAccess(leadId, user.id, user.role, connection);
    const [schools] = await connection.execute<(SchoolRow & { id: number })[]>(
      `SELECT id, school_type FROM partner_schools WHERE id IN (${ids.map(() => "?").join(",")}) AND is_active = 1 ORDER BY id FOR UPDATE`, ids
    );
    if (schools.length !== ids.length || schools.some(school => lead.school_type !== "undecided" && school.school_type !== "both" && school.school_type !== lead.school_type)) {
      await connection.rollback();
      return { message: "Some schools are no longer active or do not match the lead’s school type. Refresh and select again." };
    }
    for (const school of schools) {
      const [existing] = await connection.execute<ReferralRow[]>("SELECT id FROM referrals WHERE lead_id = ? AND partner_school_id = ?", [leadId, school.id]);
      if (existing.length) continue;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO referrals (lead_id, partner_school_id, counsellor_id, reason_for_match) VALUES (?, ?, ?, ?)",
        [leadId, school.id, user.id, reason || null]
      );
      await connection.execute(
        "INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'shortlisted', 'School shortlisted in multiple-school selection', UTC_TIMESTAMP(3))",
        [leadId, result.insertId, user.id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  refresh(leadId);
  redirect(`/leads/${leadId}?referralSaved=1#referrals`);
}
