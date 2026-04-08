# Staff Page — Phase 3: Add Dispatcher + Avatar Upload

## Overview

Add the ability to create new dispatchers manually and upload avatar photos
stored in Cloudflare R2. After this phase the Staff page is fully functional.

## What You Can Do After This Phase

- Add a new dispatcher manually (name, extId, IC number, branch)
- Default weight tiers, incentive rule, and petrol rule seeded automatically on creation
- Upload a custom avatar photo per dispatcher (stored in Cloudflare R2)
- Remove an uploaded avatar (reverts to initials)
- New dispatcher starts as "Incomplete" until incentive amount is set

---

## Add Dispatcher

### Trigger
"Add Dispatcher" button in the Staff page header (top right).
Opens a separate **Add Dispatcher drawer** (distinct from the edit drawer).

### Add Dispatcher Drawer

**Fields:**
| Field | Type | Mandatory |
|---|---|---|
| Full Name | Text input | ✅ |
| Dispatcher ID (extId) | Text input | ✅ |
| IC Number | Text input | ✅ |
| Branch | Select dropdown (agent's branches) | ✅ |

**On submit:**
1. Validate all fields
2. Check `extId` is unique within the selected branch
3. Create `Dispatcher` row
4. Seed 3 default `WeightTier` rows in same transaction
5. Seed `IncentiveRule` with `orderThreshold: 2000`, `incentiveAmount: 0`
6. Seed `PetrolRule` with `isEligible: false`, `dailyThreshold: 70`, `subsidyAmount: 15`
7. Close drawer + add new dispatcher to list + open edit drawer immediately
8. Toast: "Dispatcher added. Complete their salary rules."

**Errors:**
- `409` — "A dispatcher with this ID already exists in the selected branch"
- `400` — validation errors shown inline

### API Route

`POST /api/staff`

**Request body:**
```ts
{
  name: string
  extId: string
  icNo: string
  branchId: string
}
```

**Logic:**
```ts
await prisma.$transaction([
  prisma.dispatcher.create({ data: { name, extId, icNo, gender, branchId } }),
  prisma.weightTier.createMany({
    data: [
      { dispatcherId, tier: 1, minWeight: 0,     maxWeight: 5,    commission: 1.00 },
      { dispatcherId, tier: 2, minWeight: 5.01,  maxWeight: 10,   commission: 1.40 },
      { dispatcherId, tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.20 },
    ]
  }),
  prisma.incentiveRule.create({
    data: { dispatcherId, orderThreshold: 2000, incentiveAmount: 0 }
  }),
  prisma.petrolRule.create({
    data: { dispatcherId, isEligible: false, dailyThreshold: 70, subsidyAmount: 15 }
  }),
])
```

**Response:** `{ dispatcher: DispatcherRow }`

---

## Avatar Upload

### Where it lives
Inside the edit drawer (Phase 2), at the top of the drawer body below the header.

### UI
- Current avatar shown (initials or uploaded photo)
- "Upload photo" button below avatar — opens file picker
- Accepted: `.jpg`, `.jpeg`, `.png`, `.webp` only
- Max size: 2MB
- After upload: avatar updates immediately (optimistic)
- "Remove photo" link shown only if a custom photo exists — reverts to initials

### Upload Flow
1. User selects file
2. Client validates type + size
3. `POST /api/staff/[id]/avatar` with `multipart/form-data`
4. Server uploads to Cloudflare R2 at key: `avatars/{agentId}/{dispatcherId}.{ext}`
5. Server updates `Dispatcher.avatarUrl` with the R2 public URL
6. Response returns new `avatarUrl`
7. Client updates avatar display

### Remove Flow
1. User clicks "Remove photo"
2. `DELETE /api/staff/[id]/avatar`
3. Server deletes file from R2
4. Server sets `Dispatcher.avatarUrl = null`
5. Avatar reverts to initials

### Cloudflare R2 Setup

```ts
// src/lib/r2.ts
import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=        # public bucket URL e.g. https://pub-xxx.r2.dev
```

### API Routes

**`POST /api/staff/[id]/avatar`**
- Accept `multipart/form-data` with `file` field
- Validate file type + size server-side
- Upload to R2 using `PutObjectCommand`
- Update `Dispatcher.avatarUrl`
- Response: `{ avatarUrl: string }`

**`DELETE /api/staff/[id]/avatar`**
- Delete from R2 using `DeleteObjectCommand`
- Set `Dispatcher.avatarUrl = null`
- Response: `{ success: true }`

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/components/staff/add-dispatcher-drawer.tsx` | Create — add dispatcher form |
| `src/components/staff/avatar-upload.tsx` | Create — avatar upload + remove UI |
| `src/app/api/staff/route.ts` | Create — POST create dispatcher |
| `src/app/api/staff/[id]/avatar/route.ts` | Create — POST upload + DELETE remove avatar |
| `src/lib/r2.ts` | Create — R2 client |
| `src/components/staff/dispatcher-drawer.tsx` | Modify — add avatar upload section |
| `src/components/staff/dispatcher-list.tsx` | Modify — handle new dispatcher added to list |

---

## Testing

### Add Dispatcher
1. Click "Add Dispatcher" → add drawer opens
2. Fill all fields → submit → dispatcher appears in list
3. Verify in Prisma Studio: 3 weight tiers + incentive rule + petrol rule seeded
4. New dispatcher status shows "Incomplete" (incentive amount = 0)
5. Submit with duplicate extId in same branch → `409` error shown
6. Submit with empty name → inline validation error
7. Submit with empty extId → inline validation error
8. After creation → edit drawer opens automatically

### Avatar Upload
9. Click "Upload photo" → file picker opens
10. Select valid jpg under 2MB → avatar updates immediately
11. Select file over 2MB → client-side error shown
12. Select unsupported file type (e.g. .gif) → client-side error shown
13. Verify uploaded photo appears in dispatcher list row
14. Verify R2 bucket contains the file
15. Click "Remove photo" → reverts to initials
16. Verify R2 file deleted after removal
17. Verify `avatarUrl` is null in DB after removal

## Status

Not started. Complete Phase 1 and Phase 2 first.
