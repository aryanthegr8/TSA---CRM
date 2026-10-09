"use client";
import { useActionState, useState } from "react";
import { recordParentDecision } from "./parent-decision";

export default function ParentDecisionForm({ leadId, schools }: { leadId: number; schools: { id: number; name: string; status: string }[] }) {
  const [decision, setDecision] = useState("discussing");
  const [state, action, pending] = useActionState(recordParentDecision.bind(null, leadId), { message: "" });
  const closed = ["not_looking", "elsewhere"].includes(decision);
  return <form action={action} className="mt-5" onSubmit={event => {
    if ((closed || decision === "proceed") && !window.confirm(closed ? "Close this lead and stop all pending parent and school callbacks?" : "Proceed with the selected school and close the other school options and their pending follow-ups?")) event.preventDefault();
  }}><fieldset disabled={pending}>
    
    <label className="mt-4 block text-sm font-medium">Outcome *<select name="decision" required value={decision} onChange={e => setDecision(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="">Choose outcome</option><option value="discussing">Discussing requirements / options</option><option value="comparing">Comparing selected schools</option><option value="budget">Budget issue</option><option value="location">Location does not suit</option><option value="considering">Needs time / family discussion</option><option value="no_answer">No answer — try again</option><option value="proceed">Proceeding with admission</option><option value="not_looking">Not looking for admission — stop callbacks</option><option value="elsewhere">Admission taken elsewhere — close lead</option></select></label>
    {decision === "proceed" ? <label className="mt-3 block text-sm font-medium">Chosen school *<select name="referralId" required defaultValue="" className="mt-1 w-full rounded-lg border bg-white p-2"><option value="" disabled>Choose the school</option>{schools.filter(school => !["not_proceeding", "admitted"].includes(school.status)).map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label> : !closed && !["no_answer", "discussing"].includes(decision) && <details className="mt-3" open={decision === "comparing"}><summary className="cursor-pointer text-sm font-medium">Schools discussed</summary><div className="mt-2 flex flex-wrap gap-2">{schools.filter(school => !["not_proceeding", "admitted"].includes(school.status)).map(school => <label key={school.id} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" name="referralId" value={school.id} />{school.name}</label>)}</div></details>}
    {decision === "proceed" && <p className="mt-2 text-sm text-blue-800">Select exactly one chosen school. Other school options will close. This does not mark admission as confirmed.</p>}
    {closed ? <p className="mt-2 text-sm text-red-800">All pending callbacks will close. No further follow-up will be created.</p> : <label className="mt-3 block text-sm font-medium">Next parent follow-up (India time) *<input name="followUp" type="datetime-local" required className="mt-1 w-full rounded-lg border bg-white p-2" /></label>}
    <label className="mt-3 block text-sm font-medium">Discussion notes *<textarea name="note" required maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border bg-white p-2" placeholder="Record budget concerns, the chosen school, or why admission is no longer needed." /></label>
    {state.message && <p role="alert" className="mt-3 text-sm text-red-700">{state.message}</p>}
    <button disabled={pending} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save follow-up"}</button>
  </fieldset></form>;
}
