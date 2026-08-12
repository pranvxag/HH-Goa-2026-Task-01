/**
 * HH Goa 2026 — Frame library
 * -----------------------------------------------------------------------------
 * Each frame is a pure canvas drawing routine so the SAME code renders the live
 * editor preview, the picker thumbnails, and the final export — guaranteeing the
 * preview always matches the download.
 *
 * Coordinate model: every draw fn works in a square of `s` pixels.
 *   - center  = s / 2
 *   - photo   = a circle of radius `s * frame.inner`, drawn UNDERNEATH the frame
 *   - the draw fn only paints the decorative ring + art (transparent center)
 *
 * Because everything is normalized to `s`, the same routine scales from a 72px
 * thumbnail to the 1080px export.
 * -----------------------------------------------------------------------------
 */

export type Ctx = CanvasRenderingContext2D

export interface FrameDrawOpts {
  caption?: string
}

export interface FrameDef {
  id: string
  name: string
  /** photo-circle radius as a fraction of `s` (diameter = inner * 2) */
  inner: number
  /** short accent color used for the picker chip */
  chip: string
  draw: (ctx: Ctx, s: number, opts: FrameDrawOpts) => void
}

// ── Brand palette ─────────────────────────────────────────────────────────────
const GREEN = "#0B5C3B"
const GREEN_DEEP = "#073E28"
const GOLD = "#F5D122"
const PINK = "#EC1C84"
const CREAM = "#FDF6E3"
const INK = "#08150E"
const NEON_PINK = "#FF2E97"
const NEON_GREEN = "#5CFF7A"
const CYAN = "#38E0D0"
const LEAF = "#1FA463"
const SUNSET_TOP = "#FF3D8B"
const SUNSET_SUN = "#FF9E2C"

// ── Font helpers ──────────────────────────────────────────────────────────────
const serif = (s: number, f: number, weight = 900) =>
  `${weight} ${Math.round(s * f)}px "Playfair Display", Georgia, serif`
const mono = (s: number, f: number, weight = 700) =>
  `${weight} ${Math.round(s * f)}px "Space Mono", ui-monospace, monospace`

/** Load the brand fonts so canvas text renders correctly (idempotent). */
export async function ensureBrandFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return
  try {
    await Promise.all([
      document.fonts.load('900 40px "Playfair Display"'),
      document.fonts.load('700 40px "Playfair Display"'),
      document.fonts.load('700 20px "Space Mono"'),
      document.fonts.load('400 20px "Space Mono"'),
    ])
    await document.fonts.ready
  } catch {
    /* fall back to system fonts */
  }
}

// ── Low-level primitives ────────────────────────────────────────────────────

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Text laid out along a circular arc. `align` picks the top or bottom arc. */
function arcText(
  ctx: Ctx,
  str: string,
  cx: number,
  cy: number,
  radius: number,
  opts: { font: string; color: string; align?: "top" | "bottom"; spacing?: number },
) {
  const { font, color, align = "top", spacing = 0 } = opts
  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const chars = [...str]
  const widths = chars.map((c) => ctx.measureText(c).width + spacing)
  const totalAngle = widths.reduce((a, b) => a + b, 0) / radius

  if (align === "top") {
    let angle = -Math.PI / 2 - totalAngle / 2
    for (let i = 0; i < chars.length; i++) {
      const step = widths[i] / radius
      angle += step / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle + Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      angle += step / 2
    }
  } else {
    let angle = Math.PI / 2 + totalAngle / 2
    for (let i = 0; i < chars.length; i++) {
      const step = widths[i] / radius
      angle -= step / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle - Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      angle -= step / 2
    }
  }
  ctx.restore()
}

