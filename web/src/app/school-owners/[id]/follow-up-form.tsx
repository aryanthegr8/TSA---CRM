"use client";
import Link from 'next/link';
import {useActionState,useState} from 'react';
import {savePartnership} from './actions';
import {allowedPartnershipOutcomes,partnershipOutcomes,partnershipStages,partnershipNextAction,type PartnershipStage} from '@/lib/school-partnership';
export default function SchoolFollowUpForm({id,revision,stage,termsReady,initialOutcome=''}:{id:number;revision:number;stage:PartnershipStage;termsReady:boolean;initialOutcome?:string}){
 const[state,action,pending]=useActionState(savePartnership.bind(null,id),{message:''});
 const[selection,setSelection]=useState(initialOutcome);
 const allowed=allowedPartnershipOutcomes(stage);
 const outcome=allowed.includes(selection)?selection:'';
 const config=outcome?partnershipOutcomes[outcome]:null;
 const blocked=outcome==='terms_accepted'&&!termsReady;
 const progress=allowed.filter(key=>!['no_answer','unreachable','callback','wrong_contact','approval','needs_time','not_interested','invalid'].includes(key));
 const input='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5';
 const options=(keys:string[])=>keys.map(key=><option key={key} value={key}>{partnershipOutcomes[key].label}{key==='terms_accepted'&&!termsReady?' — save agreed terms first':''}</option>);
 return <form action={action} className="mt-4" onSubmit={event=>{if(config?.close&&!window.confirm('Close this school enquiry and stop its pending follow-ups?'))event.preventDefault();}}><input name="operation" value="followup" type="hidden"/><input name="revision" value={revision} type="hidden"/><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
 <label className="text-sm font-medium">Contact method<select name="method" className={input}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="note">Internal note</option></select></label>
 <label className="text-sm font-medium">Outcome for {partnershipStages[stage]} *<select name="outcome" required value={outcome} onChange={event=>setSelection(event.target.value)} className={input}><option value="">Choose what happened</option>{progress.length>0&&<optgroup label="Actions for this stage">{options(progress)}</optgroup>}<optgroup label="Contact / callback">{options(allowed.filter(key=>['no_answer','unreachable','callback','wrong_contact'].includes(key)))}</optgroup><optgroup label="Waiting / on hold">{options(allowed.filter(key=>['approval','needs_time'].includes(key)))}</optgroup><optgroup label="Close enquiry">{options(allowed.filter(key=>['not_interested','invalid'].includes(key)))}</optgroup></select></label>
 {config&&<div aria-live="polite" className={`rounded-lg border p-3 text-sm sm:col-span-2 ${config.close?'border-red-200 bg-red-50 text-red-800':blocked?'border-amber-200 bg-amber-50 text-amber-900':'border-blue-100 bg-blue-50 text-blue-900'}`}>
 {blocked?<>Save agreed commission terms and the effective date first. <Link href={`/leads/${id}?tab=commercial`} className="font-semibold underline">Open Commission &amp; MOU</Link></>:config.close?'Saving closes this enquiry and all pending follow-ups.':config.stage&&config.stage!==stage?<>After saving: <strong>{partnershipStages[stage]} → {partnershipStages[config.stage]}</strong>{outcome==='terms_accepted'&&<p className="mt-1">The signed-MOU upload will become available.</p>}</>:<>Stage stays <strong>{partnershipStages[stage]}</strong>. {config.hold?'The enquiry will be marked On hold until the next follow-up.':'This records an update; it does not advance the partnership.'}</>}
 </div>}
 {config&&!config.close&&<><label className="text-sm font-medium">Next action *<input key={`${stage}-${outcome}`} name="nextAction" required maxLength={255} defaultValue={partnershipNextAction(outcome)} className={input}/></label><label className="text-sm font-medium">Next follow-up (India time) *<input name="followUp" type="datetime-local" required className={input}/></label></>}
 <label className="text-sm font-medium sm:col-span-2">{config?.close?'Closure reason *':'Conversation notes *'}<textarea name="note" required maxLength={2000} rows={3} className={input}/></label>
 <button disabled={pending||!outcome||blocked} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:col-span-2">{pending?'Saving…':config?.close?'Close enquiry':config?.stage&&config.stage!==stage?`Save and move to ${partnershipStages[config.stage]}`:'Save update and next follow-up'}</button>
 {state.message&&<p role="status" className={`rounded-lg p-3 text-sm sm:col-span-2 ${state.message.startsWith('Saved')?'bg-green-50 text-green-800':'bg-amber-50 text-amber-900'}`}>{state.message}</p>}
 </fieldset></form>;
}
