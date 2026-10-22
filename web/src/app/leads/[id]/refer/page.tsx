import Link from "next/link";
import {dayParentSchoolSql} from "@/lib/day-parent-schools";
import {getRequestedSchool,visibleRequestedSchools} from "@/lib/requested-school";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import SchoolSelection from "./school-selection";

type Lead = RowDataPacket & { parent_name: string | null; primary_phone: string; student_name: string | null; class_sought: string | null; admission_year: number | null; board_preference: string | null; budget_min_inr: number | null; budget_max_inr: number | null; school_type: string; preferred_location: string | null; status: string; enquiry_category: string };
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
    `SELECT l.school_type, l.preferred_location, l.status, l.enquiry_category, l.student_name, l.class_sought, l.admission_year, l.board_preference, l.budget_min_inr, l.budget_max_inr, f.parent_name, f.primary_phone FROM leads l JOIN families f ON f.id = l.family_id WHERE l.id = ? ${user.role === "counsellor" ? "AND l.owner_id = ?" : ""} LIMIT 1`,
    user.role === "counsellor" ? [id, user.id] : [id]
  );
  const lead = leads[0];
  if (!lead || lead.enquiry_category === "school_owner") notFound();
  if (["admitted", "lost"].includes(lead.status)) redirect(`/leads/${id}`);
  const { q: query, error } = await searchParams;
  const q = (query || "").trim().slice(0, 100);
  const filters = ["ps.is_active = 1"];
  const values: (string | number)[] = [id];
  if (lead.school_type !== "undecided") {
    filters.push("ps.school_type IN (?, 'both')"); values.push(lead.school_type);
  }
  if (lead.enquiry_category === "day_parent") filters.push(dayParentSchoolSql);
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
  const request=await getRequestedSchool(db,id);
  const eligibleSchools=visibleRequestedSchools(schools,request);
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-5xl">
    <Link href={`/leads/${id}`} className="text-sm text-blue-700 hover:underline">← Lead details</Link>
    {lead.enquiry_category === "day_parent" && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Only active day/both schools marked Delhi NCR eligible by a manager are shown.</p>}
    <h1 className="mt-3 text-3xl font-bold">Select suitable partner schools</h1>
    <p className="mt-2 text-slate-600">{lead.school_type === "undecided" ? "All active partners" : `${lead.school_type} schools`} · Preferred location: {lead.preferred_location || "not confirmed"}. Shortlisting stays internal.</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">Check the reason and try again.</p>}
    <form action={`/leads/${id}/refer`} className="mt-6 flex gap-3"><input name="q" defaultValue={q} placeholder="Search school, city, state" maxLength={100} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /><button className="rounded-lg border border-slate-300 px-4 py-2 font-medium">Search</button></form>
    {eligibleSchools.length>0 && <SchoolSelection key={q} leadId={id} schools={eligibleSchools.map(school => ({ id: school.id, name: school.name, school_type: school.school_type, city: school.city, state: school.state, board: school.board, classes_offered: school.classes_offered, referral_id: school.referral_id }))} message={[
      "Admission enquiry — The School Admission", `CRM lead reference: ${id}`,
      `Parent: ${lead.parent_name || "Not recorded"}`, `Phone: ${lead.primary_phone}`,
      `Student: ${lead.student_name || "Not recorded"}`, `Class: ${lead.class_sought || "To confirm"}`,
      `Admission year: ${lead.admission_year || "To confirm"}`, `School type: ${lead.school_type}`,
      `Preferred location: ${lead.preferred_location || "To confirm"}`, `Board: ${lead.board_preference || "To confirm"}`,
      `Annual budget (INR): ${lead.budget_min_inr ?? "To confirm"} – ${lead.budget_max_inr ?? "To confirm"}`,
      "Please contact the parent regarding suitable admission options and share an update with our counsellor.",
    ].join("\n")} />}
    {request?.exclusive_only ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Specific school only: {request.school_name}. Only this school is selectable after its signed MOU is verified and its partner record is active.</p> : null}
    {!eligibleSchools.length && <p className="mt-5 text-slate-600">No matching active schools. Try another search.</p>}

  </div></main>;
}
