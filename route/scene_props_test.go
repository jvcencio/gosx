package route

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"m31labs.dev/gosx"
	"m31labs.dev/gosx/scene"
)

func TestScene3DTypedPropsRetainSceneWhenAddingChildren(t *testing.T) {
	path := filepath.Join(t.TempDir(), "page.gsx")
	source := `package docs
func Page() Node {
 return <Scene3D {...data.scene}>
  <Mesh id="child" />
 </Scene3D>
}
`
	if err := os.WriteFile(path, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	ctx := &RouteContext{Data: map[string]any{"scene": scene.Props{Graph: scene.NewGraph(scene.Mesh{ID: "typed", Geometry: scene.BoxGeometry{}})}}}
	if _, err := DefaultFileRenderer(ctx, FilePage{FilePath: path, Pattern: "/"}); err != nil {
		t.Fatal(err)
	}
	head := gosx.RenderHTML(ctx.Runtime().Head())
	for _, id := range []string{`"id":"typed"`, `"id":"child"`} {
		if !strings.Contains(head, id) {
			t.Fatalf("missing %s after merge", id)
		}
	}
}
