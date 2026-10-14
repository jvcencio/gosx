package main

import (
	"strings"
	"testing"

	"m31labs.dev/gosx/scene"
	"m31labs.dev/selena"
)

func TestSelenaCloudSurfaceLinksBothBackends(t *testing.T) {
	result, err := selena.Compile(scene.SelenaCloudSource, selena.CompileOptions{
		Targets: []selena.Target{selena.TargetGLSL, selena.TargetWGSL},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Artifacts) != 2 {
		t.Fatalf("expected two cloud backends, got %d", len(result.Artifacts))
	}
	for _, artifact := range result.Artifacts {
		wgsl := artifact.Target == selena.TargetWGSL
		source := artifact.Fragment
		if wgsl {
			source = artifact.Source
		}
		linked, err := cloudLibrary(source, wgsl)
		if err != nil {
			t.Fatalf("%s: %v", artifact.Target, err)
		}
		if !strings.Contains(linked, "gosxCloudSurface(") || !strings.Contains(linked, "fwidth(") {
			t.Fatalf("%s lost the cloud surface or derivative filtering", artifact.Target)
		}
		if strings.Contains(linked, "u.") || strings.Contains(linked, "gl_FragColor") {
			t.Fatalf("%s retained entry-point state", artifact.Target)
		}
	}
}

func TestSelenaCloudLinkRejectsChangedEntryPoint(t *testing.T) {
	for _, wgsl := range []bool{false, true} {
		if _, err := cloudLibrary("void changed() {}", wgsl); err == nil {
			t.Fatal("changed shader ABI must fail the build")
		}
	}
}
