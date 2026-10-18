import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';
import { distributiveWords, integerToWords } from '../../src/core/numbers.ts';
import { sentenceSpans } from '../../src/core/rules/kilavuz.ts';

const only = (text: string, prefix: string) => check(text).filter((i) => i.ruleId.startsWith(prefix));
const first = (text: string, prefix: string) => only(text, prefix).map((i) => [i.text, i.suggestions[0]]);
const sugg = (text: string, prefix: string) => only(text, prefix).map((i) => i.suggestions);

/** Kılavuz (Ocak 2023) s.54 "Resmî yazışmalarda sıklıkla yanlış kullanılan kelimeler" — tablonun tamamı */
const TABLE: Array<[string, string]> = [
  ['Acenta', 'Acente'], ['Alt yapı', 'Altyapı'], ['Ardarda', 'Art arda'], ['Askari', 'Asgari'], ['Asvalt', 'Asfalt'], ['Ahçı', 'Aşçı'], ['Aşcı', 'Aşçı'],
  ['Ayrıyeten', 'Ayrıca'], ['Ayrıyetten', 'Ayrıca'], ['Azerbeycan', 'Azerbaycan'], ['Baş hekim', 'Başhekim'], ['Bir biri', 'Birbiri'], ['Bir çok', 'Birçok'],
  ['Bir kaç', 'Birkaç'], ['Birşey', 'Bir şey'], ['Bir takım', 'Birtakım'], ['Bu gün', 'Bugün'], ['Burda', 'Burada'], ['Deyinmek', 'Değinmek'],
  ['Derc etmek', 'Dercetmek'], ['Diyaspora', 'Diaspora'], ['Direk', 'Direkt'], ['Döküman', 'Doküman'], ['Döndermek', 'Döndürmek'], ['Entellektüel', 'Entelektüel'],
  ['Erezyon', 'Erozyon'], ['Evraklar', 'Evrak'], ['Fesih etmek', 'Feshetmek'], ['Göz altı', 'Gözaltı'], ['Gece kondu', 'Gecekondu'], ['Harfiyat', 'Hafriyat'],
  ['Hastahane', 'Hastane'], ['Herbiri', 'Her biri'], ['Her hangi', 'Herhangi'], ['Herşey', 'Her şey'], ['Hizmetiçi', 'Hizmet içi'], ['Hukuğu', 'Hukuku'],
  ['İnsiyatif', 'İnisiyatif'], ['İşbirliği', 'İş birliği'], ['İtibariyle', 'İtibarıyla'], ['İzalasyon', 'İzolasyon'], ['Kayıt etmek', 'Kaydetmek'], ['Klavuz', 'Kılavuz'],
  ['Kırahathane', 'Kıraathane'], ['Krathane', 'Kıraathane'], ['Kominikasyon', 'Komünikasyon'], ['Komünükasyon', 'Komünikasyon'], ['Küsür', 'Küsur'],
  ['Laboratuar', 'Laboratuvar'], ['Labratuvar', 'Laboratuvar'], ['Labaratuar', 'Laboratuvar'], ['Lağv etmek', 'Lağvetmek'], ['Mataryel', 'Materyal'], ['Mebla', 'Meblağ'],
  ['Metod', 'Metot'], ['Method', 'Metot'], ['Mevzuatlar', 'Mevzuat'], ['Mezkür', 'Mezkûr'], ['Meskür', 'Mezkûr'], ['Milletler arası', 'Milletlerarası'], ['Muhattap', 'Muhatap'],
  ['Mütevazi', 'Mütevazı'], ['Mühled', 'Mühlet'], ['Mütahit', 'Müteahhit'], ['Mütaakip', 'Müteakip'], ['Nufüs', 'Nüfus'], ['Olağan üstü', 'Olağanüstü'], ['Orjinal', 'Orijinal'],
  ['Ortadoğu', 'Orta Doğu'], ['Öğe', 'Öge'], ['Parağraf', 'Paragraf'], ['Parakende', 'Perakende'], ['Personeller', 'Personel'], ['Proğram', 'Program'], ['Provakasyon', 'Provokasyon'],
  ['Rakkam', 'Rakam'], ['Satınalma', 'Satın alma'], ['Sebeb', 'Sebep'], ['Sevketmek', 'Sevk etmek'], ['Seyehat', 'Seyahat'], ['Sezeryan', 'Sezaryen'], ['Suç üstü', 'Suçüstü'],
  ['Şifai', 'Şifahi'], ['Sözkonusu', 'Söz konusu'], ['Sipiker', 'Spiker'], ['Şöför', 'Şoför'], ['Tahüt', 'Taahhüt'], ['Taktir', 'Takdir'], ['Tasviye', 'Tasfiye'], ['Tastik', 'Tasdik'],
  ['Tekrardan', 'Tekrar'], ['Tebli', 'Tebliğ'], ['Tebellü', 'Tebellüğ'], ['Tensib', 'Tensip'], ['Tesbit', 'Tespit'], ['Teşfik', 'Teşvik'], ['Taşaron', 'Taşeron'], ['Ünvan', 'Unvan'],
  ['Ultimatom', 'Ültimatom'], ['Ültümaton', 'Ültimatom'], ['Ünüverste', 'Üniversite'], ['Ünversite', 'Üniversite'], ['Uslup', 'Üslup'], ['Üzre', 'Üzere'], ['ve ya', 'veya'],
  ['yada', 'ya da'], ['Yalnış', 'Yanlış'], ['Yanlız', 'Yalnız'], ['Yasadışı', 'Yasa dışı'], ['Yeralmak', 'Yer almak'], ['Yövmiye', 'Yevmiye'], ['Yurtiçi', 'Yurt içi'],
  ['Yurtdışı', 'Yurt dışı'], ['Yükseköğrenim', 'Yükseköğretim'], ['Yüksek öğretim', 'Yükseköğretim'],
];

