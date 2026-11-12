"""Cut animation frames out of the green-screen sheets, remove the green, and
align them so the character stays planted between frames.

Usage (from the project root):  python tools/process_frames.py
Outputs go to app/assets/frames/ and app/assets/icon.*
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
OUT = ROOT / "app" / "assets"
FRAMES_OUT = OUT / "frames"

# Output canvas for every frame; the character's feet sit on BASELINE.
CANVAS_W, CANVAS_H = 320, 580
TARGET_H = 530  # character height (head to shoes) in the reference frame
BASELINE = 568
INSET = 5  # pixels trimmed from each panel edge to drop the white grid lines

SHEETS = {
    # name: (file, column x-ranges, row y-ranges)
    "s12": (
        "frames-12-greenscreen.png",
        [(1, 255), (257, 511), (513, 767), (769, 1023)],
        [(1, 511), (513, 1023), (1025, 1535)],
    ),
    "s6": (
        "frames-6-greenscreen.png",
        [(5, 313), (318, 625), (630, 937)],
        [(5, 833), (839, 1667)],
    ),
}

# Which panels (1-based, row by row) make up each animation. Panels 2, 5 and 6
# of s12 and panel 2 of s6 are skipped: their motion-blurred hands were painted
# green-yellow by the generator and can't be keyed cleanly.
ANIMATIONS = {
    "reminder": ("s12", [1, 3, 4, 7, 8, 9, 10, 11, 12]),
    "drank": ("s6", [5, 6]),
    "snooze": ("s12", [3, 4]),
}


def chroma_key(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)
    # Soft matte: fully opaque below 15 green excess, fully clear above 55.
    alpha = np.clip(1 - (spill - 15) / 40, 0, 1)
    # Despill: on green-tinted pixels (motion-blurred hands, hair edges) pull
    # green down to the red/blue average so they read as skin, not olive.
    g = np.where(spill > 0, np.minimum(g, (r + b) / 2), g)
    out = np.dstack([r, g, b, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def panels(sheet_key):
    file, cols, rows = SHEETS[sheet_key]
    sheet = Image.open(SRC / file)
    result = []
    for y0, y1 in rows:
        for x0, x1 in cols:
            box = (x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET)
            result.append(chroma_key(sheet.crop(box)))
    return result


def bbox(img):
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(alpha > 128)
    return xs.min(), ys.min(), xs.max(), ys.max()


def feet_center_x(img):
    """Horizontal centre of the shoes, so frames stay planted on the ground."""
    alpha = np.asarray(img)[..., 3]
    _, _, _, y1 = bbox(img)
    band = alpha[max(0, y1 - 25) : y1 + 1] > 128
    xs = np.nonzero(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2


def place(img, scale):
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    _, _, _, y1 = bbox(img)
    cx = feet_center_x(img)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    canvas.alpha_composite(img, (round(CANVAS_W / 2 - cx), round(BASELINE - y1)))
    return canvas


def main():
    FRAMES_OUT.mkdir(parents=True, exist_ok=True)
    cache = {}
    for name, (sheet_key, indices) in ANIMATIONS.items():
        if sheet_key not in cache:
            ps = panels(sheet_key)
            _, ry0, _, ry1 = bbox(ps[0])  # panel 1 is the neutral standing pose
            cache[sheet_key] = (ps, TARGET_H / (ry1 - ry0))
        ps, scale = cache[sheet_key]
        for n, idx in enumerate(indices, 1):
            place(ps[idx - 1], scale).save(FRAMES_OUT / f"{name}_{n:02d}.png", optimize=True)
        print(f"{name}: {len(indices)} frames")

    # App / tray icon from the face close-up.
    face = Image.open(SRC / "poses" / "12-face-closeup.png").convert("RGBA")
    side = min(face.size)
    face = face.crop((0, 0, side, side))
    mask = Image.new("L", face.size, 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
    face.putalpha(mask)
    face.resize((256, 256), Image.LANCZOS).save(OUT / "icon.png")
    face.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icons written")


if __name__ == "__main__":
    main()
