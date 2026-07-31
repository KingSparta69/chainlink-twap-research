import WebSocket from "ws";
import { E18, formatE18 } from "../e18.js";
import { RTDS_TWAP_TOPICS, RTDS_WS_URL } from "../feeds.js";
import type { TwapReading, TwapSymbol, TwapWindowSeconds } from "../types.js";

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
  let msg: { topic?: string; type?: string; payload?: RtdsTwapPayload; timestamp?: number };
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }

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

export async function streamRtdsTwaps(opts: {
  symbol: TwapSymbol;
  windows: TwapWindowSeconds[];
  onReading: (r: TwapReading) => void;
  onStatus?: (connected: boolean) => void;
}): Promise<() => void> {
  const { symbol, windows, onReading, onStatus } = opts;
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(RTDS_WS_URL);

    ws.on("open", () => {
      onStatus?.(true);
      ws!.send(
        JSON.stringify({
          action: "subscribe",
          subscriptions: windows.flatMap((windowSeconds) => [
            {
              topic: RTDS_TWAP_TOPICS[windowSeconds],
              type: "update",
              filters: JSON.stringify({ symbol }),
            },
          ]),
        }),
      );
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send("PING");
      }, 5000);
    });

    ws.on("message", (data) => {
      const text = data.toString();
      for (const windowSeconds of windows) {
        const reading = parseRtdsTwapMessage(text, windowSeconds, symbol);
        if (reading) onReading(reading);
      }
    });

    const onDrop = () => {
      onStatus?.(false);
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      ws = null;
      if (!closed) setTimeout(connect, 2000);
    };

    ws.on("close", onDrop);
    ws.on("error", () => {
      try {
        ws?.close();
      } catch {
        /* */
      }
    });
  };

  connect();

  return () => {
    closed = true;
    if (pingTimer) clearInterval(pingTimer);
    try {
      ws?.close();
    } catch {
      /* */
    }
  };
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
