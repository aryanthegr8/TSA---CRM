import Link from 'next/link';
import {Fragment} from 'react';
import {redirect} from 'next/navigation';
import type {RowDataPacket} from 'mysql2';
import {db} from '@/lib/db';
import {getCurrentUser} from '@/lib/current-user';
import {partnershipStages,type PartnershipStage} from '@/lib/school-partnership';
import {parentStageSql} from '@/lib/lead-stage';
import {parentStageLabels,type ParentStage} from '@/lib/parent-workflow';
import {activeLeadSql,incomingLeadSql,openLeadTaskSql,latestContactSql,sharedSchoolsSql,previousSharedSql,indiaDateKey,indiaTime,groupByIndiaDate,badgeTones,contactBadge,leadTone,rowTones,singleValue,type SearchValues} from '@/lib/lead-workspace';
import {inboxAccessScope,inboxQueueScope,workspaceFrom,whereSql,escapedSearch} from '@/lib/lead-workspace-queries';
import BulkAssignmentForm from './bulk-assignment-form';
interface LeadRow extends RowDataPacket{
 id:number;parent_name:string|null;primary_phone:string;student_name:string|null;class_sought:string|null;school_type:string;preferred_location:string|null;
 source:string;source_detail:string|null;enquiry_category:string;status:string;received_at:Date;owner_name:string|null;due_at:Date|null;next_action:string|null;
 partnership_stage:PartnershipStage;school_name:string|null;contact_name:string|null;contact_phone:string|null;school_city:string|null;owner_school_type:string;
 workflow_stage:ParentStage;last_outcome:string|null;shared_school_count:number;previous_shared_count:number;is_incoming:number;
}
interface Owner extends RowDataPacket{id:number;name:string;role:string}
interface Counts extends RowDataPacket{total:number;incoming:number;missing:number;scheduled:number}
const pageSize=50;
const stages=['new','attempting_contact','connected','qualified','exploring_options','application_in_progress','admitted','on_hold','lost'];
const sources=['website','meta_form','whatsapp','phone','referral','walk_in','other'];
const workOptions={unassigned:'Unassigned',overdue:'Overdue follow-ups',no_next:'No next action',requested_pending:'Requested school: collaboration pending',requested_ready:'Requested school: ready for parent follow-up',visits:'Visits scheduled',converted:'Converted'};
export default async function LeadInbox({searchParams,inbox}:{searchParams:Promise<SearchValues>;inbox:'boarding_parent'|'day_parent'|'school_owner'|'general'}){
 const user=await getCurrentUser();if(!user)redirect('/login');const raw=await searchParams;
 const read=(key:string)=>singleValue(raw[key]);const isCounsellor=user.role==='counsellor';
 const isManager = user.role === "admin" || user.role === "manager";

const showParentCategories =
  isManager ||
  (isCounsellor && user.department === "parent_admissions");

const showSchoolCategories =
  isManager ||
  (isCounsellor && user.department === "school_partnerships");
 const q=read('q').trim().slice(0,100),source=sources.includes(read('source'))?read('source'):'';
 const status=stages.includes(read('status'))?read('status'):'';
 const schoolType=inbox==='school_owner'&&['day','boarding','both'].includes(read('schoolType'))?read('schoolType'):'';
 const partnership=inbox==='school_owner'&&Object.hasOwn(partnershipStages,read('partnership'))?read('partnership'):'';
 const workflow=inbox!=='school_owner'&&Object.hasOwn(parentStageLabels,read('workflow'))?read('workflow'):'';
 const work=Object.hasOwn(workOptions,read('work'))?read('work'):'';
 const owner=!isCounsellor&&(read('owner')==='unassigned'||/^\d+$/.test(read('owner'))&&Number.isSafeInteger(Number(read('owner')))&&Number(read('owner'))>0)?read('owner'):'';
 const view=['incoming','missing','all'].includes(read('view'))?read('view'):status||workflow||partnership||work?'all':'incoming';
 const basePath=inbox==='day_parent'?'/leads/day-parents':inbox==='boarding_parent'?'/leads/boarding-parents':inbox==='school_owner'?'/leads/school-owners':'/leads';
 const title=inbox==='day_parent'?'Day-school parents · Delhi NCR':inbox==='boarding_parent'?'Boarding parents':inbox==='school_owner'?'School owners':'Other enquiries';
 const scope=inboxAccessScope(user,inbox,owner);
 if(q){scope.where.push('(f.parent_name LIKE ? OR f.primary_phone LIKE ? OR l.student_name LIKE ? OR sp.school_name LIKE ? OR sp.contact_name LIKE ? OR sp.city LIKE ?)');scope.args.push(...Array(6).fill(escapedSearch(q)));}
 if(source){scope.where.push('l.source=?');scope.args.push(source);}
 if(schoolType){scope.where.push("COALESCE(sp.school_type,NULLIF(l.school_type,'undecided'),'boarding')=?");scope.args.push(schoolType);}
 const common={where:[...scope.where],args:[...scope.args]};
 scope.where.push(`(${inboxQueueScope(view)})`);
 if(status){scope.where.push('l.status=?');scope.args.push(status);}
 if(partnership){scope.where.push("COALESCE(sp.stage,CASE WHEN l.status='lost' THEN 'closed' ELSE 'new' END)=?");scope.args.push(partnership);}
 if(workflow){scope.where.push(`(${parentStageSql()})=?`);scope.args.push(workflow);}
 if(work==='unassigned')scope.where.push('l.owner_id IS NULL');
 if(work==='no_next')scope.where.push(`(${activeLeadSql}) AND NOT ${openLeadTaskSql}`);
 if(work==='overdue')scope.where.push(`(${activeLeadSql}) AND EXISTS(SELECT 1 FROM tasks ft LEFT JOIN referrals fr ON fr.id=ft.referral_id WHERE ft.lead_id=l.id AND ft.completed_at IS NULL AND ft.due_at<UTC_TIMESTAMP(3) AND (ft.referral_id IS NULL OR fr.status NOT IN ('not_proceeding','admitted')))`);
 if(work==='converted')scope.where.push("l.status='admitted'");
 if(work==='visits')scope.where.push("EXISTS(SELECT 1 FROM school_visits sv WHERE sv.lead_id=l.id AND sv.status='scheduled')");
 if(inbox!=='school_owner'&&['requested_pending','requested_ready'].includes(work))scope.where.push(`(${activeLeadSql}) AND EXISTS(SELECT 1 FROM boarding_school_requests br JOIN boarding_school_targets bt ON bt.id=br.target_id LEFT JOIN school_partnerships rsp ON rsp.lead_id=bt.school_owner_lead_id LEFT JOIN partner_schools rps ON rps.id=rsp.partner_school_id WHERE br.lead_id=l.id AND COALESCE((rsp.stage='confirmed' AND rsp.verified_at IS NOT NULL AND rps.is_active=1 AND rps.school_type IN ('boarding','both')),0)=${work==='requested_ready'?1:0})`);
 const [[summary],[totals],[owners]]=await Promise.all([
  db.execute<Counts[]>(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN ${incomingLeadSql} THEN 1 ELSE 0 END),0) incoming,
  COALESCE(SUM(CASE WHEN (${activeLeadSql}) AND NOT ${openLeadTaskSql} THEN 1 ELSE 0 END),0) missing,
  COALESCE(SUM(CASE WHEN (${activeLeadSql}) AND ${openLeadTaskSql} THEN 1 ELSE 0 END),0) scheduled ${workspaceFrom} ${whereSql(common)}`,common.args),
  db.execute<RowDataPacket[]>(`SELECT COUNT(*) total ${workspaceFrom} ${whereSql(scope)}`,scope.args),
  isCounsellor?Promise.resolve([[] as Owner[]]):db.query<Owner[]>('SELECT id,name,role FROM crm_users WHERE is_active=1 ORDER BY name'),
 ]);
 const total=Number(totals[0]?.total??0),pages=Math.max(1,Math.ceil(total/pageSize));
 const page=Math.min(pages,Number.isSafeInteger(Number(read('page')))&&Number(read('page'))>0?Number(read('page')):1);
 const taskWhere="nt.lead_id=l.id AND nt.owner_id=l.owner_id AND nt.completed_at IS NULL AND (nt.referral_id IS NULL OR nr.status NOT IN ('not_proceeding','admitted'))";
 const[leads]=await db.execute<LeadRow[]>(`SELECT l.id,l.enquiry_category,l.status,l.school_type,l.received_at,l.class_sought,l.preferred_location,l.student_name,l.source,l.source_detail,
 f.parent_name,f.primary_phone,u.name owner_name,sp.school_name,sp.contact_name,sp.contact_phone,sp.city school_city,
 COALESCE(sp.school_type,NULLIF(l.school_type,'undecided'),'boarding') owner_school_type,COALESCE(sp.stage,CASE WHEN l.status='lost' THEN 'closed' ELSE 'new' END) partnership_stage,
 ${parentStageSql()} workflow_stage,${latestContactSql} last_outcome,${sharedSchoolsSql} shared_school_count,${previousSharedSql} previous_shared_count,
 (${incomingLeadSql}) is_incoming,
 (SELECT nt.title FROM tasks nt LEFT JOIN referrals nr ON nr.id=nt.referral_id WHERE ${taskWhere} ORDER BY nt.due_at,nt.id LIMIT 1) next_action,
 (SELECT MIN(nt.due_at) FROM tasks nt LEFT JOIN referrals nr ON nr.id=nt.referral_id WHERE ${taskWhere}) due_at
 ${workspaceFrom} ${whereSql(scope)} ORDER BY l.received_at DESC,l.id DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,scope.args);
 const params={q,source,owner,schoolType,status,partnership,workflow,work,view};
 const link=(patch:Record<string,string>)=>{const url=new URLSearchParams();for(const[k,v]of Object.entries({...params,...patch}))if(v)url.set(k,v);return`${basePath}?${url}`;};
 const followUpUrl=`/follow-ups?${new URLSearchParams({category:inbox,...(owner&&owner!=='unassigned'?{owner}:{})})}`;
 const counts=summary[0];const today=indiaDateKey(new Date());const groups=groupByIndiaDate(leads,lead=>lead.received_at);
 const input='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const table=<div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
 {!leads.length?<div className="p-12 text-center"><p className="font-semibold text-slate-800">{view==='incoming'?'No new enquiries waiting here':'No leads match this view'}</p><p className="mt-2 text-sm text-slate-500">{view==='incoming'?'Your scheduled work is available on the follow-up board.':'Try another filter or open All leads.'}</p><Link href={followUpUrl} className="mt-4 inline-block text-sm font-semibold text-blue-700">Open follow-up board →</Link></div>:
 <table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-white text-xs uppercase tracking-wide text-slate-500"><tr>{!isCounsellor&&<th className="px-4 py-4"><span className="sr-only">Select for assignment</span></th>}<th className="px-5 py-4">Lead & requirement</th><th className="px-5 py-4">Progress & last contact</th><th className="px-5 py-4">Counsellor</th><th className="px-5 py-4">Next action</th></tr></thead>
 <tbody>{groups.map(group=><Fragment key={group.key}><tr className="border-y border-slate-200 bg-slate-100/80"><th colSpan={isCounsellor?4:5} scope="colgroup" className="px-5 py-3 text-xs font-semibold tracking-wide text-slate-700">{group.key===today?'Today · ':''}{group.label}<span className="ml-3 font-normal text-slate-500">{group.items.length} on this page · received date</span></th></tr>{group.items.map(lead=>{
 const tone=leadTone(lead),contact=contactBadge(lead.last_outcome);const closed=['admitted','lost'].includes(lead.status)||['confirmed','closed'].includes(lead.partnership_stage);
 return <tr key={lead.id} className={`border-b border-slate-100 align-top last:border-b-0 ${rowTones[tone]}`}>
 {!isCounsellor&&<td className={`border-l-4 px-4 py-5 ${rowTones[tone]}`}><input type="checkbox" name="leadId" value={lead.id} aria-label={`Select lead ${lead.id}`}/></td>}
 <td className={`px-5 py-5 ${isCounsellor?`border-l-4 ${rowTones[tone]}`:''}`}><div className="flex flex-wrap items-center gap-2"><Link href={`/leads/${lead.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{inbox==='school_owner'?lead.school_name||'School name to confirm':lead.parent_name||'Contact not recorded'}</Link><span className="text-xs text-slate-400">#{lead.id}</span></div>
 <p className="mt-1 text-sm text-slate-600">{inbox==='school_owner'?lead.contact_name||lead.parent_name||'School contact to research':lead.student_name||'Student to confirm'}{(lead.contact_phone||lead.primary_phone)&&<> · <a href={`tel:${inbox==='school_owner'?lead.contact_phone||lead.primary_phone:lead.primary_phone}`} className="hover:underline">{inbox==='school_owner'?lead.contact_phone||lead.primary_phone:lead.primary_phone}</a></>}</p>
 <p className="mt-2 text-xs text-slate-500">{lead.school_city||lead.preferred_location||'Location to confirm'} · {inbox==='school_owner'?`${lead.owner_school_type} school`:lead.class_sought||'Class to confirm'}</p><p className="mt-2 text-xs capitalize text-slate-400">{lead.source.replaceAll('_',' ')} · {indiaTime(lead.received_at)}</p></td>
 <td className="max-w-80 px-5 py-5"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTones[tone]}`}>{lead.is_incoming?'New enquiry':inbox==='school_owner'?partnershipStages[lead.partnership_stage]:parentStageLabels[lead.workflow_stage]}</span>
 {Number(lead.shared_school_count)>0&&<span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTones.violet}`}>Sent to {lead.shared_school_count} school{Number(lead.shared_school_count)===1?'':'s'}</span>}
 {!Number(lead.shared_school_count)&&Number(lead.previous_shared_count)>0&&<span className="text-xs text-slate-500">Previously shared · see history</span>}</div>
 {contact&&<p className="mt-3 text-xs text-slate-500">Last contact: <span className={`ml-1 inline-block rounded-md border px-2 py-1 ${badgeTones[contact.tone]}`}>{contact.label}</span></p>}
 {!contact&&lead.is_incoming>0&&<p className="mt-2 text-xs text-blue-700">First contact pending</p>}{lead.status==='on_hold'&&<p className="mt-2 text-xs text-slate-500">On hold · follow-up retained</p>}</td>
 <td className="px-5 py-5"><span className={`inline-block rounded-lg px-2.5 py-1.5 text-xs font-medium ${lead.owner_name?'bg-white text-slate-700 ring-1 ring-slate-200':'bg-rose-50 text-rose-800'}`}>{lead.owner_name||'Unassigned'}</span></td>
 <td className="max-w-64 px-5 py-5"><p className="text-sm text-slate-700">{closed?'Completed / closed':lead.next_action||'Needs scheduling'}</p>{!closed&&lead.due_at?<p className={`mt-2 text-xs font-medium ${new Date(lead.due_at)<new Date()?'text-rose-700':'text-slate-500'}`}>{new Date(lead.due_at)<new Date()?'Overdue · ':''}{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(lead.due_at))}</p>:!closed&&<p className="mt-2 text-xs text-rose-700">Set a next action to keep this lead moving.</p>}</td></tr>;
 })}</Fragment>)}</tbody></table>}</div>;
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6"><div className="mx-auto max-w-7xl">
 <header className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/dashboard" className="text-sm font-medium text-blue-700">← Dashboard</Link><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">Lead inbox · {isCounsellor?'My enquiries':'Team enquiries'}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-sm text-slate-500">New enquiries land here. Work scheduled calls and school tasks from the follow-up board.</p></div><div className="flex gap-2"><Link href={followUpUrl} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Follow-up board →</Link><Link href={`/leads/new?category=${inbox}`} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">+ Add lead</Link></div></header>
 <nav
  aria-label="Lead categories"
  className="mt-6 flex flex-wrap gap-2"
>
  {[
    ...(showParentCategories
      ? [
          ["/leads/day-parents", "Day-school parents"],
          ["/leads/boarding-parents", "Boarding parents"],
        ]
      : []),

    ...(showSchoolCategories
      ? [["/leads/school-owners", "School owners"]]
      : []),

    ...(isManager
      ? [["/leads", "Other enquiries"]]
      : []),
  ].map(([href, label]) => (
    <Link
      key={href}
      href={href}
      aria-current={href === basePath ? "page" : undefined}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${
        href === basePath
          ? "bg-blue-700 text-white"
          : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </Link>
  ))}
</nav>
 <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{key:'incoming',label:'New leads',count:counts?.incoming??0,description:'Awaiting first contact'},{key:'missing',label:'Needs scheduling',count:counts?.missing??0,description:'Open, without a pending task'},{key:'scheduled',label:'Scheduled work',count:counts?.scheduled??0,description:'Leads with open tasks'},{key:'all',label:'All leads',count:counts?.total??0,description:'Full records and history'}].map(card=><Link key={card.key} href={card.key==='scheduled'?followUpUrl:link({view:card.key,status:'',workflow:'',partnership:'',work:'',page:'1'})} aria-current={card.key===view?'page':undefined} className={`rounded-2xl border bg-white p-4 shadow-sm ${view===card.key?'border-blue-500 ring-1 ring-blue-100':'border-slate-200 hover:border-slate-400'}`}><p className="text-xs font-semibold text-slate-500">{card.label}</p><p className="mt-2 text-3xl font-bold">{card.count}</p><p className="mt-1 text-xs text-slate-400">{card.description}</p></Link>)}</div>
 <form action={basePath} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><input type="hidden" name="view" value={view}/><div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-semibold text-slate-500 lg:col-span-2">Search {inbox==='school_owner'?'school, contact or phone':'parent, student or phone'}<input name="q" defaultValue={q} maxLength={100} placeholder="Find an enquiry…" className={input}/></label><label className="text-xs font-semibold text-slate-500">Source<select name="source" defaultValue={source} className={input}><option value="">All sources</option>{sources.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label>{!isCounsellor&&<label className="text-xs font-semibold text-slate-500">Counsellor<select name="owner" defaultValue={owner} className={input}><option value="">All team members</option><option value="unassigned">Unassigned</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}<div className="flex items-center gap-3"><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Filter</button><Link href={`${basePath}?view=${view}`} className="text-sm text-slate-500">Reset</Link></div></div>
 {inbox==='school_owner'&&<label className="mt-3 block max-w-xs text-xs font-semibold text-slate-500">School type<select name="schoolType" defaultValue={schoolType} className={input}><option value="">All types</option>{['boarding','day','both'].map(t=><option key={t} value={t}>{t}</option>)}</select></label>}
 {view==='all'&&<details open={Boolean(status||workflow||partnership||work)} className="mt-4 border-t pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">More filters</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">{inbox==='school_owner'?<label className="text-xs">Partnership stage<select name="partnership" defaultValue={partnership} className={input}><option value="">All stages</option>{Object.entries(partnershipStages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>:<><label className="text-xs">Status<select name="status" defaultValue={status} className={input}><option value="">All statuses</option>{stages.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><label className="text-xs">Workflow stage<select name="workflow" defaultValue={workflow} className={input}><option value="">All workflow stages</option>{Object.entries(parentStageLabels).filter(([k])=>inbox!=='day_parent'||k!=='awaiting_requested').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></>}<label className="text-xs">Needs attention<select name="work" defaultValue={work} className={input}><option value="">All records</option>{Object.entries(workOptions).filter(([k])=>(inbox!=='school_owner'||!['visits','converted','requested_pending','requested_ready'].includes(k))&&(inbox!=='day_parent'||!['requested_pending','requested_ready'].includes(k))).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div></details>}</form>
 <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><p>{total} matching leads · {view==='incoming'?'New leads':view==='missing'?'Needs scheduling':'All leads'} · Page {page} of {pages}</p><p className="flex flex-wrap gap-3"><span className="text-blue-700">● New</span><span className="text-amber-800">● No answer / unreachable</span><span className="text-violet-700">● Sent to schools</span><span className="text-emerald-700">● Confirmed</span></p></div>
 {!isCounsellor?<BulkAssignmentForm key={link({page:String(page)})} category={inbox} counsellors={owners.filter(o=>o.role==='counsellor').map(({id,name})=>({id,name}))}>{table}</BulkAssignmentForm>:table}
 {pages>1&&<nav aria-label="Lead pages" className="mt-5 flex justify-between text-sm"><span>{page>1&&<Link href={link({page:String(page-1)})} className="font-medium text-blue-700">← Previous</Link>}</span><span>Page {page} of {pages}</span><span>{page<pages&&<Link href={link({page:String(page+1)})} className="font-medium text-blue-700">Next →</Link>}</span></nav>}
 <p className="mt-4 text-xs text-slate-400">Grouped by received date in India time. Group counts refer to this page. {view==='incoming'?'Automatic first-contact tasks do not remove a new enquiry; the first contact attempt or recorded workflow update does.':''}</p>
 </div></main>;
}
