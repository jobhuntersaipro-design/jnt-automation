"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/arc/button/button";

/** The browser's print dialog, which can also save the payslips as a PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" />
      {label}
    </Button>
  );
}
