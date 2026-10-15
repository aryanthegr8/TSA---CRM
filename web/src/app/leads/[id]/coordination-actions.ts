"use server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { schoolContactOutcomes, parentDecisions } from "@/lib/school-coordination";
export async function saveSchoolCoordination(leadId: number, _previous: {message:string}, form: FormData) {
 const user=await getCurrentUser();if(!user)redirect('/login');
 if(!Number.isSafeInteger(leadId)||leadId<=0)notFound();
 const read=(key:string)=>String(form.get(key)??'').trim();
 const method=read('method');
 if(!['call','note'].includes(method))return{message:'Choose parent call or school coordination update.'};
 const ids=[...new Set(form.getAll('referralId').map(Number))].sort((a,b)=>a-b);
 const note=read('note'),due=read('followUp');const date=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)?new Date(`${due}:00+05:30`):new Date(NaN);
 if(!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||!note||note.length>2000||Number.isNaN(date.getTime())||date.getTime()<=Date.now())return{message:'Enter notes and a future follow-up in India time.'};
 if(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(' ','T')!==due)return{message:'Enter a valid follow-up date.'};
 const dueUtc=date.toISOString().slice(0,23).replace('T',' ');
 const connection=await db.getConnection();
 try {
  await connection.beginTransaction();
  const [leads]=await connection.execute<RowDataPacket[]>("SELECT owner_id, status, enquiry_category, (SELECT COUNT(*) FROM lead_activities ca WHERE ca.lead_id=leads.id AND ca.activity_type='call') AS call_count FROM leads WHERE id = ? FOR UPDATE",[leadId]);
  const lead=leads[0];if(!lead||lead.enquiry_category==='school_owner'||user.role==='counsellor'&&Number(lead.owner_id)!==user.id)notFound();
  if(['lost','admitted'].includes(lead.status)||read('expectedCallCount')===''||Number(read('expectedCallCount'))!==Number(lead.call_count)){await connection.rollback();return{message:'This lead changed or closed. Refresh before saving.'};}
  let summary='';
  for(const id of ids){
   const [rows]=await connection.execute<RowDataPacket[]>("SELECT r.*, ps.name FROM referrals r JOIN partner_schools ps ON ps.id=r.partner_school_id WHERE r.id=? AND r.lead_id=? FOR UPDATE",[id,leadId]);
   const ref=rows[0];if(!ref||['not_proceeding','admitted'].includes(ref.status)){await connection.rollback();return{message:'A school option is closed or unavailable. Refresh.'};}
   const contact=read(`contact_${id}`),decision=read(`decision_${id}`),shared=form.get(`shared_${id}`)==='yes',recipient=read(`recipient_${id}`);
   if(!Object.hasOwn(schoolContactOutcomes,contact)||!Object.hasOwn(parentDecisions,decision)||recipient.length>255||(shared&&!ref.sent_at&&!recipient)){await connection.rollback();return{message:'Check school outcomes and enter recipients for newly shared leads.'};}
   if(contact!=='pending'&&!shared&&!ref.sent_at){await connection.rollback();return{message:'Confirm that the lead was shared before recording the school call outcome.'};}
   const hasChanged=(shared&&!ref.sent_at)||contact!==ref.school_contact_outcome||decision!==ref.parent_decision;
   if(!hasChanged)continue;
   summary+=`${ref.name}: ${schoolContactOutcomes[contact as keyof typeof schoolContactOutcomes]}; ${parentDecisions[decision as keyof typeof parentDecisions]}. `;
   if(shared&&!ref.sent_at)await connection.execute("UPDATE referrals SET sent_at=UTC_TIMESTAMP(3), sent_by_user_id=?, transfer_channel='whatsapp', transfer_recipient=?, status=CASE WHEN status IN ('shortlisted','shared_with_parent','parent_interested') THEN 'sent_to_school' ELSE status END WHERE id=?",[user.id,recipient,id]);
   await connection.execute("UPDATE referrals SET school_contact_outcome=?, parent_decision=?, school_response=CASE WHEN ?='parent_contacted' THEN ? ELSE school_response END, status=CASE WHEN ?='parent_contacted' AND status='sent_to_school' THEN 'school_responded' ELSE status END WHERE id=?",[contact,decision,contact,note,contact,id]);
   const closeSchool=decision==='not_interested'||['declined','seats_unavailable'].includes(contact);
   if(closeSchool){
    await connection.execute("UPDATE referrals SET status='not_proceeding', closed_reason=? WHERE id=?",[decision==='not_interested'?'Parent rejected this school':schoolContactOutcomes[contact as keyof typeof schoolContactOutcomes],id]);
    await connection.execute("UPDATE school_visits SET status='cancelled', feedback=? WHERE referral_id=? AND status='scheduled'",[note,id]);
   }
   await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3), outcome=? WHERE referral_id=? AND completed_at IS NULL AND (task_type='contact_school' OR ?=1)",[note,id,closeSchool?1:0]);
   if(!closeSchool&&['pending','unreachable'].includes(contact))await connection.execute("INSERT INTO tasks (lead_id,referral_id,owner_id,title,task_type,due_at) VALUES (?,?,?,'Confirm school call to parent','contact_school',?)",[leadId,id,lead.owner_id??user.id,dueUtc]);
   await connection.execute("INSERT INTO lead_activities (lead_id,referral_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,?,'referral_update','school_coordination',?,UTC_TIMESTAMP(3))",[leadId,id,user.id,`${shared&&!ref.sent_at?'Lead sharing confirmed. ':''}${schoolContactOutcomes[contact as keyof typeof schoolContactOutcomes]}. ${parentDecisions[decision as keyof typeof parentDecisions]}. ${note}`]);
  }
  // One conversation is one call record, regardless of the number of school rows.
  await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,?,'School coordination updated',?,UTC_TIMESTAMP(3))",[leadId,user.id,method,summary+note]);
  await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3), outcome=? WHERE lead_id=? AND completed_at IS NULL AND task_type='call_parent'",[note,leadId]);
  const nextAction=read('nextAction');
  const actions:Record<string,string>={school_calls:'Confirm school calls and collect parent feedback',parent_feedback:'Discuss school options with parent',visit:'Arrange requested school visit',admission:'Discuss admission readiness with parent'};
  if(!Object.hasOwn(actions,nextAction)){await connection.rollback();return{message:'Choose the next action.'};}
  await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,?,'call_parent',?)",[leadId,lead.owner_id??user.id,actions[nextAction],dueUtc]);
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 revalidatePath('/leads','layout');revalidatePath('/dashboard');revalidatePath('/visits');
 redirect(`/leads/${leadId}?decisionSaved=1&tab=follow-up`);
}
