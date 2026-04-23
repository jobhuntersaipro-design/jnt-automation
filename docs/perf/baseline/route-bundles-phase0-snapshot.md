# Per-Route Initial JS Bundle

Captured: 2026-04-23T08:06:40.146Z

Sum of client chunks referenced by each route's
`page_client-reference-manifest.js`. This is the JS the browser
pays for on a cold page load (before any dynamic imports fire).

| Route | Chunks | Raw (KB) | Gzipped (KB) |
|---|---:|---:|---:|
| `/auth/login` | 3 | 122.3 | 34.4 |
| `/auth/register` | 3 | 125.0 | 35.0 |
| `/(dashboard)/dashboard` | 7 | 734.9 | 219.0 |
| `/(dashboard)/dispatchers` | 6 | 713.8 | 197.0 |
| `/(dashboard)/staff` | 5 | 212.4 | 57.4 |
| `/(dashboard)/payroll` | 3 | 148.4 | 42.3 |
| `/(dashboard)/settings` | 4 | 170.8 | 48.6 |
| `/(dashboard)/admin` | 4 | 174.8 | 49.8 |
