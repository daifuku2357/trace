"use client";

/**
 * 極小のイベントバス。どのコンポーネントからでもお祝いを発火でき、
 * レイアウト直下の <CelebrationHost/> が受けて全画面演出を出す。
 * Context のバケツリレーを避けるためのモジュールレベル pub/sub。
 */

export type CelebrationKind = "save" | "level" | "streak" | "focus" | "goal";

export interface CelebrationPayload {
  kind: CelebrationKind;
  title: string;
  detail?: string;
  /** 大きな祝い（レベル/ストリーク）は紙吹雪を増やす。 */
  big?: boolean;
}

type Listener = (p: CelebrationPayload) => void;

const listeners = new Set<Listener>();

export function celebrate(p: CelebrationPayload) {
  for (const l of listeners) l(p);
}

export function onCelebrate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
