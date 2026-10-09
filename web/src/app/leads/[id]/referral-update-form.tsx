"use client";
import { useState } from "react";
import { updateReferral } from "./referral-actions";
import { referralLabel as label } from "@/lib/referral-workflow";
export default function ReferralUpdateForm({ leadId, referralId, choices, contacts, contactId }: {
 leadId: number; referralId: number; choices: string[]; contacts: { id: number; name: string; phone: string | null }[]; contactId: number | null;
}) {
 const [stage, setStage] = useState("");
 const needsFollowUp = ["sent_to_school", "school_responded", "visit_scheduled", "school_visited", "application_started", "applied"].includes(stage);
 return (<form action={updateReferral.bind(null, leadId, referralId)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Next stage<select name="status" required value={stage} onChange={event => setStage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="" disabled>Choose stage</option>{choices.map((stage) => <option key={stage} value={stage}>{label(stage)}</option>)}</select></label>
          <label className="text-sm font-medium">School contact<select name="contact" defaultValue={contactId || ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">No contact recorded</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}</select></label>
          {stage === "sent_to_school" && <>          <label className="text-sm font-medium">Transfer channel (when sent to school)<select name="channel" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Select channel</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="phone">Phone</option><option value="other">Other</option></select></label>
          <label className="text-sm font-medium">School group / recipient (when sent to school)<input name="recipient" required maxLength={255} placeholder="WhatsApp group name / school contact" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
</>}
          {stage === "visit_scheduled" && <label className="text-sm font-medium">Visit date in India time (when scheduling)<input name="visitAt" required type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
          {needsFollowUp && <label className="text-sm font-medium">Next school follow-up in India time<input name="followUp" type="datetime-local" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
          <label className="text-sm font-medium sm:col-span-2">What happened? *<textarea name="note" required maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="For sent to school, record how and to whom the details were transferred." /></label>
          <button type="submit" className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:col-span-2">Save referral update</button>
        </form>);
}
