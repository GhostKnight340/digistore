"use client";

import { useEffect, useRef, useState } from "react";

interface EditableTextProps {
  /** Current text value */
  value: string;
  /** Called when the user commits a change (blur or Enter) */
  onChange: (value: string) => void;
  /** Tailwind classes that style the text — applied to both the display span and the input/textarea */
  className?: string;
  /** Use a growing textarea instead of a single-line input */
  multiline?: boolean;
  /** HTML tag used for the non-editing display element (default: span) */
  as?: keyof React.JSX.IntrinsicElements;
  /** Placeholder shown when value is empty */
  placeholder?: string;
}

export default function EditableText({
  value,
  onChange,
  className = "",
  multiline = false,
  as: Tag = "span",
  placeholder = "…",
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep local in sync when the value changes externally (undo / reset)
  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  // Focus and position cursor at end when editing starts
  useEffect(() => {
    if (!editing) return;
    if (multiline && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      fitTextarea(el);
    } else if (inputRef.current) {
      const el = inputRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing, multiline]);

  function fitTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function start(e: React.MouseEvent) {
    e.stopPropagation();
    setLocal(value);
    setEditing(true);
  }

  function commit() {
    onChange(local.trim() || value); // don't save empty
    setEditing(false);
  }

  function cancel() {
    setLocal(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // Shared classes that make the input/textarea look like its surrounding text
  const editingClass = [
    className,
    "bg-transparent outline-none resize-none",
    "w-full block",
    "ring-2 ring-accent/60 ring-offset-1 ring-offset-base rounded",
    "px-1 -mx-1",
    "leading-[inherit]",
  ].join(" ");

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={textareaRef}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            fitTextarea(e.target);
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={editingClass}
          rows={1}
          style={{ overflow: "hidden" }}
        />
      );
    }
    return (
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={editingClass}
      />
    );
  }

  const ViewTag = Tag as React.ElementType;
  return (
    <ViewTag
      onClick={start}
      title="Cliquez pour modifier"
      className={[
        className,
        "cursor-text rounded px-1 -mx-1",
        "outline outline-1 outline-transparent",
        "transition-[outline-color,background-color] duration-100",
        "hover:outline-dashed hover:outline-accent/50 hover:bg-accent/5",
      ].join(" ")}
    >
      {value || <span className="italic opacity-30">{placeholder}</span>}
    </ViewTag>
  );
}
