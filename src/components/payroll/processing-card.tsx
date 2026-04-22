"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";

export type UploadStage = "parse" | "split" | "calculate" | "save";

export interface UploadProgressData {
  stage: UploadStage;
  stageLabel: string;
  rowsParsed?: number;
  dispatchersFound?: number;
  dispatchersProcessed?: number;
  totalDispatchers?: number;
  startedAt: number;
  updatedAt: number;
}

interface UploadStageTimelineProps {
  /** UPLOADING | PROCESSING */
  phase: "uploading" | "processing";
  /** 0-100 for R2 upload progress (UPLOADING phase) */
  uploadPercent?: number;
  /** Progress tick from the server worker (PROCESSING phase) */
  progress?: UploadProgressData;
}

type StageKey = "upload" | "parse" | "match" | "calculate" | "save";
type StageState = "done" | "active" | "pending";

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: "upload", label: "Upload" },
  { key: "parse", label: "Parse" },
  { key: "match", label: "Match" },
  { key: "calculate", label: "Calculate" },
  { key: "save", label: "Save" },
];

function stateFor(
  stage: StageKey,
  phase: "uploading" | "processing",
  progress?: UploadProgressData,
): StageState {
  if (phase === "uploading") {
    return stage === "upload" ? "active" : "pending";
  }
  // PROCESSING — upload is always done at this point
  if (stage === "upload") return "done";
  const map: Record<UploadStage, StageKey> = {
    parse: "parse",
    split: "match",
    calculate: "calculate",
    save: "save",
  };
  const currentKey = progress ? map[progress.stage] : "parse";
  const order: StageKey[] = ["upload", "parse", "match", "calculate", "save"];
  const currentIdx = order.indexOf(currentKey);
  const stageIdx = order.indexOf(stage);
  if (stageIdx < currentIdx) return "done";
  if (stageIdx === currentIdx) return "active";
  return "pending";
}

function StageChip({ label, state }: { label: string; state: StageState }) {
  if (state === "done") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white">
          <Check className="w-3 h-3" strokeWidth={3} />
        </div>
        <span className="text-[0.78rem] font-medium text-emerald-700">{label}</span>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-brand text-white animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
        <span className="text-[0.78rem] font-semibold text-brand">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-surface-low text-on-surface-variant/40 border border-outline-variant/30">
        <Circle className="w-2 h-2 fill-current" />
      </div>
      <span className="text-[0.78rem] text-on-surface-variant/50">{label}</span>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function UploadStageTimeline({
  phase,
  uploadPercent,
  progress,
}: UploadStageTimelineProps) {
  const [tick, setTick] = useState(0);

  // Re-render once a second so elapsed time ticks up without waiting for a
  // status poll.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute active-stage progress percentage for the linear bar
  let percent = 0;
  let detail = "";

  if (phase === "uploading") {
    percent = uploadPercent ?? 0;
    detail = uploadPercent != null ? `Uploading… ${uploadPercent}%` : "Uploading…";
  } else if (phase === "processing") {
    if (!progress) {
      detail = "Starting…";
      percent = 2;
    } else {
      const elapsed = Date.now() - progress.startedAt;
      switch (progress.stage) {
        case "parse": {
          const rows = progress.rowsParsed ?? 0;
          detail = `Parsing Excel — ${formatNumber(rows)} rows · ${formatElapsed(elapsed)} elapsed`;
          // Can't know total rows until parse ends; use a sigmoid-ish feel
          // based on rate so users see the bar moving.
          percent = Math.min(50, Math.floor((rows / 200_000) * 50) + 5);
          break;
        }
        case "split": {
          detail = `Identifying dispatchers…`;
          percent = 55;
          break;
        }
        case "calculate": {
          const done = progress.dispatchersProcessed ?? 0;
          const total = progress.totalDispatchers ?? 0;
          const fraction = total > 0 ? done / total : 0;
          detail = `Calculating salaries — ${done}/${total} dispatchers · ${formatElapsed(elapsed)} elapsed`;
          percent = 60 + Math.floor(fraction * 35);
          break;
        }
        case "save":
          detail = "Finalising preview…";
          percent = 97;
          break;
      }
    }
  }

  // Force-read tick so eslint doesn't complain about unused var
  void tick;

  return (
    <div className="rounded-lg bg-surface-low/40 border border-outline-variant/15 p-4 space-y-3">
      {/* Stage chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <StageChip label={s.label} state={stateFor(s.key, phase, progress)} />
            {i < STAGES.length - 1 && (
              <div className="w-4 h-px bg-outline-variant/40 mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>

      {/* Detail line */}
      <p className="text-[0.78rem] text-on-surface-variant tabular-nums">
        {detail}
      </p>
    </div>
  );
}

// Backward-compat alias: older callers imported ProcessingCard — keep the
// symbol alive with a thin wrapper in case something still uses it.
export const ProcessingCard = UploadStageTimeline;
