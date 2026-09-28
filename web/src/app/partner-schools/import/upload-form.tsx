"use client";

import { useState } from "react";
import Link from "next/link";

type Preview = { total: number; ready: number; duplicates: number; invalid: number;
  issues: { row: number; message: string }[];
  sample: { name: string; type: string; city: string | null; state: string | null }[] };
type Result = { imported: number; skipped: number };

export default function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(mode: "preview" | "import") {
    if (!file || loading) return;
    setLoading(true); setError("");
    const form = new FormData(); form.set("file", file); form.set("mode", mode);
    try {
      const response = await fetch("/api/partner-schools/import", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Import failed");
      if (mode === "preview") { setPreview(body as Preview); setResult(null); }
      else { setResult(body as Result); setPreview(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed"); }
    finally { setLoading(false); }
  }

  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <label htmlFor="file" className="block text-sm font-medium">Select .xlsx file</label>
    <input id="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); setError(""); }}
      className="mt-2 block w-full rounded-lg border border-slate-300 p-2 text-sm" />
    <button type="button" disabled={!file || loading} onClick={() => submit("preview")}
      className="mt-5 rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
      {loading ? "Checking…" : "Preview import"}</button>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {preview && <div className="mt-6 border-t border-slate-200 pt-5">
      <h2 className="font-semibold">Preview</h2>
      <p className="mt-2 text-sm text-slate-700">{preview.total} school rows · {preview.ready} new · {preview.duplicates} duplicates to skip · {preview.invalid} invalid</p>
      {preview.issues.length > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><strong>Fix these rows and upload again:</strong><ul className="mt-2 list-inside list-disc">{preview.issues.map((issue) => <li key={issue.row}>Row {issue.row}: {issue.message}</li>)}</ul></div>}
      {preview.sample.length > 0 && <div className="mt-4"><p className="text-sm font-medium">First new schools</p><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{preview.sample.map((school, index) => <li key={`${school.name}-${index}`}>{school.name} · {school.type} · {[school.city, school.state].filter(Boolean).join(", ") || "Location pending"}</li>)}</ul></div>}
      <button type="button" disabled={loading || preview.invalid > 0 || preview.ready === 0} onClick={() => submit("import")}
        className="mt-5 rounded-lg bg-green-700 px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Importing…" : `Import ${preview.ready} new schools`}</button>
    </div>}
    {result && <div role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">
      Imported {result.imported} schools; skipped {result.skipped} duplicates. <Link href="/partner-schools" className="font-semibold underline">View partner schools</Link>
    </div>}
  </section>;
}
