"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Progress } from "@/components/arc/progress/progress";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import { getUploadUrl } from "@/lib/v2/payroll/actions";
import type { RunSummary } from "@/lib/v2/payroll/data";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

type RunResponse =
  | { runId: string; replaced: boolean }
  | { error: MessageKey; vars?: Record<string, string | number> };

/** PUTs the file to the signed R2 URL, reporting progress. */
function put(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** Every run, newest month first, under the month close table. */
export function Runs({ runs }: { runs: RunSummary[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  if (runs.length === 0) return null;

  return (
    <section className={ui.stack} aria-labelledby="all-runs">
      <h2 id="all-runs" className={ui.cardTitle}>
        {t("runs.all")}
      </h2>
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
                    <Badge
                      tone={r.status === "FINAL" ? "success" : "neutral"}
                      size="sm"
                    >
                      {t(r.status === "FINAL" ? "runs.final" : "runs.draft")}
                    </Badge>
                    {r.attention > 0 && (
                      <span className={styles.warn}>
                        {i18n.tp("runs.attention", r.attention)}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Step 1 of New payroll: the J&T delivery files. Each creates (or replaces) its branch's draft. One file moves on to its
 * penalties; several are read one after another and the month close screen picks them up.
 */
export function RunUpload() {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{
    name: string;
    stage: "uploading" | "reading";
    percent: number;
  } | null>(null);
  const [lines, setLines] = useState<{ name: string; error: string | null }[]>(
    [],
  );

  /** Uploads and reads one file; the new run's id, or the error to show. */
  async function one(
    file: File,
  ): Promise<{ runId: string; replaced: boolean } | { error: string }> {
    const target = await getUploadUrl({
      fileName: file.name,
      size: file.size,
    }).catch(() => null);
    if (!target?.ok)
      return { error: t(target?.error ?? "run.err.upload", target?.vars) };
    setCurrent({ name: file.name, stage: "uploading", percent: 0 });
    if (
      !(await put(target.data.url, file, target.data.contentType, (percent) =>
        setCurrent({ name: file.name, stage: "uploading", percent }),
      ))
    )
      return { error: t("run.err.upload") };
    setCurrent({ name: file.name, stage: "reading", percent: 100 });
    const res = await fetch("/api/v2/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: target.data.key, fileName: file.name }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as RunResponse | null;
    if (!res?.ok || !body || "error" in body)
      return {
        error: t(
          body && "error" in body ? body.error : "run.err.unreadable",
          body && "error" in body ? body.vars : undefined,
        ),
      };
    return body;
  }

  async function start(files: File[]) {
    setBusy(true);
    setLines([]);
    const done: { name: string; error: string | null }[] = [];
    let last: { runId: string; replaced: boolean } | null = null;
    for (const file of files) {
      const r = await one(file);
      done.push({ name: file.name, error: "error" in r ? r.error : null });
      if (!("error" in r)) last = r;
      setLines([...done]);
    }
    setCurrent(null);
    setBusy(false);
    if (files.length === 1 && last) {
      toast.success(t(last.replaced ? "runs.replaced" : "runs.created"));
      return router.push(`/app/payroll/new?run=${last.runId}`);
    }
    const ok = done.filter((d) => !d.error).length;
    if (ok > 0) {
      toast.success(t("runs.createdMany", { count: ok }));
      if (ok === files.length) router.push("/app/payroll");
    }
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
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void start(files);
        }}
      />
      <div>
        <Button onClick={() => input.current?.click()} loading={busy}>
          <FileUp size={16} aria-hidden="true" />
          {t("runs.upload")}
        </Button>
      </div>
      {current?.stage === "uploading" && (
        <Progress
          value={current.percent}
          label={`${current.name}: ${t("runs.uploading")}`}
          showValue
        />
      )}
      {current?.stage === "reading" && (
        <p className={ui.help} role="status">
          {`${current.name}: ${t("runs.reading")}`}
        </p>
      )}
      {lines.length > 0 && (
        <ul className={ui.list}>
          {lines.map((l) => (
            <li key={l.name}>
              {l.error ? (
                <Alert tone="danger" title={`${l.name}: ${l.error}`} />
              ) : (
                `${l.name}: ${t("runs.fileRead")}`
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
