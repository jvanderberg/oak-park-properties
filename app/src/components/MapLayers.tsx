/**
 * Leaflet map layer components.
 *
 * These are renderless React components that imperatively manage Leaflet layers.
 * They use useMap() from react-leaflet to access the map instance, and manage
 * layer lifecycle via useEffect + refs.
 *
 * Custom pane z-index ordering (higher = on top):
 *   - 'highlight' (470, pointer-events: none) — search bullseye marker
 *   - 'markers'   (460) — property circle markers (canvas-rendered)
 *   - 'districts' (450) — historic district polygons
 *   - default overlayPane (400) — village boundary
 */

import type { FeatureCollection } from 'geojson';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { classColor, DISTRICT_COLORS } from '../constants';
import type { Property } from '../types';

// ── MapBounds ────────────────────────────────────────────────────────
// Fits the map viewport to the bounding box of all properties on first load.

export function MapBounds({ properties }: { properties: Property[] }) {
	const map = useMap();
	const didFit = useRef(false);

	useEffect(() => {
		if (didFit.current || properties.length === 0) return;
		didFit.current = true;
		const lats = properties.map((p) => p.lat);
		const lons = properties.map((p) => p.lon);
		map.fitBounds([
			[Math.min(...lats), Math.min(...lons)],
			[Math.max(...lats), Math.max(...lons)],
		]);
	}, [properties, map]);

	return null;
}

// ── BoundaryLayer ────────────────────────────────────────────────────
// Renders the Oak Park village boundary as a dashed outline.

export function BoundaryLayer({ boundary }: { boundary: FeatureCollection }) {
	const map = useMap();
	const layerRef = useRef<L.GeoJSON | null>(null);

	useEffect(() => {
		if (layerRef.current) {
			map.removeLayer(layerRef.current);
		}
		layerRef.current = L.geoJSON(boundary, {
			style: { color: '#444', weight: 3, fillOpacity: 0, dashArray: '6 4' },
			interactive: false,
		}).addTo(map);

		return () => {
			if (layerRef.current) map.removeLayer(layerRef.current);
		};
	}, [boundary, map]);

	return null;
}

// ── DistrictLayers ───────────────────────────────────────────────────
// Renders historic district polygons with fill/stroke colors.
// Only shows districts present in the `enabled` set.

export function DistrictLayers({
	districts,
	enabled,
}: {
	districts: FeatureCollection;
	enabled: Set<string>;
}) {
	const map = useMap();
	const layerRef = useRef<L.LayerGroup | null>(null);

	useEffect(() => {
		if (!map.getPane('districts')) {
			const pane = map.createPane('districts');
			pane.style.zIndex = '450';
		}

		if (!layerRef.current) {
			layerRef.current = L.layerGroup().addTo(map);
		}
		const group = layerRef.current;
		group.clearLayers();

		for (const feature of districts.features) {
			const name = feature.properties?.NAME?.trim();
			if (!name || !enabled.has(name)) continue;
			const color = DISTRICT_COLORS[name] || '#888';
			L.geoJSON(feature, {
				style: { color, weight: 6, fillOpacity: 0.1 },
				pane: 'districts',
				onEachFeature: (_f, layer) => {
					layer.bindTooltip(name);
				},
			}).addTo(group);
		}

		return () => {
			group.clearLayers();
		};
	}, [districts, enabled, map]);

	return null;
}

// ── PropertyMarkers ──────────────────────────────────────────────────
// Renders property parcels as filled polygons where geometry is available,
// falling back to circle markers for properties without parcel shapes.
// Parcels GeoJSON features have properties: { name (PIN), pin, class, ... }

function buildPopup(p: Property): HTMLElement {
	const div = document.createElement('div');
	div.style.fontSize = '12px';
	div.innerHTML = [
		`<strong>${p.address || 'No address'}</strong>`,
		`PIN: <a href="${p.url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline">${p.pin}</a>`,
		`Class: ${p.class} — ${p.description}`,
		p.district ? `District: ${p.district}` : '',
	]
		.filter(Boolean)
		.join('<br>');
	return div;
}

// Build a popup listing multiple units sharing a parcel
function buildMultiPopup(units: Property[]): HTMLElement {
	const div = document.createElement('div');
	div.style.fontSize = '12px';
	div.style.maxHeight = '200px';
	div.style.overflowY = 'auto';
	const first = units[0];
	const lines = [
		`<strong>${first.address || 'No address'}</strong>`,
		`${units.length} units at this parcel:`,
		'<hr style="margin:4px 0">',
	];
	for (const p of units) {
		lines.push(
			`<a href="${p.url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline">${p.pin}</a> — ${p.class} ${p.description}`,
		);
	}
	if (first.district) lines.push(`<br>District: ${first.district}`);
	div.innerHTML = lines.join('<br>');
	return div;
}

