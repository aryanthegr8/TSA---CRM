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
