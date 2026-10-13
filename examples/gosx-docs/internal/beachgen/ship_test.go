package beachgen

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image/png"
	"math"
	"testing"
)

func TestWakeFoamBranchesFadeAndRemainBounded(t *testing.T) {
	data, err := WakeFoam()
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) > 16384 || img.Bounds().Dx() != 128 || img.Bounds().Dy() != 128 {
		t.Fatal("foam texture exceeds its bounded resolution or byte budget")
	}
	alpha := func(x, y int) uint32 { _, _, _, a := img.At(x, y).RGBA(); return a }
	for i := 0; i < 128; i++ {
		if alpha(0, i) != 0 || alpha(127, i) != 0 || alpha(i, 127) != 0 {
			t.Fatal("foam must fade at its edges and at the end of its life")
		}
	}
	var bands, gaps uint32
	for y := 0; y < 100; y++ {
		bands += alpha(18, y) + alpha(64, y) + alpha(109, y)
		gaps += alpha(40, y) + alpha(87, y)
	}
	if bands <= gaps*3 {
		t.Fatal("wake needs distinct foam arms and churn separated by open water")
	}
	again, err := WakeFoam()
	if err != nil || !bytes.Equal(data, again) {
		t.Fatal("wake generation is not reproducible")
	}
}

func TestClipperLODsMaterialsAndBudget(t *testing.T) {
	assets, err := ShipAssets()
	if err != nil {
		t.Fatal(err)
	}
	again, err := ShipAssets()
	if err != nil {
		t.Fatal(err)
	}
	total, previous := 0, 1<<30
	for lod, name := range []string{"clipper-high.glb", "clipper-mid.glb", "clipper-low.glb"} {
		data := assets[name]
		total += len(data)
		if !bytes.Equal(data, again[name]) {
			t.Fatal("ship generation is nondeterministic")
		}
		doc := mustParse(t, data)
		var root struct {
			Materials []json.RawMessage `json:"materials"`
		}
		if err := json.Unmarshal(data[20:20+binary.LittleEndian.Uint32(data[12:16])], &root); err != nil {
			t.Fatal(err)
		}
		if len(root.Materials) != 6 {
			t.Fatal("missing timber, paint, canvas, rope or pennant materials")
		}
		sails, vertices := 0, 0
		for _, mesh := range doc.Meshes {
			if len(mesh.Name) >= 7 && mesh.Name[:7] == "canvas-" {
				sails++
			}
			for _, p := range mesh.Primitives {
				vertices += doc.Accessors[p.Attributes["POSITION"]].Count
			}
		}
		want := 9
		if lod == 2 {
			want = 6
		}
		if sails != want {
			t.Fatalf("LOD %d sails %d, want %d", lod, sails, want)
		}
		if vertices >= previous {
			t.Fatal("LOD did not reduce geometry")
		}
		previous = vertices
		t.Logf("%s: %d bytes, %d vertices, %d sails", name, len(data), vertices, sails)
	}
	if total > 300000 {
		t.Fatalf("ship LODs use %d bytes; budget 300000", total)
	}
	if len(assets["jetty.glb"]) > 80000 || len(assets["wake-foam.png"]) > 16384 {
		t.Fatal("jetty or wake exceeds its budget")
	}
}

func TestJettyMooringAndWalkData(t *testing.T) {
	if depth := -TerrainHeight(ShipX, ShipZ, Seed); depth < 3.5 {
		t.Fatalf("mooring too shallow: %g", depth)
	}
	if -ShipZ < 30 || -ShipZ > 60 {
		t.Fatal("mooring is outside the requested shore distance")
	}
	helmX, helmZ := ShipX+math.Sin(ShipHeading)*6.5, ShipZ+math.Cos(ShipHeading)*6.5
	if math.Hypot(helmX-19, helmZ-JettyEndZ) > 2 {
		t.Fatal("gangway does not reach the helm")
	}
	surfaces := JettySurfaces()
	if len(surfaces) != 3 {
		t.Fatal("missing ramp, pier or gangway")
	}
	if math.Abs((surfaces[0][1]-10*surfaces[0][6])-JettyDeck) > 1e-8 {
		t.Fatal("ramp does not meet pier")
	}
	if len(JettyColliders()) != 12 {
		t.Fatal("jetty piles do not match the mesh")
	}
	for _, c := range JettyColliders() {
		if c.Y+c.Height >= JettyDeck {
			t.Fatal("pile blocks walking on deck")
		}
	}
}