test('Kılavuz s.54 tablosunun her satırı yakalanır ve doğru öneri verilir', () => {
  const lower = (s: string) => s.toLocaleLowerCase('tr');
  const missing: string[] = [];
  for (const [wrong, right] of TABLE) {
    const text = `Metinde ${lower(wrong)} geçmektedir.`;
    const at = 'Metinde '.length;
    const hit = check(text).some((i) => i.start === at && i.suggestions.some((s) => lower(s) === lower(right)));
    if (!hit) missing.push(`${wrong} → ${right}`);
  }
  assert.deepEqual(missing, []);
});

test('§13.6.3 bağlaç de/da: kesme, ta/te, virgül', () => {
  assert.deepEqual(sugg('Başkanlığımız’da bilişim sistemleri kullanılmaktadır.', 'kilavuz.kesme.baglac'), [['Başkanlığımız da', 'Başkanlığımızda']]);
  assert.deepEqual(first('Malzeme de hizmet te ihaleyle alınacaktır.', 'kilavuz.baglac.te'), [['hizmet te', 'hizmet de']]);
  assert.deepEqual(first('Bu kitap ta alınacaktır.', 'kilavuz.baglac.te'), [['kitap ta', 'kitap da']]);
  // pekiştirme edatı "ta", sözün kendisinden söz etme
  assert.deepEqual(only('Bu sorun ta başından beri vardır.', 'kilavuz.baglac.te'), []);
  assert.deepEqual(only('Bağlaç hiçbir zaman ta/te biçiminde yazılmaz.', 'kilavuz.baglac.te'), []);
  // özel ada gelen bulunma eki doğrudur
  assert.deepEqual(only('Toplantı Ahmet’te yapılacaktır. Deniz’de tatil yapılmaz.', 'kilavuz.kesme'), []);
  assert.deepEqual(first('Biz de, bu konuda görüş bildirmiştir.', 'kilavuz.virgul.baglac'), [[',', '']]);
});

