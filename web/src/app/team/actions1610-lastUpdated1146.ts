"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export async function createTeamMember(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "");
  if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 ||
      password.length < 12 || password.length > 128 || !["manager", "counsellor"].includes(role)) {
    redirect("/team?error=invalid");
  }
  const [existing] = await db.execute<RowDataPacket[]>("SELECT id FROM crm_users WHERE email = ? LIMIT 1", [email]);
  if (existing.length) redirect("/team?error=duplicate");
  const hash = await bcrypt.hash(password, 12);
  try {
    await db.execute("INSERT INTO crm_users (name, email, role, password_hash) VALUES (?, ?, ?, ?)", [name, email, role, hash]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") redirect("/team?error=duplicate");
    throw error;
  }
  revalidatePath("/team");
  redirect("/team?saved=1");
}

export async function manageTeamMember(_previous: { message: string; ok: boolean }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["admin", "manager"].includes(user.role)) return { message: "Access denied.", ok: false };
  const id = Number(form.get("id"));
  const operation = String(form.get("operation"));
  const role = String(form.get("role"));
  const replacement = Number(form.get("replacement"));
  if (!Number.isSafeInteger(id) || id <= 0 || id === user.id || !["role", "delete", "restore"].includes(operation)) return { message: "Invalid account action.", ok: false };
  const connection = await db.getConnection();
  let message = "";
  try {
    await connection.beginTransaction();
    const [actors] = await connection.execute<RowDataPacket[]>("SELECT role FROM crm_users WHERE id = ? AND is_active = 1 FOR UPDATE", [user.id]);
    const [targets] = await connection.execute<RowDataPacket[]>("SELECT id, name, role, is_active FROM crm_users WHERE id = ? FOR UPDATE", [id]);
    const actor = actors[0], target = targets[0];
    if (!actor || !target || !(actor.role === "admin" && ["manager", "counsellor"].includes(target.role) || actor.role === "manager" && target.role === "counsellor")) {
      await connection.rollback(); return { message: "You can only manage accounts below your own role.", ok: false };
    }
    if (operation === "role") {
      if (actor.role !== "admin" || !["manager", "counsellor"].includes(role) || !target.is_active) {
        await connection.rollback(); return { message: "Only an admin can change an active account between manager and counsellor.", ok: false };
      }
      await connection.execute("UPDATE crm_users SET role = ? WHERE id = ?", [role, id]);
      message = `Role updated for ${target.name}.`;
    } else if (operation === "restore") {
      await connection.execute("UPDATE crm_users SET is_active = 1 WHERE id = ?", [id]);
      message = `Account restored for ${target.name}.`;
    } else {
      const [leads] = await connection.execute<RowDataPacket[]>("SELECT id FROM leads WHERE owner_id = ? AND status NOT IN ('lost','admitted') ORDER BY id FOR UPDATE", [id]);
      const [tasks] = await connection.execute<RowDataPacket[]>("SELECT id FROM tasks WHERE owner_id = ? AND completed_at IS NULL FOR UPDATE", [id]);
      if (leads.length || tasks.length) {
        const [staff] = Number.isSafeInteger(replacement) && replacement > 0 && replacement !== id ? await connection.execute<RowDataPacket[]>("SELECT id, name FROM crm_users WHERE id = ? AND is_active = 1 AND role IN ('admin','manager','counsellor') FOR UPDATE", [replacement]) : [[]];
        if (!staff.length) { await connection.rollback(); return { message: "Choose an active replacement for this account’s open leads and pending tasks.", ok: false }; }
        await connection.execute("UPDATE leads SET owner_id = ? WHERE owner_id = ? AND status NOT IN ('lost','admitted')", [replacement, id]);
        await connection.execute("UPDATE tasks SET owner_id = ? WHERE owner_id = ? AND completed_at IS NULL", [replacement, id]);
        for (const lead of leads) {
          await connection.execute("UPDATE tasks SET owner_id = ? WHERE lead_id = ? AND completed_at IS NULL", [replacement, lead.id]);
          await connection.execute("INSERT INTO lead_activities (lead_id, actor_id, activity_type, note, occurred_at) VALUES (?, ?, 'assignment', ?, UTC_TIMESTAMP(3))", [lead.id, user.id, `Account disabled: ${target.name}. Lead reassigned to ${staff[0].name}.`]);
        }
      }
      await connection.execute("UPDATE crm_users SET is_active = 0 WHERE id = ?", [id]);
      message = `Account disabled for ${target.name}. History preserved.`;
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  revalidatePath("/team"); revalidatePath("/leads", "layout"); revalidatePath("/dashboard");
  return { message, ok: true };
}
