// Package worklet supplies GoSX's browser processor for WASM audio reactors.
// A backend supplies opaque project images and a declarative command layout;
// synthesis and image-format validation remain backend responsibilities.
package worklet

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"time"
)

const ProcessorName = "gosx-wasm-audio"

//go:embed processor.js
var source []byte

var digest = fmt.Sprintf("%x", sha256.Sum256(source))

// Path is content-addressed so a cached processor always matches the Go host.
// Mount Handler under a same-origin prefix and pass that prefix plus Path to
// HostJS.AddWorkletModule. No inline source, eval, or Blob URL is needed.
func Path() string { return "worklet/wasm-processor." + digest[:16] + ".js" }

func Source() []byte { return bytes.Clone(source) }

// Handler serves only the versioned processor, including HEAD and ETags.
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if path.Clean("/"+r.URL.Path) != "/"+Path() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("ETag", `"`+digest+`"`)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeContent(w, r, Path(), time.Time{}, bytes.NewReader(source))
	})
}

// Backend describes the gosx_audio reactor ABI without teaching the processor
// an engine's project format. ExportPrefix defaults to "gosx_audio_". Reactors
// export memory, _initialize, init(rate, maxFrames, channels), render(frames),
// out_ptr, cmd_ptr, cmd_cap, cmd_commit, msg_ptr, and msg_drain. Output is planar
// float32 with a MaxFrames stride. Commands and messages are opaque records.
// Optional capabilities returns a bit mask. SharedBank additionally requires
// bank_alloc, bank_install, bank_image_ptr, and bank_image_len; image upload uses
// project_alloc. No memory growth or allocation is needed in steady rendering.
type Backend struct {
	ExportPrefix          string             `json:"prefix,omitempty"`
	MaxFrames             int                `json:"maxFrames"`
	Channels              int                `json:"channels"`
	CommandBytes          int                `json:"commandBytes"`
	MessageBytes          int                `json:"messageBytes"`
	MessageCapacity       int                `json:"messageCapacity"`
	SupportedCapabilities uint32             `json:"supportedCapabilities"`
	SharedBank            bool               `json:"sharedBank,omitempty"`
	FaultOpcode           uint8              `json:"faultOpcode,omitempty"`
	FaultArgumentOffset   int                `json:"faultArgumentOffset,omitempty"`
	OpcodeCapabilities    []OpcodeCapability `json:"opcodeCapabilities,omitempty"`
	Transport             *Transport         `json:"transport,omitempty"`
}

type OpcodeCapability struct {
	Opcode uint8  `json:"opcode"`
	Mask   uint32 `json:"mask"`
}

// Transport enables musical-boundary image replacement. With nil Transport,
// rendering starts when initialization completes and commands stay opaque.
// Offsets address little-endian fields within each command. A replacement
// receives a seek/play pair with Target in byte 1, then queued launch commands.
type Transport struct {
	Play               uint8   `json:"play"`
	Stop               uint8   `json:"stop"`
	Seek               uint8   `json:"seek"`
	Target             uint8   `json:"target"`
	TicksPerBeat       int     `json:"ticksPerBeat"`
	TicksPerBar        int     `json:"ticksPerBar"`
	SeekBarOffset      int     `json:"seekBarOffset"`
	SeekTickOffset     int     `json:"seekTickOffset"`
	BoundaryTickOffset int     `json:"boundaryTickOffset"`
	QuantizedOpcodes   []uint8 `json:"quantizedOpcodes,omitempty"`
}

// ImageInfo is extracted and validated by the backend before image upload.
// RequiredCapabilities is checked against the actual initialized WASM module.
type ImageInfo struct {
	TempoMilli           int    `json:"tempoMilli"`
	RequiredCapabilities uint32 `json:"requiredCapabilities"`
}

func (b Backend) Validate() error {
	if b.MaxFrames < 1 || b.MaxFrames > 4096 || b.Channels < 1 || b.Channels > 8 ||
		b.CommandBytes < 1 || b.CommandBytes > 1024 || b.MessageBytes < 1 || b.MessageBytes > 1024 ||
		b.MessageCapacity < 1 || b.MessageCapacity > 4096 {
		return fmt.Errorf("audio: invalid WASM buffer layout")
	}
	if b.FaultOpcode != 0 && (b.FaultArgumentOffset < 0 || b.FaultArgumentOffset+2 > b.MessageBytes) {
		return fmt.Errorf("audio: invalid WASM fault layout")
	}
	for _, c := range b.OpcodeCapabilities {
		if c.Mask == 0 || c.Mask & ^b.SupportedCapabilities != 0 {
			return fmt.Errorf("audio: invalid WASM opcode capability")
		}
	}
	if t := b.Transport; t != nil {
		if t.Play == t.Stop || t.Play == t.Seek || t.Stop == t.Seek || t.TicksPerBeat < 1 || t.TicksPerBar < 1 || b.CommandBytes < 2 ||
			t.SeekBarOffset < 2 || t.SeekBarOffset+4 > b.CommandBytes ||
			t.SeekTickOffset < 2 || t.SeekTickOffset+4 > b.CommandBytes ||
			t.BoundaryTickOffset < 2 || t.BoundaryTickOffset+8 > b.CommandBytes {
			return fmt.Errorf("audio: invalid WASM transport layout")
		}
		if t.SeekBarOffset < t.SeekTickOffset+4 && t.SeekTickOffset < t.SeekBarOffset+4 {
			return fmt.Errorf("audio: overlapping WASM seek fields")
		}
		for _, op := range t.QuantizedOpcodes {
			if op == t.Play || op == t.Stop || op == t.Seek {
				return fmt.Errorf("audio: quantized WASM transport opcode")
			}
		}
	}
	return nil
}

func (b Backend) ValidateImage(info ImageInfo) error {
	if info.RequiredCapabilities & ^b.SupportedCapabilities != 0 || b.Transport != nil && info.TempoMilli <= 0 {
		return fmt.Errorf("audio: invalid WASM image metadata")
	}
	return nil
}

// Options converts validated Go data to a structured-cloneable object. It
// contains no executable source or engine-specific image parsing code.
func (b Backend) Options() (map[string]any, error) {
	if err := b.Validate(); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(b)
	if err != nil {
		return nil, err
	}
	var options map[string]any
	err = json.Unmarshal(raw, &options)
	return options, err
}
