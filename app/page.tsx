"use client"

/**
 * HH Goa 2026 — Frame Generator
 * -----------------------------------------------------------------------------
 * A mobile-first tool that turns an uploaded photo into a branded circular
 * profile-picture frame. The user picks one of 9 frame styles, positions their
 * photo, then downloads / shares to X.
 *
 * State machine: "upload" -> "editor" -> "result"
 *
 * Every frame is drawn by the shared canvas library in lib/frames.ts, so the
 * live preview, the picker thumbnails, and the final export are pixel-identical.
 *
 * PLACEHOLDER hooks to swap in later:
 *   - convertHeicIfNeeded(file)  -> HEIC decode (currently pass-through)
 *   - downloadImage()            -> client-side download
 *   - shareToX()                 -> navigator.share w/ Twitter intent fallback
 * -----------------------------------------------------------------------------
 */

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  FRAMES,
  getFrame,
  drawPlaceholderPhoto,
  ensureBrandFonts,
  type FrameDef,
} from "@/lib/frames"

// ── Tunables ────────────────────────────────────────────────────────────────
const EXPORT_SIZE = 1080 // final square export resolution (px)
const SHARE_TEXT = "Just built my HH Goa 2026 frame 🌴 #FrameInGoa"
const SHARE_URL = "https://hhgoa2026.example.com" // swap for the real link
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const BG = "#0B5C3B"

type AppState = "upload" | "editor" | "result"
type Transform = { x: number; y: number; scale: number }

export default function Page() {
  const [state, setState] = useState<AppState>("upload")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState("")
  const [frameId, setFrameId] = useState(FRAMES[0].id)
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  const objectUrlRef = useRef<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    const converted = await convertHeicIfNeeded(file)
    const url = URL.createObjectURL(converted)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = url
    setImageUrl(url)
    setResultUrl(null)
    setState("editor")
  }, [])

  const startOver = useCallback(() => {
    setState("upload")
    setCaption("")
    setResultUrl(null)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setImageUrl(null)
  }, [])

  return (
    <main className="goa-texture relative flex min-h-[100dvh] flex-col text-goa-cream">
      <BrandHeader />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-4">
        {state === "upload" && <UploadState onFile={handleFile} />}
        {state === "editor" && imageUrl && (
          <EditorState
            imageUrl={imageUrl}
            caption={caption}
            setCaption={setCaption}
            frameId={frameId}
            setFrameId={setFrameId}
            onGenerate={(dataUrl) => {
              setResultUrl(dataUrl)
              setState("result")
            }}
          />
        )}
        {state === "result" && resultUrl && (
          <ResultState resultUrl={resultUrl} caption={caption} onStartOver={startOver} />
        )}
      </div>

      <BrandFooter />
    </main>
  )
}

// ── Brand chrome ──────────────────────────────────────────────────────────────

function BrandHeader() {
  return (
    <header className="px-5 pt-8 pb-4 text-center">
      <p className="mb-2 inline-block rounded-full border-2 border-goa-cream bg-goa-pink px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-goa-cream">
        Profile Frame
      </p>
      <h1 className="poster-shadow-lg font-serif text-4xl font-black uppercase leading-[0.95] text-goa-gold sm:text-5xl">
        HH Goa
        <br />
        2026
      </h1>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-goa-cream/80">
        Goa, India · 28–31 Oct 2026
      </p>
    </header>
  )
}

function BrandFooter() {
  return (
    <footer className="px-5 pb-5 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-goa-cream/50">#FrameInGoa</p>
    </footer>
  )
}

// ── 1. UPLOAD STATE ───────────────────────────────────────────────────────────

