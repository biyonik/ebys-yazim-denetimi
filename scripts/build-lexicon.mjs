// Zemberek sözlüklerinden derlenmiş, kompakt sözlük verisi üretir.
//   node scripts/build-lexicon.mjs
//
// Çıktı: src/core/morph/data/lexicon.ts  (git'e eklenir; çalışma zamanında ağ/dosya erişimi yok)
//
// Satır biçimi:  yüzey|KOD[:ek]
//   KOD = sözcük türü harfi + öznitelik harfleri
//     Tür:  N isim · J sıfat · V fiil (kök, -mek'siz) · R zarf · C bağlaç · P edat
//           I ünlem · D belirleyici · M sayı · Q soru · O zamir · K ek-fiil tabanı (değil)
//     Öznitelik: v yumuşama · n yumuşamaz · d ünlü düşmesi · b ikizleşme · h ters uyum
//                a geniş zaman -Ar · i geniş zaman -Ir · c iyelikli birleşik (":" sonrası gövde)
//                t zaman adı (-ki doğrudan gelir) · x ek almaz
//   Varsayılan "N" ise kod yazılmaz.
//
// Öznitelik çıkarımı Zemberek'in kurallarını izler: çok heceli, p/ç/t/k ile biten
// isim/sıfatlar "Yumuşamaz" işaretli değilse yumuşar; tek heceli fiiller "-Ar",
// çok heceliler "-Ir" geniş zaman alır (sözlükte açıkça işaretli olanlar hariç).
import { readFileSync, writeFileSync } from 'node:fs';

const V = 'aeıioöuüâîû';
const syllables = (w) => [...w].filter((c) => V.includes(c)).length;
const lower = (s) => s.toLocaleLowerCase('tr-TR');

function parseLine(raw) {
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) return null;
  const m = /^(.+?)\s*(?:\[(.*)\])?$/.exec(line);
  if (!m) return null;
  const word = m[1].trim();
  const meta = { P: [], A: [], Roots: null };
  for (const part of (m[2] ?? '').split(';')) {
    const [k, v] = part.split(':').map((s) => s?.trim());
    if (!k || v === undefined) continue;
    if (k === 'P') meta.P = v.split(',').map((s) => s.trim());
    else if (k === 'A') meta.A.push(...v.split(',').map((s) => s.trim()));
    else if (k === 'Roots') meta.Roots = v;
  }
  return { word, meta };
}

const POS = {
  Noun: 'N', Adj: 'J', Verb: 'V', Adv: 'R', Conj: 'C', Postp: 'P', Interj: 'I',
  Det: 'D', Num: 'M', Ques: 'Q', Pron: 'O', Dup: 'I',
};

/** İyelikli birleşik / zamirden gövde: "anaokulu" → "anaokul", "hepsi" → "hep" */
const P3_STEM_OVERRIDE = { hepsi: 'hep' };
function p3Stem(w) {
  if (P3_STEM_OVERRIDE[w]) return P3_STEM_OVERRIDE[w];
  const last = w.at(-1);
  if (!'ıiuü'.includes(last)) return null;
  if (w.at(-2) === 's' && V.includes(w.at(-3))) return w.slice(0, -2);
  return w.slice(0, -1);
}
const P3_PRONOUNS = new Set([
  'başkası', 'bazısı', 'birbiri', 'birçoğu', 'biri', 'birkaçı', 'cümlesi', 'çoğu', 'diğeri',
  'hepsi', 'hiçbiri', 'kimi', 'kimisi', 'tümü', 'yekdiğeri', 'birileri', 'çokları',
]);

const out = new Map(); // satır → true (tekilleştirme)
let skipped = 0;

