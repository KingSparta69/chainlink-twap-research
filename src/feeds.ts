import type { TwapFeedMeta, TwapSymbol, TwapWindowSeconds } from "./types.js";

/** Testnet feed IDs from Polymarket docs (mainnet IDs expected Aug 4, 2026). */
export const TWAP_FEEDS: TwapFeedMeta[] = [
  {
    symbol: "btc/usd",
    windowSeconds: 30,
    feedId: "0x00027603752fe85a4c86c3adcc71abcb5ed826831d8afd4fd746a11c10cee188",
  },
  {
    symbol: "btc/usd",
    windowSeconds: 60,
    feedId: "0x0002e64f0b0166fa748cc05cd510a11442be16279873574f98c8cfa06b42b3dd",
  },
  {
    symbol: "eth/usd",
    windowSeconds: 30,
    feedId: "0x000257bd0c11555619448f31c8bbf36250ffdcd8de0d7bf8ab21af804d7a6142",
  },
  {
    symbol: "eth/usd",
    windowSeconds: 60,
    feedId: "0x00022f7f59660d2caf1665dc08976707de45b58518b68bb91cb499182448ae85",
  },
  {
    symbol: "xrp/usd",
    windowSeconds: 30,
    feedId: "0x00027cb2f348a92be0397eba6fdfa814a8473180c56ea4190272ac8e2430df12",
  },
  {
    symbol: "xrp/usd",
    windowSeconds: 60,
    feedId: "0x000242f2ce7651c59f07907fa6fa7bccff0405327abffaa09e39a559ce25dc2d",
  },
  {
    symbol: "sol/usd",
    windowSeconds: 30,
    feedId: "0x0002f6123d7f4f61d213f9bdd10256dc19978f61a74797b1e3479053429f20c8",
  },
  {
    symbol: "sol/usd",
    windowSeconds: 60,
    feedId: "0x0002990595e444f1c3aee99bb78536b8b8c137cfe2f01696df69a045207654c9",
  },
  {
    symbol: "hype/usd",
    windowSeconds: 30,
    feedId: "0x0002a498f26948f15e1f00af0330d8fef5ea53fffe4a0bf3f7f31fc2a371ae04",
  },
  {
    symbol: "hype/usd",
    windowSeconds: 60,
    feedId: "0x00027163e67ed79a3b7d67ef68073e1d54745de32fdff1ca68b79f1e0489732a",
  },
  {
    symbol: "doge/usd",
    windowSeconds: 30,
    feedId: "0x000234a7d46f9b7a6568ad7d2677a0c0028744d06ece3cc4a006201cf9a76453",
  },
  {
    symbol: "doge/usd",
    windowSeconds: 60,
    feedId: "0x00025ad76902e0d91491abfd13fa5a7320d3248ee7b030a059bd1fd35b601e0c",
  },
  {
    symbol: "zec/usd",
    windowSeconds: 30,
    feedId: "0x0002b6a49760c664e68653b4cced722239400b46905e1c1ce45733bd42d7f669",
  },
  {
    symbol: "zec/usd",
    windowSeconds: 60,
    feedId: "0x00024785f38aa028dcbdd32b24a5851c689c7a9db4924ab08480df11ec7c3949",
  },
  {
    symbol: "link/usd",
    windowSeconds: 30,
    feedId: "0x0002a1d9e5e117e7627594ac561da02d6777bc170e41a90c21897a02645bd883",
  },
  {
    symbol: "link/usd",
    windowSeconds: 60,
    feedId: "0x00021c115fafdbf603d36e1d09d7f1f837a43e464eedb382ed8344dd6e5906ce",
  },
  {
    symbol: "trx/usd",
    windowSeconds: 30,
    feedId: "0x00021a7256522fbd2c5505067cdd6a37a7556d36bcb98467fbe24734527e86fd",
  },
  {
    symbol: "trx/usd",
    windowSeconds: 60,
    feedId: "0x00027d3ec00c5bb657c1b32e19e8b67d14b2ffd25632346ebf6338eb31288463",
  },
  {
    symbol: "bnb/usd",
    windowSeconds: 30,
    feedId: "0x00028242b80742c99e3cfed3b8f9dd48d6dfc449ffb4a4623b129c85b7a19270",
  },
  {
    symbol: "bnb/usd",
    windowSeconds: 60,
    feedId: "0x0002b653f2b9497c3c798440729d52f6eaf16f37bc8edb177bf6bbd345d443e1",
  },
];

const feedById = new Map(TWAP_FEEDS.map((f) => [f.feedId.toLowerCase(), f]));

export function feedForId(feedId: string): TwapFeedMeta | undefined {
  return feedById.get(feedId.toLowerCase());
}

export function feedsForSymbol(
  symbol: TwapSymbol,
  windows?: TwapWindowSeconds[],
): TwapFeedMeta[] {
  const want = windows ?? [30, 60];
  return TWAP_FEEDS.filter((f) => f.symbol === symbol && want.includes(f.windowSeconds));
}

export function parseSymbol(raw: string): TwapSymbol {
  const s = raw.trim().toLowerCase() as TwapSymbol;
  if (!TWAP_FEEDS.some((f) => f.symbol === s)) {
    throw new Error(`Unknown symbol ${raw}. Try btc/usd, eth/usd, …`);
  }
  return s;
}

export function parseWindow(raw: string | undefined): TwapWindowSeconds[] {
  if (!raw || raw === "both") return [30, 60];
  const n = Number(raw);
  if (n !== 30 && n !== 60) throw new Error(`window must be 30, 60, or both (got ${raw})`);
  return [n];
}

export const RTDS_TWAP_TOPICS: Record<TwapWindowSeconds, string> = {
  30: "crypto_prices_twap_thirty",
  60: "crypto_prices_twap_sixty",
};

export const CHAINLINK_TESTNET = {
  endpoint: "https://api.testnet-dataengine.chain.link",
  wsEndpoint: "wss://ws.testnet-dataengine.chain.link",
} as const;

export const CHAINLINK_MAINNET = {
  endpoint: "https://api.dataengine.chain.link",
  wsEndpoint: "wss://ws.dataengine.chain.link",
} as const;

export const RTDS_WS_URL = "wss://ws-live-data.polymarket.com";
