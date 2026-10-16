# Zemberek-NLP sözlük dosyaları

Kaynak: https://github.com/ahmetaa/zemberek-nlp (`morphology/src/main/resources/tr/`)
Telif: Copyright 2018 Ahmet A. Akın, Mehmet D. Akın — Apache License 2.0 (bkz. `LICENSE`).

Kullanılan dosyalar:

| Dosya | Kullanım |
|---|---|
| `master-dictionary.dict` | Kök sözlüğü (ses olayı öznitelikleriyle) |
| `proper.dict`, `person-names.dict` | Cümle başındaki büyük harfli kelimelerin özel ad olarak tanınması |
| `abbreviations.dict` | Kısaltmaların yazım denetiminden muaf tutulması |

Bilinçli olarak **kullanılmayan**: `non-tdk.dict` — TDK'de bulunmayan biçimler içerir (ör. "meslekdaş").
Yönetmelik m.16(8) belgelerin TDK Yazım Kılavuzu ve Türkçe Sözlük'e göre yazılmasını öngörür.

Bu dosyalar değiştirilmeden kopyalanmıştır. `scripts/build-lexicon.mjs` bunlardan
`src/core/morph/data/` altındaki derlenmiş verileri üretir; yerel ekler `scripts/lexicon-supplement.txt` içindedir.
