import { redirect } from "next/navigation";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logout } from "./actions";

interface CountRow extends RowDataPacket { total: number; unassigned: number | null }

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows] = user.role === "counsellor"
    ? await db.execute<CountRow[]>("SELECT COUNT(*) AS total, 0 AS unassigned FROM leads WHERE owner_id = ? AND status NOT IN ('admitted','lost') AND NOT EXISTS (SELECT 1 FROM school_partnerships sp WHERE sp.lead_id=leads.id AND sp.stage IN ('confirmed','closed'))", [user.id])
    : await db.query<CountRow[]>("SELECT COUNT(*) AS total, SUM(owner_id IS NULL) AS unassigned FROM leads WHERE status NOT IN ('admitted','lost') AND NOT EXISTS (SELECT 1 FROM school_partnerships sp WHERE sp.lead_id=leads.id AND sp.stage IN ('confirmed','closed'))");
  const count = rows[0];
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div><p className="text-sm font-semibold text-blue-700">THE SCHOOL ADMISSION</p><h1 className="text-xl font-bold">Counsellor CRM</h1></div>
        <form action={logout}><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Sign out</button></form>
      </div></header>
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-2xl font-semibold">Welcome, {user.name}</h2>
        <p className="mt-1 text-slate-600">Your role: {user.role}. Review new enquiries or work from the follow-up board.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/follow-ups" className="inline-block rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white">Follow-up board</Link>
          <Link href="/my-day" className="inline-block rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">My tasks</Link>
          <Link href="/leads" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-100">New lead inbox</Link>
          <Link href="/leads/day-parents" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium">Day-school parents · Delhi NCR</Link>
          <Link href="/partner-schools" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-100">Partner schools</Link>
          <Link href="/visits" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium">School visits</Link>
          <Link href="/conversions" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium">Confirmed admissions</Link>
          {["admin", "manager"].includes(user.role) && <Link href="/team" className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-100">Team</Link>}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-600">Open leads {user.role === "counsellor" ? "assigned to you" : "across the team"}</p><p className="mt-2 text-4xl font-bold">{count?.total ?? 0}</p></section>
          {user.role !== "counsellor" && <section className="rounded-xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-600">Unassigned leads</p><p className="mt-2 text-4xl font-bold">{count?.unassigned ?? 0}</p></section>}
        </div>
      </div>
    </main>
  );
}
