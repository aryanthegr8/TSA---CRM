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

interface DepartmentSummary extends RowDataPacket {
  category: string;
  active_leads: number;
  unassigned_leads: number;
  pending_tasks: number;
  overdue_tasks: number;
}

interface CounsellorWorkload extends RowDataPacket {
  id: number;
  name: string;
  department: string | null;
  active_leads: number;
  pending_tasks: number;
  overdue_tasks: number;
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


  let departmentSummary: DepartmentSummary[] = [];

  if (isManager) {
    const [rows] = await db.execute<DepartmentSummary[]>(
      `
      SELECT
        d.category,

        (
          SELECT COUNT(*)
          FROM leads l
          LEFT JOIN school_partnerships sp ON sp.lead_id = l.id
          WHERE (${activeLeadSql})
            AND (
              (d.category = 'school_partnerships'
                AND l.enquiry_category = 'school_owner')
              OR
              (d.category = 'parent_admissions'
                AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
            )
        ) AS active_leads,

        (
          SELECT COUNT(*)
          FROM leads l
          LEFT JOIN school_partnerships sp ON sp.lead_id = l.id
          WHERE (${activeLeadSql})
            AND l.owner_id IS NULL
            AND (
              (d.category = 'school_partnerships'
                AND l.enquiry_category = 'school_owner')
              OR
              (d.category = 'parent_admissions'
                AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
            )
        ) AS unassigned_leads,

        (
          SELECT COUNT(*)
          FROM tasks t
          JOIN leads l ON l.id = t.lead_id
          LEFT JOIN school_partnerships sp ON sp.lead_id = l.id
          LEFT JOIN referrals r ON r.id = t.referral_id
          WHERE t.completed_at IS NULL
            AND (${activeLeadSql})
            AND (
              t.referral_id IS NULL
              OR r.status NOT IN ('not_proceeding', 'admitted')
            )
            AND (
              (d.category = 'school_partnerships'
                AND l.enquiry_category = 'school_owner')
              OR
              (d.category = 'parent_admissions'
                AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
            )
        ) AS pending_tasks,

        (
          SELECT COUNT(*)
          FROM tasks t
          JOIN leads l ON l.id = t.lead_id
          LEFT JOIN school_partnerships sp ON sp.lead_id = l.id
          LEFT JOIN referrals r ON r.id = t.referral_id
          WHERE t.completed_at IS NULL
            AND (${activeLeadSql})
            AND t.due_at < ?
            AND (
              t.referral_id IS NULL
              OR r.status NOT IN ('not_proceeding', 'admitted')
            )
            AND (
              (d.category = 'school_partnerships'
                AND l.enquiry_category = 'school_owner')
              OR
              (d.category = 'parent_admissions'
                AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
            )
        ) AS overdue_tasks

      FROM (
        SELECT 'school_partnerships' AS category
        UNION ALL
        SELECT 'parent_admissions' AS category
      ) d
      `,
      [nowSql]
    );

    departmentSummary = rows;
  }
  let counsellorWorkload: CounsellorWorkload[] = [];

if (isManager) {
  const [rows] = await db.execute<CounsellorWorkload[]>(
    `
    SELECT
      u.id,
      u.name,
      u.department,

      (
        SELECT COUNT(*)
        FROM leads l
        LEFT JOIN school_partnerships sp
          ON sp.lead_id = l.id
        WHERE l.owner_id = u.id
          AND (${activeLeadSql})
          AND (
            (u.department = 'school_partnerships'
              AND l.enquiry_category = 'school_owner')
            OR
            (u.department = 'parent_admissions'
              AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
          )
      ) AS active_leads,

      (
        SELECT COUNT(*)
        FROM tasks t
        JOIN leads l ON l.id = t.lead_id
        LEFT JOIN school_partnerships sp
          ON sp.lead_id = l.id
        LEFT JOIN referrals r ON r.id = t.referral_id
        WHERE t.owner_id = u.id
          AND l.owner_id = u.id
          AND t.completed_at IS NULL
          AND (${activeLeadSql})
          AND (
            t.referral_id IS NULL
            OR r.status NOT IN ('not_proceeding', 'admitted')
          )
          AND (
            (u.department = 'school_partnerships'
              AND l.enquiry_category = 'school_owner')
            OR
            (u.department = 'parent_admissions'
              AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
          )
      ) AS pending_tasks,

      (
        SELECT COUNT(*)
        FROM tasks t
        JOIN leads l ON l.id = t.lead_id
        LEFT JOIN school_partnerships sp
          ON sp.lead_id = l.id
        LEFT JOIN referrals r ON r.id = t.referral_id
        WHERE t.owner_id = u.id
          AND l.owner_id = u.id
          AND t.completed_at IS NULL
          AND t.due_at < ?
          AND (${activeLeadSql})
          AND (
            t.referral_id IS NULL
            OR r.status NOT IN ('not_proceeding', 'admitted')
          )
          AND (
            (u.department = 'school_partnerships'
              AND l.enquiry_category = 'school_owner')
            OR
            (u.department = 'parent_admissions'
              AND l.enquiry_category IN ('day_parent', 'boarding_parent'))
          )
      ) AS overdue_tasks

    FROM crm_users u
    WHERE u.role = 'counsellor'
      AND u.is_active = 1
    ORDER BY u.department, u.name
    `,
    [nowSql]
  );

  counsellorWorkload = rows;
}

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

