import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';

const only = (text: string, prefix: string) => check(text).filter((i) => i.ruleId.startsWith(prefix));
const fixes = (text: string, prefix: string) => only(text, prefix).map((i) => [i.text, i.suggestions[0], i.ref]);

test('Konu (m.13): resmî örnekler işaretlenmez', () => {
  for (const ok of [
    'Konu : Personel Alımı Hakkında Görüş Talebi',
    'Konu : Emeklilik Talebi (Adı SOYADI)',
    'Konu : Ulusal Elektronik Tebligat Sistemi (UETS)',
    'Konu : Yurt Dışı Görevlendirme ve Harcırah İşlemleri',
  ]) assert.deepEqual(only(ok, 'yonetmelik.konu'), [], ok);
});

test('Konu (m.13): ayrıntılı', () => {
  const got = only('Konu: Orta vadeli Program.', 'yonetmelik.konu').map((i) => i.ruleId + ':' + i.text);
  assert.deepEqual(got.sort(), ['yonetmelik.konu.buyuk-harf:vadeli', 'yonetmelik.konu.noktalama:.']);
  assert.equal(only('Konu: Diğer', 'yonetmelik.konu.diger')[0]?.severity, 'uyari');
  assert.deepEqual(fixes('Konu: Toplantı hk.', 'yonetmelik.konu.hk').map((x) => x[1]), ['Hakkında']);
});

test('Sayı (m.11)', () => {
  assert.deepEqual(only('Sayı : E-67915368-903.07.02-4752', 'yonetmelik.sayi'), []);
  assert.deepEqual(fixes('Sayı : E/67915368/903.07.02/4752', 'yonetmelik.sayi').map((x) => x[1]), ['E-67915368-903.07.02-4752']);
});

test('Harfle sıralama Türk alfabesiyle (m.15(5), m.16(10))', () => {
  const text = 'Gereği:\na) Birinci husus.\nb) İkinci husus.\nc) Üçüncü husus.\nd) Dördüncü husus.';
  assert.deepEqual(fixes(text, 'yonetmelik.sira').map((x) => [x[0], x[1]]), [['d', 'ç']]);
  assert.deepEqual(only('a) Bir.\nb) İki.\nc) Üç.\nç) Dört.\nd) Beş.', 'yonetmelik.sira'), []);
});

test('İlgi (m.15): nokta, "tarihli ve", eksik sayı, tek ilgi, atıf tutarlılığı', () => {
  const good =
    'İlgi : a) Ticaret Bakanlığının (Personel Genel Müdürlüğü) 01.09.2019 tarihli ve E-35799330-902.02-1042579 sayılı yazısı.\n' +
    'b) 12.09.2019 tarihli ve E-35799330-903.07.02-1014125 sayılı yazımız.\n' +
    'İlgi (a) ve (b)\'de kayıtlı yazılar incelenmiştir.';
  assert.deepEqual(only(good, 'yonetmelik.ilgi'), []);
  const bad =
    'İlgi : a) 01.09.2019 tarih ve 1042579 sayılı yazınız\n' +
    'b) Bila tarihli ve E-35799330-903.07.02-1014125 sayılı yazımız.\n' +
    'İlgi (c)\'de belirtildiği üzere işlem yapılmıştır.';
  assert.deepEqual(only(bad, 'yonetmelik.ilgi').map((i) => i.ruleId).sort(), [
    'yonetmelik.ilgi.atif', 'yonetmelik.ilgi.bila', 'yonetmelik.ilgi.nokta', 'yonetmelik.ilgi.sayi', 'yonetmelik.ilgi.tarihli',
  ]);
  assert.equal(only('İlgi : a) 12.09.2019 tarihli ve E-35799330-903.07.02-1014125 sayılı yazımız.', 'yonetmelik.ilgi.tek').length, 1);
});

test('Ek (m.18): tek ek numarasız, sıra, atıf tutarlılığı', () => {
  assert.deepEqual(only('Ek: Kararname Taslağı (13 Sayfa)', 'yonetmelik.ek'), []);
  assert.deepEqual(only('Ek:\n1- Yönetmelik Taslağı (12 Sayfa)\n2- Dosya (1 Adet)', 'yonetmelik.ek'), []);
  assert.equal(only('Ek: 1- Kişi Listesi (20 Kişi)', 'yonetmelik.ek.tek').length, 1);
  assert.deepEqual(fixes('Ek:\n1- Liste (2 Sayfa)\n3- Dosya (1 Adet)', 'yonetmelik.ek.sira').map((x) => x[1]), ['2']);
  assert.equal(only('Ek-3\'te yer alan liste incelenmiştir.\nEk:\n1- Liste (2 Sayfa)\n2- Dosya (1 Adet)', 'yonetmelik.ek.atif').length, 1);
});

