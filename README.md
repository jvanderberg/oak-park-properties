# Oak Park Properties

**[Live Map](https://jvanderberg.github.io/oak-park-properties/)**

Interactive map of all ~18,700 properties in Oak Park, IL with property class
filtering and historic district boundaries. Built with React, Leaflet, and
shadcn/ui.

## Quick Start

```bash
npm install                  # root dependencies (Socrata ingest + extract)
cd app && npm install && cd ..  # app dependencies
node build.js                # ingest from Socrata + extract JSON (~30s)
cd app && npm run dev        # start dev server
```

## Pipeline

The build has two stages, orchestrated by `build.js`:

### 1. Ingest (`ingest-op.js`)

Fetches Oak Park property data from the Cook County Assessor's Socrata Open
Data Portal into a local SQLite database (`data/properties.db`).

| Socrata Dataset | ID | What's Fetched |
|---|---|---|
| [Assessed Values](https://datacatalog.cookcountyil.gov/d/uzyt-m557) | `uzyt-m557` | All PINs where `township_name = 'Oak Park'` for the target year |
| [Parcel Addresses](https://datacatalog.cookcountyil.gov/d/3723-97qp) | `3723-97qp` | Street addresses for Oak Park PINs (filtered by city + PIN prefix) |
| [Address Points](https://datacatalog.cookcountyil.gov/d/78yw-iddh) | `78yw-iddh` | Lat/lon coordinates where `placename = 'Oak Park'` |

Property class descriptions (Cook County Assessor classification codes) are
seeded from a built-in lookup table.

#### SQLite Schema

```
assessed_values (pin, year)
├── class, township_code, township_name, nbhd
├── mailed_bldg, mailed_land, mailed_tot
├── certified_bldg, certified_land, certified_tot
└── board_bldg, board_land, board_tot

parcel_addresses (pin, year)
├── prop_address_full
├── prop_address_city_name
└── prop_address_zipcode_1

address_points (pin)
├── address, city, state, zip, township
└── lat, lon

property_classes (class)
├── major_class, major_category
├── description
└── assessment_level
```

### 2. Extract (`extract-all-op-properties.js`)

Reads the local SQLite database and produces three JSON files in `app/public/`:

- **`properties.json`** — array of property objects (only those with resolved
  coordinates)
- **`districts.geojson`** — historic district polygon boundaries from the
  Village of Oak Park ArcGIS portal
- **`boundary.geojson`** — village boundary (dissolved from census tract
  polygons)

#### Coordinate Resolution

The `address_points` table only has direct coordinates for ~11,900 of ~18,700
Oak Park PINs. Three strategies are applied in order:

1. **Direct match** (~11,900) — PIN lookup in `address_points`
2. **Parent PIN** (~4,800) — condo/unit PINs use the first 10 digits for the
   building; replacing the last 4 with `0000` gives the building parcel
3. **Address match** (~700) — strip the unit suffix from the address and match
   the base address against `address_points`

~1,300 properties (7%) remain unresolved — mostly vacant land, garages, and
exempt parcels.

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

- Canvas-rendered property markers (17k+ dots, no lag)
- Filter by property class (checkbox per class, sorted numerically)
- Toggle individual historic district boundaries
- Search by address or PIN
- District totals overlay (updates with filters)
- Dark grey village boundary outline

## Options

```bash
node build.js --year 2024        # assessment year (default: 2024)
node ingest-op.js --db <path>    # custom database path
node extract-all-op-properties.js --output-dir <path>  # custom output dir
```
