import type { SpotReading, TwapReading } from "./types.js";

export function ageMs(reading: { observedAt: string; receivedAt?: string }, now = Date.now()): number {
  const t = Date.parse(reading.receivedAt ?? reading.observedAt);
  return Number.isFinite(t) ? now - t : Infinity;
}

export function isStale(
  reading: { observedAt: string; receivedAt?: string } | undefined,
  maxAgeMs: number,
  now = Date.now(),
): boolean {
  if (!reading) return true;
  return ageMs(reading, now) > maxAgeMs;
}

export function staleLabels(
  labels: Record<string, { observedAt: string; receivedAt?: string } | undefined>,
  maxAgeMs: number,
): string[] {
  const out: string[] = [];
  for (const [label, reading] of Object.entries(labels)) {
    if (isStale(reading, maxAgeMs)) out.push(label);
  }
  return out;
}

export type PriceBoard = {
  spot?: SpotReading;
  twap30?: TwapReading;
  twap60?: TwapReading;
  chainlink30?: TwapReading;
  chainlink60?: TwapReading;
};
