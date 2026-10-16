import { LEXICON, PROPER, ABBR } from './data/lexicon.ts';
import { STATES, FINAL, type State, type Transition } from './morphotactics.ts';
import { after, countVowels, lastVowelOf, parseTemplate, realize, voice, type Phon } from './phonology.ts';
import { HARD_CONSONANTS, harmonyOf, isVowel, trLower, type Harmony } from '../turkish.ts';

/**
 * Türkçe biçimbilimsel çözümleyici (kural tabanlı, sözlüklü).
 *
 * Soru: "Bu kelime, sözlükteki bir kök + geçerli bir ek dizisiyle
 * oluşturulabilir mi?" Örnek: yapılmaktadır = yap + Il + mAktA + DIr.
 *
 * Yöntem: kelimenin her ön ekini kök adayı olarak sözlükte ararız (kökün
 * ses olaylı değişkenleri dahil: kitab-, ağz-, hakk-, gid-, ar-); bulunan
 * her kök için ek dizimi grafiğinde, kelimenin kalanını tüketen bir yol
 * ararız. Ekler arşifonem şablonlarından o anki ses durumuna göre üretilir.
 *
 * Ses kısıtları bir sonraki parçaya devredilir:
 *   needV    → sonraki ek ünlüyle başlamalı   (kitab-ı, gelecek → geleceğ-i)
 *   noV      → sonraki ek ünlüyle başlayamaz  (kitap-ta, *kitap-ı)
 *   needProg → sonraki ek -Iyor olmalı         (ar-ıyor, yapm-ıyor)
 *   needY    → sonraki ek y ile başlamalı      (di-yen, yi-yecek)
 */

type Cons = 'none' | 'needV' | 'noV' | 'needProg' | 'needY';

interface Root {
  lemma: string;
  /** Z: özel ad — yalnızca büyük harfle başlayan kelimede kök olarak kullanılır */
  pos: string;
  state: State;
  phon: Phon;
  cons: Cons;
}

/** Düzeltme işaretini katla: hâlâ → hala, resmî → resmi (her iki yazım da tanınır) */
const FOLD: Record<string, string> = { â: 'a', î: 'i', û: 'u' };
export const fold = (s: string): string => (/[âîû]/.test(s) ? s.replace(/[âîû]/g, (c) => FOLD[c]!) : s);

const POS_STATE: Record<string, State> = {
  N: 'N0', J: 'N0', M: 'NNUM', R: 'NADV', P: 'NPOSTP', C: 'NBARE', I: 'NBARE', D: 'NBARE',
  Q: 'NQ', K: 'NK', O: 'N0', Z: 'N0',
};

/**
 * Düzensiz zamir biçimleri. Düzenli çekimle üretilemezler (ben → *bene, bana)
 * ve düzenli çekime de bırakılmazlar; aksi hâlde "*bene", "*oya" geçerli sayılırdı.
 */
const PRONOUN_FORMS = `
ben beni bana bende benden benim benimle bence bensiz benimki
sen seni sana sende senden senin seninle sence sensiz seninki
o onu ona onda ondan onun onunla onca onsuz onunki
biz bizi bize bizde bizden bizim bizimle bizce bizsiz bizimki
siz sizi size sizde sizden sizin sizinle sizce sizsiz sizinki
bu bunu buna bunda bundan bunun bununla bunca bunsuz bununki
şu şunu şuna şunda şundan şunun şununla şunca şununki
kendine kendini kendinin kendinde kendinden kendiyle kendince
neyi neye neyin nede neden neyle
`;
const PRONOUN_PLURALS = ['onlar', 'bunlar', 'şunlar', 'bizler', 'sizler'];
const IRREGULAR_PRON = new Set(['ben', 'sen', 'o', 'biz', 'siz', 'bu', 'şu', 'ne']);

let roots: Map<string, Root[]> | null = null;
let properSet: Set<string> | null = null;
let abbrSet: Set<string> | null = null;

function rootPhon(surface: string, inverse: boolean, aor: 'A' | 'I', time: boolean, droppedVowel?: string): Phon {
  const lv = lastVowelOf(surface) ?? droppedVowel ?? 'e';
  let harm: Harmony = harmonyOf(lv);
  if (inverse) harm = { back: false, round: harm.round };
  return { harm, last: surface.at(-1) ?? lv, syl: countVowels(surface), aor, time };
}

