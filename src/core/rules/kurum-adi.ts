import type { Issue, Rule, Severity, Token } from '../types.ts';
import { analyzeRootLength, fold, isAbbreviation, isValidWord } from '../morph/analyzer.ts';
import { KURUM_ADLARI, KURUM_BASLARI } from '../lexicon/kurumlar.ts';
import { isUpperLetter, matchCase, trLower } from '../turkish.ts';

/**
 * Kurum adlarındaki yazım hataları: "Millî Eğitim Banlığı", "İlçe Mili Eğitim Müdürlügü",
 * "MİLLÎ EĞTİM BAKANLIĞI", "Bakanlğımıza".
 *
 * ── Neden ayrı bir kural? ────────────────────────────────────────────────
 * Genel sözlük kuralı (yazim-sozluk.ts) cümle içinde büyük harfle başlayan sözlük dışı kelimeyi
 * özel ad sayıp atlar (soyadları, yer adları); tamamı büyük harfli kelimeyi kısaltma sayar. Bu
 * kalkan doğrudur, ama kurum adlarını da kapsar. Burada tersinden gidilir: öbeğin bir KURUM ADI
 * olduğu biliniyorsa, içinde hangi kelimelerin geçebileceği de büyük ölçüde bilinir.
 *
 * ── Üç ayrı hata sınıfı, üç ayrı kanıt ──────────────────────────────────
 *  1. Sözlük dışı kelime, kurum adı içinde        → hata
 *       "Müdürlügüne", "Eğtim", "BAKANLIGI". Kanıt: öbekte bir kurum başı var (Müdürlüğü,
 *       Bakanlığı, Lisesi…) ya da kelimenin kendisi bir kurum başına çok yakın ("Bakanlğımıza").
 *  2. Sözlükte VAR ama bilinen bir ikilide yanlış  → uyarı
 *       "Mili Eğitim" (mil + -i): yanındaki "Eğitim" ile "Millî Eğitim" ikilisi bilindiği için.
 *  3. Kurum başına çok yakın türemiş kelime        → uyarı
 *       "Banlığı" (ban + -lık + -ı): kök kısa ve "-lık" türetmesi sözlükte kayıtlı değil;
 *       "Bakanlığı"na iki harf uzak. Cümle içinde küçük harfle de yakalanır ("banlığımıza").
 *
 * Gerçek kelime hatası (2, 3) her zaman "uyarı"dır ve "Tümünü düzelt" uygulamaz: sözlükte var olan
 * bir kelimeyi başka bir kelimeye çevirmek bir tahmindir.
 *
 * ── Yanlış alarm kalkanları ─────────────────────────────────────────────
 *  - Önce TAM eşleşme: "Başkanlığı" ile "Bakanlığı" bir harf uzaktır ama ikisi de bilinen baştır.
 *  - İlk harf aynı olmalı (ASCII katlanmış hâliyle); 4 harften kısa kelimeye dokunulmaz.
 *  - Düzeltme işareti yok sayılır: "Milli" ile "Millî" aynıdır (Kılavuz örnekleri ikisini de kullanır).
 *  - 3. sınıfta kök 4+ harfli bir sözlük kelimesiyse ("müftü-lük", "bakkal-lık", "başka-lık")
 *    türetme gerçektir, dokunulmaz. Sözlükte kendi maddesi olan türemişler ("başlık", "anlık") da öyle.
 *  - 2. sınıf yalnızca komşu kelime TAM bilindiğinde ve ikili listede varsa çalışır; kişi adları
 *    ("Hasan Doğan Milli Takımlar…") bu yüzden etkilenmez.
 *
 * Maliyet: yalnızca büyük harfli kelimeler ve "-lIk" içeren küçük harfli kelimeler incelenir;
 * bulanık karşılaştırma ilk harfe göre kovalanmış, sınırlı (en çok 2) düzenleme mesafesiyle yapılır.
 */

const REF = 'TDK Güncel Türkçe Sözlük; kurum adı';

