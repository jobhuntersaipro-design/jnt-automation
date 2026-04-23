# Per-Route Initial JS Bundle

Captured: 2026-04-23T08:52:08.029Z

Sum of client chunks referenced by each route's
`page_client-reference-manifest.js`. This is the JS the browser
pays for on a cold page load (before any dynamic imports fire).

| Route | Chunks | Raw (KB) | Gzipped (KB) |
|---|---:|---:|---:|
| `/auth/login` | 3 | 122.3 | 34.4 |
| `/auth/register` | 3 | 125.0 | 35.0 |
| `/(dashboard)/dashboard` | 7 | 728.9 | 217.4 |
| `/(dashboard)/dispatchers` | 5 | 252.1 | 69.3 |
| `/(dashboard)/staff` | 5 | 195.7 | 54.2 |
| `/(dashboard)/payroll` | 3 | 142.1 | 40.6 |
| `/(dashboard)/settings` | 4 | 164.5 | 46.9 |
| `/(dashboard)/admin` | 4 | 168.6 | 48.1 |