function addRoot(map: Map<string, Root[]>, surface: string, r: Root): void {
  const k = fold(surface);
  const list = map.get(k);
  if (list) list.push(r);
  else map.set(k, [r]);
}

function buildRoots(): Map<string, Root[]> {
  const map = new Map<string, Root[]>();
  for (const line of LEXICON.split('\n')) {
    const bar = line.indexOf('|');
    const w = bar < 0 ? line : line.slice(0, bar);
    const code = bar < 0 ? 'N' : line.slice(bar + 1);
    const colon = code.indexOf(':');
    const flags = colon < 0 ? code : code.slice(0, colon);
    const compStem = colon < 0 ? '' : code.slice(colon + 1);
    const pos = flags[0]!;
    const f = (c: string) => flags.includes(c, 1);
    const inverse = f('h');
    const time = f('t');

    if (pos === 'O' && IRREGULAR_PRON.has(w)) continue;

    if (pos === 'V') {
      const aor = f('a') ? 'A' : 'I';
      const base: Root = { lemma: w, pos, state: 'V0', phon: rootPhon(w, inverse, aor, false), cons: f('v') ? 'noV' : 'none' };
      addRoot(map, w, base);
      if (f('v')) {
        const vv = voice(w);
        if (vv) addRoot(map, vv, { ...base, phon: rootPhon(vv, inverse, aor, false), cons: 'needV' });
      }
      if (isVowel(w.at(-1)!)) {
        const tr = w.slice(0, -1);
        addRoot(map, tr, { ...base, phon: rootPhon(tr, inverse, aor, false, w.at(-1)), cons: 'needProg' });
      }
      if (w === 'de' || w === 'ye') {
        const di = w[0] + 'i';
        addRoot(map, di, { ...base, phon: rootPhon(di, false, aor, false), cons: 'needY' });
      }
      continue;
    }

    if (f('c') && compStem) {
      // İyelikli birleşik / zamir: anaokulu-na, hepsi-ni; gövde: anaokul-larımız, hep-imiz
      addRoot(map, w, { lemma: w, pos, state: 'NP3', phon: rootPhon(w, inverse, 'I', false), cons: 'none' });
      addRoot(map, compStem, { lemma: w, pos, state: 'NCOMP', phon: rootPhon(compStem, inverse, 'I', false), cons: 'none' });
      continue;
    }

    const state: State = f('x') ? 'NBARE' : POS_STATE[pos] ?? 'N0';
    const changes = f('v') || f('b') || f('d');
    const base: Root = { lemma: w, pos, state, phon: rootPhon(w, inverse, 'I', time), cons: changes ? 'noV' : 'none' };
    addRoot(map, w, base);
    if (f('v')) {
      const vv = voice(w);
      if (vv) addRoot(map, vv, { ...base, phon: rootPhon(vv, inverse, 'I', time), cons: 'needV' });
    }
    if (f('b')) {
      const bb = w + w.at(-1);
      addRoot(map, bb, { ...base, phon: rootPhon(bb, inverse, 'I', time), cons: 'needV' });
    }
    if (f('d')) {
      // Son hecedeki ünlü düşer: ağız → ağz-ı, resim → resm-i, oğul → oğl-u
      let i = w.length - 1;
      while (i >= 0 && !isVowel(w[i]!)) i--;
      if (i > 0) {
        let dd = w.slice(0, i) + w.slice(i + 1);
        // Ünlü düşmesi + yumuşama birlikte: kayıt → kayd-ı, kayıp → kayb-ı, nakit → nakd-i
        if (f('v')) dd = voice(dd) ?? dd;
        // Uyum DÜŞEN ünlüye göredir: bahis → bahs-i (a'ya göre değil), vakit → vakt-i
        const ph = rootPhon(dd, inverse, 'I', time);
        let harm = harmonyOf(w[i]!);
        if (inverse) harm = { back: false, round: harm.round };
        addRoot(map, dd, { ...base, phon: { ...ph, harm }, cons: 'needV' });
      }
    }
  }
  for (const p of PRONOUN_FORMS.split(/\s+/).filter(Boolean)) {
    addRoot(map, p, { lemma: p, pos: 'O', state: 'NPRON', phon: rootPhon(p, false, 'I', false), cons: 'none' });
  }
  for (const p of PRONOUN_PLURALS) {
    addRoot(map, p, { lemma: p, pos: 'O', state: 'NPL', phon: rootPhon(p, false, 'I', false), cons: 'none' });
  }
  return map;
}

