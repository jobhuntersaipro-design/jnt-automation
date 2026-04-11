"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls"]);

interface UploadZoneProps {
  branchCode: string;
  month: number;
  year: number;
  onFileSelected: (file: File) => void;
}

export function UploadZone({ branchCode, month, year, onFileSelected }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  const validateAndSelect = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return;
    }
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }, [validateAndSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) validateAndSelect(file);
    };
    input.click();
  }, [validateAndSelect]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
        isDragging
          ? "border-brand bg-brand/5"
          : "border-outline-variant/40 hover:border-brand/50 hover:bg-surface-hover/50"
      }`}
    >
      <FileSpreadsheet className="w-10 h-10 text-on-surface-variant/60" />
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          Upload delivery data
        </p>
        <p className="text-[0.85rem] text-on-surface-variant mt-0.5">
          {branchCode} &mdash; {monthName} {year}
        </p>
        <p className="text-[0.8rem] text-on-surface-variant/70 mt-1">
          Drag &amp; drop or click to browse
        </p>
        <p className="text-[0.75rem] text-on-surface-variant/50 mt-0.5">
          .xlsx / .xls only
        </p>
      </div>
    </div>
  );
}
