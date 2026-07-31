import "dotenv/config";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function chainlinkConfig() {
  return {
    apiKey: requireEnv("CHAINLINK_CLIENT_ID"),
    userSecret: requireEnv("CHAINLINK_CLIENT_SECRET"),
    endpoint: process.env.CHAINLINK_API_ENDPOINT ?? "https://api.testnet-dataengine.chain.link",
    wsEndpoint: process.env.CHAINLINK_WS_ENDPOINT ?? "wss://ws.testnet-dataengine.chain.link",
    haMode: false,
  };
}