test('§13.6.9.8 kesme: cins isim, mevzuat, tırnak, ay adı', () => {
  assert.deepEqual(first('Bu masa’nın üstü.', 'kilavuz.kesme.cins'), [['masa’nın', 'masanın']]);
  assert.deepEqual(sugg('Bu kanun’un 5. maddesi uygulanır.', 'kilavuz.kesme.mevzuat'), [['Kanun’un', 'kanunun']]);
  assert.deepEqual(only('Bu Kanun’un 17. maddesi ile Yönetmelik’in 2’nci maddesi.', 'kilavuz.kesme'), []);
  // ölçü birimi ve kısaltma küçük harfli olsa da kesme alır
  assert.deepEqual(only('Paket 5 kg’dan ağırdır.', 'kilavuz.kesme'), []);
  assert.deepEqual(first('“Devlet Memurları Kanunu”’na göre işlem yapılır.', 'kilavuz.tirnak'), [['’', '']]);
  assert.deepEqual(only('“Devlet Memurları Kanunu”na göre işlem yapılır.', 'kilavuz.tirnak'), []);
  assert.deepEqual(first('Başvurular 17 Aralıkta sona erecektir.', 'kilavuz.kesme.ay'), [['Aralıkta', "Aralık'ta"]]);
  assert.deepEqual(first('Toplantı 29 ekim günü yapılacaktır.', 'kilavuz.buyuk-harf.ay'), [['ekim', 'Ekim']]);
  assert.deepEqual(first('Rapor 27 Kasım 2019 Cumaya kadar tamamlanır.', 'kilavuz.kesme.ay'), [['Cumaya', "Cuma'ya"]]);
  assert.deepEqual(only('Lale Festivali 25 Haziran’da başlayacaktır.', 'kilavuz'), []);
});

test('§13.6.9.2 virgül: ve/veya/yahut, tekrarlı bağlaç, şart, zarf-fiil', () => {
  assert.deepEqual(first('Kalem, defter, ve silgi alınmıştır.', 'kilavuz.virgul.ve'), [[',', '']]);
  assert.deepEqual(first('Kalem ve, defter alınmıştır.', 'kilavuz.virgul.ve'), [[',', '']]);
  assert.deepEqual(first('Talep reddedilecek, ya da süre uzatılacaktır.', 'kilavuz.virgul.ve'), [[',', '']]);
  assert.deepEqual(first('Hem malzeme alınacak, hem de hizmet satın alınacaktır.', 'kilavuz.virgul.tekrarli'), [[',', '']]);
  assert.deepEqual(only('Çalışmalar tamamlanmış, hem de planlanandan önce bitirilmiştir.', 'kilavuz.virgul.tekrarli'), []);
  assert.deepEqual(only('Kanunlar, Cumhurbaşkanlığı Kararnameleri ve Yönetmelikler dikkate alınmıştır.', 'kilavuz.virgul'), []);
  assert.equal(only('Uygun görülürse, işlem yapılacaktır.', 'kilavuz.virgul.sart')[0]?.severity, 'oneri');
  assert.deepEqual(only('Fransa, İtalya ve Almanya ile görüşülmüştür.', 'kilavuz.virgul.sart'), []);
  // Kılavuz'un kendi örneği: "olup," ardından başka zarf-fiil gelirse virgül yerindedir
  assert.deepEqual(only('Kurumumuz gerekli işlemleri gerçekleştirmiş olup, tarafınıza ayrıca bilgilendirme yapılarak çalışmalar sonuçlandırılmış olacaktır.', 'kilavuz.virgul'), []);
  assert.equal(only('Kurumumuz gerekli işlemleri gerçekleştirmiş olup, süreç tamamlanmıştır.', 'kilavuz.virgul.zarf-fiil').length, 1);
});

test('§13.5.3 anlatım: "ve" tekrarı, zincirlenme, gereksiz kelime', () => {
  // Kılavuz örneği: 5 "ve" → üçüncüsü işaretlenir; düzeltilmiş hâli (2 "ve") temiz
  assert.equal(only('Bu iş ve işlemler, söz konusu yönetmelik ve genelgede idari ve hukuki açıdan önem ve öncelik arz etmektedir.', 'kilavuz.anlatim.ve').length, 1);
  assert.deepEqual(only('Bu iş ve işlemler, söz konusu yönetmelik ile genelgede idari, hukuki açıdan önem ve öncelik arz etmektedir.', 'kilavuz.anlatim.ve'), []);
  // ad içindeki "ve" sayılmaz
  assert.deepEqual(only('Hazine ve Maliye Bakanlığı ile Kültür ve Turizm Bakanlığı ve Çevre ve Şehircilik Bakanlığı görüşmüştür.', 'kilavuz.anlatim.ve'), []);
  assert.deepEqual(
    first('Cumhurbaşkanlığı İdari İşler Başkanlığının Destek ve Mali Hizmetler Genel Müdürlüğünün Bilgi ve Belge Yönetimi Daire Başkanlığının çalışmaları devam etmektedir.', 'kilavuz.anlatim.zincirleme'),
    [['Başkanlığının', 'Başkanlığı'], ['Müdürlüğünün', 'Müdürlüğü']],
  );
  // eş görevli iki ilgi eki zincir değildir
  assert.deepEqual(only('Ticaret Bakanlığının ve Maliye Bakanlığının görüşleri alınmıştır.', 'kilavuz.anlatim.zincirleme'), []);
  assert.deepEqual(first('Belge geri iade edilmiştir.', 'kilavuz.anlatim.gereksiz'), [['geri iade', 'iade']]);
  assert.deepEqual(first('Hâlen yürürlükte olan Yönetmelik uygulanır.', 'kilavuz.anlatim.gereksiz'), [['Hâlen yürürlükte', 'Yürürlükte']]);
  assert.deepEqual(first('Gerekli yazışma karşılıklı olarak yapılmıştır.', 'kilavuz.anlatim.gereksiz'), [['yazışma karşılıklı olarak', 'yazışma']]);
  assert.deepEqual(sugg('Yaklaşık 350 adet başvuru yapılmıştır.', 'kilavuz.anlatim.gereksiz'), [['350', 'Yaklaşık 350']]);
});

