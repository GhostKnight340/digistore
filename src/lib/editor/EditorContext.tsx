"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { StoreSettings } from "@/lib/storeSettings";
import { useStoreSettings } from "@/context/StoreSettingsContext";

type HistoryState = {
  past: StoreSettings[];
  present: StoreSettings;
  future: StoreSettings[];
};

type HistoryAction =
  | { type: "SET"; updater: (s: StoreSettings) => StoreSettings }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; settings: StoreSettings };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET":
      return {
        past: [...state.past.slice(-50), state.present],
        present: action.updater(state.present),
        future: [],
      };
    case "UNDO":
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    case "REDO":
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    case "RESET":
      return { past: [], present: action.settings, future: [] };
    default:
      return state;
  }
}

type EditorContextValue = {
  draft: StoreSettings;
  previewMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  set: (updater: (s: StoreSettings) => StoreSettings) => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  togglePreview: () => void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const { settings, saveSettings } = useStoreSettings();
  const [{ past, present, future }, dispatch] = useReducer(historyReducer, {
    past: [],
    present: settings,
    future: [],
  });
  const [previewMode, setPreviewMode] = useState(false);

  const set = useCallback((updater: (s: StoreSettings) => StoreSettings) => {
    dispatch({ type: "SET", updater });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  const save = useCallback(() => {
    saveSettings(present);
    dispatch({ type: "RESET", settings: present });
  }, [saveSettings, present]);

  const togglePreview = useCallback(() => setPreviewMode((v) => !v), []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "s") {
        e.preventDefault();
        save();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo, save]);

  const isDirty = past.length > 0;
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const value = useMemo(
    () => ({
      draft: present,
      previewMode,
      canUndo,
      canRedo,
      isDirty,
      set,
      undo,
      redo,
      save,
      togglePreview,
    }),
    [present, previewMode, canUndo, canRedo, isDirty, set, undo, redo, save, togglePreview],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
