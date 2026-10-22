import 'server-only';
import {createHash} from 'node:crypto';
import type {Pool,PoolConnection} from 'mysql2/promise';
import type {RowDataPacket} from 'mysql2';
export interface RequestedSchool extends RowDataPacket {
 lead_id:number;target_id:number;exclusive_only:number;revision:number;school_name:string;city:string;state:string;
 admission_deadline:Date|null;preference_note:string|null;school_owner_lead_id:number|null;existing_partner_school_id:number|null;
 partnership_stage:string|null;approved_school_id:number|null;partner_active:number|null;school_type:string|null;verified_at:Date|null;
 school_counsellor:string|null;school_owner_id:number|null;
}
export const requestedSchoolJoin = `FROM boarding_school_requests br JOIN boarding_school_targets bt ON bt.id=br.target_id
 LEFT JOIN school_partnerships sp ON sp.lead_id=bt.school_owner_lead_id
 LEFT JOIN partner_schools ps ON ps.id=sp.partner_school_id
 LEFT JOIN leads sl ON sl.id=bt.school_owner_lead_id LEFT JOIN crm_users su ON su.id=sl.owner_id`;
export async function getRequestedSchool(connection:Pool|PoolConnection,leadId:number){
 const[rows]=await connection.execute<RequestedSchool[]>(`SELECT br.*,bt.school_name,bt.city,bt.state,bt.school_owner_lead_id,bt.existing_partner_school_id,
 sp.stage AS partnership_stage,sp.partner_school_id AS approved_school_id,sp.verified_at,ps.is_active AS partner_active,ps.school_type,
 su.name AS school_counsellor,sl.owner_id AS school_owner_id ${requestedSchoolJoin} WHERE br.lead_id=?`,[leadId]);
 return rows[0]??null;
}
export function requestedSchoolReady(request:RequestedSchool|null){return Boolean(request&&request.partnership_stage==='confirmed'&&request.verified_at&&request.approved_school_id&&request.partner_active&&['boarding','both'].includes(request.school_type??''));}
export function requestedSchoolIdentity(name:string,city:string,state:string){return createHash('sha256').update([name,city,state].map(value=>value.trim().replace(/\s+/g,' ').toLowerCase()).join('\n')).digest('hex');}
export class SchoolPreferenceError extends Error{}
export async function assertRequestedSchoolSelection(connection:Pool|PoolConnection,leadId:number,schoolIds:number[]){
 if(!schoolIds.length)return;
 const[parents]=await connection.execute<RowDataPacket[]>('SELECT enquiry_category FROM leads WHERE id=?',[leadId]);
 if(parents[0]?.enquiry_category==='day_parent'){
  const unique=[...new Set(schoolIds)];
  const[eligible]=await connection.execute<RowDataPacket[]>(`SELECT id FROM partner_schools WHERE id IN (${unique.map(()=>'?').join(',')}) AND is_active=1 AND school_type IN ('day','both') AND day_parent_delhi_ncr=1 ORDER BY id FOR UPDATE`,unique);
  if(eligible.length!==unique.length)throw new SchoolPreferenceError('Day-school parent leads can only use active day/both schools verified by a manager for Delhi NCR.');
 }

 const request=await getRequestedSchool(connection,leadId);if(!request)return;
 const ready=requestedSchoolReady(request),approved=Number(request.approved_school_id);
 if(request.exclusive_only&&(!ready||schoolIds.some(id=>id!==approved)))throw new SchoolPreferenceError('Specific school only — no alternatives. Wait for verified collaboration and select only the requested school.');
 if(!ready&&request.existing_partner_school_id&&schoolIds.includes(Number(request.existing_partner_school_id)))throw new SchoolPreferenceError('The requested school’s signed MOU is not verified. Do not share parent details with it yet.');
}
export function visibleRequestedSchools<T extends {id:number}>(schools:T[],request:RequestedSchool|null):T[]{
 if(!request)return schools;
 if(request.exclusive_only)return requestedSchoolReady(request)?schools.filter(s=>Number(s.id)===Number(request.approved_school_id)):[];
 return requestedSchoolReady(request)?schools:schools.filter(s=>Number(s.id)!==Number(request.existing_partner_school_id));
}
