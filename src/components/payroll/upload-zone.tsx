"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls"]);

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadZone({ onFilesSelected, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const validateAndSelect = useCallback((fileList: FileList) => {
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && ALLOWED_EXTENSIONS.has(ext)) {
        valid.push(file);
      }
    }
    if (valid.length > 0) onFilesSelected([valid[0]]);
  }, [onFilesSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) validateAndSelect(e.dataTransfer.files);
  }, [validateAndSelect, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.multiple = false;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) validateAndSelect(files);
    };
    input.click();
  }, [validateAndSelect, disabled]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed transition-colors ${
        disabled
          ? "border-outline-variant/20 opacity-60 cursor-not-allowed"
          : isDragging
            ? "border-brand bg-brand/5 cursor-pointer"
            : "border-outline-variant/40 hover:border-brand/50 hover:bg-surface-hover/50 cursor-pointer"
      }`}
    >
      <FileSpreadsheet className="w-10 h-10 text-on-surface-variant/60" />
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          Upload delivery data
        </p>
        <p className="text-[0.85rem] text-on-surface-variant mt-0.5">
          Branch and month will be detected automatically
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
