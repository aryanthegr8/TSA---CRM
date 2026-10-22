"use server";
import {redirect,notFound} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import type {RowDataPacket,ResultSetHeader} from 'mysql2';
import {db} from '@/lib/db';
import {getCurrentUser} from '@/lib/current-user';
import {requestedSchoolIdentity,getRequestedSchool,requestedSchoolReady} from '@/lib/requested-school';
import {futureIndiaTime,validDate} from '@/lib/school-partnership-server';
export async function saveRequestedSchool(leadId:number,_previous:{message:string},form:FormData){
 const user=await getCurrentUser();if(!user)redirect('/login');if(!Number.isSafeInteger(leadId)||leadId<=0)notFound();
 const read=(key:string)=>String(form.get(key)??'').trim();const due=futureIndiaTime(read('followUp'));const note=read('note');
 if(!due||!note||note.length>2000)return{message:'Record the parent’s preference and a future parent update.'};
 const remove=read('operation')==='clear';const exclusive=read('exclusive')==='yes';
 const deadline=read('deadline');const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date());
 if(deadline&&(!validDate(deadline)||deadline<today))return{message:'Use a valid admission deadline from today onward.'};
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const[leads]=await connection.execute<RowDataPacket[]>('SELECT * FROM leads WHERE id=? FOR UPDATE',[leadId]);const lead=leads[0];
  if(!lead||lead.enquiry_category!=='boarding_parent'||user.role==='counsellor'&&Number(lead.owner_id)!==user.id)notFound();
  if(['lost','admitted'].includes(lead.status)){await connection.rollback();return{message:'This parent lead is closed.'};}
  const[currentRows]=await connection.execute<RowDataPacket[]>('SELECT revision,target_id,exclusive_only FROM boarding_school_requests WHERE lead_id=? FOR UPDATE',[leadId]);
  if(read('revision')===''||Number(read('revision'))!==(currentRows[0]?.revision??0)){await connection.rollback();return{message:'Preference changed. Refresh before saving.'};}
  if(remove){
   await connection.execute('DELETE FROM boarding_school_requests WHERE lead_id=?',[leadId]);
   if(lead.status==='on_hold')await connection.execute("UPDATE leads SET status='qualified' WHERE id=?",[leadId]);
   await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,'note','Specific school preference removed',?,UTC_TIMESTAMP(3))",[leadId,user.id,note]);
  }else{
   let name=read('name'),city=read('city'),state=read('state');let ownerLeadId:number|null=null,partnerId:number|null=null;
   const selection=read('selection');
   if(selection.startsWith('partner:')){
    partnerId=Number(selection.slice(8));if(!Number.isSafeInteger(partnerId)||partnerId<=0)notFound();
    const[schools]=await connection.execute<RowDataPacket[]>("SELECT * FROM partner_schools WHERE id=? AND school_type IN ('boarding','both') FOR UPDATE",[partnerId]);const school=schools[0];if(!school)notFound();
    name=school.name;city=school.city||city;state=school.state||state;
    const[profiles]=await connection.execute<RowDataPacket[]>('SELECT lead_id FROM school_partnerships WHERE partner_school_id=?',[partnerId]);ownerLeadId=profiles[0]?.lead_id??null;
   }else if(selection.startsWith('owner:')){
    ownerLeadId=Number(selection.slice(6));if(!Number.isSafeInteger(ownerLeadId)||ownerLeadId<=0)notFound();
    const[profiles]=await connection.execute<RowDataPacket[]>("SELECT sp.* FROM school_partnerships sp JOIN leads l ON l.id=sp.lead_id WHERE sp.lead_id=? AND l.enquiry_category='school_owner' AND sp.school_type IN ('boarding','both')",[ownerLeadId]);const profile=profiles[0];if(!profile)notFound();
    name=profile.school_name||name;city=profile.city||city;state=profile.state||state;partnerId=profile.partner_school_id??null;
   }else if(selection!=='new'){await connection.rollback();return{message:'Select a school or enter a new requested school.'};}
   if(!name||name.length>255||!city||city.length>120||!state||state.length>120){await connection.rollback();return{message:'Confirm the requested boarding school name, city and state.'};}
   if(!partnerId){
    const[matches]=await connection.execute<RowDataPacket[]>("SELECT id FROM partner_schools WHERE name=? AND city=? AND state=? AND school_type IN ('boarding','both')",[name,city,state]);
    if(matches.length>1){await connection.rollback();return{message:'Several matching school records exist. Select the exact existing school.'};}partnerId=matches[0]?.id??null;
   }
   if(!ownerLeadId){
    const[matches]=await connection.execute<RowDataPacket[]>("SELECT lead_id FROM school_partnerships WHERE school_type IN ('boarding','both') AND ((partner_school_id=? AND ? IS NOT NULL) OR (school_name=? AND city=? AND state=?))",[partnerId,partnerId,name,city,state]);
    if(matches.length>1){await connection.rollback();return{message:'Several partnership enquiries match. Select the correct existing enquiry.'};}ownerLeadId=matches[0]?.lead_id??null;
   }
   const key=requestedSchoolIdentity(name,city,state);
   await connection.execute('INSERT IGNORE INTO boarding_school_targets (identity_key,school_name,city,state,school_owner_lead_id,existing_partner_school_id) VALUES (?,?,?,?,?,?)',[key,name,city,state,ownerLeadId,partnerId]);
   const[targets]=await connection.execute<RowDataPacket[]>('SELECT * FROM boarding_school_targets WHERE identity_key=? OR (school_owner_lead_id=? AND ? IS NOT NULL) OR (existing_partner_school_id=? AND ? IS NOT NULL) FOR UPDATE',[key,ownerLeadId,ownerLeadId,partnerId,partnerId]);
   if(targets.length!==1){await connection.rollback();return{message:'Conflicting school identities found. Ask a manager to check the existing enquiries.'};}
   const target=targets[0];ownerLeadId=target.school_owner_lead_id??ownerLeadId;partnerId=target.existing_partner_school_id??partnerId;
   if(!ownerLeadId){
    const requestedOwner=Number(read('schoolOwner'));const preferredEmail=process.env.CRM_INTAKE_OWNER_EMAIL?.trim().toLowerCase();
    const[staff]=user.role!=='counsellor'&&Number.isSafeInteger(requestedOwner)&&requestedOwner>0?await connection.execute<RowDataPacket[]>('SELECT id FROM crm_users WHERE id=? AND is_active=1',[requestedOwner]):preferredEmail?await connection.execute<RowDataPacket[]>('SELECT id FROM crm_users WHERE email=? AND is_active=1',[preferredEmail]):await connection.execute<RowDataPacket[]>("SELECT id FROM crm_users WHERE is_active=1 AND role IN ('admin','manager') ORDER BY role='admin' DESC,id LIMIT 1");
    if(!staff.length){await connection.rollback();return{message:'No active partnership intake owner found. Ask a manager to configure an owner.'};}
    // Unknown school phones stay empty, never copied from the parent.
    const[family]=await connection.execute<ResultSetHeader>("INSERT INTO families (parent_name,primary_phone) VALUES ('School decision-maker to identify','')");
    const[created]=await connection.execute<ResultSetHeader>("INSERT INTO leads (family_id,school_type,preferred_location,source,source_detail,enquiry_category,owner_id,priority,received_at) VALUES (?,'boarding',?,'referral','Requested boarding school collaboration','school_owner',?,'high',UTC_TIMESTAMP(3))",[family.insertId,`${city}, ${state}`,staff[0].id]);ownerLeadId=created.insertId;
    await connection.execute("INSERT INTO school_partnerships (lead_id,school_name,school_type,city,state) VALUES (?,?,'boarding',?,?)",[ownerLeadId,name,city,state]);
    await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,'Research school contact and obtain signed MOU','contact_school',?)",[ownerLeadId,staff[0].id,due]);
    await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,'system','Boarding school collaboration requested','Created from an admission-team school preference. No parent contact details shared.',UTC_TIMESTAMP(3))",[ownerLeadId,user.id]);
   }
   await connection.execute('UPDATE boarding_school_targets SET school_owner_lead_id=?,existing_partner_school_id=? WHERE id=?',[ownerLeadId,partnerId,target.id]);
   await connection.execute('INSERT INTO boarding_school_requests (lead_id,target_id,exclusive_only,admission_deadline,preference_note,created_by,revision) VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id),exclusive_only=VALUES(exclusive_only),admission_deadline=VALUES(admission_deadline),preference_note=VALUES(preference_note),revision=revision+1',[leadId,target.id,exclusive?1:0,deadline||null,note,user.id]);
   if(exclusive){
    if(form.get('confirmExclusive')!=='yes'){await connection.rollback();return{message:'Confirm that no alternatives may be shared and other active school options should stop.'};}
    const[otherRefs]=await connection.execute<RowDataPacket[]>("SELECT id FROM referrals WHERE lead_id=? AND status NOT IN ('admitted','not_proceeding') AND (? IS NULL OR partner_school_id<>?) FOR UPDATE",[leadId,partnerId,partnerId]);
    for(const ref of otherRefs){
     await connection.execute("UPDATE referrals SET status='not_proceeding',closed_reason='Parent requested a specific school only' WHERE id=?",[ref.id]);
     await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome='Parent requested a specific school only' WHERE referral_id=? AND completed_at IS NULL",[ref.id]);
     await connection.execute("UPDATE school_visits SET status='cancelled',feedback='Parent requested a specific school only' WHERE referral_id=? AND status='scheduled'",[ref.id]);
     await connection.execute("INSERT INTO lead_activities (lead_id,referral_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,?,'referral_update','not_proceeding','Parent requested a specific school only. Previous sharing history preserved.',UTC_TIMESTAMP(3))",[leadId,ref.id,user.id]);
    }
   }
   await connection.execute("UPDATE leads SET school_type='boarding' WHERE id=?",[leadId]);
   const saved=await getRequestedSchool(connection,leadId);
   if(exclusive&&!requestedSchoolReady(saved))await connection.execute("UPDATE leads SET status='on_hold' WHERE id=?",[leadId]);
   else if(exclusive&&(Number(currentRows[0]?.target_id)!==Number(target.id)||!currentRows[0]?.exclusive_only))await connection.execute("UPDATE leads SET status='qualified' WHERE id=?",[leadId]);
   await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,'note',?,?,UTC_TIMESTAMP(3))",[leadId,user.id,exclusive?'Specific school only — no alternatives':'Requested school — alternatives acceptable',`${name}, ${city}, ${state}. Linked school enquiry #${ownerLeadId}. ${deadline?`Deadline ${deadline}. `:''}${note}`]);
  }
  await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome='School preference updated' WHERE lead_id=? AND completed_at IS NULL AND task_type='call_parent'",[leadId]);
  await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,?,'call_parent',?)",[leadId,lead.owner_id??user.id,remove?'Follow up on parent’s school options':'Update parent on requested school partnership',due]);
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 revalidatePath('/leads','layout');revalidatePath('/dashboard');redirect(`/leads/${leadId}?decisionSaved=1&tab=follow-up`);
}
