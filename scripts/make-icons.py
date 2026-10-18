"""
Kaynak görselden eklenti simgelerini üretir: assets/icons/icon-{16,32,48,128}.png

    pip install pillow
    python scripts/make-icons.py kaynak.png [kucuk-boyut-kaynagi.png]

Kaynak kare ve en az 512 px olmalı (tercihen 1024, şeffaf arka plan). 16 ve 32 px için
sadeleştirilmiş ikinci bir görsel verilirse küçük boyutlar ondan üretilir: büyük görselin
ince ayrıntıları 16 px'te bulanık bir lekeye dönüşür.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
big = Image.open(sys.argv[1]).convert("RGBA")
small = Image.open(sys.argv[2]).convert("RGBA") if len(sys.argv) > 2 else big
if big.width != big.height:
    raise SystemExit(f"görsel kare değil: {big.size}")
for n in (128, 48, 32, 16):
    src = small if n <= 32 else big
    src.resize((n, n), Image.LANCZOS).save(ROOT / f"assets/icons/icon-{n}.png", optimize=True)
    print(f"assets/icons/icon-{n}.png")
