import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';
import { spokenLastWord } from '../../src/core/numbers.ts';
import { matchCase, trUpper } from '../../src/core/turkish.ts';

const ids = (text: string) => check(text).map((i) => i.ruleId);
const firstSuggestion = (text: string) => check(text)[0]?.suggestions[0];

test('Türkçe büyük harf: i → İ', () => {
  assert.equal(trUpper('istanbul'), 'İSTANBUL');
  assert.equal(matchCase('Yanlız', 'yalnız'), 'Yalnız');
  assert.equal(matchCase('YANLIZ', 'yalnız'), 'YALNIZ');
});

test('sayının okunuşundaki son kelime', () => {
  assert.equal(spokenLastWord('3'), 'üç');
  assert.equal(spokenLastWord('40'), 'kırk');
  assert.equal(spokenLastWord('100'), 'yüz');
  assert.equal(spokenLastWord('2026'), 'altı');
  assert.equal(spokenLastWord('1.000'), 'bin');
  assert.equal(spokenLastWord('2.000.000'), 'milyon');
  assert.equal(spokenLastWord('16.10.2026'), 'altı');
  assert.equal(spokenLastWord('10:30'), 'otuz');
  assert.equal(spokenLastWord('2,5'), 'beş');
  assert.equal(spokenLastWord('0'), 'sıfır');
});

test('kesme.sayi: eksik kesme ve okunuşa uyum', () => {
  assert.equal(firstSuggestion('Toplantı 2026da yapılacak.'), "2026'da");
  assert.equal(firstSuggestion("Saat 3'de geliniz."), "3'te");
  assert.equal(firstSuggestion("Saat 3de geliniz."), "3'te");
  assert.equal(firstSuggestion("Saat 4'da geliniz."), "4'te");
  assert.equal(firstSuggestion("Saat 10:30'de geliniz."), "10:30'da");
  assert.equal(firstSuggestion("1990'ler unutulmaz."), "1990'lar");
  assert.equal(firstSuggestion('3üncü madde iptal.'), "3'üncü");
  assert.equal(firstSuggestion("6'ıncı madde iptal."), "6'ncı");
  assert.equal(firstSuggestion("2026'dekı karar."), "2026'daki");
  assert.equal(firstSuggestion("Saat 3'deyken aradı."), "3'teyken");
});

test('kesme.sayi: doğru biçimler işaretlenmez', () => {
  for (const ok of [
    "Saat 3'te geliniz.",
    "2026'da yapılacak.",
    "1.000'den fazla.",
    "100'de bir.",
    "1'inci madde.",
    "6'ncı madde.",
    "16.10.2026'da karar alındı.",
    "2026'daki karar.",
    'Madde 4A uygulanır.',
    'Ek 2B listesi.',
  ]) {
    assert.deepEqual(ids(ok).filter((i) => i.startsWith('kesme')), [], ok);
  }
});

test('kesme.sayi: birim', () => {
  assert.equal(firstSuggestion('Mesafe 5km olarak ölçüldü.'), '5 km');
});

test('kesme.sayi: kaynaştırma ünsüzü (uyarı, iki aday)', () => {
  const [is] = check("Toplam 2'i bulmadı.");
  assert.equal(is?.severity, 'uyari');
  assert.deepEqual(is?.suggestions, ["2'yi", "2'si"]);
});

test('yaygın yanlışlar ve büyük/küçük harf koruma', () => {
  assert.equal(firstSuggestion('Bu iş yanlız yapılmaz.'), 'yalnız');
  assert.equal(firstSuggestion('Orjinalden kopyalandı.'), 'Orijinalden');
  assert.equal(firstSuggestion('Bu hiç bir şekilde olmaz.'), 'hiçbir');
  // makina → makine güvenli gövde eşlemesi DEĞİL: "makinalar" yakalanmamalı
  assert.deepEqual(ids('Yeni makinalar geldi.').filter((i) => i === 'yazim.yaygin'), []);
  assert.equal(firstSuggestion('Bu makina çalışmıyor.'), 'makine');
});

test('bağlama bağlı kelimeler uyarı düzeyinde', () => {
  const [is] = check('Dosya hala gelmedi.');
  assert.equal(is?.severity, 'uyari');
  assert.equal(is?.suggestions[0], 'hâlâ');
});

test('birleşik fiil: ses olayı yoksa ayrı', () => {
  assert.equal(firstSuggestion('Bilgilerinize arzederim.'), 'arz ederim');
  assert.equal(firstSuggestion('Gereğini ricaederim.'), 'rica ederim');
  for (const ok of ['Kaydedildi.', 'Hissettim.', 'Teminat alındı.', 'Tercihen sabah.', 'Teslimat yapıldı.']) {
    assert.deepEqual(ids(ok).filter((i) => i === 'yazim.birlesik-fiil'), [], ok);
  }
});

test('noktalama boşlukları', () => {
  assert.equal(firstSuggestion('Evet , olur.'), ',');
  assert.equal(firstSuggestion('Evet,olur.'), ', olur');
  // Başlık hizalaması ve alan adları işaretlenmez
  assert.deepEqual(ids('Sayı    : E-12345\nKonu    : Görüş talebi'), []);
  assert.deepEqual(ids('Adres: kurum.gov.tr üzerinden.'), []);
  assert.deepEqual(ids('T.C. Ankara Valiliği'), []);
});

test('kelime tekrarı: ikilemeler serbest', () => {
  assert.deepEqual(ids('Yavaş yavaş ilerledi.'), []);
  assert.equal(check('Bu ve ve şu.')[0]?.ruleId, 'tekrar.kelime');
});

test('cümle başı büyük harf ve istisnaları', () => {
  assert.equal(firstSuggestion('Geldi. sonra gitti.'), 'Sonra');
  assert.equal(firstSuggestion('istanbul güzeldir.'), 'İstanbul');
  for (const ok of [
    'Kitap, defter vb. malzemeler.',
    'Bu 3. madde kapsamındadır.',
    'Prof. Dr. Ahmet geldi.',
    'Bekledi... sonra gitti.',
    'a) Toplantı yapılacak.',
    'Ürün\tadet\tfiyat',
  ]) {
    assert.deepEqual(ids(ok).filter((i) => i.startsWith('buyuk')), [], ok);
  }
});

test('yoksayma ve çakışma çözümü', () => {
  const ignored = new Set(['yazim.yaygin|yanlız']);
  assert.deepEqual(check('Bu yanlız olur.', { ignored }), []);
  // Aynı aralıkta en fazla bir sorun
  const issues = check('Geldi. yanlız kaldı.');
  for (let i = 1; i < issues.length; i++) assert.ok(issues[i]!.start >= issues[i - 1]!.end);
});
