"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  STORE_SETTINGS_KEY,
  defaultStoreSettings,
  mergeStoreSettings,
  type StoreSettings,
} from "@/lib/storeSettings";

type StoreSettingsContextValue = {
  settings: StoreSettings;
  ready: boolean;
  saveSettings: (settings: StoreSettings) => void;
  resetSettings: () => void;
};

const StoreSettingsContext = createContext<StoreSettingsContextValue | null>(
  null,
);

function readSettings(): StoreSettings {
  if (typeof window === "undefined") return defaultStoreSettings;
  try {
    const raw = window.localStorage.getItem(STORE_SETTINGS_KEY);
    return raw ? mergeStoreSettings(JSON.parse(raw)) : defaultStoreSettings;
  } catch {
    return defaultStoreSettings;
  }
}

function applyTheme(settings: StoreSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--store-accent", settings.theme.accentColor);
  root.style.setProperty("--store-bg", settings.theme.backgroundColor);
  root.style.setProperty("--store-card-radius", settings.theme.cardRadius);
  root.style.setProperty("--store-button-radius", settings.theme.buttonRadius);
}

export function StoreSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<StoreSettings>(defaultStoreSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readSettings();
    setSettings(stored);
    applyTheme(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  const saveSettings = useCallback((nextSettings: StoreSettings) => {
    const merged = mergeStoreSettings(nextSettings);
    setSettings(merged);
    window.localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(merged));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultStoreSettings);
    window.localStorage.removeItem(STORE_SETTINGS_KEY);
    applyTheme(defaultStoreSettings);
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
