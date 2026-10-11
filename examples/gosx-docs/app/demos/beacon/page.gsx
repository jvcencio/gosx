package docs

func Page() Node {
	return <section
		class="bgb"
		aria-label="Blackglass Beach"
		role="region"
		data-view={data.view}
		data-period={data.period}
		data-gosx-scene3d-control-scope
		data-gosx-scene3d-status-scope
	>
		<div class="bgb__canvas gosx-scene3d-poster-stage" data-gosx-scene3d-poster-stage>
			<img
				class="gosx-scene3d-poster"
				src={data.posterSrc}
				alt=""
				width="1000"
				height="625"
				decoding="async"
				fetchpriority="high"
			 />
			<Scene3D {...data.scene} stats={false} />
		</div>
		<p class="bgb__preview-state" role="status">Still preview · interactive 3D needs JavaScript and graphics support.</p>
		<a class="bgb__close" href="/demos" aria-label="Back to the demos">×</a>
		<div class="bgb__controls">
			<p class="bgb__instructions bgb__instructions-desktop">{data.instructions}</p>
			<p class="bgb__instructions bgb__instructions-touch">{data.touchInstructions}</p>
			<p class="bgb__instructions bgb__discoveries">
				Follow footprints to the glass. Wreck and hollow to the west; tide pools and lighthouse to the east. Pilot ship to explore the sea.
			</p>
			<nav class="bgb__group" aria-label="View">
				<a class="bgb__link bgb__view-shore" href={data.shoreHref}>Shore</a>
				<a class="bgb__link bgb__view-glass" href={data.glassHref}>Glass</a>
				<a class="bgb__link bgb__view-cliff" href={data.cliffHref}>Overlook</a>
				<a class="bgb__link bgb__view-ship" href={data.shipHref}>Ship view</a>
				<button class="bgb__link bgb__reset" type="button" data-gosx-scene3d-reset="">Reset view</button>
			</nav>
			<nav class="bgb__group" aria-label="Light">
				<a class="bgb__link bgb__period-golden-hour" href={data.goldenHref}>Golden hour</a>
				<a class="bgb__link bgb__period-blue-hour" href={data.blueHref}>Blue hour</a>
				<a class="bgb__link bgb__period-noon" href={data.noonHref}>Midday</a>
			</nav>
		</div>
		<p class="bgb__reveal" aria-live="off">
			Rendered by GoSX: Go + WASM,
			<output data-gosx-scene3d-status="bytes">…</output>
			KB,
			<output data-gosx-scene3d-status="fps">…</output>
			fps on this device
			<a href="/docs/scene3d">How it works ↗</a>
		</p>
	</section>
}
