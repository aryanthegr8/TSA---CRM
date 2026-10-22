"use server";
import {defaultSchoolWhatsappRecipient} from "@/lib/school-whatsapp";
import {redirect,notFound} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import type {RowDataPacket,ResultSetHeader} from 'mysql2';
import {db} from '@/lib/db';
import {getCurrentUser} from '@/lib/current-user';
import {lockSchoolLead,validDate,futureIndiaTime} from '@/lib/school-partnership-server';
import {partnershipStages,partnershipNextAction,allowedPartnershipOutcomes,partnershipOutcomes,type PartnershipStage} from '@/lib/school-partnership';
const refresh=(id:number)=>{revalidatePath(`/leads/${id}`);revalidatePath('/leads','layout');revalidatePath('/dashboard');revalidatePath('/partner-schools');};
export async function savePartnership(id:number,_previous:{message:string},form:FormData){
 const user=await getCurrentUser();if(!user)redirect('/login');if(!Number.isSafeInteger(id)||id<=0)notFound();
 const read=(key:string)=>String(form.get(key)??'').trim();const operation=read('operation');
 if(!['details','followup','terms','verify','reject'].includes(operation))return{message:'Invalid action.'};
 let feedback="Saved. School partnership record updated.";
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();const{lead,record}=await lockSchoolLead(connection,id,user);
  if(read('revision')===''||Number(read('revision'))!==record.revision){await connection.rollback();return{message:'This record changed. Refresh before saving.'};}
  if(['confirmed','closed'].includes(record.stage)){await connection.rollback();return{message:'This acquisition is already completed or closed.'};}
  let description='';
  if(operation==='details'){
   const phone=read('phone').replace(/[\s()-]/g,'');const website=read('website');let validWebsite=true;if(website){try{const url=new URL(website);validWebsite=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{validWebsite=false;}}
   if(!read('schoolName')||read('schoolName').length>255||!['day','boarding','both'].includes(read('type'))||read('city').length>120||read('state').length>120||website.length>1024||!validWebsite||!read('contact')||read('contact').length>160||read('designation').length>120||!/^\+[1-9]\d{7,14}$/.test(phone)||(read('email')&&(!/^\S+@\S+\.\S+$/.test(read('email'))||read('email').length>255))){await connection.rollback();return{message:'Check school name, contact, phone with country code, website and field lengths.'};}
   await connection.execute('UPDATE school_partnerships SET school_name=?,school_type=?,city=?,state=?,website=?,contact_name=?,designation=?,contact_phone=?,contact_email=? WHERE lead_id=?',[read('schoolName'),read('type'),read('city')||null,read('state')||null,website||null,read('contact'),read('designation')||null,phone,read('email')||null,id]);description='School and decision-maker details updated';
  }else if(operation==='followup'){
   const outcome=read('outcome');const config=Object.hasOwn(partnershipOutcomes,outcome)?partnershipOutcomes[outcome]:null;const method=read('method');const note=read('note');
   if(!config||!allowedPartnershipOutcomes(record.stage as PartnershipStage).includes(outcome)||!['call','whatsapp','email','note'].includes(method)||!note||note.length>2000){await connection.rollback();return{message:'Choose an available outcome and enter conversation notes.'};}
   if(outcome==='terms_accepted'&&(!record.agreed_type||!record.agreed_rate||!record.effective_date)){await connection.rollback();return{message:'Save the agreed commission and effective date in Commission & MOU first.'};}
   const due=config.close?null:futureIndiaTime(read('followUp'));if(!config.close&&!due){await connection.rollback();return{message:'Choose a future follow-up in India time.'};}
   if(read('nextAction').length>255){await connection.rollback();return{message:'Next action must be within 255 characters.'};}
   const nextStage=config.stage??record.stage;
   feedback=config.close?'Saved. Enquiry closed; pending follow-ups stopped.':nextStage!==record.stage?`Saved. Stage changed: ${partnershipStages[record.stage as PartnershipStage]} → ${partnershipStages[nextStage as PartnershipStage]}.${outcome==='terms_accepted'?' Signed-MOU upload is now available in Commission & MOU.':''}`:`Saved. ${config.label}. Stage remains ${partnershipStages[record.stage as PartnershipStage]}.${config.hold?' Enquiry is on hold.':''} Next follow-up scheduled.`;
   await connection.execute('UPDATE school_partnerships SET stage=?,last_outcome=?,close_reason=? WHERE lead_id=?',[nextStage,config.label,config.close?note.slice(0,255):null,id]);
   if(outcome==='mou_changes')await connection.execute('UPDATE school_partnerships SET active_mou_id=NULL,signed_date=NULL WHERE lead_id=?',[id]);
   await connection.execute('UPDATE leads SET status=? WHERE id=?',[config.close?'lost':config.hold?'on_hold':nextStage==='new'?'attempting_contact':nextStage==='discussion'?'connected':'qualified',id]);
   await connection.execute('UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome=? WHERE lead_id=? AND completed_at IS NULL',[config.label,id]);
   if(due)await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,?,'contact_school',?)",[id,lead.owner_id??user.id,read('nextAction')||partnershipNextAction(outcome),due]);
   await connection.execute('INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))',[id,user.id,method,config.label,note]);description='';
  }else if(operation==='terms'){
   const validRate=(prefix:string)=>{const type=read(`${prefix}Type`),raw=read(`${prefix}Rate`),rate=Number(raw);return type===''&&raw===''||['fixed','percentage'].includes(type)&&/^\d{1,10}(\.\d{1,2})?$/.test(raw)&&rate>0&&(type!=='percentage'||rate<=100&&!!read(`${prefix}Basis`));};
   if(!validRate('proposed')||!validRate('agreed')||['proposedBasis','agreedBasis'].some(key=>read(key).length>255)||read('termsNote').length>5000||(read('effectiveDate')&&!validDate(read('effectiveDate')))||(read('agreedType')&&!read('effectiveDate'))){await connection.rollback();return{message:'Enter valid positive commission rates, percentage basis and an effective date for agreed terms.'};}
   if(['mou','verification'].includes(record.stage)){await connection.rollback();return{message:'Commercial terms are locked once accepted. Record requested changes first.'};}
   await connection.execute('UPDATE school_partnerships SET proposed_type=?,proposed_rate=?,proposed_basis=?,agreed_type=?,agreed_rate=?,agreed_basis=?,terms_note=?,effective_date=? WHERE lead_id=?',[read('proposedType')||null,read('proposedRate')||null,read('proposedBasis')||null,read('agreedType')||null,read('agreedRate')||null,read('agreedBasis')||null,read('termsNote')||null,read('effectiveDate')||null,id]);feedback='Saved. Commission figures recorded; this does not advance the stage. In Follow-up, record Commission terms accepted when the school has agreed.';description=`Commission terms saved. Previous agreed terms: ${record.agreed_type||'none'} ${record.agreed_rate||''} ${record.agreed_basis||''}. Proposed: ${read('proposedType')} ${read('proposedRate')} ${read('proposedBasis')}. Agreed: ${read('agreedType')} ${read('agreedRate')} ${read('agreedBasis')}. Effective ${read('effectiveDate')}. ${read('termsNote')}`;
  }else{
   if(!['admin','manager'].includes(user.role)){await connection.rollback();return{message:'Only admins and managers can verify or return an MOU.'};}
   if(record.stage!=='verification'||!record.active_mou_id){await connection.rollback();return{message:'Upload a signed MOU for verification first.'};}
   if(operation==='reject'){
    if(!read('note')||read('note').length>2000){await connection.rollback();return{message:'Enter the correction required.'};}
    const correctionDue=futureIndiaTime(read('followUp'));if(!correctionDue){await connection.rollback();return{message:'Set a future follow-up for the MOU correction.'};}
    await connection.execute("UPDATE school_partnerships SET stage='mou',active_mou_id=NULL,signed_date=NULL,last_outcome='MOU correction required' WHERE lead_id=?",[id]);
    await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome='MOU returned for correction' WHERE lead_id=? AND completed_at IS NULL",[id]);
    await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,'Obtain corrected signed MOU','contact_school',?)",[id,lead.owner_id??user.id,correctionDue]);feedback='Saved. MOU returned for correction. Stage: MOU pending; correction follow-up scheduled.';description=`MOU returned: ${read('note')}`;
   }else{
    if(form.get('confirmReview')!=='yes'){await connection.rollback();return{message:'Confirm that you reviewed the signed MOU and agreed terms.'};}
    const [documents]=await connection.execute<RowDataPacket[]>('SELECT id FROM school_mou_documents WHERE id=? AND lead_id=?',[record.active_mou_id,id]);
    if(!documents.length||!record.school_name||!record.city||!record.state||!record.contact_name||!record.contact_phone||!record.agreed_type||!record.agreed_rate||!record.effective_date||!record.signed_date){await connection.rollback();return{message:'Complete school/location/contact details, agreed commission, effective date and signed MOU before approval.'};}
    let schoolId=Number(form.get('partnerSchoolId'));const createNew=read('createNew')==='yes';
    if(createNew){
     const [duplicates]=await connection.execute<RowDataPacket[]>('SELECT id FROM partner_schools WHERE name=? AND city <=> ? AND state <=> ? FOR UPDATE',[record.school_name,record.city,record.state]);
     if(duplicates.length){await connection.rollback();return{message:'This school already exists. Select its existing partner-school record.'};}
      const [result]=await connection.execute<ResultSetHeader>('INSERT INTO partner_schools (name,school_type,city,state,is_active,whatsapp_recipient) VALUES (?,?,?,?,1,?)',[record.school_name,record.school_type,record.city,record.state,defaultSchoolWhatsappRecipient(record.school_name)]);schoolId=result.insertId;
    }else{
     if(!Number.isSafeInteger(schoolId)||schoolId<=0){await connection.rollback();return{message:'Choose an existing partner school or create a new one.'};}
     const [schools]=await connection.execute<RowDataPacket[]>('SELECT id, name, city, state, is_active FROM partner_schools WHERE id=? FOR UPDATE',[schoolId]);
     if(!schools.length||!schools[0].is_active){await connection.rollback();return{message:'Select an active partner school. Restore an archived school before linking.'};}
     if(form.get('confirmLink')!=='yes'){await connection.rollback();return{message:'Confirm that the selected partner-school record is this same school.'};}
    }
    const [linked]=await connection.execute<RowDataPacket[]>('SELECT lead_id FROM school_partnerships WHERE partner_school_id=? AND lead_id<>? AND stage=\'confirmed\' FOR UPDATE',[schoolId,id]);
    if(linked.length){await connection.rollback();return{message:'This school already has a confirmed collaboration. Review the existing agreement before creating another.'};}
    const [contacts]=await connection.execute<RowDataPacket[]>('SELECT id FROM school_contacts WHERE partner_school_id=? AND phone=?',[schoolId,record.contact_phone]);
    if(!contacts.length)await connection.execute('INSERT INTO school_contacts (partner_school_id,name,position_title,phone,email,is_primary) VALUES (?,?,?,?,?,0)',[schoolId,record.contact_name,record.designation,record.contact_phone,record.contact_email]);
    await connection.execute("UPDATE school_partnerships SET stage='confirmed',partner_school_id=?,verified_by=?,verified_at=UTC_TIMESTAMP(3),last_outcome='Collaboration confirmed' WHERE lead_id=?",[schoolId,user.id,id]);
    await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome='School collaboration confirmed' WHERE lead_id=? AND completed_at IS NULL",[id]);feedback='Saved. Signed MOU verified. Collaboration confirmed and acquisition follow-ups closed.';description=`Signed MOU verified. Collaboration confirmed; partner school ID ${schoolId}.`;
   }
  }
  if(description)await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,'note',?,?,UTC_TIMESTAMP(3))",[id,user.id,operation==='terms'?'Commission terms updated':operation==='details'?'School details updated':operation==='verify'?'Collaboration confirmed':'MOU correction required',description]);
  await connection.execute('UPDATE school_partnerships SET revision=revision+1 WHERE lead_id=?',[id]);await connection.commit();
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 refresh(id);return{message:feedback};
}
