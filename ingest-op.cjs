#!/usr/bin/env node
/**
 * Ingest Oak Park property data from Cook County Socrata into a local SQLite DB.
 *
 * Fetches only what's needed for the Oak Park properties map:
 *   - assessed_values (filtered to township_name='Oak Park')
 *   - parcel_addresses (joined to assessed_values PINs)
 *   - address_points (filtered to Oak Park area)
 *   - property_classes (seeded from Cook County classification codes)
 *
 * Usage:
 *   node ingest-op.js
 *   node ingest-op.js --year 2024
 *   node ingest-op.js --db data/properties.db
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SOCRATA_BASE = 'https://datacatalog.cookcountyil.gov/resource';

const DATASETS = {
  values: 'uzyt-m557',
  addresses: '3723-97qp',
  geopoints: '78yw-iddh',
};

const BATCH_SIZE = 50_000;

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    db: path.join(__dirname, 'data', 'properties.db'),
    year: 2024,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db': opts.db = args[++i]; break;
      case '--year': opts.year = parseInt(args[++i], 10); break;
      case '--help': case '-h':
        console.log(`Usage:
  node ingest-op.js
  node ingest-op.js --year 2024          Assessment year (default: 2024)
  node ingest-op.js --db <path>          Database path (default: data/properties.db)`);
        process.exit(0);
    }
  }
  return opts;
}

// ─── Socrata fetch ───────────────────────────────────────────────────

async function* fetchSocrata(datasetId, where) {
  let offset = 0;
  const endpoint = `${SOCRATA_BASE}/${datasetId}.json`;

  while (true) {
    const params = new URLSearchParams({
      $limit: String(BATCH_SIZE),
      $offset: String(offset),
      $order: ':id',
    });
    if (where) params.set('$where', where);

    const url = `${endpoint}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Socrata error: ${res.status} ${res.statusText} — ${url}`);

    const batch = await res.json();
    if (batch.length === 0) break;

    yield batch;
    offset += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }
}

// ─── Type coercion ───────────────────────────────────────────────────

function toInt(val) {
  if (val === undefined || val === '' || typeof val === 'boolean') return null;
  const f = parseFloat(val);
  return isNaN(f) ? null : Math.round(f);
}

function toReal(val) {
  if (val === undefined || val === '' || typeof val === 'boolean') return null;
  const f = parseFloat(val);
  return isNaN(f) ? null : f;
}

function toText(val) {
  if (val === undefined || val === '') return null;
  return String(val);
}

// ─── Schema ──────────────────────────────────────────────────────────

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assessed_values (
      pin            TEXT NOT NULL,
      year           INTEGER NOT NULL,
      class          TEXT,
      township_code  TEXT,
      township_name  TEXT,
      nbhd           TEXT,
      mailed_bldg    INTEGER,
      mailed_land    INTEGER,
      mailed_tot     INTEGER,
      certified_bldg INTEGER,
      certified_land INTEGER,
      certified_tot  INTEGER,
      board_bldg     INTEGER,
      board_land     INTEGER,
      board_tot      INTEGER,
      PRIMARY KEY (pin, year)
    );

    CREATE TABLE IF NOT EXISTS parcel_addresses (
      pin                      TEXT NOT NULL,
      year                     INTEGER NOT NULL,
      prop_address_full        TEXT,
      prop_address_city_name   TEXT,
      prop_address_zipcode_1   TEXT,
      PRIMARY KEY (pin, year)
    );

    CREATE TABLE IF NOT EXISTS address_points (
      pin          TEXT PRIMARY KEY,
      address      TEXT,
      city         TEXT,
      state        TEXT,
      zip          TEXT,
      township     TEXT,
      lat          REAL,
      lon          REAL
    );
    CREATE INDEX IF NOT EXISTS idx_ap_city ON address_points(city);

    CREATE TABLE IF NOT EXISTS property_classes (
      class            TEXT PRIMARY KEY,
      major_class      TEXT NOT NULL,
      major_category   TEXT NOT NULL,
      description      TEXT NOT NULL,
      assessment_level TEXT
    );
  `);
}

// ─── Transforms ──────────────────────────────────────────────────────

function transformAssessedValue(raw) {
  return {
    pin: toText(raw.pin),
    year: toInt(raw.year),
    class: toText(raw.class),
    township_code: toText(raw.township_code),
    township_name: toText(raw.township_name),
    nbhd: toText(raw.nbhd),
    mailed_bldg: toInt(raw.mailed_bldg),
    mailed_land: toInt(raw.mailed_land),
    mailed_tot: toInt(raw.mailed_tot),
    certified_bldg: toInt(raw.certified_bldg),
    certified_land: toInt(raw.certified_land),
    certified_tot: toInt(raw.certified_tot),
    board_bldg: toInt(raw.board_bldg),
    board_land: toInt(raw.board_land),
    board_tot: toInt(raw.board_tot),
  };
}

function transformParcelAddress(raw) {
  return {
    pin: toText(raw.pin),
    year: toInt(raw.year),
    prop_address_full: toText(raw.prop_address_full),
    prop_address_city_name: toText(raw.prop_address_city_name),
    prop_address_zipcode_1: toText(raw.prop_address_zipcode_1),
  };
}

function transformAddressPoint(raw) {
  return {
    pin: toText(raw.pin),
    address: toText(raw.cmpaddabrv),
    city: toText(raw.placename),
    state: toText(raw.state),
    zip: toText(raw.post_code),
    township: toText(raw.twp_name),
    lat: toReal(raw.lat),
    lon: toReal(raw.long),
  };
}

// ─── Batch inserter ──────────────────────────────────────────────────

function createBatchInserter(db, table) {
  let stmt = null;
  let columns = null;

  return {
    insert(rows) {
      if (rows.length === 0) return;
      if (!stmt) {
        columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      }
      const tx = db.transaction((batch) => {
        for (const row of batch) {
          stmt.run(...columns.map(c => row[c] ?? null));
        }
      });
      tx(rows);
    },
  };
}

// ─── Ingest functions ────────────────────────────────────────────────

async function ingestAssessedValues(db, year) {
  console.log(`\nIngesting assessed_values (Oak Park, year=${year})...`);
  const inserter = createBatchInserter(db, 'assessed_values');
  let total = 0;

  const where = `township_name='Oak Park' AND year='${year}'`;
  for await (const batch of fetchSocrata(DATASETS.values, where)) {
    const rows = batch.map(transformAssessedValue);
    inserter.insert(rows);
    total += rows.length;
    console.log(`  ${total.toLocaleString()} rows`);
  }
  return total;
}

async function ingestParcelAddresses(db, year) {
  console.log(`\nIngesting parcel_addresses (Oak Park, year=${year})...`);
  const inserter = createBatchInserter(db, 'parcel_addresses');
  let total = 0;

  // Filter server-side by city name to avoid scanning all of Cook County
  const where = `year='${year}' AND prop_address_city_name='OAK PARK'`;
  for await (const batch of fetchSocrata(DATASETS.addresses, where)) {
    const rows = batch.map(transformParcelAddress);
    inserter.insert(rows);
    total += rows.length;
    console.log(`  ${total.toLocaleString()} rows`);
  }

  // Some PINs may have addresses under variant spellings — pick up stragglers
  // by matching against assessed_values PINs we already have
  const pins = new Set(
    db.prepare('SELECT pin FROM assessed_values WHERE year = ?').all(year).map(r => r.pin)
  );
  const have = new Set(
    db.prepare('SELECT pin FROM parcel_addresses WHERE year = ?').all(year).map(r => r.pin)
  );
  const missing = [...pins].filter(p => !have.has(p));

  if (missing.length > 0) {
    console.log(`  ${missing.length} PINs without address, fetching by PIN prefix...`);
    // Group missing PINs by first 5 digits and batch-query
    const prefixes = new Set(missing.map(p => p.substring(0, 5)));
    for (const prefix of prefixes) {
      const w = `year='${year}' AND starts_with(pin, '${prefix}')`;
      for await (const batch of fetchSocrata(DATASETS.addresses, w)) {
        const rows = batch
          .map(transformParcelAddress)
          .filter(r => pins.has(r.pin) && !have.has(r.pin));
        if (rows.length > 0) {
          inserter.insert(rows);
          total += rows.length;
          for (const r of rows) have.add(r.pin);
        }
      }
    }
    console.log(`  ${total.toLocaleString()} rows total`);
  }

  return total;
}

async function ingestAddressPoints(db) {
  console.log('\nIngesting address_points (Oak Park area)...');
  const inserter = createBatchInserter(db, 'address_points');
  let total = 0;

  // Fetch by PIN prefix — Oak Park PINs start with 160xx/161xx/168xx etc.
  // Use upper(placename) to catch case variants, plus fetch by PIN prefix for completeness
  const where = "upper(placename)='OAK PARK'";
  for await (const batch of fetchSocrata(DATASETS.geopoints, where)) {
    const rows = batch.map(transformAddressPoint);
    inserter.insert(rows);
    total += rows.length;
    console.log(`  ${total.toLocaleString()} rows`);
  }
  return total;
}

// ─── Property classes ────────────────────────────────────────────────

// Cook County Assessor classification codes
const PROPERTY_CLASSES = [
  // [class, major_class, major_category, description, assessment_level]
  ['EX', '0', 'Exempt', 'Exempt Property', 'N/A'],
  ['RR', '0', 'Exempt', 'Railroad Property', 'N/A'],
  ['100', '1', 'Vacant Land', 'Vacant Land', '10%'],
  ['190', '1', 'Vacant Land', 'Minor Improvement on Vacant Land', '10%'],
  ['200', '2', 'Residential', 'Residential Land', '10%'],
  ['201', '2', 'Residential', 'Residential garage', '10%'],
  ['202', '2', 'Residential', 'One-story Residence, any age, up to 999 sq ft', '10%'],
  ['203', '2', 'Residential', 'One-story Residence, any age, 1,000 to 1,800 sq ft', '10%'],
  ['204', '2', 'Residential', 'One-story Residence, any age, 1,801 sq ft and over', '10%'],
  ['205', '2', 'Residential', 'Two-or-more story residence, over 62 years of age, up to 2,200 sq ft', '10%'],
  ['206', '2', 'Residential', 'Two-or-more story residence, over 62 years of age, 2,201 to 4,999 sq ft', '10%'],
  ['207', '2', 'Residential', 'Two-or-more story residence, up to 62 years of age, up to 2,000 sq ft', '10%'],
  ['208', '2', 'Residential', 'Two-or-more story residence, up to 62 years of age, 3,801 to 4,999 sq ft', '10%'],
  ['209', '2', 'Residential', 'Two-or-more story residence, any age, 5,000 sq ft and over', '10%'],
  ['210', '2', 'Residential', 'Old style row house (townhome), over 62 years of age', '10%'],
  ['211', '2', 'Residential', 'Apartment building with 2 to 6 units, any age', '10%'],
  ['212', '2', 'Residential', 'Mixed-use commercial/residential building with 6 units or less and below 20,000 sq ft', '10%'],
  ['213', '2', 'Residential', 'Cooperative', '10%'],
  ['218', '2', 'Residential', "Bed & Breakfast, owner occupied, with homeowner's exemption", '10%'],
  ['219', '2', 'Residential', "Bed & Breakfast, not owner occupied, no homeowner's exemption", '10%'],
  ['220', '2', 'Residential', '(Residential)', '10%'],
  ['221', '2', 'Residential', '(Residential)', '10%'],
  ['224', '2', 'Residential', 'Farm building', '10%'],
  ['225', '2', 'Residential', 'Single-room occupancy (SRO) rental building', '10%'],
  ['234', '2', 'Residential', 'Split level residence with lower level below grade, all ages, all sizes', '10%'],
  ['236', '2', 'Residential', 'Residential area on a parcel used primarily for commercial or industrial purposes', '10%'],
  ['239', '2', 'Residential', 'Non-equalized land under agricultural use, valued at farm pricing', '10%'],
  ['240', '2', 'Residential', 'First-time agricultural use of land valued at market price', '10%'],
  ['241', '2', 'Residential', 'Vacant land under common ownership with adjacent residence', '10%'],
  ['278', '2', 'Residential', 'Two-or-more story residence, up to 62 years of age, 2,001 to 3,800 sq ft', '10%'],
  ['288', '2', 'Residential', 'Home improvement exemption', '10%'],
  ['290', '2', 'Residential', 'Minor improvement', '10%'],
  ['292', '2', 'Residential', '(Residential)', '10%'],
  ['294', '2', 'Residential', '(Residential)', '10%'],
  ['295', '2', 'Residential', 'Individually owned townhome or row house up to 62 years of age', '10%'],
  ['297', '2', 'Residential', 'Special residential improvements (may apply to condo building in first year)', '10%'],
  ['299', '2', 'Residential', 'Residential condominium', '10%'],
  ['300', '3', 'Multi-Family', 'Land used in conjunction with rental apartments', '10%'],
  ['301', '3', 'Multi-Family', 'Ancillary structures for rental apartments', '10%'],
  ['313', '3', 'Multi-Family', 'Two-or-three story building, seven or more units', '10%'],
  ['314', '3', 'Multi-Family', 'Two-or-three-story, non-fireproof corridor/California type apartments, exterior entrance', '10%'],
  ['315', '3', 'Multi-Family', 'Two-or-three story, non-fireproof corridor apartments, interior entrance', '10%'],
  ['318', '3', 'Multi-Family', 'Mixed-use commercial/residential, 7+ units or 20,000-99,999 sq ft, commercial no more than 35%', '10%'],
  ['319', '3', 'Multi-Family', '(Multi-Family)', '10%'],
  ['320', '3', 'Multi-Family', '(Multi-Family)', '10%'],
  ['321', '3', 'Multi-Family', '(Multi-Family)', '10%'],
  ['390', '3', 'Multi-Family', '(Multi-Family)', '10%'],
  ['391', '3', 'Multi-Family', 'Apartment building over three stories, seven or more units', '10%'],
  ['396', '3', 'Multi-Family', 'Rented modern row houses, 7+ units in a single development or contiguous parcels', '10%'],
  ['397', '3', 'Multi-Family', 'Special rental structure', '10%'],
  ['399', '3', 'Multi-Family', 'Rental condominium', '10%'],
  ['400', '4', 'Not-For-Profit', 'Not-for-profit land', '20%'],
  ['401', '4', 'Not-For-Profit', 'Not-for-profit ancillary structures', '20%'],
  ['415', '4', 'Not-For-Profit', '(Not-for-profit)', '20%'],
  ['417', '4', 'Not-For-Profit', 'Not-for-profit one-story commercial building', '20%'],
  ['418', '4', 'Not-For-Profit', 'Not-for-profit two-or-three story mixed-use commercial/residential building', '20%'],
  ['419', '4', 'Not-For-Profit', '(Not-for-profit)', '20%'],
  ['420', '4', 'Not-For-Profit', '(Not-for-profit)', '20%'],
  ['421', '4', 'Not-For-Profit', '(Not-for-profit)', '20%'],
  ['422', '4', 'Not-For-Profit', 'Not-for-profit one-story non-fireproof public garage', '20%'],
  ['423', '4', 'Not-For-Profit', 'Not-for-profit gasoline station', '20%'],
  ['490', '4', 'Not-For-Profit', 'Not-for-profit commercial minor improvement', '20%'],
  ['491', '4', 'Not-For-Profit', 'Not-for-profit improvement over three stories', '20%'],
  ['492', '4', 'Not-For-Profit', 'Not-for-profit two-or-three story building', '20%'],
  ['497', '4', 'Not-For-Profit', 'Not-for-profit special structure', '20%'],
  ['499', '4', 'Not-For-Profit', 'Not-for-profit condominium', '20%'],
  ['500', '5A', 'Commercial', 'Commercial land', '25%'],
  ['501', '5A', 'Commercial', 'Ancillary structures for commercial improvements', '25%'],
  ['516', '5A', 'Commercial', 'Non-fireproof hotel or rooming house (apartment hotel)', '25%'],
  ['517', '5A', 'Commercial', 'One-story, commercial building or area', '25%'],
  ['522', '5A', 'Commercial', 'One-story, non-fireproof public garage', '25%'],
  ['523', '5A', 'Commercial', 'Gasoline station', '25%'],
  ['526', '5A', 'Commercial', 'Commercial greenhouse', '25%'],
  ['527', '5A', 'Commercial', 'Theatre', '25%'],
  ['528', '5A', 'Commercial', 'Bank building', '25%'],
  ['529', '5A', 'Commercial', 'Motel', '25%'],
  ['530', '5A', 'Commercial', 'Supermarket', '25%'],
  ['531', '5A', 'Commercial', 'Shopping center', '25%'],
  ['532', '5A', 'Commercial', 'Bowling alley', '25%'],
  ['533', '5A', 'Commercial', 'Quonset hut or butler type building', '25%'],
  ['535', '5A', 'Commercial', 'Golf course land/improvement', '25%'],
  ['580', '5A', 'Commercial', 'Commercial minor improvement', '25%'],
  ['590', '5A', 'Commercial', 'Commercial minor improvement', '25%'],
  ['591', '5A', 'Commercial', 'Commercial building over three stories', '25%'],
  ['592', '5A', 'Commercial', 'Two-or-three story building, retail and/or commercial space', '25%'],
  ['597', '5A', 'Commercial', 'Special commercial structure', '25%'],
  ['599', '5A', 'Commercial', 'Commercial condominium unit', '25%'],
  ['550', '5B', 'Industrial', 'Industrial land', '25%'],
  ['581', '5B', 'Industrial', 'Ancillary structures for industrial improvements', '25%'],
  ['583', '5B', 'Industrial', 'Industrial Quonset hut or butler type building', '25%'],
  ['587', '5B', 'Industrial', 'Special industrial improvement', '25%'],
  ['589', '5B', 'Industrial', 'Industrial condominium unit', '25%'],
  ['593', '5B', 'Industrial', 'Industrial building', '25%'],
];

function seedPropertyClasses(db) {
  console.log('\nSeeding property_classes...');
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO property_classes (class, major_class, major_category, description, assessment_level) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((rows) => {
    for (const row of rows) stmt.run(...row);
  });
  tx(PROPERTY_CLASSES);
  console.log(`  ${PROPERTY_CLASSES.length} classifications`);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('Oak Park Property Data Ingest');
  console.log('============================');
  console.log(`Year: ${opts.year}`);
  console.log(`Database: ${opts.db}`);

  fs.mkdirSync(path.dirname(opts.db), { recursive: true });

  const db = new Database(opts.db);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  createSchema(db);

  const start = Date.now();

  const avCount = await ingestAssessedValues(db, opts.year);
  const apCount = await ingestAddressPoints(db);
  const paCount = await ingestParcelAddresses(db, opts.year);
  seedPropertyClasses(db);

  db.close();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s:`);
  console.log(`  assessed_values:  ${avCount.toLocaleString()}`);
  console.log(`  address_points:   ${apCount.toLocaleString()}`);
  console.log(`  parcel_addresses: ${paCount.toLocaleString()}`);
  console.log(`  property_classes: ${PROPERTY_CLASSES.length}`);
  console.log(`\nDatabase: ${path.resolve(opts.db)}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
