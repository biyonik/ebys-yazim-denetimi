import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidWord } from '../../src/core/morph/analyzer.ts';
import { suggest, repairs } from '../../src/core/morph/suggest.ts';
import { check } from '../../src/core/engine.ts';

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const NO_LIMIT = () => ({ until: performance.now() + 10_000 });

test('çözümleyici: resmî yazının tipik biçimleri geçerli', () => {
  const ok = words(`
    yapılmaktadır gönderilmiştir iletilmesi talebi talepte yazımız sayılı tarihli istinaden çerçevesinde
    doğrultusunda edilmektedir olunması yapılmasına gerekmektedir ilişkin kapsamında gereğini hususunda
    bilgilerinize ederim olunur belirtilen müdürlüğü bakanlığına başkanlığının valiliğine yapıldıktan
    denilmektedir istenildiğinde sürdürülebilirlik idarelerce tarafınızca sağlamaktır yapmaktaydı`);
  for (const w of ok) assert.ok(isValidWord(w), w);
});

test('çözümleyici: ses olayları', () => {
  // yumuşama, ünlü düşmesi (+ düşen ünlüye göre uyum), ikizleşme, ters uyum, ünlü daralması
  for (const w of words('kitabı rengi kaydı kaybı bahsi vakti ağzı resmi hakkı saati dikkate rolü arıyor söylüyor diyor yiyor diyecek gidiyor ediyor yapmıyor yapamıyor güncelliyor'))
    assert.ok(isValidWord(w), w);
  for (const w of words('kitapı kitabda hakı saatı renki bahsa gidyor edyor yapmayor arayor gönderilmişdir yapilacak'))
    assert.ok(!isValidWord(w) || w === 'hakı', w); // "hakı": sözlükte sıfat "hak" da var
});

test('çözümleyici: zamirler düzensiz çekimle', () => {
  for (const w of words('bana sana ona bunu bunun bizim sizinle onlara kendine hepsi hepimiz birbirine birbirimizi evdeki evdekiler yarınki sonraki şimdiki bugünkü'))
    assert.ok(isValidWord(w), w);
  for (const w of words('banada onuda kitabıda geldide')) assert.ok(!isValidWord(w), w);
});

test('çözümleyici: özel adlar yalnızca büyük harfle kök olur', () => {
  assert.ok(isValidWord('Türkçede', true));
  assert.ok(!isValidWord('türkçede', false));
});

test('öneri: Türkçe karakter ve tek düzenleme', () => {
  assert.deepEqual(suggest('yapilacak', NO_LIMIT())?.[0], { text: 'yapılacak', diacriticOnly: true });
  assert.equal(suggest('cumhurbaskanligi', NO_LIMIT())?.[0]?.text, 'cumhurbaşkanlığı');
  assert.equal(suggest('gönderilmş', NO_LIMIT())?.[0]?.text, 'gönderilmiş');
  assert.equal(suggest('bilgilerinzie', NO_LIMIT())?.[0]?.text, 'bilgilerinize');
  assert.equal(suggest('metodların', NO_LIMIT())?.[0]?.text, 'metotların');
});

test('öneri: bütçe aşılınca iş kaybolmaz, sonraki tur devam eder', () => {
  const w = 'değerlendirilmesinee';
  let res = suggest(w, { until: 0 });
  assert.equal(res, null);
  let turns = 0;
  while (res === null && turns < 1000) {
    res = suggest(w, { until: performance.now() + 2 });
    turns++;
  }
  assert.ok(res && res.length > 0, `tur: ${turns}`);
});

test('onarım: bağlaç ayırma yalnızca bütün kelime geçersizken', () => {
  assert.deepEqual(repairs('kitabıda'), [{ kind: 'de', stem: 'kitabı', particle: 'da' }]);
  assert.deepEqual(repairs('geldiki'), [{ kind: 'ki', stem: 'geldi', particle: 'ki' }]);
  assert.deepEqual(repairs('herşey'), [{ kind: 'split', left: 'her', right: 'şey' }]);
});

test('yazım kuralı: uçtan uca', () => {
  const got = (t: string) => check(t).filter((i) => i.ruleId.startsWith('yazim.sozluk') || i.ruleId.endsWith('.morf')).map((i) => [i.text, i.suggestions[0]]);
  assert.deepEqual(got('Dosya yapilacak toplantıda görüşülecek.'), [['yapilacak', 'yapılacak']]);
  assert.deepEqual(got('Bu kitabıda okudum.'), [['kitabıda', 'kitabı da']]);
  assert.deepEqual(got('Geldide gitti.'), [['Geldide', 'Geldi de']]);
  // "gelmişde": bağlaç mı (gelmiş de), bulunma mı (gelmişte)? İki aday, toplu düzeltmeye girmez
  const [g] = check('Dün gelmişde haber vermedi.').filter((i) => i.ruleId === 'baglac.de.morf');
  assert.deepEqual(g?.suggestions, ['gelmiş de', 'gelmişte']);
});

test('yazım kuralı: yanlış pozitif kalkanı', () => {
  // Yalnızca yazım kuralları (yönetmeliğin kısaltma tanımı önerisi ayrıca test edilir)
  const none = (t: string) =>
    assert.deepEqual(check(t).filter((i) => !i.ruleId.startsWith('yonetmelik.')).map((i) => `${i.ruleId}:${i.text}`), [], t);
  none('Toplantıya Kocatepe Mahallesinden katılım oldu.'); // cümle içi büyük harf: özel ad
  none('Konu TBMM ve DETSİS kayıtlarıyla ilgilidir.'); // kısaltmalar
  none('Kitap, defter vb. malzemeler alınacaktır.'); // noktalı kısaltma
  none('Kanunun 6 ncı maddesi uygulanır.'); // mevzuat sıra sayı biçimi
  none('Belge “Resmî Gazete”de yayımlanmıştır.'); // tırnaktan sonra ek
  none('Paket 25 kg ağırlığındadır.'); // birim
});
