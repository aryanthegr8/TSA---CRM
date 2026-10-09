"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { bulkAssignLeads } from "./bulk-assignment";

export default function BulkAssignmentForm({ children, counsellors, category }: {
  children: ReactNode; counsellors: { id: number; name: string }[]; category: string;
}) {
  const [state, action, pending] = useActionState(bulkAssignLeads, { message: "", ok: false });
  const [count, setCount] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const boxes = () => Array.from(form.current?.querySelectorAll<HTMLInputElement>('input[name="leadId"]') ?? []);
  return <form ref={form} action={action} onChange={() => setCount(boxes().filter(box => box.checked).length)} onSubmit={event => {
    if (!window.confirm(`Assign ${count} selected leads to this counsellor? Existing assignments and open follow-up tasks will move to them.`)) event.preventDefault();
  }}>
    <input type="hidden" name="category" value={category} />
    <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <button type="button" disabled={pending} onClick={() => {
        const inputs = boxes();
        const checked = !inputs.length || !inputs.every(box => box.checked);
        inputs.forEach(box => { box.checked = checked; });
        setCount(checked ? inputs.length : 0);
      }} className="rounded-lg border px-3 py-2 text-sm">Select / clear this page</button>
      <span className="py-2 text-sm">{count} selected</span>
      <label className="text-sm font-medium">Assign counsellor<select name="ownerId" required disabled={pending} className="ml-2 rounded-lg border bg-white px-3 py-2"><option value="">Choose counsellor</option>{counsellors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button disabled={pending || count === 0 || counsellors.length === 0} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">{pending ? "Assigning…" : "Assign selected leads"}</button>
      <p className="w-full text-xs text-slate-600">Selection applies only to this page (up to 50 leads). Reassignment also moves open follow-up tasks.</p>
      {!counsellors.length && <p className="w-full text-sm text-red-700">Create or activate a counsellor account before assigning leads.</p>}
      {state.message && <p role="status" className={`w-full text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p>}
    </div>
    <fieldset disabled={pending}>{children}</fieldset>
  </form>;
}
