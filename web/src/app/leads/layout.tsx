import type { ReactNode } from "react";
import CrmShell from "@/components/crm-shell";

export default function LeadsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CrmShell>{children}</CrmShell>;
}