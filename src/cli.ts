import { argValue, hasFlag, parseDurationSec, parseStaleMs } from "./args.js";
import { analyzeJsonl, printAnalyzeStats } from "./commands/analyze.js";
import { runSelfcheck } from "./commands/selfcheck.js";
import { runWatch } from "./commands/watch.js";
import { deltaString } from "./e18.js";
import { fetchLatestTwaps } from "./chainlink/latest.js";
import { streamChainlinkTwaps } from "./chainlink/stream.js";
import { readChainlinkTwap } from "./chainlink/twap.js";
import { createChainlinkClient } from "./chainlink/client.js";
import { hasChainlinkCredentials } from "./env.js";
import {
  TWAP_FEEDS,
  feedsForSymbol,
  parseSymbol,
  parseWindow,
} from "./feeds.js";
import { printCompare, printReading } from "./format.js";
import { JsonlRecorder } from "./record/jsonl.js";
import { streamRtdsTwaps, streamRtdsTwapsSdk } from "./rtds/stream.js";
import type { CompareSample, TwapReading, TwapWindowSeconds } from "./types.js";

function usage(): never {
  console.log(`Chainlink TWAP research CLI

Usage:
  npm run feeds
  npm run selfcheck
  npm run latest [-- --symbol btc/usd] [--window 30|60|both] [--compact]
  npm run stream:chainlink [-- --symbol btc/usd] [--window 30|60|both] [--record] [--compact] [--duration SEC]
  npm run stream:rtds [-- --symbol btc/usd] [--window 30|60|both] [--sdk] [--record] [--compact] [--duration SEC]
  npm run compare [-- --symbol btc/usd] [--window 30|60] [--record] [--compact] [--duration SEC]
  npm run watch [-- --symbol btc/usd] [--chainlink] [--record] [--stale-ms MS] [--duration SEC]
  npm run analyze -- path/to/file.jsonl

Flags:
  --compact       one-line output instead of JSON
  --duration SEC  auto-stop after N seconds (default: run until Ctrl+C)
  --stale-ms MS   mark feeds older than MS in watch mode (default 15000)
  --chainlink     include Chainlink testnet stream in watch (needs credentials)

Env:
  CHAINLINK_CLIENT_ID, CHAINLINK_CLIENT_SECRET
  CHAINLINK_NETWORK=testnet|mainnet  (default testnet)

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
  const compact = hasFlag(args, "--compact");
  const feeds = feedsForSymbol(symbol, windows);
  await fetchLatestTwaps(feeds, (r) => printReading(r, compact));
}

async function cmdStreamChainlink(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window"));
  const compact = hasFlag(args, "--compact");
  const durationSec = parseDurationSec(args);
  const feeds = feedsForSymbol(symbol, windows);
  const recorder = hasFlag(args, "--record") ? new JsonlRecorder(`chainlink-${symbol.replace("/", "-")}.jsonl`) : null;

  const close = await streamChainlinkTwaps(feeds, (r) => {
    printReading(r, compact);
    recorder?.write(r);
  });

  if (recorder) console.error(`recording → ${recorder.filePath()}`);

  await waitForStop(close, durationSec);
}

async function cmdStreamRtds(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window"));
  const useSdk = hasFlag(args, "--sdk");
  const compact = hasFlag(args, "--compact");
  const durationSec = parseDurationSec(args);
  const recorder = hasFlag(args, "--record") ? new JsonlRecorder(`rtds-${symbol.replace("/", "-")}.jsonl`) : null;

  const onReading = (r: TwapReading) => {
    printReading(r, compact);
    recorder?.write(r);
  };

  if (recorder) console.error(`recording → ${recorder.filePath()}`);
  console.error(
    "Note: RTDS TWAP activates Aug 4, 2026 — subscriptions may return topic not found until then.\n",
  );

  if (useSdk) {
    const closeSdk = await streamRtdsTwapsSdk({ symbol, windows, onReading });
    if (closeSdk) {
      await waitForStop(closeSdk, durationSec);
      return;
    }
  }

  const close = await streamRtdsTwaps({
    symbol,
    windows,
    onReading,
    onStatus: (ok) => console.error(`[rtds] ${ok ? "connected" : "disconnected"}`),
  });
  await waitForStop(async () => close(), durationSec);
}

async function cmdCompare(args: string[]): Promise<void> {
  const symbol = parseSymbol(argValue(args, "--symbol") ?? "btc/usd");
  const windows = parseWindow(argValue(args, "--window") ?? "30");
  if (windows.length !== 1) throw new Error("compare mode accepts one window (30 or 60)");
  const windowSeconds = windows[0];
  const compact = hasFlag(args, "--compact");
  const durationSec = parseDurationSec(args);
  const feeds = feedsForSymbol(symbol, [windowSeconds]);
  const recorder = hasFlag(args, "--record")
    ? new JsonlRecorder(`compare-${symbol.replace("/", "-")}-${windowSeconds}s.jsonl`)
    : null;

  if (!hasChainlinkCredentials()) {
    throw new Error("compare requires CHAINLINK_CLIENT_ID and CHAINLINK_CLIENT_SECRET");
  }

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
    maybeEmitCompare(latest, windowSeconds, recorder, compact);
  });

  const closeRtds = await streamRtdsTwaps({
    symbol,
    windows: [windowSeconds],
    onReading: (r) => {
      const bucket = latest.get(r.windowSeconds) ?? {};
      bucket.rtds = r;
      latest.set(r.windowSeconds, bucket);
      maybeEmitCompare(latest, windowSeconds, recorder, compact);
    },
    onStatus: (ok) => console.error(`[rtds] ${ok ? "connected" : "disconnected"}`),
  });

  if (recorder) console.error(`recording → ${recorder.filePath()}`);

  await waitForStop(async () => {
    await closeChainlink();
    closeRtds();
  }, durationSec);
}

async function cmdWatch(args: string[]): Promise<void> {
  await runWatch({
    symbol: parseSymbol(argValue(args, "--symbol") ?? "btc/usd"),
    staleMs: parseStaleMs(args),
    record: hasFlag(args, "--record"),
    withChainlink: hasFlag(args, "--chainlink"),
    durationSec: parseDurationSec(args),
  });
}

async function cmdAnalyze(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith("-"));
  if (!file) throw new Error("usage: npm run analyze -- path/to/file.jsonl");
  printAnalyzeStats(analyzeJsonl(file));
}

function maybeEmitCompare(
  bucket: Map<TwapWindowSeconds, { chainlink?: TwapReading; rtds?: TwapReading }>,
  windowSeconds: TwapWindowSeconds,
  recorder: JsonlRecorder | null,
  compact: boolean,
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
  printCompare(sample, compact);
  recorder?.write(sample);
}

async function waitForStop(cleanup: () => void | Promise<void>, durationSec?: number): Promise<void> {
  if (durationSec) {
    await new Promise((r) => setTimeout(r, durationSec * 1000));
    console.error(`\nduration ${durationSec}s elapsed`);
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

export async function runCli(argv: string[]): Promise<void> {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") usage();

  switch (cmd) {
    case "feeds":
      await cmdFeeds();
      break;
    case "selfcheck":
      await runSelfcheck();
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
    case "watch":
      await cmdWatch(args);
      break;
    case "analyze":
      await cmdAnalyze(args);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}
