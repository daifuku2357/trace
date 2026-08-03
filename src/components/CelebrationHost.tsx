"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onCelebrate, type CelebrationPayload } from "@/lib/celebrate";

/**
 * お祝い演出のホスト。保存やレベルアップで紙吹雪＋メッセージを一瞬出す。
 * 紫は使わず、藍・緑・琥珀・朱の暖色で祝う。連続発火はキューにして順に見せる。
 */
const COLORS = ["#2E8B57", "#E0982A", "#1E6E90", "#DB5A2E", "#B4761A"];

const ICON: Record<CelebrationPayload["kind"], string> = {
  save: "✓",
  level: "★",
  streak: "🔥",
  focus: "◉",
  goal: "✓",
};

export default function CelebrationHost() {
  const [current, setCurrent] = useState<CelebrationPayload | null>(null);
  const queue = useRef<CelebrationPayload[]>([]);
  const showing = useRef(false);

  useEffect(() => {
    const next = () => {
      const item = queue.current.shift();
      if (!item) {
        showing.current = false;
        setCurrent(null);
        return;
      }
      showing.current = true;
      setCurrent(item);
      const dur = item.big ? 2200 : 1300;
      setTimeout(next, dur);
    };
    return onCelebrate((p) => {
      queue.current.push(p);
      if (!showing.current) next();
    });
  }, []);

  if (!current) return null;
  const big = !!current.big;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-hidden">
      {big && <Confetti />}
      <div
        className={`mt-[22vh] animate-overlayIn rounded-2xl border px-5 py-4 text-center ${
          big
            ? "border-reward bg-reward-weak shadow-lift"
            : "border-grow bg-grow-weak shadow-soft"
        }`}
      >
        <div
          className={`mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full text-xl text-paper ${
            big ? "bg-reward" : "bg-grow"
          } animate-pop`}
        >
          {ICON[current.kind]}
        </div>
        <div className="text-[15px] font-bold text-ink">{current.title}</div>
        {current.detail && <div className="mt-0.5 text-xs text-ink-2">{current.detail}</div>}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: COLORS[i % COLORS.length],
        size: 5 + Math.random() * 6,
        round: Math.random() > 0.5,
      })),
    [],
  );
  return (
    <div className="absolute inset-x-0 top-0 h-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? "9999px" : "1px",
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
