"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

interface ExistingSchool extends RowDataPacket { id: number }
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function addPartnerSchool(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "counsellor") redirect("/partner-schools");
  const name = value(form, "name");
  const type = value(form, "type");
  const city = value(form, "city");
  const state = value(form, "state");
  const board = value(form, "board");
  const classes = value(form, "classes");
  const fee = value(form, "fee");
  const notes = value(form, "notes");
  const contactName = value(form, "contactName");
  const contactPhone = value(form, "contactPhone").replace(/[\s()-]/g, "");
  const contactEmail = value(form, "contactEmail");
  if (!name || name.length > 255 || !["day", "boarding", "both"].includes(type) ||
      city.length > 120 || state.length > 120 || board.length > 120 || classes.length > 255 ||
      fee.length > 255 || notes.length > 5000 || contactName.length > 160 ||
      (contactPhone && !/^\+[1-9]\d{7,14}$/.test(contactPhone)) ||
      (contactEmail && (!/^\S+@\S+\.\S+$/.test(contactEmail) || contactEmail.length > 255))) {
    redirect("/partner-schools/new?error=invalid");
  }
  if ((contactPhone || contactEmail) && !contactName) redirect("/partner-schools/new?error=contact");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<ExistingSchool[]>(
      "SELECT id FROM partner_schools WHERE name = ? AND city <=> ? AND state <=> ? LIMIT 1 FOR UPDATE",
      [name, city || null, state || null]
    );
    if (existing.length) {
      await connection.rollback();
      redirect("/partner-schools/new?error=duplicate");
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO partner_schools (name, school_type, city, state, board, classes_offered,
        fee_note, internal_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, city || null, state || null, board || null, classes || null, fee || null, notes || null]
    );
    if (contactName) {
      await connection.execute(
        "INSERT INTO school_contacts (partner_school_id, name, phone, email, is_primary) VALUES (?, ?, ?, ?, 1)",
        [result.insertId, contactName, contactPhone || null, contactEmail || null]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  revalidatePath("/partner-schools");
  redirect("/partner-schools");
}
