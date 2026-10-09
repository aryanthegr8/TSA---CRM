"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export async function bulkAssignLeads(_previous: { message: string; ok: boolean }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "manager") return { message: "Only admins and managers can assign leads.", ok: false };
  const rawIds = form.getAll("leadId").map(String);
  const ids = [...new Set(rawIds.map(Number))].sort((a, b) => a - b);
  const ownerId = Number(form.get("ownerId"));
  const category = String(form.get("category"));
  if (!rawIds.length || rawIds.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      !Number.isSafeInteger(ownerId) || ownerId <= 0 || !["boarding_parent", "school_owner", "general"].includes(category)) {
    return { message: "Select 1–50 leads and an active counsellor.", ok: false };
  }
  const connection = await db.getConnection();
  let changed = 0;
  try {
    await connection.beginTransaction();
    const [staff] = await connection.execute<RowDataPacket[]>(
      "SELECT id, name FROM crm_users WHERE id = ? AND is_active = 1 AND role = 'counsellor' FOR UPDATE", [ownerId]
    );
    const [leads] = await connection.execute<RowDataPacket[]>(
      `SELECT id, owner_id FROM leads WHERE id IN (${ids.map(() => "?").join(",")}) AND enquiry_category = ? ORDER BY id FOR UPDATE`, [...ids, category]
    );
    if (!staff.length || leads.length !== ids.length) {
      await connection.rollback();
      return { message: "The counsellor or selected leads are no longer available. Refresh and try again.", ok: false };
    }
    for (const lead of leads) {
      if (Number(lead.owner_id) === ownerId) continue;
      await connection.execute("UPDATE leads SET owner_id = ? WHERE id = ?", [ownerId, lead.id]);
      await connection.execute("UPDATE tasks SET owner_id = ? WHERE lead_id = ? AND completed_at IS NULL", [ownerId, lead.id]);
      await connection.execute(
        "INSERT INTO lead_activities (lead_id, actor_id, activity_type, note, occurred_at) VALUES (?, ?, 'assignment', ?, UTC_TIMESTAMP(3))",
        [lead.id, user.id, `Bulk assignment: ${lead.owner_id == null ? "unassigned" : `previous owner ID ${lead.owner_id}`} → ${staff[0].name} (ID ${ownerId})`]
      );
      changed++;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Bulk lead assignment failed", error instanceof Error ? error.name : "Unknown error");
    return { message: "Assignment failed. No changes were saved. Try again.", ok: false };
  } finally { connection.release(); }
  revalidatePath("/leads", "layout");
  revalidatePath("/dashboard");
  return { message: `${changed} lead${changed === 1 ? "" : "s"} assigned. ${ids.length - changed} already assigned to this counsellor.`, ok: true };
}
