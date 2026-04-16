# web/

Interactive frontend for AfterBreach. **Deployed to Vercel** with this directory as the root.

## Structure

```
web/
├── vercel.json              # Vercel config: redirects / → /australia, headers
├── index.html               # Fallback redirect for non-Vercel hosting
├── AfterBreach_Logo.svg     # Logo asset, served at /AfterBreach_Logo.svg
├── australia/               # AU jurisdiction (first)
│   ├── index.html           # Single-page tool (obligations selector + results)
│   ├── styles.css
│   └── app.js
├── new-zealand/             # Future jurisdictions follow the same pattern
├── united-kingdom/
└── european-union/
```

Each jurisdiction gets its own subdirectory. Adding a jurisdiction means:

1. Create a new directory at `web/{country-slug}/` mirroring `web/australia/`.
2. Import the relevant `data/{iso-code}/obligations.json`.

## Vercel settings

- **Root Directory:** `web`
- **Framework preset:** Other (static)
- **Build command:** (none — static)
- **Output directory:** (none — serves `web/` as-is)

Redirects, clean URLs, and security headers are in `vercel.json`.

## Local development

```bash
python3 -m http.server 8765 --directory web
# visit http://localhost:8765/  (will redirect to /australia)
# or    http://localhost:8765/australia
```

The dataset is currently inlined in each jurisdiction's `index.html`. When we switch to `fetch()`, the data directory will need to be synced into `web/data/` or served via a separate mechanism.
