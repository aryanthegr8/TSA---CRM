import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createLead } from "./actions";

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const { error } = await searchParams;
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-2xl">
    <Link href="/leads" className="text-sm text-blue-700 hover:underline">← Lead Inbox</Link>
    <h1 className="mt-3 text-3xl font-bold">Add an admission enquiry</h1>
    <p className="mt-2 text-slate-600">This creates a lead assigned to you with its first follow-up. Enter a phone number with country code, such as +91…</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error === "due" ? "Choose a follow-up time in the future." : "Check the required fields, phone number and admission year."}</p>}
    <form action={createLead} className="mt-7 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
      <label className="text-sm font-medium">Parent name <span className="text-red-700">*</span><input name="parent" required maxLength={160} className={input} /></label>
      <label className="text-sm font-medium">Phone with country code <span className="text-red-700">*</span><input name="phone" type="tel" placeholder="+919876543210" required className={input} /></label>
      <label className="text-sm font-medium">Student name<input name="student" maxLength={160} className={input} /></label>
      <label className="text-sm font-medium">Class sought<input name="classSought" placeholder="Class 6" maxLength={40} className={input} /></label>
      <label className="text-sm font-medium">Admission year <span className="text-red-700">*</span><input name="admissionYear" type="number" min="2020" max="2099" defaultValue={new Date().getFullYear()} required className={input} /></label>
      <label className="text-sm font-medium">School type <span className="text-red-700">*</span><select name="schoolType" defaultValue="undecided" className={input}><option value="undecided">Undecided</option><option value="day">Day school</option><option value="boarding">Boarding school</option></select></label>
      <label className="text-sm font-medium">Preferred location<input name="location" placeholder="Dehradun, Delhi…" maxLength={255} className={input} /></label>
      <label className="text-sm font-medium">Source <span className="text-red-700">*</span><select name="source" defaultValue="phone" className={input}><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option><option value="meta_form">Meta form</option><option value="referral">Referral</option><option value="walk_in">Walk-in</option><option value="other">Other</option></select></label>
      <label className="text-sm font-medium">First follow-up in India time <span className="text-red-700">*</span><input name="followUp" type="datetime-local" required className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Initial note<textarea name="note" rows={3} maxLength={2000} className={input} /></label>
      <div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-800">Save lead and follow-up</button></div>
    </form>
  </div></main>;
}
