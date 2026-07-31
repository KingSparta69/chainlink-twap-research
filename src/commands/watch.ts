import { deltaString } from "../e18.js";
import { hasChainlinkCredentials } from "../env.js";
import { feedsForSymbol, parseSymbol } from "../feeds.js";
import { staleLabels, type PriceBoard } from "../freshness.js";
import { printWatch, type WatchSnapshot } from "../format.js";
import { JsonlRecorder } from "../record/jsonl.js";
import { createRtdsMultiplex } from "../rtds/stream.js";
import { streamChainlinkTwaps } from "../chainlink/stream.js";
import type { SpotReading, TwapReading, TwapWindowSeconds } from "../types.js";

export async function runWatch(opts: {
  symbol: ReturnType<typeof parseSymbol>;
  staleMs: number;
  record: boolean;
  withChainlink: boolean;
  durationSec?: number;
}): Promise<void> {
  const board: PriceBoard = {};
  const recorder = opts.record ? new JsonlRecorder(`watch-${opts.symbol.replace("/", "-")}.jsonl`) : null;

  const emit = () => {
    const snapshot: WatchSnapshot = {
      at: new Date().toISOString(),
      symbol: opts.symbol,
      spot: board.spot,
      twap30: board.twap30,
      twap60: board.twap60,
      chainlink30: board.chainlink30,
      chainlink60: board.chainlink60,
      spotVsTwap30: board.spot && board.twap30 ? deltaString(board.spot.value, board.twap30.value) : undefined,
      spotVsTwap60: board.spot && board.twap60 ? deltaString(board.spot.value, board.twap60.value) : undefined,
      clVsRtds30:
        board.chainlink30 && board.twap30 ? deltaString(board.twap30.value, board.chainlink30.value) : undefined,
      clVsRtds60:
        board.chainlink60 && board.twap60 ? deltaString(board.twap60.value, board.chainlink60.value) : undefined,
      stale: staleLabels(
        {
          spot: board.spot,
          rtds30: board.twap30,
          rtds60: board.twap60,
          cl30: board.chainlink30,
          cl60: board.chainlink60,
        },
        opts.staleMs,
      ),
    };
    printWatch(snapshot);
    recorder?.write(snapshot);
  };

  if (recorder) console.error(`recording → ${recorder.filePath()}`);
  console.error(
    "watch: RTDS spot + TWAP 30/60" +
      (opts.withChainlink ? " + Chainlink testnet" : "") +
      "  (TWAP topic may be empty until Aug 4, 2026)\n",
  );

  let twapErrorLogged = false;
  const rtds = createRtdsMultiplex({
    symbol: opts.symbol,
    windows: [30, 60],
    includeSpot: true,
    onSpot: (r: SpotReading) => {
      board.spot = r;
      emit();
    },
    onTwap: (r: TwapReading) => {
      if (r.windowSeconds === 30) board.twap30 = r;
      else board.twap60 = r;
      emit();
    },
    onStatus: (ok) => console.error(`[rtds] ${ok ? "connected" : "disconnected"}`),
    onTwapError: (msg) => {
      if (!twapErrorLogged) {
        twapErrorLogged = true;
        console.error(`[rtds-twap] ${msg.slice(0, 120)}… (expected until Aug 4, 2026)`);
      }
    },
  });
  rtds.start();

  let closeChainlink: (() => Promise<void>) | null = null;
  if (opts.withChainlink && hasChainlinkCredentials()) {
    const feeds = feedsForSymbol(opts.symbol, [30, 60]);
    closeChainlink = await streamChainlinkTwaps(feeds, (r) => {
      if (r.windowSeconds === 30) board.chainlink30 = r;
      else board.chainlink60 = r;
      emit();
    });
  } else if (opts.withChainlink) {
    console.error("[watch] skipping Chainlink — credentials not set");
  }

  await waitForStop(async () => {
    rtds.close();
    if (closeChainlink) await closeChainlink();
  }, opts.durationSec);
}

async function waitForStop(cleanup: () => void | Promise<void>, durationSec?: number): Promise<void> {
  if (durationSec) {
    await new Promise((r) => setTimeout(r, durationSec * 1000));
    console.error(`\n duration ${durationSec}s elapsed`);
    await cleanup();
    return;
  }

  await new Promise<void>((resolve) => {
    process.once("SIGINT", async () => {
      console.error("\nshutting down…");
      await cleanup();
      resolve();
    });
  });
}

export type { TwapWindowSeconds };
