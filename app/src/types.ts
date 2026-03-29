export interface Property {
	pin: string;
	address: string;
	lat: number;
	lon: number;
	class: string;
	description: string;
	district: string | null;
	zone: string | null;
	url: string;
}

export interface ClassInfo {
	class: string;
	description: string;
	count: number;
}
