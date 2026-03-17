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
				style: { color, weight: 4, fillOpacity: 0.1 },
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
// Renders ~17k property markers using Leaflet's Canvas renderer for performance.
// Each marker gets a popup with address, PIN (linked to assessor site), class, and district.

export function PropertyMarkers({ properties }: { properties: Property[] }) {
	const map = useMap();
	const layerRef = useRef<L.LayerGroup | null>(null);
	const rendererRef = useRef<L.Canvas | null>(null);

	useEffect(() => {
		// Create a pane above districts so markers are clickable
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

		for (const p of properties) {
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
				.bindPopup(() => {
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
				})
				.addTo(layer);
		}

		return () => {
			layer.clearLayers();
		};
	}, [properties, map]);

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
