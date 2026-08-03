import type { DayStatus } from "@/lib/types";

/**
 * 未記入 / 記入済 / 分析済 を「色」と「形」の両方で示す（仕様書 §2 デザイン明示性）。
 * 色覚に依存しないよう、記号の形状（○ / □ / ◇）とテキストラベルを必ず併記する。
 */
const STATUS: Record<DayStatus, { mark: string; label: string; className: string }> = {
  empty: { mark: "○", label: "未記入", className: "border-rule-strong text-ink-3" },
  written: { mark: "□", label: "記入済", className: "border-ai text-ai" },
  analyzed: { mark: "◇", label: "分析済", className: "border-ai bg-ai text-paper" },
};

export default function StatusChip({ status, className = "" }: { status: DayStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] leading-none ${s.className} ${className}`}
    >
      <span aria-hidden>{s.mark}</span>
      <span>{s.label}</span>
    </span>
  );
}

export function statusOf(written: boolean, analyzed: boolean): DayStatus {
  if (analyzed) return "analyzed";
  if (written) return "written";
  return "empty";
}
