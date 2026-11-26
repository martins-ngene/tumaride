import type { ReactNode } from "react";
import { DashboardSession } from "@/features/dashboard/dashboard-session";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardSession>{children}</DashboardSession>;
}
