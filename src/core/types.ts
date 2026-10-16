/**
 * Çekirdek tipler. Bu katman DOM'u, tarayıcıyı ve CKEditor'ü bilmez:
 * yalnızca düz metin alır, sorun listesi döndürür. Böylece kurallar
 * Node üzerinde birim testiyle doğrulanabilir ve ileride WASM motoru
 * aynı sözleşmeye takılabilir.
 */

/** hata: kesin yanlış · uyari: bağlama bağlı, insan karar vermeli · oneri: üslup/biçim */
export type Severity = 'hata' | 'uyari' | 'oneri';

export type Category = 'yazim' | 'kural' | 'noktalama' | 'bicim';

export interface Issue {
  ruleId: string;
  /** Düz metin üzerinde [start, end) aralığı */
  start: number;
  end: number;
  /** Sorunun tespit edildiği andaki metin; uygulamadan önce bayatlık kontrolü için */
  text: string;
  message: string;
  severity: Severity;
  category: Category;
  suggestions: string[];
}

export type TokenKind = 'word' | 'number' | 'punct' | 'space' | 'break' | 'other';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

export interface RuleContext {
  text: string;
  tokens: Token[];
}

export interface Rule {
  id: string;
  check(ctx: RuleContext): Issue[];
}

/**
 * Düz metindeki blok ayırıcıları. TextIndex bunları üretir, tokenizer
 * 'break' token'ına çevirir. Tablo hücresini paragraftan ayırmamızın
 * sebebi: hücre başındaki küçük harf ("adet", "kg") hata değildir.
 */
export const SEP_BLOCK = '\n';
export const SEP_CELL = '\t';
/** contenteditable=false parçalar (ör. EBYS etiket alanları) için yer tutucu */
export const OBJ_CHAR = '￼';
