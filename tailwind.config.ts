import type { Config } from "tailwindcss";

/**
 * 配色トークン。
 * 唯一の禁止は「紫の画面」（紫→青グラデ / ネオン / ダークガラスモーフィズム）。
 * それ以外は報酬感を優先し、影・角丸・アニメーションを解禁する。
 * 紙のトーンを基調に、成長=緑 / 報酬=琥珀 / アクセント=藍 の3色で気持ちよさを作る。
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFAF7", // 背景（温かいオフホワイト）
        "paper-2": "#F3F1EA", // 一段沈んだ面
        ink: "#22201C", // 本文（墨）
        "ink-2": "#5A574F", // 副次
        "ink-3": "#8C887E", // 補助
        rule: "#E4E0D6", // 罫線
        "rule-strong": "#C9C4B6",

        // アクセント: 藍
        ai: "#1E6E90",
        "ai-ink": "#134E67",
        "ai-weak": "#E9F1F4",

        // 成長: 緑（木・レベル・積み上げ）
        grow: "#2E8B57",
        "grow-ink": "#1E6B41",
        "grow-weak": "#E7F2EA",

        // 報酬: 琥珀（お祝い・XP・節目）
        reward: "#E0982A",
        "reward-ink": "#B4761A",
        "reward-weak": "#FBF1DC",

        // 連続: 朱寄りの橙（ストリーク）
        flame: "#DB5A2E",
        "flame-weak": "#FBE8DF",

        // ヒートマップ用・緑の5段階濃淡（草が育つ感じ）
        s1: "#DCEBE0",
        s2: "#AAD2B6",
        s3: "#73B389",
        s4: "#449063",
        s5: "#2E8B57",
      },
      fontFamily: {
        sans: [
          "游ゴシック体",
          "YuGothic",
          "游ゴシック",
          "Yu Gothic",
          "Noto Sans JP",
          "Hiragino Kaku Gothic ProN",
          "Meiryo",
          "sans-serif",
        ],
        mono: ["SFMono-Regular", "Consolas", "Menlo", "monospace"],
      },
      maxWidth: {
        app: "44rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(34,32,28,0.06), 0 4px 12px rgba(34,32,28,0.06)",
        lift: "0 2px 4px rgba(34,32,28,0.08), 0 12px 28px rgba(34,32,28,0.12)",
        glow: "0 0 0 3px rgba(224,152,42,0.25)",
      },
      keyframes: {
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.9)" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-28px) scale(1.05)" },
        },
        pop: {
          "0%": { transform: "scale(0.7)" },
          "55%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
        fillbar: {
          "0%": { transform: "scaleX(var(--from,0))" },
          "100%": { transform: "scaleX(var(--to,1))" },
        },
        sway: {
          "0%,100%": { transform: "rotate(-1.2deg)" },
          "50%": { transform: "rotate(1.2deg)" },
        },
        confettiFall: {
          "0%": { opacity: "0", transform: "translateY(-10px) rotate(0deg)" },
          "10%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(140px) rotate(320deg)" },
        },
        overlayIn: {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        sheen: {
          "0%": { backgroundPosition: "-120% 0" },
          "100%": { backgroundPosition: "220% 0" },
        },
      },
      animation: {
        floatUp: "floatUp 1.1s ease-out forwards",
        pop: "pop 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        sway: "sway 5s ease-in-out infinite",
        confetti: "confettiFall 1.4s ease-in forwards",
        overlayIn: "overlayIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        sheen: "sheen 1.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