test('§13 şahsileştirilmiş anlatım ve -DIr ile bitmeyen cümle', () => {
  const t = 'Bu konuyu planladık. Toplantıyı yapacağız. İşlemleri yapmalısınız. Süreç devam ediyor. Rapor Bakanlığa gönderildi. Rapor hazırlanacak. Bilgilerinize arz ederim.';
  assert.deepEqual(
    only(t, 'kilavuz.sahsi').map((i) => [i.text, i.suggestions[0] ?? '']),
    [['planladık', ''], ['yapacağız', ''], ['yapmalısınız', ''], ['ediyor', ''], ['gönderildi', 'gönderilmiştir'], ['hazırlanacak', 'hazırlanacaktır']],
  );
  assert.deepEqual(only('Söz konusu işlemler tamamlanmıştır. Gereğini arz ederim.', 'kilavuz.sahsi'), []);
  // alıntı ve isim cümleleri dokunulmaz
  assert.deepEqual(only('Bakan “Çalışmaları planladık.” demiştir. Toplantı yeri Ankara.', 'kilavuz.sahsi'), []);
});

test('§13.6.1–13.6.2 bitişik yazılan birleşik kelimeler', () => {
  assert.deepEqual(
    first('Yayın evi, öğretmen evinde, baş savcı, deprem zedelere ve beyan name.', 'kilavuz.bitisik'),
    [['Yayın evi', 'Yayınevi'], ['öğretmen evinde', 'öğretmenevinde'], ['baş savcı', 'başsavcı'], ['deprem zedelere', 'depremzedelere'], ['beyan name', 'beyanname']],
  );
  assert.deepEqual(first('İç İşleri Bakanlığı ile Genel Kurmay Başkanlığı görüşmüştür.', 'kilavuz.bitisik'), [['İç İşleri', 'İçişleri'], ['Genel Kurmay', 'Genelkurmay']]);
  assert.deepEqual(only('Ülkenin iç işlerine karışılmaz. Basım evrakı hazırlanmıştır.', 'kilavuz.bitisik'), []);
});

test('§13.6.4 / §13.5.1 büyük harf', () => {
  assert.deepEqual(first('Tutar 1.500 Lira olup Türk Lirası cinsinden ödenir.', 'kilavuz.buyuk-harf.para'), [['Lira', 'lira'], ['Lirası', 'lirası']]);
  assert.deepEqual(first('Proje Konya İli sınırlarında yürütülecektir.', 'kilavuz.buyuk-harf.yer'), [['İli', 'ili']]);
  assert.deepEqual(only('Beşkonak Köyü Muhtarlığı ile görüşülmüştür.', 'kilavuz.buyuk-harf.yer'), []);
  assert.deepEqual(first('Çalışma Göksu mahallesinde yapılacaktır.', 'kilavuz.buyuk-harf.cadde'), [['mahallesinde', "Mahallesi'nde"]]);
  assert.deepEqual(first('Bu konuda Bilgi ve Belge Yönetimi daire başkanlığı ile görüşülmüştür.', 'kilavuz.buyuk-harf.kurum'), [['daire başkanlığı', 'Daire Başkanlığı']]);
  assert.deepEqual(only('Bakanlığımızın genel müdürlüğü ile görüşülmüştür. Taşra teşkilatı bulunan idareler.', 'kilavuz.buyuk-harf.kurum'), []);
  assert.deepEqual(first('Sıfır Atık projesinde görev alınmıştır.', 'kilavuz.buyuk-harf.ad'), [['projesinde', "Projesi'nde"]]);
  assert.deepEqual(first('Personel Servisi hizmet alımının ihalesi yapılmıştır.', 'kilavuz.buyuk-harf.ad'), [['hizmet alımının', "Hizmet Alımı'nın"]]);
  // başlık biçimli satırlar (Konu, imza) bu kurallardan muaftır
  assert.deepEqual(only('Konu: Türk Lirası Ödemeleri', 'kilavuz.buyuk-harf'), []);
});

