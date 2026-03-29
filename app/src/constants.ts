// Map center and zoom defaults
export const OAK_PARK_CENTER: [number, number] = [41.885, -87.79];

// Historic district boundary colors (keyed by district name from ArcGIS)
export const DISTRICT_COLORS: Record<string, string> = {
	'Frank Lloyd Wright': '#e67e22',
	'Ridgeland - Oak Park': '#2ecc71',
	Gunderson: '#9b59b6',
};

// Major class group prefixes for the quick-filter dropdown
export const MAJOR_CLASS_GROUPS = [
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

// Oak Park zoning district colors — one unique color per zone code.
// Color families follow standard zoning map conventions:
//   Residential: yellows / golds
//   Downtown: pinks / magentas
//   Commercial corridors: reds / oranges
//   Institutional: purples
//   Open space: greens
//   ROW: gray
// Colors match the official Oak Park zoning map legend.
// R-3-35 and H use diagonal hatching in the official map; solid colors are used here.
export const ZONE_COLORS: Record<string, string> = {
	'R-1': '#dbc99a', // pale tan-brown
	'R-2': '#ffff00', // bright yellow
	'R-3-35': '#d4aa00', // gold (official: hatched)
	'R-3-50': '#7a6500', // dark olive
	'R-4': '#c8bc60', // medium olive-yellow
	'R-5': '#787840', // dark olive-green (two-family)
	'R-6': '#c4a070', // sandy tan (multi-family)
	'R-7': '#432a00', // dark brown (multi-family high)
	'DT-1': '#ff2800', // bright red — all DT sub-districts same color per legend
	'DT-2': '#ff2800',
	'DT-3': '#ff2800',
	NC: '#ffd0d0', // very pale pink
	GC: '#ff9090', // medium pink
	HS: '#cc88d0', // lavender-purple
	MS: '#80004a', // dark plum
	NA: '#480080', // deep indigo
	RR: '#750000', // dark maroon
	H: '#6688ff', // blue (official: hatched)
	OS: '#006a30', // dark forest green
	I: '#a8d4f0', // light sky blue
	'P-R': '#94a3b8', // slate gray
};

// Zoning zones grouped by category for sidebar display.
// description comes from the ZONINGDESCRIPTION field in zoning.geojson.
export const ZONE_CATEGORIES: {
	label: string;
	zones: { code: string; description: string }[];
}[] = [
	{
		label: 'Residential',
		zones: [
			{ code: 'R-1', description: 'Single-Family' },
			{ code: 'R-2', description: 'Single-Family' },
			{ code: 'R-3-35', description: "Single-Family (35')" },
			{ code: 'R-3-50', description: "Single-Family (50')" },
			{ code: 'R-4', description: 'Single-Family' },
			{ code: 'R-5', description: 'Two-Family' },
			{ code: 'R-6', description: 'Multi-Family' },
			{ code: 'R-7', description: 'Multi-Family' },
		],
	},
	{
		label: 'Downtown',
		zones: [
			{ code: 'DT-1', description: 'Central Sub-District' },
			{ code: 'DT-2', description: 'Hemingway Sub-District' },
			{ code: 'DT-3', description: 'Pleasant Sub-District' },
		],
	},
	{
		label: 'Commercial',
		zones: [
			{ code: 'GC', description: 'General Commercial' },
			{ code: 'HS', description: 'Harrison Street' },
			{ code: 'MS', description: 'Madison Street' },
			{ code: 'NA', description: 'North Avenue' },
			{ code: 'NC', description: 'Neighborhood Commercial' },
			{ code: 'RR', description: 'Roosevelt Road Form-Based' },
		],
	},
	{
		label: 'Special Purpose',
		zones: [
			{ code: 'H', description: 'Hospital' },
			{ code: 'I', description: 'Institutional' },
			{ code: 'OS', description: 'Open Space' },
		],
	},
	{
		label: 'Right-of-Way',
		zones: [{ code: 'P-R', description: 'Right-of-Way' }],
	},
];

// Canonical zone code order for bitmap encoding — derived from ZONE_CATEGORIES.
export const ZONE_CODES: string[] = ZONE_CATEGORIES.flatMap((cat) =>
	cat.zones.map((z) => z.code),
);

export function zoningColor(zoned: string): string {
	return ZONE_COLORS[zoned] ?? '#94a3b8';
}

// Marker color by Cook County property class code
export function classColor(cls: string): string {
	const code = parseInt(cls, 10);
	if (code >= 200 && code < 300) return '#3b82f6'; // residential - blue
	if (code >= 300 && code < 400) return '#8b5cf6'; // multi-family - purple
	if (code >= 500 && code < 600) return '#ef4444'; // commercial - red
	if (code >= 100 && code < 200) return '#6b7280'; // vacant - gray
	return '#f59e0b'; // other (exempt, not-for-profit) - amber
}
