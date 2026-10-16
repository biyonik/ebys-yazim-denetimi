# EBYS Yazım Denetimi — Mimari

> Durum: **Faz 1 tamamlandı**, **Faz 3'ün sözlüksüz çözülebilen kısmı eklendi**
> (de/da, ki, mi; özel ad ve kurum adı kesmesi).
> Sıradaki: **Faz 2 — morfoloji motoru** (kök sözlüğü gerektiren her şey).

## 1. Amaç ve sınırlar

EBYS evrak editöründe (CKEditor 4) yazılan resmî yazıyı Türkçe yazım, noktalama ve
resmî yazışma kurallarına göre denetlemek; düzeltmeyi kullanıcıya önermek.

"Tam kontrol" üç katmanda ele alınır:

| Katman | Örnek | Deterministik mi? | Önem derecesi |
|---|---|---|---|
| Kelime (morfoloji) | `gidemiyeceğim` → `gidemeyeceğim` | Evet (sözlük + ek kuralları) | hata |
| Kural (TDK) | `2026da`, `3'de`, `arzederim`, `hiç bir` | Büyük ölçüde | hata / uyarı |
| Bağlam (anlam) | `ev de` mi `evde` mi? `hala` mı `hâlâ` mı? | **Hayır** | yalnızca uyarı |

İlke: **Emin olmadığımız yerde hata demiyoruz.** Bağlama bağlı durumlar "uyarı"
olarak işaretlenir ve son kararı yazan kişi verir. Yanlış pozitif, kullanıcının
eklentiye güvenini doğru negatiften daha hızlı yok eder.

## 2. Temel kararlar

| Karar | Neden | Alternatif ve bedeli |
|---|---|---|
| **Tamamen yerel**: ağ izni yok, build'de ağ API'si yasak | Resmî/gizli yazı içeriği dışarı çıkamaz. BT onayının en güçlü dayanağı. | Bulut API: daha iyi model, ama kurum için kabul edilemez. |
| **CSS Custom Highlight API** ile işaretleme | DOM'a tek düğüm eklenmez; kaydedilen/imzalanan belgeye sızma riski sıfır. Undo geçmişi kirlenmez. | `<span>` sarmalama: kolay, ama `getData()` çıktısını ve imleci bozar. |
| Stiller **adoptedStyleSheets** ile | `<style>` etiketi bile eklenmez; CKEditor `fullPage` modunda bile iz kalmaz. | `<style>` enjeksiyonu: fullPage'de belgeye yazılabilir. |
| **İki dünya**: isolated world (mantık) + MAIN world (köprü) | İçerik betiği `window.CKEDITOR`'ü göremez. Undo için CKEditor API'si şart. | Hepsini MAIN'de çalıştırmak: sayfa JS'i kodumuzu etkileyebilir. |
| Köprü **metin taşımaz** | Sayfa bağlamına içerik sızdırmamak; köprü sadece komut adları geçirir. | — |
| Düzeltme = **asgari fark** + snapshot sandviçi | `or<b>jin</b>al` → `ori<b>jin</b>al`: biçim korunur, undo tek adım. | Tüm kelimeyi değiştirmek: kalınlık kaybolur. |
| Çekirdek **DOM'dan bağımsız** (`src/core`) | Kurallar Node'da test edilir; WASM motoru aynı sözleşmeye takılır. | — |
| Adresler **config'ten**, manifest build'de üretilir | "Eklenti yalnızca şu adreste çalışır" denetlenebilir; `<all_urls>` yok. | Runtime izin isteme: daha esnek ama kurum dağıtımında karmaşık. |
| Morfoloji: **Rust → WASM** (Faz 2) | Tam kontrol, performans, sözlük dosyası tarayıcıda. | Hunspell-tr: hızlı başlangıç, Türkçe eklemede sınırlı. Zemberek: en olgun, ama Java + native messaging kurum PC'sinde gerçekçi değil. |

## 3. Bileşenler

```
EBYS sayfası (JSF/PrimeFaces)
│
├── td.ui-edys-editor
│   ├── textarea#{ad}  (gizli, JSF form alanı)  ◄── updateElement() ile senkron
│   └── div#cke_{ad}.cke
│       └── iframe.cke_wysiwyg_frame (about:blank, aynı köken)
│           └── body[contenteditable]   ◄── CSS.highlights (Range'ler) + adoptedStyleSheets
│
├── <ebys-yazim-ui> (Shadow DOM)  ◄── balon + sayaç rozeti
│
├── [MAIN world]   bridge.js   — CKEDITOR olaylarını dinler, saveSnapshot/updateElement/focus çağırır
│        ▲ ▼  CustomEvent (detail: JSON string, yalnızca komut + editör adı)
└── [Isolated]     content.js
         ├── main.ts        keşif: MutationObserver + köprü olayları + 1 sn bekçi
         ├── session.ts     editör başına yaşam döngüsü, debounce, uygula/yoksay
         ├── text-index.ts  DOM ↔ düz metin eşlemesi, asgari fark ile değiştirme
         ├── highlighter.ts Highlight API
         ├── ui.ts          balon/rozet
         └── core/          tokenizer, kurallar, motor  (DOM bilmez)
```

