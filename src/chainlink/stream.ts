import type { TwapFeedMeta, TwapReading } from "../types.js";
import { createChainlinkClient } from "./client.js";
import { readChainlinkTwap } from "./twap.js";

export async function streamChainlinkTwaps(
  feeds: TwapFeedMeta[],
  onReading: (r: TwapReading) => void,
): Promise<() => Promise<void>> {
  const client = createChainlinkClient();
  const stream = client.createStream(feeds.map((f) => f.feedId));

  stream.on("report", (report) => {
    try {
      onReading(readChainlinkTwap(report));
    } catch (error) {
      console.error("Failed to decode Chainlink report:", error);
    }
  });

  stream.on("disconnected", () => console.warn("[chainlink] stream disconnected"));
  stream.on("reconnecting", ({ attempt, delayMs }) => {
    console.warn(`[chainlink] reconnecting attempt ${attempt} in ${delayMs}ms`);
  });
  stream.on("error", (error) => console.error("[chainlink] stream error:", error));

  await stream.connect();

  return async () => {
    await stream.close();
  };
}
