import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { requireAdminCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import AdminSidebar from "@/components/admin/shell/AdminSidebar";
import AdminTopbar from "@/components/admin/shell/AdminTopbar";
import ToastProvider from "@/components/admin/ui/Toast";

export const dynamic = "force-dynamic";

async function getNavCounts() {
  try {
    const [orders, review] = await Promise.all([
      prisma.order.count({
        where: {
          status: { in: ["pending_payment", "payment_submitted", "payment_confirmed"] },
        },
      }),
      prisma.order.count({ where: { status: "payment_submitted" } }),
    ]);
    return { orders, review };
  } catch {
    return { orders: 0, review: 0 };
  }
}

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [customer, counts] = await Promise.all([
    requireAdminCustomer(),
    getNavCounts(),
  ]);

  return (
    <div
      className={`${GeistSans.variable} ${GeistMono.variable} fixed inset-0 z-0 flex h-dvh w-full overflow-hidden bg-admin-app text-text antialiased`}
      style={
        {
          "--font-sans": "var(--font-geist-sans)",
          "--font-mono": "var(--font-geist-mono)",
        } as React.CSSProperties
      }
    >
      <ToastProvider>
        <AdminSidebar
          counts={counts}
          user={{ name: customer.name, email: customer.email }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </ToastProvider>
    </div>
  );
}
