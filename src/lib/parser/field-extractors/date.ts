type EraDefinition = {
  name: "明治" | "大正" | "昭和" | "平成" | "令和";
  startIso: string;
  endIso?: string;
  baseYear: number;
};

const ERAS: EraDefinition[] = [
  {
    name: "明治",
    startIso: "1868-01-25",
    endIso: "1912-07-29",
    baseYear: 1867,
  },
  {
    name: "大正",
    startIso: "1912-07-30",
    endIso: "1926-12-24",
    baseYear: 1911,
  },
  {
    name: "昭和",
    startIso: "1926-12-25",
    endIso: "1989-01-07",
    baseYear: 1925,
  },
  {
    name: "平成",
    startIso: "1989-01-08",
    endIso: "2019-04-30",
    baseYear: 1988,
  },
  {
    name: "令和",
    startIso: "2019-05-01",
    baseYear: 2018,
  },
];

function toIsoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0"),
  ].join("-");
}

function withinEra(isoDate: string, era: EraDefinition): boolean {
  if (isoDate < era.startIso) {
    return false;
  }

  if (era.endIso && isoDate > era.endIso) {
    return false;
  }

  return true;
}

export function convertWareki(raw: string): string | null {
  const normalized = raw
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/元年/g, "1年");

  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(
    /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/,
  );

  if (isoMatch?.groups) {
    return toIsoDate(
      Number(isoMatch.groups.year),
      Number(isoMatch.groups.month),
      Number(isoMatch.groups.day),
    );
  }

  const seirekiMatch = normalized.match(
    /^(?<year>\d{4})年(?<month>\d{1,2})月(?<day>\d{1,2})日$/,
  );

  if (seirekiMatch?.groups) {
    return toIsoDate(
      Number(seirekiMatch.groups.year),
      Number(seirekiMatch.groups.month),
      Number(seirekiMatch.groups.day),
    );
  }

  const warekiMatch = normalized.match(
    /^(?<era>明治|大正|昭和|平成|令和)(?<year>\d+)年(?<month>\d{1,2})月(?<day>\d{1,2})日$/,
  );

  if (!warekiMatch?.groups) {
    return null;
  }

  const { groups } = warekiMatch;
  const era = ERAS.find((candidate) => candidate.name === groups.era);

  if (!era) {
    return null;
  }

  const westernYear = era.baseYear + Number(groups.year);
  const isoDate = toIsoDate(
    westernYear,
    Number(groups.month),
    Number(groups.day),
  );

  if (!isoDate || !withinEra(isoDate, era)) {
    return null;
  }

  return isoDate;
}
