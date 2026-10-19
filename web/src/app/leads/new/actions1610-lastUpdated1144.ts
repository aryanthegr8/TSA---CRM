"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const sources = new Set(["website", "meta_form", "whatsapp", "phone", "referral", "walk_in", "other"]);
const types = new Set(["day", "boarding", "undecided"]);

export async function createLead(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const phone = field(form, "phone").replace(/[\s()-]/g, "");
  const parent = field(form, "parent");
  const student = field(form, "student");
  const classSought = field(form, "classSought");
  const location = field(form, "location");
  const source = field(form, "source");
  const type = field(form, "schoolType");
  const due = field(form, "followUp");
  const note = field(form, "note");
  const admissionYear = field(form, "admissionYear");
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !parent || !sources.has(source) || !types.has(type) ||
      parent.length > 160 || student.length > 160 || classSought.length > 40 || location.length > 255 || note.length > 2000 ||
      !/^20\d{2}$/.test(admissionYear) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)) {
    redirect("/leads/new?error=invalid");
  }
  // Staff currently work in India. Explicit offset prevents the server's timezone from changing the intended time.
  const dueDate = new Date(`${due}:00+05:30`);
  if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) redirect("/leads/new?error=due");
  const dueUtc = dueDate.toISOString().slice(0, 23).replace("T", " ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [familyResult] = await connection.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO families (parent_name, primary_phone) VALUES (?, ?)", [parent, phone]
    );
    const [leadResult] = await connection.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO leads (family_id, student_name, class_sought, admission_year, school_type,
        preferred_location, source, owner_id, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [familyResult.insertId, student || null, classSought || null, Number(admissionYear), type, location || null, source, user.id]
    );
    await connection.execute(
      "INSERT INTO tasks (lead_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, 'call_parent', ?)",
      [leadResult.insertId, user.id, "First follow-up with parent", dueUtc]
    );
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, actor_id, activity_type, note, occurred_at) VALUES (?, ?, 'note', ?, UTC_TIMESTAMP(3))",
      [leadResult.insertId, user.id, note || "Lead entered manually"]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  redirect("/leads");
}
