"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { ChevronDown, Check, Loader2, FileText, Download, X, AlertTriangle, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { useClickOutside } from "@/lib/hooks/use-click-outside"
import { PayrollSummaryCards } from "./payroll-summary-cards"
import { BranchChip } from "@/components/ui/branch-chip"
import { DispatcherAvatar } from "./dispatcher-avatar"
import { selectAvatarTarget } from "@/lib/staff/avatar-target"
import type { Gender } from "@/generated/prisma/client"
import { usePayslipGuard } from "@/components/settings/use-payslip-guard"
import {
  calculateStatutory,
  calculateNetSalary,
  calculateSupervisorGross,
  calculateStoreKeeperGross,
} from "@/lib/payroll/statutory"
import {
  STORE_KEEPER_SUBTYPE_LABEL,
  STORE_KEEPER_SUBTYPE_CHIP_CLASS,
} from "@/lib/staff/store-keeper-subtype"
import { formatIcInput } from "@/lib/utils/ic"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type EntryPayMode = "HOUR" | "DAY"

interface PayrollEntry {
  employeeId: string
  name: string
  type: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER" | "DRIVER"
  /** Sub-tag on STORE_KEEPER rows. Null for any other type. */
  storeKeeperSubtype: "TEMPORARY" | "PERMANENT" | null
  /** HOUR | DAY for Temporary store keepers; ignored otherwise. */
  payMode: EntryPayMode
  branchCode: string | null
  icNo: string | null
  gender: Gender
  avatarUrl: string | null
  /**
   * Active/inactive flag — mirrors the toggle on /staff?tab=settings.
   * Inactive rows are dimmed, read-only, excluded from summary totals +
   * bulk payslip selection, and skipped on Confirm & Save (per spec §6.1:
   * skip, don't upsert zeros — preserves any prior saved record untouched).
   */
  isActive: boolean
  dispatcherId: string | null
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
  /**
   * KWSP Jadual Ketiga p.12 bonus rule applied for this row — gross > 5k
   * but base wage (gross − KPI) ≤ 5k, so employer EPF stays at 13% instead
   * of dropping to 12%. Surfaced as a small badge on the EPF column. Defaults
   * to false on rows from older API responses that don't ship the flag.
   */
  epfBonusRuleApplied?: boolean
  isSaved: boolean
}

const GROSS_FIELDS = new Set(["basicPay", "hourlyWage", "workingHours", "petrolAllowance", "kpiAllowance", "otherAllowance"])

/**
 * True when this row uses the units-rate (hour/day) pay model rather than
 * monthly basic pay. Permanent store keepers + Sup/Admin/Driver use basicPay;
 * Temporary or untagged store keepers use units × rate.
 */
function usesUnitsRate(entry: Pick<PayrollEntry, "type" | "storeKeeperSubtype">): boolean {
  return entry.type === "STORE_KEEPER" && entry.storeKeeperSubtype !== "PERMANENT"
}

