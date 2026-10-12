// Generates Wadzzo splash art (light + dark) from the app icon's W.
// Usage: swift scripts/gen-splash.swift assets/icon.png assets/brand <previewDir>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let iconPath = args[1], outDir = args[2], previewDir = args[3]
let S = 1200 // canvas px (square); shown at imageWidth pt
let C = CGFloat(S) / 2

typealias RGB = (CGFloat, CGFloat, CGFloat)
struct Theme {
  let name: String; let bg: RGB; let mark: RGB; let accent: RGB; let ring: RGB
  let glow: CGFloat; let ringA: CGFloat; let drops: [RGB]
}
func c(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> RGB { (r / 255, g / 255, b / 255) }
let themes = [
  Theme(name: "light", bg: c(244, 248, 245), mark: c(58, 168, 50), accent: c(22, 108, 19), ring: c(22, 108, 19),
        glow: 0.10, ringA: 1.0, drops: [c(12, 107, 151), c(122, 45, 190), c(142, 94, 11), c(184, 30, 128)]),
  Theme(name: "dark", bg: c(10, 18, 14), mark: c(76, 214, 62), accent: c(108, 246, 81), ring: c(63, 216, 49),
        glow: 0.26, ringA: 1.0, drops: [c(44, 202, 242), c(173, 97, 239), c(251, 186, 35), c(246, 81, 191)]),
]

// ── Cut the W out of the icon: green on white → green with alpha ──
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: iconPath) as CFURL, nil)!
let icon = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let crop = CGRect(x: 226, y: 244, width: 566, height: 548) // W only, inside the icon's frame line
let wSrc = icon.cropping(to: crop)!
let ww = wSrc.width, wh = wSrc.height
var px = [UInt8](repeating: 0, count: ww * wh * 4)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let rd = CGContext(data: &px, width: ww, height: wh, bitsPerComponent: 8, bytesPerRow: ww * 4, space: cs,
                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
rd.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
rd.fill(CGRect(x: 0, y: 0, width: ww, height: wh))
rd.draw(wSrc, in: CGRect(x: 0, y: 0, width: ww, height: wh))
// Alpha from the red channel: the brand green's red is ~80, white is 255.
var alpha = [UInt8](repeating: 0, count: ww * wh)
for i in 0..<(ww * wh) {
  let r = CGFloat(px[i * 4]); let a = max(0, min(1, (255 - r) / (255 - 80)))
  alpha[i] = UInt8((a * 255).rounded())
}
let maskProvider = CGDataProvider(data: Data(alpha) as CFData)!
let wMask = CGImage(width: ww, height: wh, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: ww,
                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                    provider: maskProvider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)!

func color(_ t: RGB, _ a: CGFloat = 1) -> CGColor { CGColor(colorSpace: cs, components: [t.0, t.1, t.2, a])! }

func render(_ t: Theme, withBackground: Bool) -> CGImage {
  let ctx = CGContext(data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setAllowsAntialiasing(true); ctx.setShouldAntialias(true); ctx.interpolationQuality = .high
  if withBackground { ctx.setFillColor(color(t.bg)); ctx.fill(CGRect(x: 0, y: 0, width: S, height: S)) }

  // Glow behind the mark.
  let glow = CGGradient(colorsSpace: cs, colors: [color(t.ring, t.glow), color(t.ring, t.glow * 0.45), color(t.ring, 0)] as CFArray,
                        locations: [0, 0.45, 1])!
  ctx.drawRadialGradient(glow, startCenter: CGPoint(x: C, y: C), startRadius: 0, endCenter: CGPoint(x: C, y: C), endRadius: 470, options: [])

  // Sonar rings (the map puck's pulse), fading outward; the middle one dashed.
  let rings: [(CGFloat, CGFloat, CGFloat, [CGFloat])] = [(318, 4, 0.30, []), (420, 3, 0.20, [14, 16]), (512, 3, 0.11, [])]
  for (r, w, a, dash) in rings {
    ctx.setStrokeColor(color(t.ring, a * t.ringA)); ctx.setLineWidth(w); ctx.setLineDash(phase: 0, lengths: dash)
    ctx.strokeEllipse(in: CGRect(x: C - r, y: C - r, width: r * 2, height: r * 2))
  }
  ctx.setLineDash(phase: 0, lengths: [])

  // Compass bezel: a tick every 6°, longer every 30°, north marked.
  ctx.setLineCap(.round)
  for i in 0..<60 {
    let deg = CGFloat(i) * 6; let major = i % 5 == 0
    let a = (90 - deg) * .pi / 180
    let r0: CGFloat = major ? 548 : 556, r1: CGFloat = 572
    ctx.setStrokeColor(color(t.ring, major ? 0.42 : 0.18)); ctx.setLineWidth(major ? 4 : 2.5)
    ctx.move(to: CGPoint(x: C + cos(a) * r0, y: C + sin(a) * r0)); ctx.addLine(to: CGPoint(x: C + cos(a) * r1, y: C + sin(a) * r1))
    ctx.strokePath()
  }
  // North pointer (top): a small solid chevron just inside the bezel.
  ctx.setFillColor(color(t.accent))
  ctx.move(to: CGPoint(x: C, y: C + 536)); ctx.addLine(to: CGPoint(x: C - 15, y: C + 508)); ctx.addLine(to: CGPoint(x: C + 15, y: C + 508))
  ctx.closePath(); ctx.fillPath()

  // Drops found on the radar: one per rarity, sitting on the dashed ring.
  let angles: [CGFloat] = [38, 148, 222, 318]
  for (i, deg) in angles.enumerated() {
    let a = deg * .pi / 180; let p = CGPoint(x: C + cos(a) * 420, y: C + sin(a) * 420); let col = t.drops[i]
    ctx.setFillColor(color(col, 0.18)); ctx.fillEllipse(in: CGRect(x: p.x - 24, y: p.y - 24, width: 48, height: 48))
    ctx.setFillColor(color(col)); ctx.fillEllipse(in: CGRect(x: p.x - 11, y: p.y - 11, width: 22, height: 22))
    ctx.setStrokeColor(color(t.bg)); ctx.setLineWidth(4); ctx.strokeEllipse(in: CGRect(x: p.x - 11, y: p.y - 11, width: 22, height: 22))
  }

  // AR viewfinder brackets around the mark.
  let h: CGFloat = 262, arm: CGFloat = 92, rad: CGFloat = 30
  ctx.setStrokeColor(color(t.accent)); ctx.setLineWidth(13); ctx.setLineCap(.round); ctx.setLineJoin(.round)
  for (sx, sy) in [(-1.0, 1.0), (1.0, 1.0), (1.0, -1.0), (-1.0, -1.0)] as [(CGFloat, CGFloat)] {
    let corner = CGPoint(x: C + sx * h, y: C + sy * h)
    ctx.move(to: CGPoint(x: corner.x, y: corner.y - sy * arm))
    ctx.addArc(tangent1End: corner, tangent2End: CGPoint(x: corner.x - sx * arm, y: corner.y), radius: rad)
    ctx.addLine(to: CGPoint(x: corner.x - sx * arm, y: corner.y))
    ctx.strokePath()
  }

  // Scanline: a soft beam across the viewfinder, below the mark.
  let beam = CGGradient(colorsSpace: cs, colors: [color(t.accent, 0), color(t.accent, 0.55), color(t.accent, 0)] as CFArray, locations: [0, 0.5, 1])!
  ctx.saveGState(); ctx.clip(to: CGRect(x: C - 220, y: C - 212, width: 440, height: 3))
  ctx.drawLinearGradient(beam, start: CGPoint(x: C - 220, y: 0), end: CGPoint(x: C + 220, y: 0), options: []); ctx.restoreGState()

  // The W, recoloured, centred with a touch of optical lift.
  let scale: CGFloat = 0.66
  let wr = CGRect(x: C - CGFloat(ww) * scale / 2 + 6, y: C - CGFloat(wh) * scale / 2 + 12, width: CGFloat(ww) * scale, height: CGFloat(wh) * scale)
  ctx.saveGState(); ctx.clip(to: wr, mask: wMask); ctx.setFillColor(color(t.mark)); ctx.fill(wr); ctx.restoreGState()

  return ctx.makeImage()!
}

func write(_ img: CGImage, _ path: String) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
  print("wrote", path)
}

for t in themes {
  write(render(t, withBackground: false), "\(outDir)/splash-\(t.name).png")
  write(render(t, withBackground: true), "\(previewDir)/preview-\(t.name).png")
}
