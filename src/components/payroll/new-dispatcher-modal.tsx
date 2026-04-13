"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, X } from "lucide-react";

interface UnknownDispatcher {
  extId: string;
  name: string;
}

interface DispatcherFormState {
  icNo: string;
  t1Commission: number;
  t2Commission: number;
  t3Commission: number;
  incentiveThreshold: number;
  incentiveAmount: string; // string to allow empty
  petrolEligible: boolean;
  petrolThreshold: number;
  petrolAmount: number;
}

interface NewDispatcherModalProps {
  uploadId: string;
  unknownDispatchers: UnknownDispatcher[];
  onComplete: (extIds: string[]) => void;
  onClose: () => void;
  /** When true, only creates dispatchers without triggering process-unknown */
  setupOnly?: boolean;
}

const DEFAULT_FORM: DispatcherFormState = {
  icNo: "",
  t1Commission: 1.0,
  t2Commission: 1.4,
  t3Commission: 2.2,
  incentiveThreshold: 2000,
  incentiveAmount: "",
  petrolEligible: false,
  petrolThreshold: 70,
  petrolAmount: 15,
};

function isFormComplete(form: DispatcherFormState): boolean {
  return (
    /^\d{12}$/.test(form.icNo) &&
    form.t1Commission > 0 &&
    form.t2Commission > 0 &&
    form.t3Commission > 0 &&
    form.incentiveThreshold > 0 &&
    form.incentiveAmount !== "" &&
    Number(form.incentiveAmount) > 0
  );
}

