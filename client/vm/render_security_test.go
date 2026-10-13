package vm

import (
	"testing"

	"m31labs.dev/gosx/island/program"
)

func TestIslandDOMUpdatesKeepURLAndNameFiltering(t *testing.T) {
	machine := NewVM(progFromExprs([]program.Expr{{Op: program.OpLitString, Value: "javascript:example", Type: program.TypeString}}), nil)
	attrs := []program.Attr{{Kind: program.AttrStatic, Name: "x y", Value: "value"}, {Kind: program.AttrStatic, Name: "onclick", Value: "example"}, {Kind: program.AttrStatic, Name: "style", Value: "color:red"}, {Kind: program.AttrEvent, Name: "onClick", Event: "handle"}}
	for _, name := range []string{"href", "src", "action", "formaction", "xlink:href", "poster"} {
		attrs = append(attrs, program.Attr{Kind: program.AttrStatic, Name: name, Value: "java\nscript:example"})
	}
	resolved, dom, events, _, _ := machine.resolveElementAttrs(attrs)
	if len(resolved) != 7 || len(events) != 1 || len(dom) != 9 {
		t.Fatalf("resolved=%#v DOM=%#v events=%#v", resolved, dom, events)
	}
	for _, attr := range resolved {
		if attr.Name != "style" && attr.Value != "#" {
			t.Fatalf("unsafe DOM URL: %#v", attr)
		}
	}
	dynamic, _, _, _, _ := machine.resolveElementAttrs([]program.Attr{{Kind: program.AttrExpr, Name: "href", Expr: 0}})
	if len(dynamic) != 1 || dynamic[0].Value != "#" {
		t.Fatalf("unsafe bound URL: %#v", dynamic)
	}
	before := &ResolvedTree{Nodes: []ResolvedNode{{Tag: "a", Attrs: []ResolvedAttr{{Name: "href", Value: "/safe"}}}}}
	after := &ResolvedTree{Nodes: []ResolvedNode{{Tag: "a", Attrs: resolved, DOMAttrs: dom, Events: events}}}
	for _, op := range ReconcileTrees(before, after, nil) {
		if op.Kind == PatchSetAttr && op.AttrName == "href" && op.Text != "#" {
			t.Fatalf("unsafe URL in browser patch: %#v", op)
		}
	}
}

func TestIslandDOMUpdatesRejectReservedDispatchAttrs(t *testing.T) {
	machine := NewVM(progFromExprs([]program.Expr{{Op: program.OpLitString, Value: "evil", Type: program.TypeString}}), nil)
	var attrs []program.Attr
	for _, name := range []string{"data-gosx-handler", "data-gosx-path", "data-gosx-on-click", "DATA-GOSX-ON-INPUT", "data-gosx-on-"} {
		for _, kind := range []program.AttrKind{program.AttrStatic, program.AttrExpr, program.AttrBool} {
			attrs = append(attrs, program.Attr{Kind: kind, Name: name, Value: "evil", Expr: 0})
		}
	}
	attrs = append(attrs, program.Attr{Kind: program.AttrStatic, Name: "data-gosx-link", Value: "true"}, program.Attr{Kind: program.AttrEvent, Name: "onClick", Event: "real"})
	resolved, dom, events, _, _ := machine.resolveElementAttrs(attrs)
	if len(resolved) != 1 || len(dom) != 3 || len(events) != 1 {
		t.Fatalf("authored markers survived: resolved=%+v DOM=%+v events=%+v", resolved, dom, events)
	}
	for _, attr := range dom {
		if attr.Value == "evil" {
			t.Fatalf("authored marker leaked: %+v", attr)
		}
	}
}

func TestReconcileReservedAttrsUsesOnlyGeneratedDispatch(t *testing.T) {
	before := &ResolvedTree{Nodes: []ResolvedNode{{Tag: "button"}}}
	after := &ResolvedTree{Nodes: []ResolvedNode{{Tag: "button", Attrs: []ResolvedAttr{
		{Name: "data-gosx-handler", Value: "evil"}, {Name: "data-gosx-path", Value: "9"}, {Name: "DATA-GOSX-ON-INPUT", Value: "evil"},
	}, Events: []ResolvedEvent{{Name: "onClick", Handler: "real"}}}}}
	ops := ReconcileTrees(before, after, nil)
	if len(ops) != 2 {
		t.Fatalf("expected only generated click markers: %+v", ops)
	}
	for _, op := range ops {
		if op.Kind != PatchSetDispatch || op.Text != "real" {
			t.Fatalf("unsafe dispatch patch: %+v", op)
		}
	}
	for _, op := range ReconcileTrees(after, before, nil) {
		if op.Kind != PatchRemoveDispatch {
			t.Fatalf("expected generated dispatch removal: %+v", op)
		}
	}
	after.Nodes[0].DOMAttrs = nil
	after.Nodes[0].Events = nil
	if ops := ReconcileTrees(before, after, nil); len(ops) != 0 {
		t.Fatalf("eventless authored markers leaked: %+v", ops)
	}
}
