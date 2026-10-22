import Link from 'next/link';
import type {RowDataPacket} from 'mysql2';
import {db} from '@/lib/db';
import {getRequestedSchool,requestedSchoolReady} from '@/lib/requested-school';
import RequestedSchoolForm from './requested-school-form';
export default async function RequestedSchoolSection({leadId,active,staff,canManage,userId}:{leadId:number;active:boolean;staff:{id:number;name:string}[];canManage:boolean;userId:number}){
 const request=await getRequestedSchool(db,leadId);const ready=requestedSchoolReady(request);
 const[options]=active?await db.query<RowDataPacket[]>(`SELECT CONCAT('partner:',id) AS value,CONCAT(name,' — ',COALESCE(city,'Location missing'),' (school record)') AS label FROM partner_schools WHERE school_type IN ('boarding','both')
 UNION ALL SELECT CONCAT('owner:',sp.lead_id),CONCAT(sp.school_name,' — ',COALESCE(sp.city,'Location missing'),' (collaboration enquiry)') FROM school_partnerships sp WHERE sp.school_type IN ('boarding','both') AND sp.school_name IS NOT NULL ORDER BY label`):[[]];
 const deadline=request?.admission_deadline?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date(request.admission_deadline)):'';
 return <section className="mt-4 rounded-xl border border-amber-200 bg-white p-5">
 <h2 className="text-sm font-semibold text-slate-900">Requested boarding school</h2>
 {request?<><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{request.school_name}<span className="block text-xs font-normal text-slate-500">{request.city}, {request.state}</span></p><span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready?'bg-green-50 text-green-800':'bg-amber-50 text-amber-900'}`}>{ready?'Collaboration verified — ready for parent follow-up':request.partnership_stage==='closed'?'Collaboration declined — discuss with parent':'Awaiting verified signed MOU'}</span></div>
 <p className="mt-3 text-sm">{request.exclusive_only?'Specific school only — no alternatives':'Alternatives acceptable'}{deadline?` · Admission deadline: ${deadline}`:''}</p>
 <p className="mt-2 text-xs text-slate-600">Partnership counsellor: {request.school_counsellor||'Unassigned'} · {ready?'Confirm parent interest, then arrange the school call. Sharing must be recorded separately.':'Keep the parent updated while the school team follows up. The parent lead stays open.'}</p>
 {request.school_owner_lead_id&&(canManage||Number(request.school_owner_id)===userId)?<Link href={`/school-owners/${request.school_owner_lead_id}`} className="mt-2 inline-block text-xs font-medium text-blue-700">Open linked school collaboration →</Link>:null}
 </>:<p className="mt-2 text-sm text-slate-500">Use this when a parent asks for a named boarding school, including a school without a signed MOU.</p>}
 {active&&<details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-blue-700">{request?'Change school preference':'Record a requested school'}</summary><RequestedSchoolForm leadId={leadId} staff={staff} options={options.map(o=>({value:String(o.value),label:String(o.label)}))} current={request?{revision:request.revision,school_name:request.school_name,city:request.city,state:request.state,exclusive_only:request.exclusive_only,admission_deadline:deadline,preference_note:request.preference_note,selection:request.existing_partner_school_id?`partner:${request.existing_partner_school_id}`:request.school_owner_lead_id?`owner:${request.school_owner_lead_id}`:'new'}:null}/></details>}
 </section>;
}
