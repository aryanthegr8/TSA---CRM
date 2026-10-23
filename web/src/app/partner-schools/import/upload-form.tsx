"use client";

import { useState } from "react";
import Link from "next/link";

type Preview = { total: number; ready: number; updates: number; unchanged: number; duplicates: number;
  conflicts: number; conflictRows: { row: number; reason: string }[];
  sample: { name: string; type: string; city: string | null; state: string | null }[] };
type Result = { imported: number; updated: number; unchanged: number; skipped: number };

export default function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<{ row: number; message?: string; reason?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  async function submit(mode: "preview" | "import") {
    if (!file || loading) return;
    setLoading(true); setError(""); setIssues([]);
    const form = new FormData(); form.set("file", file); form.set("mode", mode);
    try {
      const response = await fetch("/api/partner-schools/import", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setIssues(body.issues || body.conflictRows || []);
        throw new Error(body.error || "Import failed");
      }
      if (mode === "preview") { setPreview(body as Preview); setResult(null); }
      else { setResult(body as Result); setPreview(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed"); }
    finally { setLoading(false); }
  }
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <label htmlFor="file" className="block text-sm font-medium">Select .xlsx file</label>
    <input id="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); setError(""); setIssues([]); }}
      className="mt-2 block w-full rounded-lg border border-slate-300 p-2 text-sm" />
    <button type="button" disabled={!file || loading} onClick={() => submit("preview")}
      className="mt-5 rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white disabled:opacity-50">
      {loading ? "Checking…" : "Preview import"}</button>
    {error && <div role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}
      {issues.length > 0 && <ul className="mt-2 list-disc pl-5">{issues.map((i) => <li key={i.row}>Row {i.row}: {i.message || i.reason}</li>)}</ul>}
    </div>}
    {preview && <div className="mt-6 border-t border-slate-200 pt-5">
      <h2 className="font-semibold">Preview</h2>
      <p className="mt-2 text-sm text-slate-700">{preview.total} rows · {preview.ready} new · {preview.updates} fill missing fields · {preview.unchanged} unchanged · {preview.duplicates} duplicate Excel rows · {preview.conflicts} require review</p>
      {preview.conflicts > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        Resolve possible duplicates before importing. No changes will be saved while conflicts remain.
        <ul className="mt-2 list-disc pl-5">{preview.conflictRows.map((i) => <li key={i.row}>Row {i.row}: {i.reason}</li>)}</ul>
      </div>}
      {preview.sample.length > 0 && <div className="mt-4"><p className="text-sm font-medium">First new schools</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{preview.sample.map((school, index) => <li key={`${school.name}-${index}`}>{school.name} · {school.type} · {[school.city, school.state].filter(Boolean).join(", ") || "Location pending"}</li>)}</ul>
      </div>}
      <button type="button" disabled={loading || preview.conflicts > 0 || (preview.ready === 0 && preview.updates === 0)} onClick={() => submit("import")}
        className="mt-5 rounded-lg bg-green-700 px-4 py-2.5 font-medium text-white disabled:opacity-50">
        {loading ? "Importing…" : `Import ${preview.ready} new and fill ${preview.updates} existing`}</button>
    </div>}
    {result && <div role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">
      Added {result.imported} schools; filled missing fields in {result.updated}; unchanged {result.unchanged}; duplicate Excel rows skipped {result.skipped}. <Link href="/partner-schools" className="font-semibold underline">View partner schools</Link>
    </div>}
  </section>;
}