function recalcEntry(entry: PayrollEntry, changedField: string): PayrollEntry {
  // Per-type gating mirrors the server `computeEmployeeSalaryForSave`:
  //  - Sup / Admin / Driver / Permanent SK → basicPay drives gross.
  //  - Temporary or untagged SK → workingHours × hourlyWage drives gross.
  const isUnitsRate = usesUnitsRate(entry)
  const employeeGross = isUnitsRate
    ? calculateStoreKeeperGross(
        entry.workingHours,
        entry.hourlyWage,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otherAllowance,
      )
    : calculateSupervisorGross(
        entry.basicPay,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otherAllowance,
      )

  const totalGross = employeeGross + entry.dispatcherGross

  // Only auto-recalculate statutory when gross-affecting fields change
  if (GROSS_FIELDS.has(changedField)) {
    const statutory = calculateStatutory(totalGross, entry.kpiAllowance)
    const netSalary = calculateNetSalary(totalGross, statutory, entry.pcb, entry.penalty, entry.advance)
    return { ...entry, grossSalary: totalGross, ...statutory, netSalary }
  }

  // For manual statutory/deduction edits, just recalculate net.
  // Recompute the bonus-rule flag too so the badge stays accurate when only
  // statutory/deduction values were edited (the rule only depends on gross + KPI).
  const baseWageWithoutBonus = Math.max(0, totalGross - entry.kpiAllowance)
  const epfBonusRuleApplied = totalGross > 5000 && baseWageWithoutBonus <= 5000
  const net = totalGross - entry.epfEmployee - entry.socsoEmployee - entry.eisEmployee - entry.pcb - entry.penalty - entry.advance
  return { ...entry, grossSalary: totalGross, epfBonusRuleApplied, netSalary: net }
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
  disabled = false,
}: {
  value: number
  onChange: (val: number) => void
  light?: boolean
  disabled?: boolean
}) {
  const [cents, setCents] = useState(() => floatToCents(value))
  const [lastValue, setLastValue] = useState(value)

  // Sync from parent when value changes externally (e.g. after fetch)
  if (value !== lastValue) {
    setLastValue(value)
    setCents(floatToCents(value))
  }

  function handleKey(e: React.KeyboardEvent) {
    if (disabled) return
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
  // Always-2dp tooltip so users can read the full value on hover even when the
  // column is too narrow to show every digit (RM 100,000+ is rare but possible).
  const fullValue = centsToDisplay(cents === "0" ? "0" : cents)

  return (
    <input
      type="text"
      inputMode="none"
      readOnly
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      value={display}
      placeholder="0.00"
      title={fullValue}
      onKeyDown={handleKey}
      className={`peer w-full min-w-0 bg-transparent text-center tabular-nums placeholder:text-on-surface-variant/40 focus:outline-none focus:text-primary focus:font-semibold ${disabled ? "cursor-not-allowed pointer-events-none" : "cursor-text"} ${light ? "text-[0.7rem] text-on-surface-variant/70" : "text-[0.8rem]"}`}
    />
  )
}

function HoursInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number
  onChange: (val: number) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)

  const display = editing !== null ? editing : (value > 0 ? value.toString() : "")

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      value={display}
      placeholder="0"
      className={`w-full bg-transparent text-center text-[0.8rem] tabular-nums placeholder:text-on-surface-variant/40 caret-primary focus:outline-none focus:text-primary focus:font-semibold ${disabled ? "cursor-not-allowed pointer-events-none" : ""}`}
      onFocus={() => { if (!disabled) setEditing(value > 0 ? value.toString() : "") }}
      onChange={(e) => { if (!disabled) setEditing(e.target.value.replace(/[^\d.]/g, "")) }}
      onBlur={() => {
        if (disabled) return
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
  DRIVER: "Driver",
}

const PAGE_SIZE = 20

/**
 * Mirrors the helper used on /staff?tab=settings — produces a compact page
 * list like [1, "...", 4, 5, 6, "...", 12] so navigation stays one row even
 * for large staff counts.
 */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  const pages: (number | "...")[] = []
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push("...")
  }
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total) {
    if (end < total - 1) pages.push("...")
    pages.push(total)
  }
  return pages
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
  const [branchFilter, setBranchFilter] = useState<string>("")
  const [branchOpen, setBranchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const monthRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  const branchRef = useRef<HTMLDivElement>(null)
  useClickOutside(monthRef, () => setMonthOpen(false))
  useClickOutside(yearRef, () => setYearOpen(false))
  useClickOutside(branchRef, () => setBranchOpen(false))

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/employee-payroll/${month}/${year}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      // Normalize legacy OT-on-Sup/Admin records: drop saved hours/hourlyWage
      // from local state so the table reflects the basic-pay-only formula.
      // The DB still holds the old values until the next Confirm & Save.
      // Also coerce missing `isActive` to `true` — the safer default per
      // spec §8 (treat undefined as active so we don't silently disable rows
      // if the server payload regresses).
      const normalized: PayrollEntry[] = (data.entries as PayrollEntry[]).map((raw) => {
        const e: PayrollEntry = {
          ...raw,
          isActive: raw.isActive ?? true,
          // payMode default for older saved records that pre-date the column.
          payMode: raw.payMode ?? "HOUR",
        }
        // Rows that use units-rate (Temp / untagged SK) keep workingHours +
        // hourlyWage. Anything else (Sup/Admin/Driver/Permanent SK) gets
        // saved hours/wage zeroed so the displayed gross/statutory/net
        // reflect the basicPay-only formula.
        if (usesUnitsRate(e)) return e
        if (e.workingHours === 0 && e.hourlyWage === 0) return e
        return recalcEntry(
          { ...e, workingHours: 0, hourlyWage: 0 },
          "workingHours",
        )
      })
      setEntries(normalized)
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
        // Guard against writes that don't apply to this row's pay model. The
        // UI already hides the inactive inputs, but this keeps the state
        // machine honest.
        const isUnitsRate = usesUnitsRate(e)
        if (isUnitsRate && field === "basicPay") return e
        if (!isUnitsRate && (field === "workingHours" || field === "hourlyWage")) return e
        const updated = { ...e, [field]: value }
        return recalcEntry(updated, field)
      })
    )
  }, [])

  /** Toggle Hour/Day mode for a Temporary store keeper row. Math is
   *  unchanged — only the payslip label and the displayed Pay sub-text. */
  const setEntryPayMode = useCallback((employeeId: string, mode: EntryPayMode) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.employeeId === employeeId && usesUnitsRate(e)
          ? { ...e, payMode: mode }
          : e,
      ),
    )
  }, [])

  // Per-entry "ready" predicate: an entry is saveable when it's active and
  // any type-specific gates pass. Units-rate rows (Temp/untagged Store
  // Keeper) need workingHours > 0; Sup/Admin/Driver/Permanent SK entries
  // are always ready since basicPay can be 0.
  const isEntryReady = useCallback((e: PayrollEntry): boolean => {
    if (!e.isActive) return false
    if (usesUnitsRate(e) && e.workingHours <= 0) return false
    return true
  }, [])

  // Confirm & Save unlocks as soon as at least one active entry is ready.
  // Not-ready entries (e.g. a Temp Store Keeper with no hours yet) are
  // skipped by handleSave — letting the user save partial progress without
  // being blocked by colleagues whose payroll isn't filled in yet.
  const anyReady = useMemo(() => entries.some(isEntryReady), [entries, isEntryReady])

  // Optimistic active/inactive toggle — flip locally first, then PATCH the
  // employee. Reverts and toasts on failure. The same /api/employees/[id]
  // endpoint backs the toggle on /staff?tab=settings.
  const toggleActive = useCallback(async (employeeId: string, nextActive: boolean) => {
    let snapshotName = ""
    setEntries((prev) =>
      prev.map((e) => {
        if (e.employeeId !== employeeId) return e
        snapshotName = e.name
        return { ...e, isActive: nextActive }
      }),
    )
    // Drop from selection when going inactive — bulk payslip can't include it.
    if (!nextActive) {
      setSelectedIds((prev) => {
        if (!prev.has(employeeId)) return prev
        const next = new Set(prev)
        next.delete(employeeId)
        return next
      })
    }
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${snapshotName} marked ${nextActive ? "active" : "inactive"}`)
    } catch {
      // Revert
      setEntries((prev) =>
        prev.map((e) =>
          e.employeeId === employeeId ? { ...e, isActive: !nextActive } : e,
        ),
      )
      toast.error("Failed to update status")
    }
  }, [])

  const branchOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      if (e.branchCode) set.add(e.branchCode)
    }
    return Array.from(set).sort()
  }, [entries])

  // `displayedEntries` = full filtered set (branch + search). Used by hero
  // totals, save payload, bulk select-all, and "all saved?" derivation so
  // those reflect the user's current filter regardless of what page they're
  // on. The table body iterates `pagedEntries` (a 20-row window).
  const displayedEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (branchFilter && e.branchCode !== branchFilter) return false
      if (q) {
        const nameMatch = e.name.toLowerCase().includes(q)
        const icMatch = e.icNo ? e.icNo.includes(q) : false
        if (!nameMatch && !icMatch) return false
      }
      return true
    })
  }, [entries, branchFilter, search])

  const totalPages = Math.max(1, Math.ceil(displayedEntries.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedEntries = useMemo(
    () => displayedEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [displayedEntries, safePage],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      // Skip inactive employees per spec §6.1: don't upsert at all, leave any
      // existing record untouched. User can flip the toggle and re-save to
      // resume payroll for that person.
      const readyEntries = entries.filter(isEntryReady)
      const skippedCount = entries.filter((e) => e.isActive && !isEntryReady(e)).length
      const payload = readyEntries
        .map((e) => {
          const isUnitsRate = usesUnitsRate(e)
          return {
            employeeId: e.employeeId,
            // Force per-row wage source:
            //  - basicPay branch (Sup / Admin / Driver / Permanent SK)
            //  - units-rate branch (Temporary or untagged SK)
            // Server re-applies the same gating, but we strip irrelevant
            // values here so the payload reflects intent.
            basicPay: isUnitsRate ? 0 : e.basicPay,
            workingHours: isUnitsRate ? e.workingHours : 0,
            hourlyWage: isUnitsRate ? e.hourlyWage : 0,
            payMode: isUnitsRate ? e.payMode : null,
            kpiAllowance: e.kpiAllowance,
            petrolAllowance: e.petrolAllowance,
            otherAllowance: e.otherAllowance,
            pcb: e.pcb,
            penalty: e.hasDispatcherMatch ? e.penalty - e.dispatcherPenalty : e.penalty,
            advance: e.hasDispatcherMatch ? e.advance - e.dispatcherAdvance : e.advance,
            // Statutory overrides — let users persist manual edits (including
            // explicit zeros). Omitted fields would otherwise be recomputed
            // server-side from gross, overwriting any cleared value.
            epfEmployee: e.epfEmployee,
            socsoEmployee: e.socsoEmployee,
            eisEmployee: e.eisEmployee,
            epfEmployer: e.epfEmployer,
            socsoEmployer: e.socsoEmployer,
            eisEmployer: e.eisEmployer,
          }
        })

      const res = await fetch(`/api/employee-payroll/${month}/${year}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payload }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }

      const monthLabel = `${MONTHS[month - 1]} ${year}`
      if (skippedCount > 0) {
        toast.success(
          `Payroll saved for ${monthLabel} — ${skippedCount} not-ready ${
            skippedCount === 1 ? "entry" : "entries"
          } skipped`,
        )
      } else {
        toast.success(`Payroll saved for ${monthLabel}`)
      }
      fetchEntries()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save payroll")
    } finally {
      setSaving(false)
    }
  }

  // Summary calculations — reflect the active branch filter so totals match
  // what the user sees in the table. Inactive entries are excluded so the
  // hero "Total Net Payout" matches what will actually be saved.
  const totals = useMemo(() => {
    return displayedEntries
      .filter((e) => e.isActive)
      .reduce(
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
  }, [displayedEntries])

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
  const [deleteTarget, setDeleteTarget] = useState<PayrollEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { check: checkPayslipSetup, dialog: payslipGuardDialog } = usePayslipGuard()

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/employees/${deleteTarget.employeeId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setEntries((prev) => prev.filter((e) => e.employeeId !== deleteTarget.employeeId))
      setSelectedIds((prev) => {
        if (!prev.has(deleteTarget.employeeId)) return prev
        const next = new Set(prev)
        next.delete(deleteTarget.employeeId)
        return next
      })
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error("Failed to delete employee")
    } finally {
      setDeleting(false)
    }
  }

  // Clear selection when month/year/branch filter changes
  useEffect(() => { setSelectedIds(new Set()) }, [month, year, branchFilter])
  // Reset to first page whenever the displayed set could meaningfully shrink.
  useEffect(() => { setPage(1) }, [month, year, branchFilter, search])

  // Active entries only — the bulk-select header, "all saved?" hint, and
  // "select all" affordance ignore inactive rows since their payslip
  // generation and selection are disabled.
  const activeDisplayedEntries = useMemo(
    () => displayedEntries.filter((e) => e.isActive),
    [displayedEntries],
  )

  const allSaved = useMemo(
    () => activeDisplayedEntries.length > 0 && activeDisplayedEntries.every((e) => e.isSaved),
    [activeDisplayedEntries],
  )

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === activeDisplayedEntries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(activeDisplayedEntries.map((e) => e.employeeId)))
    }
  }, [selectedIds.size, activeDisplayedEntries])

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

          {/* Branch selector */}
          <div ref={branchRef} className="relative">
            <button
              onClick={() => setBranchOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-outline-variant/30 hover:border-outline-variant/60 transition-colors min-w-32 justify-between"
            >
              <span className="truncate">{branchFilter || "All branches"}</span>
              <ChevronDown size={12} className={`text-on-surface-variant shrink-0 transition-transform ${branchOpen ? "rotate-180" : ""}`} />
            </button>
            {branchOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-40 py-1 max-h-60 overflow-y-auto">
                <button
                  onClick={() => { setBranchFilter(""); setBranchOpen(false) }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${
                    !branchFilter ? "text-primary font-semibold bg-primary/5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  All branches
                  {!branchFilter && <Check size={13} className="text-primary" />}
                </button>
                {branchOptions.map((code) => (
                  <button
                    key={code}
                    onClick={() => { setBranchFilter(code); setBranchOpen(false) }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${
                      branchFilter === code ? "text-primary font-semibold bg-primary/5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {code}
                    {branchFilter === code && <Check size={13} className="text-primary" />}
                  </button>
                ))}
                {branchOptions.length === 0 && (
                  <div className="px-3.5 py-2 text-[0.72rem] text-on-surface-variant/60">
                    No branches assigned
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search — same shape + behaviour as the Settings tab so users
              don't have to learn two patterns. Filters by name or IC. */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or IC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-[0.83rem] bg-white rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-brand/40 w-52 border border-outline-variant/30 hover:border-outline-variant/60 transition-shadow"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || loading || entries.length === 0 || !anyReady}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary text-white text-[0.83rem] font-medium rounded-[0.375rem] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Confirm & Save
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && displayedEntries.length > 0 && (
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
      ) : displayedEntries.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant text-[0.85rem]">
          {search.trim()
            ? `No employees match "${search.trim()}".`
            : `No employees in branch ${branchFilter}.`}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="sm:hidden text-[0.7rem] text-on-surface-variant/60 pl-1">
            Swipe left to see more columns →
          </p>
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full" style={{ minWidth: 1720 }}>
            <thead>
              <tr>
                {allSaved && (
                  <th className="pb-3 pl-3" style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === displayedEntries.length && displayedEntries.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded accent-brand"
                    />
                  </th>
                )}
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-left pl-3" style={{ minWidth: 180 }}>Employee</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>Branch</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 100 }}>Pay</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 80 }}>Hour/Day</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>Petrol</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>KPI</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>Other</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 100 }}>Gross</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>PCB</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 90 }}>Penalty</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 95 }}>
                  <div>EPF</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 95 }}>
                  <div>SOCSO</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 95 }}>
                  <div>EIS</div>
                  <div className="text-[0.6rem] font-normal normal-case tracking-normal text-on-surface-variant/70">Employer</div>
                </th>
                <th className="text-[0.7rem] font-semibold text-primary uppercase tracking-[0.05em] pb-3 text-center" style={{ minWidth: 110 }}>Net</th>
                <th className="text-[0.7rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] pb-3 text-center" style={{ width: 90 }}>Status</th>
                <th className="pb-3" style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {pagedEntries.map((entry) => {
                const isUnitsRate = usesUnitsRate(entry)
                const isReady = isUnitsRate ? entry.workingHours > 0 : true
                const inactive = !entry.isActive

                return (
                  <tr
                    key={entry.employeeId}
                    className={`group hover:bg-surface-hover/50 transition-colors border-b border-outline-variant/15 last:border-b-0 ${
                      inactive ? "opacity-50" : ""
                    }`}
                  >
                    {/* Checkbox — only for active rows; inactive rows can't be
                        bulk-selected for payslip generation. */}
                    {allSaved && (
                      <td className="py-2.5 pl-3">
                        {inactive ? (
                          <span className="block w-3.5 h-3.5" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(entry.employeeId)}
                            onChange={() => toggleSelect(entry.employeeId)}
                            className="rounded accent-brand"
                          />
                        )}
                      </td>
                    )}

                    {/* Employee */}
                    <td className="py-2.5 pl-3">
                      <div className="flex items-center gap-2.5">
                        {(() => {
                          const target = selectAvatarTarget({
                            employeeId: entry.employeeId,
                            dispatcherId: entry.dispatcherId,
                          })
                          // When linked to a dispatcher (FK), edit goes to the dispatcher's
                          // photo so what the user sees is what they edit. Display priority
                          // already prefers dispatcherAvatarUrl over the employee's own.
                          const displayUrl = entry.dispatcherAvatarUrl ?? entry.avatarUrl
                          const ringColor =
                            entry.gender === "MALE"
                              ? "var(--color-brand)"
                              : entry.gender === "FEMALE"
                                ? "var(--color-female-ring)"
                                : "var(--color-outline-variant)"
                          return (
                            <DispatcherAvatar
                              dispatcherId={target.subjectId}
                              name={entry.name}
                              avatarUrl={displayUrl}
                              ringColor={ringColor}
                              apiBasePath={target.apiBasePath}
                              title={
                                entry.dispatcherId
                                  ? "Editing the linked dispatcher's photo"
                                  : "Edit avatar"
                              }
                              onAvatarChange={(url) => {
                                setEntries((prev) =>
                                  prev.map((e) => {
                                    if (entry.dispatcherId) {
                                      // FK-linked edit propagates to every row sharing this dispatcher
                                      return e.dispatcherId === entry.dispatcherId
                                        ? { ...e, dispatcherAvatarUrl: url }
                                        : e
                                    }
                                    return e.employeeId === entry.employeeId
                                      ? { ...e, avatarUrl: url }
                                      : e
                                  }),
                                )
                              }}
                            />
                          )
                        })()}
                        <div className="min-w-0">
                          <div className="text-[0.8rem] font-medium text-on-surface leading-tight truncate uppercase">
                            {entry.name}
                          </div>
                          <div className="text-[0.63rem] text-on-surface-variant/50 mt-0.5 flex items-center gap-1 flex-wrap">
                            <span>
                              {TYPE_LABELS[entry.type]}{entry.hasDispatcherMatch ? " + Dispatcher" : ""}
                            </span>
                            {entry.type === "STORE_KEEPER" && entry.storeKeeperSubtype && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[0.58rem] font-medium ${STORE_KEEPER_SUBTYPE_CHIP_CLASS[entry.storeKeeperSubtype]}`}
                              >
                                {STORE_KEEPER_SUBTYPE_LABEL[entry.storeKeeperSubtype]}
                              </span>
                            )}
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

                    {/* Pay column — basicPay for Sup/Admin/Driver/Permanent SK,
                        Pay/Hour or Pay/Day for Temporary SK. Per-row sub-label
                        + Hour/Day toggle disambiguates which one is being
                        edited. */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={isUnitsRate ? entry.hourlyWage : entry.basicPay}
                          onChange={(v) => updateEntry(entry.employeeId, isUnitsRate ? "hourlyWage" : "basicPay", v)}
                          disabled={inactive}
                        />
                      </div>
                      {isUnitsRate ? (
                        <div
                          className="inline-flex items-stretch rounded-lg overflow-hidden ring-1 ring-outline-variant/30 mx-auto mt-1"
                          role="radiogroup"
                          aria-label="Pay mode for store keeper"
                          style={{ display: "flex", justifyContent: "center", width: "fit-content", marginLeft: "auto", marginRight: "auto" }}
                        >
                          {(["HOUR", "DAY"] as EntryPayMode[]).map((mode) => {
                            const active = entry.payMode === mode
                            const label = mode === "HOUR" ? "Hour" : "Day"
                            const title =
                              mode === "HOUR"
                                ? "Hourly pay × hours worked this month"
                                : "Daily pay × days worked this month"
                            return (
                              <button
                                key={mode}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={inactive}
                                title={title}
                                onClick={() => setEntryPayMode(entry.employeeId, mode)}
                                className={`px-2 py-0.5 text-[0.6rem] font-medium leading-none transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 ${
                                  active
                                    ? "bg-primary text-white"
                                    : "bg-white text-on-surface-variant/80 hover:bg-surface-hover hover:text-on-surface"
                                }`}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-[0.55rem] text-on-surface-variant/50 text-center leading-tight mt-0.5">
                          Basic Pay
                        </div>
                      )}
                    </td>

                    {/* Hour/Day — editable only for Temp / untagged SK. Other
                        rows render an em-dash; their wage is monthly Basic Pay
                        only. Column header reads "Hour/Day" — the per-row
                        sub-label flips between "Hours" / "Days" based on the
                        active payMode. */}
                    <td className="py-2.5 px-1">
                      {isUnitsRate ? (
                        <div>
                          <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                            <HoursInput
                              value={entry.workingHours}
                              onChange={(v) => updateEntry(entry.employeeId, "workingHours", v)}
                              disabled={inactive}
                            />
                          </div>
                          <div className="text-[0.55rem] text-on-surface-variant/50 text-center leading-tight mt-0.5">
                            {entry.payMode === "DAY" ? "Days" : "Hours"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-[0.8rem] text-on-surface-variant/40 tabular-nums" aria-label="Not applicable">
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
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* KPI */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.kpiAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "kpiAllowance", v)}
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* Other */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.otherAllowance}
                          onChange={(v) => updateEntry(entry.employeeId, "otherAllowance", v)}
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="py-2.5 px-1 text-center">
                      <div
                        className="text-[0.8rem] tabular-nums text-on-surface font-medium whitespace-nowrap"
                        title={formatRM(entry.grossSalary)}
                      >
                        {formatRM(entry.grossSalary)}
                      </div>
                      {entry.hasDispatcherMatch && entry.dispatcherGross > 0 && (
                        <div
                          className="text-[0.6rem] text-on-surface-variant/50 tabular-nums whitespace-nowrap"
                          title={`Dispatcher gross: ${formatRM(entry.dispatcherGross)}`}
                        >
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
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* Penalty */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.penalty}
                          onChange={(v) => updateEntry(entry.employeeId, "penalty", v)}
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* EPF */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.epfEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployee", v)}
                          disabled={inactive}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
                        <CalcCurrencyInput
                          value={entry.epfEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "epfEmployer", v)}
                          light
                          disabled={inactive}
                        />
                      </div>
                      {entry.epfBonusRuleApplied && (
                        <div
                          className="mt-1 text-[0.55rem] leading-snug text-amber-800 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded px-1.5 py-1"
                          title={
                            "Per the KWSP Third Schedule (1 Oct 2025): when an employee normally earning ≤ RM5,000 receives a bonus that pushes the month's wages above RM5,000, the employer's EPF contribution stays at 13% (not 12%).\n\n" +
                            "We treat KPI Allowance as the bonus proxy. Base wage (gross − KPI) is ≤ RM5,000 here, so the rule applies and the employer rate is held at 13%.\n\n" +
                            "All EPF fields are still editable — override the auto values if your KPI is a regular monthly allowance rather than a true bonus."
                          }
                        >
                          <p className="font-semibold uppercase tracking-[0.04em]">
                            KWSP bonus rule
                          </p>
                          <p className="font-normal mt-0.5">
                            Base wage (gross − KPI) is ≤ RM5,000 but KPI pushes the month above, so the employer rate stays at 13% instead of 12%.
                          </p>
                        </div>
                      )}
                    </td>

                    {/* SOCSO */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.socsoEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployee", v)}
                          disabled={inactive}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
                        <CalcCurrencyInput
                          value={entry.socsoEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "socsoEmployer", v)}
                          light
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* EIS */}
                    <td className="py-2.5 px-1">
                      <div className="border border-dashed border-outline-variant/40 rounded px-2 py-1 hover:border-outline-variant/80 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all">
                        <CalcCurrencyInput
                          value={entry.eisEmployee}
                          onChange={(v) => updateEntry(entry.employeeId, "eisEmployee", v)}
                          disabled={inactive}
                        />
                      </div>
                      <div className="border border-dashed border-outline-variant/30 rounded px-2 py-0.5 hover:border-outline-variant/60 hover:bg-surface-hover/40 focus-within:border-solid focus-within:border-primary focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/25 focus-within:shadow-sm transition-all mt-0.5">
                        <CalcCurrencyInput
                          value={entry.eisEmployer}
                          onChange={(v) => updateEntry(entry.employeeId, "eisEmployer", v)}
                          light
                          disabled={inactive}
                        />
                      </div>
                    </td>

                    {/* Net Salary */}
                    <td className="py-2.5 px-1 text-center">
                      <span
                        className="text-[0.85rem] tabular-nums text-primary font-semibold whitespace-nowrap"
                        title={formatRM(entry.netSalary)}
                      >
                        {formatRM(entry.netSalary)}
                      </span>
                    </td>

                    {/* Status — Active/Inactive toggle. The chip below the
                        toggle echoes the state in case the row dim makes the
                        toggle hard to read. */}
                    <td className="py-2.5 px-1 text-center align-middle">
                      <div className="inline-flex flex-col items-center gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={entry.isActive}
                          aria-label={
                            entry.isActive
                              ? `Click to mark ${entry.name} inactive`
                              : `Click to mark ${entry.name} active`
                          }
                          title={
                            entry.isActive ? "Click to mark inactive" : "Click to mark active"
                          }
                          onClick={() => toggleActive(entry.employeeId, !entry.isActive)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                            entry.isActive ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                              entry.isActive ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide rounded-md ${
                            entry.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                              : "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200"
                          }`}
                        >
                          {entry.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>

                    {/* Payslip / Delete — Delete still works on inactive rows
                        so the user doesn't have to re-activate before deleting.
                        Generate Payslip is hidden for inactive rows since their
                        salary intent is "no payroll this month". */}
                    <td className="py-2.5 px-2 text-left">
                      <div className="inline-flex flex-col items-start gap-2">
                        {inactive ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-[0.7rem] text-on-surface-variant/60"
                            title="Payslip disabled while inactive"
                          >
                            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
                            Skipped on save
                          </span>
                        ) : entry.isSaved ? (
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
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          title={`Delete ${entry.name}`}
                          aria-label={`Delete ${entry.name}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] font-medium text-critical border border-critical/30 rounded-md hover:bg-critical/5 hover:border-critical/50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* Pagination — mirrors the Settings tab. Hidden when only one
              page so single-screen branches don't show empty chrome. */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, displayedEntries.length)} of {displayedEntries.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                {getPageNumbers(safePage, totalPages).map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="text-[0.72rem] text-on-surface-variant px-1">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-7 h-7 flex items-center justify-center rounded-[0.375rem] text-[0.72rem] font-medium tabular-nums transition-colors cursor-pointer ${
                        safePage === p ? "bg-brand text-white" : "text-on-surface-variant hover:bg-surface-hover"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Next page"
                  className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
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
              value={formatIcInput(icInput)}
              onChange={(e) => setIcInput(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="YYMMDD-PB-####"
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

      {/* Delete Employee Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-on-surface/40"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] max-w-sm w-full mx-4">
            <h3 className="font-heading font-semibold text-[1.1rem] text-on-surface">
              Delete {deleteTarget.name}?
            </h3>
            <p className="text-[0.84rem] text-on-surface-variant mt-2">
              This will permanently delete this employee{deleteTarget.isSaved ? " and their saved salary record for this month" : ""}. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-critical rounded-[0.375rem] hover:bg-critical/90 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
