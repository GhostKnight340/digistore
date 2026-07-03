"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAdminOrderCountsAction } from "@/app/actions/admin";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import AdminShell, { type AdminIdentity, type NavCounts } from "@/components/admin/AdminShell";

/**
 * Renders a standalone admin route (e.g. the order-detail page) inside the same
 * chrome as the dashboard. Sidebar navigation routes back to /admin with the
 * matching ?tab= deep link so the shell feels continuous across routes.
 */
export default function AdminShellRoute({
  active,
  admin,
  children,
}: {
  active: string;
  admin: AdminIdentity;
  children: ReactNode;
}) {
  const router = useRouter();
  const [navCounts, setNavCounts] = useState<NavCounts | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      setNavCounts(await getAdminOrderCountsAction());
    } catch (error) {
      console.error("Failed to load admin order counts", error);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);
  // Keep badges live on the standalone order-detail route too.
  useAutoRefresh(loadCounts, 10000);

  return (
    <AdminShell
      active={active}
      onNavigate={(id) => router.push(id === "overview" ? "/admin" : `/admin?tab=${id}`)}
      counts={navCounts}
      admin={admin}
    >
      {children}
    </AdminShell>
  );
}
