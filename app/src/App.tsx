/**
 * Oak Park Properties — interactive map of ~17k Cook County parcels.
 *
 * This is the main app component. It manages filter state and composes
 * the sidebar controls with the Leaflet map. Individual map layers and
 * UI widgets live in ./components/.
 */

import type { FeatureCollection } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DistrictTotals } from './components/DistrictTotals';
import { InfoButton } from './components/InfoButton';
import {
	BoundaryLayer,
	DistrictLayers,
	HighlightMarker,
	MapBounds,
	PropertyMarkers,
} from './components/MapLayers';
import { SearchInput } from './components/SearchInput';
import {
	classColor,
	DISTRICT_COLORS,
	MAJOR_CLASS_GROUPS,
	OAK_PARK_CENTER,
} from './constants';
import type { ClassInfo, Property } from './types';
import 'leaflet/dist/leaflet.css';

export default function App() {
	// ── Data loading ──────────────────────────────────────────────────
	const [properties, setProperties] = useState<Property[]>([]);
	const [districts, setDistricts] = useState<FeatureCollection | null>(null);
	const [boundary, setBoundary] = useState<FeatureCollection | null>(null);

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

	// ── Filter state ─────────────────────────────────────────────────
	const [enabledDistricts, setEnabledDistricts] = useState<Set<string>>(
		new Set(Object.keys(DISTRICT_COLORS)),
	);
	const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
		new Set(),
	);
	const [districtFilter, setDistrictFilter] = useState<string | null>(null);
	const [highlightedProperty, setHighlightedProperty] =
		useState<Property | null>(null);

	// Build sorted list of classes with counts
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

	// Select all classes on initial load (once)
	const didInit = useRef(false);
	useEffect(() => {
		if (!didInit.current && classInfos.length > 0) {
			didInit.current = true;
			setSelectedClasses(new Set(classInfos.map((c) => c.class)));
		}
	}, [classInfos]);

	// ── Derived data ─────────────────────────────────────────────────

	// Properties matching the selected class checkboxes
	const filtered = useMemo(() => {
		return properties.filter((p) => selectedClasses.has(p.class));
	}, [properties, selectedClasses]);

	// Further filtered by district dropdown (if active)
	const displayed = useMemo(() => {
		if (!districtFilter) return filtered;
		return filtered.filter((p) => p.district === districtFilter);
	}, [filtered, districtFilter]);

	// ── Filter actions ───────────────────────────────────────────────

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

	// ── CSV export ───────────────────────────────────────────────────

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

	// ── Render ────────────────────────────────────────────────────────

	return (
		<div className="flex h-screen w-screen">
			{/* ── Sidebar ──────────────────────────────────────────── */}
			<div className="w-80 shrink-0 border-r border-border bg-background overflow-y-auto p-4 flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold">Oak Park Properties</h1>
					<InfoButton />
				</div>

				{/* Address / PIN search */}
				<SearchInput
					properties={properties}
					onHighlight={setHighlightedProperty}
				/>

				{/* Historic district visibility toggles */}
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

				{/* Property class filter header with count and All/None */}
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

				{/* Quick filter: major class groups + historic districts */}
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

				{/* Individual class checkboxes */}
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

				{/* CSV download */}
				<button
					type="button"
					onClick={downloadCsv}
					className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent hover:text-accent-foreground"
				>
					Download CSV ({displayed.length.toLocaleString()})
				</button>
			</div>

			{/* ── Map ──────────────────────────────────────────────── */}
			<div className="flex-1 relative">
				<DistrictTotals displayed={displayed} />
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
