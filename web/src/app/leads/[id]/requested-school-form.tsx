"use client";
import {useActionState,useState} from 'react';
import {saveRequestedSchool} from './school-request-actions';
type Request={revision:number;school_name:string;city:string;state:string;exclusive_only:number;admission_deadline:string;preference_note:string|null;selection:string};
export default function RequestedSchoolForm({leadId,current,options,staff}:{leadId:number;current:Request|null;options:{value:string;label:string}[];staff:{id:number;name:string}[]}){
 const[state,action,pending]=useActionState(saveRequestedSchool.bind(null,leadId),{message:''});
 const[exclusive,setExclusive]=useState(Boolean(current?.exclusive_only));const[operation,setOperation]=useState('save');
 const input='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
 return <form action={action} className="mt-4"><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
 <input type="hidden" name="revision" value={current?.revision??0}/>
 {current&&<label className="text-sm">Action<select className={input} name="operation" value={operation} onChange={e=>setOperation(e.target.value)}><option value="save">Update requested school</option><option value="clear">Remove specific school preference</option></select></label>}
 {operation==='save'&&<>
 <label className="text-sm sm:col-span-2">Requested boarding school *<select name="selection" defaultValue={current?.selection??'new'} className={input}><option value="new">Enter a school not listed</option>{options.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
 <p className="text-xs text-slate-500 sm:col-span-2">Select an existing school/enquiry when available. For a new school, enter its name, city and state. For a listed school, these fields fill missing location details.</p>
 <label className="text-sm">School name<input name="name" defaultValue={current?.school_name??''} maxLength={255} className={input}/></label>
 <label className="text-sm">City<input name="city" defaultValue={current?.city??''} maxLength={120} className={input}/></label>
 <label className="text-sm">State<input name="state" defaultValue={current?.state??''} maxLength={120} className={input}/></label>
 <label className="text-sm">Parent’s flexibility<select name="exclusive" value={exclusive?'yes':'no'} onChange={e=>setExclusive(e.target.value==='yes')} className={input}><option value="no">Alternatives acceptable</option><option value="yes">Specific school only — no alternatives</option></select></label>
 <label className="text-sm">Admission deadline (optional)<input name="deadline" type="date" defaultValue={current?.admission_deadline??''} className={input}/></label>
 {staff.length>0&&<label className="text-sm">Partnership counsellor for a new school<select name="schoolOwner" className={input}><option value="">Use configured intake owner</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
 {exclusive&&<label className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2"><input type="checkbox" name="confirmExclusive" value="yes" required className="mt-1"/>Parent accepts only this school. Stop other school options, their pending tasks and scheduled visits. Previous sharing history stays recorded.</label>}
 </>}
 <label className="text-sm">Next parent update (India time) *<input name="followUp" type="datetime-local" required className={input}/></label>
 <label className="text-sm sm:col-span-2">Parent’s instruction / reason for change *<textarea name="note" required maxLength={2000} rows={2} defaultValue={current?.preference_note??''} className={input}/></label>
 <p className="text-xs text-slate-500 sm:col-span-2">A pending school is linked to the partnership team. Saving does not send WhatsApp messages or share parent contact details with the school.</p>
 {state.message&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
 <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white sm:col-span-2">{pending?'Saving…':'Save school preference and parent follow-up'}</button>
 </fieldset></form>;
}
