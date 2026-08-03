"use client";

import { useEffect, useState } from "react";
import JobhuntScreen from "@/components/JobhuntScreen";

/** 就活タブ: 蓄積した日記を自己分析の成果物（強み・STAR）に変える。 */
export default function JobhuntPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-64 animate-pulse rounded-xl bg-ai-weak" />;
  return <JobhuntScreen />;
}
