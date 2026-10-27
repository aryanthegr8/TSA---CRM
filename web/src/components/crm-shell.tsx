import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { departments } from "@/lib/departments";
import CrmNavigation from "@/components/crm-navigation";
import { logout } from "@/app/dashboard/actions";

type CrmShellProps = {
  children: ReactNode;
};

export default async function CrmShell({ children }: CrmShellProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isManager = user.role === "admin" || user.role === "manager";

  const workspace = isManager
    ? "Management"
    : user.department
      ? departments[user.department]
      : "CRM";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              The School Admission
            </p>

            <p className="text-xl font-bold text-slate-950">
              TSA CRM
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                {user.name}
              </p>

              <p className="text-xs text-slate-500">
                {workspace} Workspace
              </p>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <CrmNavigation
        role={user.role}
        department={user.department}
      />

      {children}
    </div>
  );
}