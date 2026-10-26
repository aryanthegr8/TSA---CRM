"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canOwnCategory } from "@/lib/departments";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const sources = new Set(["website", "meta_form", "whatsapp", "phone", "referral", "walk_in", "other"]);
const types = new Set(["day", "boarding", "undecided"]);

export async function createLead(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const requestedCategory = field(form, "category");
  if (!["school_owner", "boarding_parent", "day_parent", "general"].includes(requestedCategory)) {
    redirect("/leads/new?error=category");
  }
  const category = requestedCategory;
  if (!canOwnCategory(user.role, user.department, category)) {
    redirect("/leads/new?error=forbidden");
  }
  const schoolOwner = category === "school_owner";
  const errorPath = `/leads/new?category=${category}&error=`;
  const phone = field(form, "phone").replace(/[\s()-]/g, "");
  const parent = field(form, "parent");
  const student = field(form, "student");
  const classSought = field(form, "classSought");
  const location = field(form, "location");
  const source = field(form, "source");
  const type = category === "day_parent" ? "day" : field(form, "schoolType");
  const due = field(form, "followUp");
  const note = field(form, "note");
  const admissionYear = field(form, "admissionYear");
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !parent || !sources.has(source) || !types.has(type) ||
      parent.length > 160 || student.length > 160 || classSought.length > 40 || location.length > 255 || note.length > 2000 ||
      (!schoolOwner && !/^20\d{2}$/.test(admissionYear)) || (schoolOwner && (!field(form,"schoolName") || field(form,"schoolName").length>255)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)) {
    redirect(`${errorPath}invalid`);
  }
  // Staff currently work in India. Explicit offset prevents the server's timezone from changing the intended time.
  const dueDate = new Date(`${due}:00+05:30`);
  if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) redirect(`${errorPath}due`);
  const dueUtc = dueDate.toISOString().slice(0, 23).replace("T", " ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [familyResult] = await connection.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO families (parent_name, primary_phone) VALUES (?, ?)", [parent, phone]
    );
    const [leadResult] = await connection.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO leads (family_id, student_name, class_sought, admission_year, school_type,
        preferred_location, source, owner_id, enquiry_category, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [familyResult.insertId, student || null, classSought || null, schoolOwner ? null : Number(admissionYear), type, location || null, source, user.id, category]
    );
    if (schoolOwner) await connection.execute("INSERT INTO school_partnerships (lead_id,school_name,school_type,contact_name,contact_phone) VALUES (?,?,?,?,?)",[leadResult.insertId,field(form,"schoolName"),"boarding",parent,phone]);
    await connection.execute(
      "INSERT INTO tasks (lead_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, ?, ?)",
      [leadResult.insertId, user.id, schoolOwner ? "First partnership discussion with school" : "First follow-up with parent", schoolOwner ? "contact_school" : "call_parent", dueUtc]
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
  revalidatePath("/leads/school-owners");
  revalidatePath("/leads/boarding-parents");
  redirect(category === "day_parent" ? "/leads/day-parents" : category === "school_owner" ? "/leads/school-owners" : category === "boarding_parent" ? "/leads/boarding-parents" : "/leads");
}
