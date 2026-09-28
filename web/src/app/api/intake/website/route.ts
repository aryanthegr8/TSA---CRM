import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Staff = RowDataPacket & { id: number };
type Existing = RowDataPacket & { id: number };

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ") || !secret) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) throw new Error("body too large");
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return JSON.parse(result);
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  const secret = process.env.CRM_INTAKE_API_KEY ?? "";
  if (secret.length < 32) return NextResponse.json({ error: "Intake is not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  let data: Record<string, unknown>;
  try {
    const parsed = await readJson(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    data = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON or payload too large" }, { status: 400 }); }
  const field = (name: string) => typeof data[name] === "string" ? (data[name] as string).trim() : "";
  const externalId = field("submissionId");
  const parent = field("parentName");
  const phone = field("phone").replace(/[\s()-]/g, "");
  const student = field("studentName");
  const schoolType = field("schoolType") || "undecided";
  const year = data.admissionYear;
  const location = field("preferredLocation");
  const classSought = field("classSought");
  const pageUrl = field("pageUrl");
  const note = field("note");
  if (!externalId || externalId.length > 255 || !parent || parent.length > 160 ||
      !/^\+[1-9]\d{7,14}$/.test(phone) || student.length > 160 ||
      !["day", "boarding", "undecided"].includes(schoolType) ||
      (year !== undefined && (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2099)) ||
      location.length > 255 || classSought.length > 40 || note.length > 2000 || pageUrl.length > 1024 ||
      (pageUrl !== "" && !/^https?:\/\//i.test(pageUrl))) {
    return NextResponse.json({ error: "Check submissionId, parentName, phone and optional fields" }, { status: 400 });
  }
  // The website must send the same stable submissionId when retrying a form submission.
  const [previous] = await db.execute<Existing[]>("SELECT id FROM leads WHERE source = 'website' AND external_source_id = ? LIMIT 1", [externalId]);
  if (previous[0]) return NextResponse.json({ id: previous[0].id, duplicate: true }, { status: 200 });
  const preferredEmail = process.env.CRM_INTAKE_OWNER_EMAIL?.trim().toLowerCase();
  const [staff] = preferredEmail
    ? await db.execute<Staff[]>("SELECT id FROM crm_users WHERE email = ? AND is_active = 1 LIMIT 1", [preferredEmail])
    : await db.query<Staff[]>("SELECT id FROM crm_users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1");
  if (!staff[0]) return NextResponse.json({ error: "No active intake owner configured" }, { status: 503 });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [family] = await connection.execute<ResultSetHeader>(
      "INSERT INTO families (parent_name, primary_phone) VALUES (?, ?)", [parent, phone]
    );
    const [lead] = await connection.execute<ResultSetHeader>(
      `INSERT INTO leads (family_id, student_name, class_sought, admission_year, school_type,
       preferred_location, source, source_page_url, external_source_id, owner_id, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'website', ?, ?, ?, UTC_TIMESTAMP(3))`,
      [family.insertId, student || null, classSought || null, typeof year === "number" ? year : null, schoolType,
        location || null, pageUrl || null, externalId, staff[0].id]
    );
    await connection.execute(
      "INSERT INTO tasks (lead_id, owner_id, title, task_type, due_at) VALUES (?, ?, 'Contact website enquiry', 'call_parent', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 HOUR))",
      [lead.insertId, staff[0].id]
    );
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, activity_type, note, occurred_at) VALUES (?, 'system', ?, UTC_TIMESTAMP(3))",
      [lead.insertId, note || "Website enquiry received"]
    );
    await connection.commit();
    return NextResponse.json({ id: lead.insertId, duplicate: false }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      const [existing] = await db.execute<Existing[]>("SELECT id FROM leads WHERE source = 'website' AND external_source_id = ? LIMIT 1", [externalId]);
      if (existing[0]) return NextResponse.json({ id: existing[0].id, duplicate: true }, { status: 200 });
    }
    throw error;
  } finally { connection.release(); }
}
