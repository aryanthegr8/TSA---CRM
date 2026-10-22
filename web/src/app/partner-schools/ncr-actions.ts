'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import type {RowDataPacket} from 'mysql2';
import {db} from '@/lib/db';
import {getCurrentUser} from '@/lib/current-user';
export async function setNcrEligibility(_previous:{message:string;ok:boolean},form:FormData){
 const user=await getCurrentUser();if(!user)redirect('/login');
 if(!['admin','manager'].includes(user.role))return{message:'Only managers and admins can verify school eligibility.',ok:false};
 const raw=form.getAll('schoolId'),ids=[...new Set(raw.map(Number))].sort((a,b)=>a-b);const approved=form.get('approved');
 if(!ids.length||raw.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||!['yes','no'].includes(String(approved))||form.get('confirmScope')!=='yes')return{message:'Select 1–200 schools, choose eligibility and confirm your review.',ok:false};
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const[schools]=await connection.execute<RowDataPacket[]>(`SELECT id,school_type,city FROM partner_schools WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,ids);
  if(schools.length!==ids.length||approved==='yes'&&schools.some(s=>!['day','both'].includes(s.school_type)||!s.city?.trim())){await connection.rollback();return{message:'To approve, every selected school must be day/both and have a recorded city. Fix the school details first.',ok:false};}
  await connection.execute(`UPDATE partner_schools SET day_parent_delhi_ncr=? WHERE id IN (${ids.map(()=>'?').join(',')})`,[approved==='yes'?1:0,...ids]);
  await connection.commit();
 }catch{await connection.rollback();return{message:'Eligibility could not be saved. No changes were committed.',ok:false};}finally{connection.release();}
 revalidatePath('/partner-schools');revalidatePath('/leads','layout');revalidatePath('/follow-ups');
 return{message:`${ids.length} school record${ids.length===1?'':'s'} updated. Day-parent selection uses this eligibility immediately.`,ok:true};
}
