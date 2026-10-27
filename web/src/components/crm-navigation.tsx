"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CrmDepartment } from "@/lib/departments";
import type { CrmRole } from "@/lib/current-user";

type NavigationProps = {
  role: CrmRole;
  department: CrmDepartment | null;
};

type NavigationItem = {
  label: string;
  href: string;
};

export default function CrmNavigation({
  role,
  department,
}: NavigationProps) {
  const pathname = usePathname();

  const isManager = role === "admin" || role === "manager";

  const managementLinks: NavigationItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "All Leads", href: "/leads" },
    { label: "School Leads", href: "/leads/school-owners" },
    { label: "Day Parents", href: "/leads/day-parents" },
    { label: "Boarding Parents", href: "/leads/boarding-parents" },
    { label: "Follow-ups", href: "/follow-ups" },
    { label: "My Day", href: "/my-day" },
    { label: "Partner Schools", href: "/partner-schools" },
    { label: "School Visits", href: "/visits" },
    { label: "Admissions", href: "/conversions" },
    { label: "Team", href: "/team" },
  ];

  const schoolLinks: NavigationItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "School Leads", href: "/leads/school-owners" },
    { label: "Partner Schools", href: "/partner-schools" },
    { label: "Follow-ups", href: "/follow-ups" },
    { label: "My Day", href: "/my-day" },
  ];

  const parentLinks: NavigationItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Day Parents", href: "/leads/day-parents" },
    { label: "Boarding Parents", href: "/leads/boarding-parents" },
    { label: "Follow-ups", href: "/follow-ups" },
    { label: "My Day", href: "/my-day" },
    { label: "School Visits", href: "/visits" },
    { label: "Admissions", href: "/conversions" },
  ];

  const links = isManager
    ? managementLinks
    : department === "school_partnerships"
      ? schoolLinks
      : department === "parent_admissions"
        ? parentLinks
        : [{ label: "Dashboard", href: "/dashboard" }];

  return (
    <nav
      aria-label="CRM navigation"
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-3">
        {links.map((item) => {
          const isLeadCategoryPage =
            pathname.startsWith("/leads/day-parents") ||
            pathname.startsWith("/leads/boarding-parents") ||
            pathname.startsWith("/leads/school-owners");

          const active =
            pathname === item.href ||
            (item.href === "/leads"
              ? pathname.startsWith("/leads/") && !isLeadCategoryPage
              : pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-blue-700 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}