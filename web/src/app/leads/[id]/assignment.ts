"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canOwnCategory } from "@/lib/departments";

type LeadLock = RowDataPacket & {
  owner_id: number | null;
  enquiry_category: string;
};

type Staff = RowDataPacket & {
  id: number;
  name: string;
  role: string;
  department: "school_partnerships" | "parent_admissions" | null;
};

export async function assignLead(leadId: number, form: FormData) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/dashboard");
  }

  if (!Number.isSafeInteger(leadId) || leadId <= 0) {
    notFound();
  }

  const newOwner = Number(form.get("ownerId"));

  if (!Number.isSafeInteger(newOwner) || newOwner <= 0) {
    redirect(`/leads/${leadId}?assignmentError=invalid`);
  }

  const connection = await db.getConnection();

  let assignmentError = false;
  let leadMissing = false;

  try {
    await connection.beginTransaction();

    // Lock the lead and retrieve its category.
    const [leads] = await connection.execute<LeadLock[]>(
      `SELECT owner_id, enquiry_category
       FROM leads
       WHERE id = ?
       FOR UPDATE`,
      [leadId]
    );

    const lead = leads[0];

    if (!lead) {
      leadMissing = true;
    } else {
      // Retrieve the staff member's department.
      const [staffRows] = await connection.execute<Staff[]>(
        `SELECT id, name, role, department
         FROM crm_users
         WHERE id = ?
           AND is_active = 1
           AND role IN ('counsellor', 'manager', 'admin')
         LIMIT 1`,
        [newOwner]
      );

      const staff = staffRows[0];

      // Validate department before changing ownership.
      if (
        !staff ||
        !canOwnCategory(
          staff.role,
          staff.department,
          lead.enquiry_category
        )
      ) {
        assignmentError = true;
      } else if (lead.owner_id !== newOwner) {
        await connection.execute(
          "UPDATE leads SET owner_id = ? WHERE id = ?",
          [newOwner, leadId]
        );

        await connection.execute(
          `UPDATE tasks
           SET owner_id = ?
           WHERE lead_id = ?
             AND completed_at IS NULL`,
          [newOwner, leadId]
        );

        await connection.execute(
          `INSERT INTO lead_activities
             (lead_id, actor_id, activity_type, note, occurred_at)
           VALUES (?, ?, 'assignment', ?, UTC_TIMESTAMP(3))`,
          [
            leadId,
            user.id,
            `Assigned to ${staff.name}`,
          ]
        );
      }
    }

    if (assignmentError || leadMissing) {
      await connection.rollback();
    } else {
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // Redirect only after releasing the connection.
  if (leadMissing) notFound();

  if (assignmentError) {
    redirect(`/leads/${leadId}?assignmentError=invalid`);
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/leads/boarding-parents");
  revalidatePath("/leads/day-parents");
  revalidatePath("/leads/school-owners");
  revalidatePath("/my-day");
  revalidatePath("/dashboard");

  redirect(`/leads/${leadId}?assigned=1`);
}