"use client";

import { useMemo } from "react";

/**
 * 育つ木。レベルが上がるほど幹が伸び、葉が茂り、実（琥珀）が増える。
 * さらに集中タイマーの累計分に応じて、足元の芽・花、地中の結晶、空中の光の粒子が増える
 * （没頭と成果の可視化）。書く・集中するたびに「自分の一本」が育つのを眺めて嬉しい、を狙う。
 * レイアウトは決定的な擬似乱数で決め、再描画や数値の増加でも既存の配置がズレない。
 */
export default function GrowthTree({
  level,
  streak = 0,
  focusMinutes = 0,
}: {
  level: number;
  streak?: number;
  focusMinutes?: number;
}) {
  const { leaves, fruits, trunkTop, grass } = useMemo(() => build(level, streak), [level, streak]);
  // 集中要素はレベルと独立の固定シードで作り、集中分が増えても既存要素が動かないようにする。
  const { sprouts, crystals, particles } = useMemo(() => buildFocus(focusMinutes), [focusMinutes]);

  return (
    <svg
      viewBox="0 0 200 170"
      className="h-40 w-full"
      role="img"
      aria-label={`成長の木 Lv.${level}・集中${focusMinutes}分`}
    >
      {/* 背景: 光の粒子（ゾーン状態）。木より奥に描き、ちらつかせる。 */}
      {particles.map((p, i) => (
        <circle
          key={`p${i}`}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill="#E7B24D"
          opacity={p.op}
          className="animate-pulse"
          style={{ animationDelay: `${p.delay}ms` }}
        />
      ))}

      {/* 地面 */}
      <line x1="20" y1="150" x2="180" y2="150" stroke="#C9C4B6" strokeWidth="1.5" />

      {/* 地中: 集中の蓄積を表す結晶（藍・紺系）。 */}
      {crystals.map((c, i) => (
        <g key={`c${i}`}>
          <polygon
            points={`${c.x},${(c.y - c.s).toFixed(1)} ${(c.x + c.s * 0.7).toFixed(1)},${c.y} ${c.x},${(c.y + c.s).toFixed(1)} ${(c.x - c.s * 0.7).toFixed(1)},${c.y}`}
            fill="#1E6E90"
            stroke="#134E67"
            strokeWidth="0.6"
          />
          <line
            x1={c.x}
            y1={(c.y - c.s + 0.6).toFixed(1)}
            x2={c.x}
            y2={(c.y + c.s - 0.6).toFixed(1)}
            stroke="#8Fc4d6"
            strokeWidth="0.5"
            opacity="0.7"
          />
        </g>
      ))}

      {/* 草（ストリークで増える） */}
      {grass.map((g, i) => (
        <path
          key={`g${i}`}
          d={`M${g.x} 150 q ${g.dir * 2} -${g.h} ${g.dir * 0.6} -${g.h + 2}`}
          stroke="#449063"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      ))}

      {/* 足元: 集中の芽・花（集中を始めた芽生え）。 */}
      {sprouts.map((s, i) => {
        const headY = 150 - s.h;
        return (
          <g key={`s${i}`}>
            <line x1={s.x} y1="150" x2={s.x} y2={headY} stroke="#2E8B57" strokeWidth="1.2" strokeLinecap="round" />
            {Array.from({ length: s.petals }).map((_, k) => {
              const a = (k / s.petals) * Math.PI * 2;
              return (
                <circle
                  key={k}
                  cx={(s.x + Math.cos(a) * 2.2).toFixed(1)}
                  cy={(headY + Math.sin(a) * 2.2).toFixed(1)}
                  r="1.7"
                  fill={s.color}
                />
              );
            })}
            <circle cx={s.x} cy={headY} r="1.3" fill="#E0982A" />
          </g>
        );
      })}

      {/* 木（下端を軸に、ゆっくり揺れる） */}
      <g style={{ transformOrigin: "100px 150px" }} className="animate-sway">
        {/* 幹 */}
        <path
          d={`M97 150 L97 ${trunkTop + 6} Q100 ${trunkTop} 103 ${trunkTop + 6} L103 150 Z`}
          fill="#7A5C3E"
        />
        {/* 枝 */}
        {level >= 2 && (
          <>
            <path d={`M100 ${trunkTop + 30} q -14 -6 -22 -16`} stroke="#7A5C3E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d={`M100 ${trunkTop + 40} q 14 -6 22 -14`} stroke="#7A5C3E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* 葉 */}
        {leaves.map((l, i) => (
          <circle key={`l${i}`} cx={l.x} cy={l.y} r={l.r} fill={l.fill} opacity={l.op} />
        ))}

        {/* 実（琥珀） */}
        {fruits.map((f, i) => (
          <circle key={`f${i}`} cx={f.x} cy={f.y} r="3.2" fill="#E0982A" stroke="#B4761A" strokeWidth="0.6" />
        ))}
      </g>
    </svg>
  );
}

function build(level: number, streak: number) {
  const rnd = mulberry32(level * 2654435761 + 12345);
  const grown = Math.min(level, 14);

  // 幹はレベルとともに高く（上端の y は小さいほど高い）。
  const trunkTop = 118 - grown * 6; // Lv1: 112, Lv14: 34
  const canopyCy = trunkTop - 4;
  const canopyR = 20 + grown * 3.2; // 茂りの広がり

  const leafGreens = ["#2E8B57", "#449063", "#73B389", "#3C8C5A"];
  const clusters = Math.min(4 + level * 2, 26);
  const leaves = Array.from({ length: clusters }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.6) * canopyR;
    return {
      x: 100 + Math.cos(ang) * rad,
      y: canopyCy - 6 + Math.sin(ang) * rad * 0.7,
      r: 7 + rnd() * 8,
      fill: leafGreens[Math.floor(rnd() * leafGreens.length)],
      op: 0.85 + rnd() * 0.15,
    };
  });

  const fruitCount = level >= 3 ? Math.min(Math.floor((level - 1) / 2), 9) : 0;
  const fruits = Array.from({ length: fruitCount }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = (0.4 + rnd() * 0.5) * canopyR;
    return { x: 100 + Math.cos(ang) * rad, y: canopyCy + Math.sin(ang) * rad * 0.7 };
  });

  // 足元の草はストリークで増える（継続が景色になる）。
  const grassCount = Math.min(2 + streak, 18);
  const grass = Array.from({ length: grassCount }, (_, i) => ({
    x: 26 + (i / Math.max(1, grassCount - 1)) * 148 + (rnd() - 0.5) * 4,
    h: 5 + rnd() * 7,
    dir: rnd() > 0.5 ? 1 : -1,
  }));

  return { leaves, fruits, trunkTop, grass };
}

