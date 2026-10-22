// Shared definitions for the inbox and follow-up board. All displayed dates use India time.
export type SearchValues = Record<string,string|string[]|undefined>;
export const singleValue = (input:string|string[]|undefined) => typeof input==='string'?input:'';
export const activeLeadSql = "l.status NOT IN ('admitted','lost') AND COALESCE(sp.stage,'new') NOT IN ('confirmed','closed')";
// Intake creates first-contact tasks automatically. They do not mean the enquiry was worked.
export const incomingLeadSql = `${activeLeadSql} AND l.status='new' AND COALESCE(sp.stage,'new')='new'
 AND NOT EXISTS(SELECT 1 FROM lead_activities ia WHERE ia.lead_id=l.id AND
 (ia.activity_type IN ('call','whatsapp','email','referral_update','status_change') OR (ia.activity_type='note' AND NULLIF(ia.outcome,'') IS NOT NULL)))`;
export const openLeadTaskSql = `EXISTS(SELECT 1 FROM tasks ot LEFT JOIN referrals otr ON otr.id=ot.referral_id
 WHERE ot.lead_id=l.id AND ot.owner_id=l.owner_id AND ot.completed_at IS NULL AND (ot.referral_id IS NULL OR otr.status NOT IN ('not_proceeding','admitted')))`;
export const latestContactSql = `(SELECT ca.outcome FROM lead_activities ca WHERE ca.lead_id=l.id AND ca.activity_type IN ('call','whatsapp','email') ORDER BY ca.occurred_at DESC,ca.id DESC LIMIT 1)`;
export const sharedSchoolsSql = `(SELECT COUNT(*) FROM referrals sr WHERE sr.lead_id=l.id AND sr.sent_at IS NOT NULL AND sr.status<>'not_proceeding')`;
export const previousSharedSql = `(SELECT COUNT(*) FROM referrals sr WHERE sr.lead_id=l.id AND sr.sent_at IS NOT NULL)`;
export const indiaDateKey=(date:Date|string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export const indiaDateLabel=(date:Date|string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'short',year:'numeric'}).format(new Date(date));
export const indiaTime=(date:Date|string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}).format(new Date(date));
export function validDay(value:string){const parsed=new Date(`${value}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;}
export function dayBounds(day:string){
 if(!validDay(day))throw new Error('Invalid calendar day');
 const start=new Date(`${day}T00:00:00+05:30`);const end=new Date(start.getTime()+86400000);
 const sql=(d:Date)=>d.toISOString().slice(0,23).replace('T',' ');
 return {start:sql(start),end:sql(end)};
}
export const badgeTones={
 blue:'border-blue-200 bg-blue-50 text-blue-800',amber:'border-amber-200 bg-amber-50 text-amber-900',
 violet:'border-violet-200 bg-violet-50 text-violet-800',green:'border-emerald-200 bg-emerald-50 text-emerald-800',
 red:'border-rose-200 bg-rose-50 text-rose-800',slate:'border-slate-200 bg-slate-100 text-slate-700',
} as const;
export function contactBadge(outcome:string|null):{label:string;tone:keyof typeof badgeTones}|null{
 const key=(outcome??'').trim().toLowerCase().replaceAll('’',"'");
 if(['no answer',"didn't answer",'no_answer'].includes(key))return{label:'No answer',tone:'amber'};
 if(['busy','busy / unreachable','switched off / unreachable','unreachable','busy / no answer'].includes(key))return{label:outcome!,tone:'amber'};
 return outcome?{label:outcome,tone:'slate'}:null;
}
export function leadTone(lead:{status:string;last_outcome:string|null;shared_school_count:number;partnership_stage?:string}){
 if(lead.status==='admitted'||lead.partnership_stage==='confirmed')return 'green';
 if(lead.status==='lost'||lead.partnership_stage==='closed')return 'slate';
 if(contactBadge(lead.last_outcome)?.tone==='amber')return 'amber';
 if(Number(lead.shared_school_count)>0)return 'violet';
 return 'blue';
}
export const rowTones={blue:'border-l-blue-400 hover:bg-blue-50/40',amber:'border-l-amber-400 bg-amber-50/30 hover:bg-amber-50',violet:'border-l-violet-400 bg-violet-50/30 hover:bg-violet-50',green:'border-l-emerald-400 bg-emerald-50/30',slate:'border-l-slate-300 bg-slate-50/60'} as const;
export function groupByIndiaDate<T>(items:T[],getDate:(item:T)=>Date|string){
 const groups=new Map<string,{label:string;items:T[]}>();
 for(const item of items){const date=getDate(item),key=indiaDateKey(date);if(!groups.has(key))groups.set(key,{label:indiaDateLabel(date),items:[]});groups.get(key)!.items.push(item);}
 return [...groups].map(([key,group])=>({key,...group}));
}
export function followUpHref(task:{lead_id:number;enquiry_category:string;referral_id:number|null;task_type:string}){
 return `/leads/${task.lead_id}?tab=${task.enquiry_category!=='school_owner'&&task.referral_id&&task.task_type==='contact_school'?'schools#referrals':'follow-up'}`;
}
