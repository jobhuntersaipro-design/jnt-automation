"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { ChevronDown, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/use-click-outside"
import { PayrollSummaryCards } from "./payroll-summary-cards"
import {
  calculateStatutory,
  calculateNetSalary,
  calculateSupervisorGross,
  calculateStoreKeeperGross,
} from "@/lib/payroll/statutory"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface PayrollEntry {
  employeeId: string
  employeeExtId: string | null
  name: string
  type: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER"
  branchCode: string | null
  dispatcherExtId: string | null
  dispatcherGross: number
  dispatcherPenalty: number
  dispatcherAdvance: number
  hasDispatcher: boolean
  basicPay: number
  workingHours: number
  hourlyWage: number
  kpiAllowance: number
  petrolAllowance: number
  otherAllowance: number
  grossSalary: number
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
  pcb: number
  penalty: number
  advance: number
  netSalary: number
  isSaved: boolean
}

const GROSS_FIELDS = new Set(["basicPay", "hourlyWage", "workingHours", "petrolAllowance", "kpiAllowance", "otherAllowance"])

function recalcEntry(entry: PayrollEntry, changedField: string): PayrollEntry {
  const employeeGross =
    entry.type === "STORE_KEEPER"
      ? calculateStoreKeeperGross(
          entry.workingHours,
          entry.hourlyWage,
          entry.petrolAllowance,
          entry.kpiAllowance,
          entry.otherAllowance
        )
      : calculateSupervisorGross(
          entry.basicPay,
          entry.petrolAllowance,
          entry.kpiAllowance,
          entry.otherAllowance
        )

  const totalGross = employeeGross + entry.dispatcherGross

  // Only auto-recalculate statutory when gross-affecting fields change
  if (GROSS_FIELDS.has(changedField)) {
    const statutory = calculateStatutory(totalGross)
    const netSalary = calculateNetSalary(totalGross, statutory, entry.pcb, entry.penalty, entry.advance)
    return { ...entry, grossSalary: totalGross, ...statutory, netSalary }
  }

  // For manual statutory/deduction edits, just recalculate net
  const net = totalGross - entry.epfEmployee - entry.socsoEmployee - entry.eisEmployee - entry.pcb - entry.penalty - entry.advance
  return { ...entry, grossSalary: totalGross, netSalary: net }
}

