# Login page assets

The login page looks for two optional files here. Both have working fallbacks,
so the page renders correctly even if you drop nothing in — but adding your real
assets is what makes it match the approved design exactly.

| File | Used for | Fallback if missing |
|---|---|---|
| `nbpdcl-logo.png` | The official NBPDCL emblem beside the wordmark. Transparent PNG, ~256×256. | A circular bolt mark in NBPDCL blue. |
| `login-hero.jpg` | The hero photograph (transmission towers at sunset). Landscape, ≥1920×1080. | A CSS/SVG sunset-and-towers scene. |

Just copy the files in with these exact names — no code change or rebuild config
is needed; Vite serves `public/` at the site root.

The official emblem and the photograph are your own assets — they are not
reproduced here, and the page is built to slot them in cleanly.
