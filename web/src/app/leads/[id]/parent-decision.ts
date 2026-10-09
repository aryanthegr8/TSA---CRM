"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const outcomes: Record<string, { label: string; stage: string }> = {
  discussing: { label: "Discussing requirements / options", stage: "connected" },
  comparing: { label: "Comparing selected schools", stage: "exploring_options" },
  budget: { label: "Budget issue", stage: "on_hold" },
  location: { label: "Location does not suit", stage: "exploring_options" },
  considering: { label: "Needs time / family discussion", stage: "on_hold" },
  no_answer: { label: "No answer — try again", stage: "attempting_contact" },
  proceed: { label: "Proceeding with admission", stage: "application_in_progress" },
  not_looking: { label: "Not looking for admission", stage: "lost" },
  elsewhere: { label: "Admission taken elsewhere", stage: "lost" },
};
export async function recordParentDecision(leadId: number, _previous: { message: string }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!Number.isSafeInteger(leadId) || leadId <= 0) notFound();
  const outcome = String(form.get("decision"));
  const config = outcomes[outcome];
  const raw = form.getAll("referralId");
  const ids = [...new Set(raw.map(Number))].sort((a,b) => a-b);
  const note = String(form.get("note") ?? "").trim();
  if (!config || !note || note.length > 2000 || raw.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return { message: "Choose an outcome and enter a note (up to 2,000 characters)." };
  const closed = config.stage === "lost";
  if (!closed && !ids.length && !["no_answer", "discussing", "budget", "location", "considering"].includes(outcome)) return { message: "Select the schools discussed with the parent." };
  if (outcome === "proceed" && ids.length !== 1) return { message: "Select exactly one school the parent wants to proceed with." };
  let dueUtc: string | null = null;
  if (!closed) {
    const due = String(form.get("followUp") ?? "");
    const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due) ? new Date(`${due}:00+05:30`) : new Date(NaN);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return { message: "Set a future parent follow-up in India time." };
    dueUtc = date.toISOString().slice(0,23).replace("T"," ");
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [leads] = await connection.execute<RowDataPacket[]>("SELECT owner_id, status, enquiry_category FROM leads WHERE id = ? FOR UPDATE", [leadId]);
    const lead = leads[0];
    if (!lead || (user.role === "counsellor" && Number(lead.owner_id) !== user.id) || lead.enquiry_category === "school_owner") notFound();
    if (["lost", "admitted"].includes(lead.status)) {
      await connection.rollback(); return { message: "This lead is already closed. Refresh the page." };
    }
    const [refs] = await connection.execute<RowDataPacket[]>("SELECT r.id, r.status, ps.name FROM referrals r JOIN partner_schools ps ON ps.id = r.partner_school_id WHERE r.lead_id = ? ORDER BY r.id FOR UPDATE", [leadId]);
    const selected = refs.filter(ref => ids.includes(Number(ref.id)));
    if (selected.length !== ids.length || selected.some(ref => ["not_proceeding","admitted"].includes(ref.status))) {
      await connection.rollback(); return { message: "Selected schools are unavailable or closed. Refresh and try again." };
    }
    const summary = `${config.label}. Schools discussed: ${selected.map(ref => ref.name).join(", ") || "None"}. ${note}`;
    await connection.execute("UPDATE leads SET status = ? WHERE id = ?", [config.stage, leadId]);
    await connection.execute("INSERT INTO lead_activities (lead_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, 'call', ?, ?, UTC_TIMESTAMP(3))", [leadId, user.id, config.label, summary]);
    await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE lead_id = ? AND referral_id IS NULL AND completed_at IS NULL", [config.label, leadId]);
    for (const ref of refs) {
      const stop = closed || (outcome === "proceed" && !ids.includes(Number(ref.id)));
      if (stop && !["admitted", "not_proceeding"].includes(ref.status)) {
        const reason = closed ? config.label : `Parent chose ${selected[0].name}`;
        await connection.execute("UPDATE referrals SET status = 'not_proceeding', closed_reason = ? WHERE id = ?", [reason.slice(0,255), ref.id]);
        await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE referral_id = ? AND completed_at IS NULL", [reason, ref.id]);
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'not_proceeding', ?, UTC_TIMESTAMP(3))", [leadId, ref.id, user.id, reason]);
      } else if (outcome === "proceed" && ids.includes(Number(ref.id))) {
        // Preserve the actual school stage: deciding to proceed is not proof of a sent application or confirmed admission.
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'parent_selected', ?, UTC_TIMESTAMP(3))", [leadId, ref.id, user.id, `Parent selected this school to proceed. ${note}`]);
      }
    }
    if (closed) await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE lead_id = ? AND completed_at IS NULL", [config.label, leadId]);
    else await connection.execute("INSERT INTO tasks (lead_id, referral_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, ?, 'call_parent', ?)", [leadId, outcome === "proceed" ? ids[0] : null, lead.owner_id ?? user.id, outcome === "proceed" ? "Follow up on chosen school admission" : "Follow up with parent", dueUtc]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  revalidatePath("/leads", "layout"); revalidatePath("/dashboard");
  redirect(`/leads/${leadId}?decisionSaved=1&tab=follow-up`);
}