/** Sözlüğü önceden yükler (sayfa boştayken çağrılır; ilk denetimi bekletmesin diye). */
export function warmUp(): number {
  const t0 = performance.now();
  ensureLoaded();
  return performance.now() - t0;
}

function ensureLoaded(): Map<string, Root[]> {
  if (!roots) roots = buildRoots();
  return roots;
}

export function isProperName(lowerFolded: string): boolean {
  properSet ??= new Set(PROPER.split('\n').map(fold));
  return properSet.has(lowerFolded);
}

export function isAbbreviation(lowerFolded: string): boolean {
  abbrSet ??= new Set(ABBR.split('\n').map(fold));
  return abbrSet.has(lowerFolded);
}

// ── Yürüyüş ─────────────────────────────────────────────────────────────

interface Piece {
  surface: string;
  cons: Cons;
  phon: Phon;
}

/**
 * Ek gerçekleşmesi yalnızca (geçiş, ses durumu) ikilisine bağlıdır: "-lAr"
 * arka ünlüden sonra hep "lar"dır. Her yürüyüş adımında yeniden üretmek
 * yerine önbellekten verilir (profilde en sıcak noktaydı).
 */
const pieceCache = new Map<Transition, Map<string, Piece[]>>();

function phonKey(p: Phon): string {
  return (p.harm.back ? 'b' : 'f') + (p.harm.round ? 'r' : 'u') + p.last + p.aor + (p.syl > 1 ? 'm' : 's') + (p.time ? 't' : '');
}

function realizeTransition(tr: Transition, p: Phon): Piece[] {
  let byPhon = pieceCache.get(tr);
  if (!byPhon) pieceCache.set(tr, (byPhon = new Map()));
  const k = phonKey(p);
  let pieces = byPhon.get(k);
  if (!pieces) byPhon.set(k, (pieces = realizeTransitionUncached(tr, p)));
  return pieces;
}

function realizeTransitionUncached(tr: Transition, p: Phon): Piece[] {
  let surfaces: string[];
  if (tr.tpl === 'AOR') {
    surfaces = [isVowel(p.last) ? 'r' : p.aor === 'A' ? realize(A_R, p) : realize(I_R, p)];
  } else if (tr.tpl === 'CAUS') {
    if (isVowel(p.last)) surfaces = ['t'];
    else if ((p.last === 'l' || p.last === 'r') && p.syl > 1) surfaces = ['t', realize(DIR, p)];
    else surfaces = [realize(DIR, p)];
  } else if (tr.tpl === 'PASS') {
    surfaces = [isVowel(p.last) ? 'n' : p.last === 'l' ? realize(I_N, p) : realize(I_L, p)];
  } else {
    surfaces = [realize(tr.tpl, p)];
  }

  const out: Piece[] = [];
  for (const s of surfaces) {
    const ph = after(s, p);
    const last = s.at(-1)!;
    if (tr.voic && (last === 'k' || last === 'ç' || last === 't' || last === 'p')) {
      out.push({ surface: s, cons: 'noV', phon: ph });
      const vv = voice(s);
      if (vv) out.push({ surface: vv, cons: 'needV', phon: after(vv, p) });
    } else {
      out.push({ surface: s, cons: 'none', phon: ph });
    }
    if (tr.trunc && isVowel(last)) {
      const tr2 = s.slice(0, -1);
      const prefixVowel = lastVowelOf(tr2);
      out.push({
        surface: tr2,
        cons: 'needProg',
        phon: { ...ph, last: tr2.at(-1) ?? p.last, harm: prefixVowel ? harmonyOf(prefixVowel) : harmonyOf(last) },
      });
    }
  }
  return out;
}


const A_R = parseTemplate('Ar');
const I_R = parseTemplate('Ir');
const DIR = parseTemplate('DIr');
const I_N = parseTemplate('In');
const I_L = parseTemplate('Il');

