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
            ok(page.locator("ebys-yazim-ui .panel").is_visible(), "rozet → sorun paneli açıldı")
            page.locator("ebys-yazim-ui .panel .item").first.click()
            ok(page.locator("ebys-yazim-ui .pop").is_visible(), "panelden seçilen sorunun balonu açıldı")
            ok(not page.locator("ebys-yazim-ui .panel").is_visible(), "seçimden sonra panel kapandı")
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

            print("9) Gerçek EBYS örneği: bağlaç, özel ad, sayı")
            sample = "orjinal Ahmetin banada ona da 3te 5te"
            # Kullanıcının EBYS'de yazdığı içerikle birebir aynı biçim: tek <p>
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].setData('<p>{sample}</p>')")
            page.wait_for_function(
                """() => { const f = document.querySelector('iframe.cke_wysiwyg_frame');
                           const h = f && f.contentWindow.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].length === 5; }""",
                timeout=4000,
            )
            f3 = [fr for fr in page.frames if fr != page.main_frame][0]
            marked = highlights(f3)["hata"]
            ok(marked == ["orjinal", "Ahmetin", "banada", "3te", "5te"], f"5 hata işaretlendi: {marked}")
            ok("ona da" not in " ".join(marked), "doğru yazılmış 'ona da' işaretlenmedi")
            for word, fix in [("banada", "bana da"), ("Ahmetin", "Ahmet'in"), ("orjinal", "Orijinal")]:
                click_word(page, f3, word)
                wait_pop(page)
                btn = page.locator("ebys-yazim-ui .pop .sug").first
                ok(btn.inner_text() == fix, f"öneri: {word} → {fix}")
                btn.click()
                time.sleep(0.45)
            final = get_data(page)
            ok("Orijinal Ahmet'in bana da ona da 3te 5te" in final, f"düzeltilmiş metin: {final.strip()!r}")
            page.screenshot(path=str(SHOTS / "03-ebys-ornek.png"))

            print("10) Tümünü düzelt")
            LONG = ("orjinal evrakların Ahmetin masasında olduğunu bende biliyorum ama Balıkesir Valiliği'ne "
                    "gönderilecek yazının saat 3de hazır olması gerekiyormu bilmiyorum , yanlız Mehmetten gelen "
                    "bilgiye göre toplantı 2026da Ankarada yapılacak ve ve herkez katılacak.Bilgilerinize arzederim.")
            FIXED = ("Orijinal evrakların Ahmet'in masasında olduğunu bende biliyorum ama Balıkesir Valiliğine "
                     "gönderilecek yazının saat 3'te hazır olması gerekiyor mu bilmiyorum, yalnız Mehmet'ten gelen "
                     "bilgiye göre toplantı 2026'da Ankara'da yapılacak ve ve herkes katılacak. Bilgilerinize arz ederim.")
            # Kalın bir parça: toplu düzeltme biçimi bozmamalı
            html = "<p>" + LONG.replace("yazının", "<strong>yazının</strong>") + "</p>"
            page.evaluate("([ed, h]) => CKEDITOR.instances[ed].setData(h)", [ED, html])
            page.wait_for_function(
                """() => { const f = document.querySelector('iframe.cke_wysiwyg_frame');
                           const h = f && f.contentWindow.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].length === 13; }""",
                timeout=4000,
            )
            time.sleep(0.4)
            page.locator("ebys-yazim-ui .badge").click()
            fx = page.locator("ebys-yazim-ui .panel .fixall")
            ok(fx.inner_text() == "Tümünü düzelt (13)", f"buton: {fx.inner_text()!r}")
            ok(page.locator("ebys-yazim-ui .panel .item").count() == 15, "panelde 15 sorun listelendi")
            page.screenshot(path=str(SHOTS / "04-panel.png"))
            fx.click()
            time.sleep(0.5)
            data = get_data(page)
            text_now = page.evaluate(f"() => CKEDITOR.instances['{ED}'].editable().getText()")
            ok(text_now.strip() == FIXED, f"13 düzeltme uygulandı → {text_now.strip()[:80]!r}…")
            ok("<strong>yazının</strong>" in data, "kalın parça korundu")
            f4 = [fr for fr in page.frames if fr != page.main_frame][0]
            h = highlights(f4)
            ok(h["hata"] == [] and sorted(h["uyari"]) == ["bende", "ve ve"], f"yalnızca uyarılar kaldı: {h}")
            toast = page.locator("ebys-yazim-ui .toast")
            ok(toast.is_visible() and "13 düzeltme uygulandı" in toast.inner_text(), f"bildirim: {toast.inner_text()!r}")
            ta = page.evaluate(f"() => {{ const t = document.createElement('textarea'); t.innerHTML = document.getElementById('{ED}').value; return t.value; }}")
            ok("arz ederim" in ta, "gizli textarea senkron")
            page.screenshot(path=str(SHOTS / "05-toplu-duzeltme.png"))
            toast.locator("button").click()
            time.sleep(0.5)
            text_undo = page.evaluate(f"() => CKEDITOR.instances['{ED}'].editable().getText()")
            ok(text_undo.strip() == LONG, "bildirimdeki 'Geri al' tek adımda tümünü geri aldı")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('redo')")
            time.sleep(0.3)
            ok(page.evaluate(f"() => CKEDITOR.instances['{ED}'].editable().getText()").strip() == FIXED, "redo ile tekrar uygulandı")
            page.evaluate(f"() => CKEDITOR.instances['{ED}'].execCommand('undo')")
            time.sleep(0.3)
            ok(page.evaluate(f"() => CKEDITOR.instances['{ED}'].editable().getText()").strip() == LONG, "Ctrl+Z yolu (undo komutu) da tek adım")

            print("11) Morfoloji ve yönetmelik (tarayıcıda)")
            html = ("<p>Konu: Toplantı hazırlığı.</p>"
                    "<p>Bu kitabıda okudum ve yapilacak işleri listeledim. Sözleşme fesih edilmiştir.</p>"
                    "<p>Toplam 1500000 TL ödenecektir. Gereğini arz veya rica ederim.</p>")
            page.evaluate("([ed, h]) => CKEDITOR.instances[ed].setData(h)", [ED, html])
            page.wait_for_function(
                """() => { const f = document.querySelector('iframe.cke_wysiwyg_frame');
                           const h = f && f.contentWindow.CSS.highlights.get('ebys-yazim-hata');
                           return h && [...h].some(r => r.toString() === 'kitabıda'); }""",
                timeout=5000,
            )
            f5 = [fr for fr in page.frames if fr != page.main_frame][0]
            h = highlights(f5)
            for w in ["kitabıda", "yapilacak", "hazırlığı", "fesih edilmiştir", "1500000", "arz veya rica"]:
                ok(w in h["hata"], f"tarayıcıda işaretlendi: {w}")
            click_word(page, f5, "yapilacak")
            wait_pop(page)
            ok(page.locator("ebys-yazim-ui .pop .sug").first.inner_text() == "yapılacak", "öneri: yapilacak → yapılacak")
            ref_txt = page.locator("ebys-yazim-ui .pop .rule").inner_text()
            ok("TDK" in ref_txt, f"balonda dayanak gösterildi: {ref_txt!r}")
            page.keyboard.press("Escape")
            click_word(page, f5, "1500000")
            wait_pop(page)
            ref_txt = page.locator("ebys-yazim-ui .pop .rule").inner_text()
            ok("m.16(7)" in ref_txt, f"yönetmelik maddesi gösterildi: {ref_txt!r}")
            page.keyboard.press("Escape")

            print("12) Performans: 5 sayfalık belge")
            para = ("İlgi (a) yazınızla Bakanlığımıza iletilen talep incelenmiş olup söz konusu hususta "
                    "gerekli değerlendirmelerin yapılabilmesi için ilgili birimlerin görüşlerine başvurulmuştur. "
                    "Konuya ilişkin olarak hazırlanan raporun ekte gönderildiği, mevzuat çerçevesinde yürütülecek "
                    "işlemlerin takvime bağlanarak uygulanmasının uygun olacağı değerlendirilmektedir. Bu kapsamda "
                    "Müdürlüğünüzce yapılacak çalışmaların sonuçlarının en geç ay sonuna kadar Bakanlığımıza "
                    "bildirilmesi hususunda gereğini rica ederim. ")
            doc = "".join(f"<p>{para}</p>" for _ in range(30))
            words = len(("" + para).split()) * 30
            console.clear()
            page.evaluate("([ed, h]) => CKEDITOR.instances[ed].setData(h)", [ED, doc])
            page.wait_for_timeout(1200)
            # Bir kelime yazıp debounce sonrası tam denetimi ölç (tur 1: soğuk, tur 2-4: sıcak)
            f6 = [fr for fr in page.frames if fr != page.main_frame][0]
            timings = []
            for k in range(4):
                # İmleci k'ıncı paragrafın sonuna koy (görünür alan dışında olsa da) ve yaz
                f6.evaluate("""(k) => { const p = document.body.querySelectorAll('p')[k * 7];
                    p.scrollIntoView({ block: 'center' });
                    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
                    const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""", k)
                page.locator("iframe.cke_wysiwyg_frame").focus()
                page.keyboard.type(" yapilacak")
                page.wait_for_timeout(700)
                timings.append(page.locator("ebys-yazim-ui").get_attribute("data-son-denetim") or "")
            for tm in timings:
                print("     " + tm)
            import re as _re
            rule_ms = [float(_re.search(r"kurallar ([0-9.]+) ms", tm).group(1)) for tm in timings if "kurallar" in tm]
            ok(len(rule_ms) == 4 and max(rule_ms[1:]) < 50, f"{words} kelimede sıcak denetim < 50 ms ({rule_ms})")

            print("13) Ağ")
            ok(external == [], f"dış ağ isteği yok ({len(external)})")

            errs = [c for c in console if c.startswith("error") or ("ebys-yazim" in c and not c.startswith("debug"))]
            ok(not errs, f"konsolda hata yok {errs[:3]}")
            ctx.close()
    finally:
        server.terminate()

    print(f"\n{passed} geçti, {failed} kaldı")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
