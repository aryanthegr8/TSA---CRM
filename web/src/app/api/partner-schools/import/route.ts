import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { parseSchoolWorkbook, schoolKey, type ImportSchool } from "@/lib/school-import";

export const runtime = "nodejs";
type Existing = RowDataPacket & { name: string; city: string | null; state: string | null };

async function classify(rows: ImportSchool[]) {
  const unique = new Map<string, ImportSchool>();
  const duplicateInFile: number[] = [];
  for (const row of rows) {
    const key = schoolKey(row.name, row.city, row.state);
    if (unique.has(key)) duplicateInFile.push(row.row);
    else unique.set(key, row);
  }
  const names = [...new Set([...unique.values()].map((row) => row.name))];
  const existing = new Set<string>();
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    const [found] = await db.execute<Existing[]>(
      `SELECT name, city, state FROM partner_schools WHERE name IN (${batch.map(() => "?").join(",")})`, batch
    );
    for (const item of found) existing.add(schoolKey(item.name, item.city, item.state));
  }
  const ready = [...unique.entries()].filter(([key]) => !existing.has(key)).map(([, row]) => row);
  return { ready, duplicateCount: duplicateInFile.length + unique.size - ready.length };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (user.role === "counsellor") return NextResponse.json({ error: "Manager access required" }, { status: 403 });
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
    const { ready, duplicateCount } = await classify(parsed.rows);
    if (mode === "preview") {
      return NextResponse.json({ total: parsed.total, ready: ready.length, duplicates: duplicateCount,
        invalid: parsed.issues.length, issues: parsed.issues.slice(0, 15), sample: ready.slice(0, 5).map((r) => ({ name: r.name, type: r.schoolType, city: r.city, state: r.state })) });
    }
    if (parsed.issues.length) return NextResponse.json({ error: "Fix the invalid rows shown in preview before importing" }, { status: 400 });
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      let imported = 0;
      let skipped = duplicateCount;
      for (const row of ready) {
        const [found] = await connection.execute<RowDataPacket[]>(
          "SELECT id FROM partner_schools WHERE name = ? AND city <=> ? AND state <=> ? LIMIT 1 FOR UPDATE",
          [row.name, row.city, row.state]
        );
        if (found.length) { skipped++; continue; }
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO partner_schools (name, school_type, city, state, board, classes_offered, fee_note, internal_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.name, row.schoolType, row.city, row.state, row.board, row.classesOffered, row.feeNote, row.internalNotes]
        );
        if (row.contactName) {
          await connection.execute(
            "INSERT INTO school_contacts (partner_school_id, name, phone, email, is_primary) VALUES (?, ?, ?, ?, 1)",
            [result.insertId, row.contactName, row.contactPhone, row.contactEmail]
          );
        }
        imported++;
      }
      await connection.commit();
      return NextResponse.json({ imported, skipped });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    // Do not send SQL details or uploaded cell values to the browser.
    const message = error instanceof Error && /worksheet|column|school row|row limit|formula|cell type/i.test(error.message)
      ? error.message : "Could not read or import this spreadsheet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
