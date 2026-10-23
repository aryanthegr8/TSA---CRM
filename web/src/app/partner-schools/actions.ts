"use server";

import { schoolWhatsappRecipient } from "@/lib/school-whatsapp";
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
  const whatsappRecipient = read("whatsappRecipient");
  const ncr=form.get("dayParentDelhiNcr")==="yes"?1:0;
  const board = read("board"), classes = read("classes"), fee = read("fee"), notes = read("notes");
  if (ncr&&(!["day","both"].includes(type)||!city)||!name || name.length > 255 || !["day", "boarding", "both"].includes(type) ||
      city.length > 120 || state.length > 120 || board.length > 120 ||
      whatsappRecipient.length > 255 || classes.length > 255 || fee.length > 255 || notes.length > 5000) {
    redirect(`/partner-schools/${id}/edit?error=invalid`);
  }
  const connection = await db.getConnection();
  let outcome = "saved";
  try {
    await connection.beginTransaction();
    const [school] = await connection.execute<RowDataPacket[]>("SELECT id, name FROM partner_schools WHERE id = ? FOR UPDATE", [id]);
    if (!school.length) outcome = "missing";
    else {
      const [duplicates] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM partner_schools WHERE id <> ? AND name = ? AND city <=> ? AND state <=> ? LIMIT 1",
        [id, name, city || null, state || null]
      );
      if (duplicates.length) outcome = "duplicate";
      else await connection.execute(
        `UPDATE partner_schools SET name = ?, school_type = ?, city = ?, state = ?, board = ?,
         classes_offered = ?, fee_note = ?, internal_notes = ?, whatsapp_recipient = ?, day_parent_delhi_ncr = ? WHERE id = ?`,
        [name, type, city || null, state || null, board || null, classes || null, fee || null, notes || null, schoolWhatsappRecipient(name, whatsappRecipient, school[0].name), ncr, id]
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

/** Archive/restore only the selected schools on the currently visible page. */
export async function bulkSetSchoolActive(form: FormData) {
  await requireManager();
  const raw = form.getAll("schoolId").map(String);
  const ids = [...new Set(raw.map(Number))];
  if (!ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Select between 1 and 100 valid schools.");
  }
  const active = String(form.get("active"));
  if (active !== "0" && active !== "1") throw new Error("Invalid school status");
  if (form.get("confirmBulk") !== "yes") throw new Error("Confirmation required");
  const placeholders = ids.map(() => "?").join(",");
  await db.execute(
    `UPDATE partner_schools SET is_active = ? WHERE id IN (${placeholders})`,
    [Number(active), ...ids]
  );
  refreshSchools();
  redirect(`/partner-schools?status=${active === "1" ? "active" : "archived"}&notice=${active === "1" ? "bulk_restored" : "bulk_archived"}`);
}


/** Permanently remove archived schools and their known test data. All-or-nothing. */
async function deleteArchivedSchoolIds(ids: number[]) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => "?").join(",");
    const [schools] = await connection.execute<RowDataPacket[]>(
      `SELECT id, is_active FROM partner_schools WHERE id IN (${placeholders}) FOR UPDATE`, ids
    );
    if (schools.length !== ids.length || schools.some(s => Number(s.is_active) !== 0)) {
      throw new Error("All selected schools must exist and be archived. Refresh and try again.");
    }
    // Remove children of referrals before their parent referrals.
    // Only rows linked to referrals belonging to selected schools are affected.
    for (const table of ["admission_conversions", "lead_activities", "school_visits", "tasks"]) {
      await connection.execute(
        `DELETE FROM ${table} WHERE referral_id IN (
           SELECT id FROM referrals WHERE partner_school_id IN (${placeholders})
         )`, ids
      );
    }
    // Referrals reference school_contacts, so delete referrals first.
    await connection.execute(
      `DELETE FROM referrals WHERE partner_school_id IN (${placeholders})`, ids
    );
    for (const table of ["school_contacts", "school_partnerships"]) {
      await connection.execute(
        `DELETE FROM ${table} WHERE partner_school_id IN (${placeholders})`, ids
      );
    }
    // Boarding targets can have child requests. Do not delete those requests
    // implicitly; the FK will block and roll back if such records exist.
    await connection.execute(
      `DELETE FROM boarding_school_targets WHERE existing_partner_school_id IN (${placeholders})`, ids
    );
    const [deleted] = await connection.execute<ResultSetHeader>(
      `DELETE FROM partner_schools WHERE id IN (${placeholders}) AND is_active = 0`, ids
    );
    if (deleted.affectedRows !== ids.length) throw new Error("School deletion count mismatch; rolled back.");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function permanentlyDeleteArchivedSchool(form: FormData) {
  await requireManager();
  const id = schoolId(form);
  if (form.get("confirmDelete") !== "yes") throw new Error("Deletion confirmation required.");
  await deleteArchivedSchoolIds([id]);
  refreshSchools();
  redirect("/partner-schools?status=archived&notice=permanently_deleted");
}

export async function bulkPermanentlyDeleteArchivedSchools(form: FormData) {
  await requireManager();
  const raw = form.getAll("schoolId").map(String);
  const ids = [...new Set(raw.map(Number))];
  if (!ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Select between 1 and 100 valid schools.");
  }
  if (form.get("confirmBulk") !== "yes" || form.get("operation") !== "delete") {
    throw new Error("Deletion confirmation required.");
  }
  await deleteArchivedSchoolIds(ids);
  refreshSchools();
  redirect("/partner-schools?status=archived&notice=bulk_permanently_deleted");
}