test('Sayıların yazımı (m.16(7)): tutarlar gruplanır, yıl ve kanun numarası gruplanmaz', () => {
  assert.deepEqual(fixes('Toplam 1500000 TL ödenecektir.', 'yonetmelik.sayi-yazimi').map((x) => x[1]), ['1.500.000']);
  assert.deepEqual(fixes('Tutar 10545,72 olarak hesaplanmıştır.', 'yonetmelik.sayi-yazimi').map((x) => x[1]), ['10.545,72']);
  assert.deepEqual(fixes('Bedel 1,500,000 lira.', 'yonetmelik.sayi-yazimi').map((x) => x[1]), ['1.500.000']);
  assert.deepEqual(only('2022 yılında 2876 sayılı Kanun ile 1.500.000 lira ve 10.545,72 TL ödendi.', 'yonetmelik.sayi-yazimi'), []);
});

test('Tarih biçimi (m.12(1), Kılavuz §9)', () => {
  assert.deepEqual(fixes('1.9.2019 tarihli yazı.', 'yonetmelik.tarih').map((x) => x[1]), ['01.09.2019']);
  assert.deepEqual(fixes('01/09/2019 tarihli yazı.', 'yonetmelik.tarih').map((x) => x[1]), ['01.09.2019']);
  assert.deepEqual(fixes('21 AĞUSTOS 2019 tarihinde.', 'yonetmelik.tarih').map((x) => x[1]), ['Ağustos']);
  assert.deepEqual(only("01.09.2019 tarihli ve 10 Ekim 2019'da yapılan.", 'yonetmelik.tarih'), []);
});

test('Kısaltma ilk kullanımda tanımlanır (m.16(11))', () => {
  assert.deepEqual(only('Türkiye Büyük Millet Meclisi (TBMM) kararı ile TBMM Başkanlığına iletildi.', 'yonetmelik.kisaltma'), []);
  assert.deepEqual(only('Konu TBMM gündemine alınmıştır.', 'yonetmelik.kisaltma').map((i) => i.text), ['TBMM']);
  // Kelime olan büyük harfliler, kodlar, Romen rakamları kısaltma sayılmaz
  assert.deepEqual(only('ACELE\nII. Bölüm\nBelge Doğrulama Kodu: ABCDE-FGHIJ\nPK:06520', 'yonetmelik.kisaltma'), []);
});

test('Kapanış (m.16(12))', () => {
  assert.deepEqual(only('Bilgilerinize arz ederim.\nGereğini rica ederim.\nBilgilerini ve gereğini arz/rica ederim.', 'yonetmelik.kapanis'), []);
  assert.deepEqual(fixes('Gereğini arz veya rica ederim.', 'yonetmelik.kapanis').map((x) => x[1]), ['arz ve rica']);
  assert.deepEqual(fixes('Bilgilerinize arz ederim\nAdı SOYADI', 'yonetmelik.kapanis').map((x) => x[1]), ['ederim.']);
});

test('Süreli yazı, imza, hitap (m.26, m.17, m.14)', () => {
  assert.deepEqual(fixes('GÜNLÜ', 'yonetmelik.sureli').map((x) => x[1]), ['GÜNLÜDÜR']);
  assert.deepEqual(fixes('ÇOK ACELE', 'yonetmelik.sureli').map((x) => x[1]), ['ACELE']);
  assert.deepEqual(only('ACELE\nGÜNLÜDÜR\nacil durum planı', 'yonetmelik.sureli'), []);
  assert.deepEqual(fixes('Ahmet YILMAZ\nBakan A.\nBakan Yardımcısı', 'yonetmelik.imza').map((x) => x[1]), ['a.']);
  assert.deepEqual(fixes('Ahmet YILMAZ\nGenel Müdür v.', 'yonetmelik.imza').map((x) => x[1]), ['V.']);
  assert.equal(only('e-imzalıdır\nAhmet YILMAZ', 'yonetmelik.imza.ibare').length, 1);
  assert.deepEqual(fixes('SAYIN Ahmet YILMAZ', 'yonetmelik.hitap').map((x) => x[1]), ['Sayın']);
});

test('Kılavuz tablosu ve bitişik birleşik fiiller', () => {
  assert.deepEqual(fixes('Evrak sisteme kayıt edildi.', 'yazim.birlesik-fiil-bitisik').map((x) => x[1]), ['kaydedildi']);
  assert.deepEqual(fixes('Talep red edilmiştir.', 'yazim.birlesik-fiil-bitisik').map((x) => x[1]), ['reddedilmiştir']);
  assert.deepEqual(fixes('Bu husus sözkonusu değildir.', 'yazim.yaygin').map((x) => x[1]), ['söz konusu']);
  assert.equal(only('Bir takım oyuncu geldi.', 'yazim.yaygin')[0]?.severity, 'uyari');
  // ünvan: Kılavuz'la çelişki notu
  assert.match(only('Ünvanı yazılır.', 'yazim.yaygin')[0]?.message ?? '', /TDK/);
});
