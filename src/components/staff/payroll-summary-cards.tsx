"use client"

function formatRM(val: number): string {
  return val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface PayrollSummaryCardsProps {
  totals: {
    gross: number
    epfEmployee: number
    socsoEmployee: number
    eisEmployee: number
    net: number
  }
}

export function PayrollSummaryCards({ totals }: PayrollSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Hero card — Total Net Payout */}
      <div className="col-span-2 lg:col-span-1 bg-primary rounded-xl p-4 text-white">
        <div className="text-[0.7rem] font-medium uppercase tracking-[0.05em] text-white/70">
          Total Net Payout
        </div>
        <div className="text-[1.5rem] font-bold tabular-nums mt-1 tracking-tight">
          RM {formatRM(totals.net)}
        </div>
      </div>

      {/* Total Gross */}
      <div className="bg-white rounded-xl p-4 border border-outline-variant/20">
        <div className="text-[0.7rem] font-medium text-on-surface-variant uppercase tracking-[0.05em]">
          Total Gross
        </div>
        <div className="text-[1.1rem] font-bold text-on-surface tabular-nums mt-1">
          RM {formatRM(totals.gross)}
        </div>
      </div>

      {/* EPF */}
      <div className="bg-white rounded-xl p-4 border border-outline-variant/20">
        <div className="text-[0.7rem] font-medium text-on-surface-variant uppercase tracking-[0.05em]">
          EPF (Employee)
        </div>
        <div className="text-[1.1rem] font-bold text-on-surface tabular-nums mt-1">
          RM {formatRM(totals.epfEmployee)}
        </div>
      </div>

      {/* SOCSO */}
      <div className="bg-white rounded-xl p-4 border border-outline-variant/20">
        <div className="text-[0.7rem] font-medium text-on-surface-variant uppercase tracking-[0.05em]">
          SOCSO (Employee)
        </div>
        <div className="text-[1.1rem] font-bold text-on-surface tabular-nums mt-1">
          RM {formatRM(totals.socsoEmployee)}
        </div>
      </div>

      {/* EIS */}
      <div className="bg-white rounded-xl p-4 border border-outline-variant/20">
        <div className="text-[0.7rem] font-medium text-on-surface-variant uppercase tracking-[0.05em]">
          EIS (Employee)
        </div>
        <div className="text-[1.1rem] font-bold text-on-surface tabular-nums mt-1">
          RM {formatRM(totals.eisEmployee)}
        </div>
      </div>
    </div>
  )
}