### Düzeltme akışı (eşzamanlı)

```
kullanıcı öneriye tıklar
  → TextIndex yeniden kurulur, aralık hâlâ aynı metni içeriyor mu? (bayatlık kontrolü)
  → köprü: saveSnapshot          (undo noktası A)
  → metin düğümlerinde asgari fark uygulanır
  → köprü: saveSnapshot + updateElement   (undo noktası B, textarea senkron)
  → yeniden denetim, imleç düzeltmenin sonuna
```

`dispatchEvent` eşzamanlı olduğu için bu üç adım arasına kullanıcı girdisi giremez.

## 4. CKEditor 4 entegrasyonunda öğrendiklerimiz

Testlerle doğrulanmış davranışlar:

1. **Belge yeniden yazılır.** `setData()` ve kaynak modundan dönüş iframe belgesini
   yeniden oluşturur; eski `document`/`body` referansları ölü kalır. Her denetim
   döngüsünde kimlik doğrulanır, köprüden `contentDom` olayı da gelir.
2. **`getData()` entity kodlar.** `ç` → `&ccedil;`, `'` → `&#39;`. Belge içeriğini
   karşılaştırırken çözülmüş metne bakılmalı. EBYS'nin `entities` ayarı farklı olabilir.
3. **Dolgu karakterleri.** WebKit'te imleç için `U+200B` dizisi eklenir; düz metne
   alınırsa kelimeler bölünür. TextIndex bunları atlar ama ofset eşlemesini korur.
4. **Boşluk temsili.** Kullanıcının ikinci boşluğu `&nbsp;` olur; HTML kaynağındaki
   boşluk dizileri ise ekranda teke iner. TextIndex ekranda görünen metni üretir.
5. **İçerik betiği `about:blank` iframe'e enjekte edilmez**, gerek de yok: aynı
   kökenli iframe'in `contentDocument`'ına üst belgeden erişilir. Highlight ve
   CSSStyleSheet nesneleri iframe'in kendi penceresinin kurucularıyla oluşturulur.

## 5. Kural kataloğu (Faz 1)

| Kural | Ne yakalar | Önem | Bilinçli istisnalar |
|---|---|---|---|
| `yazim.yaygin` | ~50 sık yanlış + iki kelimelik kalıplar | hata / uyarı | Gövde eşleme yalnızca ünlü uyumu değişmiyorsa (`makina→makine` çekimde ek de değişir) |
| `yazim.birlesik-fiil` | `arzederim`, `ricaederim` | hata | Ses olaylı bitişikler (`kaydetmek`, `hissetmek`) listede yok |
| `kesme.sayi` | `2026da`, `3'de`→`3'te`, `1990'ler`, `3üncü` | hata | `2B`, `4A` gibi kodlar; ek okunuşa göre üretilir |
| `kesme.sayi.birim` | `5km` → `5 km` | öneri | `da` (dekar) ve tek harfli birimler çakıştığı için yok |
| `noktalama.*` | `,` öncesi boşluk, `,olur` | hata | `Sayı :` başlık hizalaması, alan adları, `T.C.` |
| `bosluk.cift` | çift boşluk | öneri | Satır başı girintisi |
| `tekrar.kelime` | `ve ve` | uyarı | İkilemeler (`yavaş yavaş`) — yalnızca işlev kelimeleri |
| `buyuk-harf.cumle-basi` | `. sonra`, paragraf başı küçük harf | uyarı | Kısaltma, sıra sayı, üç nokta, tablo hücresi, madde imi. Başka bir sorunla çakışırsa o sorunun önerisine işlenir (`orjinal` → `Orijinal`) |
| `baglac.de` | `banada`, `onuda`, `buradada`, `hemde` | hata | Yalnızca bulunma eki alamayan kapalı sınıf gövdeler. `maddede`, `ifadede`, `adada` meşru bulunma hâli |
| `baglac.de` (belirsiz) | `bende`, `bizde` | uyarı | "Ben de geldim" ↔ "dosya bende" anlamla ayrılır |
| `baglac.ki` | `biliyorumki`, `olacakki`, `değilki` | hata | Sıfat yapan `-ki` (evdeki, şimdiki, yarınki) ve kalıplaşmışlar (mademki, halbuki, sanki) |
| `baglac.ki` (geçmiş zaman) | `geldiki` | uyarı | `plastiki` gibi alıntı isimlerle aynı ses dizisi; kök sözlüğü olmadan ayrılamaz |
| `baglac.mi` / `mi-uyum` | `geliyormusun`, `varmı`, `geliyor mi` → `mu` | hata | Ünlü düşmesi (`resmi`, `ismi`, `kısmı`), rivayet (`gelecekmiş`), iyelik (`doğrumuz`) |
| `kesme.ozel-ad` | `Ahmetin`, `Ankarada`, `Türkiyenin`, `Atatürkün` | hata / uyarı | Yapım ekleri (`Ankaralı`, `Türkçe`). Birleşik görünen adlar (`Emine`, `Nurdan`). Cins isimle aynı adlar cümle başında hiç, cümle içinde uyarıyla |
| `kesme.ozel-ad.uyum` | `Ayşe'in` → `Ayşe'nin`, `Ahmet'de` → `Ahmet'te` | hata | — |
| `kesme.kurum` | `Valiliği'ne` → `Valiliğine` | hata | Kısaltmalar (`TBMM'ye`) kesmeyle yazılır |

