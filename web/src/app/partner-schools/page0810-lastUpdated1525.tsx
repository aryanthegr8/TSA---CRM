import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

interface School extends RowDataPacket {
  id: number; name: string; school_type: string; city: string | null;
  state: string | null; board: string | null; classes_offered: string | null;
  is_active: number; referral_count: number;
}

export default async function PartnerSchoolsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const type = ["day", "boarding", "both"].includes(params.type ?? "") ? params.type! : "";
  const status = params.status === "archived" ? "archived" : "active";
  const conditions = ["ps.is_active = ?"];
  const values: (string | number)[] = [status === "active" ? 1 : 0];
  if (q) {
    conditions.push("(ps.name LIKE ? OR ps.city LIKE ? OR ps.state LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) { conditions.push("ps.school_type = ?"); values.push(type); }
  const [schools] = await db.execute<School[]>(
    `SELECT ps.id, ps.name, ps.school_type, ps.city, ps.state, ps.board,
      ps.classes_offered, ps.is_active,
      (SELECT COUNT(*) FROM referrals r WHERE r.partner_school_id = ps.id) AS referral_count
      FROM partner_schools ps WHERE ${conditions.join(" AND ")}
      ORDER BY ps.name, ps.id LIMIT 200`, values
  );
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div>
      <h1 className="text-3xl font-bold">Partner schools</h1>
      <p className="mt-1 text-slate-600">Schools your counsellors work with. Showing up to 200 matches.</p>
    </div>{user.role !== "counsellor" && <div className="flex flex-wrap gap-2">
      <Link href="/partner-schools/import" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-100">Import Excel</Link>
      <Link href="/partner-schools/new" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">Add partner school</Link>
    </div>}</div>
    <form className="mt-7 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" action="/partner-schools">
      <label className="min-w-52 flex-1 text-sm font-medium">Search name or location<input name="q" defaultValue={q} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Type<select name="type" defaultValue={type} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">All types</option><option value="day">Day</option><option value="boarding">Boarding</option><option value="both">Both</option></select></label>
      <label className="text-sm font-medium">Status<select name="status" defaultValue={status} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">Filter</button>
    </form>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      {schools.length === 0 ? <p className="p-10 text-center text-slate-600">No partner schools match these filters.</p> :
        <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr><th className="px-5 py-4">School</th><th className="px-5 py-4">Location</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Board</th><th className="px-5 py-4">Classes</th><th className="px-5 py-4">Referrals</th></tr></thead>
          <tbody>{schools.map((school) => <tr key={school.id} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold">{school.name}</td><td className="px-5 py-4">{[school.city, school.state].filter(Boolean).join(", ") || "Pending"}</td><td className="px-5 py-4 capitalize">{school.school_type}</td><td className="px-5 py-4">{school.board || "Pending"}</td><td className="px-5 py-4">{school.classes_offered || "Pending"}</td><td className="px-5 py-4">{school.referral_count}</td></tr>)}</tbody></table>}
    </div>
  </div></main>;
}