export function PropertyMarkers({
	properties,
	parcels,
}: {
	properties: Property[];
	parcels: FeatureCollection | null;
}) {
	const map = useMap();
	const layerRef = useRef<L.LayerGroup | null>(null);
	const rendererRef = useRef<L.Canvas | null>(null);

	useEffect(() => {
		if (!map.getPane('markers')) {
			const pane = map.createPane('markers');
			pane.style.zIndex = '460';
		}
		if (!rendererRef.current) {
			rendererRef.current = L.canvas({ padding: 0.5, pane: 'markers' });
		}
		if (!layerRef.current) {
			layerRef.current = L.layerGroup().addTo(map);
		}

		const layer = layerRef.current;
		const renderer = rendererRef.current;
		layer.clearLayers();

		const displayedPins = new Set(properties.map((p) => p.pin));
		const propsByPin = new Map(properties.map((p) => [p.pin, p]));

		// Group parcel features by geometry identity (condo units share a parent shape).
		// Use first coordinate as a cheap fingerprint to deduplicate.
		const renderedPins = new Set<string>();
		if (parcels) {
			const geomGroups = new Map<
				string,
				{ coords: [number, number][][]; pins: string[] }
			>();
			for (const feature of parcels.features) {
				const pin = feature.properties?.pin ?? feature.properties?.name;
				if (!pin || !displayedPins.has(pin)) continue;

				const geom = feature.geometry as { coordinates: number[][][] } | null;
				if (!geom?.coordinates) continue;

				const fp = JSON.stringify(geom.coordinates[0]?.[0]);
				const existing = geomGroups.get(fp);
				if (existing) {
					existing.pins.push(pin);
				} else {
					// Convert GeoJSON [lon,lat] to Leaflet [lat,lon]
					const rings = geom.coordinates.map((ring) =>
						ring.map(([lon, lat]) => [lat, lon] as [number, number]),
					);
					geomGroups.set(fp, { coords: rings, pins: [pin] });
				}
			}

			// Render one L.polygon per unique parcel shape on the shared canvas
			for (const { coords, pins } of geomGroups.values()) {
				const units = pins
					.map((pin) => propsByPin.get(pin))
					.filter((p): p is Property => p !== undefined);
				if (units.length === 0) continue;

				const color = classColor(units[0].class);
				L.polygon(coords, {
					color,
					fillColor: color,
					fillOpacity: 0.35,
					weight: 1,
					renderer,
					pane: 'markers',
				})
					.bindPopup(() =>
						units.length === 1 ? buildPopup(units[0]) : buildMultiPopup(units),
					)
					.addTo(layer);

				for (const pin of pins) renderedPins.add(pin);
			}
		}

		// Fall back to circle markers for properties without parcel geometry
		for (const p of properties) {
			if (renderedPins.has(p.pin)) continue;
			const color = classColor(p.class);
			L.circleMarker([p.lat, p.lon], {
				radius: 3,
				color,
				fillColor: color,
				fillOpacity: 0.7,
				weight: 1,
				renderer,
				pane: 'markers',
			})
				.bindPopup(() => buildPopup(p))
				.addTo(layer);
		}

		return () => {
			layer.clearLayers();
		};
	}, [properties, parcels, map]);

	return null;
}

// ── HighlightMarker ──────────────────────────────────────────────────
// Shows a red bullseye on the searched/selected property and zooms to it.
// Uses a non-interactive pane so it doesn't block clicks on underlying markers.

export function HighlightMarker({ property }: { property: Property | null }) {
	const map = useMap();
	const markerRef = useRef<L.CircleMarker | null>(null);
	const ringRef = useRef<L.CircleMarker | null>(null);

	useEffect(() => {
		if (markerRef.current) {
			map.removeLayer(markerRef.current);
			markerRef.current = null;
		}
		if (ringRef.current) {
			map.removeLayer(ringRef.current);
			ringRef.current = null;
		}
		if (!property) return;

		if (!map.getPane('highlight')) {
			const pane = map.createPane('highlight');
			pane.style.zIndex = '470';
			pane.style.pointerEvents = 'none';
		}

		const latlng: [number, number] = [property.lat, property.lon];
		const maxZoom = map.getMaxZoom() || 18;
		map.setView(latlng, maxZoom - 1);

		// Outer ring
		ringRef.current = L.circleMarker(latlng, {
			radius: 14,
			color: '#ef4444',
			weight: 2,
			fillOpacity: 0,
			interactive: false,
			pane: 'highlight',
		}).addTo(map);

		// Inner dot
		markerRef.current = L.circleMarker(latlng, {
			radius: 5,
			color: '#ef4444',
			fillColor: '#ef4444',
			fillOpacity: 1,
			weight: 2,
			interactive: false,
			pane: 'highlight',
		}).addTo(map);

		return () => {
			if (markerRef.current) map.removeLayer(markerRef.current);
			if (ringRef.current) map.removeLayer(ringRef.current);
		};
	}, [property, map]);

	return null;
}
