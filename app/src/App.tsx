import type { FeatureCollection } from 'geojson';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ClassInfo, Property } from './types';
import 'leaflet/dist/leaflet.css';

const OAK_PARK_CENTER: [number, number] = [41.885, -87.79];

const DISTRICT_COLORS: Record<string, string> = {
	'Frank Lloyd Wright': '#e67e22',
	'Ridgeland - Oak Park': '#2ecc71',
	Gunderson: '#9b59b6',
};

const MAJOR_CLASS_GROUPS = [
	{
		prefix: '1',
		label: '1xx Vacant',
		description: 'Vacant land and minor improvements',
	},
	{
		prefix: '2',
		label: '2xx Residential',
		description: 'Single-family homes, condos, townhomes (assessed at 10%)',
	},
	{
		prefix: '3',
		label: '3xx Multi-Family',
		description: 'Apartment buildings with 7+ units (assessed at 10%)',
	},
	{
		prefix: '4',
		label: '4xx Not-For-Profit',
		description: 'Not-for-profit properties (assessed at 20%)',
	},
	{
		prefix: '5',
		label: '5xx Commercial',
		description: 'Commercial and industrial properties (assessed at 25%)',
	},
];

function classColor(cls: string): string {
	const code = parseInt(cls, 10);
	if (code >= 200 && code < 300) return '#3b82f6'; // residential - blue
	if (code >= 300 && code < 400) return '#8b5cf6'; // multi-family - purple
	if (code >= 500 && code < 600) return '#ef4444'; // commercial - red
	if (code >= 100 && code < 200) return '#6b7280'; // vacant - gray
	return '#f59e0b'; // other - amber
}