test('§13.6.5 kısaltmalar', () => {
  assert.deepEqual(first("TDK'dan ve TL'nın yazısı.", 'kilavuz.kisaltma.ek'), [["TDK'dan", "TDK'den"], ["TL'nın", "TL'nin"]]);
  assert.deepEqual(only("NATO'dan, ASELSAN'da, UNESCO'ya, TBMM'nin, ABD'de, THY'de, TÜBİTAK'a, YÖK'ten ve YÖK'e.", 'kilavuz.kisaltma'), []);
  assert.deepEqual(only("Ahmet YILMAZ'ın dilekçesi.", 'kilavuz.kisaltma'), []);
  assert.deepEqual(first("Yük 5 kg'den fazladır.", 'kilavuz.kisaltma.ek'), [["kg'den", "kg'dan"]]);
  assert.deepEqual(first('Bu yetki T.B.M.M.’nin işidir.', 'kilavuz.kisaltma.nokta'), [['T.B.M.M.’nin', 'TBMM’nin']]);
  assert.deepEqual(only('T.C. Ticaret Bakanlığı', 'kilavuz.kisaltma'), []);
  assert.equal(only("Kalem, silgi vb.'leri ile 5 No.'lu oda.", 'kilavuz.kisaltma.kesme').length, 2);
  assert.deepEqual(only('Kalem, silgi vb.leri ile 5 No.lu oda.', 'kilavuz.kisaltma'), []);
});

test('§13.6.7 sayılar: yüzde, üleştirme, ayrı yazım', () => {
  assert.deepEqual(first('Oran % 25 olarak belirlenmiştir.', 'kilavuz.sayi.yuzde'), [['% ', '%']]);
  assert.deepEqual(first('Oran 25% olarak belirlenmiştir.', 'kilavuz.sayi.yuzde'), [['25%', '%25']]);
  assert.deepEqual(only('Oran %25 olarak belirlenmiştir.', 'kilavuz.sayi'), []);
  assert.deepEqual(
    first("Personele 2'şer, 9'ar ve 100'er adet dağıtılmıştır.", 'kilavuz.sayi.ulestirme'),
    [["2'şer", 'ikişer'], ["9'ar", 'dokuzar'], ["100'er", 'yüzer']],
  );
  assert.deepEqual(first('Toplam ikiyüz kişi ve onbeşer adet.', 'kilavuz.sayi.ayri'), [['ikiyüz', 'iki yüz'], ['onbeşer', 'on beşer']]);
  // ad ve birleşik kelimeler sayı değildir
  assert.deepEqual(only('Birbirine, Ondokuz Mayıs Üniversitesi, yüzbaşı ve binbaşı.', 'kilavuz.sayi'), []);
  // ticari belgede ayraç içindeki tutar bitişik yazılır
  assert.deepEqual(only('650,35 (altıyüzelliTL,otuzbeşkr)', 'kilavuz.sayi.ayri'), []);
});

test('sayı okunuşu yardımcıları', () => {
  assert.equal(integerToWords(1250), 'bin iki yüz elli');
  assert.equal(integerToWords(2_000_365), 'iki milyon üç yüz altmış beş');
  assert.equal(distributiveWords(4), 'dörder');
  assert.equal(distributiveWords(60), 'altmışar');
  assert.equal(distributiveWords(1000), 'biner');
  assert.equal(distributiveWords(20), 'yirmişer');
});

