# EBYS Yazım Denetimi — Mimari

> Durum: **Faz 1–4 tamamlandı.** Editör entegrasyonu, deterministik kurallar,
> morfoloji motoru ve Resmî Yazışma Yönetmeliği kuralları.
> Sıradaki: **Faz 5 — kullanıcı/kurum sözlüğü ve ayarlar.**

## 1. Amaç ve sınırlar

EBYS evrak editöründe (CKEditor 4) yazılan resmî yazıyı Türkçe yazım, noktalama ve
resmî yazışma kurallarına göre denetlemek; düzeltmeyi kullanıcıya önermek.

"Tam kontrol" üç katmanda ele alınır:

| Katman | Örnek | Deterministik mi? | Önem derecesi |
|---|---|---|---|
| Kelime (morfoloji) | `yapilacak`, `gönderilmş`, `kitabıda` | Evet (kök sözlüğü + ek dizimi) | hata |
| Kural (TDK + Yönetmelik) | `2026da`, `3'de`, `Valiliği'ne`, `Konu: … talebi.` | Büyük ölçüde | hata / uyarı / öneri |
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
| Köprü **metin taşımaz** | Sayfa bağlamına içerik sızdırmamak; köprü yalnızca komut adları geçirir. | — |
| Düzeltme = **asgari fark** + snapshot sandviçi | `or<b>jin</b>al` → `ori<b>jin</b>al`: biçim korunur, undo tek adım. | Tüm kelimeyi değiştirmek: kalınlık kaybolur. |
| Çekirdek **DOM'dan bağımsız** (`src/core`) | Kurallar Node'da test edilir. | — |
| Adresler **config'ten**, manifest build'de üretilir | "Eklenti yalnızca şu adreste çalışır" denetlenebilir; `<all_urls>` yok. | Runtime izin isteme: esnek ama kurum dağıtımında karmaşık. |
| Morfoloji: **TypeScript** (Rust → WASM yerine) | Ölçülen bütçe (aşağıda) aşılmadı; derleme zinciri Node ile sınırlı kaldı (kurum PC'sinde rustup/wasm-pack gerekmez); WASM'ın sayfa CSP'sine takılma riski yok. | Rust → WASM: daha sıkı bellek modeli, ama bu iş yükünde ölçülebilir kazanç yok. Bütçe aşılırsa yalnızca `walk` döngüsü taşınır. |
| Sözlük: **Zemberek** (Apache-2.0), yalnızca ana sözlük | Ses olayları madde madde işaretli; lisansı dağıtıma uygun. | `non-tdk.dict` alınmadı: TDK dışı biçimler içeriyor (Yönetmelik m.16(8) TDK'yi esas alır). |

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
├── <ebys-yazim-ui> (Shadow DOM)  ◄── balon, rozet, sorun paneli, bildirim
│
├── [MAIN world]   bridge.js   — CKEDITOR olaylarını dinler; saveSnapshot/updateElement/focus/undo
│        ▲ ▼  CustomEvent (detail: JSON string, yalnızca komut + editör adı)
└── [Isolated]     content.js
         ├── content/   keşif, oturum, TextIndex, işaretleme, arayüz
         └── core/      DOM bilmez
              ├── tokenizer, engine, fix-all (toplu düzeltme politikası)
              ├── rules/            TDK kuralları + yonetmelik.ts
              └── morph/            çözümleyici, ek dizimi, ses bilgisi, öneri
                   └── data/lexicon.ts   (Zemberek'ten derlenir: scripts/build-lexicon.mjs)
```

## 4. Morfoloji motoru

Soru: *Bu kelime, sözlükteki bir kök ve geçerli bir ek dizisiyle kurulabilir mi?*
Örnek: `yapılmaktadır` = yap + Il + mAktA + DIr.

**Ek şablonları arşifonemlerle yazılır**:

| Simge | Anlamı |
|---|---|
| `A` | a/e (iki yönlü uyum) |
| `I` | ı/i/u/ü (dört yönlü uyum) |
| `D` | d/t (sert ünsüzden sonra t) |
| `C` | c/ç (sert ünsüzden sonra ç) |
| `(y)` `(n)` `(s)` | yalnızca ünlüden sonra |
| `(I)` | yalnızca ünsüzden sonra |

Ek dizimi bir durum grafiğidir (`morphotactics.ts`): isim çekimi, ek-fiil, sık yapım ekleri, fiil çatısı, olumsuzluk, yeterlik, tüm kip/zaman ekleri, sıfat-fiil, isim-fiil ve zarf-fiil.

**Ses olayları "kısıt" olarak bir sonraki parçaya devredilir:**

| Kısıt | Anlamı | Örnek |
|---|---|---|
| `needV` | Yumuşamış/ikizleşmiş/ünlüsü düşmüş kök ünlüyle başlayan ek ister | `kitab-ı`, `hakk-ı`, `ağz-ı` |
| `noV` | Yumuşamamış kök ünlüyle başlayan ek alamaz | `*kitap-ı` |
| `needProg` | Son ünlüsü düşmüş gövde yalnızca `-Iyor` alır | `ar-ıyor`, `yapm-ıyor` |
| `needY` | `de-/ye-` gövdesinin `di-/yi-` biçimi | `di-yen`, `yi-yecek` |

Sözlükten öğrenilen incelikler:

- Ünlü düşmesinde uyum **düşen ünlüye** göredir: `bahis` → `bahsi`, `vakit` → `vakti`.
- Ters uyumlu kelimeler yalnızca açıkça işaretliyse yumuşar: `dikkat` → `dikkati`, ama `kalp` → `kalbi`.
- Özel adlar yalnızca büyük harfle başlayan kelimede kök olur.

**Performans**:

- **İki katmanlı önbellek.**
  - Ek yürüyüşü önbelleği *kelimeler arasında* paylaşılır. Sonuç yalnızca kalan metne, duruma ve ses durumuna bağlıdır; `-ları`, `-ında` gibi diziler binlerce kelimede tekrar eder.
  - Ek gerçekleşmeleri (geçiş, ses durumu) çiftiyle önbelleğe alınır.
- **Türkçe büyük/küçük harf.** `toLocaleLowerCase('tr-TR')` yerine I/İ eşlemesi ve ardından `toLowerCase` kullanılır; ~10 kat hızlı.
- **Öneri üretimi kaldığı yerden devam eder.** Tur başına 60 ms bütçe var. Bütçe aşılırsa aday listesi saklanır ve sonraki tur devam eder; hiçbir tur yazmayı bloklamaz.

### Bilinmeyen kelimede onarım sırası

1. **Bağlaç ayırma:** `kitabıda` → `kitabı da`. Bütün kelime geçersiz ama gövde geçerli olmalı. `gelmişde` gibi bulunma eki de olabilen durumlarda iki aday verilir: `gelmiş de`, `gelmişte`.
2. **İki kelimeye bölme:** `herşey` → `her şey`. Yalnızca sık ayrı yazılan ilk parçalarla yapılır; genel bölme `Kriptografik` → `Kripto grafik` gibi anlamsız sonuçlar ürettiği için kaldırıldı.
3. **Öneri:**
   - Önce Türkçe karakter düzeltmesi denenir (`yapilacak` → `yapılacak`). Tek aday varsa toplu düzeltmeye girer.
   - Sonra tek düzenleme mesafesi denenir. Sonuçlar unutulmuş ünlü, harf yer değiştirmesi ve Türkçe karakter karışıklığı öne alınarak sıralanır. Bunlar tahmin olduğundan **hiçbir zaman** toplu düzeltmeye girmez.

## 5. Ölçümler (bu fazda)

Doğru kabul edilen metinlerde yanlış pozitif ölçümü:

| Derlem | Kelime | Sonuç |
|---|---|---|
| Yönetmeliğin derlenmiş metni | 5.729 | PDF kalıntıları dışında 2 sözlük uyarısı (`Kriptografik`, bir teknik terim) |
| Yönetmeliğin 24 örnek yazısı | 3.280 | Gövde metinlerinde gerçek yanlış pozitif yok; kalanlar PDF/üstveri kalıntısı |
| Kılavuz (2025) | 14.459 | Kılavuz'un kendi yazım hatalarını buldu: `ünvan`, `metodların`, `Andlaşmalar`, künyede "Destek **ve ve** Mali" |
| Kılavuz (Ocak 2023, kurum baskısı) | 14.466 | Kılavuz kurallarının işaretlerinin tamamı Kılavuz'un kendi "Yanlış kullanım" sütunlarında ya da sözü anan cümlelerde ("ve, veya, yahut bağlaçlarından…") |
| Bağımsız inceleme: elle yazılmış ~220 doğru resmî yazı cümlesi | — | 23 yanlış alarm bulundu, hepsi düzeltildi ve `kilavuz.test.ts` içinde gerileme testi olarak duruyor |

Tarayıcıda, eklenti içinde ölçülen süreler (`npm run test:e2e`, 1.600 kelime ≈ 5 sayfa):

| Ölçüm | Süre |
|---|---|
| Metin indeksi | ~5,5 ms |
| Tüm kurallar (sıcak) | 10–19 ms (Kılavuz kurallarıyla; öncesi 6,5–12,7 ms) |
| İşaretleme | < 0,5 ms |
| Sözlük yükleme (bir kez, sayfa boştayken) | ~80 ms |

Bütçe 50 ms'ydi. Paket boyutu: `content.js` 558 KB (sözlük dahil).

## 5b. Tıklanabilir dayanak

Uyarının dayanağı ("Yönetmelik m.16(4), Kılavuz §31") `ref-links.ts` ile parçalanır; tanınan her atıf, eklentinin
**kendi içinde taşıdığı** PDF'e (`dist/kaynak/`) `#page=N` ile bağlanır. Atıf → sayfa dizini PDF'lerden betikle
üretilir (`scripts/build-ref-index.py`): Kılavuz'da bölüm başlıkları, Yönetmelik'te madde ve **fıkra** başlangıçları.

| Karar | Neden | Alternatif ve bedeli |
|---|---|---|
| PDF'ler pakette | Ağ yok (eklentinin temel güvencesi), sürüm sabit (Ocak 2023), EBYS ağları çoğu zaman kısıtlı | Resmî siteye bağlantı: adres ve baskı değişir (2025 baskısının sayfaları farklı), ağ ister |
| Açma işi arka planda (`chrome.tabs.create`) | İzin istemez; PDF'ler `web_accessible_resources` olmaz, yani EBYS sayfası eklentiyi bu dosyalardan tespit edemez | İçerik betiğinden `window.open`: dosyaları tüm sitelere açmak gerekir |
| Bilinmeyen alt bölüm → üst bölüm, o da yoksa bağlantı yok | Yanlış sayfaya götürmek, götürmemekten kötüdür | — |
| Kılavuz PDF'i kayıpsız sıkıştırıldı (11,6 → 10,3 MB) | Görsel yeniden örnekleme denendi: 4,5 MB'a iniyor ama bir sayfanın metni kayboldu | Kayıplı sıkıştırma: boyut kazancı, içerik bozulması riski |

Arka plan mesajı yalnızca `{belge, sayfa}` taşır, belge adı beyaz listeden, sayfa aralıktan doğrulanır.

## 5c. Konu alanı

MEB EBYS'de (Belgenet) Sayı, Konu ve İlgi editörde değil, **Bilgileri** sekmesindeki ayrı form alanlarındadır.
Sayı sistem üretir, İlgi seçilerek eklenir; elle yazılan ve yazım hatası taşıyabilen tek alan **Konu**'dur:

```html
<textarea id="yeniGidenEvrakForm:evrakBilgileriList:3:konuTextArea"
          class="… metadataKonuTextArea …" maxlength="500" onchange="PrimeFaces.ab({…})">
```

Seçici sınıf adına ve id sonekine dayanır (`textarea.metadataKonuTextArea, textarea[id$=":konuTextArea"]`); listedeki
sıra numarası (`:3:`) kuruma göre değişebileceği için kullanılmaz.

| Karar | Neden | Alternatif ve bedeli |
|---|---|---|
| Aynı çekirdek, `"Konu: "` önekiyle | Yönetmelik m.13(1) kuralları satırı bu önekle tanır; öneki eklemek, kuralları ikinci kez yazmaktan sağlamdır. Sonuçlar önek kadar kaydırılır | Ayrı kural seti: aynı kuralın iki kopyası, zamanla ayrışır |
| Kısaltma tanımı kuralı (m.16(11)) Konu'da kapalı | Açık hâl metinde verilir; konuda `LGS` için uyarı gürültüdür | — |
| İşaret yerine alanın sağında sayaç + liste | `<textarea>` içindeki metin DOM düğümü değildir; Highlight API çizemez. Arkasına hizalanmış bir "ayna" katmanı mümkündür ama kaydırma, satır kırma ve yazı tipi eşlemesi kırılgandır | Ayna katmanı: daha tanıdık görünüm, çok daha fazla bakım |
| Düzeltmeden sonra `input` + `change` olayı | PrimeFaces değeri satır içi `onchange` ile sunucu modeline alır; olay tetiklenmezse kaydedilen konu eski hâli kalır. Satır içi işleyici DOM olayına bağlıdır, içerik betiğinin yalıtılmış dünyasından tetiklenebilir | `value` atayıp bırakmak: ekranda düzelmiş, kayıtta düzelmemiş konu — en tehlikeli sonuç |
| Alan görünmezken sayaç gizli | Sekme değişince alan `display:none` olur; sayaç boşlukta asılı kalmasın | — |

## 5d. Kurum adlarındaki yazım hataları (`kurum-adi.ts`, v0.5.1)

Çıkış noktası gerçek bir yazı: "Milli Eğitim **Banlığı**". Genel sözlük kuralı bunu iki ayrı nedenle görmüyordu:

1. **Büyük harf kalkanı.** Cümle içinde büyük harfle başlayan sözlük dışı kelime özel ad sayılıp atlanır (soyadları,
   yer adları); tamamı büyük harfli kelime kısaltma sayılır. Bu yüzden "Bakanlğımıza", "Müdürlügüne", "MİLLİ EĞTİM"
   de sessizdi — küçük harfle yazılsalar yakalanırlardı.
2. **Gerçek kelime hatası.** "banlık" sözlüğe göre kurulabilir: *ban* (yasaklama) + *-lık*. Yalnızca sözlüğe bakan
   bir denetleyici bunu kendi başına ayıramaz.

Çözüm, kalkanı kaldırmak değil, **bağlam bilinen yerde açmaktır**: büyük harfli öbek bir kurum başı içeriyorsa
(Bakanlığı, Müdürlüğü, Lisesi…) içinde geçebilecek kelimeler de büyük ölçüde bellidir. Kelime dağarcığı ve ikili
komşuluklar `lexicon/kurumlar.ts`'teki ~250 ad ve unvandan türetilir.

| Sınıf | Örnek | Kanıt | Önem |
|---|---|---|---|
| 1. Sözlük dışı kelime, kurum adında | `Müdürlügüne`, `Eğtim`, `BAKANLIGI`, `Bakanlğımıza` | Öbekte kurum başı var ya da kelimenin kendisi uzun, ayırt edici bir başa (bakanlığ, müdürlüğ…) yakın | hata; yalnızca Türkçe karakter farkı tek önerideyse "Tümünü düzelt" |
| 2. Sözlükte var, bilinen ikilide yanlış | `Mili Eğitim` (mil + -i), `Terbiye Kurlu` (kur + -lu) | Komşu kelime TAM biliniyor ve ikili listede var; çözümlemenin kökü ≤ 3 harf | uyarı |
| 3. Kurum başına yakın türetme | `Banlığı`, `banlığımızda`, `Altıeylül Kaymaklığına` | "-lık" kökü bir başın köküne ≤ 2 harf uzak; türetme sözlükte madde değil | uyarı |

**Yanlış alarm kalkanları ve ölçümle bulunanlar.** Kural 75 bin kelimelik derlemde (Yönetmelik, Kılavuz, örnek
yazılar) ve sözlükteki her kökün "-lık" türetmesinde (≈41 bin biçim) denendi; her tur bir kalkan doğurdu:

| Ölçümde çıkan | Kalkan |
|---|---|
| `Başkanı`, `Yardımcısı` (unvan) → "Başkanlık" önerisi | 2. sınıf yalnızca kökü ≤ 3 harfli çözümlemelerde: uzun köklü geçerli kelime başka bir kelimenin çekimidir (`Başkanı`, `İşletmeleri`, `Yazı İşleri`) |
| `Başbakanlığın` → "Başkanlığın" | Kökü sözlükte olan türetmede yalnızca EKSİK harf kabul edilir: `kaymak ⊂ kaymakam` uyarılır, `başbakan`, `veli`, `baba` uyarılmaz |
| `sağlığı`, `birliği`, `değişikliği` başka türetmelerin hedefi oluyordu | "-lık" karşılaştırması yalnızca kurum BAŞLARI ve ≥ 4 harfli köklerle (şef, amir dışarıda) |
| Bilinmeyen özel adlar (`Abanlığı`) kısa başlara (`ajan`, `okul`) benziyordu | Kelimenin kendisinin baş sayılması için ≥ 6 harfli ayırt edici biçim |
| Adres parçası `…/Cumhurbaskanligi` | `/` komşusu olan kelime atlanır |
| `Milli` / `Millî` | Eşleşmede işaret yok sayılır; kurum adı öbeğinde işaretsiz yazım ayrı bir **öneri**dir (`yazim.kurum.nispet`): resmî ad ve EBYS başlığı “Millî” (v0.6.0; Kılavuz örnekleri ikisini de kullansa da) |

Son durumda derlemde 6 işaret kaldı; hepsi Kılavuz'un "sık yanlış yazılan kelimeler" tablosundaki gerçek yanlışlar
(`Ünüverste`, `Ünversite`). Maliyet: 9 bin kelimede ~17 ms (kelime başına sonuçlar saklanır).

**Bilerek bırakılanlar.** Uzun köklü gerçek kelime hataları (`Eğitim` yerine `Eğitmen`) ve listede olmayan bir adın
içindeki gerçek kelime hataları yakalanmaz; bunlar başka bir doğru adla ayırt edilemez. Genel istatistik dil modeli,
eklentinin çevrimdışı ve küçük kalma ilkesiyle uyuşmadığı için kullanılmadı.

## 5e. Arz / rica: editör dışındaki bilgiyle denetim (`kapanis-hiyerarsi.ts`, v0.6.0)

Yönetmelik m.16(12) ve Kılavuz §13.1: alt makama “rica ederim”, **üst ve aynı** düzeye “arz ederim”, birlikte
dağıtımda “arz ve rica ederim” / “arz/rica ederim”. Doğru ibare metinden değil, **kimin kime yazdığından**
çıkar; bu bilgi EBYS'de editörün dışındadır:

| Bilgi | Kaynak (Belgenet) |
|---|---|
| Gönderen idare / birim | `#kurumHeaderSatir2`, `#kurumHeaderSatir3` (inplace başlık) |
| Gereği / Bilgi seçimleri | `[id$=":geregiLov:LovSecilenTable_data"] > tr`, `:bilgiLov:`; satırda `.lovItemTitle` (“Karesi Anaokulu Müdürlüğüne”) ve `.lovItemDetail` (DETSİS yolu: “TÜRKİYE CUMHURİYETİ,Taşra Teşkilatı,Balıkesir Valiliği,Karesi Kaymakamlığı,Karesi İlçe Milli Eğitim Müdürlüğü,Karesi Anaokulu Müdürlüğü”) |
| Dağıtım önizlemesi, hitap | `.geregiTable`, `.bilgiTable`, `.hitap` |
| Yedek: editöre elle yazılmış başlık/muhatap | "T.C." sonrası iki satır; büyük harfli yönelme ekli satır; "Dağıtım:" listesi |

İçerik betiği bunları `DocMeta` olarak toplar (`content/doc-meta.ts`) ve çekirdeğe düz metin olarak verir; çekirdek
DOM'u bilmeden test edilir. Okuma editörün kendi formuyla sınırlıdır (birden çok evrak penceresi). Kullanıcı Bilgileri
sekmesinde seçim yapınca editör metni değişmez; bekçi (1 sn) bilgiyi yeniden okur, değiştiyse denetimi tazeler.

**Düzey** önce seçim satırındaki DETSİS yolundan çıkarılır: yoldaki son idare (Cumhurbaşkanlığı, Bakanlık, Valilik,
Kaymakamlık) çapadır; idarenin kendisi ya da doğrudan birimi idarenin düzeyini alır, Kaymakamlığın iki basamak altı
(okul, kurum) 5'tir. Yol yoksa (hitap, editöre yazılmış muhatap) adlardan çıkarılır (`hiyerarsi.ts`): 1 Cumhurbaşkanlığı/TBMM · 2 Bakanlık, Genel Müdürlük · 3 Valilik, il
birimleri · 4 Kaymakamlık, ilçe birimleri · 5 okul/kurum, muhtarlık. Parantezli muhatapta birinci satır esastır
(m.16(12)(c)). Gönderende birim satırı bir okulsa düzey odur: okulun yazısında Kaymakamlık üst makamdır.

| Karar | Neden |
|---|---|
| Üst/aynı düzeye “rica” → **hata** (tüm muhatapların düzeyi biliniyorsa) | Kullanıcının asıl istediği; kural metinde açık |
| Düzeyi bilinmeyen muhatap (üniversite, belediye, tüzel kişi) karara katılmaz | Kılavuz: ast-üst net değilse “arz” uygundur, kamu niteliği olmayan tüzel kişiye “rica”. Ad bunu ayırmaya yetmez |
| Bilinmeyen muhatap varken üst makama “rica” → **uyarı**, iki öneri (arz / arz ve rica) | Bilinmeyen alt makamsa doğru kalıp karmadır |
| Alt makama “arz”, karma dağıtımda tek ibare → **uyarı** | Sınıflandırma sezgidir; asıl risk üst makama “rica”dır |
| Öneri Kılavuz §13.1 tablosundaki kalıpla | “Gereğini rica” → “Gereğini bilgilerinize arz”, “Bilgilerinize arz” → “Bilgilerini rica” |
| Hiçbiri “Tümünü düzelt”e girmez | Muhatap bilgisi yanlış okunmuşsa toplu düzeltme yanlış ibareyi yayar |

**Doğrulandı (v0.6.1):** seçili Gereği/Bilgi satırlarının yapısı gerçek sayfadan alındı (başlık + DETSİS yolu).
İlk sürüm satırın düz metnini okuyordu; yol metne yapıştığı için anaokulu satırındaki “Balıkesir Valiliği” düzeyi
3'e çekiyordu — gerçek örnek olmadan bulunamayacak bir hataydı. Dağıtım önizlemesinin (`.geregiTable`) dolu hâli
henüz görülmedi; seçim tabloları dolu olduğu sürece karar onlardan verilir.

## 6. CKEditor 4 entegrasyonunda öğrendiklerimiz

1. **Belge yeniden yazılır.** `setData()` ve kaynak modundan dönüş iframe belgesini yeniden oluşturur. Her denetim döngüsünde belge kimliği doğrulanır; köprüden `contentDom` olayı da gelir.
2. **`getData()` entity kodlar:** `ç` → `&ccedil;`, `'` → `&#39;`. Karşılaştırma çözülmüş metinle yapılır.
3. **Görünmez karakterler.** CKEditor'ün imleç dolgusu (U+200B), U+FEFF ve PDF/Word'den yapıştırmada çok yaygın olan **yumuşak tire (U+00AD)** kelimeyi böler. TextIndex bunları atlar ama ofset eşlemesini korur.
4. **Boşluk temsili.** Kullanıcının ikinci boşluğu `&nbsp;` olur; kaynaktaki boşluk dizileri ise ekranda teke iner. TextIndex ekranda görünen metni üretir.
5. **Enjeksiyon gerekmez.** İçerik betiği `about:blank` iframe'e enjekte edilmez, gerek de yoktur. Aynı kökenli `contentDocument`'a üst belgeden erişilir.

## 7. Kural kataloğu

### TDK yazım kuralları

| Kural | Ne yakalar | Önem | Bilinçli istisnalar |
|---|---|---|---|
| `yazim.sozluk` | Sözlükte kurulamayan kelime + öneri | hata / uyarı | Cümle içi büyük harf (özel ad), tamamı büyük (kısaltma), noktalı kısaltma, URL/e-posta, `6 ncı`, tırnaktan sonraki ek, birim |
| `baglac.*.morf` | `kitabıda`, `geldide`, `gelecekmi` | hata | Bütün kelime geçerliyse hiç bakılmaz (`kapıda`, `maddede`) |
| `yazim.yaygin` | Sık yanlışlar + **Kılavuz s.54 tablosunun tamamı** (birim testi her satırı doğrular) + §13.6.1 ayrı yazılanlar (`önyargı`, `yanısıra`, `olağandışı`) | hata / uyarı | `bir takım`, `bu gün`, `göz altı`, `direk`, `içtüzük`, `anadili` yalnızca uyarı |
| `yazim.kurum` | Kurum adında sözlük dışı kelime: `Müdürlügüne`, `MİLLİ EĞTİM`, `Bakanlğımıza` (bkz. 5d) | hata | Öbekte kurum başı yoksa; 4 harften kısa; `/` komşusu |
| `yazim.kurum.anlam` | Kurum adında gerçek kelime hatası: `Banlığı`, `Mili Eğitim`, `Kaymaklığına` | uyarı | Bkz. 5d kalkan tablosu |
| `yazim.kurum.nispet` | Kurum adında düzeltme işareti: `Milli Eğitim` → `Millî Eğitim`, `Hakimler` → `Hâkimler` | öneri | Kurum adı öbeği dışında (cins ad: `kilavuz.nispet`) |
| `kapanis.hiyerarsi` | Gönderen ve Gereği/Bilgi düzeyine göre arz / rica (bkz. 5e) | hata / uyarı | Gönderen ya da muhatap düzeyi bilinmiyorsa |
| `yazim.birlesik-fiil` | `arzederim` → `arz ederim` | hata | Ses olaylılar |
| `yazim.birlesik-fiil-bitisik` | `kayıt edildi` → `kaydedildi`, `red etmek` → `reddetmek` | hata | — |
| `kesme.sayi` | `2026da`, `3'de` → `3'te`, `11.00'da` → `11.00'de` | hata | `2B`, `210x297`; saatte sıfır grubu okunmaz |
| `kesme.ozel-ad` | `Ahmetin`, `Ankarada` | hata / uyarı | Kelime cins isim olarak da çözümlenebiliyorsa (`Metindeki`, `Aslı`, `Onur Kurulunda`) atlanır |
| `kesme.kurum` | `Valiliği'ne` → `Valiliğine` | hata | Kısaltmalar (`TBMM'ye`) |
| `baglac.*` | Kapalı sınıf: `banada`, `biliyorumki`, `varmı`; `geliyor mi` → `mu` | hata | `Genel Müdür` (mü+dür biçimine uyar) |
| `noktalama.*`, `bosluk.cift` | Yönetmelik m.16(3) | hata / öneri | Başlık hizalaması, alan adı, `(B,C)` |
| `buyuk-harf.cumle-basi` | Cümle başı küçük harf | uyarı | Kısaltma, sıra sayı, üç nokta, tablo hücresi, madde imi, `e-Yazışma` |
| `tekrar.kelime` | `ve ve` | uyarı | İkilemeler |

### Resmî Yazışma Yönetmeliği (RG 10.06.2020/31151; 2026 itibarıyla değişiklik yok)

Önem derecesi hükmün bağlayıcılığından türetilir:

- "-ır" ile kesin hüküm → **hata**
- Kılavuz önerisi → **uyarı / öneri**
- "-abilir" ile isteğe bağlı → **denetlenmez**

| Kural | Madde | Ne denetler | Önem |
|---|---|---|---|
| `yonetmelik.konu` | 13(1) | Kelimelerin baş harfi büyük (başlık bağlaçları hariç), sonda noktalama yok | hata |
| | K§10 | "Diğer" konu olmaz; `hk.` yerine "Hakkında" | uyarı / öneri |
| `yonetmelik.sayi` | 11(1), K§31 | `E-DETSİS-SDP-kayıt` biçimi, `/` yerine `-` | hata / uyarı |
| `yonetmelik.sira` | 15(5), 16(10) | Harfle sıralama Türk alfabesiyle (c) ç) d) …) | hata |
| `yonetmelik.ilgi` | 15(7), K§12 | Sonda nokta, "tarihli ve" kalıbı, `bila`, eksik sayı, tek ilginin harflenmemesi, metindeki `İlgi (c)` atfının karşılığı | hata / uyarı |
| `yonetmelik.ek` | 18(2), K§13.3 | Tek ek numarasız, sıra, `Ek-3` atfının karşılığı | hata / uyarı |
| `yonetmelik.sayi-yazimi` | 16(7) | Tutarlarda üçlü gruplama ve virgüllü kesir (yıl/kanun no hariç) | hata |
| `yonetmelik.tarih` | 12(1), K§9 | `gg.aa.yyyy`; harfle ayda yalnız ilk harf büyük | öneri |
| `yonetmelik.kisaltma` | 16(11) | İlk kullanımda açık hâli + (KISALTMA) | öneri |
| `yonetmelik.kapanis` | 16(12) | "arz ve rica" / "arz/rica"; sonda nokta | hata |
| `yonetmelik.sureli` | 26(1), K§23 | `GÜNLÜDÜR`; `ÇOK ACELE`, `İVEDİ`, `ACİL` yok | hata |
| `yonetmelik.imza` | 17(3), 17(9), 17(10) | "e-imzalıdır" ibaresi; "Bakan a.", "Genel Müdür V." | hata |
| `yonetmelik.hitap` | 14(3) | "Sayın" | hata |

