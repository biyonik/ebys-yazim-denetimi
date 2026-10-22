import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../src/core/engine.ts';
import { idareOf, metaFromText, senderOf } from '../../src/core/hiyerarsi.ts';
import type { DocMeta, Recipient } from '../../src/core/types.ts';

const KAYM = ['KARESİ KAYMAKAMLIĞI', 'İlçe Millî Eğitim Müdürlüğü'];
const r = (text: string, role: Recipient['role'] = 'gereği'): Recipient => ({ text, role });
const closing = (text: string, meta: DocMeta) =>
  check(text, { meta })
    .filter((i) => i.ruleId === 'kapanis.hiyerarsi')
    .map((i) => [i.text, i.suggestions, i.severity]);

test('idare düzeyi: idare adı, parantez, yol biçimi', () => {
  const lv = (s: string) => idareOf(s)?.level;
  assert.equal(lv('CUMHURBAŞKANLIĞINA'), 1);
  assert.equal(lv('MİLLÎ EĞİTİM BAKANLIĞINA (Temel Eğitim Genel Müdürlüğü)'), 2);
  assert.equal(lv('Emniyet Genel Müdürlüğü'), 2);
  assert.equal(lv('BALIKESİR VALİLİĞİNE (İl Millî Eğitim Müdürlüğü)'), 3); // m.16(12)(c): birinci satır
  assert.equal(lv('Balıkesir İl Millî Eğitim Müdürlüğü'), 3);
  assert.equal(lv('Gençlik ve Spor İl Müdürlüğü'), 3);
  assert.equal(lv('KARESİ KAYMAKAMLIĞINA (Atatürk Ortaokulu Müdürlüğü)'), 4);
  assert.equal(lv('Altıeylül İlçe Millî Eğitim Müdürlüğü'), 4);
  assert.equal(lv('Atatürk Ortaokulu Müdürlüğü'), 5);
  assert.equal(lv('Karesi Halk Eğitimi Merkezi'), 5);
  assert.equal(lv('MİLLÎ EĞİTİM BAKANLIĞI / BALIKESİR VALİLİĞİ / Karesi İlçe Millî Eğitim Müdürlüğü'), 4); // son parça
  for (const u of ['Balıkesir Üniversitesi Rektörlüğü', 'Karesi Belediye Başkanlığı', 'ABC Yazılım A.Ş.', 'DAĞITIM YERLERİNE', 'Karayolları 14. Bölge Müdürlüğü'])
    assert.equal(idareOf(u), undefined, u);
});

test('gönderen düzeyi: idare; birim bir okulsa okul', () => {
  assert.equal(senderOf(['T.C.', ...KAYM])?.level, 4);
  assert.equal(senderOf(['KARESİ KAYMAKAMLIĞI', 'Atatürk Ortaokulu Müdürlüğü'])?.level, 5);
  assert.equal(senderOf(['BALIKESİR VALİLİĞİ', 'İl Millî Eğitim Müdürlüğü'])?.level, 3);
  assert.equal(senderOf(['ÖRNEK KURUM BAŞKANLIĞI']), undefined);
});

test('üst makama "rica ederim" — hata, Kılavuz §13.1 kalıbıyla öneri', () => {
  const meta = { sender: KAYM, recipients: [r('BALIKESİR VALİLİĞİNE (İl Millî Eğitim Müdürlüğü)', 'muhatap')] };
  assert.deepEqual(closing('Gereğini rica ederim.', meta), [['Gereğini rica', ['Gereğini bilgilerinize arz'], 'hata']]);
  assert.deepEqual(closing('Bilgilerini rica ederim.', meta), [['Bilgilerini rica', ['Bilgilerinize arz'], 'hata']]);
  assert.deepEqual(closing('Bilgilerini ve gereğini rica ederim.', meta), [['Bilgilerini ve gereğini rica', ['Bilgilerini ve gereğini arz'], 'hata']]);
  assert.deepEqual(closing('Bilgilerinize arz ederim.', meta), []);
  // Bakanlık ve Cumhurbaşkanlığı da üst; okulun yazısında Kaymakamlık üst
  assert.equal(closing('Gereğini rica ederim.', { sender: KAYM, recipients: [r('Millî Eğitim Bakanlığı', 'bilgi')] }).length, 1);
  assert.equal(closing('Gereğini rica ederim.', { sender: ['KARESİ KAYMAKAMLIĞI', 'Atatürk Ortaokulu Müdürlüğü'], recipients: [r('KARESİ KAYMAKAMLIĞINA (İlçe Millî Eğitim Müdürlüğü)', 'muhatap')] }).length, 1);
});

test('aynı düzeye de "arz ederim" (m.16(12)(a))', () => {
  const [is] = closing('Gereğini rica ederim.', { sender: KAYM, recipients: [r('ALTIEYLÜL KAYMAKAMLIĞI')] });
  assert.equal(is?.[2], 'hata');
});

