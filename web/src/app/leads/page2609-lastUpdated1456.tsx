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

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isCounsellor = user.role === "counsellor";
  const sql = `SELECT l.id, f.parent_name, f.primary_phone, l.student_name, l.class_sought,
    l.school_type, l.preferred_location, l.source, l.status, l.received_at,
    u.name AS owner_name,
    (SELECT MIN(t.due_at) FROM tasks t WHERE t.lead_id = l.id AND t.completed_at IS NULL) AS due_at
    FROM leads l JOIN families f ON f.id = l.family_id
    LEFT JOIN crm_users u ON u.id = l.owner_id
    ${isCounsellor ? "WHERE l.owner_id = ?" : ""}
    ORDER BY l.received_at DESC, l.id DESC LIMIT 100`;
  const [leads] = isCounsellor
    ? await db.execute<LeadRow[]>(sql, [user.id])
    : await db.query<LeadRow[]>(sql);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
            <h1 className="mt-3 text-3xl font-bold">Lead Inbox</h1>
            <p className="mt-1 text-slate-600">{isCounsellor ? "Your assigned enquiries" : "Latest 100 enquiries across the team"}</p>
          </div>
          <Link href="/leads/new" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">Add lead</Link>
        </div>
        <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {leads.length === 0 ? <p className="p-10 text-center text-slate-600">No leads yet. Add the first enquiry to start tracking follow-ups.</p> :
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
      </div>
    </main>
  );
}
