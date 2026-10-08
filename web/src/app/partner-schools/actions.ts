"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

async function requireManager() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "manager") redirect("/partner-schools");
}
function schoolId(form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid school ID");
  return id;
}
function refreshSchools() {
  revalidatePath("/partner-schools");
  revalidatePath("/leads", "layout");
}
export async function setSchoolActive(form: FormData) {
  await requireManager();
  const id = schoolId(form);
  const active = String(form.get("active"));
  if (active !== "0" && active !== "1") throw new Error("Invalid school status");
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE partner_schools SET is_active = ? WHERE id = ?", [Number(active), id]
  );
  if (!result.affectedRows) redirect("/partner-schools?notice=missing");
  refreshSchools();
  redirect(`/partner-schools?notice=${active === "1" ? "restored" : "archived"}`);
}
export async function editPartnerSchool(form: FormData) {
  await requireManager();
  const id = schoolId(form);
  const read = (key: string) => String(form.get(key) ?? "").trim();
  const name = read("name"), type = read("type"), city = read("city"), state = read("state");
  const board = read("board"), classes = read("classes"), fee = read("fee"), notes = read("notes");
  if (!name || name.length > 255 || !["day", "boarding", "both"].includes(type) ||
      city.length > 120 || state.length > 120 || board.length > 120 ||
      classes.length > 255 || fee.length > 255 || notes.length > 5000) {
    redirect(`/partner-schools/${id}/edit?error=invalid`);
  }
  const connection = await db.getConnection();
  let outcome = "saved";
  try {
    await connection.beginTransaction();
    const [school] = await connection.execute<RowDataPacket[]>("SELECT id FROM partner_schools WHERE id = ? FOR UPDATE", [id]);
    if (!school.length) outcome = "missing";
    else {
      const [duplicates] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM partner_schools WHERE id <> ? AND name = ? AND city <=> ? AND state <=> ? LIMIT 1",
        [id, name, city || null, state || null]
      );
      if (duplicates.length) outcome = "duplicate";
      else await connection.execute(
        `UPDATE partner_schools SET name = ?, school_type = ?, city = ?, state = ?, board = ?,
         classes_offered = ?, fee_note = ?, internal_notes = ? WHERE id = ?`,
        [name, type, city || null, state || null, board || null, classes || null, fee || null, notes || null, id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  if (outcome === "duplicate") redirect(`/partner-schools/${id}/edit?error=duplicate`);
  refreshSchools();
  redirect(`/partner-schools?notice=${outcome}`);
}
