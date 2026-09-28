import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-blue-700">THE SCHOOL ADMISSION</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">CRM sign in</h1>
        <p className="mt-2 text-sm text-slate-600">For authorised counsellors and managers.</p>
        {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Invalid email or password. Please try again.</p>}
        <form action={login} className="mt-7 space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-800">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
          <div><label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-800">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white hover:bg-blue-800">Sign in</button>
        </form>
      </div>
    </main>
  );
}
