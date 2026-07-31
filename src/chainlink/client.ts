import { createClient } from "@chainlink/data-streams-sdk";
import { chainlinkConfig } from "../env.js";

export function createChainlinkClient() {
  return createClient(chainlinkConfig());
}