        {isManager && (
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-bold">Department Overview</h3>
          <p className="mt-1 text-sm text-slate-500">
            Compare active leads and follow-up workloads across departments.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {departmentSummary.map((department) => {
            const isSchoolDepartment =
              department.category === "school_partnerships";

            const departmentName = isSchoolDepartment
              ? "School Partnerships"
              : "Parent Admissions";

            return (
              <div
                key={department.category}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h4 className="text-lg font-bold">{departmentName}</h4>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Active Leads</p>
                    <p className="mt-1 text-3xl font-bold">
                      {Number(department.active_leads)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Pending Tasks</p>
                    <p className="mt-1 text-3xl font-bold">
                      {Number(department.pending_tasks)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Unassigned Leads</p>
                    <p className="mt-1 text-2xl font-bold text-amber-700">
                      {Number(department.unassigned_leads)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Overdue Tasks</p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">
                      {Number(department.overdue_tasks)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-4 border-t pt-4">
                  {isSchoolDepartment ? (
                    <>
                      <Link
                        href="/leads/school-owners"
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        School Leads →
                      </Link>

                      <Link
                        href="/follow-ups?category=school_owner"
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        Follow-ups →
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/leads/day-parents"
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        Day Parents →
                      </Link>

                      <Link
                        href="/leads/boarding-parents"
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        Boarding Parents →
                      </Link>

                      <Link
                        href="/follow-ups"
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        Follow-up Board →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    )}

        {isManager && (
          <section className="mt-10">
            <div>
              <h3 className="text-xl font-bold">Counsellor Workload</h3>

              <p className="mt-1 text-sm text-slate-500">
                Monitor active leads and pending follow-ups assigned to each counsellor.
              </p>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Counsellor</th>
                    <th className="px-5 py-4">Department</th>
                    <th className="px-5 py-4">Active Leads</th>
                    <th className="px-5 py-4">Pending Tasks</th>
                    <th className="px-5 py-4">Overdue Tasks</th>
                    <th className="px-5 py-4">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {counsellorWorkload.map((counsellor) => (
                    <tr
                      key={counsellor.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {counsellor.name}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {counsellor.department === "school_partnerships"
                          ? "School Partnerships"
                          : counsellor.department === "parent_admissions"
                            ? "Parent Admissions"
                            : "Not assigned"}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {Number(counsellor.active_leads)}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {Number(counsellor.pending_tasks)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            Number(counsellor.overdue_tasks) > 0
                              ? "font-bold text-rose-700"
                              : "text-slate-600"
                          }
                        >
                          {Number(counsellor.overdue_tasks)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/follow-ups?owner=${counsellor.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          View Tasks →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {counsellorWorkload.length === 0 && (
                <p className="p-6 text-sm text-slate-500">
                  No active counsellors found.
                </p>
              )}
            </div>
          </section>
        )}

        {isManager && (
          <section className="mt-10">
            <div>
              <h3 className="text-xl font-bold">
                Management Quick Actions
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Identify unassigned enquiries and follow-ups that need attention.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "Overdue Follow-ups",
                  description: "Review overdue tasks across all departments.",
                  href: "/follow-ups?period=overdue",
                  tone: "border-rose-200 bg-rose-50 text-rose-800",
                },
                {
                  label: "School Leads Without Next Action",
                  description: "School partnership enquiries needing scheduling.",
                  href: "/leads/school-owners?view=all&work=no_next",
                  tone: "border-amber-200 bg-amber-50 text-amber-800",
                },
                {
                  label: "Day Parents Without Next Action",
                  description: "Day-school enquiries needing scheduling.",
                  href: "/leads/day-parents?view=all&work=no_next",
                  tone: "border-amber-200 bg-amber-50 text-amber-800",
                },
                {
                  label: "Boarding Parents Without Next Action",
                  description: "Boarding enquiries needing scheduling.",
                  href: "/leads/boarding-parents?view=all&work=no_next",
                  tone: "border-amber-200 bg-amber-50 text-amber-800",
                },
                {
                  label: "Unassigned School Leads",
                  description: "School partnership enquiries awaiting assignment.",
                  href: "/leads/school-owners?view=all&work=unassigned",
                  tone: "border-blue-200 bg-blue-50 text-blue-800",
                },
                {
                  label: "Unassigned Day Parents",
                  description: "Day-school enquiries awaiting assignment.",
                  href: "/leads/day-parents?view=all&work=unassigned",
                  tone: "border-violet-200 bg-violet-50 text-violet-800",
                },
                {
                  label: "Unassigned Boarding Parents",
                  description: "Boarding enquiries awaiting assignment.",
                  href: "/leads/boarding-parents?view=all&work=unassigned",
                  tone: "border-violet-200 bg-violet-50 text-violet-800",
                },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`rounded-2xl border p-5 transition hover:shadow-md ${action.tone}`}
                >
                  <p className="text-sm font-bold">
                    {action.label} →
                  </p>

                  <p className="mt-2 text-xs opacity-80">
                    {action.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

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