test('§13.6.8 nispet î', () => {
  assert.deepEqual(
    first('Resmi yazılarda askeri okul ve dini bilgiler kullanılır.', 'kilavuz.nispet'),
    [['Resmi', 'Resmî'], ['askeri', 'askerî'], ['dini', 'dinî']],
  );
  // iyelik okuması: "Atatürk'ün resmi", "Türk askeri", "İslam dini"; kurum adı "Milli Eğitim"
  assert.deepEqual(only("Atatürk'ün resmi asılmıştır. Türk askeri görev yapar. İslam dini ve Milli Eğitim Bakanlığı.", 'kilavuz.nispet'), []);
});

test('Belge düzeni: İlgi kalıbı, kapanış, metin içi gösterim', () => {
  assert.deepEqual(first('Bakanlığın 01.09.2019 tarihli E-84801842-902.02-1042580 sayılı yazısı incelenmiştir.', 'kilavuz.ilgi.tarihli-ve'), [['tarihli', 'tarihli ve']]);
  assert.deepEqual(only('Bakanlığın 01.09.2019 tarihli ve E-84801842-902.02-1042580 sayılı yazısı.', 'kilavuz.ilgi'), []);
  assert.deepEqual(first('Gereğini bilgilerinize rica ederim.', 'kilavuz.kapanis.bilgi'), [['Gereğini bilgilerinize rica', 'Bilgilerini ve gereğini rica']]);
  assert.deepEqual(only('Bilgilerinize arz ederim. Bilgilerini rica ederim.', 'kilavuz.kapanis'), []);
  assert.deepEqual(first('İlgi (a)da kayıtlı yazı incelenmiştir.', 'kilavuz.ilgi.gosterim'), [['da', "'da"]]);
  assert.deepEqual(first('İlgide kayıtlı yazı incelenmiştir.', 'kilavuz.ilgi.gosterim'), [['İlgide', "İlgi'de"]]);
  assert.deepEqual(first('Liste ekte yer almaktadır.', 'kilavuz.ek.gosterim'), [['ekte', "Ek'te"]]);
  assert.deepEqual(only('Dilekçe ekte gönderilmiştir.', 'kilavuz.ek.gosterim'), []); // TDK'ye uygun, gürültü olmasın
  assert.deepEqual(first("Hususlar Ek 2'de belirtilmiştir.", 'kilavuz.ek.gosterim'), [['Ek 2', 'Ek-2']]);
  // mevzuattaki "Ek 1'inci madde" ek gösterimi değildir
  assert.deepEqual(only("Kanunun Ek 1'inci maddesi.", 'kilavuz.ek.gosterim'), []);
  assert.deepEqual(only("İlgi (a)'da kayıtlı yazı ve Ek-1'de belirtilen liste Ek'te yer almaktadır.", 'kilavuz'), []);
});

test('§11.4 muhatap', () => {
  assert.deepEqual(first('T.C.\nCUMHURBAŞKANLIĞINA', 'kilavuz.muhatap.tc'), [['T.C.', '']]);
  assert.deepEqual(only('T.C.\nTİCARET BAKANLIĞI\nPersonel Genel Müdürlüğü', 'kilavuz.muhatap'), []);
  assert.deepEqual(
    first('HAZİNE VE MALİYE BAKANLIĞI\n(Gelir İdaresi Başkanlığına)', 'kilavuz.muhatap.yonelme'),
    [['BAKANLIĞI', 'BAKANLIĞINA'], ['na', '']],
  );
  assert.deepEqual(only('HAZİNE VE MALİYE BAKANLIĞINA\n(Gelir İdaresi Başkanlığı)', 'kilavuz.muhatap'), []);
  assert.equal(only('CUMHURBAŞKANLIĞINA\n(İdari İşler Başkanlığı - Hukuk ve Mevzuat Genel Müdürlüğü)', 'kilavuz.muhatap.zincir')[0]?.severity, 'uyari');
  assert.deepEqual(first("Sayın Ahmet YILMAZ'A", 'kilavuz.muhatap.kisi'), [["'A", '']]);
});