/**
 * 集中の累計分に応じた要素。閾値で本数が決まる:
 * 芽・花 30分ごと(最大8) / 結晶 120分ごと(最大5) / 光の粒子 60分ごと(最大12)。
 * 固定シードで最大数ぶんの配置を先に作り、本数だけ slice する。
 * こうすると集中分が増えても、すでに出ている要素の位置は一切動かない。
 */
function buildFocus(focusMinutes: number) {
  const fm = Math.max(0, Math.floor(focusMinutes));
  const nSprout = Math.min(Math.floor(fm / 30), 8);
  const nCrystal = Math.min(Math.floor(fm / 120), 5);
  const nParticle = Math.min(Math.floor(fm / 60), 12);

  const frnd = mulberry32(0x9e3779b9); // レベルと独立の固定シード
  const sproutColors = ["#E0982A", "#DB5A2E", "#2E8B57"]; // 琥珀・朱・緑（紫なし）

  // 生成順・個数を固定（常に最大数を作る）ことで乱数列を安定させる。
  const sproutsAll = Array.from({ length: 8 }, (_, i) => ({
    x: 32 + (i / 7) * 136 + (frnd() - 0.5) * 6,
    h: 9 + frnd() * 7,
    color: sproutColors[Math.floor(frnd() * sproutColors.length)],
    petals: 4 + Math.floor(frnd() * 2),
  }));
  const crystalsAll = Array.from({ length: 5 }, (_, i) => ({
    x: 40 + (i / 4) * 120 + (frnd() - 0.5) * 8,
    y: 155 + frnd() * 8, // 地中 155〜163
    s: 3 + frnd() * 2,
  }));
  const particlesAll = Array.from({ length: 12 }, () => ({
    x: 22 + frnd() * 156,
    y: 18 + frnd() * 98, // 空中 18〜116
    r: 1.4 + frnd() * 1.6,
    op: 0.45 + frnd() * 0.4,
    delay: Math.floor(frnd() * 1200),
  }));

  return {
    sprouts: sproutsAll.slice(0, nSprout),
    crystals: crystalsAll.slice(0, nCrystal),
    particles: particlesAll.slice(0, nParticle),
  };
}

/** 決定的な擬似乱数（seed から安定した形を作る）。 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
