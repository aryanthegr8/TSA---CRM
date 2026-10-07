import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Staff = RowDataPacket & { id: number };
type Existing = RowDataPacket & { id: number };
type Field = { name?: unknown; values?: unknown };
type MetaLead = { id?: unknown; field_data?: unknown; form_id?: unknown; ad_id?: unknown };
type Change = { field?: unknown; value?: { leadgen_id?: unknown; form_id?: unknown; ad_id?: unknown } };

function matches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readPayload(request: Request): Promise<Buffer | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) return null;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export async function GET(request: Request) {
  const token = process.env.META_VERIFY_TOKEN;
  if (!token) return new Response("Not configured", { status: 503 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const supplied = url.searchParams.get("hub.verify_token") ?? "";
  if (mode !== "subscribe" || !challenge || !matches(supplied, token)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
}

function firstAnswer(fields: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const answer = fields.get(name);
    if (answer) return answer;
  }
  return "";
}

function phoneNumber(input: string): string | null {
  const raw = input.replace(/[\s()-]/g, "");
  const normalized = /^\d{10}$/.test(raw) ? `+91${raw}` : /^0\d{10}$/.test(raw) ? `+91${raw.slice(1)}` : raw;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

async function saveLead(leadId: string, pageToken: string, version: string): Promise<void> {
  const [existing] = await db.execute<Existing[]>(
    "SELECT id FROM leads WHERE source = 'meta_form' AND external_source_id = ? LIMIT 1", [leadId]
  );
  if (existing.length) return;

  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(leadId)}?fields=id,field_data,form_id,ad_id`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${pageToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Meta lead retrieval failed: ${response.status}`);
  const data = await response.json() as MetaLead;
  if (String(data.id) !== leadId || !Array.isArray(data.field_data)) throw new Error("Invalid Meta lead response");

  const fields = new Map<string, string>();
  for (const field of data.field_data as Field[]) {
    if (typeof field?.name !== "string" || !Array.isArray(field.values)) continue;
    const answer = field.values.find((v): v is string => typeof v === "string" && !!v.trim());
    if (answer) fields.set(field.name.toLowerCase(), answer.trim());
  }
  const phone = phoneNumber(firstAnswer(fields, "phone_number", "phone", "mobile_number"));
  if (!phone) throw new Error(`Meta lead ${leadId} has no valid phone number`);
  const parent = firstAnswer(fields, "full_name", "parent_name", "parent's_name") ||
    [firstAnswer(fields, "first_name"), firstAnswer(fields, "last_name")].filter(Boolean).join(" ") || "Parent name pending";
  const student = firstAnswer(fields, "student_name", "child_name").slice(0, 160);
  const classSought = firstAnswer(fields, "class", "grade", "student_class").slice(0, 40);
  const location = firstAnswer(fields, "preferred_location", "city").slice(0, 255);
  const email = firstAnswer(fields, "email").slice(0, 255);
  const notes = [...fields.entries()].map(([name, answer]) => `${name}: ${answer}`).join(" | ").slice(0, 2000);
  const preferredEmail = process.env.CRM_INTAKE_OWNER_EMAIL?.trim().toLowerCase();
  const [staff] = preferredEmail
    ? await db.execute<Staff[]>("SELECT id FROM crm_users WHERE email = ? AND is_active = 1 LIMIT 1", [preferredEmail])
    : await db.query<Staff[]>("SELECT id FROM crm_users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1");
  if (!staff[0]) throw new Error("No active intake owner configured");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [family] = await connection.execute<ResultSetHeader>(
      "INSERT INTO families (parent_name, primary_phone, email) VALUES (?, ?, ?)",
      [parent.slice(0, 160), phone, email || null]
    );
    const [lead] = await connection.execute<ResultSetHeader>(
      `INSERT INTO leads (family_id, student_name, class_sought, school_type, preferred_location,
       source, source_detail, campaign_data, external_source_id, owner_id, received_at)
       VALUES (?, ?, ?, 'undecided', ?, 'meta_form', ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [family.insertId, student || null, classSought || null, location || null,
        typeof data.form_id === "string" && data.form_id.length <= 250 ? `Form ${data.form_id}` : "Meta Lead Ads",
        JSON.stringify({ formId: data.form_id ?? null, adId: data.ad_id ?? null }), leadId, staff[0].id]
    );
    await connection.execute(
      "INSERT INTO tasks (lead_id, owner_id, title, task_type, due_at) VALUES (?, ?, 'Contact Meta enquiry', 'call_parent', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 HOUR))",
      [lead.insertId, staff[0].id]
    );
    await connection.execute(
      "INSERT INTO lead_activities (lead_id, activity_type, note, occurred_at) VALUES (?, 'system', ?, UTC_TIMESTAMP(3))",
      [lead.insertId, notes || "Meta lead form submitted"]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      const [found] = await db.execute<Existing[]>(
        "SELECT id FROM leads WHERE source = 'meta_form' AND external_source_id = ? LIMIT 1", [leadId]
      );
      if (found.length) return;
    }
    throw error;
  } finally { connection.release(); }
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!appSecret || !pageToken || !version || !/^v\d+\.\d+$/.test(version)) {
    return NextResponse.json({ error: "Meta integration not configured" }, { status: 503 });
  }
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const raw = await readPayload(request);
  if (!raw) return new Response("Payload too large", { status: 413 });
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (!matches(signature, expected)) return new Response("Unauthorized", { status: 401 });

  let payload: { object?: unknown; entry?: { changes?: Change[] }[] };
  try { payload = JSON.parse(raw.toString("utf8")); }
  catch { return new Response("Invalid payload", { status: 400 }); }
  if (payload.object !== "page" || !Array.isArray(payload.entry)) return new Response("Invalid event", { status: 400 });

  try {
    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const id = change.value?.leadgen_id;
        if (typeof id !== "string" || !/^\d+$/.test(id)) continue;
        await saveLead(id, pageToken, version);
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Meta lead intake failed", error);
    return NextResponse.json({ error: "Lead import failed" }, { status: 500 });
  }
}
