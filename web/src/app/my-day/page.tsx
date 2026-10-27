import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

import {
  indiaDateKey,
  indiaDateLabel,
  indiaTime,
  dayBounds,
  followUpHref,
} from "@/lib/lead-workspace";

import {
  parseTaskFilters,
  taskScope,
  taskFrom,
  whereSql,
} from "@/lib/lead-workspace-queries";

interface MyTask extends RowDataPacket {
  id: number;
  lead_id: number;
  referral_id: number | null;
  task_type: string;
  title: string;
  due_at: Date;
  enquiry_category: string;
  parent_name: string | null;
  primary_phone: string | null;
  student_name: string | null;
  school_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
}

const taskLabels: Record<string, string> = {
  call_parent: "Parent callback",
  message_parent: "Message parent",
  contact_school: "School contact",
  application: "Application follow-up",
  other: "Other task",
};

const categoryLabels: Record<string, string> = {
  day_parent: "Day-school parent",
  boarding_parent: "Boarding parent",
  school_owner: "School owner",
  general: "Other enquiry",
};

export default async function MyDayPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const today = indiaDateKey(now);
  const bounds = dayBounds(today);

  // Reuse the existing task permission rules.
  const filters = parseTaskFilters({});

  const scope = taskScope(user, filters, now);

  // My Day is personal, including for admins and managers.
  // Counsellors are already restricted by taskScope().
  if (user.role !== "counsellor") {
    scope.where.push("t.owner_id=?");
    scope.args.push(user.id);
  }

  const nowSql = now.toISOString().slice(0, 23).replace("T", " ");

  const [[countRows], [tasks]] = await Promise.all([
    db.execute<CountRow[]>(
      `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(CASE WHEN t.due_at < ? THEN 1 ELSE 0 END),
          0
        ) AS overdue,

        COALESCE(
          SUM(
            CASE
              WHEN t.due_at >= ?
               AND t.due_at < ?
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS today,

        COALESCE(
          SUM(CASE WHEN t.due_at >= ? THEN 1 ELSE 0 END),
          0
        ) AS upcoming

      ${taskFrom}
      ${whereSql(scope)}
      `,
      [
        nowSql,
        nowSql,
        bounds.end,
        bounds.end,
        ...scope.args,
      ]
    ),

    db.execute<MyTask[]>(
      `
      SELECT
        t.id,
        t.lead_id,
        t.referral_id,
        t.task_type,
        t.title,
        t.due_at,

        l.enquiry_category,
        l.student_name,

        f.parent_name,
        f.primary_phone,

        sp.school_name,
        sp.contact_name,
        sp.contact_phone

      ${taskFrom}
      ${whereSql(scope)}

      ORDER BY t.due_at ASC, t.id ASC

      LIMIT 100
      `,
      scope.args
    ),
  ]);

  const counts = countRows[0];

  const overdueTasks = tasks.filter(
    (task) => new Date(task.due_at) < now
  );

  const todayTasks = tasks.filter((task) => {
    const due = new Date(task.due_at);

    return due >= now && indiaDateKey(due) === today;
  });

  const upcomingTasks = tasks.filter(
    (task) => indiaDateKey(task.due_at) > today
  );

  function renderTask(task: MyTask) {
    const isSchool = task.enquiry_category === "school_owner";
    const overdue = new Date(task.due_at) < now;

    const name = isSchool
      ? task.school_name || "School name to confirm"
      : task.parent_name || "Parent name to confirm";

    const contact = isSchool
      ? task.contact_name || "School contact"
      : task.student_name || "Student to confirm";

    const phone = isSchool
      ? task.contact_phone || task.primary_phone
      : task.primary_phone;

    return (
      <article
        key={task.id}
        className={`rounded-xl border border-l-4 bg-white p-4 shadow-sm ${
          overdue
            ? "border-l-rose-500 border-slate-200"
            : "border-l-blue-500 border-slate-200"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {categoryLabels[task.enquiry_category] ||
                task.enquiry_category}
              {" · "}
              Lead #{task.lead_id}
            </p>

            <Link
              href={followUpHref(task)}
              className="mt-1 inline-block font-semibold text-slate-900 hover:text-blue-700 hover:underline"
            >
              {name}
            </Link>

            <p className="mt-1 text-sm text-slate-500">{contact}</p>

            {phone && (
              <a
                href={`tel:${phone}`}
                className="mt-1 inline-block text-sm text-blue-700 hover:underline"
              >
                {phone}
              </a>
            )}
          </div>

          <div className="text-right">
            <p
              className={`font-bold ${
                overdue ? "text-rose-700" : "text-blue-700"
              }`}
            >
              {indiaTime(task.due_at)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {indiaDateLabel(task.due_at)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="font-medium text-slate-800">{task.title}</p>

          <p className="mt-1 text-xs text-slate-500">
            {taskLabels[task.task_type] || task.task_type}
          </p>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <Link
            href={followUpHref(task)}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            Open lead & record update →
          </Link>
        </div>
      </article>
    );
  }

  function renderSection(
    title: string,
    items: MyTask[],
    emptyMessage: string,
    viewAllHref: string
  ) {
    return (
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>

          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            View all →
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {items.map(renderTask)}
          </div>
        )}
      </section>
    );
  }

  const followUpOwner = new URLSearchParams({
    owner: String(user.id),
  });

  const followUpLink = (period: string) => {
    const params = new URLSearchParams(followUpOwner);
    params.set("period", period);

    return `/follow-ups?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Personal workspace
            </p>

            <h1 className="mt-2 text-3xl font-bold">My Day</h1>

            <p className="mt-2 text-sm text-slate-500">
              {indiaDateLabel(now)}
              {" · "}
              {user.name}
            </p>
          </div>

          <Link
            href={followUpLink("all")}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Full follow-up board →
          </Link>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Pending tasks",
              value: counts?.total ?? 0,
              tone: "text-slate-900",
            },
            {
              label: "Overdue",
              value: counts?.overdue ?? 0,
              tone: "text-rose-700",
            },
            {
              label: "Due later today",
              value: counts?.today ?? 0,
              tone: "text-amber-700",
            },
            {
              label: "Upcoming",
              value: counts?.upcoming ?? 0,
              tone: "text-blue-700",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-500">
                {card.label}
              </p>

              <p className={`mt-3 text-3xl font-bold ${card.tone}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {renderSection(
          "Overdue tasks",
          overdueTasks,
          "No overdue tasks. You're all caught up!",
          followUpLink("overdue")
        )}

        {renderSection(
          "Due later today",
          todayTasks,
          "No remaining tasks scheduled for today.",
          followUpLink("today")
        )}

        {renderSection(
          "Upcoming tasks",
          upcomingTasks,
          "No upcoming tasks scheduled.",
          followUpLink("all")
        )}

        {tasks.length === 100 && (
          <p className="mt-6 text-sm text-amber-700">
            Showing the first 100 pending tasks. Open the full follow-up
            board to see additional tasks.
          </p>
        )}
      </div>
    </main>
  );
}