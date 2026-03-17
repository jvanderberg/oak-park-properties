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

// Marker color by Cook County property class code
export function classColor(cls: string): string {
	const code = parseInt(cls, 10);
	if (code >= 200 && code < 300) return '#3b82f6'; // residential - blue
	if (code >= 300 && code < 400) return '#8b5cf6'; // multi-family - purple
	if (code >= 500 && code < 600) return '#ef4444'; // commercial - red
	if (code >= 100 && code < 200) return '#6b7280'; // vacant - gray
	return '#f59e0b'; // other (exempt, not-for-profit) - amber
}
