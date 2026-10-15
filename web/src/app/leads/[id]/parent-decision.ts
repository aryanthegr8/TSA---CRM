"use server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { parentStageSql } from "@/lib/lead-stage";
import { stageOutcomeAllowed, type ParentStage, parentOutcomes, schoolRequired, singleSchool } from "@/lib/parent-workflow";

function indiaDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime()) || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(" ", "T") !== value) return null;
  return date;
}
const sqlDate = (date: Date) => date.toISOString().slice(0,23).replace("T", " ");
export async function recordParentDecision(leadId: number, _previous: { message: string }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!Number.isSafeInteger(leadId) || leadId <= 0) notFound();
  const read = (key: string) => String(form.get(key) ?? "").trim();
  const heading = read("heading"), outcome = read("decision");
  const options = Object.hasOwn(parentOutcomes, heading) ? parentOutcomes[heading as keyof typeof parentOutcomes] as Record<string,string> : {};
  if (!Object.hasOwn(options, outcome)) return { message: "Choose a main heading and its outcome." };
  const requestCalls = outcome === "discussing" && read("nextAction") === "request_calls";
  const label = options[outcome], note = read("note"), raw = form.getAll("schoolId");
  const ids = [...new Set(raw.map(Number))].sort((a,b)=>a-b);
  if (!note || note.length > 2000 || raw.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return { message: "Enter discussion notes and select valid schools." };
  if ((schoolRequired.includes(outcome) || requestCalls) && !ids.length || singleSchool.includes(outcome) && ids.length !== 1) return { message: singleSchool.includes(outcome) ? "Choose exactly one school." : "Choose at least one school." };
  const terminal = heading === "dead" || heading === "converted";
  const due = terminal ? null : indiaDate(read("followUp"));
  if (!terminal && (!due || due.getTime() <= Date.now())) return { message: "Set a future follow-up in India time." };
  const visitAt = outcome.startsWith("visit_") && !["visit_cancelled", "visit_no_show"].includes(outcome) ? indiaDate(read("visitAt")) : null;
  if (["visit_scheduled", "visit_rescheduled"].includes(outcome) && (!visitAt || visitAt.getTime() <= Date.now())) return { message: "Set a future visit date in India time." };
  if (outcome === "visit_completed" && (!visitAt || visitAt.getTime() > Date.now())) return { message: "Enter the actual completed visit date, not a future date." };
  if (read("contactName").length > 160) return { message: "School contact name is too long." };
  const student = read("student"), classSought = read("class"), session = read("session"), admissionDate = read("admissionDate");
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Kolkata"}).format(new Date());
  const parsedAdmissionDate = new Date(`${admissionDate}T00:00:00Z`);
  if (outcome === "confirmed" && (!student || student.length > 160 || !classSought || classSought.length > 40 || !session || session.length > 40 || !/^\d{4}-\d{2}-\d{2}$/.test(admissionDate) || admissionDate > today || (Number.isNaN(parsedAdmissionDate.getTime()) ? "invalid" : parsedAdmissionDate.toISOString().slice(0,10)) !== admissionDate)) return { message: "Enter student, class, session and a valid admission date up to today." };
  const targetYear = Number(read("targetYear"));
  if (outcome === "next_session" && (!Number.isInteger(targetYear) || targetYear < Number(today.slice(0,4)) || targetYear > 2100)) return { message: "Enter a valid upcoming admission year." };
  if (requestCalls && read("preferredCallTime").length > 160) return { message: "Preferred calling time must be within 160 characters." };
  const numeric = (key: string) => read(key) === "" ? null : Number(read(key));
  const budgetMin = numeric("budgetMin"), budgetMax = numeric("budgetMax"), year = numeric("requirementsYear");
  if (outcome === "discussing" && (read("location").length > 255 || read("requirementsClass").length > 40 || read("board").length > 100 || !["boarding","day","undecided"].includes(read("schoolType")) || [budgetMin,budgetMax].some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 4294967295)) || budgetMin !== null && budgetMax !== null && budgetMax < budgetMin || year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100))) return { message: "Check the requirements, budget range and admission year." };
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [leads] = await connection.execute<RowDataPacket[]>(`SELECT owner_id, status, enquiry_category, school_type, ${parentStageSql("leads")} AS workflow_stage, (SELECT COUNT(*) FROM lead_activities ca WHERE ca.lead_id=leads.id AND ca.activity_type='call') AS call_count FROM leads WHERE id = ? FOR UPDATE`, [leadId]);
    const lead = leads[0];
    if (!lead || lead.enquiry_category === "school_owner" || user.role === "counsellor" && Number(lead.owner_id) !== user.id) notFound();
    if (["lost", "admitted"].includes(lead.status)) { await connection.rollback(); return { message: "This lead is already closed. Refresh the page." }; }
    const currentStage = lead.workflow_stage as ParentStage;
    if (read("expectedCallCount") === "" || Number(read("expectedCallCount")) !== Number(lead.call_count) || read("expectedStage") !== currentStage || !stageOutcomeAllowed(currentStage,heading,outcome)) {
      await connection.rollback(); return { message: "The lead has moved to another stage, or this outcome is unavailable. Refresh to see its next actions." };
    }
    const refs: {id:number;schoolId:number;name:string;status:string}[] = [];
    for (const schoolId of ids) {
      const [schools] = await connection.execute<RowDataPacket[]>("SELECT name, school_type, is_active FROM partner_schools WHERE id = ? FOR UPDATE", [schoolId]);
      const school = schools[0];
      const [existing] = await connection.execute<RowDataPacket[]>("SELECT id, status FROM referrals WHERE lead_id = ? AND partner_school_id = ? FOR UPDATE", [leadId, schoolId]);
      if (!school || outcome !== "transferred" && !requestCalls && !existing.length || !existing.length && (!school.is_active || (requestCalls ? read("schoolType") : lead.school_type) !== "undecided" && school.school_type !== "both" && school.school_type !== (requestCalls ? read("schoolType") : lead.school_type)) || existing[0]?.status === "not_proceeding") { await connection.rollback(); return { message: "A selected school is inactive, incompatible or closed. Refresh your selection." }; }
      let refId = existing[0]?.id;
      if (!refId) {
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO referrals (lead_id, partner_school_id, counsellor_id, reason_for_match) VALUES (?, ?, ?, ?)", [leadId,schoolId,user.id,note]);
        refId = created.insertId;
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'shortlisted', 'School selected in parent workflow', UTC_TIMESTAMP(3))", [leadId,refId,user.id]);
      }
      refs.push({id:refId,schoolId,name:school.name,status:existing[0]?.status ?? "shortlisted"});
    }
    for (const ref of refs) {
      if (requestCalls) {
        await connection.execute("UPDATE referrals SET call_requested_at = COALESCE(call_requested_at, UTC_TIMESTAMP(3)), preferred_call_time = ? WHERE id = ?", [read("preferredCallTime")||null,ref.id]);
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'school_call_requested', ?, UTC_TIMESTAMP(3))", [leadId,ref.id,user.id,`Request school call. Preferred time: ${read('preferredCallTime') || 'Not specified'}. ${note}`]);
        await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = 'School call request refreshed' WHERE referral_id = ? AND task_type = 'contact_school' AND completed_at IS NULL", [ref.id]);
        await connection.execute("INSERT INTO tasks (lead_id, referral_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, 'Share call request with school and confirm contact', 'contact_school', ?)", [leadId,ref.id,lead.owner_id ?? user.id,sqlDate(due!)]);
      }

      if (outcome === "transferred") {
        const recipient = read(`recipient_${ref.schoolId}`);
        if (!recipient || recipient.length > 255 || form.get("sentConfirmed") !== "yes") { await connection.rollback(); return { message: "Enter each school’s WhatsApp group/recipient and confirm you actually sent the lead." }; }
        // Resending records an activity without moving a later stage backwards.
        await connection.execute("UPDATE referrals SET status = CASE WHEN status IN ('shortlisted','shared_with_parent','parent_interested') THEN 'sent_to_school' ELSE status END, sent_at = COALESCE(sent_at, UTC_TIMESTAMP(3)), sent_by_user_id = ?, transfer_channel = 'whatsapp', transfer_recipient = ? WHERE id = ?", [user.id,recipient,ref.id]);
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'sent_to_school', ?, UTC_TIMESTAMP(3))", [leadId,ref.id,user.id,`Shared via WhatsApp with ${recipient}. ${note}`]);
      }
      if (outcome.startsWith("visit_")) {
        const [pending] = await connection.execute<RowDataPacket[]>("SELECT id FROM school_visits WHERE referral_id = ? AND status = 'scheduled' ORDER BY id DESC FOR UPDATE", [ref.id]);
        if (["visit_cancelled", "visit_no_show", "visit_rescheduled"].includes(outcome) && !pending.length) { await connection.rollback(); return { message: "This school has no scheduled visit to update." }; }
        if (outcome === "visit_scheduled" && pending.length) { await connection.rollback(); return { message: "A visit is already scheduled. Choose rescheduled, completed or cancelled." }; }
        if (pending.length) await connection.execute("UPDATE school_visits SET status = ?, completed_at = ?, feedback = ? WHERE id = ?", [outcome === "visit_rescheduled" ? "rescheduled" : outcome === "visit_completed" ? "completed" : outcome === "visit_cancelled" ? "cancelled" : "no_show", outcome === "visit_completed" ? sqlDate(visitAt!) : null,note,pending[0].id]);
        if (["visit_scheduled", "visit_rescheduled"].includes(outcome) || outcome === "visit_completed" && !pending.length) await connection.execute("INSERT INTO school_visits (lead_id, referral_id, scheduled_at, completed_at, status, contact_name, feedback, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [leadId,ref.id,sqlDate(visitAt!),outcome === "visit_completed" ? sqlDate(visitAt!) : null,outcome === "visit_completed" ? "completed" : "scheduled",read("contactName")||null,note,user.id]);
        // Record dates without falsely recording an application or resetting later progress.
        if (["visit_scheduled","visit_rescheduled"].includes(outcome)) await connection.execute("UPDATE referrals SET visit_scheduled_at = ?, status = CASE WHEN status IN ('shortlisted','shared_with_parent','parent_interested','sent_to_school','school_responded','visit_scheduled') THEN 'visit_scheduled' ELSE status END WHERE id = ?", [sqlDate(visitAt!),ref.id]);
        if (outcome === "visit_completed") await connection.execute("UPDATE referrals SET visited_at = ?, status = CASE WHEN status IN ('shortlisted','shared_with_parent','parent_interested','sent_to_school','school_responded','visit_scheduled') THEN 'school_visited' ELSE status END WHERE id = ?", [sqlDate(visitAt!),ref.id]);
        if (["visit_cancelled","visit_no_show"].includes(outcome)) await connection.execute("UPDATE referrals SET visit_scheduled_at = NULL, status = CASE WHEN status = 'visit_scheduled' THEN 'school_responded' ELSE status END WHERE id = ?", [ref.id]);
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', ?, ?, UTC_TIMESTAMP(3))", [leadId,ref.id,user.id,outcome,`${label}${visitAt ? `: ${read('visitAt')} IST` : ''}. ${note}`]);
      }
      if (["proceed","application","documents","payment"].includes(outcome)) {
        await connection.execute("INSERT INTO lead_activities (lead_id, referral_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, ?, 'referral_update', 'parent_selected', ?, UTC_TIMESTAMP(3))", [leadId,ref.id,user.id,note]);
        if (outcome === "application") await connection.execute("UPDATE referrals SET status = 'application_started' WHERE id = ?", [ref.id]);
      }
      if (outcome === "confirmed") {
        await connection.execute("INSERT INTO admission_conversions (lead_id, referral_id, student_name, class_sought, admission_session, admission_date, confirmed_by) VALUES (?, ?, ?, ?, ?, ?, ?)", [leadId,ref.id,student,classSought,session,admissionDate,user.id]);
        await connection.execute("UPDATE referrals SET status = 'admitted', admitted_at = ? WHERE id = ?", [`${admissionDate} 00:00:00`,ref.id]);
        await connection.execute("UPDATE leads SET student_name = ?, class_sought = ? WHERE id = ?", [student,classSought,leadId]);
      }
    }
    if (outcome === "school_contacted") {
      for (const ref of refs) await connection.execute("UPDATE referrals SET status = CASE WHEN status = 'sent_to_school' THEN 'school_responded' ELSE status END, school_contact_outcome='parent_contacted', school_response = ? WHERE id = ?", [note,ref.id]);
    }
    if (outcome === "reconsidering") await connection.execute("UPDATE referrals SET status = CASE WHEN status IN ('application_started','applied') THEN 'school_responded' ELSE status END WHERE lead_id = ?", [leadId]);
    const stage = heading === "dead" ? "lost" : outcome === "confirmed" ? "admitted" : ["proceed","application","documents","payment"].includes(outcome) ? "application_in_progress" : ["budget","considering","next_session"].includes(outcome) ? "on_hold" : heading === "unanswered" ? (lead.status === "new" ? "attempting_contact" : lead.status) : outcome === "reconsidering" ? "exploring_options" : lead.status === "application_in_progress" ? lead.status : outcome === "discussing" ? "qualified" : outcome === "callback" && currentStage === "requirements" ? "connected" : "exploring_options";
    await connection.execute("UPDATE leads SET status = ? WHERE id = ?", [stage,leadId]);
    if (outcome === "discussing") await connection.execute("UPDATE leads SET preferred_location = ?, class_sought = ?, budget_min_inr = ?, budget_max_inr = ?, admission_year = ?, school_type = ?, board_preference = ? WHERE id = ?", [read("location")||null,read("requirementsClass")||null,budgetMin,budgetMax,year,read("schoolType"),read("board")||null,leadId]);
    if (outcome === "next_session") await connection.execute("UPDATE leads SET admission_year = ? WHERE id = ?", [targetYear,leadId]);
    await connection.execute("INSERT INTO lead_activities (lead_id, actor_id, activity_type, outcome, note, occurred_at) VALUES (?, ?, 'call', ?, ?, UTC_TIMESTAMP(3))", [leadId,user.id,label,`${label}${requestCalls ? " — school calls requested" : ""}. Schools: ${refs.map(ref=>ref.name).join(', ') || 'None'}. ${outcome === 'next_session' ? `Target session: ${targetYear}. ` : ''}${note}`]);
    await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE lead_id = ? AND referral_id IS NULL AND completed_at IS NULL", [label,leadId]);
    if (terminal) {
      await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE lead_id = ? AND completed_at IS NULL", [label,leadId]);
      await connection.execute("UPDATE school_visits SET status = 'cancelled', feedback = ? WHERE lead_id = ? AND status = 'scheduled'", [label,leadId]);
      await connection.execute("UPDATE referrals SET status = 'not_proceeding', closed_reason = ? WHERE lead_id = ? AND status NOT IN ('admitted','not_proceeding')", [heading === "dead" ? label : "Admission confirmed at another school",leadId]);
    } else {
      // Finish parent callbacks tied to prior chosen schools; school contact tasks stay open.
      await connection.execute("UPDATE tasks SET completed_at = UTC_TIMESTAMP(3), outcome = ? WHERE lead_id = ? AND task_type = 'call_parent' AND completed_at IS NULL", [label,leadId]);
      await connection.execute("INSERT INTO tasks (lead_id, referral_id, owner_id, title, task_type, due_at) VALUES (?, ?, ?, ?, 'call_parent', ?)", [leadId,singleSchool.includes(outcome) ? refs[0].id : null,lead.owner_id ?? user.id,({ transferred: "Call parent to discuss shared schools", school_contacted: "Discuss school response with parent", comparing: "Confirm the parent’s preferred school", visit_scheduled: "Confirm school visit and collect feedback", visit_rescheduled: "Confirm rescheduled school visit", visit_completed: "Discuss visit feedback and admission decision", proceed: "Follow up on chosen school admission", application: "Check application progress", documents: "Follow up on pending documents", payment: "Follow up on pending admission payment", callback: "Call parent at requested time", next_session: "Reconnect for the next admission session", no_answer: "Retry unanswered parent call", busy: "Retry parent call", unreachable: "Retry unreachable parent number" } as Record<string,string>)[outcome] ?? (requestCalls ? "Confirm school calls and collect parent feedback" : `Follow up with parent: ${label}`),sqlDate(due!)]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  revalidatePath("/leads", "layout"); revalidatePath("/dashboard"); revalidatePath("/visits"); revalidatePath("/conversions");
  redirect(`/leads/${leadId}?decisionSaved=1&tab=follow-up`);
}
