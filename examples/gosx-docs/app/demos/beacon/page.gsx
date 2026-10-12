package docs

func Page() Node {
	return <section
		class="bgb"
		aria-label="Blackglass Beach"
		role="region"
		data-view={data.view}
		data-period={data.period}
		data-coast-pickup={data.pickupCommands}
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
		<details class="bgb__journal">
			<summary>Field journal <span data-coast-found>0 / 4</span></summary>
			<p class="bgb__journal-intro">Small worlds in the basalt. Visit the pools, then click or tap the water to take a closer look.</p>
			<a class="bgb__journal-route" href={data.poolsHref}>Visit the tide pools ↗</a>
			<details data-coast-note="tide-pool-0">
				<summary>Ochre stars</summary>
				<p>Five arms against the black rock. Look for the warm coral shapes just beneath the surface.</p>
			</details>
			<details data-coast-note="tide-pool-1">
				<summary>Anemone garden</summary>
				<p>A little crown of green tentacles in a sheltered bowl. Circle the rim to catch their silhouettes.</p>
			</details>
			<details data-coast-note="tide-pool-2">
				<summary>The limpet ledge</summary>
				<p>Pale shells gather along the inner lip of the basalt. The quiet water catches a different sky at every hour.</p>
			</details>
			<p data-coast-handheld-note hidden>A violet handheld was left on the dry rock. Your pocket has room for one more discovery.</p>
			<button type="button" data-coast-pocket hidden>Play the handheld</button>
			<p class="bgb__journal-status" role="status" data-coast-status>Explore at your own pace.</p>
		</details>
		<dialog class="bgb__handheld-dialog" aria-label="Pocket handheld">
			<button class="bgb__handheld-close" type="button" data-coast-put-away>Put away · Esc</button>
		</dialog>
		<button type="button" hidden data-gosx-scene3d-animation-toggle>Pause coast</button>
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
				<a class="bgb__link bgb__view-pools" href={data.poolsHref}>Tide pools</a>
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
