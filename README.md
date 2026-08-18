# FlowSure — Public Refinery Pressure-Drop Calculator

Live link: https://medinikb.github.io/FlowSure-Refinery-Hydraulics/

FlowSure is a local-first browser calculator for transparent hydraulic screening of ordered refinery pipe segments. It supports single-phase liquid, steady isothermal gas/vapour, and steady gas–liquid Beggs–Brill calculations.

> **Engineering status:** screening and verification only. It is not final design certification and does not replace a qualified engineer, approved company procedure, vendor data, or validated commercial simulation.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- A modern browser
- A GitHub account only if you want to publish the site

## Run locally

### Simplest Windows method

Double-click `start-app.cmd`. The launcher uses the Node.js runtime bundled with Codex and opens the calculator in your browser automatically. Keep the black launcher window open while using the app. Press `Ctrl+C` in that window when finished.

### Developer method

```powershell
pnpm install
pnpm dev
```

Open the local address shown in the terminal. To verify a release:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check:privacy
```

## What the files do

- `src/engine/` contains auditable equations, unit conversions, and import validation.
- `src/data/` contains generic editable fluids and review thresholds—never private project data.
- `src/App.tsx` provides the guided calculation workflow.
- `src/exporters.ts` creates PDF, CSV, and JSON downloads inside the browser.
- `src/storage.ts` saves one optional project in browser storage.
- `docs/` records methodology, validation expectations, security, and limitations.
- `.github/workflows/` tests and publishes the static site to GitHub Pages.

## GitHub Pages deployment

1. Create an empty public GitHub repository.
2. Copy **only this application folder** into it. Do not copy the parent reference folders.
3. Commit and push to the `main` branch.
4. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source.
5. The included workflow tests, privacy-checks, builds, and deploys the site.

## Privacy

FlowSure has no backend. Calculations, local saving, and file exports happen in the browser. Private workbooks, reports, drawings, messages, or customer values are intentionally excluded. Read [SECURITY.md](SECURITY.md) before publishing.

## Licence

[MIT](LICENSE). Engineering methods remain subject to their original literature and applicable standards.
