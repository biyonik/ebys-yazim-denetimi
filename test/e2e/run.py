"""
Uçtan uca test: eklenti yüklü Chromium + gerçek CKEditor 4.

Doğrulananlar:
  1. Editör keşfi ve işaretleme (Highlight API, DOM'a dokunmadan)
  2. Kaydedilen içerik (getData) eklentiden iz taşımıyor
  3. Balondan düzeltme → getData + gizli textarea güncel
  4. Geri al / yinele CKEditor'ün kendi undo'suyla çalışıyor
  5. Biçimlendirmesi bölünmüş kelimede kalınlık korunuyor
  6. setData ve kaynak modu sonrası yeniden bağlanma
  7. Hiçbir dış ağ isteği yok

Çalıştırma: npm run test:e2e
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
PORT = 8765
URL = f"http://127.0.0.1:{PORT}/test/harness/index.html"
ED = "yeniGidenEvrakForm:ckeditorInstance_window1"
SHOTS = ROOT / "test" / "e2e" / "out"
SHOTS.mkdir(parents=True, exist_ok=True)

passed, failed = 0, 0


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}")


def highlights(frame):
    return frame.evaluate(
        """() => Object.fromEntries(['hata','uyari','oneri'].map(k => {
             const h = CSS.highlights.get('ebys-yazim-' + k);
             return [k, h ? [...h].map(r => r.toString()) : []];
           }))"""
    )


def get_data(page):
    """getData() entity kodlar (&ccedil;, &#39;); karşılaştırma için çözülmüş HTML döndür."""
    return page.evaluate(
        f"() => {{ const t = document.createElement('textarea'); t.innerHTML = CKEDITOR.instances['{ED}'].getData(); return t.value; }}"
    )


def click_word(page, frame, word, nth=0):
    """iframe içindeki kelimenin ortasına gerçek fare tıklaması."""
    box = frame.evaluate(
        """([w, nth]) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n, seen = 0;
          while ((n = walker.nextNode())) {
            const i = n.data.indexOf(w);
            if (i >= 0 && seen++ === nth) {
              const r = document.createRange();
              r.setStart(n, i); r.setEnd(n, i + Math.min(w.length, n.data.length - i));
              const b = r.getBoundingClientRect();
              return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
            }
          }
          return null;
        }""",
        [word, nth],
    )
    assert box, f"kelime bulunamadı: {word}"
    fb = page.locator("iframe.cke_wysiwyg_frame").bounding_box()
    page.mouse.click(fb["x"] + box["x"], fb["y"] + box["y"])


def wait_pop(page):
    page.locator("ebys-yazim-ui .pop").wait_for(state="visible", timeout=3000)


def main():
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.8)
    external = []
    try:
        with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
            ctx = p.chromium.launch_persistent_context(
                profile,
                channel="chromium",
                headless=True,
                viewport={"width": 1000, "height": 760},
                args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}"],
            )
            page = ctx.new_page()
            page.on(
                "request",
                lambda r: external.append(r.url)
                if not r.url.startswith(("http://127.0.0.1", "data:", "about:", "chrome-extension:", "blob:"))
                else None,
            )
            console = []
            page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
            page.goto(URL)
            page.wait_for_function(f"() => window.CKEDITOR && CKEDITOR.instances['{ED}'] && CKEDITOR.instances['{ED}'].status === 'ready'")
            f = page.frames[1]
            page.wait_for_function(
                "() => { const f = document.querySelector('iframe.cke_wysiwyg_frame'); return f && f.contentWindow.CSS.highlights.size > 0; }",
                timeout=5000,
            )

            print("1) Keşif ve işaretleme")
            h = highlights(f)
            print("     hata :", h["hata"])
            print("     uyarı:", h["uyari"])
            print("     öneri:", h["oneri"])
            ok("2026da" in h["hata"], "2026da → hata")
            ok("3'de" in h["hata"], "3'de → hata")
            ok("yanlız" in h["hata"], "yanlız → hata")
            ok("orjinal" in h["hata"], "biçim bölünmüş 'or<b>jin</b>al' tek kelime olarak bulundu")
            ok("arzederim" in h["hata"], "arzederim → hata")
            ok(" ," in h["hata"], "virgül öncesi boşluk → hata")
            ok("hala" in h["uyari"], "hala → uyarı (bağlama bağlı)")
            ok("hiç bir" in h["hata"], "hiç bir → hata")
            ok("5km" in h["oneri"], "5km → öneri (tablo hücresi)")
            all_marked = h["hata"] + h["uyari"] + h["oneri"]
            ok("adet" not in all_marked, "tablo hücresi başındaki küçük harf işaretlenmedi")
            ok(not any("Sayı" in x or "Konu" in x for x in all_marked), "Sayı/Konu başlık hizalaması işaretlenmedi")
            ok(not any("yavaş" in x.lower() for x in all_marked), "ikileme (yavaş yavaş) işaretlenmedi")
            ok(not any("kurum" in x for x in all_marked), "alan adı işaretlenmedi")

            print("2) Belge temizliği")
            data = get_data(page)
            ok("ebys" not in data.lower(), "getData() eklentiden iz taşımıyor")
            body_html = f.evaluate("() => document.body.innerHTML")
            ok("ebys" not in body_html.lower(), "editör body'sine düğüm eklenmedi")
            ok(not f.evaluate("() => [...document.querySelectorAll('style')].some(s => s.textContent.includes('ebys-yazim'))")
               and f.evaluate("() => document.adoptedStyleSheets.length") >= 1, "stil <style> ile değil adoptedStyleSheets ile verildi")

            print("3) Balondan düzeltme")
            page.screenshot(path=str(SHOTS / "01-isaretleme.png"))
            click_word(page, f, "yanlız")
            wait_pop(page)
            page.screenshot(path=str(SHOTS / "02-balon.png"))
            sug = page.locator("ebys-yazim-ui .pop .sug").first
            ok(sug.inner_text() == "yalnız", "öneri: yalnız")
            sug.click()
            time.sleep(0.5)
            data = get_data(page)
            ok("yalnız birim" in data and "yanlız" not in data, "getData() düzeltilmiş metni içeriyor")
            ta = page.evaluate(f"() => {{ const t = document.createElement('textarea'); t.innerHTML = document.getElementById('{ED}').value; return t.value; }}")
            ok("yalnız birim" in ta, "gizli textarea (JSF alanı) senkron")

            print("4) Geri al / yinele")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('undo')")
            time.sleep(0.2)
            ok("yanlız birim" in get_data(page), "undo eski metne döndü")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('redo')")
            time.sleep(0.2)
            ok("yalnız birim" in get_data(page), "redo düzeltmeyi geri getirdi")

            print("5) Biçim koruma")
            time.sleep(0.5)
            click_word(page, f, "jin")
            wait_pop(page)
            page.locator("ebys-yazim-ui .pop .sug").first.click()
            time.sleep(0.4)
            data = get_data(page)
            ok("ori<b>jin</b>al" in data or "ori<strong>jin</strong>al" in data, f"kalın kısım korundu → {data[data.find('ori'):data.find('ori')+25]!r}")

            print("6) Sayı eki düzeltmesi ve sonraki soruna geçiş")
            click_word(page, f, "3'de")
            wait_pop(page)
            ok(page.locator("ebys-yazim-ui .pop .sug").first.inner_text() == "3'te", "öneri: 3'te")
            page.locator("ebys-yazim-ui .pop .sug").first.click()
            time.sleep(0.4)
            ok("saat 3'te" in get_data(page), "3'te uygulandı")
            page.locator("ebys-yazim-ui .badge").click()
            ok(page.locator("ebys-yazim-ui .pop").is_visible(), "rozet → sonraki soruna balon açtı")
            page.keyboard.press("Escape")

            print("7) Yeniden bağlanma")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].setData('<p>Bu iş yanlız yapılmaz.</p>')")
            page.wait_for_function(
                """() => { const d = document.querySelector('iframe.cke_wysiwyg_frame').contentWindow;
                           const h = d.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].some(r => r.toString() === 'yanlız') && [...h].length === 1; }""",
                timeout=4000,
            )
            ok(True, "setData sonrası yeni belge denetlendi")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('source')")
            time.sleep(0.6)
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('source')")
            page.wait_for_function(
                """() => { const f = document.querySelector('iframe.cke_wysiwyg_frame'); if (!f) return false;
                           const h = f.contentWindow.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].length === 1; }""",
                timeout=4000,
            )
            ok(True, "kaynak modundan dönüşte yeniden işaretlendi")

            print("8) Yazarken canlı denetim")
            f2 = [fr for fr in page.frames if fr != page.main_frame][0]
            click_word(page, f2, "yapılmaz")
            page.keyboard.press("End")
            page.keyboard.type(" Toplantı 2026da")
            page.wait_for_function(
                """() => { const f = document.querySelector('iframe.cke_wysiwyg_frame');
                           const h = f.contentWindow.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].some(r => r.toString() === '2026da'); }""",
                timeout=3000,
            )
            ok(True, "yazılan metin debounce sonrası denetlendi")

            print("9) Ağ")
            ok(external == [], f"dış ağ isteği yok ({len(external)})")

            errs = [c for c in console if "ebys-yazim" in c or c.startswith("error")]
            ok(not errs, f"konsolda hata yok {errs[:3]}")
            ctx.close()
    finally:
        server.terminate()

    print(f"\n{passed} geçti, {failed} kaldı")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
