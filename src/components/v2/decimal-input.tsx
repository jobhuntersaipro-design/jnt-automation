"use client";

import { useState } from "react";
import ui from "./ui.module.css";

const parse = (text: string) => {
  const cleaned = text.trim().replace(/,/g, "");
  return cleaned === "" || !/^\d*\.?\d*$/.test(cleaned) ? NaN : Number(cleaned);
};

/**
 * A number field that lets people type freely ("1.", "0.0") and reports only valid,
 * non-negative numbers. Shows the prop's value again when it changes from outside.
 */
export function DecimalInput({
  value,
  onValueChange,
  label,
  className,
  invalid,
}: {
  value: number;
  onValueChange: (value: number) => void;
  label: string;
  className?: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const shown = parse(text) === value ? text : String(value);
  const bad = invalid || Number.isNaN(parse(shown));

  return (
    <input
      className={[ui.input, className].filter(Boolean).join(" ")}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad || undefined}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (Number.isFinite(n)) onValueChange(n);
      }}
    />
  );
}
