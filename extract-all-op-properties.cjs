#!/usr/bin/env node
/**
 * Extract all Oak Park properties with lat/lon, historic district, class, and description.
 *
 * Coordinate resolution strategy:
 *   1. Direct match from address_points table
 *   2. Parent PIN fallback (base 10 digits + 0000) for condos/units
 *   3. Address match: strip unit suffix, look up base address in address_points
 *
 * Outputs:
 *   - properties.json: array of property objects (only those with coordinates)
 *   - districts.geojson: historic district boundaries
 *
 * Usage:
 *   node extract-all-op-properties.js
 *   node extract-all-op-properties.js --db <path>
 *   node extract-all-op-properties.js --output-dir app/public
 *   node extract-all-op-properties.js --year 2024
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point } = require('@turf/helpers');
const turfUnion = require('@turf/union').default;

const ARCGIS_PARCELS_URL =
  'https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0/query';

const ARCGIS_HISTORIC_DISTRICTS_URL =
  'https://utility.arcgis.com/usrsvcs/servers/4cff1aaefa364b57b8c70d5c606f2088/rest/services/VOP/AGOL_VOP_Project/MapServer/13/query';

const ARCGIS_ZONING_URL =
  'https://utility.arcgis.com/usrsvcs/servers/4cff1aaefa364b57b8c70d5c606f2088/rest/services/VOP/AGOL_VOP_Project/MapServer/8/query';

const ARCGIS_CENSUS_TRACTS_URL =
  'https://utility.arcgis.com/usrsvcs/servers/4cff1aaefa364b57b8c70d5c606f2088/rest/services/VOP/AGOL_VOP_Project/MapServer/159/query';

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    db: path.join(__dirname, 'data', 'properties.db'),
    outputDir: 'app/public',
    year: 2024,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db': opts.db = args[++i]; break;
      case '--output-dir': case '-o': opts.outputDir = args[++i]; break;
      case '--year': opts.year = parseInt(args[++i], 10); break;
      case '--help': case '-h':
        console.log(`Usage:
  node extract-all-op-properties.js
  node extract-all-op-properties.js --db <path>          Tax appeal app DB
  node extract-all-op-properties.js --output-dir <path>  Output directory (default: app/public)
  node extract-all-op-properties.js --year 2024          Assessment year`);
        process.exit(0);
    }
  }
  return opts;
}

// ─── Coordinate resolution ──────────────────────────────────────────

function stripUnit(addr) {
  const streetTypes = /\b(AVE|ST|BLVD|CT|DR|PL|RD|TER|WAY|LN|CIR)\b/i;
  const match = addr.match(streetTypes);
  if (match) return addr.substring(0, match.index + match[0].length).trim();
  return addr;
}

function buildCoordResolvers(db) {
  // 1. Direct: address_points by PIN
  const directLookup = db.prepare('SELECT lat, lon FROM address_points WHERE pin = ?');

  // 2. Parent PIN: base 10 digits + 0000
  const parentLookup = db.prepare('SELECT lat, lon FROM address_points WHERE pin = ?');

  // 3. Address match: stripped address in address_points
  const addrRows = db.prepare(
    "SELECT UPPER(address) as addr, lat, lon FROM address_points WHERE city IN ('OAK PARK', 'Oak Park')"
  ).all();
  const addrMap = {};
  for (const r of addrRows) {
    if (!addrMap[r.addr]) addrMap[r.addr] = { lat: r.lat, lon: r.lon };
  }

  return function resolve(pin, address) {
    // Strategy 1: direct
    const direct = directLookup.get(pin);
    if (direct && direct.lat) return { lat: direct.lat, lon: direct.lon, method: 'direct' };

    // Strategy 2: parent PIN
    const parentPin = pin.substring(0, 10) + '0000';
    if (parentPin !== pin) {
      const parent = parentLookup.get(parentPin);
      if (parent && parent.lat) return { lat: parent.lat, lon: parent.lon, method: 'parent_pin' };
    }

    // Strategy 3: address match
    if (address) {
      const base = stripUnit(address).toUpperCase();
      if (addrMap[base]) return { lat: addrMap[base].lat, lon: addrMap[base].lon, method: 'address' };
    }

    return { lat: null, lon: null, method: 'none' };
  };
}

// ─── Historic districts ─────────────────────────────────────────────

async function fetchHistoricDistricts() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'NAME',
    f: 'geojson',
    returnGeometry: 'true',
  });

  console.log('Fetching historic district polygons...');
  const resp = await fetch(`${ARCGIS_HISTORIC_DISTRICTS_URL}?${params}`);
  if (!resp.ok) throw new Error(`ArcGIS fetch failed: ${resp.status}`);

  const geojson = await resp.json();
  console.log(`  Found ${geojson.features.length} districts: ${geojson.features.map(f => f.properties.NAME.trim()).join(', ')}`);
  return geojson;
}

async function fetchZoning() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'ZONED,ZONINGDESCRIPTION,ZONINGCATEGORY',
    f: 'geojson',
    returnGeometry: 'true',
    resultRecordCount: '2000',
  });

  console.log('Fetching zoning district polygons...');
  const resp = await fetch(`${ARCGIS_ZONING_URL}?${params}`);
  if (!resp.ok) throw new Error(`ArcGIS zoning fetch failed: ${resp.status}`);

  const geojson = await resp.json();
  const zones = [...new Set(geojson.features.map(f => f.properties.ZONED))].sort();
  console.log(`  Found ${geojson.features.length} zoning polygons, ${zones.length} zones: ${zones.join(', ')}`);
  return geojson;
}

async function fetchVillageBoundary() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'NAME',
    f: 'geojson',
    returnGeometry: 'true',
  });

  console.log('Fetching village boundary (census tracts)...');
  const resp = await fetch(`${ARCGIS_CENSUS_TRACTS_URL}?${params}`);
  if (!resp.ok) throw new Error(`ArcGIS census tracts fetch failed: ${resp.status}`);

  const geojson = await resp.json();
  console.log(`  Found ${geojson.features.length} census tracts, dissolving...`);

  // Union all census tracts into a single boundary polygon
  const merged = turfUnion(geojson);

  return {
    type: 'FeatureCollection',
    features: [{ ...merged, properties: { NAME: 'Oak Park' } }],
  };
}

function classifyDistrict(lon, lat, features) {
  if (!lon || !lat) return '';
  const pt = point([lon, lat]);
  for (const f of features) {
    if (booleanPointInPolygon(pt, f)) return f.properties.NAME.trim();
  }
  return '';
}

function classifyZone(lon, lat, features) {
  if (!lon || !lat) return '';
  const pt = point([lon, lat]);
  for (const f of features) {
    if (booleanPointInPolygon(pt, f)) return f.properties.ZONED ?? '';
  }
  return '';
}

// ─── Parcel geometries ──────────────────────────────────────────────

const PARCEL_BATCH_SIZE = 500;

async function fetchParcelGeometries(pins) {
  console.log(`\nFetching parcel geometries for ${pins.length} PINs...`);
  const features = [];
  const missing = [];

  for (let i = 0; i < pins.length; i += PARCEL_BATCH_SIZE) {
    const batch = pins.slice(i, i + PARCEL_BATCH_SIZE);
    const where = `name IN (${batch.map(p => `'${p}'`).join(',')})`;
    const body = new URLSearchParams({
      where,
      outFields: 'name',
      outSR: '4326',
      f: 'geojson',
    });

    const resp = await fetch(ARCGIS_PARCELS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!resp.ok) throw new Error(`Parcel fetch failed: ${resp.status}`);
    const geojson = await resp.json();
    features.push(...geojson.features);

    const found = new Set(geojson.features.map(f => f.properties.name));
    for (const pin of batch) {
      if (!found.has(pin)) missing.push(pin);
    }

    const pct = Math.min(100, Math.round(((i + batch.length) / pins.length) * 100));
    process.stdout.write(`\r  ${features.length} parcels fetched (${pct}%)`);
  }
  console.log(`\n  Got ${features.length} parcel geometries, ${missing.length} missing`);

  return { type: 'FeatureCollection', features };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('Extract All Oak Park Properties');
  console.log('===============================\n');

  if (!fs.existsSync(opts.db)) {
    console.error(`Database not found: ${opts.db}`);
    process.exit(1);
  }

  const db = new Database(opts.db, { readonly: true });

  // Get all OP properties
  const rows = db.prepare(`
    SELECT av.pin, av.class, pa.prop_address_full
    FROM assessed_values av
    LEFT JOIN parcel_addresses pa ON av.pin = pa.pin
    WHERE av.township_name = 'Oak Park' AND av.year = ?
    ORDER BY pa.prop_address_full
  `).all(opts.year);

  console.log(`Found ${rows.length} Oak Park properties (year ${opts.year})`);

  // Get class descriptions
  const classDescs = {};
  try {
    db.prepare('SELECT class, description FROM property_classes').all()
      .forEach(r => { classDescs[r.class] = r.description; });
  } catch (e) {}
  console.log(`Loaded ${Object.keys(classDescs).length} class descriptions`);

  // Build coordinate resolver
  console.log('Building coordinate resolvers...');
  const resolveCoords = buildCoordResolvers(db);

  // Fetch districts, zoning, and village boundary
  const districtsGeojson = await fetchHistoricDistricts();
  const zoningGeojson = await fetchZoning();
  const boundaryGeojson = await fetchVillageBoundary();

  // Process all properties
  console.log('\nProcessing...');
  const methodCounts = { direct: 0, parent_pin: 0, address: 0, none: 0 };
  const districtCounts = {};
  const properties = [];

  for (const row of rows) {
    const coords = resolveCoords(row.pin, row.prop_address_full);
    methodCounts[coords.method]++;

    const district = classifyDistrict(coords.lon, coords.lat, districtsGeojson.features);
    if (district) districtCounts[district] = (districtCounts[district] || 0) + 1;

    const zone = classifyZone(coords.lon, coords.lat, zoningGeojson.features);

    // Only include properties with coordinates
    if (coords.lat && coords.lon) {
      properties.push({
        pin: row.pin,
        address: row.prop_address_full || '',
        lat: coords.lat,
        lon: coords.lon,
        class: row.class,
        description: classDescs[row.class] || '',
        district: district || null,
        zone: zone || null,
        url: `https://www.cookcountyassessor.com/pin/${row.pin}`,
      });
    }
  }

  db.close();

  // Fetch parcel geometries from ArcGIS
  const allPins = properties.map(p => p.pin);
  const parcelsGeojson = await fetchParcelGeometries(allPins);

  // Try parent PINs (base 10 digits + 0000) for missing condos/units
  const foundPins = new Set(parcelsGeojson.features.map(f => f.properties.name));
  const missingPins = allPins.filter(p => !foundPins.has(p));
  const parentPinMap = {}; // parentPin -> [childPins]
  for (const pin of missingPins) {
    const parent = pin.substring(0, 10) + '0000';
    if (parent !== pin && !foundPins.has(parent)) {
      if (!parentPinMap[parent]) parentPinMap[parent] = [];
      parentPinMap[parent].push(pin);
    }
  }
  const uniqueParents = Object.keys(parentPinMap);
  if (uniqueParents.length > 0) {
    console.log(`\nFetching ${uniqueParents.length} parent parcel geometries for ${missingPins.length} condo/unit PINs...`);
    const parentParcels = await fetchParcelGeometries(uniqueParents);
    // Add parent geometries as entries for each child PIN
    for (const f of parentParcels.features) {
      const parentPin = f.properties.name;
      const children = parentPinMap[parentPin] || [];
      for (const childPin of children) {
        parcelsGeojson.features.push({
          ...f,
          properties: { ...f.properties, name: childPin },
        });
      }
    }
    console.log(`  Total parcels after parent fallback: ${parcelsGeojson.features.length}`);
  }

  // Attach property data to parcel features for map rendering
  const propsByPin = {};
  for (const p of properties) propsByPin[p.pin] = p;
  for (const f of parcelsGeojson.features) {
    const p = propsByPin[f.properties.name];
    if (p) {
      f.properties = { ...f.properties, pin: p.pin, class: p.class, description: p.description, district: p.district, address: p.address, url: p.url };
    }
  }

  // Write JSON files
  fs.mkdirSync(opts.outputDir, { recursive: true });

  const propsPath = path.join(opts.outputDir, 'properties.json');
  fs.writeFileSync(propsPath, JSON.stringify(properties));

  const districtsPath = path.join(opts.outputDir, 'districts.geojson');
  fs.writeFileSync(districtsPath, JSON.stringify(districtsGeojson));

  const boundaryPath = path.join(opts.outputDir, 'boundary.geojson');
  fs.writeFileSync(boundaryPath, JSON.stringify(boundaryGeojson));

  const parcelsPath = path.join(opts.outputDir, 'parcels.geojson');
  fs.writeFileSync(parcelsPath, JSON.stringify(parcelsGeojson));

  const zoningPath = path.join(opts.outputDir, 'zoning.geojson');
  fs.writeFileSync(zoningPath, JSON.stringify(zoningGeojson));

  // Summary
  console.log(`\nCoordinate resolution:`);
  console.log(`  Direct (address_points):  ${methodCounts.direct}`);
  console.log(`  Parent PIN fallback:      ${methodCounts.parent_pin}`);
  console.log(`  Address match:            ${methodCounts.address}`);
  console.log(`  No coordinates:           ${methodCounts.none}`);
  console.log(`  Total:                    ${rows.length}`);

  console.log(`\nHistoric districts:`);
  for (const [name, count] of Object.entries(districtCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
  const noDistrict = rows.length - Object.values(districtCounts).reduce((a, b) => a + b, 0);
  console.log(`  (none): ${noDistrict}`);

  console.log(`\nWrote ${properties.length} properties to ${path.resolve(propsPath)}`);
  console.log(`Wrote district boundaries to ${path.resolve(districtsPath)}`);
  console.log(`Wrote village boundary to ${path.resolve(boundaryPath)}`);
  console.log(`Wrote ${parcelsGeojson.features.length} parcel geometries to ${path.resolve(parcelsPath)}`);
  console.log(`Wrote ${zoningGeojson.features.length} zoning polygons to ${path.resolve(zoningPath)}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
