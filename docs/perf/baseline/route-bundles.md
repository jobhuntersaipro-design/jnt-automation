# Per-Route Initial JS Bundle

Captured: 2026-04-23T08:07:12.630Z

Sum of client chunks referenced by each route's
`page_client-reference-manifest.js`. This is the JS the browser
pays for on a cold page load (before any dynamic imports fire).

| Route | Chunks | Raw (KB) | Gzipped (KB) |
|---|---:|---:|---:|
| `/auth/login` | 3 | 122.3 | 34.4 |
| `/auth/register` | 3 | 125.0 | 35.0 |
| `/(dashboard)/dashboard` | 7 | 728.7 | 217.3 |
| `/(dashboard)/dispatchers` | 5 | 251.9 | 69.2 |
| `/(dashboard)/staff` | 5 | 195.5 | 54.1 |
| `/(dashboard)/payroll` | 3 | 141.9 | 40.5 |
| `/(dashboard)/settings` | 4 | 164.3 | 46.8 |
| `/(dashboard)/admin` | 4 | 168.4 | 48.0 |
