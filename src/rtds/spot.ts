import type { SpotReading, TwapSymbol } from "../types.js";

interface ChainlinkSpotPayload {
  symbol?: string;
  timestamp?: number;
  value?: number;
  data?: { timestamp: number; value: number }[];
}

export function parseRtdsSpotMessage(raw: string, symbolFilter?: TwapSymbol): SpotReading | null {
  if (raw === "PONG") return null;
  let msg: { topic?: string; type?: string; payload?: ChainlinkSpotPayload };
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }

  if (msg.topic !== "crypto_prices_chainlink") return null;
  if (msg.type && msg.type !== "update" && msg.type !== "*") return null;

  const payload = msg.payload;
  if (!payload) return null;

  const ingest = (value: number | undefined, ts: number | undefined): SpotReading | null => {
    if (value == null || !Number.isFinite(value)) return null;
    const observedMs = Number(ts) || Date.now();
    const symbol = (payload.symbol ?? symbolFilter ?? "btc/usd").toLowerCase();
    if (symbolFilter && symbol !== symbolFilter) return null;
    return {
      source: "rtds-spot",
      symbol,
      value: String(value),
      observedAt: new Date(observedMs).toISOString(),
      receivedAt: new Date().toISOString(),
    };
  };

  if (Array.isArray(payload.data)) {
    const last = payload.data[payload.data.length - 1];
    return ingest(last?.value, last?.timestamp);
  }

  return ingest(payload.value, payload.timestamp);
}
