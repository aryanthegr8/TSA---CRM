import Link from "next/link";
import ReferralUpdateForm from "./referral-update-form";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";


type Referral = RowDataPacket & { id: number; partner_school_id: number; name: string; city: string | null; state: string | null; status: string; parent_selected: number; reason_for_match: string | null; school_response: string | null; closed_reason: string | null; sent_at: Date | null; school_contact_id: number | null; due_at: Date | null; sent_by_name: string | null; transfer_channel: string | null; transfer_recipient: string | null; visit_scheduled_at: Date | null; visited_at: Date | null };
type Contact = RowDataPacket & { id: number; partner_school_id: number; name: string; phone: string | null };
import { referralTransitions as next, referralLabel as label } from "@/lib/referral-workflow";
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));

export default async function ReferralsSection({ leadId, active, error, saved }: { leadId: number; active: boolean; error?: string; saved?: string }) {
  const [[referrals], [contacts]] = await Promise.all([
    db.execute<Referral[]>(`SELECT r.id, r.partner_school_id, r.status, r.reason_for_match, r.school_response, r.closed_reason,
      (SELECT COUNT(*) FROM lead_activities a WHERE a.referral_id = r.id AND a.outcome = 'parent_selected') AS parent_selected, r.sent_at, r.school_contact_id, r.transfer_channel, r.transfer_recipient, r.visit_scheduled_at, r.visited_at, sender.name AS sent_by_name, ps.name, ps.city, ps.state,
      (SELECT MIN(t.due_at) FROM tasks t WHERE t.referral_id = r.id AND t.completed_at IS NULL) AS due_at
      FROM referrals r JOIN partner_schools ps ON ps.id = r.partner_school_id LEFT JOIN crm_users sender ON sender.id = r.sent_by_user_id
      WHERE r.lead_id = ? ORDER BY r.created_at DESC, r.id DESC`, [leadId]),
    db.execute<Contact[]>(`SELECT c.id, c.partner_school_id, c.name, c.phone
      FROM school_contacts c JOIN referrals r ON r.partner_school_id = c.partner_school_id
      WHERE r.lead_id = ? AND c.is_active = 1 ORDER BY c.is_primary DESC, c.name`, [leadId]),
  ]);
  return <section id="referrals" className="mt-7 scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">School referrals</h2><p className="mt-1 text-sm text-slate-600">Track each school separately. Open a row to record sharing, visits or admission.</p></div>
      {active && <Link href={`/leads/${leadId}/refer`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Add schools</Link>}
      {active && <Link href={`/leads/${leadId}/refer`} className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700">Prepare WhatsApp message</Link>}
    </div>
    {saved && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">School referral updated.</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error === "transfer" ? "For a school transfer, choose a channel and enter the recipient." : error === "visit" ? "Set a future school visit date and time." : error === "duplicate" ? "This school is already shortlisted." : error === "due" ? "Set a future follow-up time for this school." : error === "transition" ? "This stage change is no longer available. Refresh and try again." : "Check the note, contact and stage."}</p>}
    {referrals.filter(ref => (ref.parent_selected > 0 || ref.status === "admitted") && ref.status !== "not_proceeding").map(ref => <div key={ref.id} className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-semibold uppercase text-green-700">{ref.status === "admitted" ? "Admission confirmed" : "Chosen school"}</p><p className="mt-1 font-semibold">{ref.name}</p><p className="mt-1 text-sm text-green-800">{label(ref.status)}{ref.due_at ? ` · Next follow-up ${stamp(ref.due_at)}` : ""}</p></div>)}
    {referrals.some(ref => ref.status === "not_proceeding") && <details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium text-slate-500">Previous options ({referrals.filter(ref => ref.status === "not_proceeding").length})</summary><ul className="mt-3 space-y-2">{referrals.filter(ref => ref.status === "not_proceeding").map(ref => <li key={ref.id} className="text-sm"><strong>{ref.name}</strong><span className="ml-2 text-slate-500">{ref.closed_reason || "Not proceeding"}</span></li>)}</ul></details>}
    {referrals.length === 0 ? <p className="mt-5 text-sm text-slate-600">No schools shortlisted yet.</p> : <div className="mt-5 grid gap-4">{referrals.filter(ref => ref.status !== "not_proceeding").map((referral) => {
      const choices = next[referral.status] || [];
      const schoolContacts = contacts.filter((contact) => contact.partner_school_id === referral.partner_school_id);
      return <details key={referral.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><div><span className="font-semibold">{referral.name}</span><span className="mt-1 block text-xs text-slate-500">{label(referral.status)} · {referral.due_at ? `Follow-up: ${stamp(referral.due_at)}` : "No follow-up scheduled"}</span></div><span className="text-sm font-semibold text-blue-700">{active && choices.length ? "Update" : "View"} ↓</span></summary>
        <div className="mt-4 border-t pt-4">
        <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{referral.name}</h3><p className="text-sm text-slate-600">{[referral.city, referral.state].filter(Boolean).join(", ") || "Location pending"}</p></div>
          <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-medium capitalize text-blue-800">{label(referral.status)}</span></div>
        {referral.reason_for_match && <p className="mt-3 text-sm text-slate-700">Shortlist reason: {referral.reason_for_match}</p>}
        {referral.sent_at && <p className="mt-2 text-sm text-slate-600">Sent to school: {stamp(referral.sent_at)}</p>}
        {referral.sent_at && <p className="mt-1 text-sm text-slate-600">Shared by: {referral.sent_by_name || "Not recorded"} · {referral.transfer_channel || "Channel not recorded"} · Recipient: {referral.transfer_recipient || "Not recorded"}</p>}
        {referral.visit_scheduled_at && <p className="mt-2 text-sm text-slate-600">School visit scheduled: {stamp(referral.visit_scheduled_at)}</p>}
        {referral.visited_at && <p className="mt-1 text-sm text-green-800">School visit recorded: {stamp(referral.visited_at)}</p>}
        {referral.due_at && <p className="mt-1 text-sm font-medium text-amber-800">Next school follow-up: {stamp(referral.due_at)}</p>}
        {referral.school_response && <p className="mt-2 text-sm text-slate-700">School response: {referral.school_response}</p>}
        {active && choices.length > 0 && <ReferralUpdateForm leadId={leadId} referralId={referral.id} choices={choices} contacts={schoolContacts.map(({ id, name, phone }) => ({ id, name, phone }))} contactId={referral.school_contact_id} />}

        </div>
      </details>;
    })}</div>}
  </section>;
}
