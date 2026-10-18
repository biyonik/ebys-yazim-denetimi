"""
Chrome Web Mağazası görselleri: docs/magaza/*.png

    npm run build:dev && python3 test/e2e/screenshots.py   # önce ekran görüntüleri
    python3 scripts/store-assets.py

Mağaza ölçüleri: ekran görüntüsü 1280×800, küçük tanıtım 440×280, büyük tanıtım 1400×560.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "docs" / "img"
OUT = ROOT / "docs" / "magaza"
ICON = (ROOT / "assets/icons/kaynak/simge-1024.png").as_uri()

BASE = """
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: %(w)dpx; height: %(h)dpx; overflow: hidden; font-family: Inter, system-ui, sans-serif;
         background: linear-gradient(160deg, #1d3d6e 0%%, #122a4f 100%%); color: #fff; }
</style>
"""

SHOTS = [
    ("1-yazarken", "balon.png", "Yazarken denetler",
     ["Yanlış yazılan kelimenin altı çizilir, tıklayınca doğrusu önerilir.",
      "Türkçenin ek yapısını tanıyan sözlük: <b>banada → bana da</b>, <b>2026da → 2026’da</b>."]),
    ("2-dayanak", "kilavuz.png", "Her uyarının dayanağı",
     ["Uyarı hangi kurala dayanıyor, balonda yazar.",
      "<b>Kılavuz §13.6.3</b>, <b>Yönetmelik m.16(4)</b> gibi atıflara tıklayınca belge ilgili sayfasında açılır."]),
    ("3-tumunu-duzelt", "panel.png", "Tümünü düzelt",
     ["Tek doğru cevabı olan sorunlar tek tıkla düzelir.",
      "Anlamı değiştirebilecek olanlar size bırakılır. Tek <b>Ctrl+Z</b> hepsini geri alır."]),
    ("4-gizlilik", "pencere.png", "Metin bilgisayarınızdan çıkmaz",
     ["Hiçbir izin istemez, ağa bağlanmaz, veri toplamaz.",
      "Sözlük ve dayanak belgeler eklentinin içindedir. Kaynak kodu açıktır (Apache&#8209;2.0)."]),
]

SHOT_HTML = BASE + """
<style>
  .l { position: absolute; left: 64px; top: 0; bottom: 0; width: 360px; display: flex; flex-direction: column; justify-content: center; }
  .l img { width: 64px; height: 64px; margin-bottom: 28px; }
  h1 { font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -.01em; margin-bottom: 22px; }
  p { font-size: 19px; line-height: 1.5; color: #d6e0f0; margin-bottom: 14px; }
  p b { color: #fff; font-weight: 600; }
  .r { position: absolute; left: 470px; right: 48px; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; }
  .r img { max-width: 100%%; max-height: 700px; border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,.35); background: #fff; }
</style>
<div class="l"><img src="%(icon)s"><h1>%(title)s</h1>%(paras)s</div>
<div class="r"><img src="%(shot)s"></div>
"""

SMALL = BASE + """
<style>
  body { display: flex; align-items: center; gap: 22px; padding: 0 30px; }
  img { width: 104px; height: 104px; flex: none; }
  h1 { font-size: 27px; line-height: 1.15; font-weight: 700; }
  p { font-size: 15px; color: #d6e0f0; margin-top: 8px; line-height: 1.4; }
</style>
<img src="%(icon)s"><div><h1>EBYS Yazım Denetimi</h1><p>Resmî yazılarda Türkçe yazım ve yazışma kuralları</p></div>
"""

MARQUEE = BASE + """
<style>
  .l { position: absolute; left: 80px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; }
  .l img { width: 96px; height: 96px; margin-bottom: 26px; }
  h1 { font-size: 46px; font-weight: 700; line-height: 1.1; }
  p { font-size: 21px; color: #d6e0f0; margin-top: 16px; line-height: 1.45; }
  .r { position: absolute; left: 660px; right: 60px; top: 50px; bottom: -40px; }
  .r img { width: 100%%; border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
</style>
<div class="l"><img src="%(icon)s"><h1>EBYS Yazım Denetimi</h1>
<p>Türkçe yazım, noktalama, Resmî Yazışma Yönetmeliği ve Kılavuzu. Yerel çalışır, metin gönderilmez.</p></div>
<div class="r"><img src="%(shot)s"></div>
"""


def render(page, html, w, h, out):
    tmp = OUT / "_tmp.html"
    tmp.write_text(html % {"w": w, "h": h, **render.vars}, encoding="utf-8")
    page.set_viewport_size({"width": w, "height": h})
    page.goto(tmp.as_uri())
    page.wait_for_load_state("load")
    page.screenshot(path=str(OUT / out))
    tmp.unlink()
    print(OUT / out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium")
        page = b.new_page(device_scale_factor=1)
        for name, shot, title, paras in SHOTS:
            render.vars = {"icon": ICON, "shot": (IMG / shot).as_uri(), "title": title, "paras": "".join(f"<p>{x}</p>" for x in paras)}
            render(page, SHOT_HTML, 1280, 800, f"ekran-{name}.png")
        render.vars = {"icon": ICON, "shot": (IMG / "balon.png").as_uri()}
        render(page, SMALL, 440, 280, "tanitim-kucuk-440x280.png")
        render(page, MARQUEE, 1400, 560, "tanitim-buyuk-1400x560.png")
        b.close()


if __name__ == "__main__":
    main()
