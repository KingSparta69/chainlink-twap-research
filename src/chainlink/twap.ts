import { decodeReport, type Report } from "@chainlink/data-streams-sdk";
import { formatE18 } from "../e18.js";
import { feedForId } from "../feeds.js";
import type { TwapReading } from "../types.js";

export function readChainlinkTwap(report: Report): TwapReading {
  const feed = feedForId(report.feedID);
  if (!feed) throw new Error(`Unexpected Chainlink feed ID: ${report.feedID}`);

  const decoded = decodeReport(report.fullReport, report.feedID);
  if (decoded.version !== "V2") {
    throw new Error(`Expected V2 report, received ${decoded.version}`);
  }

  return {
    source: "chainlink",
    feedId: report.feedID,
    symbol: feed.symbol,
    windowSeconds: feed.windowSeconds,
    value: formatE18(decoded.price),
    observedAt: new Date(report.observationsTimestamp * 1000).toISOString(),
    receivedAt: new Date().toISOString(),
  };
}

export function printReading(r: TwapReading): void {
  console.log(JSON.stringify(r, null, 2));
}
