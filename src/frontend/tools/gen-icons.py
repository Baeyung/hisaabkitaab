"""Regenerate the khata icon set from one geometry, in brand pine.

Usage: python3 tools/gen-icons.py public

Keep the ratios here in sync with shared/brand-mark/brand-mark.ts — that SVG is
the same drawing on a 24-unit grid.

The art is three flat rectangles (two pages + an amber band across each), so it
is cheaper and crisper to draw it than to resample a PNG. Ratios are lifted
from the original 512px icon so the maskable safe zone is unchanged.
"""
import struct
import zlib

FIELD = (0x1F, 0x5C, 0x4D)  # --kg-brand-solid
PAGE = (0xF7, 0xF4, 0xEE)  # --kg-paper
BAND = (0xC9, 0x8A, 0x2B)  # --kg-amber

# (page_x, page_w, page_y, page_h, band_y, band_h, gutter) as fractions of the box.
MASKABLE = (154 / 512, 94 / 512, 143 / 512, 226 / 512, 174 / 512, 31 / 512, 16 / 512)
# Tighter crop for tab-sized renders, matching the inline SVG mark's 24-unit grid.
TIGHT = (3.4 / 24, 8 / 24, 2.5 / 24, 19 / 24, 5.1 / 24, 2.6 / 24, 1.2 / 24)


def render(size, geom):
    px, pw, py, ph, by, bh, gut = geom
    x1, w = round(px * size), round(pw * size)
    x2 = x1 + w + round(gut * size)
    y, h = round(py * size), round(ph * size)
    by, bh = round(by * size), max(1, round(bh * size))
    rows = [bytearray(FIELD * size) for _ in range(size)]
    for row_y in range(y, y + h):
        color = BAND if by <= row_y < by + bh else PAGE
        for x0 in (x1, x2):
            rows[row_y][x0 * 3 : (x0 + w) * 3] = bytes(color) * w
    return rows


def png(size, geom):
    raw = b"".join(b"\0" + bytes(r) for r in render(size, geom))
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico(sizes):
    """ICO with PNG payloads — supported by every browser that still ships."""
    images = [png(s, TIGHT) for s in sizes]
    offset = 6 + 16 * len(sizes)
    header = struct.pack("<HHH", 0, 1, len(sizes))
    entries, blobs = b"", b""
    for s, img in zip(sizes, images):
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(img), offset)
        offset += len(img)
        blobs += img
    return header + entries + blobs


if __name__ == "__main__":
    import sys

    out = sys.argv[1].rstrip("/")
    for name, size in (("icon-192", 192), ("icon-512", 512), ("apple-touch-icon", 180)):
        open(f"{out}/icons/{name}.png", "wb").write(png(size, MASKABLE))
    open(f"{out}/favicon.ico", "wb").write(ico([16, 32, 48]))
    print("wrote icons + favicon.ico")
