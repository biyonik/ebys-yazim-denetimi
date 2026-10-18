"""
Kaynak görselden eklenti simgelerini üretir: assets/icons/icon-{16,32,48,128}.png

    pip install pillow
    python scripts/make-icons.py                     # depodaki kaynaklarla (assets/icons/kaynak/)
    python scripts/make-icons.py buyuk.png dar.png sade16.png

Üç kaynak, üç boyut sınıfı için:
  buyuk  → 128, 48 px  (Chrome önerisi: çevrede ~%6 şeffaf boşluk)
  dar    → 32 px       (boşluksuz kadraj: küçük boyutta her piksel değerli)
  sade16 → 16 px       (gri satırlar tek satıra iner, dalga ve rozet kalınlaşır; ayrıntılı
                        görsel 16 px'te bulanık bir lekeye dönüşür)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
K = ROOT / "assets/icons/kaynak"
paths = sys.argv[1:4] if len(sys.argv) >= 4 else [K / "simge-1024.png", K / "simge-dar-1024.png", K / "simge-16-sade.png"]
big, tight, simple = (Image.open(p).convert("RGBA") for p in paths)
for im in (big, tight, simple):
    if im.width != im.height:
        raise SystemExit(f"görsel kare değil: {im.size}")
for n in (128, 48, 32, 16):
    src = big if n >= 48 else tight if n == 32 else simple
    src.resize((n, n), Image.LANCZOS).save(ROOT / f"assets/icons/icon-{n}.png", optimize=True)
    print(f"assets/icons/icon-{n}.png")
