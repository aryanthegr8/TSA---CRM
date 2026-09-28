import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { updateReferral } from "./referral-actions";

type Referral = RowDataPacket & { id: number; partner_school_id: number; name: string; city: string | null; state: string | null; status: string; reason_for_match: string | null; school_response: string | null; sent_at: Date | null; school_contact_id: number | null; due_at: Date | null };
type Contact = RowDataPacket & { id: number; partner_school_id: number; name: string; phone: string | null };
const next: Record<string, string[]> = {
  shortlisted: ["shared_with_parent", "parent_interested", "sent_to_school", "not_proceeding"],
  shared_with_parent: ["parent_interested", "sent_to_school", "not_proceeding"],
  parent_interested: ["sent_to_school", "not_proceeding"],
  sent_to_school: ["school_responded", "application_started", "applied", "not_proceeding"],
  school_responded: ["application_started", "applied", "not_proceeding"],
  application_started: ["applied", "not_proceeding"],
  applied: ["admitted", "not_proceeding"],
};
const label = (value: string) => value.replaceAll("_", " ");
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));

export default async function ReferralsSection({ leadId, active, error, saved }: { leadId: number; active: boolean; error?: string; saved?: string }) {
  const [[referrals], [contacts]] = await Promise.all([
    db.execute<Referral[]>(`SELECT r.id, r.partner_school_id, r.status, r.reason_for_match, r.school_response,
      r.sent_at, r.school_contact_id, ps.name, ps.city, ps.state,
      (SELECT MIN(t.due_at) FROM tasks t WHERE t.referral_id = r.id AND t.completed_at IS NULL) AS due_at
      FROM referrals r JOIN partner_schools ps ON ps.id = r.partner_school_id
      WHERE r.lead_id = ? ORDER BY r.created_at DESC, r.id DESC`, [leadId]),
    db.execute<Contact[]>(`SELECT c.id, c.partner_school_id, c.name, c.phone
      FROM school_contacts c JOIN referrals r ON r.partner_school_id = c.partner_school_id
      WHERE r.lead_id = ? AND c.is_active = 1 ORDER BY c.is_primary DESC, c.name`, [leadId]),
  ]);
  return <section className="mt-7 rounded-xl border border-slate-200 bg-white p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">School referrals</h2><p className="mt-1 text-sm text-slate-600">Each school has its own status and follow-up.</p></div>
      {active && <Link href={`/leads/${leadId}/refer`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Find partner schools</Link>}
    </div>
    {saved && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">School referral updated.</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error === "duplicate" ? "This school is already shortlisted." : error === "due" ? "Set a future follow-up time for this school." : error === "transition" ? "This stage change is no longer available. Refresh and try again." : "Check the note, contact and stage."}</p>}
    {referrals.length === 0 ? <p className="mt-5 text-sm text-slate-600">No schools shortlisted yet.</p> : <div className="mt-5 grid gap-4">{referrals.map((referral) => {
      const choices = next[referral.status] || [];
      const schoolContacts = contacts.filter((contact) => contact.partner_school_id === referral.partner_school_id);
      return <article key={referral.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{referral.name}</h3><p className="text-sm text-slate-600">{[referral.city, referral.state].filter(Boolean).join(", ") || "Location pending"}</p></div>
          <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-medium capitalize text-blue-800">{label(referral.status)}</span></div>
        {referral.reason_for_match && <p className="mt-3 text-sm text-slate-700">Shortlist reason: {referral.reason_for_match}</p>}
        {referral.sent_at && <p className="mt-2 text-sm text-slate-600">Sent to school: {stamp(referral.sent_at)}</p>}
        {referral.due_at && <p className="mt-1 text-sm font-medium text-amber-800">Next school follow-up: {stamp(referral.due_at)}</p>}
        {referral.school_response && <p className="mt-2 text-sm text-slate-700">School response: {referral.school_response}</p>}
        {active && choices.length > 0 && <form action={updateReferral.bind(null, leadId, referral.id)} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Next stage<select name="status" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="" disabled>Choose stage</option>{choices.map((stage) => <option key={stage} value={stage}>{label(stage)}</option>)}</select></label>
          <label className="text-sm font-medium">School contact<select name="contact" defaultValue={referral.school_contact_id || ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">No contact recorded</option>{schoolContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}</select></label>
          <label className="text-sm font-medium">Next school follow-up in India time<input name="followUp" type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium sm:col-span-2">What happened? *<textarea name="note" required maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="For sent to school, record how and to whom the details were transferred." /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">A next school follow-up is required when marking a referral Sent to school, School responded, Application started or Applied.</p>
          <button type="submit" className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:col-span-2">Save referral update</button>
        </form>}
      </article>;
    })}</div>}
  </section>;
}
