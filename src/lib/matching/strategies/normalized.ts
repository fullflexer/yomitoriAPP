const LEGACY_TO_MODERN_MAP: Record<string, string> = {
  "亞": "亜",
  "圍": "囲",
  "壓": "圧",
  "榮": "栄",
  "衞": "衛",
  "驛": "駅",
  "圓": "円",
  "鹽": "塩",
  "應": "応",
  "櫻": "桜",
  "學": "学",
  "覺": "覚",
  "樂": "楽",
  "罐": "缶",
  "勸": "勧",
  "卷": "巻",
  "寬": "寛",
  "歸": "帰",
  "氣": "気",
  "舊": "旧",
  "擧": "挙",
  "峽": "峡",
  "狹": "狭",
  "鄕": "郷",
  "堯": "尭",
  "國": "国",
  "碎": "砕",
  "雜": "雑",
  "濕": "湿",
  "壽": "寿",
  "收": "収",
  "從": "従",
  "澁": "渋",
  "獸": "獣",
  "將": "将",
  "燒": "焼",
  "奬": "奨",
  "條": "条",
  "乘": "乗",
  "淨": "浄",
  "釀": "醸",
  "讓": "譲",
  "孃": "嬢",
  "眞": "真",
  "寢": "寝",
  "愼": "慎",
  "盡": "尽",
  "粹": "粋",
  "醉": "酔",
  "穗": "穂",
  "靜": "静",
  "齊": "斉",
  "攝": "摂",
  "專": "専",
  "纖": "繊",
  "禪": "禅",
  "雙": "双",
  "壯": "壮",
  "搜": "捜",
  "插": "挿",
  "爭": "争",
  "總": "総",
  "聰": "聡",
  "藏": "蔵",
  "體": "体",
  "對": "対",
  "帶": "帯",
  "瀧": "滝",
  "單": "単",
  "團": "団",
  "彈": "弾",
  "晝": "昼",
  "鑄": "鋳",
  "廳": "庁",
  "徵": "徴",
  "聽": "聴",
  "敕": "勅",
  "鎭": "鎮",
  "轉": "転",
  "傳": "伝",
  "燈": "灯",
  "當": "当",
  "鬭": "闘",
  "獨": "独",
  "貳": "弐",
  "腦": "脳",
  "拜": "拝",
  "廢": "廃",
  "賣": "売",
  "麥": "麦",
  "發": "発",
  "拔": "抜",
  "濱": "浜",
  "蠻": "蛮",
  "祕": "秘",
  "彥": "彦",
  "姬": "姫",
  "拂": "払",
  "佛": "仏",
  "竝": "並",
  "變": "変",
  "邊": "辺",
  "辨": "弁",
  "辯": "弁",
  "瓣": "弁",
  "舖": "舗",
  "寶": "宝",
  "襃": "褒",
  "豐": "豊",
  "沒": "没",
  "萬": "万",
  "滿": "満",
  "麵": "麺",
  "默": "黙",
  "餠": "餅",
  "彌": "弥",
  "譯": "訳",
  "藥": "薬",
  "與": "与",
  "搖": "揺",
  "樣": "様",
  "謠": "謡",
  "來": "来",
  "覽": "覧",
  "龍": "竜",
  "兩": "両",
  "獵": "猟",
  "綠": "緑",
  "鄰": "隣",
  "壘": "塁",
  "勵": "励",
  "禮": "礼",
  "勞": "労",
  "壤": "壌",
  "廣": "広",
  "髙": "高",
  "﨑": "崎",
  "神": "神",
  "齋": "斎",
  "澤": "沢",
  "嶋": "島",
  "濵": "浜",
};

function toKatakana(value: string): string {
  return value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  );
}

function replaceLegacyCharacters(value: string): string {
  return Array.from(value, (char) => LEGACY_TO_MODERN_MAP[char] ?? char).join("");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

function longestCommonSubstringLength(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from<number>({ length: b.length + 1 }).fill(0),
  );

  let max = 0;

  for (let indexA = 1; indexA <= a.length; indexA += 1) {
    for (let indexB = 1; indexB <= b.length; indexB += 1) {
      if (a[indexA - 1] !== b[indexB - 1]) {
        matrix[indexA][indexB] = 0;
        continue;
      }

      matrix[indexA][indexB] = matrix[indexA - 1][indexB - 1] + 1;
      max = Math.max(max, matrix[indexA][indexB]);
    }
  }

  return max;
}

export function normalizeJapaneseName(raw: string): string {
  return collapseWhitespace(toKatakana(replaceLegacyCharacters(raw.normalize("NFKC"))));
}

function calculatePartialConfidence(a: string, b: string): number {
  const compactA = stripWhitespace(a);
  const compactB = stripWhitespace(b);

  if (!compactA || !compactB) {
    return 0;
  }

  const shorterLength = Math.min(compactA.length, compactB.length);
  const longerLength = Math.max(compactA.length, compactB.length);

  if (compactA.includes(compactB) || compactB.includes(compactA)) {
    const ratio = shorterLength / longerLength;
    return Number((0.5 + ratio * 0.3).toFixed(2));
  }

  const overlapLength = longestCommonSubstringLength(compactA, compactB);
  const overlapRatio = overlapLength / longerLength;

  if (overlapRatio < 0.5) {
    return 0;
  }

  return Number((0.5 + Math.min(overlapRatio, 1) * 0.3).toFixed(2));
}

export function normalizedMatch(a: string, b: string): number {
  const normalizedA = normalizeJapaneseName(a);
  const normalizedB = normalizeJapaneseName(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 0.9;
  }

  return calculatePartialConfidence(normalizedA, normalizedB);
}
