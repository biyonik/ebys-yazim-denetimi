"""
Kaynak PDF'lerden atıf → sayfa dizinini üretir: src/core/ref-index.ts

Yalnızca PDF'ler değiştiğinde çalıştırılır (sonuç depoda hazırdır):
    pip install pymupdf
    python scripts/build-ref-index.py

Kılavuz:    "13.6.3. Bağlaç Olan da/de'nin Yazımı" gibi başlıklar → PDF sayfası
Yönetmelik: "MADDE 16- … (4) …" → madde ve fıkranın başladığı PDF sayfası; "ÖRNEK 3" → sayfa
"""
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
KILAVUZ = ROOT / "assets/kaynak/kilavuz-2023.pdf"
YONETMELIK = ROOT / "assets/kaynak/yonetmelik-2646.pdf"
OUT = ROOT / "src/core/ref-index.ts"

# Başlık satırı otomatik bulunamayan ya da metin içi bir sayıyla karışan bölümler (elle doğrulandı)
KILAVUZ_OVERRIDES = {"1": 9, "14": 59, "15": 67, "25": 88, "27.1": 92, "29": 98}
KILAVUZ_TOC_PAGES = 6  # içindekiler: başlıklar burada da geçer
BOOK_PAGE_OFFSET = 4  # kitaptaki sayfa numarası + 4 = PDF sayfası


def kilavuz_sections():
    doc = pymupdf.open(KILAVUZ)
    secs = {}
    for i, page in enumerate(doc):
        if i < KILAVUZ_TOC_PAGES:
            continue
        for line in page.get_text().split("\n"):
            m = re.match(r"^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.{2,})$", line)
            if not m or "...." in m.group(2) or not re.match(r"^[A-ZÇĞİÖŞÜ“\"]", m.group(2)):
                continue
            top = int(m.group(1).split(".")[0])
            if top > 32:
                continue
            secs.setdefault(m.group(1), i + 1)
    secs.update(KILAVUZ_OVERRIDES)
    # Başlığı yanlışlıkla metin içinden yakalanmış üst bölümleri ele: alt bölümünden sonra gelemez
    for k in list(secs):
        subs = [v for s, v in secs.items() if s.startswith(k + ".")]
        if subs and secs[k] > min(subs) and k not in KILAVUZ_OVERRIDES:
            secs[k] = min(subs)
    return dict(sorted(secs.items(), key=lambda kv: [int(x) for x in kv[0].split(".")])), len(doc)


def yonetmelik_articles():
    doc = pymupdf.open(YONETMELIK)
    texts = [p.get_text() for p in doc]
    arts, examples = {}, {}
    current = None
    for i, t in enumerate(texts):
        # Sayfa içinde sırayla: madde başlıkları ve fıkra numaraları
        for m in re.finditer(r"MADDE\s+(\d+)\s*[-–]|\((\d{1,2})\)\s|ÖRNEK\s+(\d+)", t):
            if m.group(1):
                current = m.group(1)
                arts.setdefault(current, i + 1)
                arts.setdefault(f"{current}(1)", i + 1)
            elif m.group(2) and current:
                arts.setdefault(f"{current}({m.group(2)})", i + 1)
            elif m.group(3):
                examples.setdefault(m.group(3), i + 1)
                current = None
    return arts, examples, len(doc)


secs, kpages = kilavuz_sections()
arts, examples, ypages = yonetmelik_articles()
OUT.write_text(
    "// OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: scripts/build-ref-index.py\n"
    "/** Kılavuz (Ocak 2023) bölüm numarası → PDF sayfası */\n"
    f"export const KILAVUZ_SECTIONS: Readonly<Record<string, number>> = {json.dumps(secs, ensure_ascii=False)};\n"
    f"export const KILAVUZ_PAGES = {kpages};\n"
    f"export const KILAVUZ_BOOK_OFFSET = {BOOK_PAGE_OFFSET};\n"
    "/** Yönetmelik madde ve fıkrası ('16', '16(4)') → PDF sayfası */\n"
    f"export const YONETMELIK_ARTICLES: Readonly<Record<string, number>> = {json.dumps(arts)};\n"
    "/** Yönetmelik eki örnek yazılar → PDF sayfası */\n"
    f"export const YONETMELIK_EXAMPLES: Readonly<Record<string, number>> = {json.dumps(examples)};\n"
    f"export const YONETMELIK_PAGES = {ypages};\n",
    encoding="utf-8",
)
print(f"{OUT.relative_to(ROOT)}: {len(secs)} bölüm, {len(arts)} madde/fıkra, {len(examples)} örnek")
