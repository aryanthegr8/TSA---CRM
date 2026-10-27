import type { ReactNode } from "react";
import CrmShell from "@/components/crm-shell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CrmShell>{children}</CrmShell>;
}