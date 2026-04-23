"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Download, FileText, TrendingUp } from "lucide-react";
import { HistoryMonthRow } from "./history-month-row";
import type { HistoryRecord } from "./history-month-row";
import { DispatcherTrendChart } from "./dispatcher-trend-chart";

interface HistoryTabProps {
  dispatcherId: string;
  dispatcherName: string;
}

function formatRM(value: number): string {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HistoryTab({ dispatcherId, dispatcherName }: HistoryTabProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const initialExpanded = useRef(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/history`);
      if (!res.ok) throw new Error();
      const data: HistoryRecord[] = await res.json();
      setRecords(data);
      if (!initialExpanded.current && data.length > 0) {
        setExpandedId(data[0].salaryRecordId);
        initialExpanded.current = true;
      }
    } catch {
      toast.error("Failed to load salary history");
    } finally {
      setLoading(false);
    }
  }, [dispatcherId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function handleToggle(recordId: string) {
    setExpandedId((prev) => (prev === recordId ? null : recordId));
  }

  function handleRecalculated(recordId: string, newNetSalary: number) {
    const record = records.find((r) => r.salaryRecordId === recordId);
    const MONTHS = [
      "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthLabel = record ? `${MONTHS[record.month]} ${record.year}` : "";

    setRecords((prev) =>
      prev.map((r) =>
        r.salaryRecordId === recordId
          ? { ...r, netSalary: newNetSalary, wasRecalculated: true }
          : r,
      ),
    );
    toast.success(`${monthLabel} recalculated for ${dispatcherName}`);
  }

  // YTD totals (all records, not filtered)
  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => ({
        netSalary: acc.netSalary + r.netSalary,
        totalOrders: acc.totalOrders + r.totalOrders,
        months: acc.months + 1,
      }),
      { netSalary: 0, totalOrders: 0, months: 0 },
    );
  }, [records]);

  const handleExportCsv = () => {
    setExportingCsv(true);
    window.location.href = `/api/staff/${dispatcherId}/export/csv`;
    setTimeout(() => setExportingCsv(false), 1500);
  };

  const handleExportPdf = () => {
    setExportingPdf(true);
    window.location.href = `/api/staff/${dispatcherId}/export/pdf`;
    setTimeout(() => setExportingPdf(false), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-16 bg-surface-hover/50 rounded-xl animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface-hover/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-[0.84rem] text-on-surface-variant">
          No salary records yet. Upload delivery data in the Payroll page to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* YTD summary + export toolbar */}
      <div className="rounded-xl bg-gradient-to-br from-brand to-brand-container p-4 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-white/70" />
            <p className="text-[0.7rem] uppercase tracking-wider text-white/70 font-medium">
              Lifetime earnings
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.75rem] font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-md transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingCsv ? "Downloading..." : "CSV"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.75rem] font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-md transition-colors disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {exportingPdf ? "Downloading..." : "PDF"}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[1.5rem] font-bold tracking-tight tabular-nums">
          {formatRM(totals.netSalary)}
        </p>
        <p className="text-[0.72rem] text-white/80 mt-0.5 tabular-nums">
          {totals.months} month{totals.months !== 1 ? "s" : ""} · {totals.totalOrders.toLocaleString()} order{totals.totalOrders !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Performance trend (Orders / Net / Penalty) */}
      <DispatcherTrendChart
        records={records.map((r) => ({
          month: r.month,
          year: r.year,
          totalOrders: r.totalOrders,
          netSalary: r.netSalary,
          penalty: r.penalty,
        }))}
      />

      {/* Records list */}
      <div className="space-y-3">
        {records.map((record) => (
          <HistoryMonthRow
            key={record.salaryRecordId}
            record={record}
            isExpanded={expandedId === record.salaryRecordId}
            onToggle={() => handleToggle(record.salaryRecordId)}
            dispatcherName={dispatcherName}
            dispatcherId={dispatcherId}
            onRecalculated={handleRecalculated}
          />
        ))}
      </div>
    </div>
  );
}
