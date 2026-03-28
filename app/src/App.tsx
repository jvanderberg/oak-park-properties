/**
 * Oak Park Properties — interactive map of ~17k Cook County parcels.
 *
 * This is the main app component. It manages filter state and composes
 * the sidebar controls with the Leaflet map. Individual map layers and
 * UI widgets live in ./components/.
 */

import type { FeatureCollection } from 'geojson';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
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

// Short keys for district names used in URL params
const DISTRICT_KEYS: Record<string, string> = {
	flw: 'Frank Lloyd Wright',
	rop: 'Ridgeland - Oak Park',
	gun: 'Gunderson',
};
const DISTRICT_TO_KEY = Object.fromEntries(
	Object.entries(DISTRICT_KEYS).map(([k, v]) => [v, k]),
);

/** Pack a set of selected class indices into a base64url-encoded bitfield. */
function encodeClassBits(
	allClasses: string[],
	selected: Set<string>,
): string {
	const byteCount = Math.ceil(allClasses.length / 8);
	const bytes = new Uint8Array(byteCount);
	for (let i = 0; i < allClasses.length; i++) {
		if (selected.has(allClasses[i])) {
			bytes[i >> 3] |= 1 << (i & 7);
		}
	}
	// base64url encode
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a base64url-encoded bitfield back into a set of class codes. */
function decodeClassBits(
	encoded: string,
	allClasses: string[],
): Set<string> {
	try {
		const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const binary = atob(b64);
		const result = new Set<string>();
		for (let i = 0; i < allClasses.length; i++) {
			const byte = binary.charCodeAt(i >> 3);
			if (byte & (1 << (i & 7))) {
				result.add(allClasses[i]);
			}
		}
		return result;
	} catch {
		return new Set(allClasses);
	}
}

function useIsMobile(breakpoint = 768) {
	const [isMobile, setIsMobile] = useState(
		() => window.innerWidth < breakpoint,
	);
	useEffect(() => {
		const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
		const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, [breakpoint]);
	return isMobile;
}

export default function App() {
	// ── Sidebar state ─────────────────────────────────────────────────
	const isMobile = useIsMobile();
	const [sidebarOpen, setSidebarOpen] = useState(
		() => window.innerWidth >= 768,
	);
	const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

	// ── Data loading ──────────────────────────────────────────────────
	const [properties, setProperties] = useState<Property[]>([]);
	const [districts, setDistricts] = useState<FeatureCollection | null>(null);
	const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
	const [parcels, setParcels] = useState<FeatureCollection | null>(null);

	useEffect(() => {
		const base = import.meta.env.BASE_URL;
		Promise.all([
			fetch(`${base}properties.json`).then((r) => r.json()),
			fetch(`${base}districts.geojson`).then((r) => r.json()),
			fetch(`${base}boundary.geojson`).then((r) => r.json()),
			fetch(`${base}parcels.geojson`).then((r) => r.json()),
		]).then(([props, dists, bound, parcs]) => {
			setProperties(props);
			setDistricts(dists);
			setBoundary(bound);
			setParcels(parcs);
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

	// Sorted class codes used as the stable ordering for bitfield encoding
	const allClassCodes = useMemo(
		() => classInfos.map((c) => c.class),
		[classInfos],
	);

	// Restore state from URL on initial load (once data is ready)
	const didInit = useRef(false);
	useEffect(() => {
		if (!didInit.current && classInfos.length > 0) {
			didInit.current = true;
			const params = new URLSearchParams(window.location.search);

			// Restore district filter
			const dKey = params.get('district');
			if (dKey && DISTRICT_KEYS[dKey]) {
				setDistrictFilter(DISTRICT_KEYS[dKey]);
			}

			// Restore class selection from bitfield, or select all
			const classBits = params.get('classes');
			if (classBits) {
				setSelectedClasses(decodeClassBits(classBits, allClassCodes));
			} else {
				setSelectedClasses(new Set(allClassCodes));
			}
		}
	}, [classInfos, allClassCodes]);

	// Sync filter state to URL (after init)
	useEffect(() => {
		if (!didInit.current) return;
		const params = new URLSearchParams();

		// District filter
		if (districtFilter) {
			const key = DISTRICT_TO_KEY[districtFilter];
			if (key) params.set('district', key);
		}

		// Class bitfield — omit if all are selected (default state)
		const allSelected = allClassCodes.length > 0 && selectedClasses.size === allClassCodes.length;
		if (!allSelected && allClassCodes.length > 0) {
			params.set('classes', encodeClassBits(allClassCodes, selectedClasses));
		}

		const qs = params.toString();
		const newUrl = qs
			? `${window.location.pathname}?${qs}`
			: window.location.pathname;
		window.history.replaceState(null, '', newUrl);
	}, [selectedClasses, districtFilter, allClassCodes]);

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

	// ── Share URL ────────────────────────────────────────────────────
	const [copied, setCopied] = useState(false);
	function copyShareUrl() {
		navigator.clipboard.writeText(window.location.href).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			},
			() => {
				// Fallback: select a temporary input so the user can Ctrl+C
				const input = document.createElement('input');
				input.value = window.location.href;
				document.body.appendChild(input);
				input.select();
				document.execCommand('copy');
				document.body.removeChild(input);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			},
		);
	}

	// ── Render ────────────────────────────────────────────────────────

	return (
		<div className="flex h-screen w-screen overflow-hidden">
			{/* ── Mobile backdrop ──────────────────────────────────── */}
			{isMobile && sidebarOpen && (
				<button
					type="button"
					className="fixed inset-0 z-[1100] bg-black/40 cursor-default"
					onClick={toggleSidebar}
					aria-label="Close sidebar"
				/>
			)}

			{/* ── Sidebar ──────────────────────────────────────────── */}
			<div
				className={[
					'flex flex-col gap-4 bg-background border-r border-border overflow-y-auto p-4 transition-all duration-200 ease-in-out',
					isMobile
						? `fixed inset-y-0 left-0 z-[1200] w-[85vw] max-w-80 shadow-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
						: `shrink-0 ${sidebarOpen ? 'w-80' : 'w-0 p-0 border-r-0 overflow-hidden'}`,
				].join(' ')}
			>
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold whitespace-nowrap">
						Oak Park Properties
					</h1>
					<div className="flex items-center gap-1">
						<InfoButton />
						<button
							type="button"
							onClick={toggleSidebar}
							className="w-6 h-6 rounded-full border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							aria-label="Close sidebar"
						>
							&#x2715;
						</button>
					</div>
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
			<div className="flex-1 relative min-w-0">
				{/* Sidebar toggle + share buttons */}
				{!sidebarOpen && (
					<button
						type="button"
						onClick={toggleSidebar}
						className="absolute top-3 left-14 z-[1000] w-9 h-9 rounded-lg bg-background/90 backdrop-blur-sm border border-border shadow-md flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
						aria-label="Open sidebar"
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<title>Open sidebar</title>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
				)}
				<button
					type="button"
					onClick={copyShareUrl}
					className={`absolute top-3 z-[1000] w-9 h-9 rounded-lg bg-background/90 backdrop-blur-sm border border-border shadow-md flex items-center justify-center hover:bg-accent hover:text-accent-foreground ${!sidebarOpen ? 'left-[6.5rem]' : 'left-14'}`}
					aria-label="Copy share link"
					title={copied ? 'Copied!' : 'Copy share link'}
				>
					{copied ? (
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					) : (
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
							<polyline points="16 6 12 2 8 6" />
							<line x1="12" y1="2" x2="12" y2="15" />
						</svg>
					)}
				</button>
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
					<PropertyMarkers properties={displayed} parcels={parcels} />
					{districts && (
						<DistrictLayers districts={districts} enabled={enabledDistricts} />
					)}
					<HighlightMarker property={highlightedProperty} />
				</MapContainer>
			</div>
		</div>
	);
}
