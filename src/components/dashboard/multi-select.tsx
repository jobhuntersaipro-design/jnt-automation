"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  const displayLabel =
    selected.length === 0
      ? `All ${label}`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${label}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-[rgba(195,198,214,0.3)] hover:border-[rgba(195,198,214,0.6)] transition-colors min-w-28 justify-between">
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={12} className="text-on-surface-variant shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5" align="start">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <button
              key={option}
              onClick={() => toggle(option)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[0.69rem] text-on-surface hover:bg-surface-low transition-colors"
            >
              <Checkbox
                checked={checked}
                className="pointer-events-none"
                id={option}
              />
              <span>{option}</span>
              {checked && <Check size={11} className="ml-auto text-brand" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
