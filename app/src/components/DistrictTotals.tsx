/**
 * Map overlay showing property counts by historic district.
 * Positioned at bottom-right of the map.
 */

import { useMemo } from 'react';
import { DISTRICT_COLORS } from '../constants';
import type { Property } from '../types';

interface DistrictTotalsProps {
	displayed: Property[];
}

export function DistrictTotals({ displayed }: DistrictTotalsProps) {
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
		<div className="absolute bottom-6 right-3 z-[1000] bg-background/90 backdrop-blur-sm rounded-lg border border-border px-3 py-2 shadow-md text-xs max-sm:bottom-2 max-sm:right-2 max-sm:px-2 max-sm:py-1.5 max-sm:text-[10px] max-sm:max-w-[200px]">
			<div className="font-medium text-sm mb-1.5">By District</div>
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
	);
}
