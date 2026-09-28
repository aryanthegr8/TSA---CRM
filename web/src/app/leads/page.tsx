import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

interface LeadRow extends RowDataPacket {
  id: number; parent_name: string | null; student_name: string | null;
  primary_phone: string; class_sought: string | null; school_type: string;
  preferred_location: string | null; source: string; status: string;
  received_at: Date; owner_name: string | null; due_at: Date | null;
}
interface CountRow extends RowDataPacket { total: number }
interface OwnerRow extends RowDataPacket { id: number; name: string }
type Filters = { q?: string | string[]; status?: string | string[]; source?: string | string[]; owner?: string | string[]; page?: string | string[] };
const stages = ["new", "attempting_contact", "connected", "qualified", "exploring_options", "application_in_progress", "admitted", "on_hold", "lost"];
const sources = ["website", "meta_form", "whatsapp", "phone", "referral", "walk_in", "other"];
const value = (input: string | string[] | undefined) => typeof input === "string" ? input : "";
const pageSize = 50;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isCounsellor = user.role === "counsellor";
  const raw = await searchParams;
  const q = value(raw.q).trim().slice(0, 100);
  const status = stages.includes(value(raw.status)) ? value(raw.status) : "";
  const source = sources.includes(value(raw.source)) ? value(raw.source) : "";
  const owner = !isCounsellor && (value(raw.owner) === "unassigned" || /^\d+$/.test(value(raw.owner))) ? value(raw.owner) : "";
  const requestedPage = Number(value(raw.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (isCounsellor) { where.push("l.owner_id = ?"); args.push(user.id); }
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(f.parent_name LIKE ? OR f.primary_phone LIKE ? OR l.student_name LIKE ?)");
    args.push(term, term, term);
  }
  if (status) { where.push("l.status = ?"); args.push(status); }
  if (source) { where.push("l.source = ?"); args.push(source); }
  if (owner === "unassigned") where.push("l.owner_id IS NULL");
  else if (owner) { where.push("l.owner_id = ?"); args.push(owner); }
  const condition = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from = `FROM leads l JOIN families f ON f.id = l.family_id LEFT JOIN crm_users u ON u.id = l.owner_id ${condition}`;
  const [[counts], [owners]] = await Promise.all([
    db.execute<CountRow[]>(`SELECT COUNT(*) AS total ${from}`, args),
    isCounsellor ? Promise.resolve([[] as OwnerRow[]]) : db.query<OwnerRow[]>("SELECT id, name FROM crm_users WHERE is_active = 1 ORDER BY name"),
  ]);
  const total = counts[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * pageSize;
  const sql = `SELECT l.id, f.parent_name, f.primary_phone, l.student_name, l.class_sought,
    l.school_type, l.preferred_location, l.source, l.status, l.received_at,
    u.name AS owner_name,
    (SELECT MIN(t.due_at) FROM tasks t WHERE t.lead_id = l.id AND t.completed_at IS NULL) AS due_at
    ${from} ORDER BY l.received_at DESC, l.id DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const [leads] = await db.execute<LeadRow[]>(sql, args);
  const pageLink = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    if (owner) params.set("owner", owner);
    params.set("page", String(target));
    return `/leads?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
            <h1 className="mt-3 text-3xl font-bold">Lead Inbox</h1>
            <p className="mt-1 text-slate-600">{isCounsellor ? "Your assigned enquiries" : "Enquiries across the team"}</p>
          </div>
          <Link href="/leads/new" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">Add lead</Link>
        </div>
        <form method="get" action="/leads" className="mt-7 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium lg:col-span-2">Search parent, student, or phone<input name="q" defaultValue={q} maxLength={100} placeholder="Name or phone number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Stage<select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All stages</option>{stages.map((stage) => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select></label>
          <label className="text-sm font-medium">Source<select name="source" defaultValue={source} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All sources</option>{sources.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          {!isCounsellor && <label className="text-sm font-medium">Owner<select name="owner" defaultValue={owner} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All owners</option><option value="unassigned">Unassigned</option>{owners.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
          <div className="flex items-end gap-3"><button className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">Apply</button><Link href="/leads" className="py-2 text-sm text-blue-700 hover:underline">Clear</Link></div>
        </form>
        <p className="mt-4 text-sm text-slate-600">{total} matching {total === 1 ? "lead" : "leads"} · Page {currentPage} of {pages}</p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {leads.length === 0 ? <p className="p-10 text-center text-slate-600">No enquiries match these filters.</p> :
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-slate-600"><tr>
                <th className="px-5 py-4">Family and student</th><th className="px-5 py-4">Requirement</th>
                <th className="px-5 py-4">Source</th><th className="px-5 py-4">Stage</th>
                <th className="px-5 py-4">Owner</th><th className="px-5 py-4">Next follow-up</th>
              </tr></thead>
              <tbody>{leads.map((lead) => <tr key={lead.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-4"><Link href={`/leads/${lead.id}`} className="font-semibold text-blue-700 hover:underline">{lead.parent_name || "Parent not recorded"}</Link>
                  <div className="text-slate-600">{lead.student_name || "Student not recorded"} · {lead.primary_phone}</div></td>
                <td className="px-5 py-4">{lead.school_type} · {lead.class_sought || "Class pending"}<div className="text-slate-600">{lead.preferred_location || "Location pending"}</div></td>
                <td className="px-5 py-4 capitalize">{lead.source.replaceAll("_", " ")}</td>
                <td className="px-5 py-4 capitalize">{lead.status.replaceAll("_", " ")}</td>
                <td className="px-5 py-4">{lead.owner_name || "Unassigned"}</td>
                <td className="px-5 py-4">{lead.due_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(lead.due_at)) : "Not set"}</td>
              </tr>)}</tbody>
            </table>}
        </div>
        {pages > 1 && <nav aria-label="Lead pages" className="mt-5 flex items-center justify-between text-sm">
          {currentPage > 1 ? <Link href={pageLink(currentPage - 1)} className="text-blue-700 hover:underline">← Previous</Link> : <span />}
          <span className="text-slate-600">Page {currentPage} of {pages}</span>
          {currentPage < pages ? <Link href={pageLink(currentPage + 1)} className="text-blue-700 hover:underline">Next →</Link> : <span />}
        </nav>}
      </div>
    </main>
  );
}
