package motion

import (
	"encoding/json"
	"fmt"
	"strings"
)

// SceneTransitionSource is implemented by scene.CommandTransition. The scene
// package owns the command schema; motion owns signals and their bindings.
type SceneTransitionSource interface {
	MotionTransitionJSON() ([]byte, error)
}

// SceneTransitionBinding connects absolute progress to a prepared Scene3D pose.
type SceneTransitionBinding struct {
	Signal   SignalRef       `json:"signal"`
	Selector string          `json:"selector"`
	Plan     json.RawMessage `json:"plan"`
}

// BindSceneTransition binds a typed scene.CommandTransition to progress in
// [0,1]. All commands sample the same absolute position on forward or backward
// seeks. A transport also freezes this scene's declarative shader clock.
func (p *Program) BindSceneTransition(signal SignalRef, selector string, source SceneTransitionSource) error {
	if source == nil {
		return fmt.Errorf("motion: scene transition source is required")
	}
	data, err := source.MotionTransitionJSON()
	if err != nil {
		return err
	}
	selector = strings.TrimSpace(selector)
	if selector == "" || len(selector) > 1024 {
		return fmt.Errorf("motion: scene transition requires a selector of at most 1024 bytes")
	}
	p.SceneTransitions = append(p.SceneTransitions, SceneTransitionBinding{Signal: signal, Selector: selector, Plan: append(json.RawMessage(nil), data...)})
	p.addTransitionScene(selector)
	return nil
}

func (p *Program) addTransitionScene(selector string) {
	if p.Transport == nil {
		return
	}
	for _, existing := range p.Transport.Scenes {
		if existing == selector {
			return
		}
	}
	p.Transport.Scenes = append(p.Transport.Scenes, selector)
}

func validateSceneTransitions(bindings []SceneTransitionBinding, ids map[string]struct{}) error {
	if len(bindings) > 64 {
		return fmt.Errorf("motion: at most 64 scene transition bindings are supported")
	}
	for _, binding := range bindings {
		if _, exists := ids[string(binding.Signal)]; !exists {
			return fmt.Errorf("motion: scene transition references unknown signal %q", binding.Signal)
		}
		if strings.TrimSpace(binding.Selector) == "" || len(binding.Selector) > 1024 || len(binding.Plan) > 4<<20 {
			return fmt.Errorf("motion: invalid scene transition selector or plan size")
		}
		var plan struct {
			Version int               `json:"version"`
			From    []json.RawMessage `json:"from"`
			To      []json.RawMessage `json:"to"`
		}
		if json.Unmarshal(binding.Plan, &plan) != nil || plan.Version != 1 || plan.From == nil || plan.To == nil || len(plan.From) > 10000 || len(plan.To) > 10000 {
			return fmt.Errorf("motion: scene transition requires a version 1 command plan")
		}
	}
	return nil
}
