"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canOwnCategory, isCrmDepartment, type CrmDepartment } from "@/lib/departments";

type MemberRow = RowDataPacket & { id: number; name: string; role: string; department: CrmDepartment | null; is_active: number };
type CategoryRow = RowDataPacket & { enquiry_category: string };

async function ownedCategories(connection: Awaited<ReturnType<typeof db.getConnection>>, id: number): Promise<string[]> {
  // Includes closed leads as well as tasks: a department change must not leave historical
  // lead pages or pending work assigned to a counsellor in the wrong department.
  const [rows] = await connection.execute<CategoryRow[]>(
    `SELECT DISTINCT l.enquiry_category FROM leads l WHERE l.owner_id = ?
     UNION
     SELECT DISTINCT l.enquiry_category FROM tasks t JOIN leads l ON l.id = t.lead_id
     WHERE t.owner_id = ? AND t.completed_at IS NULL`, [id, id]
  );
  return rows.map(row => row.enquiry_category);
}

export async function createTeamMember(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "");
  const rawDepartment = String(form.get("department") ?? "");
  const department = role === "counsellor" && isCrmDepartment(rawDepartment) ? rawDepartment : null;
  if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 ||
      password.length < 12 || password.length > 128 || !["manager", "counsellor"].includes(role) ||
      (role === "counsellor" && !department) || (role === "manager" && rawDepartment !== "")) {
    redirect("/team?error=invalid");
  }
  const [existing] = await db.execute<RowDataPacket[]>("SELECT id FROM crm_users WHERE email = ? LIMIT 1", [email]);
  if (existing.length) redirect("/team?error=duplicate");
  const hash = await bcrypt.hash(password, 12);
  try {
    await db.execute("INSERT INTO crm_users (name, email, role, department, password_hash) VALUES (?, ?, ?, ?, ?)", [name, email, role, department, hash]);
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
  const rawDepartment = String(form.get("department") ?? "");
  const replacement = Number(form.get("replacement"));
  if (!Number.isSafeInteger(id) || id <= 0 || id === user.id || !["role", "delete", "restore"].includes(operation))
    return { message: "Invalid account action.", ok: false };
  const connection = await db.getConnection();
  let message = "";
  try {
    await connection.beginTransaction();
    const [actors] = await connection.execute<MemberRow[]>("SELECT id, name, role, department, is_active FROM crm_users WHERE id = ? AND is_active = 1 FOR UPDATE", [user.id]);
    const [targets] = await connection.execute<MemberRow[]>("SELECT id, name, role, department, is_active FROM crm_users WHERE id = ? FOR UPDATE", [id]);
    const actor = actors[0], target = targets[0];
    if (!actor || !target || !(actor.role === "admin" && ["manager", "counsellor"].includes(target.role) || actor.role === "manager" && target.role === "counsellor")) {
      await connection.rollback(); return { message: "You can only manage accounts below your own role.", ok: false };
    }
    if (operation === "role") {
      if (actor.role !== "admin" || !["manager", "counsellor"].includes(role) || !target.is_active) {
        await connection.rollback(); return { message: "Only an admin can update an active manager or counsellor.", ok: false };
      }
      const department = role === "counsellor" && isCrmDepartment(rawDepartment) ? rawDepartment : null;
      if ((role === "counsellor" && !department) || (role === "manager" && rawDepartment !== "")) {
        await connection.rollback(); return { message: "Choose a department for counsellors; managers must have no department.", ok: false };
      }
      const categories = await ownedCategories(connection, id);
      if (categories.some(category => !canOwnCategory(role, department, category))) {
        await connection.rollback(); return { message: "This account owns leads or open tasks outside the selected department. Reassign them before changing its role or department.", ok: false };
      }
      await connection.execute("UPDATE crm_users SET role = ?, department = ? WHERE id = ?", [role, department, id]);
      message = `Role and department updated for ${target.name}.`;
    } else if (operation === "restore") {
      if (target.role === "counsellor" && !target.department) {
        await connection.rollback(); return { message: "Set a department before restoring this counsellor.", ok: false };
      }
      const categories = await ownedCategories(connection, id);
      if (categories.some(category => !canOwnCategory(target.role, target.department, category))) {
        await connection.rollback(); return { message: "Account has work outside its department. Resolve assignments before restoring.", ok: false };
      }
      await connection.execute("UPDATE crm_users SET is_active = 1 WHERE id = ?", [id]);
      message = `Account restored for ${target.name}.`;
    } else {
      const [leads] = await connection.execute<RowDataPacket[]>(
        `SELECT id, enquiry_category FROM leads WHERE owner_id = ? AND status NOT IN ('lost','admitted')
         AND NOT EXISTS (SELECT 1 FROM school_partnerships sp WHERE sp.lead_id=leads.id AND sp.stage IN ('confirmed','closed')) ORDER BY id FOR UPDATE`, [id]
      );
      const [tasks] = await connection.execute<RowDataPacket[]>(
        `SELECT t.id, l.enquiry_category FROM tasks t JOIN leads l ON l.id = t.lead_id
         WHERE t.owner_id = ? AND t.completed_at IS NULL FOR UPDATE`, [id]
      );
      if (leads.length || tasks.length) {
        const [staff] = Number.isSafeInteger(replacement) && replacement > 0 && replacement !== id
          ? await connection.execute<MemberRow[]>("SELECT id, name, role, department, is_active FROM crm_users WHERE id = ? AND is_active = 1 AND role IN ('admin','manager','counsellor') FOR UPDATE", [replacement])
          : [[] as MemberRow[]];
        const receiver = staff[0];
        const categories = [...leads, ...tasks].map(item => String(item.enquiry_category));
        if (!receiver || categories.some(category => !canOwnCategory(receiver.role, receiver.department, category))) {
          await connection.rollback(); return { message: "Choose an active replacement authorized for every open lead and pending task (or choose an admin/manager).", ok: false };
        }
        await connection.execute(
          `UPDATE leads SET owner_id = ? WHERE owner_id = ? AND status NOT IN ('lost','admitted')
           AND NOT EXISTS (SELECT 1 FROM school_partnerships sp WHERE sp.lead_id=leads.id AND sp.stage IN ('confirmed','closed'))`, [replacement, id]
        );
        await connection.execute("UPDATE tasks SET owner_id = ? WHERE owner_id = ? AND completed_at IS NULL", [replacement, id]);
        for (const lead of leads) {
          await connection.execute("UPDATE tasks SET owner_id = ? WHERE lead_id = ? AND completed_at IS NULL", [replacement, lead.id]);
          await connection.execute(
            "INSERT INTO lead_activities (lead_id, actor_id, activity_type, note, occurred_at) VALUES (?, ?, 'assignment', ?, UTC_TIMESTAMP(3))",
            [lead.id, user.id, `Account disabled: ${target.name}. Lead reassigned to ${receiver.name}.`]
          );
        }
      }
      await connection.execute("UPDATE crm_users SET is_active = 0 WHERE id = ?", [id]);
      message = `Account disabled for ${target.name}. History preserved.`;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  revalidatePath("/team");
  revalidatePath("/leads", "layout");
  revalidatePath("/dashboard");
  return { message, ok: true };
}