function emit(word, meta, proper = false) {
  if (/\s/.test(word) || /^[^\p{L}]/u.test(word)) {
    skipped++;
    return;
  }
  let w = lower(word);
  const pos0 = meta.P[0];
  if (pos0 === 'Punc' || pos0 === 'Abbrv') return;
  const A = new Set(meta.A);
  let pos = POS[pos0] ?? null;

  if (proper) pos = 'Z'; // özel ad: yalnızca büyük harfle başlayan kelimede kök olur
  if (!pos && /m[ae]k$/.test(w) && w.length > 4) pos = 'V';
  if (!pos) pos = 'N';
  if (pos === 'V' && !/m[ae]k$/.test(w)) pos = 'K'; // "değil": ek-fiil tabanı
  if (pos === 'V') w = w.slice(0, -3);

  let flags = '';
  if (A.has('Voicing')) flags += 'v';
  if (A.has('NoVoicing')) flags += 'n';
  if (A.has('LastVowelDrop')) flags += 'd';
  if (A.has('Doubling')) flags += 'b';
  if (A.has('InverseHarmony')) flags += 'h';
  if (A.has('NoSuffix')) flags += 'x';
  if (meta.P.includes('Time')) flags += 't';

  if (pos === 'V') {
    if (A.has('Aorist_A')) flags += 'a';
    else if (A.has('Aorist_I')) flags += 'i';
    else flags += syllables(w) === 1 ? 'a' : 'i';
  }
  // Ters uyumlu kelimelerde (dikkat, saat, kalp) yumuşama ancak açıkça işaretliyse olur
  if ((pos === 'N' || pos === 'J' || pos === 'Z') && !flags.includes('v') && !flags.includes('n') && !flags.includes('h')) {
    // Çok heceli + p/ç/t/k → yumuşar (kitap → kitabı)
    if (syllables(w) > 1 && /[pçtk]$/.test(w)) flags += 'v';
    // Tek heceli "-nk" de yumuşar: renk → rengi, denk → dengi
    else if (/nk$/.test(w)) flags += 'v';
    // "-log" alıntıları: psikolog → psikoloğu, katalog → kataloğu
    else if (syllables(w) > 1 && /[oö]g$/.test(w)) flags += 'v';
  }
  let extra = '';
  if (A.has('CompoundP3sg') || (pos === 'O' && P3_PRONOUNS.has(w))) {
    const stem = p3Stem(w);
    if (stem) {
      flags += 'c';
      extra = stem;
    }
  }
  const code = pos + [...new Set(flags)].join('');
  const line = code === 'N' ? w : `${w}|${code}${extra ? ':' + extra : ''}`;
  out.set(line, true);
}

const files = ['vendor/zemberek/master-dictionary.dict', 'scripts/lexicon-supplement.txt'];
for (const f of files) {
  for (const raw of readFileSync(f, 'utf8').split('\n')) {
    const p = parseLine(raw);
    if (p) emit(p.word, p.meta);
  }
}

// Özel adlar (yalnızca büyük harfle başlayan kelimeler için kullanılır)
const proper = new Set();
for (const f of ['vendor/zemberek/proper.dict', 'vendor/zemberek/person-names.dict']) {
  for (const raw of readFileSync(f, 'utf8').split('\n')) {
    const p = parseLine(raw);
    if (p && !/\s/.test(p.word) && /^\p{Lu}/u.test(p.word)) {
      proper.add(lower(p.word));
      emit(p.word, p.meta, true);
    }
  }
}
// Kısaltmalar (noktalı ya da büyük harfli; denetimden muaf)
const abbr = new Set();
for (const raw of readFileSync('vendor/zemberek/abbreviations.dict', 'utf8').split('\n')) {
  const p = parseLine(raw);
  if (p && p.meta.P[0] === 'Abbrv' && !/\s/.test(p.word)) abbr.add(lower(p.word.replace(/\.$/, '')));
}

const header = `// OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: vendor/zemberek (Apache-2.0), scripts/lexicon-supplement.txt
// Yeniden üretmek için: node scripts/build-lexicon.mjs
`;
const lexicon = [...out.keys()].sort().join('\n');
writeFileSync(
  'src/core/morph/data/lexicon.ts',
  header +
    `export const LEXICON = ${JSON.stringify(lexicon)};\n` +
    `export const PROPER = ${JSON.stringify([...proper].sort().join('\n'))};\n` +
    `export const ABBR = ${JSON.stringify([...abbr].sort().join('\n'))};\n`,
);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`sözlük: ${out.size} madde (${kb(lexicon)}), özel ad: ${proper.size}, kısaltma: ${abbr.size}, atlanan: ${skipped}`);
