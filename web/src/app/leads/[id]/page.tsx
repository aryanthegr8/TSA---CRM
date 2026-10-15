import Link from "next/link";
import { parentStageSql, preferredSchoolSql } from "@/lib/lead-stage";
import { parentStageLabels, stageNextActions, type ParentStage } from "@/lib/parent-workflow";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { recordLeadUpdate } from "./actions";
import SchoolCoordinationForm from "./school-coordination-form";
import ParentDecisionForm from "./parent-decision-form";
import ReferralsSection from "./referrals-section";
import { assignLead } from "./assignment";
import { categoryLabel } from "@/lib/lead-categories";

type Lead = RowDataPacket & {
  workflow_stage: ParentStage; call_count: number; id: number; parent_name: string | null; primary_phone: string; email: string | null;
  student_name: string | null; class_sought: string | null; admission_year: number | null;
  preferred_location: string | null; school_type: string; source: string; status: string;
  board_preference: string | null; budget_min_inr: number | null; budget_max_inr: number | null; owner_name: string | null; enquiry_category: string;
};
type Task = RowDataPacket & { id: number; title: string; due_at: Date };
type Activity = RowDataPacket & { id: number; activity_type: string; outcome: string | null; note: string | null; occurred_at: Date; actor_name: string | null; school_name: string | null };
type Staff = RowDataPacket & { id: number; name: string; role: string };
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));
const stages = ["new", "attempting_contact", "connected", "qualified", "exploring_options", "application_in_progress", "on_hold", "lost"];

