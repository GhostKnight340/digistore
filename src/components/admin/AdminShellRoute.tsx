"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAdminNavCountsAction } from "@/app/actions/admin";
import AdminShell, {
  ADMIN_STANDALONE_ROUTES,
  type AdminIdentity,
  type NavCounts,
} from "@/components/admin/AdminShell";

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

  useEffect(() => {
    let cancelled = false;
    getAdminNavCountsAction()
      .then((counts) => {
        if (!cancelled) setNavCounts(counts);
      })
      .catch((error) => console.error("Failed to load admin nav counts", error));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell
      active={active}
      onNavigate={(id) =>
        router.push(
          ADMIN_STANDALONE_ROUTES[id] ?? (id === "overview" ? "/admin" : `/admin?tab=${id}`),
        )
      }
      counts={navCounts}
      admin={admin}
    >
      {/* Standalone routes need their own scroll region: the shell's content
          slot is overflow:hidden (the dashboard supplies this wrapper itself). */}
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div className="admin-panel-pad" style={{ padding: "26px 28px" }}>
          {children}
        </div>
      </div>
    </AdminShell>
  );
}
