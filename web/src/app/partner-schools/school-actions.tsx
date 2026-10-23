"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { setSchoolActive, permanentlyDeleteArchivedSchool } from "./actions";

function Submit({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="font-medium text-red-700 hover:underline disabled:opacity-50">{pending ? "Saving…" : active ? "Archive" : "Restore"}</button>;
}
export default function SchoolActions({ id, name, active }: { id: number; name: string; active: boolean }) {
  return <div className="flex items-center gap-4">
    <Link href={`/partner-schools/${id}/edit`} className="font-medium text-blue-700 hover:underline">Edit</Link>
    <form action={setSchoolActive} onSubmit={(event) => {
      if (!window.confirm(active
        ? `Delete ${name} from active schools? It will move to Archived. Existing lead referrals and school contacts will be kept, and you can restore it later.`
        : `Restore ${name} to active schools?`)) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Submit active={active} />
    </form>
    {!active && <form action={permanentlyDeleteArchivedSchool} onSubmit={event => {
      if (!window.confirm(`PERMANENTLY DELETE ${name}? Its referrals, contacts, partnerships and boarding targets will also be deleted. This cannot be undone.`)) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="confirmDelete" value="yes" />
      <button type="submit" className="font-semibold text-red-800 hover:underline">Delete permanently</button>
    </form>}
  </div>;
}
