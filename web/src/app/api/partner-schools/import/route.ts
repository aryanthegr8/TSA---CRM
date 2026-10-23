import { defaultSchoolWhatsappRecipient } from "@/lib/school-whatsapp";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { parseSchoolWorkbook, schoolKey, type ImportSchool } from "@/lib/school-import";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

type Existing = RowDataPacket & {
  id: number; name: string; city: string | null; state: string | null;
  board: string | null; classes_offered: string | null; fee_note: string | null;
  internal_notes: string | null; school_type: "day" | "boarding" | "both";
};
type Plan = {
  inserts: ImportSchool[];
  fills: { row: ImportSchool; school: Existing; changes: Record<string, string> }[];
  unchanged: number;
  conflicts: { row: number; reason: string }[];
  duplicateRows: number[];
};

const missing = (value: string | null) => value == null || value.trim() === "";
// Conservative normalization: never collapse punctuation or different campuses automatically.
function planImport(rows: ImportSchool[], schools: Existing[]): Plan {
  const byKey = new Map<string, Existing[]>();
  for (const school of schools) {
    const key = schoolKey(school.name, school.city, school.state);
    byKey.set(key, [...(byKey.get(key) ?? []), school]);
  }
  const seen = new Set<string>();
  const plan: Plan = { inserts: [], fills: [], unchanged: 0, conflicts: [], duplicateRows: [] };
  for (const row of rows) {
    const key = schoolKey(row.name, row.city, row.state);
    if (seen.has(key)) { plan.duplicateRows.push(row.row); continue; }
    seen.add(key);
    const matches = byKey.get(key) ?? [];
    if (matches.length > 1) {
      plan.conflicts.push({ row: row.row, reason: "Multiple existing records share this name and location; review duplicates first." });
      continue;
    }
    if (matches.length === 0) {
      // A same-name record in an unknown location is ambiguous, not a safe new campus.
      const ambiguous = schools.some((s) =>
        schoolKey(s.name, null, null) === schoolKey(row.name, null, null) &&
        (missing(s.city) || missing(s.state) || missing(row.city) || missing(row.state))
      );
      if (ambiguous) {
        plan.conflicts.push({ row: row.row, reason: "Same school name with incomplete location; review before inserting." });
      } else plan.inserts.push(row);
      continue;
    }
    const school = matches[0];
    const changes: Record<string, string> = {};
    for (const [column, incoming, current] of [
      ["board", row.board, school.board],
      ["classes_offered", row.classesOffered, school.classes_offered],
      ["fee_note", row.feeNote, school.fee_note],
      ["internal_notes", row.internalNotes, school.internal_notes],
    ] as const) {
      if (incoming && missing(current)) changes[column] = incoming;
    }
    if (Object.keys(changes).length) plan.fills.push({ row, school, changes });
    else plan.unchanged++;
  }
  return plan;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "manager") return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Invalid upload" }, { status: 400 }); }
  const mode = form.get("mode");
  const file = form.get("file");
  if ((mode !== "preview" && mode !== "import") || !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".xlsx") || file.size === 0 || file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Choose an .xlsx file smaller than 2 MB" }, { status: 400 });
  }
  try {
    const parsed = await parseSchoolWorkbook(Buffer.from(await file.arrayBuffer()));
    if (parsed.issues.length) {
      return NextResponse.json({ error: "Fix invalid Excel rows before importing", total: parsed.total,
        invalid: parsed.issues.length, issues: parsed.issues.slice(0, 20) }, { status: 400 });
    }
    if (mode === "preview") {
      const [schools] = await db.execute<Existing[]>(
        "SELECT id,name,city,state,board,classes_offered,fee_note,internal_notes,school_type FROM partner_schools"
      );
      const plan = planImport(parsed.rows, schools);
      return NextResponse.json({ total: parsed.total, ready: plan.inserts.length,
        updates: plan.fills.length, unchanged: plan.unchanged, duplicates: plan.duplicateRows.length,
        conflicts: plan.conflicts.length, conflictRows: plan.conflicts.slice(0, 20),
        sample: plan.inserts.slice(0, 5).map((r) => ({ name: r.name, type: r.schoolType, city: r.city, state: r.state })) });
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize imports against other imports. Database uniqueness constraints are still recommended.
      const [schools] = await connection.execute<Existing[]>(
        "SELECT id,name,city,state,board,classes_offered,fee_note,internal_notes,school_type FROM partner_schools FOR UPDATE"
      );
      const plan = planImport(parsed.rows, schools);
      if (plan.conflicts.length) {
        await connection.rollback();
        return NextResponse.json({ error: "Resolve possible duplicates before importing", conflictRows: plan.conflicts.slice(0, 20) }, { status: 409 });
      }
      let imported = 0;
      for (const row of plan.inserts) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO partner_schools (name,school_type,city,state,board,classes_offered,fee_note,internal_notes,whatsapp_recipient)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [row.name,row.schoolType,row.city,row.state,row.board,row.classesOffered,row.feeNote,row.internalNotes,defaultSchoolWhatsappRecipient(row.name)]
        );
        if (row.contactName) await connection.execute(
          "INSERT INTO school_contacts (partner_school_id,name,phone,email,is_primary) VALUES (?,?,?,?,1)",
          [result.insertId,row.contactName,row.contactPhone,row.contactEmail]
        );
        imported++;
      }
      let updated = 0;
      for (const { school, changes } of plan.fills) {
        const columns = Object.keys(changes);
        if (!columns.length) continue;
        // Columns are fixed by the allowlist in planImport, never supplied by a client.
        await connection.execute(
          `UPDATE partner_schools SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
          [...columns.map((c) => changes[c]), school.id]
        );
        updated++;
      }
      await connection.commit();
      revalidatePath("/partner-schools");
      return NextResponse.json({ imported, updated, unchanged: plan.unchanged,
        skipped: plan.duplicateRows.length });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    const message = error instanceof Error && /worksheet|column|school row|row limit|formula|cell type/i.test(error.message)
      ? error.message : "Could not read or import this spreadsheet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
