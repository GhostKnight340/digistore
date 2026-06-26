"use client";

import { useEditor } from "@/lib/editor/EditorContext";
import type { StoreSettings } from "@/lib/storeSettings";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

type HomepageBoolKey = {
  [K in keyof StoreSettings["homepage"]]: StoreSettings["homepage"][K] extends boolean ? K : never;
}[keyof StoreSettings["homepage"]];

type Props = {
  sectionKey: HomepageBoolKey;
  label: string;
  children: React.ReactNode;
};

export default function SectionWrapper({ sectionKey, label, children }: Props) {
  const { draft, previewMode, set } = useEditor();
  const visible = draft.homepage[sectionKey] as boolean;

  const toggle = (next: boolean) =>
    set((s) => ({
      ...s,
      homepage: { ...s.homepage, [sectionKey]: next },
    }));

  if (previewMode) {
    return visible ? <>{children}</> : null;
  }

  if (!visible) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-xl border border-dashed border-border px-5 py-3.5 transition-opacity opacity-50 hover:opacity-80">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-xs text-faint">— hidden</span>
        <ToggleSwitch
          className="ml-auto"
          checked={visible}
          onChange={toggle}
          checkedLabel="Visible"
          uncheckedLabel="Masqué"
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="group/section relative">
      <div className="pointer-events-none absolute -inset-x-3 -inset-y-2 rounded-2xl border border-transparent transition-colors group-hover/section:border-accent/15" />
      <div className="absolute right-0 top-0 z-10 -translate-y-1/2 flex items-center gap-1 opacity-0 transition-opacity group-hover/section:opacity-100 pointer-events-auto">
        <span className="rounded-full border border-border bg-background/95 px-2.5 py-0.5 text-[11px] font-medium text-muted backdrop-blur-sm">
          {label}
        </span>
        <ToggleSwitch
          checked={visible}
          onChange={toggle}
          checkedLabel="Visible"
          uncheckedLabel="Masqué"
          size="sm"
        />
      </div>
      {children}
    </div>
  );
}
