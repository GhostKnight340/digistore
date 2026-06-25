"use client";

import { useEffect, useRef } from "react";

type Tag = "p" | "h1" | "h2" | "h3" | "span" | "a";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  as?: Tag;
  disabled?: boolean;
};

export default function EditableText({
  value,
  onChange,
  className = "",
  as: Tag = "span",
  disabled = false,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current && ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  if (disabled) {
    return <Tag className={className}>{value}</Tag>;
  }

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={`outline-none cursor-text rounded transition-shadow hover:shadow-[0_0_0_2px_rgba(62,123,250,0.3)] focus:shadow-[0_0_0_2px_rgba(62,123,250,0.7)] ${className}`}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        focused.current = false;
        const text = e.currentTarget.textContent ?? "";
        if (text !== value) onChange(text);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        // Stop undo/redo shortcuts from reaching editor while typing
        if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "y")) {
          e.stopPropagation();
        }
      }}
    />
  );
}
