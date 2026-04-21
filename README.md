# SolarPro Map

A standalone desktop application that replaces the AutoCAD LISP workflow in
`Rev 5.8 SolarPro -PVGis & BOM.lsp`. Users draw their site boundary directly on
**satellite imagery** (Esri World Imagery via Leaflet), enter the same module
and table parameters used in the LISP version, and get a **to-scale PV layout**,
**Bill of Materials (BOM)** and **PVGIS energy estimate** — all without any
CAD software.

The app is built with **Electron + Leaflet** and ships as a Windows `.exe`
(both an NSIS installer and a portable single-file build) via `electron-builder`.

---

## Features

- Free satellite basemap (Esri World Imagery) with optional street-map layer
- Address / `lat,lon` search (OpenStreetMap Nominatim)
- Draw a **boundary polygon** (or rectangle) on the rooftop / site
- Draw additional **exclusion zones** (e.g. AC units, skylights, shadows)
- Same input parameters as the LISP version:
  - Capacity mode: **Target MWp** or **Maximum** (fill the boundary)
  - Module width / height / wattage, **Portrait or Landscape**
  - Latitude / Longitude (auto-filled from boundary centroid)
  - Tilt (defaults to latitude), Azimuth (0° = South)
  - Boundary set-off
  - Modules per row, modules per stack, inter-module gaps
  - Inter-table gap
  - Horizontal & vertical road widths and frequencies
- Inter-row pitch derived from solar altitude at **9:30 on winter solstice**
  (matches the LISP `SolarAltitudeAtTime` design rule)
- Layout drawn **to scale** on the map using a local ENU projection
- BOM: total modules, tables, end clamps, mid clamps, and per-table-size counts
- PVGIS 5.2 lookup (specific yield, daily/monthly/annual energy)
- One-click HTML report export

---

## Project layout

```
Solar-panel-simulator/
├── package.json                # Electron + electron-builder config
├── README.md
├── Rev 5.8 SolarPro -PVGis & BOM.lsp   # original LISP (kept for reference)
└── src/
    ├── main/
    │   ├── main.js             # Electron main process + PVGIS HTTPS proxy
    │   └── preload.js          # contextBridge -> window.solarApi
    └── renderer/
        ├── index.html
        ├── styles.css
        └── js/
            ├── geo.js          # lat/lon <-> local meters, polygon utils
            ├── layout.js       # placement algorithm (LISP port)
            ├── pvgis.js        # PVGIS bridge to main process
            └── app.js          # Leaflet map + UI wiring
```

---

## Prerequisites

1. **Node.js 18 LTS or newer** — <https://nodejs.org/en/download>
   (Electron 31 requires Node 18+. Confirm with `node -v`.)
2. **Git** (optional, only if you cloned the repo).
3. **Internet connection** — required for satellite tiles, address search,
   and PVGIS API. The packaged app still needs internet at run time for
   these services. (No API key is needed for any of them.)
4. **Windows 10 / 11 x64** for building the `.exe`.

> The build itself works on macOS / Linux too, but to produce a Windows
> installer from a non-Windows host you need Wine; the easiest path is to
> build on a Windows machine.

---

## Setup

From a PowerShell or terminal in the project folder:

```powershell
cd "C:\Solar Panel Application\Solar-panel-simulator"
npm install
```

This installs Electron and electron-builder into `node_modules/`. No other
runtime dependencies are needed (Leaflet and Leaflet.draw are loaded from
the unpkg CDN inside the renderer).

---

## Run in development

```powershell
npm start
```

This launches the Electron app pointing at `src/renderer/index.html`.
You can use **Ctrl+R** to reload after editing renderer files.

---

## Build the Windows `.exe`

Build both the **NSIS installer** and a **portable single-file** executable:

```powershell
npm run build
```

Or build only one of them:

```powershell
npm run build:installer    # NSIS installer
npm run build:portable     # portable single-file exe
```

Output files appear in `dist/`:

```
dist/
├── SolarPro Map Setup 1.0.0.exe          # installer (NSIS)
├── SolarPro Map-1.0.0-x64.exe            # portable
└── win-unpacked/                         # raw, unpacked app folder
```

