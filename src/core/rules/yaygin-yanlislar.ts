import type { Issue, Rule, Severity } from '../types.ts';
import { harmonyOf, lastVowel, matchCase, trLower } from '../turkish.ts';

/**
 * Sık yapılan yazım yanlışları sözlüğü.
 *
 * Bu, morfoloji motoru gelene kadar köprü bir çözümdür ve motor geldikten
 * sonra da "yüksek güvenli kısa yol" olarak kalır. Sınırı şudur: sözlük
 * çekimli biçimleri bilmez. Bunu kısmen "gövde eşleme" ile çözüyoruz:
 *
 *   orjinal → orijinal  ⇒  orjinalden → orijinalden  (güvenli)
 *   makina  → makine    ⇒  makinalar  → makineler    (ek de değişir!)
 *
 * İkinci örnekte son ünlü kalından inceye döndüğü için ek de değişmek
 * zorunda; gövde eşleme yanlış öneri üretir. Bu yüzden gövde eşleme yalnızca
 * son ünlünün uyum sınıfı ve son harf AYNIYSA otomatik açılır. Aksi hâlde
 * yalnızca tam biçim yakalanır. Çekimli biçimlerin doğru düzeltilmesi
 * morfoloji motorunun işidir.
 */

interface Entry {
  wrong: string;
  right: string[];
  severity?: Severity;
  note?: string;
}

const ENTRIES: Entry[] = [
  { wrong: 'yanlız', right: ['yalnız'] },
  { wrong: 'yalnış', right: ['yanlış'] },
  { wrong: 'herkez', right: ['herkes'] },
  { wrong: 'malesef', right: ['maalesef'] },
  { wrong: 'birşey', right: ['bir şey'] },
  { wrong: 'herşey', right: ['her şey'] },
  { wrong: 'hiçbirşey', right: ['hiçbir şey'] },
  { wrong: 'hiçkimse', right: ['hiç kimse'] },
  { wrong: 'herbiri', right: ['her biri'] },
  { wrong: 'hergün', right: ['her gün'] },
  { wrong: 'herzaman', right: ['her zaman'] },
  { wrong: 'herhangibir', right: ['herhangi bir'] },
  { wrong: 'pekçok', right: ['pek çok'] },
  { wrong: 'yada', right: ['ya da'] },
  { wrong: 'yinede', right: ['yine de'] },
  { wrong: 'öyleki', right: ['öyle ki'] },
  { wrong: 'tabiki', right: ['tabii ki'] },
  { wrong: 'çünki', right: ['çünkü'] },
  { wrong: 'orjinal', right: ['orijinal'] },
  { wrong: 'laboratuar', right: ['laboratuvar'] },
  { wrong: 'makina', right: ['makine'] },
  { wrong: 'şöför', right: ['şoför'] },
  { wrong: 'egzos', right: ['egzoz'] },
  { wrong: 'rasgele', right: ['rastgele'] },
  { wrong: 'süpriz', right: ['sürpriz'] },
  { wrong: 'entellektüel', right: ['entelektüel'] },
  { wrong: 'profösör', right: ['profesör'] },
  { wrong: 'antranör', right: ['antrenör'] },
  { wrong: 'aşşağı', right: ['aşağı'] },
  { wrong: 'döküman', right: ['doküman'] },
  { wrong: 'dökümantasyon', right: ['dokümantasyon'] },
  { wrong: 'klavuz', right: ['kılavuz'] },
  { wrong: 'müsade', right: ['müsaade'] },
  { wrong: 'müracat', right: ['müracaat'] },
  { wrong: 'mütahit', right: ['müteahhit'] },
  { wrong: 'müteahit', right: ['müteahhit'] },
  { wrong: 'tasaruf', right: ['tasarruf'] },
  { wrong: 'traş', right: ['tıraş'] },
  { wrong: 'katogori', right: ['kategori'] },
  { wrong: 'kordinasyon', right: ['koordinasyon'] },
  { wrong: 'kordinatör', right: ['koordinatör'] },
  { wrong: 'provakasyon', right: ['provokasyon'] },
  { wrong: 'prosödür', right: ['prosedür'] },
  { wrong: 'metod', right: ['metot'] },
  { wrong: 'zerafet', right: ['zarafet'] },
  { wrong: 'bilimum', right: ['bilumum'] },
  { wrong: 'ünvan', right: ['unvan'] },
  // Bağlama bağlı: iki anlamlı kelimeler — kesin hata değil
  {
    wrong: 'hala',
    right: ['hâlâ'],
    severity: 'uyari',
    note: '“Henüz, şimdiye kadar” anlamındaysa şapkalı yazılır: hâlâ. Akrabalık adı (babanın kız kardeşi) ise doğrudur.',
  },
  {
    wrong: 'tabi',
    right: ['tabii'],
    severity: 'uyari',
    note: '“Elbette, doğal olarak” anlamındaysa “tabii” yazılır. “Bağımlı, uyan” anlamındaysa “tabi” doğrudur.',
  },
];

