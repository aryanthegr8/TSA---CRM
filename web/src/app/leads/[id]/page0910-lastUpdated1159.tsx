import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { recordLeadUpdate } from "./actions";
import ReferralsSection from "./referrals-section";
import { assignLead } from "./assignment";
import { categoryLabel } from "@/lib/lead-categories";

type Lead = RowDataPacket & {
  id: number; parent_name: string | null; primary_phone: string; email: string | null;
  student_name: string | null; class_sought: string | null; admission_year: number | null;
  preferred_location: string | null; school_type: string; source: string; status: string;
  owner_name: string | null; enquiry_category: string;
};
type Task = RowDataPacket & { id: number; title: string; due_at: Date };
type Activity = RowDataPacket & { id: number; activity_type: string; outcome: string | null; note: string | null; occurred_at: Date; actor_name: string | null; school_name: string | null };
type Staff = RowDataPacket & { id: number; name: string; role: string };
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));
const stages = ["new", "attempting_contact", "connected", "qualified", "exploring_options", "application_in_progress", "on_hold", "lost"];

export default async function LeadDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; referralError?: string; referralSaved?: string; decisionSaved?: string; assignmentError?: string; assigned?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [rows] = await db.execute<Lead[]>(
    `SELECT l.id, f.parent_name, f.primary_phone, f.email, l.student_name,
      l.class_sought, l.admission_year, l.preferred_location, l.school_type,
      l.source, l.status, l.enquiry_category, u.name AS owner_name
      FROM leads l JOIN families f ON f.id = l.family_id
      LEFT JOIN crm_users u ON u.id = l.owner_id
      WHERE l.id = ? ${user.role === "counsellor" ? "AND l.owner_id = ?" : ""} LIMIT 1`,
    user.role === "counsellor" ? [id, user.id] : [id]
  );
  const lead = rows[0];
  if (!lead) notFound();
  const [staff] = user.role === "counsellor" ? [[] as Staff[]] : await db.query<Staff[]>("SELECT id, name, role FROM crm_users WHERE is_active = 1 ORDER BY name");
  const [[tasks], [activities]] = await Promise.all([
    db.execute<Task[]>("SELECT id, title, due_at FROM tasks WHERE lead_id = ? AND referral_id IS NULL AND completed_at IS NULL ORDER BY due_at, id", [id]),
    db.execute<Activity[]>(`SELECT a.id, a.activity_type, a.outcome, a.note, a.occurred_at, u.name AS actor_name, ps.name AS school_name
      FROM lead_activities a LEFT JOIN crm_users u ON u.id = a.actor_id LEFT JOIN referrals r ON r.id = a.referral_id LEFT JOIN partner_schools ps ON ps.id = r.partner_school_id
      WHERE a.lead_id = ? ORDER BY a.occurred_at DESC, a.id DESC LIMIT 50`, [id]),
  ]);
  const { decisionSaved, error, saved, referralError, referralSaved, assignmentError, assigned } = await searchParams;
  const schoolOwner = lead.enquiry_category === "school_owner";
  const inbox = schoolOwner ? "/leads/school-owners" : lead.enquiry_category === "boarding_parent" ? "/leads/boarding-parents" : "/leads";
  const active = lead.status !== "lost" && lead.status !== "admitted";
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-6xl">
    <Link href={inbox} className="text-sm text-blue-700 hover:underline">← Lead Inbox</Link>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">{lead.parent_name || "Contact not recorded"}</h1>
      <p className="mt-1 text-slate-600">{!schoolOwner && <>{lead.student_name || "Student name pending"} · </>}{lead.primary_phone}</p></div>
      <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium capitalize text-blue-800">{lead.status.replaceAll("_", " ")}</span></div>
    <p className="mt-3 text-sm font-semibold text-blue-800">{categoryLabel(lead.enquiry_category)}</p>
    {!schoolOwner && <Link href="#referrals" className="mt-3 inline-block rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700">Assign school / update visit or admission</Link>}
    {decisionSaved && <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">Parent decision saved. Pending follow-ups updated.</p>}
    {saved && <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">Update saved and follow-up scheduled.</p>}
    {assigned && <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">Lead and open follow-ups assigned.</p>}
    {assignmentError && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">Choose an active team member.</p>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error === "due" ? "Choose a future follow-up in India time." : error === "closed" ? "This lead is closed." : "Enter a note and check the selected fields."}</p>}
    <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-6"><section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Enquiry details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">{[
          ...(!schoolOwner ? [["Class", lead.class_sought || "Pending"], ["Admission year", lead.admission_year || "Pending"], ["School type", lead.school_type]] : [["Enquiry", "School partnership"]]), ["Location", lead.preferred_location || "Pending"],
          ["Source", lead.source.replaceAll("_", " ")], ["Counsellor", lead.owner_name || "Unassigned"],
        ].map(([label, value]) => <div key={String(label)}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium capitalize">{value}</dd></div>)}</dl>
      </section>{user.role !== "counsellor" && <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Assign counsellor</h2>
        <form action={assignLead.bind(null, id)} className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm font-medium">Team member
          <select name="ownerId" required defaultValue="" className={input}><option value="" disabled>Select a team member</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.role})</option>)}</select></label>
          <button className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800">Assign lead</button></form>
        <p className="mt-3 text-sm text-slate-600">Open parent and school follow-ups move to the selected team member.</p>
      </section>}<section id="parent-follow-up" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Open follow-ups</h2>
        {tasks.length ? <ul className="mt-4 space-y-3">{tasks.map((task) => <li key={task.id} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{task.title}</strong><div className="mt-1 text-slate-600">Due {stamp(task.due_at)}</div></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No open follow-up.</p>}
      </section></div>
      <div className="space-y-6">{active && <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Record contact and plan next step</h2>
        <p className="mt-1 text-sm text-slate-600">The earliest open contact follow-up will be marked complete. Set another follow-up unless closing the lead as lost.</p>
        <form action={recordLeadUpdate.bind(null, id)} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Contact method<select name="method" className={input}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="note">Internal note</option></select></label>
          <label className="text-sm font-medium">New stage<select name="status" defaultValue={lead.status} className={input}>{stages.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></label>
          <label className="text-sm font-medium">Contact outcome<input name="outcome" maxLength={160} placeholder={schoolOwner ? "Spoke with school owner" : "Spoke with parent"} className={input} /></label>
          <label className="text-sm font-medium">Next follow-up in India time<input name="followUp" type="datetime-local" className={input} /></label>
          <label className="text-sm font-medium sm:col-span-2">Conversation note *<textarea name="note" required rows={4} maxLength={2000} className={input} /></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 sm:col-span-2">Save update</button>
        </form></section>}
        <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Activity history</h2>
          {activities.length ? <ol className="mt-4 space-y-4">{activities.map((activity) => <li key={activity.id} className="border-l-2 border-blue-200 pl-4 text-sm"><div className="font-medium capitalize">{activity.activity_type.replaceAll("_", " ")}{activity.outcome ? ` · ${activity.outcome}` : ""}</div><p className="mt-1 whitespace-pre-wrap text-slate-700">{activity.school_name && <strong>{activity.school_name}: </strong>}{activity.note}</p><p className="mt-1 text-xs text-slate-500">{stamp(activity.occurred_at)} · {activity.actor_name || "System"}</p></li>)}</ol> : <p className="mt-3 text-sm text-slate-600">No activity yet.</p>}
        </section>
      </div>
    </div>
    {!schoolOwner && <ReferralsSection leadId={id} active={active} error={referralError} saved={referralSaved} />}
  </div></main>;
}
