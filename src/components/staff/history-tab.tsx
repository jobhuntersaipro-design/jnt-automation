"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { HistoryMonthRow } from "./history-month-row";
import type { HistoryRecord } from "./history-month-row";

interface HistoryTabProps {
  dispatcherId: string;
  dispatcherName: string;
}

export function HistoryTab({ dispatcherId, dispatcherName }: HistoryTabProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const initialExpanded = useRef(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/history`);
      if (!res.ok) throw new Error();
      const data: HistoryRecord[] = await res.json();
      setRecords(data);
      // Auto-expand the first (latest) record
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

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-surface-hover/50 rounded-[0.375rem] animate-pulse" />
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
    <div className="bg-white rounded-[0.5rem] border border-outline-variant/15 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[5rem_1fr_7rem_5.5rem] items-center px-4 py-2 border-b border-outline-variant/15">
        <span className="text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
          Month
        </span>
        <span className="text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase text-center">
          Net Salary
        </span>
        <span className="text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase text-center">
          Status
        </span>
        <span className="text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase text-center">
          Actions
        </span>
      </div>

      {/* Rows */}
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
  );
}
