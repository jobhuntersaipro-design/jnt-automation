# Upload Phase 1: File Upload + QStash Background Processing

## Overview

Handles the file upload flow that is now embedded inside the Payroll page.
Files are uploaded to Cloudflare R2 immediately. Processing is queued via
QStash and runs in the background — no 60s timeout risk. Client polls for
status every 2 seconds.

## Expected Outcome

After this phase:
- Agent drops an Excel file in the Payroll page upload zone
- File uploads to R2 immediately
- Processing queued via QStash — returns immediately, no timeout risk
- Client polls status every 2s — updates UI in real-time
- Crash/timeout recovery with retry
- Duplicate upload warning before replacing existing confirmed month

---

## New Dependencies

```bash
npm install @upstash/qstash
```

```env
QSTASH_URL=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
```

From Upstash dashboard → QStash tab (same account as Redis).

---

## Upload Flow

```
1. Agent drops file in Payroll page upload zone
2. Client validates file type (.xlsx/.xls) — reject immediately if invalid
3. POST /api/upload/init
   → Creates Upload row (status: UPLOADING)
   → Returns { uploadId, presignedUrl }
4. Client uploads file directly to R2 via presigned URL
5. POST /api/upload/[uploadId]/process
   → Queues job to QStash: { uploadId }
   → Sets Upload.status = PROCESSING
   → Returns { status: "PROCESSING" } immediately
6. Client polls GET /api/upload/[uploadId]/status every 2s
7. QStash calls POST /api/upload/worker (background, no time limit)
   → Worker processes file (Upload Phase 2)
   → Updates Upload.status to terminal state
8. Polling detects terminal state → Payroll page updates UI
```

---

## Status Flow

```
UPLOADING → PROCESSING → CONFIRM_SETTINGS (new — Phase 2)
                       → NEEDS_ATTENTION (new dispatchers found)
                       → FAILED
CONFIRM_SETTINGS → READY_TO_CONFIRM (after agent confirms settings)
READY_TO_CONFIRM → SAVED (after agent confirms preview)
FAILED → PROCESSING (retry)
```

| Status | Description |
|---|---|
| `UPLOADING` | File uploading to R2 |
| `PROCESSING` | Background worker running |
| `CONFIRM_SETTINGS` | Parsed OK — agent must confirm settings before calculating |
| `NEEDS_ATTENTION` | New dispatchers found — setup required |
| `READY_TO_CONFIRM` | Calculations done, preview ready |
| `FAILED` | Worker crashed — retry available |
| `SAVED` | Confirmed and saved to DB |

---

## QStash Worker

```ts
// src/app/api/upload/worker/route.ts
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

async function handler(req: Request) {
  const { uploadId } = await req.json();
  await processUpload(uploadId); // Upload Phase 2
  return new Response("ok");
}

export const POST = verifySignatureAppRouter(handler);
```

Worker URL:
- Local dev: use ngrok or Vercel dev tunnel
- Production: `https://easystaff.top/api/upload/worker`

---

## Duplicate Upload Handling

If branch + month already has a SAVED upload:
```
"Payroll for [Branch] — [Month Year] already exists.
Re-uploading will delete existing salary records.
Dispatcher settings will be kept.
This cannot be undone. Continue?"
```
- Confirmed → delete SalaryRecords (cascade) + old Upload row → proceed
- Cancelled → dismiss

---

## Crash & Timeout Recovery

- Worker wraps all processing in try/catch
- Any error → `Upload.status = FAILED` + `errorMessage` stored
- Retry → `POST /api/upload/[uploadId]/process` → QStash re-queues
- File already in R2 — no re-upload needed

**Stale detection on page load:**
```ts
await prisma.upload.updateMany({
  where: {
    agentId: session.user.id,
    status: "PROCESSING",
    updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
  },
  data: { status: "FAILED", errorMessage: "Processing timed out. Please retry." },
});
```

---

## DB Changes

```prisma
model Upload {
  // ... existing fields ...
  status       UploadStatus @default(UPLOADING)
  errorMessage String?
}

enum UploadStatus {
  UPLOADING
  PROCESSING
  CONFIRM_SETTINGS
  NEEDS_ATTENTION
  READY_TO_CONFIRM
  FAILED
  SAVED
}
```

```bash
npx prisma migrate dev --name add-upload-status
```

---

## API Routes

### `POST /api/upload/init`
Create Upload row + generate R2 presigned URL. Check for duplicate.
Response: `{ uploadId, presignedUrl, isDuplicate }`

### `POST /api/upload/[uploadId]/process`
Queue QStash job. Set status PROCESSING. Return immediately.
Response: `{ status: "PROCESSING" }`

### `GET /api/upload/[uploadId]/status`
Return current status + any metadata.
Response: `{ status, errorMessage?, newDispatchers?, processedCount? }`

### `POST /api/upload/worker`
QStash worker — signature verified. Runs processing pipeline.

---

## Files to Create

| File | Action |
|---|---|
| `src/app/api/upload/init/route.ts` | Create |
| `src/app/api/upload/[uploadId]/process/route.ts` | Create |
| `src/app/api/upload/[uploadId]/status/route.ts` | Create |
| `src/app/api/upload/worker/route.ts` | Create — shell only, logic in Phase 2 |
| `src/lib/db/upload.ts` | Create — DB query functions |

---

## Testing

1. Drop valid `.xlsx` → Upload row created, status UPLOADING
2. Drop invalid file type → rejected immediately
3. Upload completes → status changes to PROCESSING
4. Worker runs → status updates to CONFIRM_SETTINGS or NEEDS_ATTENTION
5. Polling detects change → Payroll page updates
6. Same branch + month already SAVED → duplicate dialog shown
7. Confirm replacement → old records deleted, proceeds
8. Simulate crash → status FAILED, retry button shown
9. Retry → requeues, processes from R2 file
10. Stale PROCESSING job on page load → auto-marked FAILED
11. QStash worker rejects requests without valid signature

## Status

Not started.
