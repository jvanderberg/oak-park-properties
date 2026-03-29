/**
 * Map overlay showing property counts by zoning district.
 * Positioned above the By District overlay at the bottom-right.
 * Only shows zones that contain at least one displayed property.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ZONE_CATEGORIES, ZONE_COLORS } from '../constants';
import type { Property } from '../types';

interface ZoneTotalsProps {
	displayed: Property[];
}

export function ZoneTotals({ displayed }: ZoneTotalsProps) {
	const [collapsed, setCollapsed] = useState(
		() => window.matchMedia('(max-width: 639px)').matches,
	);

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

	const rows = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const p of displayed) {
			if (p.zone) counts[p.zone] = (counts[p.zone] || 0) + 1;
		}
		const zoneOrder = ZONE_CATEGORIES.flatMap((cat) =>
			cat.zones.map((z) => z.code),
		);
		return Object.entries(counts).sort(
			(a, b) => zoneOrder.indexOf(a[0]) - zoneOrder.indexOf(b[0]),
		);
	}, [displayed]);

	const total = displayed.length;
	function pct(n: number) {
		return total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
	}

	const panelId = 'zone-totals-content';

	return (
		<div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border shadow-md text-xs max-sm:text-[10px] max-sm:max-w-[200px]">
			<button
				type="button"
				className="flex items-center justify-between w-full font-medium text-sm px-3 py-2 max-sm:px-2 max-sm:py-1.5 cursor-pointer"
				onClick={() => setCollapsed((c) => !c)}
				aria-expanded={!collapsed}
				aria-controls={panelId}
			>
				<span>By Zone</span>
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
							{rows.map(([zone, count]) => (
								<tr key={zone}>
									<td className="py-0.5 pr-4">
										<div className="flex items-center gap-1.5">
											<div
												className="w-2.5 h-2.5 rounded-sm shrink-0"
												style={{
													backgroundColor: ZONE_COLORS[zone] ?? '#888',
													opacity: 0.8,
													border: `1px solid ${ZONE_COLORS[zone] ?? '#888'}`,
												}}
											/>
											<span className="font-mono">{zone}</span>
										</div>
									</td>
									<td className="font-mono tabular-nums text-right py-0.5">
										{count.toLocaleString()}
									</td>
									<td className="font-mono tabular-nums text-right text-muted-foreground py-0.5 pl-2">
										{pct(count)}%
									</td>
								</tr>
							))}
							<tr className="font-medium border-t border-border">
								<td className="pt-1">Total</td>
								<td className="font-mono tabular-nums text-right pt-1">
									{total.toLocaleString()}
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