**Kapsam dışı**, çünkü EBYS'nin kendi sorumluluğunda: yazı tipi ve boyutu, kenar boşlukları, üstveri, sayfa numarası, satır aralıkları.

**Henüz yapılmadı**, çünkü biçim (CSS) düzeyinde denetim gerekiyor: 1,25 cm girinti ve iki yana yaslama. Paragraflar arasındaki boş satır (m.16(4)) artık denetleniyor: TextIndex boş `<p>`'yi (`<p><br></p>`, `<p>&nbsp;</p>`) `"\n\n"` olarak korur.

### Resmî Yazışma Kuralları Kılavuzu (`kilavuz.ts`)

**Kaynak sürümü.** Kurumda dağıtılan baskı **Ocak 2023**'tür (PDF sayfası = kitap sayfası + 4). Şubat 2025 baskısıyla karşılaştırıldı; kural metinleri aynı, üç fark var:

| Konu | Ocak 2023 | Şubat 2025 | Eklentinin tutumu |
|---|---|---|---|
| s.54 tablosu | "Ünvan → **Unvan**" (TDK ile uyumlu) | "Unvan → Ünvan" (tersine çevrilmiş) | **unvan** (2023 + TDK + Yönetmelik m.16(8)) |
| §30 tekit yazısı | yalnızca **alt** idarelere | "alt **veya aynı düzey**" | 2023'e göre öneri; ileti 2025 farkını söyler |
| Künye | İdari İşler Başkanlığı | İdari İşler Genel Sekreterliği | etkisiz |

