---
title: OCR Gold Standard Dataset
app: yomitoriAPP
status: draft
updated: 2026-03-27
scope: test-fixtures
related_docs:
  - docs/requirements-definition.md
  - docs/roadmap.md
acceptance_criteria:
  - REQ-004
  - REQ-701
---

# OCR Gold Standard Dataset

このディレクトリは `SUB-YOMITORI-022` 向けの OCR ベンチマーク用ゴールドスタンダードである。
各 `koseki-00N.json` は `KosekiFields` 形式の正解データ、対応する `koseki-00N.png` は同 JSON から生成した合成戸籍画像を表す。

## データセット構成

- 件数: 10 件
- 帳票想定: H6年式以降の横書きコンピュータ化戸籍を模した合成帳票
- 1件あたり: 筆頭者 1 人 + 配偶者 1 人 + 子 1〜3 人
- データ方針: 氏名・住所・日付・事由はすべて架空
- 主要評価対象: `name` / `birthDate` / `relationship` / `deathDate`

## バリエーション

- 子 1 人 / 2 人 / 3 人
- 配偶者死亡あり
- 子の婚姻事由あり
- 死亡日あり / なし

## 生成方法

PNG を再生成する場合:

```bash
pnpm exec tsc -p tsconfig.scripts.json
node .codex-build/scripts/generate-synthetic-koseki.js
```

`scripts/generate-synthetic-koseki.ts` は JSON fixture を唯一の入力とし、対応する `koseki-00N.png` を同ディレクトリへ出力する。
実行時は `canvas` を優先使用し、利用できない環境では SVG ラスタライズのフォールバックを使う。

## 利用方法

Mock での CI 用ベンチマーク:

```bash
pnpm bench:ocr -- --mock --output docs/ocr-bench-results.md
```

Claude Vision 実ベンチマーク:

```bash
ANTHROPIC_API_KEY=... pnpm bench:ocr -- --output docs/ocr-bench-results.md
```

## 判定ルール

- 比較単位は人物ごとの `name` / `birthDate` / `relationship` / `deathDate`
- 完全一致率は `完全一致件数 / 総件数`
- 4 フィールド平均完全一致率が 90% 以上なら pass
