#!/usr/bin/env python3
"""Punch black skies but keep every plate on the same 764×1024 frame."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/Users/supertail/.cursor/projects/Users-supertail-Desktop-kage-inspired-kerala/assets")
DEST = Path("/Users/supertail/Desktop/kage inspired kerala/public/assets/kerala-temple")
FRAME = (764, 1024)
# Far edge of the pond courtyard, as a fraction of plate height.
POND_EDGE = 0.252
# Bottom of the gopuram's plinth; everything below is painted apron.
GOPURAM_FEET = 0.875

JOBS = [
    {"src": "02._Moon-41e0d452-e842-40cb-87b8-8594c16e4606.png", "dst": "background/moon.webp", "mode": "edges", "hard": 14, "soft": 28},
    {"src": "01._western_ghats-0a5bff36-76c9-4993-ba1f-0f0acdba6b37.png", "dst": "background/western-ghats.webp", "mode": "top", "hard": 10, "soft": 22},
    {"src": "04._Kerala_tropical_vegetation-7a67a1ac-de2f-4fe9-b251-bff8f27e846c.png", "dst": "background/distant-vegetation.webp", "mode": "edges", "hard": 10, "soft": 20},
    {"src": "05._Kerala_temple_Gopuram-94929fb1-11c9-4515-a682-d16be345cf97.png", "dst": "architecture/gopuram.webp", "mode": "edges", "hard": 12, "soft": 24},
    {"src": "06._Kerala_temple_Nalambalam-e81e98fa-0720-4dce-aa94-ba9b460624ac.png", "dst": "architecture/nalambalam.webp", "mode": "top", "hard": 10, "soft": 22},
    {"src": "07._temple_courtyard_floor-1a0ea917-f538-4f77-8a10-5e98d1fb3089.png", "dst": "architecture/courtyard-floor.webp", "mode": "courtyard"},
    {"src": "Pond_and_coutyard_-6d286383-f25d-446a-a5cc-f381173833d5.jpg", "dst": "foreground/temple-pond.webp", "mode": "pond"},
]


def luminance(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def warmth(rgb):
    return np.clip(rgb[..., 0] - rgb[..., 2], 0, 255)


def connected_from_seeds(mask, seeds):
    try:
        from scipy import ndimage

        labeled, _ = ndimage.label(mask, structure=np.ones((3, 3)))
        labels = set(int(v) for v in np.unique(labeled[seeds]))
        labels.discard(0)
        return np.isin(labeled, list(labels)) if labels else np.zeros_like(mask, dtype=bool)
    except ImportError:
        h, w = mask.shape
        out = np.zeros_like(mask, dtype=bool)
        if seeds[0].any():
            for x in range(w):
                for y in range(h):
                    if not mask[y, x]:
                        break
                    out[y, x] = True
        return out


def seed_mask(mask, mode):
    seeds = np.zeros_like(mask, dtype=bool)
    if mode in ("top", "edges"):
        seeds[0] = mask[0]
    if mode == "edges":
        seeds[-1] = mask[-1]
        seeds[:, 0] = mask[:, 0]
        seeds[:, -1] = mask[:, -1]
    return seeds


def key_black(rgb, mode, hard=12, soft=24):
    lum = luminance(rgb)
    hard_mask = lum <= hard
    connected = connected_from_seeds(hard_mask, seed_mask(hard_mask, mode))
    fade = np.clip((lum - hard) / max(soft - hard, 1), 0, 1)
    alpha = np.where(connected, 0, np.where(lum <= soft, fade * 255, 255))
    return np.clip(alpha, 0, 255).astype(np.uint8)


def key_pond(rgb):
    """Punch the top black void. The courtyard edge stays a hard line — the
    gopuram's plinth lands on it, and a feather there leaks sky through."""
    h, w = rgb.shape[:2]
    alpha = np.zeros((h, w), np.float32)
    alpha[int(h * POND_EDGE):] = 255
    return alpha.astype(np.uint8)


POND_WIDE = (2389, 1024)  # 21:9 — fills a pulled-back 1.6 frame without growing taller