function MapBounds({ properties }: { properties: Property[] }) {
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

function BoundaryLayer({ boundary }: { boundary: FeatureCollection }) {
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

function DistrictLayers({
	districts,
	enabled,
}: {
	districts: FeatureCollection;
	enabled: Set<string>;
}) {
	const map = useMap();
	const layerRef = useRef<L.LayerGroup | null>(null);

	useEffect(() => {
		// Create a custom pane above the default overlayPane (z-index 400)
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

function PropertyMarkers({ properties }: { properties: Property[] }) {
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

function HighlightMarker({ property }: { property: Property | null }) {
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

		const latlng: [number, number] = [property.lat, property.lon];
		const maxZoom = map.getMaxZoom() || 18;
		map.setView(latlng, maxZoom - 1);

		ringRef.current = L.circleMarker(latlng, {
			radius: 14,
			color: '#ef4444',
			weight: 2,
			fillOpacity: 0,
			pane: 'markers',
		}).addTo(map);

		markerRef.current = L.circleMarker(latlng, {
			radius: 5,
			color: '#ef4444',
			fillColor: '#ef4444',
			fillOpacity: 1,
			weight: 2,
			pane: 'markers',
		}).addTo(map);

		return () => {
			if (markerRef.current) map.removeLayer(markerRef.current);
			if (ringRef.current) map.removeLayer(ringRef.current);
		};
	}, [property, map]);

	return null;
}

function InfoButton() {
	const [open, setOpen] = useState(false);
	const btnRef = useRef<HTMLButtonElement>(null);
	const popRef = useRef<HTMLDivElement>(null);

	const close = useCallback((e: MouseEvent) => {
		if (
			popRef.current?.contains(e.target as Node) ||
			btnRef.current?.contains(e.target as Node)
		)
			return;
		setOpen(false);
	}, []);

	useEffect(() => {
		if (open) document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [open, close]);

	return (
		<>
			<button
				type="button"
				ref={btnRef}
				onClick={() => setOpen((o) => !o)}
				className="w-6 h-6 rounded-full border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			>
				?
			</button>
			{open && (
				<div
					ref={popRef}
					className="fixed left-4 top-12 z-[2000] w-72 rounded-lg border border-border bg-background p-4 shadow-lg text-xs space-y-2"
				>
					<div className="font-semibold text-sm">Data Sources</div>
					<p>
						Property records from the{' '}
						<a
							href="https://datacatalog.cookcountyil.gov"
							target="_blank"
							rel="noreferrer"
							className="underline text-primary"
						>
							Cook County Assessor&apos;s Office
						</a>{' '}
						via the Socrata Open Data Portal:
					</p>
					<ul className="list-disc ml-4 space-y-1">
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/uzyt-m557"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Assessed Values
							</a>{' '}
							— PIN, class code, township
						</li>
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/3723-97qp"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Parcel Addresses
							</a>{' '}
							— street addresses by PIN
						</li>
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/78yw-iddh"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Address Points
							</a>{' '}
							— lat/lon coordinates by PIN
						</li>
					</ul>
					<p>
						Historic district boundaries from the{' '}
						<a
							href="https://oak-park-open-data-portal-v2-oakparkil.hub.arcgis.com/datasets/d3ff666dfb764e8183879667acce810e_13/explore"
							target="_blank"
							rel="noreferrer"
							className="underline text-primary"
						>
							Village of Oak Park ArcGIS Portal (Historic Districts, Layer 13)
						</a>
						.
					</p>
					<p className="text-muted-foreground">
						~7% of properties lack coordinates (vacant land, garages, exempt
						parcels) and are not shown on the map.
					</p>
				</div>
			)}
		</>
	);
}

export default function App() {
	const [properties, setProperties] = useState<Property[]>([]);
	const [districts, setDistricts] = useState<FeatureCollection | null>(null);
	const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
	const [enabledDistricts, setEnabledDistricts] = useState<Set<string>>(
		new Set(Object.keys(DISTRICT_COLORS)),
	);
	const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
		new Set(),
	);
	const [districtFilter, setDistrictFilter] = useState<string | null>(null);
	const [searchText, setSearchText] = useState('');
	const [highlightedProperty, setHighlightedProperty] =
		useState<Property | null>(null);

	const searchResults = useMemo(() => {
		if (searchText.length < 2) return [];
		const q = searchText.toLowerCase();
		return properties
			.filter((p) => p.address.toLowerCase().includes(q) || p.pin.includes(q))
			.slice(0, 20);
	}, [properties, searchText]);

	useEffect(() => {
		if (searchResults.length === 1) {
			setHighlightedProperty(searchResults[0]);
		}
	}, [searchResults]);

	useEffect(() => {
		const base = import.meta.env.BASE_URL;
		Promise.all([
			fetch(`${base}properties.json`).then((r) => r.json()),
			fetch(`${base}districts.geojson`).then((r) => r.json()),
			fetch(`${base}boundary.geojson`).then((r) => r.json()),
		]).then(([props, dists, bound]) => {
			setProperties(props);
			setDistricts(dists);
			setBoundary(bound);
		});
	}, []);

	const classInfos = useMemo((): ClassInfo[] => {
		const counts: Record<string, { description: string; count: number }> = {};
		for (const p of properties) {
			if (!counts[p.class])
				counts[p.class] = { description: p.description, count: 0 };
			counts[p.class].count++;
		}
		return Object.entries(counts)
			.map(([cls, info]) => ({ class: cls, ...info }))
			.sort((a, b) => {
				const aNum = /^\d+$/.test(a.class);
				const bNum = /^\d+$/.test(b.class);
				if (aNum && !bNum) return -1;
				if (!aNum && bNum) return 1;
				if (aNum && bNum) return parseInt(a.class, 10) - parseInt(b.class, 10);
				return a.class.localeCompare(b.class);
			});
	}, [properties]);

	// Default to all classes selected once loaded
	const didInit = useRef(false);
	useEffect(() => {
		if (!didInit.current && classInfos.length > 0) {
			didInit.current = true;
			setSelectedClasses(new Set(classInfos.map((c) => c.class)));
		}
	}, [classInfos]);

	const filtered = useMemo(() => {
		return properties.filter((p) => selectedClasses.has(p.class));
	}, [properties, selectedClasses]);

	const displayed = useMemo(() => {
		if (!districtFilter) return filtered;
		return filtered.filter((p) => p.district === districtFilter);
	}, [filtered, districtFilter]);

	const districtTotals = useMemo(() => {
		const counts: Record<string, number> = {};
		let noDistrict = 0;
		for (const p of displayed) {
			if (p.district) {
				counts[p.district] = (counts[p.district] || 0) + 1;
			} else {
				noDistrict++;
			}
		}
		return { counts, noDistrict };
	}, [displayed]);

	function toggleClass(cls: string) {
		setSelectedClasses((prev) => {
			const next = new Set(prev);
			if (next.has(cls)) next.delete(cls);
			else next.add(cls);
			return next;
		});
	}

	function selectAll() {
		setDistrictFilter(null);
		setSelectedClasses(new Set(classInfos.map((c) => c.class)));
	}

	function selectNone() {
		setDistrictFilter(null);
		setSelectedClasses(new Set());
	}

	function selectByPrefix(prefix: string) {
		setDistrictFilter(null);
		setSelectedClasses(
			new Set(
				classInfos
					.filter((c) => c.class.startsWith(prefix))
					.map((c) => c.class),
			),
		);
	}

	function selectByDistrict(district: string) {
		setDistrictFilter(district);
		setSelectedClasses(new Set(classInfos.map((c) => c.class)));
	}

	function downloadCsv() {
		const rows = displayed;
		if (rows.length === 0) return;
		const headers = [
			'pin',
			'address',
			'class',
			'description',
			'district',
			'lat',
			'lon',
			'url',
		];
		const csv = [
			headers.join(','),
			...rows.map((p) =>
				headers
					.map((h) => {
						const val = String(p[h as keyof Property] ?? '');
						return val.includes(',') || val.includes('"')
							? `"${val.replace(/"/g, '""')}"`
							: val;
					})
					.join(','),
			),
		].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'oak-park-properties.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="flex h-screen w-screen">
			{/* Sidebar */}
			<div className="w-80 shrink-0 border-r border-border bg-background overflow-y-auto p-4 flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold">Oak Park Properties</h1>
					<InfoButton />
				</div>

				{/* Search */}
				<div className="relative">
					<input
						type="text"
						placeholder="Search address or PIN..."
						value={searchText}
						onChange={(e) => {
							setSearchText(e.target.value);
							if (e.target.value.length < 2) setHighlightedProperty(null);
						}}
						className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
					/>
					{searchText.length >= 2 && searchResults.length >= 1 && (
						<div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded border border-border bg-background shadow-lg">
							{searchResults.map((p) => (
								<button
									type="button"
									key={p.pin}
									onClick={() => {
										setHighlightedProperty(p);
										setSearchText(p.address || p.pin);
									}}
									className="w-full text-left text-xs px-2 py-1.5 hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
								>
									<div className="font-medium">{p.address || 'No address'}</div>
									<div className="text-muted-foreground">{p.pin}</div>
								</button>
							))}
						</div>
					)}
					{searchText.length >= 2 && searchResults.length === 0 && (
						<div className="absolute z-50 left-0 right-0 top-full mt-1 rounded border border-border bg-background shadow-lg px-2 py-1.5 text-xs text-muted-foreground">
							No results
						</div>
					)}
				</div>

				{/* District toggles */}
				<span className="text-sm font-medium">Historic Districts</span>
				<div className="flex flex-col gap-1.5">
					{Object.entries(DISTRICT_COLORS).map(([name, color]) => (
						<div key={name} className="flex items-center gap-2">
							<Checkbox
								id={`district-${name}`}
								checked={enabledDistricts.has(name)}
								onCheckedChange={() => {
									setEnabledDistricts((prev) => {
										const next = new Set(prev);
										if (next.has(name)) next.delete(name);
										else next.add(name);
										return next;
									});
								}}
							/>
							<Label
								htmlFor={`district-${name}`}
								className="text-xs cursor-pointer flex items-center gap-1.5"
							>
								<div
									className="w-3 h-3 rounded-sm shrink-0"
									style={{
										backgroundColor: color,
										opacity: 0.4,
										border: `2px solid ${color}`,
									}}
								/>
								{name}
							</Label>
						</div>
					))}
				</div>

				{/* Class filter */}
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">Property Class</span>
					<div className="flex items-center gap-2">
						<Badge variant="secondary">
							{displayed.length.toLocaleString()} /{' '}
							{properties.length.toLocaleString()}
						</Badge>
						<div className="flex gap-2 text-xs">
							<button
								type="button"
								onClick={selectAll}
								className="text-primary underline"
							>
								All
							</button>
							<button
								type="button"
								onClick={selectNone}
								className="text-primary underline"
							>
								None
							</button>
						</div>
					</div>
				</div>
				<select
					className="text-xs px-2 py-1 rounded border border-border bg-background"
					defaultValue=""
					onChange={(e) => {
						if (!e.target.value) return;
						const val = e.target.value;
						if (val.startsWith('district:')) {
							selectByDistrict(val.slice('district:'.length));
						} else {
							selectByPrefix(val);
						}
						e.target.value = '';
					}}
				>
					<option value="" disabled>
						Quick filter...
					</option>
					<optgroup label="Major Class">
						{MAJOR_CLASS_GROUPS.map((g) => (
							<option key={g.prefix} value={g.prefix}>
								{g.label} — {g.description}
							</option>
						))}
					</optgroup>
					<optgroup label="Historic District">
						{Object.keys(DISTRICT_COLORS).map((name) => (
							<option key={name} value={`district:${name}`}>
								{name}
							</option>
						))}
					</optgroup>
				</select>
				<div className="flex flex-col gap-1.5 overflow-y-auto">
					{classInfos.map((c) => (
						<div key={c.class} className="flex items-center gap-2">
							<Checkbox
								id={`class-${c.class}`}
								checked={selectedClasses.has(c.class)}
								onCheckedChange={() => toggleClass(c.class)}
							/>
							<Label
								htmlFor={`class-${c.class}`}
								className="text-xs cursor-pointer flex-1 flex items-center gap-1.5 min-w-0"
							>
								<div
									className="w-2.5 h-2.5 rounded-full shrink-0"
									style={{ backgroundColor: classColor(c.class) }}
								/>
								<span className="font-mono shrink-0">{c.class}</span>
								<span
									className="text-muted-foreground truncate"
									title={c.description}
								>
									{c.description}
								</span>
								<span className="font-mono tabular-nums text-right shrink-0 ml-auto">
									{c.count.toLocaleString()}
								</span>
							</Label>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={downloadCsv}
					className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent hover:text-accent-foreground"
				>
					Download CSV ({displayed.length.toLocaleString()})
				</button>
			</div>

			{/* Map */}
			<div className="flex-1 relative">
				{/* District totals overlay */}
				<div className="absolute bottom-6 right-3 z-[1000] bg-background/90 backdrop-blur-sm rounded-lg border border-border px-3 py-2 shadow-md text-xs">
					<div className="font-medium text-sm mb-1.5">By District</div>
					<table className="w-full">
						<tbody>
							{Object.entries(DISTRICT_COLORS).map(([name, color]) => {
								const count = districtTotals.counts[name] || 0;
								const pct =
									displayed.length > 0
										? ((count / displayed.length) * 100).toFixed(1)
										: '0.0';
								return (
									<tr key={name}>
										<td className="py-0.5 pr-4">
											<div className="flex items-center gap-1.5">
												<div
													className="w-2.5 h-2.5 rounded-sm shrink-0"
													style={{
														backgroundColor: color,
														opacity: 0.6,
														border: `1px solid ${color}`,
													}}
												/>
												<span>{name}</span>
											</div>
										</td>
										<td className="font-mono tabular-nums text-right py-0.5">
											{count.toLocaleString()}
										</td>
										<td className="font-mono tabular-nums text-right text-muted-foreground py-0.5 pl-2">
											{pct}%
										</td>
									</tr>
								);
							})}
							{(() => {
								const inDistrict = Object.values(districtTotals.counts).reduce(
									(a, b) => a + b,
									0,
								);
								const inPct =
									displayed.length > 0
										? ((inDistrict / displayed.length) * 100).toFixed(1)
										: '0.0';
								const noPct =
									displayed.length > 0
										? (
												(districtTotals.noDistrict / displayed.length) *
												100
											).toFixed(1)
										: '0.0';
								return (
									<>
										<tr className="font-medium border-t border-border">
											<td className="pt-1">Any district</td>
											<td className="font-mono tabular-nums text-right pt-1">
												{inDistrict.toLocaleString()}
											</td>
											<td className="font-mono tabular-nums text-right pt-1 pl-2">
												{inPct}%
											</td>
										</tr>
										<tr className="text-muted-foreground">
											<td className="py-0.5">No district</td>
											<td className="font-mono tabular-nums text-right py-0.5">
												{districtTotals.noDistrict.toLocaleString()}
											</td>
											<td className="font-mono tabular-nums text-right py-0.5 pl-2">
												{noPct}%
											</td>
										</tr>
									</>
								);
							})()}
							<tr className="font-medium border-t border-border">
								<td className="pt-1">Total</td>
								<td className="font-mono tabular-nums text-right pt-1">
									{displayed.length.toLocaleString()}
								</td>
								<td />
							</tr>
						</tbody>
					</table>
				</div>

				<MapContainer
					center={OAK_PARK_CENTER}
					zoom={14}
					preferCanvas
					className="h-full w-full"
				>
					<TileLayer
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
					/>
					<MapBounds properties={properties} />
					{boundary && <BoundaryLayer boundary={boundary} />}
					<PropertyMarkers properties={displayed} />

					{districts && (
						<DistrictLayers districts={districts} enabled={enabledDistricts} />
					)}
					<HighlightMarker property={highlightedProperty} />
				</MapContainer>
			</div>
		</div>
	);
}
