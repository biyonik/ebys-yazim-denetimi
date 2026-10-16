import type { Issue, Rule, RuleContext, Severity } from '../types.ts';
import { SEP_BLOCK, SEP_CELL } from '../types.ts';
import { isValidWord } from '../morph/analyzer.ts';
import { capitalizeTr, isLowerLetter, trLower, trUpper } from '../turkish.ts';

/**
 * Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik
 * (CB Kararı 2646, RG 10.06.2020/31151; 2026 itibarıyla değişiklik yok)
 * ve Cumhurbaşkanlığı Genel Sekreterliği Kılavuzu (Şubat 2025).
 *
 * Önem derecesi hükmün bağlayıcılığından gelir:
 *   Yönetmelikte "-ır/-ir" (kesin hüküm)  → hata
 *   Kılavuz önerisi ("-malıdır")          → uyari / oneri
 *   "-abilir" (isteğe bağlı)              → denetlenmez
 *
 * Yalnızca editörde YAZILAN metinden güvenle denetlenebilen hükümler burada.
 * Kenar boşluğu, yazı tipi, üstveri, sayfa numarası gibi hükümler EBYS'nin
 * kendi sorumluluğundadır ve kapsam dışıdır.
 */

const Y = (m: string) => `Yönetmelik m.${m}`;
const K = (s: string) => `Kılavuz §${s}`;
const TR_ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyz';

interface Line {
  start: number;
  end: number;
  text: string;
}

function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let s = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === SEP_BLOCK || text[i] === SEP_CELL) {
      out.push({ start: s, end: i, text: text.slice(s, i) });
      s = i + 1;
    }
  }
  return out;
}

function issue(
  ruleId: string,
  start: number,
  end: number,
  text: string,
  message: string,
  severity: Severity,
  ref: string,
  suggestions: string[] = [],
  extra: Partial<Issue> = {},
): Issue {
  return { ruleId, start, end, text, message, severity, category: 'bicim', suggestions, ref, ...extra };
}

// ── Konu (m.13) ─────────────────────────────────────────────────────────

/** Başlıklarda küçük kalan bağlaçlar (TDK) */
const TITLE_LOWER = new Set(['ve', 'veya', 'ile', 'ya', 'da', 'de', 'ki', 'yahut']);