function satisfies(cons: Cons, next: string | null, nextId: string | null): boolean {
  switch (cons) {
    case 'none':
      return true;
    case 'needV':
      return next !== null && isVowel(next[0]!);
    case 'noV':
      return next === null || !isVowel(next[0]!);
    case 'needProg':
      return nextId === 'Prog';
    case 'needY':
      return next !== null && next[0] === 'y';
  }
}

const MAX_DEPTH = 12;

/**
 * Ek yürüyüşü önbelleği. Sonuç yalnızca KALAN metne, duruma ve ses durumuna
 * bağlıdır; kelimenin geri kalanına bağlı değildir. "-ları", "-ında",
 * "-mıştır" gibi ek dizileri binlerce farklı kelimede tekrarlandığı için bu
 * önbellek kelimeler ARASINDA paylaşılır: öneri üretimindeki yüzlerce aday
 * kelimenin çoğu, daha önce çözülmüş bir ek dizisine iner.
 */
const walkMemo = new Map<string, boolean>();
const WALK_MEMO_MAX = 300_000;

function walk(word: string, pos: number, state: State, phon: Phon, cons: Cons, depth: number): boolean {
  if (pos === word.length) return FINAL.has(state) && satisfies(cons, null, null);
  if (depth > MAX_DEPTH) return false;
  const key = state + cons + phonKey(phon) + '|' + word.slice(pos);
  const memo = walkMemo.get(key);
  if (memo !== undefined) return memo;
  const res = walkUncached(word, pos, state, phon, cons, depth);
  if (walkMemo.size >= WALK_MEMO_MAX) walkMemo.clear();
  walkMemo.set(key, res);
  return res;
}

function walkUncached(word: string, pos: number, state: State, phon: Phon, cons: Cons, depth: number): boolean {
  for (const tr of STATES[state]) {
    if (tr.cond && !tr.cond(phon)) continue;
    if (cons === 'needProg' && tr.id !== 'Prog') continue;
    for (const piece of realizeTransition(tr, phon)) {
      const s = piece.surface;
      if (s.length === 0 || !word.startsWith(s, pos)) continue;
      if (!satisfies(cons, s, tr.id)) continue;
      if (walk(word, pos + s.length, tr.to, piece.phon, piece.cons, depth + 1)) return true;
    }
  }
  return false;
}

// ── Genel API ───────────────────────────────────────────────────────────

const cache = new Map<string, number>();
const CACHE_MAX = 50_000;

/**
 * Kelimenin en uzun geçerli kök uzunluğunu döndürür; geçersizse 0.
 * (Öneri sıralamasında "daha çok sözlüğe dayanan" çözüm tercih edilir.)
 */
export function analyzeRootLength(word: string, allowProper = false): number {
  // Ham metinle önbellek: normalleştirme maliyeti de atlanır (her tuş vuruşunda binlerce çağrı)
  const rawKey = (allowProper ? 'Z\u0001' : '\u0001') + word;
  const rawHit = cache.get(rawKey);
  if (rawHit !== undefined) return rawHit;
  const w = fold(trLower(word));
  const key = allowProper ? 'Z' + w : w;
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.set(rawKey, hit);
    return hit;
  }
  const map = ensureLoaded();
  let best = 0;
  for (let end = w.length; end >= 1 && best === 0; end--) {
    const rs = map.get(w.slice(0, end));
    if (!rs) continue;
    for (const r of rs) {
      if (r.pos === 'Z' && !allowProper) continue;
      if (walk(w, end, r.state, r.phon, r.cons, 0)) {
        best = end;
        break;
      }
    }
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, best);
  cache.set(rawKey, best);
  return best;
}

export const isValidWord = (word: string, allowProper = false): boolean => analyzeRootLength(word, allowProper) > 0;

/** Özel ada kesmeyle eklenen ek dizisi geçerli mi: Ankara + 'daki, Ahmet + 'in */
export function isValidProperSuffix(base: string, suffix: string): boolean {
  const b = fold(trLower(base));
  const s = fold(trLower(suffix));
  const phon = rootPhon(b, false, 'I', false);
  return walk(b + s, b.length, 'N0', phon, 'none', 0);
}

export const HARD = HARD_CONSONANTS;
