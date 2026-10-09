"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Progress } from "@/components/arc/progress/progress";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import { getUploadUrl } from "@/lib/v2/payroll/actions";
import type { RunSummary } from "@/lib/v2/payroll/data";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

type RunResponse = { runId: string; replaced: boolean } | { error: MessageKey; vars?: Record<string, string | number> };

/** PUTs the file to the signed R2 URL, reporting progress. */
function put(url: string, file: File, contentType: string, onProgress: (percent: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export function Runs({ runs }: { runs: RunSummary[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const start = (
    <Button onClick={() => router.push("/app/payroll/new")}>
      <FileUp size={16} aria-hidden="true" />
      {t("wizard.start")}
    </Button>
  );

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("runs.title")}</h1>
          <p className={ui.subtitle}>{t("runs.subtitle")}</p>
        </div>
        <div className={ui.row}>
          {runs.length > 0 && (
            <Link href="/app/payroll/check" className={ui.link}>
              {t("runs.check")}
            </Link>
          )}
          {start}
        </div>
      </header>
      {runs.length === 0 ? (
        <EmptyState title={t("runs.emptyTitle")} description={t("runs.emptyBody")} action={start} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("runs.month")}</th>
                <th scope="col">{t("runs.outlet")}</th>
                <th scope="col" data-numeric>
                  {t("runs.dispatchers")}
                </th>
                <th scope="col" data-numeric>
                  {t("runs.parcels")}
                </th>
                <th scope="col" data-numeric>
                  {t("runs.net")}
                </th>
                <th scope="col">{t("runs.status")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/app/payroll/${r.id}`} className={styles.open}>
                      {monthLabel(i18n, r.period)}
                    </Link>
                  </th>
                  <td>{r.outlet}</td>
                  <td data-numeric>{i18n.number(r.dispatchers)}</td>
                  <td data-numeric>{i18n.number(r.parcels)}</td>
                  <td data-numeric>{i18n.money(r.netCents / 100)}</td>
                  <td>
                    <span className={styles.status}>
                      <Badge tone={r.status === "FINAL" ? "success" : "neutral"} size="sm">
                        {t(r.status === "FINAL" ? "runs.final" : "runs.draft")}
                      </Badge>
                      {r.attention > 0 && <span className={styles.warn}>{i18n.tp("runs.attention", r.attention)}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Step 1 of New payroll: the J&T delivery file. Creates (or replaces) the draft, then moves on to penalties. */
export function RunUpload() {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    setError(null);
    const target = await getUploadUrl({ fileName: file.name, size: file.size }).catch(() => null);
    if (!target?.ok) return setError(t(target?.error ?? "run.err.upload", target?.vars));
    setPercent(0);
    setStage("uploading");
    if (!(await put(target.data.url, file, target.data.contentType, setPercent))) {
      setStage("idle");
      return setError(t("run.err.upload"));
    }
    setStage("reading");
    const res = await fetch("/api/v2/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: target.data.key, fileName: file.name }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as RunResponse | null;
    if (!res?.ok || !body || "error" in body) {
      setStage("idle");
      return setError(t(body && "error" in body ? body.error : "run.err.unreadable", body && "error" in body ? body.vars : undefined));
    }
    toast.success(t(body.replaced ? "runs.replaced" : "runs.created"));
    router.push(`/app/payroll/new?run=${body.runId}`);
  }

  return (
    <section className={ui.card} aria-labelledby="upload-title">
      <div>
        <h2 id="upload-title" className={ui.cardTitle}>
          {t("runs.upload")}
        </h2>
        <p className={ui.help}>{t("runs.uploadHelp")}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void start(file);
        }}
      />
      <div>
        <Button onClick={() => input.current?.click()} loading={stage !== "idle"}>
          <FileUp size={16} aria-hidden="true" />
          {t("runs.upload")}
        </Button>
      </div>
      {stage === "uploading" && <Progress value={percent} label={t("runs.uploading")} showValue />}
      {stage === "reading" && (
        <p className={ui.help} role="status">
          {t("runs.reading")}
        </p>
      )}
      {error && <Alert tone="danger" title={error} />}
    </section>
  );
}
