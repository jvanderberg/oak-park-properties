/**
 * Map overlay showing property counts by historic district.
 * Positioned at bottom-right of the map. Collapsible — defaults
 * to collapsed on small screens to preserve map space.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DISTRICT_COLORS } from '../constants';
import type { Property } from '../types';

interface DistrictTotalsProps {
	displayed: Property[];
}

export function DistrictTotals({ displayed }: DistrictTotalsProps) {
	const [collapsed, setCollapsed] = useState(
		() => window.matchMedia('(max-width: 639px)').matches,
	);

	// Measure actual content height for a smooth animation
	const contentRef = useRef<HTMLDivElement>(null);
	const [contentHeight, setContentHeight] = useState(0);
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			setContentHeight(entry.contentRect.height);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const { counts, noDistrict, inDistrict } = useMemo(() => {
		const counts: Record<string, number> = {};
		let noDistrict = 0;
		for (const p of displayed) {
			if (p.district) {
				counts[p.district] = (counts[p.district] || 0) + 1;
			} else {
				noDistrict++;
			}
		}
		const inDistrict = Object.values(counts).reduce((a, b) => a + b, 0);
		return { counts, noDistrict, inDistrict };
	}, [displayed]);

	function pct(n: number) {
		return displayed.length > 0
			? ((n / displayed.length) * 100).toFixed(1)
			: '0.0';
	}

	const panelId = 'district-totals-content';

	return (
		<div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border shadow-md text-xs max-sm:text-[10px] max-sm:max-w-[200px]">
			<button
				type="button"
				className="flex items-center justify-between w-full font-medium text-sm px-3 py-2 max-sm:px-2 max-sm:py-1.5 cursor-pointer"
				onClick={() => setCollapsed((c) => !c)}
				aria-expanded={!collapsed}
				aria-controls={panelId}
			>
				<span>By District</span>
				<svg
					className={`w-3.5 h-3.5 ml-2 shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<polyline points="18 15 12 9 6 15" />
				</svg>
			</button>
			<section
				id={panelId}
				className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
				style={{ maxHeight: collapsed ? 0 : contentHeight }}
			>
				<div ref={contentRef} className="px-3 pb-2 max-sm:px-2 max-sm:pb-1.5">
					<table className="w-full">
						<tbody>
							{Object.entries(DISTRICT_COLORS).map(([name, color]) => {
								const count = counts[name] || 0;
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
											{pct(count)}%
										</td>
									</tr>
								);
							})}

							{/* Subtotals */}
							<tr className="font-medium border-t border-border">
								<td className="pt-1">Any district</td>
								<td className="font-mono tabular-nums text-right pt-1">
									{inDistrict.toLocaleString()}
								</td>
								<td className="font-mono tabular-nums text-right pt-1 pl-2">
									{pct(inDistrict)}%
								</td>
							</tr>
							<tr className="text-muted-foreground">
								<td className="py-0.5">No district</td>
								<td className="font-mono tabular-nums text-right py-0.5">
									{noDistrict.toLocaleString()}
								</td>
								<td className="font-mono tabular-nums text-right py-0.5 pl-2">
									{pct(noDistrict)}%
								</td>
							</tr>
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
			</section>
		</div>
	);
}