def widen_pond(rgba, size=POND_WIDE):
    """Grow the courtyard sideways. The well stays in the centre; wings are
    tiled from the stone strips beside it, then sink into night at the rim so
    a landscape opening does not read as a pasted rectangle.
    """
    src = rgba.astype(np.float32)
    h, w = src.shape[:2]
    out_w = size[0]
    out = np.zeros((h, out_w, 4), np.float32)
    x0 = (out_w - w) // 2
    out[:, x0 : x0 + w] = src

    left_donor = src[:, 56:136]
    right_donor = src[:, 628:708]
    dw = left_donor.shape[1]

    def fill_wing(dest_start, dest_end, donor, from_right):
        width = dest_end - dest_start
        cursor = 0
        flip = True
        tile_i = 0
        while cursor < width:
            tile = donor[:, ::-1].copy() if flip else donor.copy()
            fade = 0.92 - 0.08 * (tile_i % 3)
            tile[..., :3] *= fade
            tile[..., 2] *= 1.03
            take = min(dw, width - cursor)
            if from_right:
                x = dest_end - cursor - take
                src_col = dw - take if flip else 0
                out[:, x : x + take] = tile[:, src_col : src_col + take]
            else:
                x = dest_start + cursor
                src_col = 0
                out[:, x : x + take] = tile[:, src_col : src_col + take]
            cursor += take
            flip = not flip
            tile_i += 1

    fill_wing(0, x0, left_donor, from_right=True)
    fill_wing(x0 + w, out_w, right_donor, from_right=False)

    # Soften the two joins so the original plate edge does not print.
    seam = 28
    t = np.linspace(0, 1, seam, dtype=np.float32)[None, :, None]
    out[:, x0 : x0 + seam] = out[:, x0 - seam : x0] * (1 - t) + out[:, x0 : x0 + seam] * t
    out[:, x0 + w - seam : x0 + w] = (
        out[:, x0 + w - seam : x0 + w] * (1 - t) + out[:, x0 + w : x0 + w + seam] * t
    )

    # Outer 28% of each wing falls into night — no hard plate edge.
    wing = x0
    edge = int(wing * 0.28)
    if edge > 0:
        u = np.linspace(1, 0, edge, dtype=np.float32)
        fall = (u**1.35)[None, :, None]
        out[:, :edge, :3] *= fall
        out[:, :edge, 3] *= np.clip(u**0.7, 0.15, 1)[None, :]
        out[:, out_w - edge :, :3] *= fall[:, ::-1]
        out[:, out_w - edge :, 3] *= np.clip(u[::-1] ** 0.7, 0.15, 1)[None, :]

    out[: int(h * POND_EDGE), :, 3] = 0
    return np.clip(out, 0, 255).astype(np.uint8)


def dissolve_near_edge(rgba, from_frac=0.90):
    """The near rim sits off-frame at rest but swings into view as the camera
    rises. Sink it into shadow so the plate edge never reads as a cut."""
    arr = rgba.copy()
    h = arr.shape[0]
    start = int(h * from_frac)
    t = np.clip((np.arange(h) - start) / (h - start), 0, 1)[:, None]
    arr[..., 3] = np.clip(arr[..., 3].astype(np.float32) * (1 - t**1.4), 0, 255)
    arr[..., :3] = np.clip(arr[..., :3].astype(np.float32) * (1 - 0.85 * t**1.2)[..., None], 0, 255)
    return arr.astype(np.uint8)


def gopuram_apron(gopuram_rgba, pond_rgb):
    """Paving under the temple, borrowed from the pond's own courtyard.

    The pond plate is closer to the lens, so it slides out from under the
    building as the camera pushes in. Without this the temple ends up standing
    over open sky. Fades to black at the plate edge for the same reason as
    dissolve_near_edge.
    """
    arr = gopuram_rgba.copy()
    h, w = arr.shape[:2]
    feet = int(h * GOPURAM_FEET)
    span = h - feet

    band = pond_rgb[int(h * POND_EDGE) : int(h * (POND_EDGE + 0.082))]
    apron = np.asarray(
        Image.fromarray(band.astype(np.uint8)).resize((w, span), Image.Resampling.LANCZOS)
    ).astype(np.float32)

    d = (np.arange(span) / span)[:, None, None]
    apron *= 0.62 + 0.20 * d          # recedes behind the pond's own paving
    apron[..., 2] *= 1.04             # ...and cools off
    apron *= 1 - 0.42 * np.exp(-d * span / 13.0)   # contact shadow at the plinth
    apron *= np.clip(1.35 - 1.45 * d**1.6, 0.03, 1.35)

    arr[feet:, :, :3] = np.clip(apron, 0, 255).astype(np.uint8)
    arr[feet:, :, 3] = 255
    return arr