interface Entry {
  /** Gösterim biçimi (küçük harf, düzeltme işaretli): "millî", "bakanlığı" */
  canon: string;
  /** Önek olarak karşılaştırılan normal biçimler: "bakanlığı", "bakanlığ", "bakanlık" */
  forms: string[];
  head: boolean;
  /** "-lık" başı ise kökü: "bakan", "müdür" */
  likStem?: string;
}

interface Lex {
  entries: Map<string, Entry>;
  /** Tüm biçimler → giriş (tam eşleşme için) */
  formSet: Map<string, Entry>;
  /** ASCII ilk harf → girişler */
  buckets: Map<string, Entry[]>;
  headBuckets: Map<string, Entry[]>;
  likBuckets: Map<string, Entry[]>;
  /** "sol|sağ" ikilileri (bağlaçlar atlanarak) */
  pairs: Set<string>;
  /** sağ → olası sol girişler; sol → olası sağ girişler */
  leftOf: Map<string, Entry[]>;
  rightOf: Map<string, Entry[]>;
}

const CONNECTORS = new Set(['ve', 'ile']);
const ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
const ascii = (s: string): string => s.replace(/[çğıöşü]/g, (c) => ASCII[c]!);
/** Karşılaştırma biçimi: Türkçe küçük harf, düzeltme işareti katlanmış */
const norm = (s: string): string => fold(trLower(s));
const POSS3 = /(?:s?[ıiuü])$/;
const LIK_HEAD = /^(.+)l[ıiuü]ğ[ıiuü]$/;

let LEX: Lex | null = null;

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k);
  if (a) {
    if (!a.includes(v)) a.push(v);
  } else m.set(k, [v]);
}

function lex(): Lex {
  if (LEX) return LEX;
  const entries = new Map<string, Entry>();
  const pairs = new Set<string>();
  const leftOf = new Map<string, Entry[]>();
  const rightOf = new Map<string, Entry[]>();

  const entryOf = (word: string, head = false): Entry => {
    const canon = trLower(word);
    const n = fold(canon);
    let e = entries.get(n);
    if (!e) {
      const forms = [n];
      // "bakanlığı" → "bakanlığ", "bakanlık"; "dairesi" → "daire"; "kurulu" → "kurul"
      const m = POSS3.exec(n);
      if (m && n.length - m[0].length >= 3) {
        const base = n.slice(0, -m[0].length);
        if (base.endsWith('ğ')) {
          forms.push(base);
          if (isValidWord(base.slice(0, -1) + 'k')) forms.push(base.slice(0, -1) + 'k');
        } else if (isValidWord(base)) forms.push(base);
      }
      e = { canon, forms, head: false };
      entries.set(n, e);
    }
    if (head) {
      e.head = true;
      // Yalnızca kurum başları ("sağlığı", "birliği", "değişikliği" değil); "şef", "amir" gibi kısa
      // köklerde iki harflik fark başka kelime demektir, karşılaştırmaya alınmaz.
      const lik = LIK_HEAD.exec(n);
      if (lik && lik[1]!.length >= 4) e.likStem = lik[1];
    }
    return e;
  };

  for (const line of KURUM_ADLARI.split('\n')) {
    const words = line.split(/[\s,]+/).filter(Boolean);
    if (!words.length) continue;
    let prev: Entry | null = null;
    words.forEach((w, i) => {
      if (CONNECTORS.has(w)) return;
      // "Ar-Ge" gibi tireli parçalar ikilide yer almaz, kelime dağarcığına girer
      const parts = w.split('-');
      const e = entryOf(parts[0]!, i === words.length - 1 && parts.length === 1);
      for (const p of parts.slice(1)) entryOf(p);
      if (prev && parts.length === 1) {
        pairs.add(`${prev.forms[0]}|${e.forms[0]}`);
        push(leftOf, e.forms[0]!, prev);
        push(rightOf, prev.forms[0]!, e);
      }
      prev = parts.length === 1 ? e : null;
    });
  }
  for (const w of KURUM_BASLARI.split(/\s+/).filter(Boolean)) entryOf(w, true);

  const formSet = new Map<string, Entry>();
  const buckets = new Map<string, Entry[]>();
  const headBuckets = new Map<string, Entry[]>();
  const likBuckets = new Map<string, Entry[]>();
  for (const e of entries.values()) {
    for (const f of e.forms) formSet.set(f, e);
    const k = ascii(e.forms[0]![0]!);
    push(buckets, k, e);
    if (e.head) push(headBuckets, k, e);
    if (e.likStem) push(likBuckets, k, e);
  }
  LEX = { entries, formSet, buckets, headBuckets, likBuckets, pairs, leftOf, rightOf };
  return LEX;
}

