# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Birding Hotspots Finder — a static, client-side web app for discovering birding locations via the eBird API. No build step, no bundler, no framework. Deployed to Vercel. Vanilla JavaScript with ES modules loaded directly by the browser.

## Development

```bash
# Serve locally (needed for ES modules — file:// won't work)
npx serve            # then visit http://localhost:3000
python -m http.server 8000  # alternative

# Run tests (custom runner, no framework)
node tests/run-tests.js
```

Tests export functions prefixed with `test` and use a minimal `assert()` helper from `tests/run-tests.js`. Test files live under `tests/` mirroring the source structure.

## Architecture

**Single monolithic app class** — `js/app.js` (~6200 lines) contains `BirdingHotspotsApp` which owns all UI state, DOM event binding, and orchestration. All other modules are imported into it.

### Module layout

- `js/api/` — External API clients (each file wraps one API):
  - `ebird.js` — `EBirdAPI` class with auth, retry, abort support (eBird v2)
  - `geocoding.js` — LocationIQ forward geocoding + browser geolocation
  - `reverse-geo.js` — LocationIQ reverse geocoding with batch support
  - `routing.js` — OSRM driving routes and optimized trips
  - `weather.js` — Open-Meteo weather data and birding condition scoring
- `js/services/` — Business logic (stateless functions + small classes):
  - `pdf-generator.js` — jsPDF-based report generation (accessed via `window.jspdf` from CDN)
  - `map-service.js` — Canvas-based static map rendering with OSM tiles for PDFs
  - `itinerary-builder.js` — Multi-stop route optimization
  - `life-list.js` — `LifeListService` class for eBird CSV life list import/lifer detection
  - `species-search.js` — `SpeciesSearch` class with prefix/contains matching against eBird taxonomy
  - `seasonal-insights.js` — Migration alerts and optimal birding times
  - `gpx-generator.js` — GPX waypoint export
  - `qr-generator.js` — QR codes for hotspot links (uses QRCode.js from CDN)
  - `storage.js` — localStorage wrapper with XOR obfuscation for API keys
- `js/utils/` — Pure helpers: `constants.js` (config, error types), `validators.js`, `formatters.js`, `icons.js`, `dom-helpers.js`
- `js/data/` — Static data (migration patterns, seasonal info)

### External dependencies (all loaded via CDN in index.html)

- **jsPDF** — PDF generation (`window.jspdf`)
- **QRCode.js** — QR code generation
- **Leaflet** — Interactive map preview with OpenStreetMap tiles

### APIs requiring keys

- **eBird API v2** — User provides their own key at runtime (stored in localStorage)
- **LocationIQ** — Key is embedded/obfuscated in `constants.js` via XOR+base64

### APIs (no key needed)

- **OSRM** — Driving routes/distances
- **Open-Meteo** — Weather data

## Key Patterns

- **XSS prevention**: All user strings pass through `sanitizeHTML()` in `app.js` before DOM insertion
- **Content Security Policy**: Strict CSP defined in `<meta>` tag in `index.html` — must be updated when adding new CDN sources
- **Dark mode**: CSS custom properties in `:root` and `[data-theme="dark"]` in `styles.css`, toggled via `data-theme` attribute on `<html>`
- **Two search modes**: Location-based (radius search) and Route-based (hotspots along a driving route) — controlled by toggle buttons in UI
- **Typography**: Plus Jakarta Sans via Google Fonts

## Workflow Rules

### Post-code audits

After writing new code but **before committing**, always run three audits and present findings to the user:

1. **UX/UI Audit** — Review the changes for usability, visual consistency, responsive behavior, and adherence to existing design patterns (color tokens, spacing scale, component styles).
2. **Security Audit** — Check for XSS vectors, unsafe DOM insertion, CSP compliance, exposed secrets, injection risks, and OWASP top 10 concerns relevant to the changes.
3. **Accessibility Audit** — Verify ARIA attributes, keyboard navigability, color contrast, screen reader compatibility, and semantic HTML in the changed code.

**Do not apply any audit recommendations unless the user explicitly approves them.** Present findings as a summary and wait for direction.

### Commit, push & sync

After code is finalized (audits complete, any approved fixes applied), always commit, push, and sync in one flow — do not stop after committing.
