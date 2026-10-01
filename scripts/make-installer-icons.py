"""Draw the Windows installer and uninstaller icons from the app icon.

Each icon is the app icon with a round badge in the bottom-right corner: a
green down-arrow for the installer, a red cross for the uninstaller. A thin
transparent ring is cut around the badge so it doesn't run into the artwork.

Run from the project root after changing src-tauri/icons/icon.png:

    python scripts/make-installer-icons.py            # writes the two .ico files
    python scripts/make-installer-icons.py --preview  # also writes a preview PNG

Needs Python 3 and Pillow (pip install pillow).
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
SIZES = [16, 24, 32, 48, 64, 128, 256]

GREEN = (22, 163, 92)  # installer badge
RED = (224, 64, 72)  # uninstaller badge
GLYPH = (255, 255, 255)  # same white as the checklist in the app icon

# Badge layout as fractions of the icon's width. Small sizes get a slightly
# bigger badge and a wider gap so they stay readable. (16 px ignores the
# stroke; see PIXEL_GLYPHS.)
LAYOUT = {
    #     diameter, glyph stroke (of diameter), gap
    "large": (0.45, 0.13, 0.025),
    32: (0.50, 0.16, 0.035),
    24: (0.54, 0.13, 0.045),
    16: (0.56, 0.18, 0.065),
}

SUPERSAMPLE = 2048  # badges are drawn this big, then shrunk

# At 16 px a shrunken arrow or cross smears into a blob, so those two glyphs
# are placed pixel by pixel instead: (x, y) offsets from the badge's centre
# pixel. The badge there is 9 px across.
PIXEL_GLYPHS = {
    "arrow": [(0, -3), (0, -2), (0, -1), (0, 0), (0, 1), (0, 2), (0, 3),
              (-2, 1), (-1, 2), (1, 2), (2, 1)],
    "cross": [(-2, -2), (-1, -1), (0, 0), (1, 1), (2, 2),
              (2, -2), (1, -1), (-1, 1), (-2, 2)],
}


def layout(size):
    return LAYOUT.get(size, LAYOUT["large"])


def draw_badge(size, colour, glyph):
    """Return (badge layer, cut-out mask) at `size` pixels."""
    diameter, stroke, gap = layout(size)
    big = SUPERSAMPLE
    scale = big / size
    if size <= 32:
        # Odd whole-pixel diameter, flush with the corner, so the badge's
        # centre falls on a pixel centre and the glyph stays symmetrical.
        px = round(diameter * size) // 2 * 2 + 1
        d = px * scale
        cx = cy = big - d / 2
    else:
        d = diameter * big
        # Sit the badge in the corner, just inside the canvas edge.
        cx = cy = big - d / 2 - 0.01 * big
    r = d / 2

    badge = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour + (255,))

    w = round(stroke * d)
    if size == 16:
        pass  # glyph added after shrinking, below
    elif glyph == "arrow":
        top, bottom, wing = cy - 0.27 * d, cy + 0.25 * d, 0.22 * d
        line(draw, (cx, top), (cx, bottom), w)
        line(draw, (cx - wing, bottom - wing), (cx, bottom), w)
        line(draw, (cx + wing, bottom - wing), (cx, bottom), w)
    else:
        arm = 0.19 * d
        line(draw, (cx - arm, cy - arm), (cx + arm, cy + arm), w)
        line(draw, (cx - arm, cy + arm), (cx + arm, cy - arm), w)

    cut = Image.new("L", (big, big), 0)
    g = r + gap * big
    ImageDraw.Draw(cut).ellipse((cx - g, cy - g, cx + g, cy + g), fill=255)

    badge = badge.resize((size, size), Image.LANCZOS)
    if size == 16:
        centre = int(cx / scale)
        for dx, dy in PIXEL_GLYPHS[glyph]:
            badge.putpixel((centre + dx, centre + dy), GLYPH + (255,))
    return badge, cut.resize((size, size), Image.LANCZOS)


def line(draw, a, b, width):
    """A straight stroke with round ends."""
    draw.line([a, b], fill=GLYPH + (255,), width=width)
    for x, y in (a, b):
        h = width / 2
        draw.ellipse((x - h, y - h, x + h, y + h), fill=GLYPH + (255,))


def build(source, colour, glyph):
    frames = []
    for size in SIZES:
        base = source.resize((size, size), Image.LANCZOS)
        badge, cut = draw_badge(size, colour, glyph)
        # Clear the artwork under the badge and its gap: alpha * (1 - cut).
        alpha = ImageChops.multiply(base.getchannel("A"), ImageChops.invert(cut))
        base.putalpha(alpha)
        frames.append(Image.alpha_composite(base, badge))
    return frames


def save_ico(frames, path):
    largest = frames[-1]
    largest.save(
        path,
        format="ICO",
        sizes=[f.size for f in frames],
        append_images=frames[:-1],
    )


def preview(sets, path):
    """App icon, installer and uninstaller at 16 and 32 px, on light and dark.

    Each icon is shown at its real size, with a 4x enlargement beside it so
    the individual pixels can be judged.
    """
    zoom = 4
    cell_w, cell_h = 32 + 32 * zoom + 48, 32 * zoom + 32
    backgrounds = [(246, 246, 244), (32, 33, 38)]
    sheet = Image.new("RGB", (cell_w * len(sets) * 2, cell_h * len(backgrounds)))
    for row, bg in enumerate(backgrounds):
        for col, frames in enumerate(sets):
            for k, size in enumerate((16, 32)):
                tile = Image.new("RGB", (cell_w, cell_h), bg)
                icon = frames[SIZES.index(size)]
                y = (cell_h - size) // 2
                tile.paste(icon, (16, y), icon)
                big = icon.resize((size * zoom, size * zoom), Image.NEAREST)
                y = (cell_h - size * zoom) // 2
                tile.paste(big, (32 + 32, y), big)
                sheet.paste(tile, ((col * 2 + k) * cell_w, row * cell_h))
    sheet.save(path)


def main():
    source = Image.open(ICONS / "icon.png").convert("RGBA")
    installer = build(source, GREEN, "arrow")
    uninstaller = build(source, RED, "cross")
    save_ico(installer, ICONS / "installer.ico")
    save_ico(uninstaller, ICONS / "uninstaller.ico")
    print("wrote", ICONS / "installer.ico")
    print("wrote", ICONS / "uninstaller.ico")

    if "--preview" in sys.argv:
        app = [source.resize((s, s), Image.LANCZOS) for s in SIZES]
        out = ROOT / ".agents" / "scratch" / "installer-icons-preview.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        preview([app, installer, uninstaller], out)
        print("wrote", out)


if __name__ == "__main__":
    main()