/** a'nın harfleri sırasıyla b'de var mı (yalnızca eksik harf: "kaymak" → "kaymakam") */
function isSubsequence(a: string, b: string): boolean {
  let j = 0;
  for (let i = 0; i < b.length && j < a.length; i++) if (b[i] === a[j]) j++;
  return j === a.length;
}

/** Sınırlı Levenshtein: max'ı aşarsa max + 1 döner */
function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Kelime, bir sözlük biçimi + geçerli ek dizisi olarak kurulabiliyorsa o giriş ("bakanlığımıza" → bakanlığı) */
function knownEntry(n: string, L: Lex): Entry | undefined {
  const hit = knownMemo.get(n);
  if (hit !== undefined) return hit ?? undefined;
  let found: Entry | null = null;
  for (let k = n.length; k >= 3; k--) {
    const e = L.formSet.get(n.slice(0, k));
    if (!e) continue;
    if (k === n.length || isValidWord(n)) {
      found = e;
      break;
    }
  }
  if (knownMemo.size > 20_000) knownMemo.clear();
  knownMemo.set(n, found);
  return found ?? undefined;
}
/** Her tuş vuruşunda belgenin tamamı yeniden denetlenir; kelime başına sonuçlar saklanır */
const knownMemo = new Map<string, Entry | null>();
const fuzzyMemo = new Map<string, Match[]>();
function fuzzyCached(key: string, n: string, candidates: () => Iterable<Entry>): Match[] {
  let r = fuzzyMemo.get(key);
  if (!r) {
    if (fuzzyMemo.size > 20_000) fuzzyMemo.clear();
    r = fuzzy(n, candidates());
    fuzzyMemo.set(key, r);
  }
  return r;
}

interface Match {
  /** Normal biçimde düzeltilmiş kelime */
  fixed: string;
  /** Gösterim biçimi: düzeltme işareti korunmuş */
  display: string;
  entry: Entry;
  /** 0: yalnızca Türkçe karakter farkı */
  dist: number;
  /** Eşleşen sözlük biçimi */
  form?: string;
}

/** Kelimeyi aday girişlere yakınlığına göre eşler (önek + geçerli ek) */
function fuzzy(n: string, candidates: Iterable<Entry>): Match[] {
  const out: Match[] = [];
  const an = ascii(n);
  for (const e of candidates) {
    for (const f of e.forms) {
      if (f.length < 4) continue;
      const max = f.length >= 8 ? 2 : 1;
      for (let k = Math.max(3, f.length - max); k <= Math.min(n.length, f.length + max); k++) {
        const p = n.slice(0, k);
        if (p === f) continue;
        const ap = an.slice(0, k);
        const af = ascii(f);
        const d = ap === af ? 0 : lev(p, f, max);
        if (d > max) continue;
        const rest = n.slice(k);
        const fixed = f + rest;
        if (!isValidWord(fixed)) continue;
        const display = (f === e.forms[0] ? e.canon : f) + rest;
        out.push({ fixed, display, entry: e, dist: d, form: f });
      }
    }
  }
  if (!out.length) return out;
  const best = Math.min(...out.map((m) => m.dist));
  const seen = new Set<string>();
  return out.filter((m) => m.dist === best && !seen.has(m.fixed) && seen.add(m.fixed));
}

