package docs

import (
	"sync"

	"m31labs.dev/gosx/examples/gosx-docs/internal/beachgen"
	"m31labs.dev/gosx/scene"
)

// BlackglassViewUpdate changes presentation without replacing the live world,
// its vessel transforms, collected objects, or the pocket emulator.
type BlackglassViewUpdate struct {
	View     string          `json:"view"`
	Period   string          `json:"period"`
	Label    string          `json:"label"`
	Camera   scene.IRCamera  `json:"camera"`
	Commands []scene.Command `json:"commands"`
}

var blackglassViewOnce sync.Once
var blackglassViewPeriods map[string]scene.SceneIR

func BlackglassBeachViewUpdate(viewID, fromPeriod, periodID string) BlackglassViewUpdate {
	view, period := blackglassBeachViewFor(viewID), blackglassBeachPeriodFor(periodID)
	blackglassViewOnce.Do(func() {
		blackglassViewPeriods = make(map[string]scene.SceneIR, len(beachgen.Periods))
		for _, id := range beachgen.Periods {
			blackglassViewPeriods[id] = BlackglassBeachProgram("shore", id).SceneIR()
		}
	})
	before := blackglassViewPeriods[blackglassBeachPeriodFor(fromPeriod).ID]
	after := blackglassViewPeriods[period.ID]
	// The ship and island models are identical in every lighting preset. Diff
	// only the authored light, atmosphere, beacon, and grotto presentation.
	commands := scene.DiffCommands(before, after)
	if commands == nil {
		commands = []scene.Command{}
	}
	camera := scene.PerspectiveCamera{Position: view.Position, Rotation: blackglassBeachLookRotation(view.Position, view.Target), FOV: 50, PortraitFOV: 70, Near: .1, Far: 900}
	if view.ID == "pools" {
		camera.PortraitFOV = 95
	}
	return BlackglassViewUpdate{View: view.ID, Period: period.ID, Label: "Blackglass Beach — " + view.Name + " at " + period.Name, Camera: scene.CameraIR(camera), Commands: commands}
}
