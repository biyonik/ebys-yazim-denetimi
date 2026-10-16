# EBYS Yazım Denetimi

EBYS evrak editöründe (CKEditor 4) Türkçe yazım, noktalama ve kural denetimi yapan
Chrome eklentisi. **Tamamen yerel çalışır**: hiçbir izin istemez, ağ erişimi yoktur,
metin hiçbir yere gönderilmez.

Mimari kararlar ve yol haritası: [docs/MIMARI.md](docs/MIMARI.md)

## Kurulum (geliştirme)

```bash
npm install
# 1) ebys.config.json → "origins" içine kendi EBYS adresini yaz
npm run build          # üretim: yalnızca EBYS adresi
npm run build:dev      # + localhost (test ortamı için)
```

Chrome → `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle** → `dist/` klasörü.

## Testler

```bash
npm test               # çekirdek kurallar (node:test)
npm run typecheck
npm run test:e2e       # eklenti yüklü Chromium + gerçek CKEditor 4 (Playwright, Python)
```

E2E testi, gerçek EBYS sayfasındaki yapının birebir kopyası olan
`test/harness/index.html` üzerinde çalışır ve şunları doğrular: işaretleme, kaydedilen
içeriğin temizliği, düzeltme, geri al/yinele, biçim koruma, `setData`/kaynak modu
sonrası yeniden bağlanma ve dış ağ isteği olmaması.

## Kullanım

- Altı dalgalı kırmızı: **hata** · turuncu: **kontrol edin** (bağlama bağlı) · mavi noktalı: **öneri**
- İşaretli kelimeye tıkla → öneriyi seç ya da **Yoksay**.
- Editörün sağ altındaki rozete tıkla → **sorun paneli**: tüm sorunların listesi ve **Tümünü düzelt**.
- **Tümünü düzelt** yalnızca tek doğru cevabı olan sorunlara dokunur (kırmızı hatalar, mavi biçim
  önerileri). Turuncu uyarılar ("hala/hâlâ", "bende/ben de") anlamı değiştirebileceği için hiçbir zaman
  otomatik uygulanmaz.
- Her düzeltme — toplu düzeltme dahil — CKEditor'ün geri al (Ctrl+Z) geçmişine **tek adım** olarak girer.

## Klasör yapısı

```
src/core/       DOM bilmeyen denetim çekirdeği (tokenizer, kurallar, motor)
src/content/    içerik betiği: keşif, metin indeksi, işaretleme, arayüz
src/bridge/     MAIN world köprüsü (CKEditor API'si)
src/shared/     köprü protokolü
test/unit/      çekirdek birim testleri
test/harness/   EBYS editör yapısının kopyası
test/e2e/       Playwright uçtan uca testi
```
