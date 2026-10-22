# Chrome Web Mağazası — yayın bilgileri

Geliştirici panosuna (https://chrome.google.com/webstore/devconsole) girilecek metinler ve dosyalar.
Görseller `docs/magaza/` altında; yeniden üretmek için `python3 scripts/store-assets.py`.

## 1. Paket

**Yeni öğe** → `ebys-yazim-denetimi-vX.Y.Z-magaza.zip` dosyasını yükleyin.
Bu zip, `npm run build` sonrası `dist/` klasörünün **içeriğidir** (manifest.json zip'in kökünde olmalı).

```bash
npm run build
cd dist && zip -r ../ebys-yazim-denetimi-v0.4.1-magaza.zip . && cd ..
```

## 2. Mağaza girişi (Store listing)

**Ad:** EBYS Yazım Denetimi (manifest'ten gelir)

**Özet** (manifest'ten gelir, 132 karakter):
EBYS’de resmî yazıları Türkçe yazım, noktalama ve Resmî Yazışma Kuralları’na göre denetler. Yerel çalışır, metin gönderilmez.

**Açıklama:**

```
EBYS Yazım Denetimi, resmî yazıları EBYS evrak editöründe yazarken Türkçe yazım, noktalama ve resmî yazışma kurallarını denetler. Hatalı kelimelerin altını çizer, tıklayınca doğrusunu önerir ve her uyarının hangi kurala dayandığını gösterir.

NELERİ DENETLER?
• Yazım: Türkçenin ek yapısını tanıyan, yaklaşık 35 bin köklü sözlük (yapilacak → yapılacak, orjinal → orijinal).
• Dil bilgisi: ayrı yazılan de/da, ki, mi (banada → bana da); özel adlara ve sayılara gelen ekler (Ahmetin → Ahmet’in, 3de → 3’te); birleşik fiiller (arzederim → arz ederim).
• Resmî Yazışma Yönetmeliği: Konu, Sayı, İlgi ve Ek biçimi; tutarların yazımı, kısaltma, kapanış ifadesi, süreli yazı ibaresi, imza, paragraflar arasında boş satır.
• Konu alanı: Evrak Bilgileri’ndeki Konu satırı da denetlenir (kelimelerin baş harfi büyük, sonda nokta yok, hk. → Hakkında).
• Resmî Yazışma Kuralları Kılavuzu: kesme işareti, virgül, kısaltma ekleri, sayılar, büyük harf, düzeltme işareti, anlatım bozuklukları, kişisel anlatım, muhatap yazımı ve “sık yanlış kullanılan kelimeler” tablosunun tamamı.

NASIL ÇALIŞIR?
• Kırmızı çizgi hata, turuncu “kontrol edin” (bağlama bağlı), mavi öneri demektir.
• Uyarıdaki “Kılavuz §13.6.3”, “Yönetmelik m.16(4)” gibi atıflara tıklayınca ilgili belge doğru sayfasında açılır.
• “Tümünü düzelt” yalnızca tek doğru cevabı olan sorunları düzeltir; anlamı değiştirebilecek olanları size bırakır. Toplu düzeltme tek Ctrl+Z ile geri alınır.
• Belgenin biçimine dokunmaz; kaydedilen evrakta iz bırakmaz.

GİZLİLİK
Eklenti tamamen bilgisayarınızda çalışır. Hiçbir izin istemez, ağa bağlanmaz; yazdığınız metin hiçbir yere gönderilmez ve saklanmaz. Kaynak kodu açıktır: https://github.com/biyonik/ebys-yazim-denetimi

HANGİ ADRESLERDE ÇALIŞIR?
MEB EBYS (ebys.meb.gov.tr) ve EBYS’ye girmeden denemek için hazırlanan deneme sayfası:
https://biyonik.github.io/ebys-yazim-denetimi/demo/

SINIRLAR
Kural tabanlı bir denetleyicidir; cümlenin anlamını yorumlamaz. Bağlama bağlı durumlarda (“bende” mi “ben de” mi?) karar vermez, uyarır.

Bu eklenti bağımsız bir çalışmadır; herhangi bir kamu kurumunun ya da EBYS üreticisinin resmî ürünü değildir.

Geliştirici: Ahmet ALTUN · https://biyonik.github.io
```

**Kategori:** Verimlilik → Araçlar (Productivity → Tools)
**Dil:** Türkçe

**Grafik öğeler:**

| Alan | Dosya |
|---|---|
| Mağaza simgesi (128×128) | `assets/icons/icon-128.png` |
| Ekran görüntüleri (1280×800) | `docs/magaza/ekran-1-yazarken.png` … `ekran-5-gizlilik.png` (bu sırayla) |
| Küçük tanıtım kutucuğu (440×280) | `docs/magaza/tanitim-kucuk-440x280.png` |
| Büyük tanıtım kutucuğu (1400×560) | `docs/magaza/tanitim-buyuk-1400x560.png` |

**Ana sayfa URL'si:** https://biyonik.github.io/ebys-yazim-denetimi/
**Destek URL'si:** https://github.com/biyonik/ebys-yazim-denetimi/issues

## 3. Gizlilik uygulamaları (Privacy practices)

**Tek amaç açıklaması (Single purpose):**

```
EBYS evrak editöründe yazılan resmî yazıları Türkçe yazım, noktalama ve resmî yazışma kurallarına göre denetlemek; hataları işaretleyip düzeltme önerisi sunmak.
```

**İzin gerekçeleri:** Eklenti hiçbir izin (`permissions`) istemez. Pano yalnızca içerik betiğinin çalıştığı
adresler için gerekçe sorarsa:

```
İçerik betiği yalnızca MEB EBYS (https://ebys.meb.gov.tr/*) ve eklentinin deneme sayfasında (https://biyonik.github.io/ebys-yazim-denetimi/*) çalışır. Bu sayfalardaki CKEditor evrak editörünün metnini tarayıcı içinde denetleyip hataları işaretlemek için gereklidir. Metin hiçbir yere gönderilmez; eklentinin ağ erişimi yoktur.
```

**Uzak kod kullanıyor musunuz?** Hayır, uzak kod kullanmıyorum.
(Tüm kod pakette; `eval`, uzaktan betik yükleme yok.)

**Veri kullanımı:** Hiçbir kutuyu işaretlemeyin (kişisel tanımlayıcı bilgi, sağlık, finans, kimlik doğrulama,
kişisel iletişim, konum, web geçmişi, kullanıcı etkinliği, web sitesi içeriği — hiçbiri toplanmaz).
Ardından üç beyanı onaylayın:
- Kullanıcı verilerini onaylanmış kullanım alanları dışında üçüncü taraflara satmıyorum/aktarmıyorum.
- Kullanıcı verilerini öğenin tek amacıyla ilgisiz amaçlarla kullanmıyorum/aktarmıyorum.
- Kullanıcı verilerini kredi değerliliğini belirlemek veya borç verme amacıyla kullanmıyorum/aktarmıyorum.

> Not: “Web sitesi içeriği” kutusu, verinin **toplanması/iletilmesi** içindir. Eklenti editör metnini yalnızca
> tarayıcı içinde, o anda işler; toplamaz, saklamaz, iletmez. Bu yüzden işaretlenmez.

**Gizlilik politikası URL'si:** https://biyonik.github.io/ebys-yazim-denetimi/gizlilik.html

## 4. Dağıtım

- **Ödeme:** Ücretsiz
- **Görünürlük:** Önce *Liste dışı* (Unlisted; yalnızca bağlantıyla kurulur), deneme bitince *Herkese açık*.
- **Bölgeler:** Tüm bölgeler (ya da yalnızca Türkiye)

## 5. İnceleme ekibi için test talimatı

```
The extension only runs inside the CKEditor 4 document editor of the Turkish Ministry of Education's document management system (ebys.meb.gov.tr), which requires a government login. To test without credentials, please open the public demo page, which reproduces the same editor structure:

https://biyonik.github.io/ebys-yazim-denetimi/demo/

1. Underlined words are spelling/grammar issues (Turkish). Click one (e.g. "banada") and pick the suggestion.
2. Click the citation at the bottom right of the bubble (e.g. "Kılavuz §13.6.3"): the bundled PDF opens in a new tab at the cited page.
3. Click the badge at the bottom right of the editor, then "Tümünü düzelt" (Fix all).
4. Click the badge to the right of the "Konu" (subject) field above the editor; apply a suggestion or "Tümünü düzelt".
5. Click the toolbar icon to see the popup.

The extension requests no permissions, makes no network requests and collects no data. Source code: https://github.com/biyonik/ebys-yazim-denetimi
```
