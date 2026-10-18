import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { isValidLink, kilavuzSectionPage, parseRef, sourceUrlPath, yonetmelikPage } from '../../src/core/ref-links.ts';

const links = (ref: string) => parseRef(ref).filter((p) => p.link).map((p) => [p.text, p.link!.doc, p.link!.page]);

test('dayanak metni tıklanabilir parçalara ayrılır', () => {
  assert.deepEqual(links('Yönetmelik m.16(4), Kılavuz §31'), [['Yönetmelik m.16(4)', 'yonetmelik', 6], ['Kılavuz §31', 'kilavuz', 100]]);
  assert.deepEqual(links('Kılavuz §13.6.3'), [['Kılavuz §13.6.3', 'kilavuz', 46]]);
  assert.deepEqual(links('Kılavuz s.54, sık yanlış kullanılan kelimeler'), [['Kılavuz s.54', 'kilavuz', 58]]);
  assert.deepEqual(links('Yönetmelik m.15(5), Örnek 3'), [['Yönetmelik m.15(5)', 'yonetmelik', 5], ['Örnek 3', 'yonetmelik', 17]]);
  // metnin tamamı korunur: parçalar birleşince özgün dayanak
  const ref = 'TDK Güncel Türkçe Sözlük (Yönetmelik m.16(8))';
  assert.equal(parseRef(ref).map((p) => p.text).join(''), ref);
  assert.deepEqual(links('TDK Yazım Kılavuzu (büyük harf)'), []);
});

test('bilinmeyen alt bölüm bir üst bölüme düşer; hiç yoksa bağlantı verilmez', () => {
  assert.equal(kilavuzSectionPage('13.6.5.1'), 50);
  assert.equal(kilavuzSectionPage('13.6.2.9'), kilavuzSectionPage('13.6.2'));
  assert.equal(kilavuzSectionPage('99'), undefined);
  assert.equal(yonetmelikPage('16', '99'), yonetmelikPage('16'));
  assert.deepEqual(links('Kılavuz §99'), []);
});

test('kurallardaki her Kılavuz/Yönetmelik atfı bir sayfaya çözülür', () => {
  const dir = 'src/core/rules/';
  const refs = new Set<string>();
  for (const f of readdirSync(dir)) {
    const src = readFileSync(dir + f, 'utf8');
    for (const m of src.matchAll(/\bK\('([^']+)'\)/g)) refs.add(`Kılavuz §${m[1]}`);
    for (const m of src.matchAll(/\bY\('([^']+)'\)/g)) refs.add(`Yönetmelik m.${m[1]}`);
    for (const m of src.matchAll(/'(Kılavuz (?:§|s\.)[^']+)'/g)) refs.add(m[1]!);
  }
  assert.ok(refs.size > 30, `${refs.size} atıf bulundu`);
  const unresolved = [...refs].filter((r) => parseRef(r).every((p) => !p.link));
  assert.deepEqual(unresolved, []);
});

test('arka plan yalnızca geçerli belge ve sayfa kabul eder', () => {
  assert.ok(isValidLink({ doc: 'kilavuz', page: 46 }));
  assert.ok(!isValidLink({ doc: 'kilavuz', page: 0 }));
  assert.ok(!isValidLink({ doc: 'kilavuz', page: 9999 }));
  assert.ok(!isValidLink({ doc: '../../etc/passwd', page: 1 }));
  assert.ok(!isValidLink({ doc: 'yonetmelik', page: '3' }));
  assert.equal(sourceUrlPath({ doc: 'kilavuz', page: 46 }), 'kaynak/kilavuz-2023.pdf#page=46');
});