def door_interior(rgba):
    """The doorway is cut clean through the plate. Nothing is left standing
    behind the gopuram any more, so that hole shows raw sky — and the walk now
    ends inside it. Fill whatever gap the silhouette encloses with an interior
    dark enough to read as depth rather than as a cut-out.
    """
    arr = rgba.astype(np.float32).copy()
    h, w = arr.shape[:2]
    clear = arr[..., 3] < 8
    border = np.zeros_like(clear)
    border[0], border[-1] = clear[0], clear[-1]
    border[:, 0], border[:, -1] = clear[:, 0], clear[:, -1]
    holes = clear & ~connected_from_seeds(clear, border)
    if not holes.any():
        return rgba.astype(np.uint8)

    rows = np.where(holes.any(1))[0]
    top, bottom = rows.min(), rows.max()
    depth = np.clip((np.arange(h) - top) / max(bottom - top, 1), 0, 1)[:, None] ** 2.2
    # Near black at the lintel, a breath of lamplight where the floor would be.
    for channel, (base, gain) in enumerate(((6, 13), (7, 10), (10, 6))):
        plane = np.broadcast_to(base + gain * depth, (h, w))
        arr[..., channel][holes] = plane[holes]
    arr[..., 3][holes] = 255
    return np.clip(arr, 0, 255).astype(np.uint8)


def key_courtyard(rgb):
    h, w = rgb.shape[:2]
    lum = luminance(rgb)
    heat = warmth(rgb)
    y = np.linspace(0, 1, h)[:, None]
    lamps = heat > 26
    alpha = np.full((h, w), 255, np.float32)
    fog = y < 0.28
    dusk = (y >= 0.28) & (y < 0.48)
    dark = lum < 48
    alpha = np.where(fog & dark & ~lamps, 0, alpha)
    alpha = np.where(fog & ~dark, np.clip((lum - 16) / 40 * 160, 0, 160), alpha)
    t = np.clip((y - 0.28) / 0.2, 0, 1)
    alpha = np.where(dusk, np.maximum(alpha * t, np.where(lamps, 255, 50)), alpha)
    alpha = np.where(y >= 0.48, 255, alpha)
    alpha = np.where(lamps, 255, alpha)
    return alpha.astype(np.uint8)


def to_frame(image):
    if image.size != FRAME:
        canvas = Image.new("RGBA", FRAME, (0, 0, 0, 0))
        canvas.paste(image, ((FRAME[0] - image.size[0]) // 2, (FRAME[1] - image.size[1]) // 2))
        return canvas
    return image


def main():
    for job in JOBS:
        src = Image.open(ROOT / job["src"]).convert("RGB").resize(FRAME, Image.Resampling.LANCZOS)
        rgb = np.asarray(src).astype(np.float32)
        if job["mode"] == "courtyard":
            alpha = key_courtyard(rgb)
        elif job["mode"] == "pond":
            alpha = key_pond(rgb)
        else:
            alpha = key_black(rgb, job["mode"], job["hard"], job["soft"])
        rgba = np.dstack((np.asarray(src), alpha))
        if job["mode"] == "pond":
            rgba = dissolve_near_edge(rgba)
        dest = DEST / job["dst"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        image = to_frame(Image.fromarray(rgba))
        image.save(dest, "WEBP", lossless=True, method=6)
        a = np.array(image.split()[-1])
        print(f"{dest.name:28} {image.size[0]}×{image.size[1]}  transparent={(a == 0).mean():.0%}")

    # The live gopuram is the hand-cut PNG, not the webp above.
    gopuram = DEST / "architecture/gopuram.png"
    plate = np.asarray(Image.open(gopuram).convert("RGBA"))
    plate = door_interior(plate)
    plate[int(plate.shape[0] * GOPURAM_FEET) :, :, 3] = 0
    Image.fromarray(plate).save(gopuram)
    print(f"{gopuram.name:28} doorway filled, no courtyard apron")


if __name__ == "__main__":
    main()
