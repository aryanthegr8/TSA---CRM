"use client";
import {useActionState,type ReactNode} from 'react';
import {savePartnership} from './actions';
export default function PartnershipForm({id,revision,operation,children,label,readOnly=false}:{id:number;revision:number;operation:string;children:ReactNode;label:string;readOnly?:boolean}){
 const[state,action,pending]=useActionState(savePartnership.bind(null,id),{message:''});
 return <form action={action} className="mt-4" onSubmit={event=>{if(operation==='verify'&&!window.confirm('Verify this signed MOU and confirm collaboration with the selected school?'))event.preventDefault();}}><input type="hidden" name="revision" value={revision}/><input type="hidden" name="operation" value={operation}/><fieldset disabled={pending||readOnly} className="grid gap-4 sm:grid-cols-2">{children}{!readOnly&&<button disabled={pending||readOnly} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:col-span-2">{pending?'Saving…':label}</button>}{state.message&&<p role="status" className="text-sm text-blue-800 sm:col-span-2">{state.message}</p>}</fieldset></form>;
}
