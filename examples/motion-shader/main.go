// Run: go run ./examples/motion-shader
// All application behavior is Go and Selena. Playback uses GoSX constructs.
package main

import (
	_ "embed"
	"log"
	"os"
	"time"

	"m31labs.dev/gosx"
	"m31labs.dev/gosx/engine"
	"m31labs.dev/gosx/motion"
	"m31labs.dev/gosx/scene"
	"m31labs.dev/gosx/server"
)

//go:embed tide.sel
var shader []byte

//go:embed style.css
var style string

func main() {
	material, _, err := scene.CompileSelenaMaterial(shader, scene.SelenaMaterialOptions{})
	if err != nil {
		log.Fatal(err)
	}
	flat, err := (scene.ShaderSurface{Material: material, MeshID: "ribbon", Label: "Animated tide ribbons"}).EngineConfig()
	if err != nil {
		log.Fatal(err)
	}
	form, err := (scene.ShaderSurface{Material: material, Shape: scene.ShaderSphere, MeshID: "form", Label: "The same material on a sphere"}).EngineConfig()
	if err != nil {
		log.Fatal(err)
	}
	flat.MountID, form.MountID = "tide", "form"
	app := server.New()
	app.Page("GET /", func(ctx *server.Context) gosx.Node { return page(ctx, flat, form) })
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Motion shader example: http://localhost:%s", port)
	log.Fatal(app.ListenAndServe("127.0.0.1:" + port))
}

func page(ctx *server.Context, flat, form engine.Config) gosx.Node {
	program := motion.NewProgram("tide-story").WithTransport(motion.TransportOptions{
		Duration: 8 * time.Second, Labels: map[string]time.Duration{"crest": 3500 * time.Millisecond},
		Scenes: []string{"#tide", "#form"},
	})
	clock := program.Playhead("clock")
	gain := program.Curve("gain", clock, []motion.CurveStop{{At: 0, Value: .35}, {At: 4, Value: .9}, {At: 8, Value: .5}}, true)
	turn := program.Map("turn", clock, 0, 8, 0, 3.14159)
	rise := program.Curve("rise", clock, []motion.CurveStop{{At: 0, Value: 16}, {At: 1.2, Value: 0}}, true)
	program.BindStyle(rise, ".hero-copy", "transform.y", "px")
	program.BindSceneNode(turn, "#form", "form", "rotation.y")
	program.BindMaterialUniform(gain, "#tide", "ribbon", "gain")
	program.BindMaterialUniform(gain, "#form", "form", "gain")
	control := func(action server.MotionTransportAction, text string) gosx.Node {
		return server.MotionControl(server.MotionControlProps{Transport: program.ID, Action: action}, gosx.Text(text))
	}
	body := ctx.Runtime().MotionScope(program, gosx.Attrs(gosx.Attr("class", "page")),
		gosx.El("header", gosx.El("a", gosx.Attrs(gosx.Attr("href", "https://gosx.m31labs.dev/docs/motion/")), gosx.Text("GoSX / Motion studies")), gosx.El("span", gosx.Text("01 — Tidal forms"))),
		gosx.El("main",
			gosx.El("section", gosx.Attrs(gosx.Attr("class", "hero")),
				ctx.Engine(flat, gosx.El("p", gosx.Text("A quiet sea of teal ribbons."))),
				gosx.El("div", gosx.Attrs(gosx.Attr("class", "hero-copy")),
					gosx.El("p", gosx.Attrs(gosx.Attr("class", "eyebrow")), gosx.Text("Go · GSX · Selena")),
					gosx.El("h1", gosx.Text("One playhead."), gosx.El("br"), gosx.Text("Any surface.")),
					gosx.El("p", gosx.Text("Light moves across a flat canvas and a sculpted form. Their material, motion and moment stay together.")),
				),
			),
			gosx.El("section", gosx.Attrs(gosx.Attr("class", "study")),
				gosx.El("div", gosx.Attrs(gosx.Attr("class", "form")), ctx.Engine(form, gosx.El("p", gosx.Text("The same ribbons, wrapped around a sphere.")))),
				gosx.El("div", gosx.Attrs(gosx.Attr("class", "study-copy")),
					gosx.El("p", gosx.Attrs(gosx.Attr("class", "eyebrow")), gosx.Text("Move through the moment")),
					gosx.El("h2", gosx.Text("Pause it. Turn it back.")),
					gosx.El("p", gosx.Text("The lettering, form and shader share absolute time. Return to the crest and see the same frame.")),
					gosx.El("div", gosx.Attrs(gosx.Attr("class", "controls"), gosx.Attr("role", "group"), gosx.Attr("aria-label", "Motion playback")),
						control(server.MotionPlay, "Play"), control(server.MotionPause, "Pause"), control(server.MotionReverse, "Reverse"),
						server.MotionControl(server.MotionControlProps{Transport: program.ID, Action: server.MotionSeek, Label: "crest"}, gosx.Text("The crest · 3.5s")),
						control(server.MotionReplay, "Back to start")),
					gosx.El("p", gosx.Attrs(gosx.Attr("class", "note")), gosx.Text("Keyboard friendly. Reduced motion respected. No application JavaScript.")),
				),
			),
		),
		gosx.El("footer", gosx.Text("Two dimensions. Three dimensions. One framework.")),
	)
	return server.HTMLDocument(&server.DocumentContext{Title: "Tidal forms — GoSX motion", Head: gosx.El("style", gosx.RawHTML(style)), Body: body})
}