export function NewDispatcherModal({
  uploadId,
  unknownDispatchers,
  onComplete,
  onClose,
  setupOnly,
}: NewDispatcherModalProps) {
  const [forms, setForms] = useState<Record<string, DispatcherFormState>>(() => {
    const initial: Record<string, DispatcherFormState> = {};
    for (const d of unknownDispatchers) {
      initial[d.extId] = { ...DEFAULT_FORM };
    }
    return initial;
  });
  const [expanded, setExpanded] = useState<string>(unknownDispatchers[0]?.extId ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const allComplete = unknownDispatchers.every((d) => isFormComplete(forms[d.extId]));

  const updateForm = useCallback((extId: string, field: keyof DispatcherFormState, value: string | number | boolean) => {
    setForms((prev) => ({
      ...prev,
      [extId]: { ...prev[extId], [field]: value },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!allComplete) return;
    setIsSaving(true);

    try {
      // 1. Create dispatchers
      const dispatchers = unknownDispatchers.map((d) => {
        const f = forms[d.extId];
        return {
          extId: d.extId,
          name: d.name,
          icNo: f.icNo,
          weightTiers: [
            { tier: 1, minWeight: 0, maxWeight: 5, commission: f.t1Commission },
            { tier: 2, minWeight: 5.01, maxWeight: 10, commission: f.t2Commission },
            { tier: 3, minWeight: 10.01, maxWeight: null, commission: f.t3Commission },
          ],
          incentiveRule: {
            orderThreshold: f.incentiveThreshold,
            incentiveAmount: Number(f.incentiveAmount),
          },
          petrolRule: {
            isEligible: f.petrolEligible,
            dailyThreshold: f.petrolThreshold,
            subsidyAmount: f.petrolAmount,
          },
        };
      });

      const setupRes = await fetch(`/api/upload/${uploadId}/setup-dispatchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispatchers }),
      });

      if (!setupRes.ok) {
        const data = await setupRes.json();
        toast.error(data.error || "Failed to create dispatchers");
        return;
      }

      const setupData = await setupRes.json();
      toast.success(`${setupData.createdCount} dispatcher${setupData.createdCount !== 1 ? "s" : ""} created`);

      if (!setupOnly) {
        // 2. Process unknown dispatchers (merge with existing preview)
        const processRes = await fetch(`/api/upload/${uploadId}/process-unknown`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unknownExtIds: unknownDispatchers.map((d) => d.extId) }),
        });

        if (!processRes.ok) {
          const data = await processRes.json();
          toast.error(data.error || "Failed to process dispatchers");
          return;
        }
      }

      onComplete(unknownDispatchers.map((d) => d.extId));
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  }, [allComplete, unknownDispatchers, forms, uploadId, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-on-surface/40" onClick={isSaving ? undefined : onClose} />
      <div className="relative bg-surface-card rounded-lg shadow-lg w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <div>
            <h2 className="text-[0.95rem] font-semibold text-on-surface">
              Setup New Dispatchers
            </h2>
            <p className="text-[0.8rem] text-on-surface-variant mt-0.5">
              {unknownDispatchers.length} dispatcher{unknownDispatchers.length !== 1 ? "s" : ""} need to be configured before processing
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {unknownDispatchers.map((d) => {
            const form = forms[d.extId];
            const isExpanded = expanded === d.extId;
            const complete = isFormComplete(form);

            return (
              <div
                key={d.extId}
                className="rounded-md border border-outline-variant/15 bg-surface overflow-hidden"
              >
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? "" : d.extId)}
                  className="flex items-center justify-between w-full px-4 py-3 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                    )}
                    <span className="text-[0.85rem] font-medium text-on-surface">
                      {d.name}
                    </span>
                    <span className="text-[0.78rem] text-on-surface-variant">
                      ({d.extId})
                    </span>
                  </div>
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${complete ? "bg-emerald-500" : "bg-outline-variant"}`}
                  />
                </button>

                {/* Form fields */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* IC Number */}
                    <div>
                      <label className="block text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                        IC Number
                      </label>
                      <input
                        type="text"
                        maxLength={12}
                        value={form.icNo}
                        onChange={(e) => updateForm(d.extId, "icNo", e.target.value.replace(/\D/g, ""))}
                        placeholder="123456789012"
                        className="w-full px-3 py-2 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface placeholder:text-on-surface-variant/40"
                      />
                      {form.icNo.length > 0 && form.icNo.length !== 12 && (
                        <p className="text-[0.75rem] text-critical mt-1">
                          IC number must be 12 digits
                        </p>
                      )}
                    </div>

                    {/* Weight Tiers */}
                    <div>
                      <label className="block text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                        Weight Tier Commissions
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "0\u20135 kg", field: "t1Commission" as const, value: form.t1Commission },
                          { label: "5\u201310 kg", field: "t2Commission" as const, value: form.t2Commission },
                          { label: "10+ kg", field: "t3Commission" as const, value: form.t3Commission },
                        ].map((tier) => (
                          <div key={tier.field}>
                            <span className="block text-[0.72rem] text-on-surface-variant mb-1">
                              {tier.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-[0.78rem] text-on-surface-variant">RM</span>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={tier.value}
                                onChange={(e) => updateForm(d.extId, tier.field, Number(e.target.value))}
                                className="w-full px-2 py-1.5 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface tabular-nums"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Incentive */}
                    <div>
                      <label className="block text-[0.75rem] font-medium text-emerald-600 uppercase tracking-wider mb-2">
                        Monthly Incentive
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[0.72rem] text-on-surface-variant mb-1">
                            Min Orders
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={form.incentiveThreshold}
                            onChange={(e) => updateForm(d.extId, "incentiveThreshold", Number(e.target.value))}
                            className="w-full px-2 py-1.5 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface tabular-nums"
                          />
                        </div>
                        <div>
                          <span className="block text-[0.72rem] text-on-surface-variant mb-1">
                            Amount
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[0.78rem] text-on-surface-variant">RM</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={form.incentiveAmount}
                              onChange={(e) => updateForm(d.extId, "incentiveAmount", e.target.value)}
                              placeholder="Required"
                              className="w-full px-2 py-1.5 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface tabular-nums placeholder:text-on-surface-variant/40"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Petrol Subsidy */}
                    <div>
                      <label className="block text-[0.75rem] font-medium text-amber-600 uppercase tracking-wider mb-2">
                        Petrol Subsidy
                      </label>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => updateForm(d.extId, "petrolEligible", !form.petrolEligible)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            form.petrolEligible ? "bg-amber-500" : "bg-outline-variant/40"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              form.petrolEligible ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <span className="text-[0.8rem] text-on-surface-variant">
                          {form.petrolEligible ? "Eligible" : "Not eligible"}
                        </span>
                      </div>
                      {form.petrolEligible && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[0.72rem] text-on-surface-variant mb-1">
                              Daily Min Orders
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={form.petrolThreshold}
                              onChange={(e) => updateForm(d.extId, "petrolThreshold", Number(e.target.value))}
                              className="w-full px-2 py-1.5 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface tabular-nums"
                            />
                          </div>
                          <div>
                            <span className="block text-[0.72rem] text-on-surface-variant mb-1">
                              Daily Amount
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-[0.78rem] text-on-surface-variant">RM</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={form.petrolAmount}
                                onChange={(e) => updateForm(d.extId, "petrolAmount", Number(e.target.value))}
                                className="w-full px-2 py-1.5 text-[0.85rem] bg-surface-card border border-outline-variant/30 rounded-md focus:outline-none focus:border-brand text-on-surface tabular-nums"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/15">
          <p className="text-[0.78rem] text-on-surface-variant">
            {unknownDispatchers.filter((d) => isFormComplete(forms[d.extId])).length} of{" "}
            {unknownDispatchers.length} complete
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!allComplete || isSaving}
              className="px-4 py-2 text-[0.82rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors disabled:opacity-50"
            >
              {isSaving ? "Processing\u2026" : "Save & Process"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
