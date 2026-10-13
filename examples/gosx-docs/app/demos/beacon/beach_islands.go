package docs

import (
	"encoding/json"
	"math"

	"m31labs.dev/gosx/examples/gosx-docs/internal/beachgen"
	"m31labs.dev/gosx/scene"
)

func blackglassIslandFindPosition(island beachgen.OffshoreIsland) scene.Vector3 {
	return scene.Vec3(island.X, beachgen.IslandHeight(island, island.X, island.Z+4)+.05, island.Z+4)
}

func blackglassIslandModels() []scene.Node {
	nodes := []scene.Node{
		scene.Model{ID: "offshore-islands", Src: blackglassBeachModelRoot + "offshore-islands.glb", Static: scene.Bool(true), ReceiveShadow: true, CastShadow: true, Detail: blackglassBeachDetail()},
		scene.Model{ID: "offshore-piers", Src: blackglassBeachModelRoot + "offshore-piers.glb", Static: scene.Bool(true), ReceiveShadow: true, CastShadow: true},
	}
	for _, island := range beachgen.OffshoreIslands() {
		nodes = append(nodes, scene.Model{ID: island.Find, Src: blackglassBeachModelRoot + island.Find + ".glb", Position: blackglassIslandFindPosition(island),
			Static: scene.Bool(true), Interactive: true, Label: "Inspect " + island.Title + " on " + island.Name, CastShadow: true, ReceiveShadow: true})
	}
	return nodes
}

func blackglassIslandFindSites() string {
	type site struct {
		ID       string        `json:"id"`
		Position scene.Vector3 `json:"position"`
	}
	var sites []site
	for _, island := range beachgen.OffshoreIslands() {
		sites = append(sites, site{island.Find, blackglassIslandFindPosition(island)})
	}
	data, _ := json.Marshal(sites)
	return string(data)
}

func blackglassIslandLandings() []scene.VesselLanding {
	var landings []scene.VesselLanding
	for _, island := range beachgen.OffshoreIslands() {
		pier := beachgen.IslandPier(island)
		landings = append(landings, scene.VesselLanding{ID: island.ID, Position: scene.Vec3(pier[0], pier[1]+1.7, pier[2]+pier[4]/2-1), Radius: 30, MaxSpeed: 1.5})
	}
	return landings
}

// Small finds are baked by material; their scene nodes remain independent
// pick targets. No DOM replica of the discovery stands in for the 3D object.
func blackglassIslandFinds() map[string][][]scene.Mesh {
	wood := scene.StandardMaterial{Color: "#63503b", Roughness: .82}
	bronze := scene.StandardMaterial{Color: "#ae8650", Roughness: .3, Metalness: .7}
	paper := scene.StandardMaterial{Color: "#d3c5a2", Roughness: .75}
	rock := scene.StandardMaterial{Color: "#414c4c", Roughness: .72}
	box := func(m scene.StandardMaterial, x, y, z, w, h, d float64) scene.Mesh {
		return scene.Mesh{Geometry: scene.BoxGeometry{Width: w, Height: h, Depth: d}, Position: scene.Vec3(x, y, z), Material: m}
	}
	cylinder := func(m scene.StandardMaterial, y, top, bottom, height float64) scene.Mesh {
		return scene.Mesh{Geometry: scene.CylinderGeometry{RadiusTop: top, RadiusBottom: bottom, Height: height, Segments: 24}, Position: scene.Vec3(0, y, 0), Material: m}
	}
	letter := [][]scene.Mesh{
		{box(wood, 0, .28, 0, 1.3, .56, .8), box(wood, -.7, .5, 0, .14, 1, .9), box(wood, .7, .5, 0, .14, 1, .9)},
		{box(paper, 0, .61, 0, .85, .035, .52)},
		{box(bronze, -.4, .3, .41, .08, .58, .025), box(bronze, .4, .3, .41, .08, .58, .025)},
	}
	bell := [][]scene.Mesh{
		{box(wood, -1.05, 1.5, 0, .22, 3, .28), box(wood, 1.05, 1.5, 0, .22, 3, .28), box(wood, 0, 2.95, 0, 2.5, .26, .3)},
		{cylinder(bronze, 2, .22, .65, .9), cylinder(bronze, 1.53, .67, .67, .07), cylinder(bronze, 1.4, .07, .07, .25)},
	}
	dial := [][]scene.Mesh{{cylinder(rock, .32, 1.65, 1.9, .64)}, {cylinder(bronze, .67, 1.42, 1.42, .055)}}
	var rose scene.BufferGeometry
	rose.Immutable, rose.Revision = true, 1
	for arm := 0; arm < 8; arm++ {
		a := float64(arm) * math.Pi / 4
		point := func(angle, r float64) scene.Vector3 { return scene.Vec3(math.Sin(angle)*r, .706, -math.Cos(angle)*r) }
		momentQuad(&rose, point(a-.28, .23), point(a, 1.22), point(a+.28, .23), scene.Vec3(0, .706, 0))
	}
	dial = append(dial, []scene.Mesh{{Geometry: rose, Material: rock}})
	return map[string][][]scene.Mesh{"drift-letter": letter, "tide-bell": bell, "star-dial": dial}
}

// BlackglassBeachOffshoreAssets regenerates the complete island asset set.
func BlackglassBeachOffshoreAssets() (map[string][]byte, error) {
	files, err := beachgen.OffshoreAssets(beachgen.Seed)
	if err != nil {
		return nil, err
	}
	for name, groups := range blackglassIslandFinds() {
		data, err := beachgen.StaticColorGLB(groups...)
		if err != nil {
			return nil, err
		}
		files[name+".glb"] = data
	}
	return files, nil
}
