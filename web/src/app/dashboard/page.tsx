import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { departments } from "@/lib/departments";
import {
  activeLeadSql,
  dayBounds,
  indiaDateKey,
} from "@/lib/lead-workspace";
import {
  parseTaskFilters,
  taskFrom,
  taskScope,
  whereSql,
  workspaceFrom,
} from "@/lib/lead-workspace-queries";
import { logout } from "./actions";

interface LeadCounts extends RowDataPacket {
  total: number;
  school_owner: number;
  day_parent: number;
  boarding_parent: number;
  unassigned: number;
}

interface TaskCounts extends RowDataPacket {
  total: number;
  overdue: number;
  today: number;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const isManager = user.role === "admin" || user.role === "manager";
  const isSchool = !isManager && user.department === "school_partnerships";
  const isParent = !isManager && user.department === "parent_admissions";

  const title = isManager
    ? "Management Dashboard"
    : isSchool
      ? "School Partnerships Dashboard"
      : isParent
        ? "Parent Admissions Dashboard"
        : "Dashboard";

  const leadWhere = [`(${activeLeadSql})`];
  const leadArgs: (string | number)[] = [];

  if (!isManager) {
    leadWhere.push("l.owner_id = ?");
    leadArgs.push(user.id);

    if (isSchool) {
      leadWhere.push("l.enquiry_category = 'school_owner'");
    } else if (isParent) {
      leadWhere.push(
        "l.enquiry_category IN ('day_parent', 'boarding_parent')"
      );
    } else {
      leadWhere.push("1 = 0");
    }
  }

  const now = new Date();
  const today = dayBounds(indiaDateKey(now));
  const nowSql = now.toISOString().slice(0, 23).replace("T", " ");

  const filters = parseTaskFilters({});
  const scope = taskScope(user, filters, now);

  const [leadResult, taskResult] = await Promise.all([
    db.execute<LeadCounts[]>(
      `
      SELECT
        COUNT(DISTINCT l.id) AS total,
        COUNT(DISTINCT CASE
          WHEN l.enquiry_category = 'school_owner' THEN l.id
        END) AS school_owner,
        COUNT(DISTINCT CASE
          WHEN l.enquiry_category = 'day_parent' THEN l.id
        END) AS day_parent,
        COUNT(DISTINCT CASE
          WHEN l.enquiry_category = 'boarding_parent' THEN l.id
        END) AS boarding_parent,
        COUNT(DISTINCT CASE
          WHEN l.owner_id IS NULL THEN l.id
        END) AS unassigned
      ${workspaceFrom}
      WHERE ${leadWhere.join(" AND ")}
      `,
      leadArgs
    ),

    db.execute<TaskCounts[]>(
      `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(
          CASE WHEN t.due_at < ? THEN 1 ELSE 0 END
        ), 0) AS overdue,
        COALESCE(SUM(
          CASE
            WHEN t.due_at >= ? AND t.due_at < ?
            THEN 1 ELSE 0
          END
        ), 0) AS today
      ${taskFrom}
      ${whereSql(scope)}
      `,
      [nowSql, nowSql, today.end, ...scope.args]
    ),
  ]);

  const leads = leadResult[0][0];
  const tasks = taskResult[0][0];

  const cards = [
    {
      label: "Active Leads",
      value: leads?.total ?? 0,
      href: "/leads",
      visible: true,
    },
    {
      label: "School Partnership Leads",
      value: leads?.school_owner ?? 0,
      href: "/leads/school-owners",
      visible: isManager || isSchool,
    },
    {
      label: "Day School Parents",
      value: leads?.day_parent ?? 0,
      href: "/leads/day-parents",
      visible: isManager || isParent,
    },
    {
      label: "Boarding School Parents",
      value: leads?.boarding_parent ?? 0,
      href: "/leads/boarding-parents",
      visible: isManager || isParent,
    },
    {
      label: "Today's Follow-ups",
      value: tasks?.today ?? 0,
      href: "/follow-ups?period=today",
      visible: true,
    },
    {
      label: "Overdue Follow-ups",
      value: tasks?.overdue ?? 0,
      href: "/follow-ups?period=overdue",
      visible: true,
    },
    {
      label: "Unassigned Active Leads",
      value: leads?.unassigned ?? 0,
      href: "/leads",
      visible: isManager,
    },
  ].filter((card) => card.visible);

  const shortcuts = [
    { label: "Follow-up Board", href: "/follow-ups", show: true },
    { label: "My Day", href: "/my-day", show: true },
    { label: "Lead Inbox", href: "/leads", show: true },
    {
      label: "School Owner Leads",
      href: "/leads/school-owners",
      show: isManager || isSchool,
    },
    {
      label: "Day School Parents",
      href: "/leads/day-parents",
      show: isManager || isParent,
    },
    {
      label: "Boarding School Parents",
      href: "/leads/boarding-parents",
      show: isManager || isParent,
    },
    {
      label: "Partner Schools",
      href: "/partner-schools",
      show: isManager || isSchool,
    },
    {
      label: "School Visits",
      href: "/visits",
      show: isManager || isParent,
    },
    {
      label: "Confirmed Admissions",
      href: "/conversions",
      show: isManager || isParent,
    },
    {
      label: "Team Management",
      href: "/team",
      show: isManager,
    },
  ].filter((item) => item.show);

  const departmentLabel =
    user.department && user.department in departments
      ? departments[user.department]
      : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <p className="text-sm font-bold text-blue-700">
              THE SCHOOL ADMISSION
            </p>
            <h1 className="text-xl font-bold">TSA CRM</h1>
          </div>

          <form action={logout}>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            {isManager ? "Management Workspace" : departmentLabel ?? "Workspace"}
          </p>

          <h2 className="mt-2 text-3xl font-bold">{title}</h2>

          <p className="mt-2 text-slate-600">
            Welcome back, {user.name}. Here&apos;s your current CRM overview.
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <p className="text-sm font-medium text-slate-500">
                {card.label}
              </p>

              <p className="mt-3 text-4xl font-bold">
                {Number(card.value)}
              </p>

              <p className="mt-4 text-sm font-medium text-blue-700">
                View details →
              </p>
            </Link>
          ))}
        </section>

        <section className="mt-10">
          <h3 className="text-xl font-bold">Quick Actions</h3>

          <p className="mt-1 text-sm text-slate-500">
            Open the tools relevant to your daily work.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {shortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm transition hover:border-blue-300 hover:text-blue-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h3 className="text-lg font-bold">Daily Work Summary</h3>

          <p className="mt-2 text-sm text-slate-700">
            You have {Number(tasks?.today ?? 0)} follow-ups scheduled
            for today and {Number(tasks?.overdue ?? 0)} overdue tasks.
          </p>

          <Link
            href="/follow-ups"
            className="mt-4 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Open Follow-up Board
          </Link>
        </section>
      </div>
    </main>
  );
}