const isCap = (s: string) => isUpperLetter(s[0] ?? '');
const baseOf = (raw: string) => raw.split(/['’]/)[0]!;

/**
 * Düzeltme işaretli ("Millî") ve işaretsiz ("Milli") biçim ikisi de önerilir; belge hangisini
 * kullanıyorsa o öne alınır. Kılavuz ikisini de kullandığı için eklenti birini dayatmaz.
 */
function variants(raw: string, m: Match, rest: string, lowerText: string): string[] {
  const a = matchCase(raw, m.display) + rest;
  if (!/[âîû]/.test(m.display)) return [a];
  const b = matchCase(raw, fold(m.display)) + rest;
  return lowerText.includes(m.entry.canon) ? [a, b] : [b, a];
}

interface Slot {
  tok: Token;
  prev?: Token;
  next?: Token;
  n: string;
  raw: string;
  rest: string;
}

export const kurumAdi: Rule = {
  id: 'yazim.kurum',
  check({ text, tokens }) {
    const out: Issue[] = [];
    let L: Lex | null = null;
    let lowerText: string | null = null;
    const lt = () => (lowerText ??= trLower(text));

    const emit = (s: Slot, ms: Match[], severity: Severity, realWord: boolean) => {
      const sugs = [...new Set(ms.slice(0, 3).flatMap((m) => variants(s.raw, m, s.rest, lt())))];
      const first = sugs[0]!;
      const message = realWord
        ? `“${s.raw}” sözlükte geçen bir kelime, ama kurum adı olarak “${first}” kastedilmiş olabilir. Kurumun adı buysa yoksayın.`
        : ms[0]!.dist === 0
          ? `Kurum adında Türkçe karakter eksik: “${first}”.`
          : `Kurum adında yazım hatası: “${first}” olmalı.`;
      out.push({
        ruleId: realWord ? 'yazim.kurum.anlam' : 'yazim.kurum',
        start: s.tok.start,
        end: s.tok.start + s.raw.length,
        text: s.raw,
        message,
        severity,
        category: 'yazim',
        suggestions: sugs,
        autoFix: !realWord && ms.length === 1 && ms[0]!.dist === 0 && !/[âîû]/.test(ms[0]!.display),
        ref: REF,
      });
    };

    /**
     * 3. sınıf: "ban-lık" gibi kısa köklü, sözlükte kaydı olmayan "-lık" türetmesi. Kök, kurum
     * başlarının köküyle (bakan, müdür, kaymakam…) karşılaştırılır; ek kısmı aynen korunur.
     * headPos: kelime büyük harfli bir öbeğin SON kelimesi ("Altıeylül Kaymaklığına"); bu konumda
     * kök sözlükte olsa da ("kaymak") yalnızca EKSİK harf varsa uyarılır: "kaymak" ⊂ "kaymakam".
     * "Başbakanlığı" (başbakan ⊄ başkan), "Veliliği" (veli ⊄ vali), "Babalığı" (baba ⊄ bakan) temiz kalır.
     */
    const likCheck = (s: Slot, headPos = false): boolean => {
      const m = /^(.{3,}?)(l[ıiuü][kğ].*)$/.exec(s.n);
      if (!m) return false;
      const stem = m[1]!;
      const tail = m[2]!;
      if (analyzeRootLength(s.n) > stem.length) return false; // "başlık", "anlık", "sağlık": sözlükte madde
      const lexStem = stem.length >= 4 && isValidWord(stem);
      if (lexStem && !headPos) return false; // "müftü-lük", "bakkal-lık"
      L ??= lex();
      const ms: Match[] = [];
      for (const e of L.likBuckets.get(ascii(stem[0]!)) ?? []) {
        const target = e.likStem!;
        if (target === stem) continue;
        const max = target.length >= 5 ? 2 : 1;
        const d = ascii(target) === ascii(stem) ? 0 : lev(stem, target, max);
        if (d > max) continue;
        if (lexStem && !(target.length > stem.length && isSubsequence(stem, target))) continue;
        const fixed = target + tail;
        if (!isValidWord(fixed)) continue;
        ms.push({ fixed, display: fixed, entry: e, dist: d });
      }
      if (!ms.length) return false;
      const best = Math.min(...ms.map((x) => x.dist));
      emit(s, ms.filter((x) => x.dist === best), 'uyari', true);
      return true;
    };

    // ── Büyük harfli öbekler ──
    let run: Slot[] = [];
    const flush = () => {
      if (run.length) checkRun(run);
      run = [];
    };
    const checkRun = (slots: Slot[]) => {
      L ??= lex();
      const Lx = L;
      const ent = slots.map((s) => (s.n.length >= 3 ? knownEntry(s.n, Lx) : undefined));
      const known = ent.map(Boolean);
      const valid = slots.map((s, i) => known[i] || isValidWord(s.raw, true));
      const isHead = (s: Slot, i: number): boolean => {
        if (ent[i]) return ent[i]!.head;
        // Kelimenin kendisi bir kurum başına yakınsa ("Bakanlğımıza"): yalnızca ayırt edici uzun
        // başlar (bakanlığ, müdürlüğ…); "ajan", "okul", "lise" gibi kısa biçimler bilinmeyen özel
        // adlara ("Abanlı", "Okuluk") kolayca benzer.
        return (
          !valid[i] &&
          s.n.length >= 6 &&
          fuzzyCached('h|' + s.n, s.n, () => Lx.headBuckets.get(ascii(s.n[0]!)) ?? []).some((m) => (m.form?.length ?? 0) >= 6)
        );
      };
      const inst = slots.some(isHead);

      slots.forEach((s, i) => {
        if (known[i] || s.n.length < 4) return;
        // Adres parçası: "…/MevzuatMetin/Cumhurbaskanligi"
        if (s.prev?.text === '/' || s.next?.text === '/') return;
        if (isAbbreviation(s.n) && s.raw.length <= 5 && !/\p{Ll}/u.test(s.raw)) return;
        if (!valid[i]) {
          // 1. sınıf: sözlük dışı kelime kurum adında
          if (!inst) return;
          const ms = fuzzyCached('a|' + s.n, s.n, () => Lx.buckets.get(ascii(s.n[0]!)) ?? []);
          if (ms.length) emit(s, ms, 'hata', false);
          return;
        }
        // 2. sınıf: bilinen ikilide yanlış kelime. Yalnızca kökü kısa (≤3) çözümlemeler: uzun köklü
        // geçerli kelime başka bir kelimenin çekimidir ("Başkanı" ≠ "Başkanlığı", "Yazı İşleri",
        // "İşletmeleri"); kısa kök + ek ise çoğunlukla bozulmuş kelimenin tesadüfi çözümlemesidir
        // ("Mili" = mil + -i, "Banlığı" = ban + -lık + -ı).
        if (analyzeRootLength(s.raw, true) > 3) {
          likCheck(s, slots.length >= 2 && i === slots.length - 1);
          return;
        }
        const cands = new Set<Entry>();
        const pe = ent[i - 1];
        const ne = ent[i + 1];
        if (pe) for (const e of Lx.rightOf.get(pe.forms[0]!) ?? []) cands.add(e);
        if (ne) for (const e of Lx.leftOf.get(ne.forms[0]!) ?? []) cands.add(e);
        const first = ascii(s.n[0]!);
        const ms = fuzzy(s.n, [...cands].filter((e) => ascii(e.forms[0]![0]!) === first));
        if (ms.length) {
          emit(s, ms, 'uyari', true);
          return;
        }
        likCheck(s, slots.length >= 2 && i === slots.length - 1);
      });
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'word') {
        const raw = baseOf(t.text);
        const slot: Slot = { tok: t, raw, n: norm(raw), rest: t.text.slice(raw.length), prev: tokens[i - 1], next: tokens[i + 1] };
        if (isCap(raw)) {
          run.push(slot);
          continue;
        }
        if (run.length && CONNECTORS.has(raw) && tokens[i - 1]?.kind === 'space') continue;
        flush();
        // Küçük harfli kelime: yalnızca 3. sınıf ("banlığımıza")
        if (raw.length >= 6 && /l[ıiuü][kğ]/.test(slot.n) && isValidWord(raw)) likCheck(slot);
        continue;
      }
      if (t.kind === 'space' && t.text === ' ') continue;
      if (t.kind === 'punct' && (t.text === ',' || t.text === '-') && run.length) continue;
      flush();
    }
    flush();
    return out;
  },
};