function ring(ctx: Ctx, cx: number, cy: number, r: number, w: number, color: string) {
  ctx.save()
  ctx.lineWidth = w
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function glowRing(ctx: Ctx, cx: number, cy: number, r: number, w: number, color: string, blur: number) {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  ctx.lineWidth = w
  ctx.strokeStyle = color
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function dottedArc(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  count: number,
  dot: number,
  color: string,
) {
  ctx.save()
  ctx.fillStyle = color
  for (let i = 0; i <= count; i++) {
    const a = from + ((to - from) * i) / count
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dot, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function leaf(ctx: Ctx, x: number, y: number, angle: number, len: number, wid: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.5, -wid, len, 0)
  ctx.quadraticCurveTo(len * 0.5, wid, 0, 0)
  ctx.fill()
  ctx.restore()
}

function palm(ctx: Ctx, x: number, y: number, h: number, color: string, flip = false) {
  ctx.save()
  if (flip) {
    ctx.translate(x, 0)
    ctx.scale(-1, 1)
    ctx.translate(-x, 0)
  }
  ctx.strokeStyle = color
  ctx.lineCap = "round"
  ctx.lineWidth = Math.max(2, h * 0.075)
  const topX = x + h * 0.08
  const topY = y - h
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x - h * 0.18, y - h * 0.55, topX, topY)
  ctx.stroke()
  const ups = [-1.25, -0.7, -0.2, 0.35, 0.9]
  for (const off of ups) {
    leaf(ctx, topX, topY, -Math.PI / 2 + off, h * 0.6, h * 0.16, color)
  }
  ctx.restore()
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    const a2 = a + Math.PI / 5
    ctx.lineTo(x + Math.cos(a2) * r * 0.44, y + Math.sin(a2) * r * 0.44)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function sun(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.16
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82)
    ctx.lineTo(x + Math.cos(a) * r * 1.12, y + Math.sin(a) * r * 1.12)
    ctx.stroke()
  }
  ctx.restore()
}

function flower(ctx: Ctx, x: number, y: number, r: number, petal: string, center: string) {
  ctx.save()
  ctx.translate(x, y)
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5)
    ctx.fillStyle = petal
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.85, r * 0.5, r * 0.92, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = center
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function shell(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, r * 0.14)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (let i = 0; i <= 5; i++) {
    const a = Math.PI + (i * Math.PI) / 5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(x, y, r, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function waveClump(ctx: Ctx, x: number, y: number, w: number, teal: string, foam: string) {
  ctx.save()
  ctx.fillStyle = teal
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + w * 0.35, y - w * 0.55, x + w * 0.62, y - w * 0.16)
  ctx.quadraticCurveTo(x + w * 0.85, y + w * 0.12, x + w, y + w * 0.05)
  ctx.quadraticCurveTo(x + w * 0.5, y + w * 0.4, x, y)
  ctx.fill()
  // foam curl
  ctx.strokeStyle = foam
  ctx.lineWidth = w * 0.07
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(x + w * 0.2, y - w * 0.05)
  ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.42, x + w * 0.6, y - w * 0.15)
  ctx.stroke()
  ctx.restore()
}

function pill(
  ctx: Ctx,
  cx: number,
  cy: number,
  text: string,
  o: { bg: string; fg: string; font: string; padX: number; h: number; border?: string; borderW?: number },
) {
  ctx.save()
  ctx.font = o.font
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const tw = ctx.measureText(text).width
  const w = tw + o.padX * 2
  const x = cx - w / 2
  const y = cy - o.h / 2
  ctx.fillStyle = o.bg
  roundRect(ctx, x, y, w, o.h, o.h / 2)
  ctx.fill()
  if (o.border) {
    ctx.lineWidth = o.borderW ?? 2
    ctx.strokeStyle = o.border
    roundRect(ctx, x, y, w, o.h, o.h / 2)
    ctx.stroke()
  }
  ctx.fillStyle = o.fg
  ctx.fillText(text, cx, cy + 1)
  ctx.restore()
}

function centerText(ctx: Ctx, text: string, cx: number, cy: number, font: string, color: string) {
  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

function codeGlyph(ctx: Ctx, glyph: string, x: number, y: number, size: number, color: string) {
  centerText(ctx, glyph, x, y, mono(size, 1, 700), color)
}

function circuitBand(ctx: Ctx, x: number, cy: number, h: number, color: string, dir: 1 | -1) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1.5, h * 0.012)
  const rows = 5
  for (let i = 0; i < rows; i++) {
    const y = cy - h / 2 + (h * (i + 0.5)) / rows
    const len = h * (0.12 + 0.16 * ((i * 7) % 3))
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + dir * len, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + dir * len, y, h * 0.02, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ── Shared brand bits ───────────────────────────────────────────────────────

function bottomLabel(opts: FrameDrawOpts): string {
  const c = opts.caption?.trim()
  return c ? c.toUpperCase() : "#FRAMEINGOA"
}

function titleTop(ctx: Ctx, s: number, cx: number, cy: number, radius: number, color: string) {
  arcText(ctx, "HH GOA 2026", cx, cy, radius, {
    font: serif(s, 0.072, 900),
    color,
    align: "top",
    spacing: s * 0.004,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAMES
// ═══════════════════════════════════════════════════════════════════════════

export const FRAMES: FrameDef[] = [
  // 1 ── GOA NEON ─────────────────────────────────────────────────────────────
  {
    id: "goa-neon",
    name: "Goa Neon",
    inner: 0.34,
    chip: NEON_PINK,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      glowRing(ctx, c, c, R + s * 0.02, s * 0.02, NEON_PINK, s * 0.03)
      titleTop(ctx, s, c, c, R + s * 0.08, GOLD)
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.075, {
        font: mono(s, 0.032, 700),
        color: NEON_PINK,
        align: "bottom",
        spacing: s * 0.003,
      })
      // palm bottom-left, code glyphs, star, waves, dots
      palm(ctx, s * 0.14, s * 0.72, s * 0.16, NEON_GREEN)
      codeGlyph(ctx, "</>", s * 0.11, s * 0.5, s * 0.05, NEON_PINK)
      codeGlyph(ctx, "{ }", s * 0.89, s * 0.5, s * 0.05, GOLD)
      star(ctx, s * 0.86, s * 0.2, s * 0.03, GOLD)
      // wave lines bottom-right
      ctx.save()
      ctx.strokeStyle = CYAN
      ctx.lineWidth = s * 0.008
      ctx.lineCap = "round"
      for (let i = 0; i < 3; i++) {
        const yy = s * 0.74 + i * s * 0.03
        ctx.beginPath()
        ctx.moveTo(s * 0.8, yy)
        ctx.quadraticCurveTo(s * 0.85, yy - s * 0.02, s * 0.9, yy)
        ctx.quadraticCurveTo(s * 0.95, yy + s * 0.02, s * 0.98, yy)
        ctx.stroke()
      }
      ctx.restore()
      dot(ctx, s * 0.2, s * 0.28, s * 0.012, GOLD)
      dot(ctx, s * 0.78, s * 0.74, s * 0.01, NEON_GREEN)
      dot(ctx, s * 0.24, s * 0.6, s * 0.009, NEON_PINK)
    },
  },

  // 2 ── SUNSET VIBES ───────────────────────────────────────────────────────────
  {
    id: "sunset-vibes",
    name: "Sunset Vibes",
    inner: 0.3,
    chip: SUNSET_TOP,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      // thick pink/orange gradient ring
      const band = s * 0.11
      const grad = ctx.createLinearGradient(0, c - R - band, 0, c + R + band)
      grad.addColorStop(0, SUNSET_TOP)
      grad.addColorStop(1, SUNSET_SUN)
      ring(ctx, c, c, R + band / 2, band, "")
      ctx.save()
      ctx.lineWidth = band
      ctx.strokeStyle = grad
      ctx.beginPath()
      ctx.arc(c, c, R + band / 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      // palm silhouettes over the ring bottom
      palm(ctx, s * 0.2, s * 0.82, s * 0.15, INK)
      palm(ctx, s * 0.8, s * 0.82, s * 0.15, INK, true)
      titleTop(ctx, s, c, c, R + s * 0.075, GOLD)
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.075, {
        font: mono(s, 0.03, 700),
        color: CREAM,
        align: "bottom",
        spacing: s * 0.003,
      })
      // birds
      ctx.save()
      ctx.strokeStyle = INK
      ctx.lineWidth = s * 0.006
      ctx.lineCap = "round"
      for (const [bx, by] of [
        [s * 0.32, s * 0.22],
        [s * 0.4, s * 0.18],
      ]) {
        ctx.beginPath()
        ctx.moveTo(bx - s * 0.02, by)
        ctx.quadraticCurveTo(bx, by - s * 0.015, bx + s * 0.01, by)
        ctx.quadraticCurveTo(bx + s * 0.02, by - s * 0.015, bx + s * 0.04, by)
        ctx.stroke()
      }
      ctx.restore()
    },
  },

  // 3 ── BUILDER MODE ───────────────────────────────────────────────────────────
  {
    id: "builder-mode",
    name: "Builder Mode",
    inner: 0.33,
    chip: NEON_GREEN,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      glowRing(ctx, c, c, R + s * 0.015, s * 0.016, NEON_GREEN, s * 0.028)
      titleTop(ctx, s, c, c, R + s * 0.085, NEON_GREEN)
      // action arc + hashtag
      arcText(ctx, "BUILD · CREATE · SHIP", c, c, R + s * 0.05, {
        font: mono(s, 0.026, 700),
        color: GOLD,
        align: "bottom",
        spacing: s * 0.002,
      })
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.105, {
        font: mono(s, 0.028, 700),
        color: NEON_GREEN,
        align: "bottom",
        spacing: s * 0.003,
      })
      codeGlyph(ctx, "</>", s * 0.1, s * 0.5, s * 0.05, NEON_GREEN)
      codeGlyph(ctx, "{ }", s * 0.9, s * 0.5, s * 0.05, GOLD)
      circuitBand(ctx, s * 0.12, s * 0.42, s * 0.28, NEON_GREEN, -1)
      circuitBand(ctx, s * 0.88, s * 0.42, s * 0.28, GOLD, 1)
      dot(ctx, s * 0.78, s * 0.2, s * 0.01, PINK)
      dot(ctx, s * 0.22, s * 0.72, s * 0.01, PINK)
    },
  },

  // 4 ── WAVE RIDER ─────────────────────────────────────────────────────────────
  {
    id: "wave-rider",
    name: "Wave Rider",
    inner: 0.33,
    chip: CYAN,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      ring(ctx, c, c, R + s * 0.012, s * 0.014, GOLD)
      // waves wrapping left & right
      waveClump(ctx, s * 0.02, s * 0.62, s * 0.24, CYAN, CREAM)
      waveClump(ctx, s * 0.74, s * 0.62, s * 0.24, LEAF, CREAM)
      waveClump(ctx, s * 0.06, s * 0.44, s * 0.16, LEAF, CREAM)
      waveClump(ctx, s * 0.78, s * 0.44, s * 0.16, CYAN, CREAM)
      sun(ctx, s * 0.82, s * 0.2, s * 0.05, GOLD)
      titleTop(ctx, s, c, c, R + s * 0.075, GOLD)
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.07, {
        font: mono(s, 0.03, 700),
        color: PINK,
        align: "bottom",
        spacing: s * 0.003,
      })
      dot(ctx, s * 0.2, s * 0.24, s * 0.01, CREAM)
      dot(ctx, s * 0.72, s * 0.78, s * 0.01, CREAM)
    },
  },

  // 5 ── TROPICAL ENERGY ────────────────────────────────────────────────────────
  {
    id: "tropical-energy",
    name: "Tropical Energy",
    inner: 0.33,
    chip: PINK,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      ring(ctx, c, c, R + s * 0.012, s * 0.012, GOLD)
      // leaves around ring
      const leaves = [0.15, 0.35, 0.65, 0.85, 1.15, 1.85, 2.15, 2.85]
      for (const t of leaves) {
        const a = Math.PI * t
        const lx = c + Math.cos(a) * (R + s * 0.02)
        const ly = c + Math.sin(a) * (R + s * 0.02)
        leaf(ctx, lx, ly, a, s * 0.11, s * 0.035, LEAF)
      }
      // hibiscus at 4 corners of the ring
      flower(ctx, c - R * 0.78, c - R * 0.78, s * 0.06, PINK, GOLD)
      flower(ctx, c + R * 0.82, c + R * 0.7, s * 0.07, PINK, GOLD)
      flower(ctx, c + R * 0.62, c - R * 0.85, s * 0.05, "#FF6FAE", GOLD)
      flower(ctx, c - R * 0.7, c + R * 0.82, s * 0.055, "#FF6FAE", GOLD)
      titleTop(ctx, s, c, c, R + s * 0.085, GOLD)
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.085, {
        font: mono(s, 0.03, 700),
        color: PINK,
        align: "bottom",
        spacing: s * 0.003,
      })
    },
  },

  // 6 ── EVENT PASS ─────────────────────────────────────────────────────────────
  {
    id: "event-pass",
    name: "Event Pass",
    inner: 0.28,
    chip: GOLD,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      // outer card
      const inset = s * 0.05
      ctx.save()
      ctx.lineWidth = s * 0.012
      ctx.strokeStyle = GOLD
      roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, s * 0.08)
      ctx.stroke()
      ctx.restore()
      // title (straight, top)
      centerText(ctx, "HH GOA 2026", c, s * 0.16, serif(s, 0.062, 900), GOLD)
      // pink photo ring
      ring(ctx, c, c, R + s * 0.014, s * 0.016, PINK)
      // BUILDER badge above photo
      pill(ctx, c, c - R - s * 0.02, "BUILDER", {
        bg: PINK,
        fg: CREAM,
        font: mono(s, 0.024, 700),
        padX: s * 0.03,
        h: s * 0.05,
      })
      // VERIFIED badge below photo
      pill(ctx, c, c + R + s * 0.03, "★ VERIFIED", {
        bg: GOLD,
        fg: INK,
        font: mono(s, 0.024, 700),
        padX: s * 0.03,
        h: s * 0.052,
        border: PINK,
        borderW: s * 0.006,
      })
      centerText(ctx, bottomLabel(opts), c, s * 0.9, mono(s, 0.03, 700), PINK)
      circuitBand(ctx, s * 0.12, s * 0.45, s * 0.22, GOLD, 1)
      circuitBand(ctx, s * 0.88, s * 0.45, s * 0.22, PINK, -1)
    },
  },

  // 7 ── HACKER GREEN ───────────────────────────────────────────────────────────
  {
    id: "hacker-green",
    name: "Hacker Green",
    inner: 0.33,
    chip: "#2FE06B",
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      ring(ctx, c, c, R + s * 0.012, s * 0.014, NEON_GREEN)
      titleTop(ctx, s, c, c, R + s * 0.085, NEON_GREEN)
      arcText(ctx, "BUILD THE FUTURE", c, c, R + s * 0.05, {
        font: mono(s, 0.026, 700),
        color: NEON_GREEN,
        align: "bottom",
        spacing: s * 0.002,
      })
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.105, {
        font: mono(s, 0.028, 700),
        color: PINK,
        align: "bottom",
        spacing: s * 0.003,
      })
      // binary left
      centerText(ctx, "101", s * 0.11, s * 0.4, mono(s, 0.03, 700), NEON_GREEN)
      centerText(ctx, "011", s * 0.11, s * 0.46, mono(s, 0.03, 700), NEON_GREEN)
      codeGlyph(ctx, "</>", s * 0.89, s * 0.44, s * 0.05, NEON_GREEN)
      circuitBand(ctx, s * 0.14, s * 0.62, s * 0.16, NEON_GREEN, 1)
      circuitBand(ctx, s * 0.86, s * 0.62, s * 0.16, NEON_GREEN, -1)
      dot(ctx, s * 0.8, s * 0.22, s * 0.01, GOLD)
    },
  },

  // 8 ── MINIMAL POP ────────────────────────────────────────────────────────────
  {
    id: "minimal-pop",
    name: "Minimal Pop",
    inner: 0.34,
    chip: PINK,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      ring(ctx, c, c, R + s * 0.03, s * 0.03, PINK)
      ring(ctx, c, c, R + s * 0.008, s * 0.008, GOLD)
      dottedArc(ctx, c, c, R + s * 0.075, -Math.PI * 0.85, -Math.PI * 0.15, 22, s * 0.008, GOLD)
      titleTop(ctx, s, c, c, R + s * 0.095, NEON_GREEN)
      // small waves bottom
      ctx.save()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = s * 0.008
      ctx.lineCap = "round"
      for (const bx of [0.32, 0.62]) {
        const yy = s * 0.82
        ctx.beginPath()
        ctx.moveTo(s * bx, yy)
        ctx.quadraticCurveTo(s * (bx + 0.03), yy - s * 0.02, s * (bx + 0.06), yy)
        ctx.quadraticCurveTo(s * (bx + 0.09), yy + s * 0.02, s * (bx + 0.12), yy)
        ctx.stroke()
      }
      ctx.restore()
      pill(ctx, c, c + R + s * 0.055, bottomLabel(opts), {
        bg: PINK,
        fg: CREAM,
        font: mono(s, 0.026, 700),
        padX: s * 0.035,
        h: s * 0.055,
      })
    },
  },

  // 9 ── BEACH VIBES ────────────────────────────────────────────────────────────
  {
    id: "beach-vibes",
    name: "Beach Vibes",
    inner: 0.33,
    chip: LEAF,
    draw(ctx, s, opts) {
      const c = s / 2
      const R = s * this.inner
      ring(ctx, c, c, R + s * 0.012, s * 0.014, LEAF)
      // string lights across the top
      ctx.save()
      ctx.strokeStyle = CREAM
      ctx.lineWidth = s * 0.004
      ctx.beginPath()
      ctx.moveTo(s * 0.16, s * 0.16)
      ctx.quadraticCurveTo(c, s * 0.06, s * 0.84, s * 0.16)
      ctx.stroke()
      ctx.restore()
      const bulbs = [GOLD, PINK, NEON_GREEN, GOLD, PINK, NEON_GREEN, GOLD]
      for (let i = 0; i < bulbs.length; i++) {
        const t = i / (bulbs.length - 1)
        const x = s * 0.16 + (s * 0.68) * t
        const y = s * 0.16 - Math.sin(Math.PI * t) * s * 0.1 + s * 0.02
        dot(ctx, x, y, s * 0.012, bulbs[i])
      }
      // palms bottom corners
      palm(ctx, s * 0.14, s * 0.82, s * 0.17, LEAF)
      palm(ctx, s * 0.86, s * 0.82, s * 0.17, LEAF, true)
      titleTop(ctx, s, c, c, R + s * 0.085, NEON_GREEN)
      arcText(ctx, bottomLabel(opts), c, c, R + s * 0.075, {
        font: mono(s, 0.03, 700),
        color: NEON_GREEN,
        align: "bottom",
        spacing: s * 0.003,
      })
      shell(ctx, s * 0.72, s * 0.82, s * 0.03, GOLD)
      star(ctx, s * 0.28, s * 0.8, s * 0.02, GOLD)
    },
  },
]

export function getFrame(id: string): FrameDef {
  return FRAMES.find((f) => f.id === id) ?? FRAMES[0]
}

/** Neutral placeholder photo (used only for picker thumbnails). */
export function drawPlaceholderPhoto(ctx: Ctx, s: number, R: number) {
  const c = s / 2
  const g = ctx.createLinearGradient(c - R, c - R, c + R, c + R)
  g.addColorStop(0, "#5a6b62")
  g.addColorStop(1, "#3a4a42")
  ctx.save()
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
  // simple person silhouette
  ctx.fillStyle = "rgba(0,0,0,0.28)"
  ctx.beginPath()
  ctx.arc(c, c - R * 0.15, R * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(c, c + R * 0.7, R * 0.6, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
