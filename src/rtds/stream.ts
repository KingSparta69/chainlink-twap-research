import { RTDS_TWAP_TOPICS } from "../feeds.js";
import type { SpotReading, TwapReading, TwapSymbol, TwapWindowSeconds } from "../types.js";
import { RtdsClient } from "./client.js";
import { parseRtdsSpotMessage } from "./spot.js";
import { formatE18, E18 } from "../e18.js";

interface RtdsTwapPayload {
  symbol?: string;
  value?: number;
  full_accuracy_value?: string;
  timestamp?: number;
  window_s?: number;
}

function valueFromPayload(payload: RtdsTwapPayload): string {
  if (payload.full_accuracy_value) {
    try {
      return formatE18(BigInt(payload.full_accuracy_value));
    } catch {
      /* fall through */
    }
  }
  if (payload.value != null && Number.isFinite(payload.value)) return String(payload.value);
  throw new Error("RTDS payload missing price value");
}

export function parseRtdsTwapMessage(
  raw: string,
  windowSeconds: TwapWindowSeconds,
  symbolFilter?: TwapSymbol,
): TwapReading | null {
  if (raw === "PONG") return null;
  let msg: { topic?: string; type?: string; payload?: RtdsTwapPayload; body?: { message?: string } };
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }

  if (msg.body?.message) return null;

  const topic = msg.topic ?? "";
  if (topic !== RTDS_TWAP_TOPICS[windowSeconds] && topic !== "prices.crypto.chainlink.twap") {
    return null;
  }
  if (msg.type && msg.type !== "update") return null;

  const payload = msg.payload;
  if (!payload?.symbol) return null;

  const symbol = payload.symbol.toLowerCase();
  if (symbolFilter && symbol !== symbolFilter) return null;

  const win = (payload.window_s ?? windowSeconds) as TwapWindowSeconds;
  const observedMs = Number(payload.timestamp) || Date.now();

  return {
    source: "rtds",
    symbol,
    windowSeconds: win,
    value: valueFromPayload(payload),
    observedAt: new Date(observedMs).toISOString(),
    receivedAt: new Date().toISOString(),
  };
}

function isRtdsError(raw: string): boolean {
  if (raw === "PONG") return false;
  try {
    const msg = JSON.parse(raw) as { body?: { message?: string } };
    return Boolean(msg.body?.message);
  } catch {
    return false;
  }
}

/** RTDS rejects TWAP + spot in one subscribe batch until TWAP is live — use separate sockets. */
export function createRtdsMultiplex(opts: {
  symbol: TwapSymbol;
  windows: TwapWindowSeconds[];
  includeSpot?: boolean;
  onTwap: (r: TwapReading) => void;
  onSpot?: (r: SpotReading) => void;
  onStatus?: (connected: boolean) => void;
  onTwapError?: (message: string) => void;
}): { start: () => void; close: () => void } {
  const clients: RtdsClient[] = [];
  let connected = 0;

  const bumpStatus = () => {
    opts.onStatus?.(connected > 0);
  };

  if (opts.includeSpot && opts.onSpot) {
    const spot = new RtdsClient();
    spot.configure({
      subscriptions: [
        { topic: "crypto_prices_chainlink", type: "*", filters: JSON.stringify({ symbol: opts.symbol }) },
      ],
      onMessage: (raw) => {
        const reading = parseRtdsSpotMessage(raw, opts.symbol);
        if (reading) opts.onSpot!(reading);
      },
      onStatus: (ok) => {
        connected += ok ? 1 : -1;
        bumpStatus();
      },
    });
    clients.push(spot);
  }

  if (opts.windows.length) {
    const twap = new RtdsClient();
    twap.configure({
      subscriptions: opts.windows.map((windowSeconds) => ({
        topic: RTDS_TWAP_TOPICS[windowSeconds],
        type: "update",
        filters: JSON.stringify({ symbol: opts.symbol }),
      })),
      onMessage: (raw) => {
        if (isRtdsError(raw)) {
          opts.onTwapError?.(JSON.parse(raw).body?.message ?? raw);
          return;
        }
        for (const windowSeconds of opts.windows) {
          const reading = parseRtdsTwapMessage(raw, windowSeconds, opts.symbol);
          if (reading) opts.onTwap(reading);
        }
      },
      onStatus: (ok) => {
        connected += ok ? 1 : -1;
        bumpStatus();
      },
      onError: (err) => opts.onTwapError?.(String(err)),
    });
    clients.push(twap);
  }

  return {
    start: () => clients.forEach((c) => c.start()),
    close: () => clients.forEach((c) => c.close()),
  };
}

export async function streamRtdsTwaps(opts: {
  symbol: TwapSymbol;
  windows: TwapWindowSeconds[];
  onReading: (r: TwapReading) => void;
  onStatus?: (connected: boolean) => void;
}): Promise<() => void> {
  const mux = createRtdsMultiplex({
    symbol: opts.symbol,
    windows: opts.windows,
    onTwap: opts.onReading,
    onStatus: opts.onStatus,
    onTwapError: (msg) => console.error("[rtds-twap]", msg),
  });
  mux.start();
  return () => mux.close();
}

/** Polymarket SDK path (Node 24+). Falls back gracefully when unavailable. */
export async function streamRtdsTwapsSdk(opts: {
  symbol: TwapSymbol;
  windows: TwapWindowSeconds[];
  onReading: (r: TwapReading) => void;
}): Promise<(() => Promise<void>) | null> {
  try {
    const { createPublicClient } = await import("@polymarket/client");
    const client = createPublicClient();

    const subscriptions = opts.windows.map((windowSeconds) => ({
      topic: "prices.crypto.chainlink.twap" as const,
      windowSeconds,
      symbols: [opts.symbol],
    }));

    const stream = await client.subscribe(subscriptions);

    void (async () => {
      try {
        for await (const event of stream) {
          if (event.topic !== "prices.crypto.chainlink.twap") continue;
          opts.onReading({
            source: "rtds",
            symbol: event.payload.symbol,
            windowSeconds: event.payload.windowSeconds,
            value: event.payload.value,
            observedAt: new Date(event.payload.timestamp).toISOString(),
            receivedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("[rtds-sdk] stream ended:", error);
      }
    })();

    return async () => {
      await stream.close();
    };
  } catch (error) {
    console.warn("[rtds-sdk] unavailable, use raw WebSocket path:", (error as Error).message);
    return null;
  }
}

export { E18 };