test('§15 ek, §23 süreli yazı, §30 tekit, §14.2 imza', () => {
  assert.deepEqual(first('Ek:\n1- Liste\n2- CD (1 Adet)', 'kilavuz.ek.sayi'), [['Liste', undefined]]);
  assert.deepEqual(only('Ek: Kişi Listesi (20 Kişi)', 'kilavuz.ek'), []);
  assert.deepEqual(only('Ek: Ek Listesi', 'kilavuz.ek'), []);

  assert.equal(only('GÜNLÜDÜR\nKonu hakkında görüş bildirilmesi gerekmektedir.', 'kilavuz.sureli.sure').length, 1);
  assert.deepEqual(only('GÜNLÜDÜR\nGörüşlerin 15 gün içinde bildirilmesi gerekmektedir.', 'kilavuz.sureli'), []);
  assert.equal(only('ACELE\nGörüşlerin en geç 15.10.2026 tarihine kadar bildirilmesi gerekmektedir.', 'kilavuz.sureli.sure').length, 1);
  assert.equal(only('ACELE\nOLUR\nTalep uygun görülmüştür.', 'kilavuz.sureli.olur').length, 1);

  assert.equal(only('Daha önce istenen bilgilerin tekiden gönderilmesini rica ederim.', 'kilavuz.tekit.ilgi').length, 1);
  assert.deepEqual(only('İlgi: 01.09.2019 tarihli ve E-1-2-3 sayılı yazımız.\nBilgilerin tekiden gönderilmesini rica ederim.', 'kilavuz.tekit'), []);
  assert.equal(only('İlgi: 01.09.2019 tarihli ve E-1-2-3 sayılı yazımız.\nKonunun tekidini arz ederim.', 'kilavuz.tekit.duzey').length, 1);

  assert.deepEqual(first('Mehmet A. YILMAZ\nGenel Müdür', 'kilavuz.imza.ad'), [['A.', undefined]]);
  assert.deepEqual(only('Prof. Dr. Ali YILMAZ\nRektör', 'kilavuz.imza'), []);
});

test('m.16(4): metin paragrafları arasında boş satır', () => {
  const p1 = 'Başkanlığımız tarafından yürütülen çalışmalar kapsamında gerekli inceleme yapılmıştır.';
  const p2 = 'Söz konusu rapor ilgili birimlerle paylaşılmış olup değerlendirmeler devam etmektedir.';
  assert.deepEqual(first(`${p1}\n\n${p2}`, 'kilavuz.paragraf'), [['Söz', undefined]]);
  assert.deepEqual(only(`${p1}\n${p2}`, 'kilavuz.paragraf'), []);
  // başlık, muhatap, imza, e-imza notu çevresindeki boşluk olağandır
  assert.deepEqual(only(`TİCARET BAKANLIĞINA\n\n${p1}\n\nBilgilerinize arz ederim.`, 'kilavuz.paragraf'), []);
  assert.deepEqual(only(`${p1}\n\nBu belge, güvenli elektronik imza ile imzalanmıştır.`, 'kilavuz.paragraf'), []);
});

test('cümle bölücü: kısaltma ve sıra sayısı noktası cümleyi bitirmez', () => {
  const t = 'Kanun’un 5. maddesi vb. hükümler Dr. Ali YILMAZ tarafından incelenmiştir. İkinci cümle.';
  assert.deepEqual(sentenceSpans(t).map((s) => t.slice(s.start, s.end)), ['Kanun’un 5. maddesi vb. hükümler Dr. Ali YILMAZ tarafından incelenmiştir.', 'İkinci cümle.']);
});

