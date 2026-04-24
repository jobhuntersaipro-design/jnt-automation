"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { ChevronDown, Check, Loader2, FileText, Download, X, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/use-click-outside"
import { PayrollSummaryCards } from "./payroll-summary-cards"
import { BranchChip } from "@/components/ui/branch-chip"
import { EmployeeAvatarView } from "./employee-avatar-view"
import type { Gender } from "@/generated/prisma/client"
import { usePayslipGuard } from "@/components/settings/use-payslip-guard"
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
  name: string
  type: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER"
  branchCode: string | null
  icNo: string | null
  gender: Gender
  avatarUrl: string | null
  dispatcherAvatarUrl: string | null
  hasDispatcherMatch: boolean
  dispatcherGross: number
  dispatcherPenalty: number
  dispatcherAdvance: number
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
  // Supervisor/Admin: basic pay + allowances only. Store Keeper:
  // hours × hourly wage + allowances. Hours/hourlyWage are ignored for
  // Supervisor/Admin even if legacy values exist — the UI no longer exposes
  // those fields, so this keeps gross consistent with what users see.
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
      className={`peer w-full bg-transparent text-center tabular-nums placeholder:text-on-surface-variant/40 focus:outline-none focus:text-primary focus:font-semibold cursor-text ${light ? "text-[0.7rem] text-on-surface-variant/70" : "text-[0.8rem]"}`}
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
      className="w-full bg-transparent text-center text-[0.8rem] tabular-nums placeholder:text-on-surface-variant/40 caret-primary focus:outline-none focus:text-primary focus:font-semibold"
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
        penalty: e.hasDispatcherMatch ? e.penalty - e.dispatcherPenalty : e.penalty,
        advance: e.hasDispatcherMatch ? e.advance - e.dispatcherAdvance : e.advance,
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

  // ── Payslip generation state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatingBulk, setGeneratingBulk] = useState(false)
  const [icPrompt, setIcPrompt] = useState<{ employeeId: string; name: string } | null>(null)
  const [icInput, setIcInput] = useState("")
  const [savingIc, setSavingIc] = useState(false)
  const { check: checkPayslipSetup, dialog: payslipGuardDialog } = usePayslipGuard()

  // Clear selection when month/year changes
  useEffect(() => { setSelectedIds(new Set()) }, [month, year])

  const allSaved = useMemo(() => entries.length > 0 && entries.every((e) => e.isSaved), [entries])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(entries.map((e) => e.employeeId)))
    }
  }, [selectedIds.size, entries])

  const handleGeneratePayslip = useCallback(async (entry: PayrollEntry) => {
    if (!entry.icNo) {
      setIcPrompt({ employeeId: entry.employeeId, name: entry.name })
      setIcInput("")
      return
    }
    if (!entry.isSaved) {
      toast.error("Save payroll first before generating payslips")
      return
    }
    const ok = await checkPayslipSetup()
    if (!ok) return
    setGeneratingId(entry.employeeId)
    try {
      const res = await fetch(`/api/employee-payroll/${month}/${year}/payslip/${entry.employeeId}`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        if (data.error === "IC_MISSING") {
          setIcPrompt({ employeeId: entry.employeeId, name: entry.name })
          setIcInput("")
          return
        }
        toast.error(data.error || "Failed to generate payslip")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "payslip.pdf"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Failed to generate payslip")
    } finally {
      setGeneratingId(null)
    }
  }, [month, year, checkPayslipSetup])

  const handleBulkGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return
    const ok = await checkPayslipSetup()
    if (!ok) return
    setGeneratingBulk(true)
    try {
      const res = await fetch(`/api/employee-payroll/${month}/${year}/payslips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to generate payslips")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const contentType = res.headers.get("Content-Type") || ""
      a.download = contentType.includes("zip")
        ? `staff_payslips_${MONTHS[month - 1]}_${year}.zip`
        : res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "payslip.pdf"
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Generated ${selectedIds.size} payslip${selectedIds.size > 1 ? "s" : ""}`)
    } catch {
      toast.error("Failed to generate payslips")
    } finally {
      setGeneratingBulk(false)
    }
  }, [selectedIds, month, year, checkPayslipSetup])

  const handleSaveIc = useCallback(async () => {
    if (!icPrompt || !/^\d{12}$/.test(icInput)) return
    setSavingIc(true)
    try {
      const res = await fetch(`/api/employees/${icPrompt.employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icNo: icInput }),
      })
      if (!res.ok) { toast.error("Failed to save IC"); return }
      // Update local entry
      const empId = icPrompt.employeeId
      setEntries((prev) => prev.map((e) =>
        e.employeeId === empId ? { ...e, icNo: icInput } : e
      ))
      setIcPrompt(null)
      const ok = await checkPayslipSetup()
      if (!ok) {
        setSavingIc(false)
        return
      }
      toast.success("IC number saved — generating payslip...")
      // Auto-generate payslip after saving IC
      setGeneratingId(empId)
      try {
        const pdfRes = await fetch(`/api/employee-payroll/${month}/${year}/payslip/${empId}`, { method: "POST" })
        if (pdfRes.ok) {
          const blob = await pdfRes.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = pdfRes.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "payslip.pdf"
          a.click()
          URL.revokeObjectURL(url)
        } else {
          const data = await pdfRes.json()
          toast.error(data.error || "Failed to generate payslip")
        }
      } catch {
        toast.error("Failed to generate payslip")
      } finally {
        setGeneratingId(null)
      }
    } catch {
      toast.error("Failed to save IC")
    } finally {
      setSavingIc(false)
    }
  }, [icPrompt, icInput, month, year, checkPayslipSetup])

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
          No employees found. Add employees in the Settings tab first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                {allSaved && (
                  <th className="pb-3 pl-3" style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === entries.length && entries.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded accent-brand"
                    />
                  </th>
                )}
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-left pl-3" style={{ width: 160 }}>Employee</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 80 }}>Branch</th>
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
                <th className="pb-3" style={{ width: 150 }}></th>
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
                    {/* Checkbox */}
                    {allSaved && (
                      <td className="py-2.5 pl-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.employeeId)}
                          onChange={() => toggleSelect(entry.employeeId)}
                          className="rounded accent-brand"
                        />
                      </td>
                    )}

                    {/* Employee */}
                    <td className="py-2.5 pl-3">
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatarView
                          name={entry.name}
                          gender={entry.gender}
                          avatarUrl={entry.avatarUrl}
                          dispatcherAvatarUrl={entry.dispatcherAvatarUrl}
                        />
                        <div className="min-w-0">
                          <div className="text-[0.8rem] font-medium text-on-surface leading-tight truncate">
                            {entry.name}
                          </div>
                          <div className="text-[0.63rem] text-on-surface-variant/50 mt-0.5">
                            {TYPE_LABELS[entry.type]}{entry.hasDispatcherMatch ? " + Dispatcher" : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Branch */}
                    <td className="py-2.5 px-1 text-center">
                      {entry.branchCode ? (
                        <BranchChip code={entry.branchCode} asLink={false} />
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.68rem] font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                          title="Branch is required — set it on the Settings tab"
                        >
                          <AlertTriangle size={10} />
                          Set branch
                        </span>
                      )}
                    </td>

                    {/* Basic Pay / Hourly Wage */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={isStoreKeeper ? entry.hourlyWage : entry.basicPay}
                          onChange={(v) => updateEntry(entry.employeeId, isStoreKeeper ? "hourlyWage" : "basicPay", v)}
                        />
                      </div>
                    </td>

                    {/* Working Hours — Store Keeper only. Supervisor/Admin use
                        basic pay + allowances; hours don't apply. */}
                    <td className="py-2.5 px-1">
                      {isStoreKeeper ? (
                        <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                          <HoursInput
                            value={entry.workingHours}
                            onChange={(v) => updateEntry(entry.employeeId, "workingHours", v)}
                          />
                        </div>
                      ) : (
                        <div
                          className="text-center text-[0.8rem] tabular-nums text-on-surface-variant/40 select-none"
                          title="Hours not applicable — Supervisor/Admin use Basic Pay"
                        >
                          —
                        </div>
                      )}
                    </td>

                    {/* Petrol */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.petrolAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "petrolAllowance", v)}
                        />
                      </div>
                    </td>

                    {/* KPI */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.kpiAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "kpiAllowance", v)}
                        />
                      </div>
                    </td>

                    {/* Other */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
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
                      {entry.hasDispatcherMatch && entry.dispatcherGross > 0 && (
                        <div className="text-[0.6rem] text-on-surface-variant/50 tabular-nums">
                          +dispatch {formatRM(entry.dispatcherGross)}
                        </div>
                      )}
                    </td>

                    {/* PCB */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.pcb}
                          onChange={(v) => updateEntry(entry.employeeId, "pcb", v)}
                        />
                      </div>
                    </td>

                    {/* Penalty */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.penalty}
                          onChange={(v) => updateEntry(entry.employeeId, "penalty", v)}
                        />
                      </div>
                    </td>

                    {/* EPF */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.epfEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
                        <CalcCurrencyInput
                          value={entry.epfEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployer", v)}
                          light
                        />
                      </div>
                    </td>

                    {/* SOCSO */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.socsoEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
                        <CalcCurrencyInput
                          value={entry.socsoEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployer", v)}
                          light
                        />
                      </div>
                    </td>

                    {/* EIS */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.eisEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "eisEmployee", v)}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
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

                    {/* Status / Payslip */}
                    <td className="py-2.5 px-2 text-center">
                      {entry.isSaved ? (
                        <button
                          onClick={() => handleGeneratePayslip(entry)}
                          disabled={generatingId === entry.employeeId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] font-medium text-brand border border-brand/30 rounded-md hover:bg-brand/5 hover:border-brand/50 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          {generatingId === entry.employeeId ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              <span>Generating…</span>
                            </>
                          ) : (
                            <>
                              <FileText size={12} />
                              <span>Generate Payslip</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-[0.7rem] text-on-surface-variant/70"
                          title={isReady ? "Save payroll to enable" : "Working hours required"}
                        >
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              isReady ? "bg-emerald-500" : "bg-gray-300"
                            }`}
                          />
                          {isReady ? "Ready" : "Hours required"}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating action bar for multi-select */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-on-surface text-white px-5 py-3 rounded-xl shadow-[0_12px_40px_-12px_rgba(25,28,29,0.3)]">
          <span className="text-[0.82rem] font-medium">
            {selectedIds.size} employee{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleBulkGenerate}
            disabled={generatingBulk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-on-surface text-[0.8rem] font-medium rounded-[0.375rem] hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {generatingBulk ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Generate Payslips
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1 text-white/60 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* IC Prompt Dialog */}
      {icPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setIcPrompt(null)} />
          <div className="relative bg-white rounded-xl shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] p-6 w-full max-w-sm">
            <h3 className="text-[1rem] font-semibold text-on-surface mb-1">IC Number Required</h3>
            <p className="text-[0.82rem] text-on-surface-variant mb-4">
              Enter IC number for <span className="font-medium text-on-surface">{icPrompt.name}</span> to generate their payslip.
            </p>
            <input
              type="text"
              value={icInput ? icInput.replace(/(\d{4})(?=\d)/g, "$1-") : ""}
              onChange={(e) => setIcInput(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="12-digit IC number"
              maxLength={14}
              autoFocus
              className="w-full px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 tabular-nums mb-4"
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveIc() }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIcPrompt(null)}
                className="px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveIc}
                disabled={!/^\d{12}$/.test(icInput) || savingIc}
                className="px-3 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {savingIc ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payslipGuardDialog}
    </div>
  )
}
