#!/usr/bin/env python3
"""Genera el logo de Hymns STT (micrófono + ondas sobre cuadrado redondeado azul) en todos los formatos.

Requiere Pillow (en un venv: python3 -m venv v && v/bin/pip install pillow). En macOS usa `iconutil` para el .icns.
Salida en packaging/icons/: icon.png (512), icon.ico (Windows), icon.icns (macOS).
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "icons"
BIG = 2048  # se dibuja grande y se reduce (antialiasing)


def gradient(size, top, bottom):
    g = Image.new("RGBA", (size, size))
    px = g.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = c
    return g


def draw_logo(margin_ratio):
    """Cuadrado redondeado (margen para macOS o a sangre para Windows) con el micrófono dentro."""
    s = BIG
    m = round(s * margin_ratio)
    box = (m, m, s - m, s - m)
    side = s - 2 * m
    radius = round(side * 0.225)

    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    img.paste(gradient(s, (124, 154, 255), (58, 80, 222)), (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    soft = (255, 255, 255, 150)
    u = side / 1000.0  # unidad: 1/1000 del lado
    cx = s / 2
    top = m + 170 * u  # parte alta del micrófono

    def px(v):
        return v * u

    # Cuerpo de la cápsula
    bw, bh = px(250), px(400)
    d.rounded_rectangle((cx - bw / 2, top, cx + bw / 2, top + bh), radius=bw / 2, fill=white)

    # Soporte en U alrededor de la cápsula
    sw = px(46)
    ur = px(200)  # radio del arco
    ucy = top + bh - px(20)  # centro del arco
    d.arc((cx - ur, ucy - ur, cx + ur, ucy + ur), start=0, end=180, fill=white, width=round(sw))
    # extremos redondeados del arco
    for sx in (cx - ur + sw / 2, cx + ur - sw / 2):
        d.ellipse((sx - sw / 2, ucy - sw / 2, sx + sw / 2, ucy + sw / 2), fill=white)

    # Pie
    stem_top = ucy + ur
    stem_bot = stem_top + px(70)
    d.rectangle((cx - sw / 2, stem_top - sw / 2, cx + sw / 2, stem_bot), fill=white)
    d.rounded_rectangle((cx - px(120), stem_bot - sw / 2, cx + px(120), stem_bot + sw / 2), radius=sw / 2, fill=white)

    # Ondas de sonido a los lados (el "live" del streaming)
    wcy = top + bh * 0.42
    for i, (r, a) in enumerate(((px(290), 38), (px(380), 38))):
        col = white if i == 0 else soft
        w = round(px(38))
        for sgn in (-1, 1):
            box_w = (cx - r, wcy - r, cx + r, wcy + r)
            start, end = (180 - a, 180 + a) if sgn < 0 else (-a, a)
            d.arc(box_w, start=start, end=end, fill=col, width=w)
            for ang in (start, end):  # puntas redondeadas
                rad = math.radians(ang)
                ex = cx + (r - w / 2) * math.cos(rad)
                ey = wcy + (r - w / 2) * math.sin(rad)
                d.ellipse((ex - w / 2, ey - w / 2, ex + w / 2, ey + w / 2), fill=col)
    return img


def resized(img, n):
    return img.resize((n, n), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    mac = draw_logo(0.098)  # margen estilo macOS
    win = draw_logo(0.02)  # casi a sangre: se ve mejor a 16-32 px

    resized(win, 512).save(OUT / "icon.png")
    win.save(OUT / "icon.ico", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])

    iconset = OUT / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    for n in (16, 32, 128, 256, 512):
        resized(mac, n).save(iconset / f"icon_{n}x{n}.png")
        resized(mac, n * 2).save(iconset / f"icon_{n}x{n}@2x.png")
    if sys.platform == "darwin":
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(OUT / "icon.icns")], check=True)
    for f in iconset.iterdir():
        f.unlink()
    iconset.rmdir()
    print("Iconos en", OUT)


if __name__ == "__main__":
    main()