test('alt makama "rica ederim" doğru; "arz ederim" uyarı', () => {
  const meta = { sender: KAYM, recipients: [r('Atatürk Ortaokulu Müdürlüğü'), r('Cumhuriyet İlkokulu')] };
  assert.deepEqual(closing('Gereğini rica ederim.', meta), []);
  assert.deepEqual(closing('Bilgilerinize arz ederim.', meta), [['Bilgilerinize arz', ['Bilgilerini rica'], 'uyari']]);
  // Bakanlık → taşra: rica (Kılavuz §13.1)
  assert.deepEqual(closing('Gereğini rica ederim.', { sender: ['MİLLÎ EĞİTİM BAKANLIĞI'], recipients: [r('BALIKESİR VALİLİĞİNE', 'muhatap')] }), []);
});

test('karma dağıtım: "arz ve rica ederim"', () => {
  const meta = { sender: KAYM, recipients: [r('Atatürk Ortaokulu'), r('BALIKESİR VALİLİĞİ', 'bilgi')] };
  assert.deepEqual(closing('Gereğini rica ederim.', meta), [['Gereğini rica', ['Gereğini arz ve rica'], 'hata']]);
  assert.deepEqual(closing('Bilgilerinize arz ederim.', meta), [['Bilgilerinize arz', ['Bilgilerini arz ve rica'], 'uyari']]);
  assert.deepEqual(closing('Gereğini arz ve rica ederim.', meta), []);
  assert.deepEqual(closing('Bilgilerini ve gereğini arz/rica ederim.', meta), []);
  // karma kalıp ama alt makam yok
  assert.deepEqual(closing('Gereğini arz ve rica ederim.', { sender: KAYM, recipients: [r('BALIKESİR VALİLİĞİ')] }), [['Gereğini arz ve rica', ['Gereğini bilgilerinize arz'], 'uyari']]);
});

test('düzeyi bilinmeyen muhatap: karar verilmez ya da uyarıya iner', () => {
  assert.deepEqual(closing('Gereğini rica ederim.', { sender: KAYM, recipients: [r('ABC Yazılım A.Ş.')] }), []); // tüzel kişiye rica doğru
  const [is] = closing('Gereğini rica ederim.', { sender: KAYM, recipients: [r('Balıkesir Üniversitesi Rektörlüğü'), r('BALIKESİR VALİLİĞİ', 'bilgi')] });
  assert.equal(is?.[2], 'uyari');
  assert.deepEqual(is?.[1], ['Gereğini bilgilerinize arz', 'Gereğini arz ve rica']);
  // gönderen bilinmiyorsa sessiz
  assert.deepEqual(closing('Gereğini rica ederim.', { sender: ['ÖRNEK KURUM BAŞKANLIĞI'], recipients: [r('BALIKESİR VALİLİĞİ')] }), []);
  // kapanış yoksa sessiz
  assert.deepEqual(closing('Metin sürüyor.', { sender: KAYM, recipients: [r('BALIKESİR VALİLİĞİ')] }), []);
});

test('başlık ve muhatap editöre elle yazılmışsa metinden okunur', () => {
  const t = 'T.C.\nKARESİ KAYMAKAMLIĞI\nİlçe Millî Eğitim Müdürlüğü\n\nBALIKESİR VALİLİĞİNE\n(İl Millî Eğitim Müdürlüğü)\n\nMetin.\nGereğini rica ederim.';
  const m = metaFromText(t);
  assert.deepEqual(m.sender, KAYM);
  assert.deepEqual(m.recipients, [{ text: 'BALIKESİR VALİLİĞİNE (İl Millî Eğitim Müdürlüğü)', role: 'muhatap' }]);
  assert.equal(closing(t, {}).length, 1);
  const d = 'T.C.\nKARESİ KAYMAKAMLIĞI\n\nDAĞITIM YERLERİNE\n\nMetin.\nGereğini rica ederim.\n\nDağıtım:\nGereği:\nAtatürk Ortaokulu\nBilgi:\nBalıkesir Valiliği';
  assert.deepEqual(closing(d, {}), [['Gereğini rica', ['Gereğini arz ve rica'], 'hata']]);
});

test('EBYS bilgisi editör metnine göre önceliklidir', () => {
  const t = 'T.C.\nKARESİ KAYMAKAMLIĞI\n\nBALIKESİR VALİLİĞİNE\n\nMetin.\nGereğini rica ederim.';
  // EBYS'de Gereği'nde okul seçili: metindeki eski muhatap satırı karar vermez
  assert.deepEqual(closing(t, { sender: KAYM, recipients: [r('Atatürk Ortaokulu Müdürlüğü')] }), []);
});
