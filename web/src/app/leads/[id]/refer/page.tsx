import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { shortlistSchool } from "../referral-actions";

type Lead = RowDataPacket & { school_type: string; preferred_location: string | null; status: string };
type School = RowDataPacket & { id: number; name: string; school_type: string; city: string | null; state: string | null; board: string | null; classes_offered: string | null; referral_id: number | null };
export default async function FindSchools({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [leads] = await db.execute<Lead[]>(
    `SELECT school_type, preferred_location, status FROM leads WHERE id = ? ${user.role === "counsellor" ? "AND owner_id = ?" : ""} LIMIT 1`,
    user.role === "counsellor" ? [id, user.id] : [id]
  );
  const lead = leads[0];
  if (!lead) notFound();
  if (["admitted", "lost"].includes(lead.status)) redirect(`/leads/${id}`);
  const { q: query, error } = await searchParams;
  const q = (query || "").trim().slice(0, 100);
  const filters = ["ps.is_active = 1"];
  const values: (string | number)[] = [id];
  if (lead.school_type !== "undecided") {
    filters.push("ps.school_type IN (?, 'both')"); values.push(lead.school_type);
  }
  if (q) {
    filters.push("(ps.name LIKE ? OR ps.city LIKE ? OR ps.state LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const [schools] = await db.execute<School[]>(
    `SELECT ps.id, ps.name, ps.school_type, ps.city, ps.state, ps.board, ps.classes_offered,
       r.id AS referral_id FROM partner_schools ps
       LEFT JOIN referrals r ON r.partner_school_id = ps.id AND r.lead_id = ?
       WHERE ${filters.join(" AND ")} ORDER BY ps.name LIMIT 100`, values
  );
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-5xl">
    <Link href={`/leads/${id}`} className="text-sm text-blue-700 hover:underline">← Lead details</Link>
    <h1 className="mt-3 text-3xl font-bold">Find partner schools</h1>
    <p className="mt-2 text-slate-600">{lead.school_type === "undecided" ? "All active partners" : `${lead.school_type} schools`} · Preferred location: {lead.preferred_location || "not confirmed"}. Shortlisting stays internal.</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">Check the reason and try again.</p>}
    <form action={`/leads/${id}/refer`} className="mt-6 flex gap-3"><input name="q" defaultValue={q} placeholder="Search school, city, state" maxLength={100} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /><button className="rounded-lg border border-slate-300 px-4 py-2 font-medium">Search</button></form>
    <div className="mt-6 grid gap-4">{schools.length ? schools.map((school) => <section key={school.id} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{school.name}</h2><p className="mt-1 text-sm text-slate-600">{[school.city, school.state].filter(Boolean).join(", ") || "Location pending"} · {school.school_type} · {school.board || "Board pending"} · {school.classes_offered || "Classes pending"}</p></div>
      {school.referral_id ? <span className="text-sm font-medium text-green-700">Already shortlisted</span> : null}</div>
      {!school.referral_id && <form action={shortlistSchool.bind(null, id, school.id)} className="mt-4 flex flex-wrap gap-3"><input name="reason" maxLength={1000} placeholder="Reason for match (optional)" className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white">Shortlist school</button></form>}
    </section>) : <p className="rounded-xl bg-white p-8 text-center text-slate-600">No matching active partner schools. Try another search.</p>}</div>
  </div></main>;
}
