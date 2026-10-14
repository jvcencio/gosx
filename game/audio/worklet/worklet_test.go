package worklet

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProcessorAsset(t *testing.T) {
	data := Source()
	if len(data) > 24*1024 {
		t.Fatalf("processor exceeds 24 KiB raw budget: %d", len(data))
	}
	var compressed bytes.Buffer
	z := gzip.NewWriter(&compressed)
	_, _ = z.Write(data)
	_ = z.Close()
	if compressed.Len() > 6*1024 {
		t.Fatalf("processor exceeds 6 KiB gzip budget: %d", compressed.Len())
	}
	data[0] ^= 1
	if bytes.Equal(data, Source()) {
		t.Fatal("caller can mutate the shared processor")
	}
	h := Handler()
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/"+Path(), nil))
	if r.Code != http.StatusOK || !bytes.Equal(r.Body.Bytes(), Source()) || r.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("asset response %d %v", r.Code, r.Header())
	}
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		req := httptest.NewRequest(method, "/"+Path(), nil)
		req.Header.Set("If-None-Match", r.Header().Get("ETag"))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
			t.Fatalf("%s conditional response %d", method, rec.Code)
		}
	}
	for _, name := range []string{"processor.js", "worklet/wasm-processor.stale.js", "../worklet.go"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/"+name, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("unexpected asset %s: %d", name, rec.Code)
		}
	}
}

func TestBackendValidation(t *testing.T) {
	valid := Backend{MaxFrames: 64, Channels: 1, CommandBytes: 4, MessageBytes: 4, MessageCapacity: 8}
	if _, err := valid.Options(); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*Backend){
		func(b *Backend) { b.Channels = 0 },
		func(b *Backend) { b.MaxFrames = 4097 },
		func(b *Backend) { b.CommandBytes = 0 },
		func(b *Backend) { b.MessageCapacity = -1 },
		func(b *Backend) { b.FaultOpcode = 7; b.FaultArgumentOffset = 3 },
		func(b *Backend) { b.OpcodeCapabilities = []OpcodeCapability{{Opcode: 9, Mask: 1}} },
		func(b *Backend) { b.Transport = &Transport{Play: 1, Stop: 2, Seek: 3, TicksPerBeat: 1, TicksPerBar: 4} },
	} {
		b := valid
		change(&b)
		if _, err := b.Options(); err == nil {
			t.Fatalf("accepted invalid backend %+v", b)
		}
	}
	if err := valid.ValidateImage(ImageInfo{RequiredCapabilities: 1}); err == nil {
		t.Fatal("accepted unsupported image capability")
	}
}
