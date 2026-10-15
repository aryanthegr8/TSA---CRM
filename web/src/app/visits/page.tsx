import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
const stamp = (date: Date) => new Intl.DateTimeFormat("en-IN", {dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(date));
export default async function Visits({searchParams}:{searchParams:Promise<{status?:string;q?:string;page?:string;from?:string;to?:string}>}) {
 const user = await getCurrentUser(); if (!user) redirect("/login");
 const raw = await searchParams;
 const status = ["scheduled","completed","rescheduled","cancelled","no_show"].includes(raw.status ?? "") ? raw.status! : "";
 const q = (raw.q ?? "").trim().slice(0,100);
 const page = Math.max(1,Math.min(100000,Number.isSafeInteger(Number(raw.page)) ? Number(raw.page) : 1));
 const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.from ?? '') ? raw.from! : '';
 const toDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.to ?? '') ? raw.to! : '';
 const where:string[] = []; const args:(string|number)[] = [];
 if (user.role === "counsellor") {where.push("l.owner_id = ?");args.push(user.id);}
 if (status) {where.push("v.status = ?");args.push(status);}
 if (q) {where.push("(ps.name LIKE ? OR f.parent_name LIKE ? OR u.name LIKE ?)");args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
 if (fromDate) { where.push("v.scheduled_at >= CONVERT_TZ(CONCAT(?, ' 00:00:00'), '+05:30', '+00:00')"); args.push(fromDate); }
 if (toDate) { where.push("v.scheduled_at < DATE_ADD(CONVERT_TZ(CONCAT(?, ' 00:00:00'), '+05:30', '+00:00'), INTERVAL 1 DAY)"); args.push(toDate); }
 const pageLink = (target:number) => `/visits?${new URLSearchParams({q,status,from:fromDate,to:toDate,page:String(target)})}`;
 const [visits] = await db.execute<RowDataPacket[]>(`SELECT v.*, ps.name AS school, f.parent_name, l.student_name, u.name AS counsellor FROM school_visits v JOIN leads l ON l.id=v.lead_id JOIN families f ON f.id=l.family_id JOIN referrals r ON r.id=v.referral_id JOIN partner_schools ps ON ps.id=r.partner_school_id LEFT JOIN crm_users u ON u.id=l.owner_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY v.scheduled_at DESC, v.id DESC LIMIT 51 OFFSET ${(page-1)*50}`,args);
 return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900"><div className="mx-auto max-w-6xl"><Link href="/dashboard" className="text-sm text-blue-700">← Dashboard</Link><h1 className="mt-4 text-3xl font-bold">School visits</h1><p className="mt-2 text-sm text-slate-500">Page {page} · Up to 50 matching visits. Rescheduled appointments remain in history.</p><form className="mt-5 flex flex-wrap gap-3"><input name="q" defaultValue={q} placeholder="Parent, school or counsellor" className="rounded-lg border p-2" /><select name="status" defaultValue={status} className="rounded-lg border p-2"><option value="">All visit statuses</option>{["scheduled","completed","rescheduled","cancelled","no_show"].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><input aria-label="Visits from date" type="date" name="from" defaultValue={fromDate} className="rounded-lg border p-2" /><input aria-label="Visits through date" type="date" name="to" defaultValue={toDate} className="rounded-lg border p-2" /><button className="rounded-lg bg-blue-700 px-4 py-2 text-white">Filter</button></form><div className="mt-5 overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-100"><tr>{["Parent / student","School","Counsellor","Visit date","Status","Feedback"].map(h=><th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{visits.slice(0,50).map(v=><tr key={v.id} className="border-t"><td className="p-4"><Link href={`/leads/${v.lead_id}?tab=schools`} className="font-semibold text-blue-700">{v.parent_name || 'Parent not recorded'}</Link><div className="text-xs text-slate-500">{v.student_name}</div></td><td className="p-4">{v.school}</td><td className="p-4">{v.counsellor || 'Unassigned'}</td><td className="p-4">{stamp(v.completed_at || v.scheduled_at)}</td><td className="p-4 capitalize">{v.status.replaceAll('_',' ')}</td><td className="max-w-72 whitespace-pre-wrap p-4">{v.feedback || '—'}</td></tr>)}</tbody></table>{!visits.length && <p className="p-8 text-center text-slate-500">No visit records match.</p>}</div><nav aria-label="Visit pages" className="mt-4 flex justify-between text-sm text-blue-700">{page>1 ? <Link href={pageLink(page-1)}>← Previous</Link> : <span />}{visits.length>50 && <Link href={pageLink(page+1)}>Next →</Link>}</nav></div></main>;
}
