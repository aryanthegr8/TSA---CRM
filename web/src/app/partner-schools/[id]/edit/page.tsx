import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { editPartnerSchool } from "../../actions";

interface School extends RowDataPacket {
  id: number; name: string; school_type: string; city: string | null; state: string | null;
  board: string | null; classes_offered: string | null; fee_note: string | null; internal_notes: string | null;
}
export default async function EditSchool({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "manager") redirect("/partner-schools");
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [rows] = await db.execute<School[]>(
    "SELECT id, name, school_type, city, state, board, classes_offered, fee_note, internal_notes FROM partner_schools WHERE id = ?", [id]
  );
  if (!rows.length) notFound();
  const school = rows[0];
  const { error } = await searchParams;
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5";
  const fields = [
    ["name", "School name", school.name, 255], ["city", "City", school.city, 120],
    ["state", "State", school.state, 120], ["board", "Board", school.board, 120],
    ["classes", "Classes offered", school.classes_offered, 255], ["fee", "Fee note", school.fee_note, 255],
  ] as const;
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-2xl">
    <Link href="/partner-schools" className="text-sm text-blue-700 hover:underline">← Partner schools</Link>
    <h1 className="mt-3 text-3xl font-bold">Edit partner school</h1>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error === "duplicate" ? "A school with this name and location already exists." : "Check the required fields and field lengths."}</p>}
    <form action={editPartnerSchool} className="mt-7 grid gap-5 rounded-xl border bg-white p-6 sm:grid-cols-2">
      <input type="hidden" name="id" value={school.id} />
      {fields.map(([key, label, value, max]) => <label key={key} className="text-sm font-medium">{label}{key === "name" ? " *" : ""}<input name={key} defaultValue={value ?? ""} required={key === "name"} maxLength={max} className={input} /></label>)}
      <label className="text-sm font-medium">School type *<select name="type" defaultValue={school.school_type} required className={input}><option value="day">Day school</option><option value="boarding">Boarding school</option><option value="both">Both</option></select></label>
      <label className="text-sm font-medium sm:col-span-2">Internal notes<textarea name="notes" defaultValue={school.internal_notes ?? ""} rows={4} maxLength={5000} className={input} /></label>
      <button className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 sm:col-span-2">Save changes</button>
    </form>
  </div></main>;
}
