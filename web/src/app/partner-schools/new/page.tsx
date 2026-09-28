import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { addPartnerSchool } from "./actions";

export default async function NewPartnerSchool({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "counsellor") redirect("/partner-schools");
  const { error } = await searchParams;
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-2xl">
    <Link href="/partner-schools" className="text-sm text-blue-700 hover:underline">← Partner schools</Link>
    <h1 className="mt-3 text-3xl font-bold">Add partner school</h1>
    <p className="mt-2 text-slate-600">Add the school your counsellors can work with. You can leave unconfirmed details blank.</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error === "duplicate" ? "This school and location already exist in the catalogue." : error === "contact" ? "Enter a contact name if you add contact details." : "Check the required fields and contact details."}</p>}
    <form action={addPartnerSchool} className="mt-7 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">School name *<input name="name" required maxLength={255} className={input} /></label>
      <label className="text-sm font-medium">School type *<select name="type" required className={input}><option value="day">Day school</option><option value="boarding">Boarding school</option><option value="both">Both</option></select></label>
      <label className="text-sm font-medium">City<input name="city" maxLength={120} className={input} /></label>
      <label className="text-sm font-medium">State<input name="state" maxLength={120} className={input} /></label>
      <label className="text-sm font-medium">Board<input name="board" maxLength={120} className={input} /></label>
      <label className="text-sm font-medium">Classes offered<input name="classes" maxLength={255} placeholder="Nursery to Class 12" className={input} /></label>
      <label className="text-sm font-medium">Fee note<input name="fee" maxLength={255} placeholder="Add verified information only" className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Internal notes<textarea name="notes" maxLength={5000} rows={3} className={input} /></label>
      <div className="border-t border-slate-200 pt-5 font-semibold sm:col-span-2">Primary school contact</div>
      <label className="text-sm font-medium">Contact name<input name="contactName" maxLength={160} className={input} /></label>
      <label className="text-sm font-medium">Contact phone with country code<input name="contactPhone" type="tel" placeholder="+919876543210" className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Contact email<input name="contactEmail" type="email" maxLength={255} className={input} /></label>
      <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 sm:col-span-2">Save partner school</button>
    </form>
  </div></main>;
}
