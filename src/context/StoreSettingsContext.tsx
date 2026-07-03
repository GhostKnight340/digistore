"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  defaultStoreSettings,
  mergeStoreSettings,
  type StoreSettings,
} from "@/lib/storeSettings";
import { saveStoreSettingsAction } from "@/app/actions/catalog";

type SaveResult = { ok: boolean; error?: string };

type StoreSettingsContextValue = {
  settings: StoreSettings;
  ready: boolean;
  saveSettings: (settings: StoreSettings) => Promise<SaveResult>;
  resetSettings: () => Promise<SaveResult>;
};

const StoreSettingsContext = createContext<StoreSettingsContextValue | null>(
  null,
);

function applyTheme(settings: StoreSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--store-accent", settings.theme.accentColor);
  root.style.setProperty("--store-bg", settings.theme.backgroundColor);
  root.style.setProperty("--store-card-radius", settings.theme.cardRadius);
  root.style.setProperty("--store-button-radius", settings.theme.buttonRadius);
}

export function StoreSettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings?: StoreSettings;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const initial = mergeStoreSettings(initialSettings ?? defaultStoreSettings);
  const [settings, setSettings] = useState<StoreSettings>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyTheme(initial);
    setReady(true);
  }, [initial]);

  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  const saveSettings = useCallback(
    async (nextSettings: StoreSettings) => {
      const merged = mergeStoreSettings(nextSettings);
      const result = await saveStoreSettingsAction(merged);
      if (result.ok) {
        // Update the in-memory context immediately (footer + email preview react
        // live) and refresh server components so SSR surfaces re-read the DB.
        setSettings(merged);
        router.refresh();
      }
      return result;
    },
    [router],
  );

  const resetSettings = useCallback(async () => {
    const result = await saveStoreSettingsAction(defaultStoreSettings);
    if (result.ok) {
      setSettings(defaultStoreSettings);
      applyTheme(defaultStoreSettings);
    }
    return result;
  }, []);

  const value = useMemo(
    () => ({ settings, ready, saveSettings, resetSettings }),
    [ready, resetSettings, saveSettings, settings],
  );

  return (
    <StoreSettingsContext.Provider value={value}>
      {children}
    </StoreSettingsContext.Provider>
  );
}

export function useStoreSettings() {
  const ctx = useContext(StoreSettingsContext);
  if (!ctx) {
    throw new Error("useStoreSettings must be used within StoreSettingsProvider");
  }
  return ctx;
}
