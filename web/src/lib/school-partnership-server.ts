import 'server-only';
import type {PoolConnection} from 'mysql2/promise';
import type {RowDataPacket} from 'mysql2';
import {notFound} from 'next/navigation';
import {getCurrentUser} from '@/lib/current-user';
export async function lockSchoolLead(connection:PoolConnection,id:number,user:NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>){
 const [leads]=await connection.execute<RowDataPacket[]>("SELECT l.*,f.parent_name,f.primary_phone,f.email FROM leads l JOIN families f ON f.id=l.family_id WHERE l.id=? FOR UPDATE",[id]);
 const lead=leads[0];if(!lead||lead.enquiry_category!=='school_owner'||user.role==='counsellor'&&Number(lead.owner_id)!==user.id)notFound();
 await connection.execute("INSERT IGNORE INTO school_partnerships (lead_id,contact_name,contact_phone,contact_email,stage) VALUES (?,?,?,?,?)",[id,lead.parent_name,lead.primary_phone,lead.email,lead.status==='lost'?'closed':'new']);
 const [records]=await connection.execute<RowDataPacket[]>('SELECT * FROM school_partnerships WHERE lead_id=? FOR UPDATE',[id]);
 return{lead,record:records[0]};
}
export function validDate(input:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;const date=new Date(`${input}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===input;}
export function futureIndiaTime(input:string){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))return null;const d=new Date(`${input}:00+05:30`);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(' ','T')!==input)return null;return d.toISOString().slice(0,23).replace('T',' ');}