**Önem derecesi.** Kılavuz "kullanılmaz / yanlıştır" diyor ve tespit kesinse → hata; kural kesin ama metinden okuma bağlama bağlıysa → uyarı; üslup → öneri. Cümle sonu (§13) ve büyük harfle ad (§13.5.1) önerileri tek önerili olsa bile **toplu düzeltmeye girmez**: üslup kararıdır.

| Kural | § | Ne denetler | Önem |
|---|---|---|---|
| `kilavuz.kesme.baglac` | 13.6.3 | `Başkanlığımız'da` → "Başkanlığımız da" / "Başkanlığımızda" (iyelikli kurum adı + kesme + de) | hata, 2 öneri |
| `kilavuz.baglac.te` | 13.6.3 | `hizmet te` → "hizmet de"; yalnızca sert ünsüzden sonra (pekiştirme "ta" ayrımı) | hata |
| `kilavuz.kesme.cins` / `.mevzuat` | 13.6.9.8 | Cins isme kesme (`masa'nın`); küçük harfli mevzuat (`kanun'un` → "Kanun'un" / "kanunun"); büyük harfli belli mevzuatta eksik kesme (`Yönetmeliğin` → "Yönetmelik'in") | hata / uyarı |
| `kilavuz.kesme.ay`, `buyuk-harf.ay` | 13.6.4, 13.6.9.8 | `17 Aralıkta` → "Aralık'ta", `29 ekim` → "Ekim"; ocak/ekim/aralık yalnızca tarih bağlamında | hata |
| `kilavuz.tirnak.kesme` | 13.6.9.6 | `“…Kanunu”'na` → `“…Kanunu”na` | hata |
| `kilavuz.virgul.*` | 13.6.9.2 | `, ve` / `ve,`; `de,`; tekrarlı bağlaç (hem … , hem de); şart ekinden sonra; tek "olup," | hata / öneri |
| `kilavuz.anlatim.ve` | 13.5.3.1 | Cümlede 3. "ve" (ad içindekiler, "tarihli ve", "kurum ve kuruluş" sayılmaz) | öneri |
| `kilavuz.anlatim.zincirleme` | 13.5.3.1 | "Başkanlığının Genel Müdürlüğünün …" — yalnızca üst idare → alt birim zinciri | öneri |
| `kilavuz.anlatim.gereksiz` | 13.5.3.2 | geri iade, hâlen yürürlükte, karşılıklı yazışma, yaklaşık N adet | öneri |
| `kilavuz.sahsi` | 13 | Cümle sonu şahsi (planladık, yapacağız, yapmalısınız) ya da -DIr'siz (yapılacak → yapılacaktır, gönderildi → gönderilmiştir); kapanış, alıntı ve madde imli satır hariç | öneri, elle |
| `kilavuz.bitisik` | 13.6.2 | baş savcı, yayın evi, deprem zede, beyan name; kurum adlarında İç İşleri, Genel Kurmay, Açık Öğretim Fakültesi | hata / uyarı |
| `kilavuz.buyuk-harf.*` | 13.6.4, 13.5.1 | Para birimi (yalnızca tutar ya da "Türk/ABD" ile), "Konya İli", "Göksu mahallesi", "… daire başkanlığı", "Sıfır Atık projesinde" | hata / uyarı / öneri |
| `kilavuz.kisaltma.*` | 13.6.5 | `TDK'dan` → "TDK'den" (harf okunuşu ya da kelime okunuşu: NATO'dan); `kg'den` → "kg'dan"; `T.B.M.M.`; `vb.'leri` | hata |
| `kilavuz.sayi.*` | 13.6.7 | `% 25`, `25%`; `2'şer` → "ikişer" (para tutarı hariç); `ikiyüz` → "iki yüz" (ayraç içindeki ticari tutar hariç) | hata |
| `kilavuz.nispet` | 13.6.8 | resmi/askeri/dini/ilmi/milli + ad → î; "Resmî Gazete"; iyelik okuması ("Atatürk'ün resmi", "Türk askeri") atlanır | öneri, elle |
| `kilavuz.ilgi.*`, `kilavuz.ek.gosterim`, `kilavuz.kapanis.bilgi` | 12.1, 13.1–13.3 | "tarihli E-…" → "tarihli ve"; "İlgi (a)'da", "İlgi'de kayıtlı", "Ek'te yer alan", "Ek-2"; "Bilgilerinize rica" | hata / öneri |
| `kilavuz.muhatap.*` | 11.4 | Muhatap üstünde T.C.; yönelme eki parantezdeki birimde; parantezde birim zinciri; gerçek kişiye yönelme eki | hata / uyarı |
| `kilavuz.ek.sayi` | 15 | Ek maddesinde sayısal bilgi yok ("(2 Sayfa)", "(1 Adet)") | öneri |
| `kilavuz.sureli.*` | 23 | GÜNLÜDÜR'de süre yok; ACELE'de cevap süresi var; Olur belgesinde ibare | uyarı |
| `kilavuz.tekit.duzey` | 30 | "arz ederim" ile biten tekit (ilgi zorunluluğu denetlenmez: EBYS'de İlgi ayrı form alanında) | öneri |
| `kilavuz.imza.ad` | 14.2, 11.3 | "Mehmet A. YILMAZ" | uyarı |
| `kilavuz.paragraf.bosluk` | m.16(4), 31 | İki metin paragrafı arasında boş satır (başlık, muhatap, imza, e-imza notu çevresi hariç) | uyarı |

**Bilinçli olarak alınmayanlar:** cümle ögesi eksikliği ve tamlama kusuru (§13.5.3.4), sıralama/anlam hataları (§13.5.3.3). Bunlar sözdizimsel çözümleme ister; kural tabanlı tahmin yanlış alarmla güveni bozar.

### Kesinlik sınırı

| Örnek | Durum |
|---|---|
| `kitabıda`, `geldide`, `plastiki` | ✅ Faz 2 ile çözüldü (çözümleyici + onarım) |
| `Yılmazın`, `Kaplanın` gibi listede olmayan soyadları | Faz 5: kurum/kullanıcı sözlüğü |
| `o da` ↔ `oda`, `bende` ↔ `ben de` | Yazıldıktan sonra ikisi de geçerli; yalnızca bağlam çözer. Uyarı düzeyinde kalır |

## 8. Yol haritası (inşa sırası)

Bu fazlar bir "MVP sonra genişlet" planı değil; tek bir bütün ürünün inşa sırası.

- **Faz 1 — Editör entegrasyonu + deterministik kurallar** ✅
- **Faz 2 — Morfoloji motoru** ✅
- **Faz 3 — Morfolojiye dayalı kurallar** ✅ (bağlaç ayırma, özel ad, bitişik/ayrı yazım)
- **Faz 4 — Resmî Yazışma Yönetmeliği** ✅
- **Faz 4b — Resmî Yazışma Kuralları Kılavuzu (Ocak 2023)** ✅ metin içi imla, noktalama, anlatım, muhatap, ek, süreli yazı, tekit
- **Faz 5 — Kullanıcı sözlüğü ve ayarlar:**
  - kalıcı yoksay ve "sözlüğe ekle" (`chrome.storage.local`),
  - kurum geneli sözlük ve politika (`chrome.storage.managed`),
  - kural aç/kapa.
- **Faz 6 — Paketleme ve dağıtım:**
  - kurum BT'si için güvenlik dokümanı,
  - zorunlu kurulum (`ExtensionInstallForcelist`),
  - sürümleme.
- **Aday özellikler:**
  - imzalamadan önce son kontrol,
  - rakam ve yazı tutarlılığı ("1.250,00 TL (Bin iki yüz elli Türk lirası)"),
  - CSS düzeyi biçim denetimleri (1,25 cm girinti, iki yana yaslama).

## 9. Açık sorular

1. **EBYS'nin gerçek adresi** (`ebys.config.json`).
2. **Kurum bilgisayarlarındaki Chrome sürümü.** `world: "MAIN"` Chrome 111 ister. Windows 7/8.1'de Chrome 109'da kalmışsa köprü `<script src>` enjeksiyonuyla yüklenmeli.
3. **Etiket widget'ları.** EBYS etiket alanlarını `contenteditable=false` olarak mı üretiyor? Gerçek DOM ile doğrulanmalı.
4. ~~Sayı, Konu, İlgi alanlarının yeri~~ — **çözüldü (v0.5.0).** Ayrı form alanlarıdır. Konu denetlenir (bkz. 5c); Sayı sistem üretir, İlgi seçilerek eklenir. Editör içinde yazılırlarsa (başka kurumlar) Yönetmelik kuralları yine çalışır; satır yoksa sessiz kalır.
