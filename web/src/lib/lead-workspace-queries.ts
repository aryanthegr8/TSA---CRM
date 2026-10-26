import { leadDepartment, type CrmDepartment } from "@/lib/departments";
import {activeLeadSql,incomingLeadSql,openLeadTaskSql,dayBounds,indiaDateKey,validDay,singleValue,type SearchValues} from './lead-workspace';
export type WorkspaceUser={id:number;role:string;department:CrmDepartment|null};
export type Scope={where:string[];args:(string|number)[]};
export const workspaceFrom='FROM leads l JOIN families f ON f.id=l.family_id LEFT JOIN school_partnerships sp ON sp.lead_id=l.id LEFT JOIN crm_users u ON u.id=l.owner_id';
export const taskFrom=`FROM tasks t JOIN leads l ON l.id=t.lead_id JOIN families f ON f.id=l.family_id
 LEFT JOIN school_partnerships sp ON sp.lead_id=l.id LEFT JOIN referrals r ON r.id=t.referral_id
 LEFT JOIN partner_schools ps ON ps.id=r.partner_school_id LEFT JOIN crm_users u ON u.id=t.owner_id`;
export const whereSql=(scope:Scope)=>scope.where.length?`WHERE ${scope.where.join(' AND ')}`:'';
export const escapedSearch=(q:string)=>`%${q.replace(/[\\%_]/g,'\\$&')}%`;
export function inboxQueueScope(view:string):string{
 if(view==='incoming')return `(${incomingLeadSql})`;
 if(view==='missing')return `(${activeLeadSql}) AND NOT ${openLeadTaskSql}`;
 if(view==='scheduled')return `(${activeLeadSql}) AND ${openLeadTaskSql}`;
 return '1=1';
}
export function inboxAccessScope(user:WorkspaceUser,category:string,owner:string):Scope{
 const where=['l.enquiry_category=?'];const args:(string|number)[]=[category];
 if(user.role==='counsellor'){
  where.push('l.owner_id=?');args.push(user.id);
  // Deny missing/mismatched departments even for leads previously assigned.
  if(leadDepartment(category)!==user.department || user.department===null) where.push('1=0');
 }
 else if(owner==='unassigned')where.push('l.owner_id IS NULL');
 else if(/^\d+$/.test(owner)&&Number.isSafeInteger(Number(owner))&&Number(owner)>0){where.push('l.owner_id=?');args.push(Number(owner));}
 return{where,args};
}
export const taskPeriods={all:'All scheduled',overdue:'Overdue',today:'Today',tomorrow:'Tomorrow',week:'Next 7 days'};
export function parseTaskFilters(raw:SearchValues){
 const read=(key:string)=>singleValue(raw[key]);const owner=read('owner');
 return {owner:/^\d+$/.test(owner)&&Number.isSafeInteger(Number(owner))&&Number(owner)>0?owner:'',
 category:['boarding_parent','day_parent','school_owner','general'].includes(read('category'))?read('category'):'',
 period:Object.hasOwn(taskPeriods,read('period'))?read('period'):'all',date:validDay(read('date'))?read('date'):'',
 taskType:['call_parent','message_parent','contact_school','application','other'].includes(read('taskType'))?read('taskType'):'',
 q:read('q').trim().slice(0,100),page:Number.isSafeInteger(Number(read('page')))&&Number(read('page'))>0?Number(read('page')):1};
}
export function taskScope(user:WorkspaceUser,filters:ReturnType<typeof parseTaskFilters>,now:Date):Scope{
 const where=['t.completed_at IS NULL',`(${activeLeadSql})`,"(t.referral_id IS NULL OR r.status NOT IN ('not_proceeding','admitted'))"];
 const args:(string|number)[]=[];
 // Require both ownership checks: old/mismatched task assignment must not expose another lead.
 if(user.role==='counsellor'){
  where.push('t.owner_id=?','l.owner_id=?');args.push(user.id,user.id);
  if(user.department==='school_partnerships') where.push("l.enquiry_category='school_owner'");
  else if(user.department==='parent_admissions') where.push("l.enquiry_category IN ('day_parent','boarding_parent')");
  else where.push('1=0'); // Unassigned/unknown department: deny access.
 }
 else if(filters.owner){where.push('t.owner_id=?');args.push(Number(filters.owner));}
 if(filters.category){where.push('l.enquiry_category=?');args.push(filters.category);}
 if(filters.taskType){where.push('t.task_type=?');args.push(filters.taskType);}
 if(filters.q){where.push('(f.parent_name LIKE ? OR f.primary_phone LIKE ? OR l.student_name LIKE ? OR sp.school_name LIKE ? OR t.title LIKE ? OR ps.name LIKE ?)');args.push(...Array(6).fill(escapedSearch(filters.q)));}
 const today=indiaDateKey(now),bounds=dayBounds(today),nowSql=now.toISOString().slice(0,23).replace('T',' ');
 if(filters.date){const day=dayBounds(filters.date);where.push('t.due_at>=? AND t.due_at<?');args.push(day.start,day.end);}
 else if(filters.period==='overdue'){where.push('t.due_at<?');args.push(nowSql);}
 else if(filters.period==='today'){where.push('t.due_at>=? AND t.due_at<?');args.push(bounds.start,bounds.end);}
 else if(filters.period==='tomorrow'){const tomorrow=dayBounds(indiaDateKey(new Date(now.getTime()+86400000)));where.push('t.due_at>=? AND t.due_at<?');args.push(tomorrow.start,tomorrow.end);}
 else if(filters.period==='week'){where.push('t.due_at>=? AND t.due_at<?');args.push(bounds.start,dayBounds(indiaDateKey(new Date(now.getTime()+7*86400000))).start);}
 return{where,args};
}
