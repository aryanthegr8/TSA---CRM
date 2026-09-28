import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import ImportForm from "./upload-form";

export default async function ImportSchoolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "counsellor") redirect("/partner-schools");
  return <main className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900"><div className="mx-auto max-w-3xl">
    <Link href="/partner-schools" className="text-sm text-blue-700 hover:underline">← Partner schools</Link>
    <h1 className="mt-3 text-3xl font-bold">Import partner schools</h1>
    <p className="mt-2 text-slate-600">Upload an Excel .xlsx file, check the preview, then import all valid new schools in one step.</p>
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Excel column headings</h2>
      <p className="mt-2 text-sm text-slate-600">Put the headings in the first row of the first sheet. Each school goes on one row.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[450px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="px-3 py-2">Required</th><th className="px-3 py-2">Optional</th></tr></thead><tbody><tr className="align-top"><td className="px-3 py-3">School Name<br />School Type</td><td className="px-3 py-3">City, State, Board, Classes Offered, Fee Note, Internal Notes, Contact Name, Contact Phone, Contact Email</td></tr></tbody></table></div>
      <p className="mt-3 text-sm text-slate-600">School Type accepts <strong>Day</strong>, <strong>Boarding</strong>, <strong>Residential</strong>, or <strong>Both</strong>. Use +91 with contact phone numbers. School Name + City + State is used to identify duplicates.</p>
      <p className="mt-2 text-sm text-slate-600">Maximum 2 MB and 2,000 school rows. Invalid rows block the import; duplicates are skipped. Existing partner records are not overwritten.</p>
    </section>
    <ImportForm />
  </div></main>;
}
