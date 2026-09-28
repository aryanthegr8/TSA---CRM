import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

type FollowUp = RowDataPacket & {
  id: number; lead_id: number; referral_id: number | null; title: string;
  task_type: string; due_at: Date; parent_name: string | null;
  student_name: string | null; primary_phone: string; school_name: string | null;
};
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));

function TaskList({ title, tasks, tone }: { title: string; tasks: FollowUp[]; tone: "red" | "blue" | "slate" }) {
  const headingColor = tone === "red" ? "text-red-700" : tone === "blue" ? "text-blue-700" : "text-slate-700";
  return <section className="mt-8"><h2 className={`text-xl font-semibold ${headingColor}`}>{title} <span className="text-base font-normal text-slate-500">({tasks.length})</span></h2>
    {tasks.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Nothing scheduled here.</p> :
      <div className="mt-3 grid gap-3">{tasks.map((task) => <Link key={task.id} href={`/leads/${task.lead_id}${task.referral_id ? "#referrals" : "#parent-follow-up"}`}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{task.parent_name || "Parent not recorded"}{task.student_name ? ` · ${task.student_name}` : ""}</p>
          <p className="mt-1 text-sm text-slate-600">{task.referral_id ? `School: ${task.school_name || "Partner school"}` : "Parent follow-up"} · {task.primary_phone}</p></div>
          <span className={`text-sm font-medium ${headingColor}`}>{stamp(task.due_at)}</span></div>
        <p className="mt-3 text-sm text-slate-700">{task.title}</p>
      </Link>)}</div>}
  </section>;
}

export default async function MyDayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [tasks] = await db.execute<FollowUp[]>(
    `SELECT t.id, t.lead_id, t.referral_id, t.title, t.task_type, t.due_at,
      f.parent_name, f.primary_phone, l.student_name, ps.name AS school_name
      FROM tasks t JOIN leads l ON l.id = t.lead_id JOIN families f ON f.id = l.family_id
      LEFT JOIN referrals r ON r.id = t.referral_id
      LEFT JOIN partner_schools ps ON ps.id = r.partner_school_id
      WHERE t.owner_id = ? AND t.completed_at IS NULL AND l.status NOT IN ('admitted','lost')
      ORDER BY t.due_at, t.id LIMIT 200`, [user.id]
  );
  const now = new Date();
  const indiaDate = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const tomorrowUtc = new Date(new Date(`${indiaDate}T00:00:00+05:30`).getTime() + 24 * 60 * 60_000);
  const overdue = tasks.filter((task) => new Date(task.due_at) < now);
  const today = tasks.filter((task) => new Date(task.due_at) >= now && new Date(task.due_at) < tomorrowUtc);
  const upcoming = tasks.filter((task) => new Date(task.due_at) >= tomorrowUtc);
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-4xl">
    <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">← Dashboard</Link>
    <h1 className="mt-3 text-3xl font-bold">My Day</h1>
    <p className="mt-2 text-slate-600">Your open parent and school follow-ups for {new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(now)}. Times are shown in India time.</p>
    <div className="mt-6 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-red-50 px-3 py-2 font-semibold text-red-800">{overdue.length} overdue</span><span className="rounded-full bg-blue-50 px-3 py-2 font-semibold text-blue-800">{today.length} later today</span><span className="rounded-full bg-white px-3 py-2 font-semibold text-slate-700">{upcoming.length} upcoming</span></div>
    <TaskList title="Overdue" tasks={overdue} tone="red" />
    <TaskList title="Later today" tasks={today} tone="blue" />
    <TaskList title="Upcoming" tasks={upcoming} tone="slate" />
    {tasks.length === 200 && <p className="mt-8 text-sm text-amber-800">Showing the earliest 200 tasks. Complete older follow-ups to see later ones.</p>}
  </div></main>;
}
