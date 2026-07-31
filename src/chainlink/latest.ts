import type { TwapFeedMeta } from "../types.js";
import { createChainlinkClient } from "./client.js";
import { readChainlinkTwap } from "./twap.js";

export async function fetchLatestTwaps(
  feeds: TwapFeedMeta[],
  onReading: (r: ReturnType<typeof readChainlinkTwap>) => void,
): Promise<void> {
  const client = createChainlinkClient();
  const reports = await Promise.all(feeds.map((f) => client.getLatestReport(f.feedId)));
  for (const report of reports) onReading(readChainlinkTwap(report));
}
