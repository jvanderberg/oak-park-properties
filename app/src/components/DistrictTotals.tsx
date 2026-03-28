/**
 * Map overlay showing property counts by historic district.
 * Positioned at bottom-right of the map. Collapsible on small screens.
 */

import { useMemo, useState } from 'react';
import { DISTRICT_COLORS } from '../constants';
import type { Property } from '../types';

interface DistrictTotalsProps {
	displayed: Property[];
}

export function DistrictTotals({ displayed }: DistrictTotalsProps) {
	const [collapsed, setCollapsed] = useState(true);

	const { counts, noDistrict } = useMemo(() => {
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

	const inDistrict = Object.values(counts).reduce((a, b) => a + b, 0);

	function pct(n: number) {
		return displayed.length > 0
			? ((n / displayed.length) * 100).toFixed(1)
			: '0.0';
	}

	return (
		<div className="absolute bottom-2 right-2 z-[1000] bg-background/90 backdrop-blur-sm rounded-lg border border-border shadow-md text-xs sm:bottom-6 sm:right-3 sm:px-3 sm:py-2">
			<button
				type="button"
				onClick={() => setCollapsed((c) => !c)}
				className="flex items-center justify-between w-full px-2 py-1.5 sm:px-0 sm:py-0 font-medium text-sm gap-2"
			>
				<span>By District</span>
				<span className="text-muted-foreground text-xs">
					{collapsed ? '▲' : '▼'}
				</span>
			</button>
			{!collapsed && (
				<table className="w-full px-2 pb-1.5 sm:px-0 sm:pb-0 sm:mt-1.5">
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
			)}
		</div>
	);
}
