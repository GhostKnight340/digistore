"use client";

import Link from "next/link";
import SettingsPanel from "@/components/admin/SettingsPanel";

export default function HomepageEditorPage() {
  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Homepage editor</h1>
          <p className="mt-1 text-sm text-muted">
            Branding, section visibility, category settings, and featured products.
          </p>
        </div>
        <Link
          href="/admin"
          className="btn-ghost text-sm"
        >
          ← Admin dashboard
        </Link>
      </div>

      <SettingsPanel />
    </div>
  );
}
