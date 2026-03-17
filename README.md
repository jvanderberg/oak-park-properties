# Oak Park Properties

**[Live Map](https://jvanderberg.github.io/oak-park-properties/)**

Interactive map of all ~18,700 properties in Oak Park, IL with parcel shapes,
property class filtering, and historic district boundaries. Built with React,
Leaflet, and shadcn/ui.

## Quick Start

```bash
npm install
npm run pipeline          # ingest from Socrata + extract JSON + fetch parcels (~2-3 min)
npm run dev               # start dev server
```

That's it. `npm run pipeline` runs the full data pipeline end-to-end:

1. **Ingest** -- fetches property data from Cook County Socrata into a local SQLite database
2. **Extract** -- reads the database, fetches parcel geometries and district boundaries from ArcGIS, and writes JSON files to `app/public/`

## Data Pipeline

### 1. Ingest (`ingest-op.cjs`)

Fetches Oak Park property data from the Cook County Assessor's Socrata Open
Data Portal into a local SQLite database (`data/properties.db`).

| Socrata Dataset | ID | What's Fetched |
|---|---|---|
| [Assessed Values](https://datacatalog.cookcountyil.gov/d/uzyt-m557) | `uzyt-m557` | All PINs where `township_name = 'Oak Park'` for the target year |
| [Parcel Addresses](https://datacatalog.cookcountyil.gov/d/3723-97qp) | `3723-97qp` | Street addresses for Oak Park PINs (filtered by city + PIN prefix) |
| [Address Points](https://datacatalog.cookcountyil.gov/d/78yw-iddh) | `78yw-iddh` | Lat/lon coordinates where `placename = 'Oak Park'` |
| [Property Characteristics](https://datacatalog.cookcountyil.gov/d/x54s-btds) | `x54s-btds` | Building sq ft, year built, bedrooms, construction type, etc. |

Parcel polygon boundaries are fetched from the
[Cook County GIS Parcel Layer](https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0)
during the extract step.

Property class descriptions (Cook County Assessor classification codes) are
seeded from a built-in lookup table.

#### SQLite Schema

```
assessed_values (pin, year)
+-- class, township_code, township_name, nbhd
+-- mailed_bldg, mailed_land, mailed_tot
+-- certified_bldg, certified_land, certified_tot
+-- board_bldg, board_land, board_tot

parcel_addresses (pin, year)
+-- prop_address_full
+-- prop_address_city_name
+-- prop_address_zipcode_1

address_points (pin)
+-- address, city, state, zip, township
+-- lat, lon

property_characteristics (pin, year)
+-- char_yrblt, char_bldg_sf, char_land_sf
+-- char_beds, char_rooms, char_fbath, char_hbath
+-- char_type_resd, char_cnst_qlty, char_ext_wall
+-- char_bsmt, char_heat, char_air, char_use

property_classes (class)
+-- major_class, major_category
+-- description
+-- assessment_level
```

### 2. Extract (`extract-all-op-properties.cjs`)

Reads the local SQLite database and produces four JSON files in `app/public/`:

- **`properties.json`** -- array of property objects (only those with resolved coordinates)
- **`parcels.geojson`** -- parcel polygon geometries from the Cook County ArcGIS server
- **`districts.geojson`** -- historic district polygon boundaries from the Village of Oak Park ArcGIS portal
- **`boundary.geojson`** -- village boundary (dissolved from census tract polygons)

#### Coordinate Resolution

The `address_points` table only has direct coordinates for ~11,900 of ~18,700
Oak Park PINs. Three strategies are applied in order:

1. **Direct match** (~11,900) -- PIN lookup in `address_points`
2. **Parent PIN** (~4,800) -- condo/unit PINs use the first 10 digits for the
   building; replacing the last 4 with `0000` gives the building parcel
3. **Address match** (~700) -- strip the unit suffix from the address and match
   the base address against `address_points`

~1,300 properties (7%) remain unresolved -- mostly vacant land, garages, and
exempt parcels.

#### Parcel Geometries

Parcel polygon shapes are fetched from the [Cook County ArcGIS parcel layer](https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0)
in batches of 500 PINs via POST requests. For condo/unit PINs missing from
the parcel layer, the parent PIN (base 10 digits + 0000) is used as a fallback.
This resolves ~17,500 of ~17,400 properties to parcel shapes.

#### Historic Districts

Boundaries are fetched from the Village of Oak Park's ArcGIS portal
([layer 13](https://oak-park-open-data-portal-v2-oakparkil.hub.arcgis.com/datasets/d3ff666dfb764e8183879667acce810e_13/explore)):

- Frank Lloyd Wright (Local; National)
- Ridgeland - Oak Park (Local)
- Gunderson (Local)

Each property with coordinates is classified using Turf.js
`booleanPointInPolygon`. The village boundary is derived from census tract
polygons (layer 159), dissolved into a single outline using `@turf/union`.

## App

React + Vite + Leaflet + shadcn/ui. Features:

- Parcel polygon shapes colored by property class (canvas-rendered for performance)
- Circle marker fallback for properties without parcel geometry
- Filter by property class (checkbox per class, quick-filter dropdown)
- Toggle individual historic district boundaries
- Search by address or PIN with auto-zoom bullseye
- District totals overlay
- CSV download of filtered properties
- Village boundary outline

## Scripts

| Command | Description |
|---|---|
| `npm run pipeline` | Full data pipeline: ingest + extract (~2-3 min) |
| `npm run ingest` | Ingest only (Socrata to SQLite) |
| `npm run extract` | Extract only (SQLite to JSON) |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run check` | TypeScript + Biome lint/format check |
| `npm run check:fix` | Auto-fix lint/format issues |

## Options

```bash
npm run pipeline -- --year 2024                # assessment year (default: 2024)
node ingest-op.cjs --db <path>                 # custom database path
node extract-all-op-properties.cjs -o <path>   # custom output directory
```
