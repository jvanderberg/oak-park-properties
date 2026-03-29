# Oak Park Properties

**[Live Map](https://jvanderberg.github.io/oak-park-properties/)**

Interactive map of all ~17,400 properties in Oak Park, IL. Shows parcel boundaries or density dots colored by property class, with zoning overlays, historic district boundaries, and full filter state persisted in the URL. Built with React, Leaflet, and shadcn/ui.

## Quick Start

```bash
npm install
npm run pipeline   # fetch data from Socrata + ArcGIS, write app/public/ (~2-3 min)
npm run dev        # start dev server
```

## Data Pipeline

The pipeline has two steps. `npm run pipeline` runs both.

**Ingest** (`ingest-op.cjs`) fetches Oak Park property data from the Cook County Assessor's Socrata API into a local SQLite database: assessed values, parcel addresses, address coordinates, and property characteristics.

**Extract** (`extract-all-op-properties.cjs`) reads that database and produces the static files in `app/public/`:

- `properties.json` — all properties with coordinates, class, address, and pre-computed zone/district membership
- `parcels.geojson` — parcel polygon geometries from the Cook County ArcGIS parcel layer, fetched in batches of 500
- `districts.geojson` — historic district boundaries from the Village of Oak Park ArcGIS portal
- `zoning.geojson` — zoning district polygons from the Village of Oak Park ArcGIS portal
- `boundary.geojson` — village boundary dissolved from census tract polygons

Coordinates are resolved in three passes: direct PIN lookup, parent PIN for condo units, then address matching. About 7% of properties (vacant land, garages, exempt parcels) remain unresolved and are excluded.

Zone and historic district membership are computed during extract using Turf.js point-in-polygon and stored in `properties.json`, so the browser does no geometry work at runtime.

## App

Parcel boundaries and circle markers are canvas-rendered for performance across 17k+ features. All filter state round-trips through the URL — map position, zoom, panel open/closed states, zone and class selections (bitmap-encoded), and display mode — so any view can be bookmarked or shared.

## Scripts

```
npm run pipeline      Full data pipeline: ingest + extract
npm run ingest        Ingest only (Socrata → SQLite)
npm run extract       Extract only (SQLite → app/public/)
npm run dev           Vite dev server
npm run build         Production build
npm run check         TypeScript + Biome lint/format check
npm run check:fix     Auto-fix lint/format issues
```

```bash
npm run pipeline -- --year 2024                # assessment year (default: 2024)
node extract-all-op-properties.cjs -o <path>   # custom output directory
```
