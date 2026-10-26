"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canOwnCategory } from "@/lib/departments";

class LeadUpdateExit extends Error {
  constructor(public readonly reason: "not_found" | "closed") {
    super(reason);
  }
}

type LeadLock = RowDataPacket & { owner_id: number | null; status: string; enquiry_category: string };
type TaskLock = RowDataPacket & { id: number };
const stages = new Set(["new", "attempting_contact", "connected", "qualified", "exploring_options", "application_in_progress", "on_hold", "lost"]);
const methods = new Set(["call", "whatsapp", "email", "note"]);

export async function recordLeadUpdate(leadId: number, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!Number.isSafeInteger(leadId) || leadId <= 0) notFound();

  const method = String(form.get("method") ?? "");
  const status = String(form.get("status") ?? "");
  const outcome = String(form.get("outcome") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const due = String(form.get("followUp") ?? "");
  if (!methods.has(method) || !stages.has(status) || !note || note.length > 2000 || outcome.length > 160) {
    redirect(`/leads/${leadId}?error=fields`);
  }
  let dueUtc: string | null = null;
  if (status !== "lost") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)) redirect(`/leads/${leadId}?error=due`);
    const date = new Date(`${due}:00+05:30`);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) redirect(`/leads/${leadId}?error=due`);
    dueUtc = date.toISOString().slice(0, 23).replace("T", " ");
  }

  const connection = await db.getConnection();
  let exitReason: "not_found" | "closed" | null = null;
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [leads] = await connection.execute<LeadLock[]>(
      "SELECT owner_id, status, enquiry_category FROM leads WHERE id = ? FOR UPDATE", [leadId]
    );
    const lead = leads[0];
    if (
      !lead ||
      (user.role === "counsellor" && lead.owner_id !== user.id) ||
      !canOwnCategory(
        user.role,
        user.department,
        lead.enquiry_category
      )
    ) {
      throw new LeadUpdateExit("not_found");
    }
    if (lead.status === "admitted" || lead.status === "lost") throw new LeadUpdateExit("closed");

    const [tasks] = await connection.execute<TaskLock[]>(
      "SELECT id FROM tasks WHERE lead_id = ? AND referral_id IS NULL AND completed_at IS NULL ORDER BY due_at, id LIMIT 1 FOR UPDATE", [leadId]
    );
    if (tasks[0]) {
      await connection.execute(
        "UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE id = ?",
        [outcome || note, tasks[0].id]
      );
    }
    if (status === "lost") {
      await connection.execute(
        "UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = 'Lead closed as lost' WHERE lead_id = ? AND completed_at IS NULL",
        [leadId]
      );
    }
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))",
      [leadId, user.id, method, outcome || null, note]
    );
    if (lead.status !== status) {
      await connection.execute("UPDATE leads SET status = ? WHERE id = ?", [status, leadId]);
      await connection.execute(
        "INSERT INTO lead_activities (lead_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, 'status_change', ?, ?, UTC_TIMESTAMP(3))",
        [leadId, user.id, status, `Stage changed from ${lead.status} to ${status}`]
      );
    }
    if (dueUtc) {
      await connection.execute(
        "INSERT INTO tasks (lead_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, ?, ?)",
        [leadId, lead.owner_id ?? user.id, lead.enquiry_category === "school_owner" ? "Follow up with school owner" : "Follow up with parent", lead.enquiry_category === "school_owner" ? "contact_school" : "call_parent", dueUtc]
      );
    }
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error instanceof LeadUpdateExit) {
      exitReason = error.reason;
    } else {
      throw error;
    }
  } finally {
    connection.release();
  }

  if (exitReason === "not_found") notFound();
  if (exitReason === "closed") redirect(`/leads/${leadId}?error=closed`);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/leads/boarding-parents");
  revalidatePath("/leads/school-owners");
  revalidatePath("/dashboard");
  redirect(`/leads/${leadId}?saved=1`);
}