function UploadState({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const pick = () => inputRef.current?.click()

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6">
      <button
        type="button"
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex aspect-square w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl border-4 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-goa-gold bg-goa-gold/10" : "border-goa-cream/40 bg-goa-green-deep/40"
        }`}
        aria-label="Upload your photo"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-goa-gold text-goa-ink">
          <UploadIcon />
        </span>
        <span className="poster-shadow font-serif text-2xl font-black uppercase text-goa-cream">
          Upload your photo
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-goa-cream/70">JPG · PNG · HEIC</span>
      </button>

      <p className="max-w-xs text-pretty text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-goa-cream/60">
        No login. Drop a photo, pick a frame, share it.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ""
        }}
      />
    </section>
  )
}

// ── 2. EDITOR STATE ─────────────────────────────────────────────────────────

const VIEWPORT = 300 // on-screen frame square (px); export is scaled from this

function EditorState({
  imageUrl,
  caption,
  setCaption,
  frameId,
  setFrameId,
  onGenerate,
}: {
  imageUrl: string
  caption: string
  setCaption: (v: string) => void
  frameId: string
  setFrameId: (id: string) => void
  onGenerate: (dataUrl: string) => void
}) {
  const frame = getFrame(frameId)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })

  // Photo-circle radius depends on the chosen frame.
  const R = VIEWPORT * frame.inner
  const disc = R * 2

  const cover = imgSize ? Math.max(disc / imgSize.w, disc / imgSize.h) : 1
  const baseW = imgSize ? imgSize.w * cover : disc
  const baseH = imgSize ? imgSize.h * cover : disc

  // Load the photo to learn its natural size.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
      setTransform({ x: 0, y: 0, scale: 1 })
    }
    img.src = imageUrl
  }, [imageUrl])

  // ── Pointer / touch gesture handling (drag + pinch) ───────────────────────
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{
    startTransform: Transform
    startCenter: { x: number; y: number }
    startDist: number
  } | null>(null)

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    beginGesture()
  }

  const beginGesture = () => {
    const pts = [...pointers.current.values()]
    if (pts.length === 0) return
    const center = averagePoint(pts)
    const dist = pts.length >= 2 ? distance(pts[0], pts[1]) : 0
    gesture.current = { startTransform: transform, startCenter: center, startDist: dist }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    const pts = [...pointers.current.values()]
    const center = averagePoint(pts)
    const dx = center.x - g.startCenter.x
    const dy = center.y - g.startCenter.y

    let scale = g.startTransform.scale
    if (pts.length >= 2 && g.startDist > 0) {
      scale = clampScale(g.startTransform.scale * (distance(pts[0], pts[1]) / g.startDist))
    }

    setTransform({ x: g.startTransform.x + dx, y: g.startTransform.y + dy, scale })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) beginGesture()
    else gesture.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setTransform((t) => ({ ...t, scale: clampScale(t.scale * (e.deltaY < 0 ? 1.08 : 0.92)) }))
  }

  const handleGenerate = async () => {
    await ensureBrandFonts()
    const dataUrl = generateFinalImage({
      img: imgRef.current,
      frame,
      viewport: VIEWPORT,
      baseW,
      baseH,
      transform,
      caption: caption.trim(),
    })
    if (dataUrl) onGenerate(dataUrl)
  }

  return (
    <section className="flex flex-1 flex-col items-center gap-4">
      {/* Frame preview: photo disc + drawn frame overlay */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="no-touch-action relative shrink-0 cursor-grab active:cursor-grabbing"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        aria-label="Drag to reposition, pinch or scroll to zoom"
      >
        {/* photo disc, clipped to the frame's inner circle */}
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden rounded-full"
          style={{ width: disc, height: disc, transform: "translate(-50%, -50%)" }}
        >
          {imgSize && (
            <img
              src={imageUrl || "/placeholder.svg"}
              alt="Your uploaded photo"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: baseW,
                height: baseH,
                transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`,
              }}
            />
          )}
        </div>

        {/* frame art drawn on canvas (transparent center) */}
        <FrameCanvas frame={frame} caption={caption} size={VIEWPORT} className="pointer-events-none absolute inset-0" />
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-goa-cream/60">
        Drag to move · pinch / scroll to zoom
      </p>

      {/* Frame picker */}
      <div className="w-full">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-goa-cream/70">
          Pick your frame
        </p>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {FRAMES.map((f) => (
            <FrameThumb key={f.id} frame={f} selected={f.id === frameId} onSelect={() => setFrameId(f.id)} />
          ))}
        </div>
      </div>

      {/* Caption input */}
      <div className="w-full">
        <label htmlFor="caption" className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-goa-cream/70">
          Caption (optional)
        </label>
        <input
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 22))}
          placeholder="@yourhandle or name"
          className="w-full rounded-xl border-2 border-goa-cream/30 bg-goa-green-deep/60 px-4 py-3 font-mono text-sm uppercase tracking-[0.1em] text-goa-cream placeholder:text-goa-cream/40 focus:border-goa-gold focus:outline-none"
        />
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-goa-cream/40">
          Leave blank to keep #FrameInGoa
        </p>
      </div>

      <div className="mt-auto w-full pt-2">
        <PrimaryButton onClick={handleGenerate}>Generate</PrimaryButton>
      </div>
    </section>
  )
}

// A live canvas that renders the given frame at `size`. Redraws on change.
function FrameCanvas({
  frame,
  caption,
  size,
  className,
}: {
  frame: FrameDef
  caption: string
  size: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const draw = () => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = size * dpr
      canvas.height = size * dpr
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      frame.draw(ctx, size, { caption: caption.trim() })
    }
    // Draw immediately, then again once brand fonts are ready.
    draw()
    ensureBrandFonts().then(() => {
      if (!cancelled) draw()
    })
    return () => {
      cancelled = true
    }
  }, [frame, caption, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className={className} aria-hidden="true" />
}

