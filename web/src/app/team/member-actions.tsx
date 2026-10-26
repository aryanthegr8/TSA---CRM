"use client";
import { useActionState } from "react";
// import { manageTeamMember } from "./actions";\nimport { departments } from "@/lib/departments";
import { manageTeamMember } from "./actions";
import { departments } from "@/lib/departments";
export default function MemberActions({ member, admin, replacements }: {
  member: { id: number; name: string; role: string; department: string | null; active: boolean };
  admin: boolean; replacements: { id: number; name: string; role: string; department: string | null }[];
}) {
  const [state, action, pending] = useActionState(manageTeamMember, { message: "", ok: false });
  return <form action={action} onSubmit={event => {
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (button?.value === "delete" && !window.confirm(`Delete ${member.name} from active staff? Their login will be disabled. Open work will transfer to the replacement you selected, and history will be preserved.`)) event.preventDefault();
  }}><fieldset disabled={pending} className="flex min-w-64 flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={member.id} />
    {member.active ? <>
      {admin && <><select name="role" defaultValue={member.role} aria-label={`Role for ${member.name}`} className="rounded border p-2"><option value="counsellor">Counsellor</option><option value="manager">Manager</option></select><select name="department" defaultValue={member.department ?? ""} aria-label={`Department for ${member.name}`} className="rounded border p-2"><option value="">None (manager only)</option>{Object.entries(departments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button name="operation" value="role" className="text-blue-700 hover:underline">Save role</button></>}
      <select name="replacement" aria-label={`Replacement for ${member.name}`} className="w-full rounded border p-2"><option value="">Transfer open work to…</option>{replacements.filter(person => person.id !== member.id && (person.role !== "counsellor" || person.department === member.department)).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
      <button name="operation" value="delete" className="text-red-700 hover:underline">Delete account</button>
    </> : <button name="operation" value="restore" className="text-blue-700 hover:underline">Restore account</button>}
    {state.message && <p role="status" className={`w-full text-xs ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p>}
  </fieldset></form>;
}
