import "server-only";
import type { RowDataPacket } from "mysql2";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { CrmDepartment } from "@/lib/departments";

export type CrmRole = "admin" | "manager" | "counsellor";

export type CrmUser = {
  id: number;
  name: string;
  email: string;
  role: CrmRole;
  department: CrmDepartment | null;
};

interface UserRow extends RowDataPacket, CrmUser {}

export async function getCurrentUser(): Promise<CrmUser | null> {
  const session = await auth();
  const id = session?.user?.id;

  if (!id || !/^\d+$/.test(id)) {
    return null;
  }

  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, name, email, role, department
     FROM crm_users
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [id]
  );

  return rows[0] ?? null;
}