/** İki kelimelik yanlışlar: token dizisi olarak eşlenir */
const PHRASES: Entry[] = [
  { wrong: 'hiç bir', right: ['hiçbir'] },
  { wrong: 'her hangi', right: ['herhangi'] },
  { wrong: 'bir kaç', right: ['birkaç'] },
  { wrong: 'bir biri', right: ['birbiri'] },
  { wrong: 'tabi ki', right: ['tabii ki'] },
  {
    wrong: 'bir çok',
    right: ['birçok'],
    severity: 'uyari',
    note: '“Pek çok” anlamındaki “birçok” bitişik yazılır.',
  },
];

function stemSafe(e: Entry): boolean {
  if (e.right.length !== 1 || e.wrong.length < 5) return false;
  const r = e.right[0]!;
  const lw = lastVowel(e.wrong);
  const lr = lastVowel(r);
  if (!lw || !lr) return false;
  const hw = harmonyOf(lw);
  const hr = harmonyOf(lr);
  return hw.back === hr.back && hw.round === hr.round && e.wrong.at(-1) === r.at(-1);
}

const EXACT = new Map(ENTRIES.map((e) => [e.wrong, e]));
const STEMS = ENTRIES.filter((e) => !e.severity && stemSafe(e)).sort((a, b) => b.wrong.length - a.wrong.length);
const PHRASE_MAP = new Map(PHRASES.map((e) => [e.wrong, e]));

function makeIssue(start: number, end: number, text: string, e: Entry, rights: string[]): Issue {
  return {
    ruleId: 'yazim.yaygin',
    start,
    end,
    text,
    message: e.note ?? `Doğru yazımı: “${rights[0]}”.`,
    severity: e.severity ?? 'hata',
    category: 'yazim',
    suggestions: rights.map((r) => matchCase(text, r)),
  };
}

export const yayginYanlislar: Rule = {
  id: 'yazim.yaygin',
  check({ tokens }) {
    const issues: Issue[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind !== 'word') continue;
      const w = trLower(t.text);

      // İki kelimelik kalıplar
      const sp = tokens[i + 1];
      const t2 = tokens[i + 2];
      if (sp?.kind === 'space' && sp.text === ' ' && t2?.kind === 'word') {
        const ph = PHRASE_MAP.get(`${w} ${trLower(t2.text)}`);
        if (ph) {
          const text = t.text + sp.text + t2.text;
          issues.push(makeIssue(t.start, t2.end, text, ph, ph.right));
          i += 2;
          continue;
        }
      }

      const exact = EXACT.get(w);
      if (exact) {
        issues.push(makeIssue(t.start, t.end, t.text, exact, exact.right));
        continue;
      }

      // Kesme işaretli özel ad eki ("Orjinal'den") gövdeyi ayırır; yalnızca gövdeye bak
      for (const e of STEMS) {
        if (!w.startsWith(e.wrong)) continue;
        const rest = w.slice(e.wrong.length);
        if (rest.length === 0 || rest.length > 10 || !/^['’]?\p{Ll}+$/u.test(rest)) continue;
        const restOrig = t.text.slice(t.text.length - rest.length);
        issues.push(makeIssue(t.start, t.end, t.text, e, [e.right[0]! + restOrig]));
        break;
      }
    }
    return issues;
  },
};
