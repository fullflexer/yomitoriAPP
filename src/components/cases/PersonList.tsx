import type { CasePersonItem } from "@/app/(dashboard)/_lib/cases";
import { formatDate } from "@/app/(dashboard)/_lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface PersonListProps {
  persons: CasePersonItem[];
  deceasedPersonId?: string | null;
}

function getPersonSubtitle(person: CasePersonItem) {
  const segments = [
    person.birthDate ? `生: ${formatDate(person.birthDate)}` : null,
    person.deathDate ? `没: ${formatDate(person.deathDate)}` : null,
    person.gender ? `性別: ${person.gender}` : null,
    person.address ? `住所: ${person.address}` : null
  ].filter(Boolean);

  return segments.length > 0 ? segments.join(" / ") : "補助情報はまだありません";
}

export function PersonList({ persons, deceasedPersonId }: PersonListProps) {
  if (persons.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-slate-500">
          人物がまだ登録されていません。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {persons.map((person) => {
        const isDeceased = person.id === deceasedPersonId;

        return (
          <Card key={person.id}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-slate-900">
                    {person.fullName}
                  </h4>
                  {isDeceased ? <Badge variant="warning">被相続人</Badge> : null}
                </div>
                <p className="text-sm text-slate-600">{getPersonSubtitle(person)}</p>
                <p className="text-xs text-slate-500">
                  出典: {person.sourceDocument.originalFilename}
                </p>
              </div>

              <div className="text-sm text-slate-500">
                {person.fullNameKana ? <p>かな: {person.fullNameKana}</p> : null}
                {person.canonicalPersonId ? <p>統合候補あり</p> : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