Double-click the installer to install (creates Start Menu / Desktop shortcuts),
or run the portable `.exe` directly without installing.

> **First build** downloads the Electron Windows binaries (~90 MB). This
> can take a few minutes on slow connections; subsequent builds are fast.

---

## How to use the app

1. **Search** for the site (address or `lat,lon`) in the sidebar and click
   **Go**, or pan/zoom the map manually. The Esri satellite layer supports
   zoom levels up to ~22 for high-resolution rooftops.
2. Use the **polygon** or **rectangle** tool in the top-left of the map to
   draw the **boundary**. Latitude/Longitude auto-fill from the centroid.
3. (Optional) Click **Exclude: OFF → ON** in the top-left, then draw any
   **exclusion zones** that the layout must avoid. Toggle back to OFF to
   draw more boundaries.
4. Fill in the sidebar parameters (defaults match a typical bifacial 585 Wp
   2P table with two roads). Set the **Capacity Mode** to either:
   - `Target MWp` — stops once the target wattage is met, or
   - `Maximum` — fills the boundary.
5. Click **Generate Layout**. The app:
   - Projects the boundary into a local meter grid (centered on the centroid),
   - Rotates by `-azimuth` so rows align with your chosen orientation,
   - Runs the same placement / column-shrink / road logic as the LISP,
   - Calls **PVGIS 5.2** for specific yield (via the Electron main process,
     so there is no browser CORS issue),
   - Draws the placed tables back onto the map and renders the report.
6. Click **Export Report (HTML)** to save the summary for sharing/printing.

---

## How the LISP logic was ported

| LISP function | JavaScript equivalent |
|---|---|
| `SolarAltitudeAtTime` | `SolarLayout.solarAltitude` (`layout.js`) |
| `tan_lsp`, `asin` | inline `Math.tan` / custom `asin` |
| Main `c:GenerateLayout` placement loop | `SolarLayout.generateLayout` |
| `TablePlacementOk` / `MinDistToPoly` / `InsidePoly` | `SolarGeo.minDistToPoly` / `SolarGeo.pointInPoly` |
| `CollectInnerPolys` / `IsInsideAnyPoly` | Exclusion `excludeGroup` polygons + `pointInPoly` |
| `GetPVGISData` (XMLHTTP call) | `pvgis:get` IPC handler in `src/main/main.js` |
| `CalculateProduction` | `SolarLayout.calcProduction` |
| `DrawReportTables` (MText/Lines in CAD) | HTML report panel + HTML export |
| `BuildTableBlockName` / `DefineTableBlock` (CAD blocks) | Per-table polygon drawn on Leaflet |

Geographic ↔ planar conversion uses a local equirectangular ENU projection
centered on the boundary centroid. Within a few km this is accurate to
sub-meter, which matches the precision of the satellite imagery being
used to draw the boundary.

---

## Troubleshooting

- **Blank map / no satellite tiles** — check internet access. Esri imagery
  is loaded from `server.arcgisonline.com`.
- **PVGIS Status: Fallback** — the PVGIS endpoint was unreachable or the
  site is outside its coverage. The app falls back to ~4.5 kWh/kWp/day so
  the layout still generates; re-run when the API is reachable.
- **`npm install` fails behind a corporate proxy** — set `npm config set
  proxy http://your-proxy:port` and `https-proxy` accordingly, or use a
  network without a TLS-intercepting proxy.
- **`electron-builder` fails to download Electron** — set the env var
  `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` (or your
  internal mirror) before re-running `npm run build`.
- **No tables placed** — the boundary may be smaller than one table after
  set-off, or the exclusions cover everything. Increase the boundary, or
  reduce `Modules per Row`, `Set-off`, or road frequencies.
- **Tiles look pixelated at high zoom** — Esri imagery resolution varies by
  region; pick a slightly lower zoom or use the `Streets (OSM)` layer to
  align with known features.

---

## License

The original LISP file retains its existing license. The new Electron
application code in `src/` is released under the MIT License (see
`package.json`). Esri World Imagery and OpenStreetMap tiles are subject
to their respective providers' terms of use.