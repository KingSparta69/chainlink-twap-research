import { deltaString } from "./e18.js";
import { fetchLatestTwaps } from "./chainlink/latest.js";
import { streamChainlinkTwaps } from "./chainlink/stream.js";
import { printReading, readChainlinkTwap } from "./chainlink/twap.js";
import { createChainlinkClient } from "./chainlink/client.js";
import {
  TWAP_FEEDS,
  feedsForSymbol,
  parseSymbol,
  parseWindow,
} from "./feeds.js";
import { JsonlRecorder } from "./record/jsonl.js";
import { streamRtdsTwaps, streamRtdsTwapsSdk } from "./rtds/stream.js";
import type { CompareSample, TwapReading, TwapWindowSeconds } from "./types.js";

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function usage(): never {
  console.log(`Chainlink TWAP research CLI

Usage:
  npm run feeds
  npm run latest [-- --symbol btc/usd] [--window 30|60|both]
  npm run stream:chainlink [-- --symbol btc/usd] [--window 30|60|both] [--record]
  npm run stream:rtds [-- --symbol btc/usd] [--window 30|60|both] [--sdk] [--record]
  npm run compare [-- --symbol btc/usd] [--window 30|60] [--record]

Env (Chainlink testnet):
  CHAINLINK_CLIENT_ID, CHAINLINK_CLIENT_SECRET

Docs: https://docs.polymarket.com/market-data/chainlink-twap
`);
  process.exit(0);
}

async function cmdFeeds(): Promise<void> {
  console.log("Testnet TWAP feed IDs (30s / 60s):\n");
  for (const f of TWAP_FEEDS) {
    console.log(`${f.symbol.padEnd(10)} ${f.windowSeconds}s  ${f.feedId}`);
  }
}

async function cmdLatest(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window"));
  const feeds = feedsForSymbol(symbol, windows);
  await fetchLatestTwaps(feeds);
}

async function cmdStreamChainlink(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window"));
  const feeds = feedsForSymbol(symbol, windows);
  const recorder = hasFlag(args, "--record") ? new JsonlRecorder(`chainlink-${symbol.replace("/", "-")}.jsonl`) : null;

  const close = await streamChainlinkTwaps(feeds, (r) => {
    printReading(r);
    recorder?.write(r);
  });

  if (recorder) console.error(`recording → ${recorder.filePath()}`);

  await waitForSigint(close);
}

async function cmdStreamRtds(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window"));
  const useSdk = hasFlag(args, "--sdk");
  const recorder = hasFlag(args, "--record") ? new JsonlRecorder(`rtds-${symbol.replace("/", "-")}.jsonl`) : null;

  const onReading = (r: TwapReading) => {
    printReading(r);
    recorder?.write(r);
  };

  if (recorder) console.error(`recording → ${recorder.filePath()}`);
  console.error(
    "Note: RTDS TWAP activates Aug 4, 2026 — subscriptions may return topic not found until then.\n",
  );

  if (useSdk) {
    const closeSdk = await streamRtdsTwapsSdk({ symbol, windows, onReading });
    if (closeSdk) {
      await waitForSigint(closeSdk);
      return;
    }
  }

  const close = await streamRtdsTwaps({
    symbol,
    windows,
    onReading,
    onStatus: (ok) => console.error(`[rtds] ${ok ? "connected" : "disconnected"}`),
  });
  await waitForSigint(async () => close());
}

async function cmdCompare(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window") ?? "30");
  if (windows.length !== 1) throw new Error("compare mode accepts one window (30 or 60)");
  const windowSeconds = windows[0];
  const feeds = feedsForSymbol(symbol, [windowSeconds]);
  const recorder = hasFlag(args, "--record")
    ? new JsonlRecorder(`compare-${symbol.replace("/", "-")}-${windowSeconds}s.jsonl`)
    : null;

  type Bucket = { chainlink?: TwapReading; rtds?: TwapReading };
  const latest = new Map<TwapWindowSeconds, Bucket>();

  const client = createChainlinkClient();
  for (const f of feeds) {
    try {
      const report = await client.getLatestReport(f.feedId);
      const bucket = latest.get(windowSeconds) ?? {};
      bucket.chainlink = readChainlinkTwap(report);
      latest.set(windowSeconds, bucket);
    } catch (error) {
      console.error("[compare] chainlink latest failed:", error);
    }
  }

  const closeChainlink = await streamChainlinkTwaps(feeds, (r) => {
    const bucket = latest.get(r.windowSeconds) ?? {};
    bucket.chainlink = r;
    latest.set(r.windowSeconds, bucket);
    maybeEmitCompare(latest, windowSeconds, recorder);
  });

  const closeRtds = await streamRtdsTwaps({
    symbol,
    windows: [windowSeconds],
    onReading: (r) => {
      const bucket = latest.get(r.windowSeconds) ?? {};
      bucket.rtds = r;
      latest.set(r.windowSeconds, bucket);
      maybeEmitCompare(latest, windowSeconds, recorder);
    },
    onStatus: (ok) => console.error(`[rtds] ${ok ? "connected" : "disconnected"}`),
  });

  if (recorder) console.error(`recording → ${recorder.filePath()}`);

  await waitForSigint(async () => {
    await closeChainlink();
    closeRtds();
  });
}

function maybeEmitCompare(
  bucket: Map<TwapWindowSeconds, { chainlink?: TwapReading; rtds?: TwapReading }>,
  windowSeconds: TwapWindowSeconds,
  recorder: JsonlRecorder | null,
): void {
  const pair = bucket.get(windowSeconds);
  const chainlink = pair?.chainlink;
  const rtds = pair?.rtds;
  if (!chainlink || !rtds) return;

  const sample: CompareSample = {
    at: new Date().toISOString(),
    symbol: chainlink.symbol,
    windowSeconds,
    chainlink,
    rtds,
    delta: deltaString(rtds.value, chainlink.value),
  };
  console.log(JSON.stringify(sample, null, 2));
  recorder?.write(sample);
}

async function waitForSigint(cleanup: () => void | Promise<void>): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", async () => {
      console.error("\nshutting down…");
      await cleanup();
      resolve();
    });
  });
}

export async function runCli(argv: string[]): Promise<void> {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") usage();

  switch (cmd) {
    case "feeds":
      await cmdFeeds();
      break;
    case "latest":
      await cmdLatest(args);
      break;
    case "stream-chainlink":
      await cmdStreamChainlink(args);
      break;
    case "stream-rtds":
      await cmdStreamRtds(args);
      break;
    case "compare":
      await cmdCompare(args);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}
