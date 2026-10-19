import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {NextResponse} from 'next/server';
import type {RowDataPacket,ResultSetHeader} from 'mysql2';
import {db} from '@/lib/db';
import {getCurrentUser} from '@/lib/current-user';
import {lockSchoolLead,validDate,futureIndiaTime} from '@/lib/school-partnership-server';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';
const directory=()=>process.env.CRM_MOU_DIRECTORY||path.join(process.cwd(),'var','private-mous');
const maxBytes=5*1024*1024;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();if(!user)return new Response('Unauthorized',{status:401});
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return new Response('Not found',{status:404});
 const requestUrl=new URL(request.url);const configured=process.env.CRM_PUBLIC_ORIGIN||process.env.AUTH_URL;
 const protocol=request.headers.get('x-forwarded-proto')?.split(',')[0].trim()==='https'?'https:':requestUrl.protocol;
 const url=new URL(configured||`${protocol}//${request.headers.get('host')||requestUrl.host}`);const origin=request.headers.get('origin');
 if(!origin||origin!==url.origin)return new Response('Forbidden origin',{status:403});
 const back=(message:string)=>NextResponse.redirect(new URL(`/leads/${id}?tab=commercial&notice=${encodeURIComponent(message)}`,url),303);
 if(Number(request.headers.get('content-length')||0)>maxBytes+65536)return back('PDF is too large. Maximum file size is 5 MB.');
 // Bound multipart buffering even for requests without Content-Length.
 const reader=request.body?.getReader();if(!reader)return back('Choose a signed PDF.');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes+65536){await reader.cancel();return back('Upload exceeds 5 MB.');}chunks.push(part.value);}}finally{reader.releaseLock();}
 let form:FormData;try{form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:Buffer.concat(chunks)}).formData();}catch{return back('Invalid upload.');}
 const file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>maxBytes)return back('Upload a signed PDF up to 5 MB.');
 const buffer=Buffer.from(await file.arrayBuffer());if(buffer.subarray(0,5).toString()!=='%PDF-'||!file.name.toLowerCase().endsWith('.pdf'))return back('Only PDF documents are accepted.');
 const signedDate=String(form.get('signedDate')||'');const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date());const due=futureIndiaTime(String(form.get('followUp')||''));
 if(!validDate(signedDate)||signedDate>today||!due)return back('Enter a valid signing date up to today and a future verification follow-up.');
 const connection=await db.getConnection();let storageKey='';let committed=false;
 try{
  await connection.beginTransaction();const{lead,record}=await lockSchoolLead(connection,id,user);
  if(!['mou','verification'].includes(record.stage)||String(form.get('revision'))!==String(record.revision)){await connection.rollback();return back('Record changed or MOU is not yet ready. Refresh and check accepted terms.');}
  if(!record.agreed_type||!record.agreed_rate||!record.effective_date){await connection.rollback();return back('Save and accept the agreed commission terms first.');}
  storageKey=`${randomUUID()}.pdf`;await mkdir(directory(),{recursive:true,mode:0o700});await writeFile(path.join(directory(),storageKey),buffer,{flag:'wx',mode:0o600});
  const[result]=await connection.execute<ResultSetHeader>('INSERT INTO school_mou_documents (lead_id,storage_key,original_name,byte_size,uploaded_by) VALUES (?,?,?,?,?)',[id,storageKey,path.basename(file.name).slice(0,255),file.size,user.id]);
  await connection.execute("UPDATE school_partnerships SET stage='verification',active_mou_id=?,signed_date=?,revision=revision+1,last_outcome='Signed MOU received — verification pending' WHERE lead_id=?",[result.insertId,signedDate,id]);
  await connection.execute("INSERT INTO lead_activities (lead_id,actor_id,activity_type,outcome,note,occurred_at) VALUES (?,?,'note','Signed MOU uploaded',?,UTC_TIMESTAMP(3))",[id,user.id,`Signed PDF uploaded; verification pending. Document ID ${result.insertId}. Signing date ${signedDate}.`]);
  await connection.execute("UPDATE tasks SET completed_at=UTC_TIMESTAMP(3),outcome='Signed MOU received' WHERE lead_id=? AND completed_at IS NULL",[id]);
  await connection.execute("INSERT INTO tasks (lead_id,owner_id,title,task_type,due_at) VALUES (?,?,'Obtain manager verification of signed MOU','contact_school',?)",[id,lead.owner_id??user.id,due]);
  await connection.commit();committed=true;
 }catch(error){await connection.rollback();throw error;}finally{connection.release();if(storageKey&&!committed)await unlink(path.join(directory(),storageKey)).catch(()=>{});}
 revalidatePath('/leads','layout');revalidatePath('/dashboard');return back('Signed MOU uploaded. Manager verification pending.');
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();if(!user)return new Response('Unauthorized',{status:401});const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return new Response('Not found',{status:404});
 const [rows]=await db.execute<RowDataPacket[]>('SELECT d.*,l.owner_id,l.enquiry_category FROM school_mou_documents d JOIN leads l ON l.id=d.lead_id WHERE d.id=?',[id]);const doc=rows[0];
 if(!doc||doc.enquiry_category!=='school_owner'||user.role==='counsellor'&&Number(doc.owner_id)!==user.id)return new Response('Not found',{status:404});
 if(!/^[a-f0-9-]{36}\.pdf$/.test(doc.storage_key))return new Response('Not found',{status:404});
 try{const bytes=await readFile(path.join(directory(),doc.storage_key));return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="school-mou-${id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Document file unavailable',{status:404});}
}
