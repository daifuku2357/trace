"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

/** アプリ設定（key-value）。実行中の集中セッションなどの小さな状態を持つ。 */

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value });
}

export async function deleteSetting(key: string) {
  await db.settings.delete(key);
}

/** 設定値を購読する（未設定なら undefined）。 */
export function useSetting(key: string): string | undefined {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return row?.value;
}