const konu: Rule = {
  id: 'yonetmelik.konu',
  check({ text }) {
    const out: Issue[] = [];
    for (const ln of linesOf(text)) {
      const m = /^(\s*Konu\s*:\s*)(.*?)\s*$/.exec(ln.text);
      if (!m || !m[2]) continue;
      const vStart = ln.start + m[1]!.length;
      const value = m[2];

      // Sonuna noktalama konmaz
      const last = value.at(-1)!;
      if ('.,;:!?'.includes(last) && !/\b(vb|vs|hk)\.$/.test(value)) {
        const at = vStart + value.length - 1;
        out.push(issue('yonetmelik.konu.noktalama', at, at + 1, last, 'Konu satırının sonuna noktalama işareti konmaz.', 'hata', Y('13(1)'), ['']));
      }
      if (/^\s*diğer\s*$/i.test(value)) {
        out.push(issue('yonetmelik.konu.diger', vStart, vStart + value.length, value, 'Standart dosya planı adı ("Diğer") konu olarak yazılmaz; içeriği özetleyen bir konu yazılmalıdır.', 'uyari', K('10')));
      }
      // Kelimelerin baş harfi büyük (parantez içi ve başlık bağlaçları hariç)
      let depth = 0;
      for (const w of value.matchAll(/\(|\)|[\p{L}][\p{L}\p{M}'’]*/gu)) {
        const tok = w[0];
        if (tok === '(') depth++;
        else if (tok === ')') depth = Math.max(0, depth - 1);
        if (depth > 0 || tok === '(' || tok === ')') continue;
        const at = vStart + w.index!;
        if (tok === 'hk' && value[w.index! + 2] === '.') {
          out.push(issue('yonetmelik.konu.hk', at, at + 3, tok, 'Konuda kısaltma yerine açık yazım tercih edilir: "Hakkında".', 'oneri', K('10, Örnekler'), ['Hakkında']));
          continue;
        }
        if (TITLE_LOWER.has(trLower(tok))) continue;
        if (isLowerLetter(tok[0]!)) {
          out.push(issue('yonetmelik.konu.buyuk-harf', at, at + tok.length, tok, 'Konu satırında kelimelerin baş harfi büyük yazılır.', 'hata', Y('13(1)'), [capitalizeTr(tok)]));
        }
      }
    }
    return out;
  },
};

// ── Sayı (m.11) ─────────────────────────────────────────────────────────

const sayi: Rule = {
  id: 'yonetmelik.sayi',
  check({ text }) {
    const out: Issue[] = [];
    for (const ln of linesOf(text)) {
      const m = /^(\s*Sayı\s*:\s*)(\S+)/.exec(ln.text);
      if (!m) continue;
      const v = m[2]!;
      const at = ln.start + m[1]!.length;
      if (/^[EZO]\/\d/.test(v)) {
        out.push(issue('yonetmelik.sayi.ayirac', at, at + v.length, v, 'Sayının bölümleri arasına kısa çizgi (-) konur; eğik çizgi (/) kullanılmaz.', 'hata', `${Y('11(1)')}, ${K('31')}`, [v.replace(/\//g, '-')]));
      } else if (!/^[EZO]-\d{8}-\d{3}(?:\.\d{2})*-\d+$/.test(v) && /^[EZO]-/.test(v)) {
        out.push(issue('yonetmelik.sayi.bicim', at, at + v.length, v, 'Sayı dört bölümden oluşur: süreç harfi (E/Z/O) - DETSİS no (8 hane) - standart dosya planı kodu - kayıt no.', 'uyari', Y('11(1)')));
      }
    }
    return out;
  },
};

// ── Harfle sıralama: İlgi (m.15(5)) ve metin maddeleri (m.16(10)) ────────

interface Marker {
  letter: string;
  at: number;
  line: Line;
}

function letterMarkers(lines: Line[]): Marker[][] {
  const runs: Marker[][] = [];
  let cur: Marker[] = [];
  for (const ln of lines) {
    const m = /^(\s*(?:İlgi\s*:\s*)?)([a-zçğıöşü])\)\s/.exec(ln.text);
    if (m) {
      cur.push({ letter: m[2]!, at: ln.start + m[1]!.length, line: ln });
    } else if (ln.text.trim() !== '') {
      if (cur.length) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

const sira: Rule = {
  id: 'yonetmelik.sira',
  check({ text }) {
    const out: Issue[] = [];
    for (const run of letterMarkers(linesOf(text))) {
      if (run[0]!.letter !== 'a') continue;
      run.forEach((mk, i) => {
        const want = TR_ALPHABET[i];
        if (want && mk.letter !== want) {
          out.push(issue('yonetmelik.sira.harf', mk.at, mk.at + 1, mk.letter, `Harfle sıralamada Türk alfabesinin tüm harfleri kullanılır: bu madde “${want})” olmalı (… c) ç) d) …, g) ğ) h) ı) i) …).`, 'hata', `${Y('15(5)')}, ${Y('16(10)')}`, [want]));
        }
      });
    }
    return out;
  },
};

// ── İlgi (m.15) ─────────────────────────────────────────────────────────

function ilgiItems(lines: Line[]): Line[] {
  const items: Line[] = [];
  let inIlgi = false;
  for (const ln of lines) {
    const head = /^\s*İlgi\s*:\s*(.*)$/.exec(ln.text);
    if (head) {
      inIlgi = true;
      if (head[1]!.trim()) items.push(ln);
      continue;
    }
    if (inIlgi && /^\s*[a-zçğıöşü]\)\s/.test(ln.text)) items.push(ln);
    else if (inIlgi && ln.text.trim() !== '') inIlgi = false;
  }
  return items;
}

const ilgi: Rule = {
  id: 'yonetmelik.ilgi',
  check({ text }) {
    const out: Issue[] = [];
    const items = ilgiItems(linesOf(text));
    for (const it of items) {
      const t = it.text.replace(/\s+$/, '');
      const end = it.start + t.length;
      if (t && !t.endsWith('.')) {
        const lastWord = /(\S+)$/.exec(t)![1]!;
        out.push(issue('yonetmelik.ilgi.nokta', end - lastWord.length, end, lastWord, 'Her ilginin sonuna nokta konur.', 'hata', Y('15(7)'), [lastWord + '.']));
      }
      for (const m of t.matchAll(/\btarih ve\b/g)) {
        const at = it.start + m.index!;
        out.push(issue('yonetmelik.ilgi.tarihli', at, at + 5, 'tarih', 'İlgide kalıp "… tarihli ve … sayılı …" biçimindedir.', 'hata', Y('15(7)'), ['tarihli']));
      }
      for (const m of t.matchAll(/\b[Bb]ila\b/g)) {
        const at = it.start + m.index!;
        out.push(issue('yonetmelik.ilgi.bila', at, at + 4, m[0], 'Vatandaş başvuruları dışında "bila tarihli" ya da "tarihsiz" yazılmaz; belgenin tarihi yazılmalıdır.', 'uyari', K('12.2')));
      }
      // "1042582 sayılı": yalnız kayıt numarası — sayı dört bölümüyle yazılır
      for (const m of t.matchAll(/(^|[\s(])(\d{4,})\s+sayılı/g)) {
        const at = it.start + m.index! + m[1]!.length;
        out.push(issue('yonetmelik.ilgi.sayi', at, at + m[2]!.length, m[2]!, 'İlgide sayı dört bölümüyle eksiksiz yazılır (ör. E-35799330-902.02-1042579); yalnız kayıt numarası yetmez.', 'uyari', K('12.3')));
      }
    }
    // Tek ilgi harflenmez
    if (items.length === 1) {
      const m = /^(\s*İlgi\s*:\s*)a\)\s/.exec(items[0]!.text);
      if (m) {
        const at = items[0]!.start + m[1]!.length;
        out.push(issue('yonetmelik.ilgi.tek', at, at + 3, 'a) ', 'Tek ilgi harfle sıralanmaz.', 'oneri', `${Y('15(5)')}, Örnek 3`, ['']));
      }
    }
    // Metindeki "İlgi (c)" atıfları gerçekten var olan bir ilgiye işaret etmeli
    if (items.length > 1) {
      const letters = new Set(items.map((it) => /([a-zçğıöşü])\)\s/.exec(it.text)?.[1]).filter(Boolean));
      for (const m of text.matchAll(/[İi]lgi\s*\(([a-zçğıöşü](?:\s*[-,]\s*[a-zçğıöşü])*)\)/g)) {
        for (const l of m[1]!.split(/\s*[-,]\s*/)) {
          if (letters.has(l)) continue;
          const at = m.index!;
          out.push(issue('yonetmelik.ilgi.atif', at, at + m[0].length, m[0], `Metinde "${l})" ilgisine atıf yapılmış ama İlgi bölümünde böyle bir madde yok.`, 'hata', `${Y('15')}, ${K('13.2')}`));
        }
      }
    }
    return out;
  },
};

// ── Ek (m.18) ───────────────────────────────────────────────────────────

const ek: Rule = {
  id: 'yonetmelik.ek',
  check({ text }) {
    const out: Issue[] = [];
    const lines = linesOf(text);
    let count = 0;
    let sawEk = false;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]!;
      const head = /^(\s*)(Ekler|Ek)\s*:\s*(.*)$/.exec(ln.text);
      if (!head) continue;
      sawEk = true;
      if (head[2] === 'Ekler') {
        const at = ln.start + head[1]!.length;
        out.push(issue('yonetmelik.ek.baslik', at, at + 5, 'Ekler', 'Ek bölümünün başlığı "Ek:" biçimindedir.', 'oneri', `${Y('18(1)')}, Örnekler`, ['Ek']));
      }
      const items: Line[] = [];
      if (head[3]!.trim()) items.push(ln);
      for (let j = i + 1; j < lines.length && /^\s*\d+\s*-/.test(lines[j]!.text); j++) items.push(lines[j]!);
      count = items.length;
      if (items.length === 1) {
        const m = /^(\s*(?:Ek(?:ler)?\s*:\s*)?)(1\s*-\s*)/.exec(items[0]!.text);
        if (m) {
          const at = items[0]!.start + m[1]!.length;
          out.push(issue('yonetmelik.ek.tek', at, at + m[2]!.length, m[2]!, 'Tek ek numaralandırılmaz; "Ek:" ile aynı satıra yazılır.', 'uyari', `${Y('18(2)')}, ${K('15')}`, ['']));
        }
      } else {
        items.forEach((it, k) => {
          const m = /^(\s*)(\d+)(\s*-)/.exec(it.text);
          if (m && Number(m[2]) !== k + 1) {
            const at = it.start + m[1]!.length;
            out.push(issue('yonetmelik.ek.sira', at, at + m[2]!.length, m[2]!, `Ekler sırayla numaralandırılır; bu ek ${k + 1} olmalı.`, 'hata', Y('18(2)'), [String(k + 1)]));
          }
        });
      }
    }
    // Metindeki "Ek-3" atfı, Ek bölümündeki ek sayısını aşmamalı
    if (sawEk && count > 0) {
      for (const m of text.matchAll(/\bEk-(\d+)/g)) {
        if (Number(m[1]) <= count) continue;
        out.push(issue('yonetmelik.ek.atif', m.index!, m.index! + m[0].length, m[0], `Metinde ${m[0]} anılıyor ama Ek bölümünde ${count} ek var.`, 'hata', `${Y('18')}, ${K('13.3')}`));
      }
    }
    return out;
  },
};

// ── Sayıların yazımı (m.16(7)) ──────────────────────────────────────────

const CURRENCY = /^\s*(TL|₺|lira|liralık|kuruş|Türk lirası|avro|euro|dolar|ABD doları)\b/;

function group3(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const tutar: Rule = {
  id: 'yonetmelik.sayi-yazimi',
  check({ text, tokens }) {
    const out: Issue[] = [];
    for (const t of tokens) {
      if (t.kind !== 'number') continue;
      // 1,500,000 → 1.500.000 (binlik ayırıcı virgül değil nokta)
      if (/^\d{1,3}(,\d{3}){2,}$/.test(t.text)) {
        out.push(issue('yonetmelik.sayi-yazimi.ayirac', t.start, t.end, t.text, 'Binlik gruplar nokta ile, kesirler virgül ile ayrılır.', 'hata', Y('16(7)'), [t.text.replace(/,/g, '.')]));
        continue;
      }
      const m = /^(\d{4,})(,\d+)?$/.exec(t.text);
      if (!m) continue;
      const isAmount = !!m[2] || CURRENCY.test(text.slice(t.end, t.end + 16));
      if (!isAmount) continue; // yıl, kanun no, kayıt no: gruplanmaz
      const fixed = group3(m[1]!) + (m[2] ?? '');
      out.push(issue('yonetmelik.sayi-yazimi.grup', t.start, t.end, t.text, 'Dört ve daha fazla haneli sayılar sondan üçlü gruplara ayrılır ve araya nokta konur.', 'hata', Y('16(7)'), [fixed]));
    }
    return out;
  },
};

// ── Tarih biçimi (m.12(1), Kılavuz §9) ──────────────────────────────────

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTH_UPPER = new Map(MONTHS.map((m) => [trUpper(m), m]));

const tarih: Rule = {
  id: 'yonetmelik.tarih',
  check({ tokens }) {
    const out: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === 'number') {
        const m = /^(\d{1,2})([./])(\d{1,2})\2(\d{4})((?:['’]\p{L}+)?)$/u.exec(t.text);
        if (!m) continue;
        const [, d, sep, mo, y, suffix] = m as unknown as string[];
        const dn = Number(d);
        const mn = Number(mo);
        if (dn < 1 || dn > 31 || mn < 1 || mn > 12) continue;
        if (sep === '.' && d!.length === 2 && mo!.length === 2) continue;
        const fixed = `${d!.padStart(2, '0')}.${mo!.padStart(2, '0')}.${y}${suffix}`;
        out.push(issue('yonetmelik.tarih.bicim', t.start, t.end, t.text, 'Tarih gün.ay.yıl sırasıyla, rakamla, aralarına nokta konarak yazılır; gün ve ay iki hanelidir.', 'oneri', `${Y('12(1)')}, ${K('9')}`, [fixed]));
      } else if (t.kind === 'word' && MONTH_UPPER.has(t.text) && tokens[i - 2]?.kind === 'number') {
        out.push(issue('yonetmelik.tarih.ay', t.start, t.end, t.text, 'Ay adı harfle yazıldığında yalnız ilk harfi büyük olur.', 'oneri', K('9'), [MONTH_UPPER.get(t.text)!]));
      }
    }
    return out;
  },
};

// ── Kısaltmalar (m.16(11)) ──────────────────────────────────────────────

const ROMAN = /^(?=[IVXLCDM]+$)M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;
const ABBR_EXEMPT = new Set(['TL', 'TC', 'ABD', 'AB', 'EBYS']);

const kisaltma: Rule = {
  id: 'yonetmelik.kisaltma',
  check({ text, tokens }) {
    const out: Issue[] = [];
    const seen = new Set<string>();
    const lines = linesOf(text);
    const lineOf = (pos: number) => lines.find((l) => l.start <= pos && pos <= l.end)!;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word') continue;
      const base = t.text.split(/['’]/)[0]!;
      if (base.length < 2 || base.length > 6 || base !== trUpper(base) || base === trLower(base)) continue;
      if (seen.has(base)) continue;
      seen.add(base);
      if (ABBR_EXEMPT.has(base) || ROMAN.test(base) || isValidWord(base)) continue; // ACELE, OLUR, EK: kelime
      // Kod parçaları ve etiketler: doğrulama kodu ABCDE-FGHIJ, "PK:06520", yer tutucu XXXXXX
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if ((prev?.text === '-' && prev.end === t.start) || (next && next.start === t.end && (next.text === '-' || next.text === ':'))) continue;
      if (/[QWX]/.test(base)) continue;
      // Tamamı büyük satır (başlık, muhatap) kısaltma tanımı yeri değildir
      const ln = lineOf(t.start);
      if (ln && ln.text === trUpper(ln.text)) continue;
      // Tanımlı ilk kullanım: "Türkiye Büyük Millet Meclisi (TBMM)"
      if (tokens[i - 1]?.text === '(' && tokens[i + 1]?.text === ')') continue;
      out.push(issue('yonetmelik.kisaltma.tanim', t.start, t.start + base.length, base, `Kısaltma ilk geçtiği yerde açık hâliyle yazılır, kısaltması parantez içinde verilir: "… (${base})". Yaygın bilinen bir kısaltmaysa yoksayabilirsiniz.`, 'oneri', Y('16(11)')));
    }
    return out;
  },
};

// ── Kapanış (m.16(12)) ──────────────────────────────────────────────────

const kapanis: Rule = {
  id: 'yonetmelik.kapanis',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/\barz\s*(veya|ya da|-)\s*rica\b/gi)) {
      out.push(issue('yonetmelik.kapanis.birlikte', m.index!, m.index! + m[0].length, m[0], 'Üst, aynı ve alt düzeye birlikte gönderilen yazı "arz ve rica ederim" ya da "arz/rica ederim" ile biter.', 'hata', Y('16(12)(b)'), ['arz ve rica', 'arz/rica']));
    }
    for (const m of text.matchAll(/\b(arz|rica|arz ve rica|arz\/rica) ederim(?=\s*(?:\n|$))/g)) {
      const at = m.index! + m[0].length;
      out.push(issue('yonetmelik.kapanis.nokta', at - 6, at, 'ederim', 'Kapanış cümlesi noktayla biter.', 'hata', Y('16(12)'), ['ederim.']));
    }
    return out;
  },
};

// ── Süreli yazı ibaresi (m.26, Kılavuz §23) ─────────────────────────────

const sureli: Rule = {
  id: 'yonetmelik.sureli',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/(?<![\p{L}])(ÇOK ACELE|ÇOK İVEDİ|İVEDİ|ACİL|GÜNLÜ)(?![\p{L}])/gu)) {
      const w = m[0];
      const fix = w === 'GÜNLÜ' ? 'GÜNLÜDÜR' : 'ACELE';
      const msg = w === 'GÜNLÜ' ? 'Süreli yazı ibaresi "GÜNLÜDÜR" biçimindedir.' : 'Süreli yazılarda yalnızca "ACELE" ya da "GÜNLÜDÜR" ibaresi kullanılır.';
      out.push(issue('yonetmelik.sureli', m.index!, m.index! + w.length, w, msg, 'hata', `${Y('26(1)')}, ${K('23')}`, [fix]));
    }
    return out;
  },
};

// ── İmza bloğu (m.17) ───────────────────────────────────────────────────

const UNVAN = /(Bakan|Vali|Rektör|Başkan|Kaymakam|Dekan|Müdür|Sekreter|Müsteşar|Başkanı|Müdürü)\s+(A|v)\.\s*$/;

const imza: Rule = {
  id: 'yonetmelik.imza',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/\b[eE]-[iİ]mzalıdır\b/g)) {
      out.push(issue('yonetmelik.imza.ibare', m.index!, m.index! + m[0].length, m[0], 'Elektronik imzalı belgede ad soyadın üzerine "e-imzalıdır" benzeri ibare konmaz.', 'hata', Y('17(3)'), ['']));
    }
    for (const ln of linesOf(text)) {
      const m = UNVAN.exec(ln.text);
      if (!m) continue;
      const letter = m[2]!;
      const pos = ln.start + ln.text.lastIndexOf(letter + '.');
      out.push(
        letter === 'A'
          ? issue('yonetmelik.imza.yetki', pos, pos + 2, 'A.', 'Yetki devrinde "a." küçük harfle yazılır: "Bakan a.", "Vali a.".', 'hata', Y('17(9)'), ['a.'])
          : issue('yonetmelik.imza.vekalet', pos, pos + 2, 'v.', 'Vekâlette "V." büyük harfle yazılır: "Genel Müdür V.".', 'hata', Y('17(10)'), ['V.']),
      );
    }
    return out;
  },
};

// ── Hitap (m.14(3)) ─────────────────────────────────────────────────────

const hitap: Rule = {
  id: 'yonetmelik.hitap',
  check({ text }) {
    const out: Issue[] = [];
    for (const m of text.matchAll(/(?<![\p{L}])SAYIN(?=\s+\p{Lu})/gu)) {
      out.push(issue('yonetmelik.hitap', m.index!, m.index! + 5, 'SAYIN', 'Gerçek kişi muhataplarda hitap "Sayın" biçiminde yazılır (ad ilk harfi büyük, SOYAD tamamı büyük).', 'hata', Y('14(3)'), ['Sayın']));
    }
    return out;
  },
};

export const YONETMELIK_RULES: Rule[] = [konu, sayi, sira, ilgi, ek, tutar, tarih, kisaltma, kapanis, sureli, imza, hitap];

/** Test ve belgeleme için tek giriş noktası */
export function checkYonetmelik(ctx: RuleContext): Issue[] {
  return YONETMELIK_RULES.flatMap((r) => r.check(ctx));
}
