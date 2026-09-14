#!/usr/bin/env python3
"""Generate raster JPEG demo media replicating the existing SVG designs.

Real social platforms do not accept SVG, so demo seed media must be raster
images for the publish flow to validate end-to-end. Each JPEG reproduces the
matching SVG: diagonal linear gradient, radial white glow, two translucent
circles, and two centred text lines.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = "storage/demo"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def diagonal_gradient(w, h, c0, c1):
    """Linear gradient along the top-left -> bottom-right diagonal."""
    a = np.array(c0, dtype=np.float64)
    b = np.array(c1, dtype=np.float64)
    ys, xs = np.mgrid[0:h, 0:w]
    t = ((xs / max(w - 1, 1)) + (ys / max(h - 1, 1))) / 2.0  # 0..1
    t = t[..., None]
    img = a[None, None, :] * (1 - t) + b[None, None, :] * t
    return img


def radial_glow(w, h, cx=0.5, cy=0.42, r=0.62, peak=0.28):
    """White radial glow, alpha = peak * (1 - dist/r), elliptical in pixel space."""
    ys, xs = np.mgrid[0:h, 0:w]
    nx = (xs / max(w - 1, 1) - cx) / r
    ny = (ys / max(h - 1, 1) - cy) / r
    d = np.sqrt(nx * nx + ny * ny)
    alpha = np.clip(1.0 - d, 0.0, 1.0) * peak
    return alpha[..., None]


def render(name, w, h, c0, c1, circles, line1, size1, line2, size2, quality=88):
    base = diagonal_gradient(w, h, hexrgb(c0), hexrgb(c1))
    base = base + (255.0 - base) * radial_glow(w, h)  # screen-style white glow
    base = np.clip(base, 0, 255).astype(np.uint8)
    img = Image.fromarray(base, "RGB").convert("RGBA")

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for (cx, cy, r, op) in circles:
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, int(255 * op)))
    img = Image.alpha_composite(img, overlay)

    d = ImageDraw.Draw(img)
    f1 = ImageFont.truetype(FONT_BOLD, size1)
    f2 = ImageFont.truetype(FONT_REG, size2)

    def centered(text, font, yfrac, fill):
        y = int(h * yfrac)
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        d.text(((w - tw) / 2 - bbox[0], y - th / 2 - bbox[1]), text, font=font, fill=fill)

    centered(line1, f1, 0.72, (255, 255, 255, 245))
    centered(line2, f2, 0.80, (255, 255, 255, 184))

    out = os.path.join(OUT, name)
    img.convert("RGB").save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"  {name}: {w}x{h} -> {os.path.getsize(out)//1024} KB")


def render_logo(name, size=512, bg="#7C4DFF", text="KD", quality=92):
    img = Image.new("RGB", (size, size), hexrgb(bg))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT_BOLD, int(size * 0.41))
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.02), text, font=f, fill=(255, 255, 255))
    out = os.path.join(OUT, name)
    img.save(out, "JPEG", quality=quality, optimize=True)
    print(f"  {name}: {size}x{size} -> {os.path.getsize(out)//1024} KB")


DEMO = [
    ("demo-1-square", 1600, 1600, "#7C4DFF", "#4C1D95", (800, 672, 320, 216), "AURORA SERİSİ", 120, "Yeni sezon", 60),
    ("demo-2-portrait", 1440, 1800, "#0EA5E9", "#1E3A8A", (720, 756, 288, 194), "Sonsuz Konfor", 108, "4:5 gönderi", 54),
    ("demo-3-story", 1080, 1920, "#F59E0B", "#B45309", (540, 806, 216, 145), "SON GÜN", 81, "9:16 hikaye", 41),
    ("demo-4-landscape", 1920, 1080, "#10B981", "#065F46", (960, 453, 216, 145), "Stüdyo Çekimi", 81, "16:9 video kapağı", 41),
    ("demo-5-pin", 1000, 1500, "#E1306C", "#831843", (500, 630, 200, 135), "Pin Tasarımı", 75, "2:3", 38),
]

if __name__ == "__main__":
    print("Raster demo medya üretiliyor (JPEG)...")
    for (stem, w, h, c0, c1, circ, l1, s1, l2, s2) in DEMO:
        cx, cy, r1, r2 = circ
        render(f"{stem}.jpg", w, h, c0, c1, [(cx, cy, r1, 0.14), (cx, cy, r2, 0.18)], l1, s1, l2, s2)
    render_logo("logo.jpg")
    print("Tamamlandı.")
