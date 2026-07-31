import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AnalyzeStats } from "../types.js";

function abs(n: number): number {
  return Math.abs(n);
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function analyzeJsonl(filePath: string): AnalyzeStats {
  const file = resolve(filePath);
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);

  const stats: AnalyzeStats = {
    file,
    rows: 0,
    twapUpdates: 0,
    compareRows: 0,
    watchRows: 0,
    deltas: [],
    spotVsTwap: [],
  };

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    stats.rows++;

    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const at = typeof row.at === "string" ? row.at : typeof row.observedAt === "string" ? row.observedAt : undefined;
    if (at) {
      if (!stats.firstAt || at < stats.firstAt) stats.firstAt = at;
      if (!stats.lastAt || at > stats.lastAt) stats.lastAt = at;
    }

    if (row.windowSeconds != null && row.source) stats.twapUpdates++;
    if (row.chainlink && row.rtds) {
      stats.compareRows++;
      const d = num(row.delta as string);
      if (d != null) stats.deltas.push(d);
    }
    if (row.spot || row.twap30 || row.twap60) {
      stats.watchRows++;
      const svt = num(row.spotVsTwap30 as string) ?? num(row.spotVsTwap as string);
      if (svt != null) stats.spotVsTwap.push(svt);
    }
  }

  if (stats.deltas.length) {
    stats.avgAbsDelta = stats.deltas.reduce((a, b) => a + abs(b), 0) / stats.deltas.length;
    stats.maxAbsDelta = Math.max(...stats.deltas.map(abs));
  }
  if (stats.spotVsTwap.length) {
    stats.avgAbsSpotVsTwap = stats.spotVsTwap.reduce((a, b) => a + abs(b), 0) / stats.spotVsTwap.length;
    stats.maxAbsSpotVsTwap = Math.max(...stats.spotVsTwap.map(abs));
  }

  return stats;
}

export function printAnalyzeStats(stats: AnalyzeStats): void {
  console.log(JSON.stringify(stats, null, 2));
}