// A tappable frame thumbnail rendered with a placeholder photo.
function FrameThumb({ frame, selected, onSelect }: { frame: FrameDef; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const SIZE = 76

  useEffect(() => {
    let cancelled = false
    const draw = () => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = SIZE * dpr
      canvas.height = SIZE * dpr
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, SIZE, SIZE)
      drawPlaceholderPhoto(ctx, SIZE, SIZE * frame.inner)
      frame.draw(ctx, SIZE, {})
    }
    draw()
    ensureBrandFonts().then(() => {
      if (!cancelled) draw()
    })
    return () => {
      cancelled = true
    }
  }, [frame])

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Select ${frame.name} frame`}
      className="flex shrink-0 flex-col items-center gap-1"
    >
      <span
        className={`overflow-hidden rounded-xl border-2 transition-colors ${
          selected ? "border-goa-gold" : "border-goa-cream/20"
        }`}
      >
        <canvas ref={ref} style={{ width: 76, height: 76 }} className="block" />
      </span>
      <span
        className={`max-w-[76px] truncate font-mono text-[8px] uppercase tracking-[0.1em] ${
          selected ? "text-goa-gold" : "text-goa-cream/50"
        }`}
      >
        {frame.name}
      </span>
    </button>
  )
}

// ── 3. RESULT STATE ───────────────────────────────────────────────────────────

function ResultState({
  resultUrl,
  caption,
  onStartOver,
}: {
  resultUrl: string
  caption: string
  onStartOver: () => void
}) {
  return (
    <section className="flex flex-1 flex-col items-center gap-6">
      <div className="w-full max-w-xs overflow-hidden rounded-2xl border-4 border-goa-gold shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resultUrl || "/placeholder.svg"} alt="Your finished HH Goa 2026 frame" className="block w-full" />
      </div>

      <div className="mt-auto flex w-full flex-col gap-3 pt-2">
        <PrimaryButton onClick={() => downloadImage(resultUrl)}>Download</PrimaryButton>
        <SecondaryButton onClick={() => shareToX(resultUrl, caption)}>Share to X</SecondaryButton>
        <button
          type="button"
          onClick={onStartOver}
          className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-goa-cream/70 underline underline-offset-4 hover:text-goa-gold"
        >
          Start over
        </button>
      </div>
    </section>
  )
}

// ── Buttons ────────────────────────────────────────────────────────────────────

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border-2 border-goa-ink bg-goa-gold px-6 py-4 font-serif text-xl font-black uppercase tracking-wide text-goa-ink shadow-[4px_4px_0_0_var(--goa-ink)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border-2 border-goa-ink bg-goa-pink px-6 py-4 font-serif text-xl font-black uppercase tracking-wide text-goa-cream shadow-[4px_4px_0_0_var(--goa-ink)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
    >
      {children}
    </button>
  )
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLACEHOLDER / SWAP-IN LOGIC
// ═════════════════════════════════════════════════════════════════════════════

/** PLACEHOLDER: HEIC conversion. Wire in a real decoder later. Pass-through now. */
async function convertHeicIfNeeded(file: File): Promise<File> {
  return file
}

/**
 * Composite the final image on a Canvas and return a PNG data URL.
 * Order: brand bg -> photo (clipped to the frame's inner circle) -> frame art.
 * Mirrors the on-screen transform exactly, scaled up to EXPORT_SIZE.
 */
function generateFinalImage({
  img,
  frame,
  viewport,
  baseW,
  baseH,
  transform,
  caption,
}: {
  img: HTMLImageElement | null
  frame: FrameDef
  viewport: number
  baseW: number
  baseH: number
  transform: Transform
  caption: string
}): string | null {
  if (!img) return null

  const E = EXPORT_SIZE
  const r = E / viewport // screen -> export scale
  const canvas = document.createElement("canvas")
  canvas.width = E
  canvas.height = E
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Brand background fills the square corners.
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, E, E)

  // Clip to the frame's inner circle and draw the transformed photo.
  const R = E * frame.inner
  ctx.save()
  ctx.beginPath()
  ctx.arc(E / 2, E / 2, R, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  const drawW = baseW * transform.scale * r
  const drawH = baseH * transform.scale * r
  const cx = E / 2 + transform.x * r
  const cy = E / 2 + transform.y * r
  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH)
  ctx.restore()

  // Draw the frame art on top.
  frame.draw(ctx, E, { caption })

  return canvas.toDataURL("image/png")
}

/** Trigger a client-side download of the composited PNG. */
function downloadImage(dataUrl: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = "hh-goa-2026-frame.png"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Share to X: native share sheet with the image first, then intent fallback. */
async function shareToX(dataUrl: string, caption: string) {
  const text = caption ? `${SHARE_TEXT} — ${caption}` : SHARE_TEXT
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], "hh-goa-2026-frame.png", { type: "image/png" })
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text, url: SHARE_URL })
      return
    }
  } catch {
    // fall through to intent URL
  }
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`
  window.open(intent, "_blank", "noopener,noreferrer")
}

// ── Geometry helpers ────────────────────────────────────────────────────────
function averagePoint(pts: { x: number; y: number }[]) {
  const n = pts.length
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
