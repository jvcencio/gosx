package beachgen

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"math"
)

// WakeFoam paints branching foam with a turbulent center and two feathered
// arms. Transparent gaps leave the moving ocean visible; V ages the trail.
func WakeFoam() ([]byte, error) {
	img := image.NewNRGBA(image.Rect(0, 0, 128, 128))
	noise := newNoise(Seed)
	for y := 0; y < 128; y++ {
		for x := 0; x < 128; x++ {
			u, v := float64(x)/127, float64(y)/127
			warp := u + .018*noise.fbm(u*14, v*32, 3) + .008*math.Sin(v*75+u*20)
			band := func(center, width float64) float64 { return math.Exp(-math.Pow((warp-center)/width, 2)) }
			arms := band(.12+.04*v, .04) + band(.88-.04*v, .04)
			churn := band(.5, .09+.035*v)
			lace := clamp(.35+1.8*noise.fbm(u*65, v*50, 3), 0, 1)
			crest := math.Pow(math.Max(0, math.Cos(v*105+noise.value(u*18, v*20)*6)), 3)
			alpha := math.Pow(math.Sin(u*math.Pi), .4) * math.Pow(1-v, 1.25)
			alpha *= arms*(.35+.55*lace+.25*crest) + churn*(.2+.65*lace+.2*crest)
			img.SetNRGBA(x, y, color.NRGBA{R: 239, G: 245, B: 238, A: uint8(clamp(alpha, 0, 1) * 255)})
		}
	}
	var out bytes.Buffer
	err := png.Encode(&out, img)
	return out.Bytes(), err
}