function formatRM(val: number): string {
  return val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Convert float to raw cents string (e.g. 5.21 → "521")
function floatToCents(value: number): string {
  return Math.round(value * 100).toString()
}

// Format cents string for display (e.g. "521" → "5.21")
function centsToDisplay(cents: string): string {
  const padded = cents.padStart(3, "0")
  const intPart = padded.slice(0, -2)
  const decPart = padded.slice(-2)
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return formatted + "." + decPart
}

function centsToFloat(cents: string): number {
  return parseInt(cents.padStart(3, "0"), 10) / 100
}

// Calculator-style currency input: 5→0.05, 2→0.52, 1→5.21
function CalcCurrencyInput({
  value,
  onChange,
  light = false,
}: {
  value: number
  onChange: (val: number) => void
  light?: boolean
}) {
  const [cents, setCents] = useState(() => floatToCents(value))
  const [lastValue, setLastValue] = useState(value)

  // Sync from parent when value changes externally (e.g. after fetch)
  if (value !== lastValue) {
    setLastValue(value)
    setCents(floatToCents(value))
  }

  function handleKey(e: React.KeyboardEvent) {
    e.preventDefault()
    // Select all + delete/backspace → clear entire field
    const input = e.target as HTMLInputElement
    const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0
    if (allSelected && (e.key === "Backspace" || e.key === "Delete")) {
      setCents("0")
      setLastValue(0)
      onChange(0)
      return
    }
    // If all selected and a digit is pressed, start fresh
    if (allSelected && /^\d$/.test(e.key)) {
      const fresh = e.key === "0" ? "0" : e.key
      setCents(fresh)
      const val = centsToFloat(fresh)
      setLastValue(val)
      onChange(val)
      return
    }
    if (e.key === "Backspace") {
      const next = cents.length <= 1 ? "0" : cents.slice(0, -1)
      setCents(next)
      const val = centsToFloat(next)
      setLastValue(val)
      onChange(val)
    } else if (/^\d$/.test(e.key)) {
      const stripped = (cents + e.key).replace(/^0+/, "") || "0"
      if (stripped.length > 9) return // cap at 9,999,999.99
      setCents(stripped)
      const val = centsToFloat(stripped)
      setLastValue(val)
      onChange(val)
    }
  }

  const display = cents === "0" ? "" : centsToDisplay(cents)

  return (
    <input
      type="text"
      inputMode="none"
      readOnly
      value={display}
      placeholder="0.00"
      onKeyDown={handleKey}
      className={`w-full bg-transparent text-center tabular-nums placeholder:text-on-surface-variant/40 focus:outline-none cursor-text ${light ? "text-[0.7rem] text-on-surface-variant/70" : "text-[0.8rem]"}`}
    />
  )
}

function HoursInput({
  value,
  onChange,
}: {
  value: number
  onChange: (val: number) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)

  const display = editing !== null ? editing : (value > 0 ? value.toString() : "")

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder="0"
      className="w-full bg-transparent text-center text-[0.8rem] tabular-nums placeholder:text-on-surface-variant/40 focus:outline-none"
      onFocus={() => setEditing(value > 0 ? value.toString() : "")}
      onChange={(e) => setEditing(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={() => {
        const parsed = parseFloat(editing ?? "")
        const final = isNaN(parsed) ? 0 : Math.min(parsed, 9999)
        setEditing(null)
        onChange(final)
      }}
    />
  )
}

const TYPE_LABELS: Record<string, string> = {
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
  STORE_KEEPER: "Store Keeper",
}

export function PayrollTab() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [monthOpen, setMonthOpen] = useState(false)
  const [yearOpen, setYearOpen] = useState(false)
  const monthRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  useClickOutside(monthRef, () => setMonthOpen(false))
  useClickOutside(yearRef, () => setYearOpen(false))

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/employee-payroll/${month}/${year}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setEntries(data.entries)
    } catch {
      toast.error("Failed to load payroll data")
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const updateEntry = useCallback((employeeId: string, field: string, value: number) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.employeeId !== employeeId) return e
        const updated = { ...e, [field]: value }
        return recalcEntry(updated, field)
      })
    )
  }, [])

  const allReady = useMemo(() => {
    return entries.every((e) => {
      if (e.type === "STORE_KEEPER" && e.workingHours <= 0) return false
      return true
    })
  }, [entries])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = entries.map((e) => ({
        employeeId: e.employeeId,
        basicPay: e.basicPay,
        workingHours: e.workingHours,
        hourlyWage: e.hourlyWage,
        kpiAllowance: e.kpiAllowance,
        petrolAllowance: e.petrolAllowance,
        otherAllowance: e.otherAllowance,
        pcb: e.pcb,
        penalty: e.hasDispatcher ? e.penalty - e.dispatcherPenalty : e.penalty,
        advance: e.hasDispatcher ? e.advance - e.dispatcherAdvance : e.advance,
      }))

      const res = await fetch(`/api/employee-payroll/${month}/${year}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payload }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }

      toast.success(`Payroll saved for ${MONTHS[month - 1]} ${year}`)
      fetchEntries()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save payroll")
    } finally {
      setSaving(false)
    }
  }

  // Summary calculations
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => ({
        gross: acc.gross + e.grossSalary,
        epfEmployee: acc.epfEmployee + e.epfEmployee,
        socsoEmployee: acc.socsoEmployee + e.socsoEmployee,
        eisEmployee: acc.eisEmployee + e.eisEmployee,
        net: acc.net + e.netSalary,
        epfEmployer: acc.epfEmployer + e.epfEmployer,
        socsoEmployer: acc.socsoEmployer + e.socsoEmployer,
        eisEmployer: acc.eisEmployer + e.eisEmployer,
      }),
      { gross: 0, epfEmployee: 0, socsoEmployee: 0, eisEmployee: 0, net: 0, epfEmployer: 0, socsoEmployer: 0, eisEmployer: 0 }
    )
  }, [entries])

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => current - 2 + i)
  }, [])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Month selector */}
          <div ref={monthRef} className="relative">
            <button
              onClick={() => setMonthOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-outline-variant/30 hover:border-outline-variant/60 transition-colors min-w-32 justify-between"
            >
              <span>{MONTHS[month - 1]}</span>
              <ChevronDown size={12} className={`text-on-surface-variant shrink-0 transition-transform ${monthOpen ? "rotate-180" : ""}`} />
            </button>
            {monthOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-44 py-1 max-h-60 overflow-y-auto">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => { setMonth(i + 1); setMonthOpen(false) }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${
                      month === i + 1 ? "text-primary font-semibold bg-primary/5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {m}
                    {month === i + 1 && <Check size={13} className="text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Year selector */}
          <div ref={yearRef} className="relative">
            <button
              onClick={() => setYearOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-outline-variant/30 hover:border-outline-variant/60 transition-colors min-w-20 justify-between"
            >
              <span>{year}</span>
              <ChevronDown size={12} className={`text-on-surface-variant shrink-0 transition-transform ${yearOpen ? "rotate-180" : ""}`} />
            </button>
            {yearOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-28 py-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => { setYear(y); setYearOpen(false) }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${
                      year === y ? "text-primary font-semibold bg-primary/5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {y}
                    {year === y && <Check size={13} className="text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || loading || entries.length === 0 || !allReady}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary text-white text-[0.83rem] font-medium rounded-[0.375rem] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Confirm & Save
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && entries.length > 0 && (
        <PayrollSummaryCards totals={totals} />
      )}

      {/* Entry Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-on-surface-variant" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant text-[0.85rem]">
          No employees found. Add employees in the Employees tab first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-left pl-3" style={{ width: 160 }}>Employee</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 85 }}>Pay</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 60 }}>Hours</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 70 }}>Petrol</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 70 }}>KPI</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 70 }}>Other</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 80 }}>Gross</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 65 }}>PCB</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 65 }}>Penalty</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 70 }}>
                  <div>EPF</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 65 }}>
                  <div>SOCSO</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 55 }}>
                  <div>EIS</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-primary uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 90 }}>Net</th>
                <th className="pb-3" style={{ width: 24 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isStoreKeeper = entry.type === "STORE_KEEPER"
                const isReady = isStoreKeeper ? entry.workingHours > 0 : true

                return (
                  <tr
                    key={entry.employeeId}
                    className="group hover:bg-surface-hover/50 transition-colors border-b border-outline-variant/15 last:border-b-0"
                  >
                    {/* Employee */}
                    <td className="py-2.5 pl-3">
                      <div className="text-[0.8rem] font-medium text-on-surface leading-tight">
                        {entry.name}
                      </div>
                      <div className="text-[0.68rem] text-on-surface-variant/70 leading-tight mt-0.5">
                        {entry.employeeExtId || "—"}{entry.branchCode ? ` · ${entry.branchCode}` : ""}
                      </div>
                      <div className="text-[0.63rem] text-on-surface-variant/50 mt-0.5">
                        {TYPE_LABELS[entry.type]}{entry.hasDispatcher ? ` + Dispatcher` : ""}
                      </div>
                    </td>

                    {/* Basic Pay / Hourly Wage */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={isStoreKeeper ? entry.hourlyWage : entry.basicPay}
                          onChange={(v) => updateEntry(entry.employeeId, isStoreKeeper ? "hourlyWage" : "basicPay", v)}
                        />
                      </div>
                    </td>

                    {/* Working Hours */}
                    <td className="py-2.5 px-1">
                      {isStoreKeeper ? (
                        <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                          <HoursInput
                            value={entry.workingHours}
                            onChange={(v) => updateEntry(entry.employeeId, "workingHours", v)}
                          />
                        </div>
                      ) : (
                        <span className="text-[0.8rem] text-on-surface-variant/30 block text-center">&mdash;</span>
                      )}
                    </td>

                    {/* Petrol */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.petrolAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "petrolAllowance", v)}
                        />
                      </div>
                    </td>

                    {/* KPI */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.kpiAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "kpiAllowance", v)}
                        />
                      </div>
                    </td>

                    {/* Other */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.otherAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "otherAllowance", v)}
                        />
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="py-2.5 px-1 text-center">
                      <div className="text-[0.8rem] tabular-nums text-on-surface font-medium">
                        {formatRM(entry.grossSalary)}
                      </div>
                      {entry.hasDispatcher && entry.dispatcherGross > 0 && (
                        <div className="text-[0.6rem] text-on-surface-variant/50 tabular-nums">
                          +dispatch {formatRM(entry.dispatcherGross)}
                        </div>
                      )}
                    </td>

                    {/* PCB */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.pcb}
                          onChange={(v) => updateEntry(entry.employeeId, "pcb", v)}
                        />
                      </div>
                    </td>

                    {/* Penalty */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.penalty}
                          onChange={(v) => updateEntry(entry.employeeId, "penalty", v)}
                        />
                      </div>
                    </td>

                    {/* EPF */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.epfEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors mt-0.5">
                        <CalcCurrencyInput
                          value={entry.epfEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployer", v)}
                          light
                        />
                      </div>
                    </td>

                    {/* SOCSO */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.socsoEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors mt-0.5">
                        <CalcCurrencyInput
                          value={entry.socsoEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployer", v)}
                          light
                        />
                      </div>
                    </td>

                    {/* EIS */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors">
                        <CalcCurrencyInput
                          value={entry.eisEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "eisEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/5 transition-colors mt-0.5">
                        <CalcCurrencyInput
                          value={entry.eisEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "eisEmployer", v)}
                          light
                        />
                      </div>
                    </td>

                    {/* Net Salary */}
                    <td className="py-2.5 px-1 text-center">
                      <span className="text-[0.85rem] tabular-nums text-primary font-semibold">
                        {formatRM(entry.netSalary)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          isReady ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                        title={isReady ? "Ready" : "Hours required"}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
