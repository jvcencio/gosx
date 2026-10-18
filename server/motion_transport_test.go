package server

import (
	"strings"
	"testing"
	"time"

	"m31labs.dev/gosx"
	"m31labs.dev/gosx/motion"
)

func TestMotionTransportRequiresOnlyItsOptionalFeature(t *testing.T) {
	app := New()
	app.Page("GET /motion", func(ctx *Context) gosx.Node {
		program := motion.NewProgram("story").WithTransport(motion.TransportOptions{Duration: 2 * time.Second})
		return ctx.Runtime().MotionScope(program, gosx.El("h1", gosx.Text("Readable without animation")))
	})
	app.Page("GET /plain", func(ctx *Context) gosx.Node {
		return ctx.Runtime().MotionScope(motion.NewProgram("plain"), gosx.Text("Ordinary motion"))
	})
	contract := renderDocumentContract(t, app.Build(), "/motion")
	if !strings.Contains(contract, `"bootstrapFeatureMotionTransportPath":"/gosx/bootstrap-feature-motion-transport.js"`) {
		t.Fatalf("missing optional transport chunk: %s", contract)
	}
	if strings.Contains(renderDocumentContract(t, app.Build(), "/plain"), "MotionTransportPath") {
		t.Fatal("ordinary motion must not load transport code")
	}
}

func TestMotionControlIsSemanticAndSafeBeforeEnhancement(t *testing.T) {
	html := gosx.RenderHTML(MotionControl(MotionControlProps{Transport: "story", Action: MotionSeek, Label: "arrival"}, gosx.Text("Arrival")))
	for _, want := range []string{`<button`, `type="button"`, `disabled`, `data-gosx-transport="story"`, `data-gosx-transport-action="seek"`, `data-gosx-transport-label="arrival"`, `Arrival</button>`} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q: %s", want, html)
		}
	}
}
