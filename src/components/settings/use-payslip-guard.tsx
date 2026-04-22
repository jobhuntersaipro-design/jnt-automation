"use client";

import { type ReactNode, useRef, useState } from "react";
import { AlertTriangle, Stamp } from "lucide-react";
import { toast } from "sonner";

type MissingField = "businessName" | "registrationNumber" | "companyAddress";

type GuardState =
  | { kind: "missing-required"; missing: MissingField[] }
  | { kind: "missing-stamp" };

interface CompanySetup {
  name: string | null;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
}

const FIELD_LABELS: Record<MissingField, string> = {
  businessName: "Business Name",
  registrationNumber: "Registration Number",
  companyAddress: "Company Address",
};

export function usePayslipGuard() {
  const [state, setState] = useState<GuardState | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  async function check(): Promise<boolean> {
    let data: CompanySetup;
    try {
      const res = await fetch("/api/settings/company", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Couldn't verify company setup. Please try again.");
        return false;
      }
      data = (await res.json()) as CompanySetup;
    } catch {
      toast.error("Couldn't verify company setup. Check your connection and try again.");
      return false;
    }

    const missing: MissingField[] = [];
    if (!data.name?.trim()) missing.push("businessName");
    if (!data.companyRegistrationNo?.trim()) missing.push("registrationNumber");
    if (!data.companyAddress?.trim()) missing.push("companyAddress");

    if (missing.length > 0) {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({ kind: "missing-required", missing });
      });
    }

    if (!data.stampImageUrl) {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({ kind: "missing-stamp" });
      });
    }

    return true;
  }

  function resolveWith(ok: boolean) {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setState(null);
  }

  const dialog: ReactNode = state ? (
    <GuardDialog
      state={state}
      onCancel={() => resolveWith(false)}
      onProceed={() => resolveWith(true)}
    />
  ) : null;

  return { check, dialog };
}

function GuardDialog({
  state,
  onCancel,
  onProceed,
}: {
  state: GuardState;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const isRequired = state.kind === "missing-required";
  const Icon = isRequired ? AlertTriangle : Stamp;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-on-surface/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] p-6 w-full max-w-md mx-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex-none w-9 h-9 rounded-full flex items-center justify-center ${
              isRequired ? "bg-critical/10 text-critical" : "bg-brand/10 text-brand"
            }`}
          >
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[1rem] font-semibold text-on-surface mb-1">
              {isRequired ? "Company Details Required" : "No Company Stamp Set"}
            </h3>
            {isRequired ? (
              <>
                <p className="text-[0.82rem] text-on-surface-variant leading-relaxed">
                  Payslips need the following before they can be generated:
                </p>
                <ul className="mt-2 space-y-1">
                  {state.missing.map((f) => (
                    <li
                      key={f}
                      className="text-[0.82rem] text-on-surface flex items-center gap-2"
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-critical" />
                      {FIELD_LABELS[f]}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.78rem] text-on-surface-variant leading-relaxed">
                  Add them under{" "}
                  <span className="font-medium text-on-surface">
                    Settings &rarr; Profile / Company Details
                  </span>
                  .
                </p>
              </>
            ) : (
              <p className="text-[0.82rem] text-on-surface-variant leading-relaxed">
                Your payslip &ldquo;Approved By&rdquo; section will be blank without a stamp.
                You can add one under{" "}
                <span className="font-medium text-on-surface">
                  Settings &rarr; Company Details
                </span>
                , or continue &mdash; the stamp is optional.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <a
            href="/settings"
            target="_blank"
            rel="noopener noreferrer"
            className={`px-3 py-1.5 text-[0.82rem] font-medium rounded-[0.375rem] transition-colors cursor-pointer ${
              isRequired
                ? "text-white bg-brand hover:bg-brand/90"
                : "border border-outline-variant/40 text-on-surface hover:bg-surface-hover"
            }`}
          >
            Open Settings
          </a>
          {!isRequired && (
            <button
              onClick={onProceed}
              className="px-3 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors cursor-pointer"
            >
              Generate Without Stamp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
