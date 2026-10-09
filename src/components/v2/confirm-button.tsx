"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonVariant } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { useI18n } from "@/components/v2/i18n-provider";
import ui from "./ui.module.css";

/**
 * A button that asks first, in a dialog: the question is never cut off and the button matches every other one.
 * `onConfirm` throws to say it failed; the dialog stays open with the error.
 */
export function ConfirmButton({
  label,
  prompt,
  confirmLabel,
  doneLabel,
  variant = "secondary",
  confirmVariant = variant === "secondary" ? "primary" : variant,
  onConfirm,
}: {
  label: string;
  prompt: string;
  confirmLabel: string;
  doneLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      setOpen(false);
      if (doneLabel) toast.success(doneLabel);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent title={label} description={prompt} closeLabel={t("common.close")}>
          <div className={ui.stack}>
            {failed && (
              <p role="alert" className={ui.error}>
                {t("common.failed")}
              </p>
            )}
            <div className={ui.row}>
              <Button variant={confirmVariant} onClick={confirm} loading={pending}>
                {confirmLabel}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
