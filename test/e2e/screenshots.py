"""
README ekran görüntülerini üretir: docs/img/*.png

Gerçek eklenti + gerçek CKEditor 4 ile, test ortamında (kurgusal kurum adıyla) çekilir.
    npm run build:dev && python3 test/e2e/screenshots.py
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
OUT = ROOT / "docs" / "img"
PORT = 8766
URL = f"http://127.0.0.1:{PORT}/test/harness/index.html"
ED = "yeniGidenEvrakForm:ckeditorInstance_window1"

LETTER = (
    '<p style="text-align:center"><strong>T.C.</strong><br><strong>ÖRNEK KURUM BAŞKANLIĞI</strong></p>'
    "<p>İlgi yazınızla talep edilen eğitim programı Başkanlığımız’da hazırlanmış olup programın 2026da "
    "başlaması planlanmaktadır. Eğitime yanlız birim amirleri katılacak, diğer personel banada bildirilen "
    "listeye göre 2'şer kişilik gruplar hâlinde katılacaktır. Diğer birimler hala bilgilendirilmedi.</p>"
    "<p>Programın orjinal takvimi hizmet te kullanılacak salonlarla birlikte ekte sunulmuştur.</p>"
    "<p>Bilgilerinize arzederim.</p>"
)


def word_box(page, frame, word):
    box = frame.evaluate(
        """(w) => { const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
             while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) {
               const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
               const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; } }
             return null; }""",
        word,
    )
    fb = page.locator("iframe.cke_wysiwyg_frame").bounding_box()
    return fb["x"] + box["x"], fb["y"] + box["y"]


def editor_clip(page):
    """Editör + (varsa) açık balon/panel: balon editörün dışına taşabilir"""
    boxes = [page.locator(".cke_inner").bounding_box()]
    for sel in ("ebys-yazim-ui .pop", "ebys-yazim-ui .panel"):
        loc = page.locator(sel)
        if loc.count() and loc.is_visible():
            boxes.append(loc.bounding_box())
    x0 = min(b["x"] for b in boxes) - 8
    y0 = min(b["y"] for b in boxes) - 8
    x1 = max(b["x"] + b["width"] for b in boxes) + 8
    y1 = max(b["y"] + b["height"] for b in boxes) + 8
    return {"x": max(0, x0), "y": max(0, y0), "width": x1 - max(0, x0), "height": y1 - max(0, y0)}


def main():
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
            ctx = p.chromium.launch_persistent_context(
                profile, channel="chromium", headless=True, viewport={"width": 1000, "height": 660}, device_scale_factor=2,
                args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}"],
            )
            page = ctx.new_page()
            page.goto(URL)
            page.wait_for_function(f"() => window.CKEDITOR && CKEDITOR.instances['{ED}'] && CKEDITOR.instances['{ED}'].status === 'ready'")
            page.evaluate("([ed, h]) => CKEDITOR.instances[ed].setData(h)", [ED, LETTER])
            page.wait_for_function(
                "() => { const f = document.querySelector('iframe.cke_wysiwyg_frame'); const h = f && f.contentWindow.CSS.highlights.get('ebys-yazim-hata'); return h && h.size >= 5; }",
                timeout=6000,
            )
            time.sleep(0.6)
            frame = [fr for fr in page.frames if fr != page.main_frame][0]

            def shot(name, word=None, panel=False):
                page.keyboard.press("Escape")
                time.sleep(0.2)
                if word:
                    page.mouse.click(*word_box(page, frame, word))
                    page.locator("ebys-yazim-ui .pop").wait_for(state="visible", timeout=3000)
                if panel:
                    page.locator("ebys-yazim-ui .badge").click()
                time.sleep(0.4)
                page.screenshot(path=str(OUT / f"{name}.png"), clip=editor_clip(page))
                print(OUT / f"{name}.png")

            shot("balon", "banada")
            shot("kilavuz", "Başkanlığımız")
            shot("panel", panel=True)
            page.keyboard.press("Escape")

            # Konu alanı: EBYS'de editörün dışında, "Bilgileri" sekmesinde ayrı bir form alanı
            konu = page.locator("textarea.metadataKonuTextArea")
            konu.fill("eğitim programı hk.")
            pill = page.locator("ebys-yazim-konu >> .pill")
            pill.wait_for(state="visible", timeout=3000)
            pill.click()
            card = page.locator("ebys-yazim-konu >> .card")
            card.wait_for(state="visible", timeout=3000)
            time.sleep(0.3)
            boxes = [page.locator("table.bilgiler").bounding_box(), pill.bounding_box(), card.bounding_box()]
            x0 = min(b["x"] for b in boxes) - 10
            y0 = min(b["y"] for b in boxes) - 10
            x1 = max(b["x"] + b["width"] for b in boxes) + 10
            y1 = max(b["y"] + b["height"] for b in boxes) + 10
            page.screenshot(path=str(OUT / "konu.png"), clip={"x": max(0, x0), "y": max(0, y0), "width": x1 - max(0, x0), "height": y1 - max(0, y0)})
            print(OUT / "konu.png")

            ext_id = (ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")).url.split("/")[2]
            pp = ctx.new_page()
            pp.set_viewport_size({"width": 320, "height": 600})
            pp.goto(f"chrome-extension://{ext_id}/popup.html")
            h = pp.evaluate("() => document.body.scrollHeight")
            pp.screenshot(path=str(OUT / "pencere.png"), clip={"x": 0, "y": 0, "width": 320, "height": h})
            print(OUT / "pencere.png")
            ctx.close()
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