export default async function LeadDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; saved?: string; referralError?: string; referralSaved?: string; decisionSaved?: string; assignmentError?: string; assigned?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [rows] = await db.execute<Lead[]>(
    `SELECT l.id, f.parent_name, f.primary_phone, f.email, l.student_name,
      l.class_sought, l.admission_year, l.preferred_location, l.school_type,
      l.board_preference, l.budget_min_inr, l.budget_max_inr, l.source, l.status, l.enquiry_category, u.name AS owner_name,
      ${parentStageSql()} AS workflow_stage,
      (SELECT COUNT(*) FROM lead_activities ca WHERE ca.lead_id=l.id AND ca.activity_type='call') AS call_count
      FROM leads l JOIN families f ON f.id = l.family_id
      LEFT JOIN crm_users u ON u.id = l.owner_id
      WHERE l.id = ? ${user.role === "counsellor" ? "AND l.owner_id = ?" : ""} LIMIT 1`,
    user.role === "counsellor" ? [id, user.id] : [id]
  );
  const lead = rows[0];
  if (!lead) notFound();
  const [staff] = user.role === "counsellor" ? [[] as Staff[]] : await db.query<Staff[]>("SELECT id, name, role FROM crm_users WHERE is_active = 1 ORDER BY name");
  const [[tasks], [activities]] = await Promise.all([
    db.execute<Task[]>("SELECT id, title, due_at FROM tasks WHERE lead_id = ? AND completed_at IS NULL ORDER BY due_at, id", [id]),
    db.execute<Activity[]>(`SELECT a.id, a.activity_type, a.outcome, a.note, a.occurred_at, u.name AS actor_name, ps.name AS school_name
      FROM lead_activities a LEFT JOIN crm_users u ON u.id = a.actor_id LEFT JOIN referrals r ON r.id = a.referral_id LEFT JOIN partner_schools ps ON ps.id = r.partner_school_id
      WHERE a.lead_id = ? ORDER BY a.occurred_at DESC, a.id DESC LIMIT 50`, [id]),
  ]);
  const { tab: requestedTab, decisionSaved, error, saved, referralError, referralSaved, assignmentError, assigned } = await searchParams;
  const schoolOwner = lead.enquiry_category === "school_owner";
  const inbox = schoolOwner ? "/leads/school-owners" : lead.enquiry_category === "boarding_parent" ? "/leads/boarding-parents" : "/leads";
  const active = lead.status !== "lost" && lead.status !== "admitted";
  const tab = requestedTab === "history" ? "history" : requestedTab === "schools" || referralError || referralSaved ? "schools" : "follow-up";
  const [schools] = schoolOwner ? [[] as RowDataPacket[]] : await db.execute<RowDataPacket[]>(`SELECT ps.id, COALESCE(r.status, 'available') AS status, ps.name, r.transfer_recipient AS recipient, r.id AS referral_id, r.sent_at, r.call_requested_at, r.preferred_call_time, r.school_contact_outcome, r.parent_decision,
      (${preferredSchoolSql()}=r.id) AS preferred,
      EXISTS(SELECT 1 FROM school_visits sv WHERE sv.referral_id=r.id AND sv.status='scheduled') AS pending_visit FROM leads l JOIN partner_schools ps ON 1=1 LEFT JOIN referrals r ON r.partner_school_id = ps.id AND r.lead_id = ? WHERE l.id = ? AND ((ps.is_active = 1 AND (? = 'undecided' OR ps.school_type IN (?, 'both'))) OR r.id IS NOT NULL) ORDER BY ps.name`, [id, id, lead.school_type, lead.school_type]);
  const lastDiscussion = activities.find(item => ["call", "whatsapp", "email"].includes(item.activity_type));
  const latestTask = tasks[0];
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900"><div className="mx-auto max-w-5xl">
    <Link href={inbox} className="text-sm font-medium text-blue-700 hover:underline">← Lead inbox</Link>
    <header className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{categoryLabel(lead.enquiry_category)} · Lead #{id}</p><h1 className="mt-2 text-2xl font-bold">{lead.parent_name || "Contact not recorded"}</h1><a href={`tel:${lead.primary_phone}`} className="mt-2 inline-block text-blue-700">{lead.primary_phone}</a>{!schoolOwner && lead.student_name && <span className="ml-3 text-sm text-slate-500">Student: {lead.student_name}</span>}</div><span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${active ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{lead.status.replaceAll("_", " ")}</span></div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t pt-4 text-sm"><p><span className="text-slate-500">Counsellor:</span> {lead.owner_name || "Unassigned"}</p><p><span className="text-slate-500">Next follow-up:</span> {latestTask ? stamp(latestTask.due_at) : "None scheduled"}</p></div>
    </header>
    {(saved || decisionSaved || assigned || referralSaved) && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">Changes saved. Follow-ups updated.</p>}
    {(error || assignmentError) && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error === "due" ? "Choose a future follow-up in India time." : error === "closed" ? "This lead is closed." : "Check the selected fields and note."}</p>}
    {!schoolOwner && <section className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-blue-900">{parentStageLabels[lead.workflow_stage]}</p><span className="text-xs text-blue-700">{lead.call_count} recorded call{lead.call_count === 1 ? "" : "s"}{active ? ` · Next call #${Number(lead.call_count)+1}` : ""}</span></div><p className="mt-2 text-sm text-blue-800">Next action: {active ? latestTask?.title || "Next action not scheduled" : stageNextActions[lead.workflow_stage]}</p>{activities[0] && <p className="mt-2 text-xs text-blue-700">Last update: {activities[0].outcome || activities[0].activity_type.replaceAll("_", " ")} · {stamp(activities[0].occurred_at)}</p>}{active && !latestTask && <p role="status" className="mt-2 text-sm font-semibold text-amber-800">Next action not scheduled — set a follow-up before leaving this lead.</p>}</section>}
    {!schoolOwner && <section className="mt-4 rounded-xl border bg-white p-5"><h2 className="text-sm font-semibold text-slate-600">Admission requirements</h2><dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">{[["Class", lead.class_sought || "To confirm"], ["Location", lead.preferred_location || "To confirm"], ["Annual budget", lead.budget_min_inr !== null || lead.budget_max_inr !== null ? `₹${lead.budget_min_inr?.toLocaleString("en-IN") ?? "?"} – ₹${lead.budget_max_inr?.toLocaleString("en-IN") ?? "?"}` : "To confirm"], ["Admission year", lead.admission_year || "To confirm"], ["School type", lead.school_type]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium capitalize">{value}</dd></div>)}</dl></section>}
    <nav aria-label="Lead workspace" className="mt-6 flex gap-1 border-b border-slate-200">{[["follow-up", "Follow-up"], ["schools", schoolOwner ? "Partnership details" : "Schools"], ["history", "History"]].map(([key, label]) => <Link key={key} href={`/leads/${id}?tab=${key}`} aria-current={key === tab ? "page" : undefined} className={`border-b-2 px-5 py-3 text-sm font-semibold ${key === tab ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{label}</Link>)}</nav>
    {tab === "follow-up" && <section className="mt-5 rounded-xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{active ? "Record follow-up" : "Lead closed"}</h2>
      {lastDiscussion && <div className="mt-4 rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">LAST DISCUSSION · {stamp(lastDiscussion.occurred_at)}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{lastDiscussion.note}</p></div>}
      {!active && <p className="mt-3 text-sm text-slate-500">No further callbacks are scheduled. View Schools and History for previous updates.</p>}
      {!schoolOwner && schools.some(ref => ref.referral_id && !["not_proceeding","admitted"].includes(ref.status)) && <details open={active && ["schools","decision"].includes(lead.workflow_stage)} className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-semibold">School coordination</summary>{active ? <SchoolCoordinationForm key={`${lead.call_count}-${activities[0]?.id}`} leadId={id} callCount={Number(lead.call_count)} schools={schools.filter(ref => ref.referral_id && !["not_proceeding","admitted"].includes(ref.status)).map(ref => ({id:ref.referral_id,name:ref.name,shared:Boolean(ref.sent_at),requested:Boolean(ref.call_requested_at),recipient:ref.recipient,contact:ref.school_contact_outcome,decision:ref.parent_decision,preferredTime:ref.preferred_call_time}))} /> : <p className="mt-3 text-sm text-slate-500">Lead closed. View the Schools tab for previous referrals.</p>}</details>}
      {active && (!schoolOwner ? <details open={["requirements","qualified"].includes(lead.workflow_stage)} className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Record next lead action</summary> <ParentDecisionForm key={`${lead.workflow_stage}-${lead.call_count}`} stage={lead.workflow_stage} callCount={Number(lead.call_count)} leadId={id} requirements={{ location: lead.preferred_location ?? "", budgetMin: lead.budget_min_inr, budgetMax: lead.budget_max_inr, year: lead.admission_year, schoolType: lead.school_type, board: lead.board_preference ?? "" }} student={lead.student_name ?? ""} classSought={lead.class_sought ?? ""} schools={schools.map(ref => ({ id: ref.id, name: ref.name, status: ref.status, preferred: Boolean(ref.preferred), recipient: ref.recipient, pendingVisit: Boolean(ref.pending_visit) }))} /></details> : <>
        <form action={recordLeadUpdate.bind(null, id)} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Contact method<select name="method" className={input}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="note">Internal note</option></select></label>
          <label className="text-sm font-medium">New stage<select name="status" defaultValue={lead.status} className={input}>{stages.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></label>
          <label className="text-sm font-medium">Contact outcome<input name="outcome" maxLength={160} placeholder={schoolOwner ? "Spoke with school owner" : "Spoke with parent"} className={input} /></label>
          <label className="text-sm font-medium">Next follow-up in India time<input name="followUp" type="datetime-local" className={input} /></label>
          <label className="text-sm font-medium sm:col-span-2">Conversation note *<textarea name="note" required rows={4} maxLength={2000} className={input} /></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 sm:col-span-2">Save update</button>
        </form>
      </>)}
      {tasks.length > 0 && <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Pending follow-ups ({tasks.length})</summary><ul className="mt-3 space-y-2">{tasks.map(task => <li key={task.id} className="rounded-lg bg-slate-50 p-3 text-sm">{task.title}<span className="mt-1 block text-xs text-slate-500">{stamp(task.due_at)}</span></li>)}</ul></details>}
    </section>}
    {tab === "schools" && (!schoolOwner ? <ReferralsSection leadId={id} active={active} error={referralError} saved={referralSaved} /> : <section className="mt-5 rounded-xl border bg-white p-6"><h2 className="text-lg font-semibold">Partnership details</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{[["Contact", lead.parent_name || "To confirm"], ["Phone", lead.primary_phone], ["Email", lead.email || "To confirm"], ["Location", lead.preferred_location || "To confirm"], ["Source", lead.source.replaceAll("_", " ")], ["Counsellor", lead.owner_name || "Unassigned"]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl></section>)}
    {tab === "history" && <section className="mt-5 rounded-xl border bg-white p-6"><h2 className="text-lg font-semibold">Activity history</h2><p className="mt-1 text-xs text-slate-500">Latest 50 updates</p>{activities.length ? <ol className="mt-5 space-y-5">{activities.map(activity => <li key={activity.id} className="border-l-2 border-blue-200 pl-4 text-sm"><div className="font-semibold capitalize">{activity.activity_type.replaceAll("_", " ")}{activity.outcome ? ` · ${activity.outcome}` : ""}</div><p className="mt-1 whitespace-pre-wrap text-slate-600">{activity.school_name && <strong>{activity.school_name}: </strong>}{activity.note}</p><p className="mt-2 text-xs text-slate-400">{stamp(activity.occurred_at)} · {activity.actor_name || "System"}</p></li>)}</ol> : <p className="mt-4 text-sm text-slate-500">No activity yet.</p>}</section>}
    {user.role !== "counsellor" && <details className="mt-6 rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Manage counsellor assignment</summary><form action={assignLead.bind(null, id)} className="mt-3 flex flex-wrap gap-3"><select name="ownerId" required defaultValue="" className="rounded-lg border px-3 py-2"><option value="" disabled>Select a team member</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name} ({member.role})</option>)}</select><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white">Assign lead</button></form><p className="mt-2 text-xs text-slate-500">For multiple leads, use bulk assignment in the inbox.</p></details>}
  </div></main>;
}
