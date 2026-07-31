import type { CompareSample, SpotReading, TwapReading } from "./types.js";

export function compactTwap(r: TwapReading): string {
  const src = r.source === "chainlink" ? "cl" : "rtds";
  return `${src}:${r.windowSeconds}s=${r.value}@${r.observedAt.slice(11, 19)}`;
}

export function compactSpot(r: SpotReading): string {
  return `spot=${r.value}@${r.observedAt.slice(11, 19)}`;
}

export function printReading(r: TwapReading, compact = false): void {
  if (compact) {
    console.log(`${r.observedAt}  ${r.symbol}  ${compactTwap(r)}`);
    return;
  }
  console.log(JSON.stringify(r, null, 2));
}

export function printSpot(r: SpotReading, compact = false): void {
  if (compact) {
    console.log(`${r.observedAt}  ${r.symbol}  ${compactSpot(r)}`);
    return;
  }
  console.log(JSON.stringify(r, null, 2));
}

export function printCompare(sample: CompareSample, compact = false): void {
  if (compact) {
    const cl = sample.chainlink?.value ?? "?";
    const rt = sample.rtds?.value ?? "?";
    console.log(
      `${sample.at}  ${sample.symbol}  w=${sample.windowSeconds}s  cl=${cl}  rtds=${rt}  Δ=${sample.delta ?? "?"}`,
    );
    return;
  }
  console.log(JSON.stringify(sample, null, 2));
}

export interface WatchSnapshot {
  at: string;
  symbol: string;
  spot?: SpotReading;
  twap30?: TwapReading;
  twap60?: TwapReading;
  chainlink30?: TwapReading;
  chainlink60?: TwapReading;
  spotVsTwap30?: string;
  spotVsTwap60?: string;
  clVsRtds30?: string;
  clVsRtds60?: string;
  stale?: string[];
}

export function printWatch(s: WatchSnapshot): void {
  const parts = [
    s.at.slice(11, 19),
    s.symbol,
    s.spot ? `spot=${s.spot.value}` : "spot=—",
    s.twap30 ? `rtds30=${s.twap30.value}` : "rtds30=—",
    s.twap60 ? `rtds60=${s.twap60.value}` : "rtds60=—",
  ];
  if (s.chainlink30 || s.chainlink60) {
    parts.push(s.chainlink30 ? `cl30=${s.chainlink30.value}` : "cl30=—");
    parts.push(s.chainlink60 ? `cl60=${s.chainlink60.value}` : "cl60=—");
  }
  if (s.spotVsTwap30) parts.push(`s-30=${s.spotVsTwap30}`);
  if (s.clVsRtds30) parts.push(`cl-rtds30=${s.clVsRtds30}`);
  if (s.stale?.length) parts.push(`STALE:${s.stale.join(",")}`);
  console.log(parts.join("  "));
}
