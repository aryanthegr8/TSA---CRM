"use client";

import { useActionState, useState } from "react";
import { shortlistSchools } from "../referral-actions";

type School = { id: number; name: string; school_type: string; city: string | null; state: string | null; board: string | null; classes_offered: string | null; referral_id: number | null };
export default function SchoolSelection({ leadId, schools, message }: { leadId: number; schools: School[]; message: string }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  const [state, action, pending] = useActionState(shortlistSchools.bind(null, leadId), { message: "" });
  const available = schools.filter(school => !school.referral_id);
  return <>
    <section className="mt-6 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">WhatsApp lead message</h2>
      <p className="mt-1 text-sm text-slate-600">Review these details, then copy and send to each suitable school’s WhatsApp group. Copying does not mark the lead as shared.</p>
      <textarea aria-label="WhatsApp lead message" id="school-lead-message" defaultValue={message} rows={9} className="mt-3 w-full rounded-lg border p-3 text-sm" />
      <button type="button" className="mt-3 rounded-lg border border-blue-700 px-4 py-2 text-sm text-blue-700" onClick={async () => {
        const text = (document.getElementById("school-lead-message") as HTMLTextAreaElement).value;
        try { await navigator.clipboard.writeText(text); setCopyStatus("Copied. Send it to the school group, then record the transfer in the lead details."); }
        catch { setCopyStatus("Select the message and copy it manually."); }
      }}>Copy message</button>
      <p role="status" className="mt-2 text-sm text-blue-800">{copyStatus}</p>
    </section>
    <form action={action} className="mt-6">
      <fieldset disabled={pending}>
        <div className="rounded-xl border bg-white p-5">
          <button type="button" onClick={() => setSelected(selected.length === available.length ? [] : available.map(school => school.id))} className="rounded-lg border px-3 py-2 text-sm">Select / clear matching schools</button>
          <span className="ml-3 text-sm">{selected.length} selected</span>
          <label className="mt-4 block text-sm font-medium">Reason for matching these schools (optional)<input name="reason" maxLength={1000} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <button disabled={!selected.length || pending} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Shortlist selected schools"}</button>
          <p className="mt-2 text-xs text-slate-600">Shortlisting is internal. After sending the WhatsApp message, update each school to Sent to school, enter its group name, and set its next follow-up.</p>
          {state.message && <p role="alert" className="mt-3 text-sm text-red-700">{state.message}</p>}
        </div>
        <div className="mt-4 grid gap-4">{schools.map(school => <label key={school.id} className="flex items-start gap-3 rounded-xl border bg-white p-5">
          <input type="checkbox" name="schoolId" value={school.id} disabled={Boolean(school.referral_id)} checked={selected.includes(school.id)} onChange={event => setSelected(event.target.checked ? [...selected, school.id] : selected.filter(id => id !== school.id))} className="mt-1" />
          <span><span className="block font-semibold">{school.name}</span><span className="mt-1 block text-sm text-slate-600">{[school.city, school.state].filter(Boolean).join(", ")} · {school.school_type} · {school.board || "Board pending"} · {school.classes_offered || "Classes pending"}</span>{school.referral_id && <span className="block text-sm text-green-700">Already shortlisted</span>}</span>
        </label>)}</div>
      </fieldset>
    </form>
  </>;
}
