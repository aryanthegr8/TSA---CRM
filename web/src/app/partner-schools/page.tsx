import Link from "next/link";
import NcrBulkForm from "./ncr-bulk-form";
import SchoolActions from "./school-actions";
import BulkSchoolForm from "./bulk-school-form";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

interface School extends RowDataPacket {
  day_parent_delhi_ncr:number; id: number; name: string; school_type: string; city: string | null;
  state: string | null; board: string | null; classes_offered: string | null;
  agreement_lead_id: number | null; is_active: number; referral_count: number;
}

export default async function PartnerSchoolsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; notice?: string; ncr?: string; tab?: string; page?: string; perPage?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const canManage = user.role === "admin" || user.role === "manager";
  const notices: Record<string, string> = { saved: "School updated.", archived: "School moved to Archived. Existing referral history is preserved.", restored: "School restored to active schools.", missing: "School no longer exists.", bulk_archived: "Selected schools archived. Referral history is preserved.", bulk_restored: "Selected schools restored.", permanently_deleted: "Archived school and its related test records permanently deleted.", bulk_permanently_deleted: "Selected archived schools and their related test records permanently deleted." };
  const q = (params.q ?? "").trim().slice(0, 100);
  const type = ["day", "boarding", "both"].includes(params.type ?? "") ? params.type! : "";
  const tab = ["boarding", "day"].includes(params.tab ?? "") ? params.tab! : "all";
  const ncr=["yes","no"].includes(params.ncr??"")?params.ncr!:"";
  const status = params.status === "archived" ? "archived" : "active";
  const conditions = ["ps.is_active = ?"];
  const values: (string | number)[] = [status === "active" ? 1 : 0];
  if (q) {
    conditions.push("(ps.name LIKE ? OR ps.city LIKE ? OR ps.state LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if(ncr){conditions.push("ps.day_parent_delhi_ncr=?");values.push(ncr==="yes"?1:0);}
  if (tab === "boarding") conditions.push("ps.school_type IN ('boarding', 'both')");
  if (tab === "day") conditions.push("ps.school_type IN ('day', 'both')");
  if (type) { conditions.push("ps.school_type = ?"); values.push(type); }
  const perPage = [25, 50, 100].includes(Number(params.perPage)) ? Number(params.perPage) : 25;
  const [[count]] = await db.execute<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM partner_schools ps WHERE ${conditions.join(" AND ")}`, values
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const requestedPage = Number(params.page);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const offset = (currentPage - 1) * perPage;
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (tab !== "all") query.set("tab", tab);
    if (type) query.set("type", type);
    if (ncr) query.set("ncr", ncr);
    if (status === "archived") query.set("status", status);
    query.set("perPage", String(perPage));
    query.set("page", String(page));
    return `/partner-schools?${query.toString()}`;
  };
  const [schools] = await db.execute<School[]>(
    `SELECT ps.id, ps.name, ps.school_type, ps.city, ps.state, ps.board,
      ps.classes_offered, ps.is_active, ps.day_parent_delhi_ncr,
      (SELECT sp.lead_id FROM school_partnerships sp WHERE sp.partner_school_id=ps.id AND sp.stage='confirmed' LIMIT 1) AS agreement_lead_id,
      (SELECT COUNT(*) FROM referrals r WHERE r.partner_school_id = ps.id) AS referral_count
      FROM partner_schools ps WHERE ${conditions.join(" AND ")}
      ORDER BY ps.name, ps.id LIMIT ${perPage} OFFSET ${offset}`, values
  );
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div>
      <h1 className="text-3xl font-bold">Partner schools</h1>
      <p className="mt-1 text-slate-600">Schools your counsellors work with. {total} matching schools · Page {currentPage} of {pages}.</p>
    </div>{canManage && <div className="flex flex-wrap gap-2">
      <Link href="/partner-schools/import" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-100">Import Excel</Link>
      <Link href="/partner-schools/new" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">Add partner school</Link>
    </div>}</div>
    <nav aria-label="School categories" className="mt-7 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {([
        { id: "all", label: "All Schools" },
        { id: "boarding", label: "Boarding Schools" },
        { id: "day", label: "Day Schools" },
      ] as const).map((item) => {
        const query = new URLSearchParams();
        if (item.id !== "all") query.set("tab", item.id);
        if (q) query.set("q", q);
        if (ncr) query.set("ncr", ncr);
        if (status === "archived") query.set("status", status);
        if (type) query.set("type", type);
        query.set("perPage", String(perPage));
        return <Link key={item.id} href={`/partner-schools?${query.toString()}`}
          aria-current={tab === item.id ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === item.id ? "bg-blue-700 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"}`}>
          {item.label}
        </Link>;
      })}
    </nav>
    {params.notice && notices[params.notice] && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-3 text-blue-800">{notices[params.notice]}</p>}
    <form className="mt-7 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" action="/partner-schools">
      {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      <label className="min-w-52 flex-1 text-sm font-medium">Search name or location<input name="q" defaultValue={q} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Type<select name="type" defaultValue={type} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">All types</option><option value="day">Day</option><option value="boarding">Boarding</option><option value="both">Both</option></select></label>
      <label className="text-sm font-medium">Status<select name="status" defaultValue={status} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <label className="text-sm font-medium">Day-parent eligibility<select name="ncr" defaultValue={ncr} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">All schools</option><option value="yes">Delhi NCR eligible</option><option value="no">Not approved</option></select></label>
      <label className="text-sm font-medium">Per page<select name="perPage" defaultValue={String(perPage)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
       <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">Filter</button>
    </form>
    {canManage&&<BulkSchoolForm active={status === "active"} />}
    {canManage&&status === "active"&&<NcrBulkForm/>}
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      {schools.length === 0 ? <p className="p-10 text-center text-slate-600">No partner schools match these filters.</p> :
        <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{canManage && <><th className="px-3 py-4">Select school</th><th className="px-3 py-4">NCR</th></>}<th className="px-5 py-4">School</th><th className="px-5 py-4">Location</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Board</th><th className="px-5 py-4">Classes</th><th className="px-5 py-4">Referrals</th>{canManage && <th className="px-5 py-4">Actions</th>}</tr></thead>
          <tbody>{schools.map((school) => <tr key={school.id} className="border-t border-slate-100">{canManage&&<><td className="px-3 py-4"><input type="checkbox" form="bulk-school-form" name="schoolId" value={school.id} aria-label={`Select ${school.name} for bulk school action`}/></td><td className="px-3 py-4">{["day","both"].includes(school.school_type)&&<input type="checkbox" form="ncr-school-form" name="schoolId" value={school.id} aria-label={`Select ${school.name} for Delhi NCR review`}/>}</td></>}<td className="px-5 py-4 font-semibold">{school.name}{school.day_parent_delhi_ncr>0&&<span className="mt-1 block text-xs font-medium text-blue-700">Delhi NCR day-parent eligible</span>}</td><td className="px-5 py-4">{[school.city, school.state].filter(Boolean).join(", ") || "Pending"}</td><td className="px-5 py-4 capitalize">{school.school_type}</td><td className="px-5 py-4">{school.board || "Pending"}</td><td className="px-5 py-4">{school.classes_offered || "Pending"}</td><td className="px-5 py-4">{school.referral_count}</td>{canManage && <td className="px-5 py-4"><>{school.agreement_lead_id&&<Link href={`/leads/${school.agreement_lead_id}?tab=commercial`} className="mb-2 block text-xs font-medium text-blue-700 hover:underline">Commission &amp; MOU</Link>}<SchoolActions id={school.id} name={school.name} active={Boolean(school.is_active)} /></></td>}</tr>)}</tbody></table>}
    </div>
    <nav aria-label="Partner school pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
      <span>Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + perPage, total)} of {total}</span>
      <div className="flex items-center gap-3">
        {currentPage > 1 ? <Link href={pageLink(currentPage - 1)} className="rounded-lg border bg-white px-3 py-2">Previous</Link> : <span className="text-slate-400">Previous</span>}
        <span>Page {currentPage} / {pages}</span>
        {currentPage < pages ? <Link href={pageLink(currentPage + 1)} className="rounded-lg border bg-white px-3 py-2">Next</Link> : <span className="text-slate-400">Next</span>}
      </div>
    </nav>
  </div></main>;
}
