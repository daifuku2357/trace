import { TASK_CATEGORY_JA, type TaskCategory } from "@/lib/types";

/**
 * カテゴリの識別。単色ベースの制約下では色で7カテゴリを区別できないため、
 * 2文字の日本語ラベルそのものを識別子として使い、枠線で囲む（§2 デザイン明示性）。
 */
export default function CategoryTag({
  category,
  className = "",
}: {
  category: TaskCategory;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center border border-ai px-1 text-[11px] leading-tight text-ai ${className}`}
    >
      {TASK_CATEGORY_JA[category]}
    </span>
  );
}
