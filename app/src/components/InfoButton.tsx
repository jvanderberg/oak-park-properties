/**
 * "?" info button that shows a popover with data source attribution.
 * Closes on click outside.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function InfoButton() {
	const [open, setOpen] = useState(false);
	const btnRef = useRef<HTMLButtonElement>(null);
	const popRef = useRef<HTMLDivElement>(null);

	const close = useCallback((e: MouseEvent) => {
		if (
			popRef.current?.contains(e.target as Node) ||
			btnRef.current?.contains(e.target as Node)
		)
			return;
		setOpen(false);
	}, []);

	useEffect(() => {
		if (open) document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [open, close]);

	return (
		<>
			<button
				type="button"
				ref={btnRef}
				onClick={() => setOpen((o) => !o)}
				className="w-6 h-6 rounded-full border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			>
				?
			</button>
			{open && (
				<div
					ref={popRef}
					className="fixed left-4 top-12 z-[2000] w-72 rounded-lg border border-border bg-background p-4 shadow-lg text-xs space-y-2"
				>
					<div className="font-semibold text-sm">Data Sources</div>
					<p>
						Property records from the{' '}
						<a
							href="https://datacatalog.cookcountyil.gov"
							target="_blank"
							rel="noreferrer"
							className="underline text-primary"
						>
							Cook County Assessor&apos;s Office
						</a>{' '}
						via the Socrata Open Data Portal:
					</p>
					<ul className="list-disc ml-4 space-y-1">
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/uzyt-m557"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Assessed Values
							</a>{' '}
							— PIN, class code, township
						</li>
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/3723-97qp"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Parcel Addresses
							</a>{' '}
							— street addresses by PIN
						</li>
						<li>
							<a
								href="https://datacatalog.cookcountyil.gov/d/78yw-iddh"
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Address Points
							</a>{' '}
							— lat/lon coordinates by PIN
						</li>
					</ul>
					<p>
						Parcel boundaries from the{' '}
						<a
							href="https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0"
							target="_blank"
							rel="noreferrer"
							className="underline text-primary"
						>
							Cook County GIS Parcel Layer
						</a>
						.
					</p>
					<p>
						Historic district boundaries from the{' '}
						<a
							href="https://oak-park-open-data-portal-v2-oakparkil.hub.arcgis.com/datasets/d3ff666dfb764e8183879667acce810e_13/explore"
							target="_blank"
							rel="noreferrer"
							className="underline text-primary"
						>
							Village of Oak Park ArcGIS Portal (Historic Districts, Layer 13)
						</a>
						.
					</p>
					<p className="text-muted-foreground">
						~7% of properties lack coordinates (vacant land, garages, exempt
						parcels) and are not shown on the map.
					</p>
				</div>
			)}
		</>
	);
}
