"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

type LeadLock = RowDataPacket & { owner_id: number | null };
type Staff = RowDataPacket & { id: number; name: string };

export async function assignLead(leadId: number, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "counsellor") redirect("/dashboard");
  if (!Number.isSafeInteger(leadId) || leadId <= 0) notFound();
  const newOwner = Number(form.get("ownerId"));
  if (!Number.isSafeInteger(newOwner) || newOwner <= 0) redirect(`/leads/${leadId}?assignmentError=invalid`);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [leads] = await connection.execute<LeadLock[]>("SELECT owner_id FROM leads WHERE id = ? FOR UPDATE", [leadId]);
    if (!leads[0]) notFound();
    const [staff] = await connection.execute<Staff[]>("SELECT id, name FROM crm_users WHERE id = ? AND is_active = 1 AND role IN ('counsellor','manager','admin') LIMIT 1", [newOwner]);
    if (!staff[0]) redirect(`/leads/${leadId}?assignmentError=invalid`);
    if (leads[0].owner_id !== newOwner) {
      await connection.execute("UPDATE leads SET owner_id = ? WHERE id = ?", [newOwner, leadId]);
      await connection.execute("UPDATE tasks SET owner_id = ? WHERE lead_id = ? AND completed_at IS NULL", [newOwner, leadId]);
      await connection.execute("INSERT INTO lead_activities (lead_id, actor_id, activity_type, note, occurred_at) VALUES (?, ?, 'assignment', ?, UTC_TIMESTAMP(3))", [leadId, user.id, `Assigned to ${staff[0].name}`]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/my-day");
  revalidatePath("/dashboard");
  redirect(`/leads/${leadId}?assigned=1`);
}
