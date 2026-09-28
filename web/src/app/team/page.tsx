import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { createTeamMember } from "./actions";

type Member = RowDataPacket & { id: number; name: string; email: string; role: string; is_active: number; open_leads: number };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const [members] = await db.query<Member[]>(`SELECT u.id, u.name, u.email, u.role, u.is_active,
    (SELECT COUNT(*) FROM leads l WHERE l.owner_id = u.id AND l.status NOT IN ('lost','admitted')) AS open_leads
    FROM crm_users u ORDER BY u.is_active DESC, u.name`);
  const { error, saved } = await searchParams;
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5";
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-5xl">
    <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
    <h1 className="mt-3 text-3xl font-bold">Team</h1><p className="mt-2 text-slate-600">Create accounts for your counsellors and managers. Assign leads from each lead page.</p>
    {saved && <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">Account created. Share the login details privately with the staff member.</p>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error === "duplicate" ? "An account with this email already exists." : "Check the details. Passwords must have 12–128 characters."}</p>}
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Add team member</h2>
      <form action={createTeamMember} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Full name<input name="name" required maxLength={160} className={input} /></label>
        <label className="text-sm font-medium">Work email<input name="email" type="email" required maxLength={255} className={input} /></label>
        <label className="text-sm font-medium">Temporary password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className={input} /></label>
        <label className="text-sm font-medium">Role<select name="role" className={input}><option value="counsellor">Counsellor</option><option value="manager">Manager</option></select></label>
        <button className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 sm:col-span-2">Create account</button>
      </form>
    </section>
    <section className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white"><h2 className="p-5 text-lg font-semibold">Staff accounts</h2>
      <table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4">Open leads</th><th className="p-4">Status</th></tr></thead>
      <tbody>{members.map((member) => <tr key={member.id} className="border-t border-slate-100"><td className="p-4 font-medium">{member.name}</td><td className="p-4">{member.email}</td><td className="p-4 capitalize">{member.role}</td><td className="p-4">{member.open_leads}</td><td className="p-4">{member.is_active ? "Active" : "Inactive"}</td></tr>)}</tbody></table>
    </section>
  </div></main>;
}
