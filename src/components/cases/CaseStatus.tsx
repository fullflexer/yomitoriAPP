import { Badge } from "@/components/ui/badge";

const caseStatusStyles: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "success" | "warning" }> = {
  created: { label: "作成済み", variant: "secondary" },
  draft: { label: "下書き", variant: "secondary" },
  queued: { label: "待機中", variant: "warning" },
  processing: { label: "処理中", variant: "warning" },
  ocr_complete: { label: "OCR完了", variant: "success" },
  ocr_failed: { label: "OCR失敗", variant: "outline" },
  ready: { label: "準備完了", variant: "success" },
  complete: { label: "完了", variant: "success" },
  archived: { label: "保管", variant: "secondary" },
  pending: { label: "保留", variant: "secondary" },
  running: { label: "実行中", variant: "warning" },
  matched: { label: "照合済み", variant: "success" },
  review: { label: "要確認", variant: "warning" },
  blocked: { label: "停止", variant: "outline" },
  determined: { label: "判定済み", variant: "success" },
  done: { label: "完了", variant: "success" }
};

export interface CaseStatusProps {
  status: string;
  kind?: "case" | "matching";
}

export function CaseStatus({ status, kind = "case" }: CaseStatusProps) {
  const normalized = status.toLowerCase();
  const definition = caseStatusStyles[normalized] ?? {
    label: status,
    variant: kind === "matching" ? "secondary" : "default"
  };

  return <Badge variant={definition.variant}>{definition.label}</Badge>;
}
