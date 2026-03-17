/**
 * Address/PIN search with autocomplete dropdown.
 *
 * Features:
 *   - Filters properties by address or PIN substring (min 2 chars)
 *   - Auto-highlights when only one result matches
 *   - Dropdown dismisses on click outside
 *   - X button clears search and removes highlight marker
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Property } from '../types';

interface SearchInputProps {
	properties: Property[];
	onHighlight: (property: Property | null) => void;
}

export function SearchInput({ properties, onHighlight }: SearchInputProps) {
	const [searchText, setSearchText] = useState('');
	const [searchOpen, setSearchOpen] = useState(false);
	const searchRef = useRef<HTMLDivElement>(null);

	// Close dropdown on click outside
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
				setSearchOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, []);

	// Match properties by address or PIN (max 20 results)
	const searchResults = useMemo(() => {
		if (searchText.length < 2) return [];
		const q = searchText.toLowerCase();
		return properties
			.filter((p) => p.address.toLowerCase().includes(q) || p.pin.includes(q))
			.slice(0, 20);
	}, [properties, searchText]);

	// Auto-select when exactly one result
	useEffect(() => {
		if (searchResults.length === 1) {
			onHighlight(searchResults[0]);
		}
	}, [searchResults, onHighlight]);

	return (
		<div className="relative" ref={searchRef}>
			<input
				type="text"
				placeholder="Search address or PIN..."
				value={searchText}
				onFocus={() => setSearchOpen(true)}
				onChange={(e) => {
					setSearchText(e.target.value);
					setSearchOpen(true);
					if (e.target.value.length < 2) onHighlight(null);
				}}
				className="w-full text-xs px-2 py-1.5 pr-6 rounded border border-border bg-background"
			/>
			{searchText && (
				<button
					type="button"
					onClick={() => {
						setSearchText('');
						onHighlight(null);
						setSearchOpen(false);
					}}
					className="absolute right-0 top-0 bottom-0 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground text-sm"
				>
					&times;
				</button>
			)}

			{/* Autocomplete dropdown */}
			{searchOpen && searchText.length >= 2 && searchResults.length >= 1 && (
				<div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded border border-border bg-background shadow-lg">
					{searchResults.map((p) => (
						<button
							type="button"
							key={p.pin}
							onClick={() => {
								onHighlight(p);
								setSearchText(p.address || p.pin);
								setSearchOpen(false);
							}}
							className="w-full text-left text-xs px-2 py-1.5 hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
						>
							<div className="font-medium">{p.address || 'No address'}</div>
							<div className="text-muted-foreground">{p.pin}</div>
						</button>
					))}
				</div>
			)}
			{searchOpen && searchText.length >= 2 && searchResults.length === 0 && (
				<div className="absolute z-50 left-0 right-0 top-full mt-1 rounded border border-border bg-background shadow-lg px-2 py-1.5 text-xs text-muted-foreground">
					No results
				</div>
			)}
		</div>
	);
}