test('Bağımsız incelemede bulunan yanlış alarmlar (gerileme kalkanı)', () => {
  const clean = (t: string, prefix = 'kilavuz') => assert.deepEqual(only(t, prefix).map((i) => `${i.ruleId}:${i.text}`), [], t);
  clean('Afyonkarahisar ili Dinar ilçesinde, Frankfurt ve Berlin ile Europol ve Eurostat çalışmaları yapılmıştır.');
  clean('İlimizde faaliyet gösteren 12 ocak denetlenmiştir. Kooperatife 2 ekim makinesi verilmiştir.');
  clean('Bu sorun ta 2010 yılından beri sürmektedir. Başvurular ta Ankara’dan gelmektedir.');
  clean('Öğrencinin Açık Öğretim Lisesine kaydı yapılmıştır.');
  clean('Kurul kararında ‘belge yönetimi’ne ilişkin hususlar yer almaktadır.');
  clean("Ahmet Yalnız'da bulunan evraklar teslim alınmıştır.");
  clean("Her personele 2.500'er TL ödeme yapılacaktır.");
  clean('Müdür, öğretmen evine taziye ziyaretinde bulunmuştur. Ordu evlerinde hasar tespit edilmiştir.', 'kilavuz.bitisik.x');
  clean('Görev yapan personel Ahmet AYDIN.\na) Yerinde denetim.\nc) Taşınmazın tapu kaydı.', 'kilavuz.sahsi');
  clean('Ankara Valiliğinin Sağlık Bakanlığının talebi üzerine başlattığı çalışmalar sürmektedir.', 'kilavuz.anlatim.zincirleme');
  clean('Öğrenci bir Alman üniversitesinde okumaktadır. Ahmet YILMAZ genel müdürlüğü döneminde görev yapmıştır.', 'kilavuz.buyuk-harf.kurum');
  clean('İlimiz Bursa, Bilecik ve Eskişehir ile sınırdır. Kurumumuz ise, söz konusu talebi incelemiştir.', 'kilavuz.virgul.sart');
  clean('Kamu kurum ve kuruluşlarının iş ve işlemlerinde usul ve esaslara uyulur.', 'kilavuz.anlatim.ve');
  clean('Ek: 3 Adet CD\n1- Personel Listesi (Excel Dosyası, 20 Kişi)', 'kilavuz.ek');
  clean('DEKANLIĞINA\n(Fen - Edebiyat Fakültesi Dekanlığı)', 'kilavuz.muhatap.zincir');
  clean("CD'ye kayıtlı belgeler ile XX'nci yüzyıl.", 'kilavuz.kisaltma');
  // Öğütücü değil, doğru öneri: ince uyumlu alıntılar ve özel adlar
  assert.deepEqual(sugg("Toplantı kontrol'de yapılır.", 'kilavuz.kesme.baglac'), [['kontrol de', 'kontrolde']]);
  assert.deepEqual(only("Toplantıya Kemal'e ve Celal'in katılımı sağlanmıştır.", 'kesme'), []);
  assert.deepEqual(sugg('Bu konu T.B.M.M. Genel Kurulunda görüşülmüştür.', 'kilavuz.kisaltma.nokta'), [['TBMM', 'TBMM.']]);
});

test('İncelemede bulunan kaçırılmış durumlar', () => {
  assert.deepEqual(first('Sayın Ahmet YILMAZA', 'kilavuz.muhatap.kisi'), [['YILMAZA', 'YILMAZ']]);
  assert.deepEqual(only('Sayın Ahmet KAYA', 'kilavuz.muhatap'), []);
  assert.deepEqual(
    first("Bu Kanunun 17'nci maddesi, Yönetmeliğin ekleri ve Elektronik İmza Kanununa göre işlem yapılır.", 'kilavuz.kesme.mevzuat'),
    [['Kanunun', "Kanun'un"], ['Yönetmeliğin', "Yönetmelik'in"], ['Kanununa', "Kanunu'na"]],
  );
  assert.deepEqual(only('5070 sayılı Elektronik İmza Kanunu ve Kanunlar uygulanır.', 'kilavuz.kesme.mevzuat'), []);
  assert.deepEqual(first("Karar Resmi Gazete'de yayımlanmıştır.", 'kilavuz.nispet'), [['Resmi', 'Resmî']]);
  assert.deepEqual(first('Hastanenin baş hekimi ile görüşülmüştür.', 'kilavuz.bitisik'), [['baş hekimi', 'başhekimi']]);
  assert.deepEqual(first('Tüm askeri birlikler hazırdır.', 'kilavuz.nispet'), [['askeri', 'askerî']]);
  const p1 = 'Başkanlığımız tarafından yürütülen çalışmalar kapsamında gerekli inceleme yapılmıştır.';
  assert.equal(only(`${p1}\n\nKonuya ilişkin değerlendirmeler ilgili birimlerle paylaşılmış bulunmaktadır.`, 'kilavuz.paragraf').length, 1);
  assert.equal(only("GÜNLÜDÜR\nGörüşlerin bir hafta içinde bildirilmesi gerekmektedir.", 'kilavuz.sureli').length, 0);
  assert.equal(only('ACELE\n01.01.2024 tarihinden 31.03.2024 tarihine kadar yapılan ödemeler incelenmiştir.', 'kilavuz.sureli').length, 0);
});