### Kesinlik sınırı: kök sözlüğü olmadan neyi çözemeyiz?

| Örnek | Neden çözülemez | Çözüm |
|---|---|---|
| `kitabıda` (kitabı da) ↔ `kapıda` (kapı+da) | İkisi de "ünlü + da". Gövdenin `kapı` mı `kitap+ı` mı olduğunu ancak kök sözlüğü söyler | Faz 2 |
| `geldide` (geldi de) ↔ `vadide` (vadi+de) | Fiil mi isim mi? | Faz 2 |
| `kesti ki` ↔ `plastiki` | Aynı ses dizisi | Faz 2 |
| `Yılmazın`, `Kaplanın` gibi listede olmayan soyadları | Ad listesi sonlu | Faz 5 (kurum/kullanıcı sözlüğü) |
| `o da` ↔ `oda` | Yazıldıktan sonra ikisi de geçerli kelime | Bağlam; ancak olasılıksal model ile |

## 6. Yol haritası (inşa sırası)

Bu fazlar bir "MVP sonra genişlet" planı değil; tek bir bütün ürünün inşa sırası.
Her faz bir öncekinin üzerine kurulur.

- **Faz 1 — Editör entegrasyonu + deterministik kurallar** ✅
- **Faz 2 — Morfoloji motoru (Rust → WASM)**
  - Sözlük kaynağı seçimi ve lisans doğrulaması (ör. Zemberek sözlüğü Apache-2.0 mı, türev kullanım şartları)
  - Sonlu durumlu çözümleyici tasarımı: kök sözlüğü, ek dizimi (morfotaktik), ses olayları (ünlü uyumu, ünsüz yumuşaması, ünlü düşmesi)
  - Öneri üretimi: düzenleme mesafesi + morfolojik üretim
  - **Spike:** WASM'ın içerik betiğinde derlenmesi sayfa CSP'sine takılıyor mu? Takılırsa offscreen document'a taşı
  - Performans bütçesi: 5 sayfalık evrakta tam denetim < 50 ms
- **Faz 3 — Morfolojiye dayalı kurallar:** `ki`, `de/da` bağlacı, `mi` soru eki, özel ad + kesme (`Ankaraya` → `Ankara'ya`), birleşik kelimeler, şapka
- **Faz 4 — Resmî Yazışma Yönetmeliği:** yönetmelik metnini birlikte okuyup her kuralı madde atfıyla kodlamak (tarih biçimi, kısaltmalar, ilgi/ek/dağıtım düzeni, hitap)
- **Faz 5 — Kullanıcı sözlüğü ve ayarlar:** kalıcı yoksay/sözlüğe ekle (`chrome.storage.local`), kurum geneli politika (`chrome.storage.managed`)
- **Faz 6 — Paketleme ve dağıtım:** kurum BT'si için güvenlik dokümanı, zorunlu kurulum (ExtensionInstallForcelist), sürümleme

## 7. Açık sorular

1. **EBYS'nin gerçek adresi** (`ebys.config.json`).
2. **Kurum bilgisayarlarındaki Chrome sürümü.** `world: "MAIN"` Chrome 111 ister.
   Windows 7/8.1'de Chrome 109'da kaldıysa köprüyü `<script src>` enjeksiyonuyla
   (web_accessible_resources) yüklemek gerekir.
3. **Etiket widget'ları** (`removeButtons: 'etiket'` ipucu): EBYS bu alanları
   `contenteditable=false` mı üretiyor? TextIndex bunları atlıyor; gerçek DOM ile doğrulanmalı.
4. **`initCke` sarmalayıcısı** ek davranış katıyor mu (otomatik kaydetme, `timeout: 480`)?
   Düzeltmenin otomatik kaydı tetiklemesi istenir mi?
5. Gerçek EBYS'de sayfa CSP'si var mı? (Faz 2 WASM spike'ını etkiler)
