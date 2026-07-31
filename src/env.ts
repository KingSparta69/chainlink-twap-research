import "dotenv/config";
import { CHAINLINK_MAINNET, CHAINLINK_TESTNET } from "./feeds.js";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function hasChainlinkCredentials(): boolean {
  return Boolean(process.env.CHAINLINK_CLIENT_ID?.trim() && process.env.CHAINLINK_CLIENT_SECRET?.trim());
}

export function chainlinkNetwork(): "testnet" | "mainnet" {
  const raw = (process.env.CHAINLINK_NETWORK ?? "testnet").trim().toLowerCase();
  if (raw === "mainnet") return "mainnet";
  if (raw === "testnet") return "testnet";
  throw new Error(`CHAINLINK_NETWORK must be testnet or mainnet (got ${raw})`);
}

export function chainlinkConfig() {
  const network = chainlinkNetwork();
  const defaults = network === "mainnet" ? CHAINLINK_MAINNET : CHAINLINK_TESTNET;
  return {
    apiKey: requireEnv("CHAINLINK_CLIENT_ID"),
    userSecret: requireEnv("CHAINLINK_CLIENT_SECRET"),
    endpoint: process.env.CHAINLINK_API_ENDPOINT ?? defaults.endpoint,
    wsEndpoint: process.env.CHAINLINK_WS_ENDPOINT ?? defaults.wsEndpoint,
    haMode: network === "mainnet" && process.env.CHAINLINK_HA_MODE === "1",
  };
}
