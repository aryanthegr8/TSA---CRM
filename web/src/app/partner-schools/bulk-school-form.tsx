"use client";

import { useActionState } from "react";
import { bulkSetSchoolActive, bulkPermanentlyDeleteArchivedSchools } from "./actions";

export default function BulkSchoolForm({ active }: { active: boolean }) {
  const [state, action, pending] = useActionState(async (_previous: string, form: FormData) => {
    const ids = form.getAll("schoolId");
    if (!ids.length) return "Select at least one school.";
    const deleting = !active && form.get("operation") === "delete";
    const verb = deleting ? "PERMANENTLY DELETE" : active ? "archive" : "restore";
    const detail = deleting
      ? "Related test referrals, contacts, partnerships and boarding targets will be removed. This CANNOT be undone."
      : active ? "This is reversible and preserves linked history." : "They will appear in active schools.";
    if (!window.confirm(`Are you sure you want to ${verb} ${ids.length} selected school(s)? ${detail}`)) return "";
    if (deleting) await bulkPermanentlyDeleteArchivedSchools(form);
    else await bulkSetSchoolActive(form);
    return "";
  }, "");
  return <form id="bulk-school-form" action={action} className="mt-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h2 className="text-sm font-semibold">Bulk school management</h2>
    <p className="text-xs text-slate-600">Use the <strong>Select school</strong> column to choose schools on this page. This is separate from Delhi NCR eligibility. {active ? "Archiving does not permanently delete records." : "Restoring moves records back to Active."}</p>
    <fieldset disabled={pending} className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => {
        const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[form="bulk-school-form"][name="schoolId"]'));
        const checked = !boxes.every(b => b.checked);
        boxes.forEach(b => { b.checked = checked; });
      }} className="rounded-lg border px-3 py-2 text-xs font-semibold">Select / clear schools on this page</button>
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirmBulk" value="yes" required />I reviewed the schools selected for this action.</label>
      <button type="submit" name="operation" value="status" className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${active ? "bg-red-700" : "bg-blue-700"}`}>{pending ? "Saving…" : active ? "Archive selected schools" : "Restore selected schools"}</button>
      {!active && <button type="submit" name="operation" value="delete" className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white" disabled={pending}>Permanently delete selected</button>}
    </fieldset>
    {state && <p role="alert" className="text-sm text-red-700">{state}</p>}
  </form>;
}
