import type { ReactNode } from "react";
import CrmShell from "@/components/crm-shell";

export default function VisitsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CrmShell>{children}</CrmShell>;
}