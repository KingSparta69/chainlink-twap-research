import { E18, formatE18 } from "../e18.js";
import { TWAP_FEEDS } from "../feeds.js";
import { hasChainlinkCredentials, chainlinkNetwork } from "../env.js";

export async function runSelfcheck(): Promise<void> {
  let failed = 0;
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);
  const bad = (msg: string) => {
    console.log(`  ✗ ${msg}`);
    failed++;
  };

  console.log("chainlink-twap-research selfcheck\n");

  // E18 roundtrip
  const samples = [0n, 65000n * E18, 65000n * E18 + 5n * 10n ** 17n, -(123n * E18)];
  for (const v of samples) {
    const s = formatE18(v);
    try {
      const [whole, frac = ""] = s.replace(/^-/, "").split(".");
      const sign = s.startsWith("-") ? -1n : 1n;
      const rebuilt = sign * (BigInt(whole) * E18 + BigInt((frac + "0".repeat(18)).slice(0, 18)));
      if (rebuilt !== v) bad(`E18 roundtrip failed for ${v}`);
      else ok(`E18 roundtrip ${s}`);
    } catch {
      bad(`E18 parse failed for ${s}`);
    }
  }

  // Feed uniqueness
  const ids = TWAP_FEEDS.map((f) => f.feedId.toLowerCase());
  if (new Set(ids).size !== ids.length) bad("duplicate feed IDs in TWAP_FEEDS");
  else ok(`${TWAP_FEEDS.length} feed IDs, all unique`);

  // Credentials
  if (hasChainlinkCredentials()) ok("Chainlink credentials present");
  else bad("Chainlink credentials missing (CHAINLINK_CLIENT_ID / CHAINLINK_CLIENT_SECRET)");

  console.log(`\n  network: ${chainlinkNetwork()}`);

  // RTDS connectivity smoke test
  try {
    const { RtdsClient } = await import("../rtds/client.js");
    const client = new RtdsClient();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("RTDS connect timeout")), 8000);
      client.configure({
        subscriptions: [{ topic: "crypto_prices_chainlink", type: "*", filters: '{"symbol":"btc/usd"}' }],
        onMessage: () => {},
        onStatus: (connected) => {
          if (connected) {
            clearTimeout(timer);
            client.close();
            resolve();
          }
        },
      });
      client.start();
    });
    ok("RTDS WebSocket connects");
  } catch (e) {
    bad(`RTDS connect failed: ${(e as Error).message}`);
  }

  console.log(`\n${failed ? failed : "all"} check(s) ${failed ? "failed" : "passed"}`);
  if (failed) process.exitCode = 1;
}
