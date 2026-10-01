"use client";

import { getLevel } from "@/levels";
import { LevelPlayer } from "./LevelPlayer";

/** Level definitions hold functions, so they're resolved on the client by id. */
export function LevelRoute({ id }: { id: string }) {
  const level = getLevel(id)!;
  return <LevelPlayer key={id} level={level} />;
}
