#!/bin/sh
# TDD gate: validate docs/requirements-definition.md structure
set -e

FILE="docs/requirements-definition.md"
ERRORS=0

check() {
  if ! grep -q "$1" "$FILE" 2>/dev/null; then
    echo "FAIL: missing '$1'"
    ERRORS=$((ERRORS + 1))
  fi
}

# File exists
if [ ! -f "$FILE" ]; then
  echo "FAIL: $FILE does not exist"
  exit 1
fi

# 8 categories
check "## 1\. 入力・OCR要件"
check "## 2\. データモデル要件"
check "## 3\. 相続判定ロジック要件"
check "## 4\. 出力・図面要件"
check "## 5\. UX・業務フロー要件"
check "## 6\. 技術アーキテクチャ要件"
check "## 7\. 法的・コンプライアンス要件"
check "## 8\. 開発フェーズ分割"

# REQ-N IDs
if ! grep -qE 'REQ-[0-9]+' "$FILE"; then
  echo "FAIL: no REQ-N format IDs found"
  ERRORS=$((ERRORS + 1))
fi

# Must/Should/Could priorities
for P in Must Should Could; do
  check "$P"
done

# Tech stack comparison table in section 6
check "Claude Vision"
check "PostgreSQL"
check "React Flow"

# OCR accuracy measurement
check "CER"
check "フィールド正解率"
check "ゴールドスタンダード"

# MVP scope
check "包含"
check "除外"
check "H6年"

# OQ-N references
if ! grep -qE 'OQ-[0-9]+' "$FILE"; then
  echo "FAIL: no OQ-N references found"
  ERRORS=$((ERRORS + 1))
fi

# 6 attributes per requirement (spot check)
check "背景"
check "受入基準"
check "依存"

if [ $ERRORS -gt 0 ]; then
  echo "VALIDATION FAILED: $ERRORS errors"
  exit 1
fi

echo "VALIDATION PASSED"
