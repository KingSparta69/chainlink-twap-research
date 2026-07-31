export type TwapWindowSeconds = 30 | 60;

export type TwapSymbol =
  | "btc/usd"
  | "eth/usd"
  | "xrp/usd"
  | "sol/usd"
  | "hype/usd"
  | "doge/usd"
  | "zec/usd"
  | "link/usd"
  | "trx/usd"
  | "bnb/usd";

export interface TwapFeedMeta {
  symbol: TwapSymbol;
  windowSeconds: TwapWindowSeconds;
  feedId: string;
}

export interface TwapReading {
  source: "chainlink" | "rtds";
  symbol: string;
  windowSeconds: TwapWindowSeconds;
  value: string;
  observedAt: string;
  feedId?: string;
  receivedAt?: string;
}

export interface CompareSample {
  at: string;
  symbol: string;
  windowSeconds: TwapWindowSeconds;
  chainlink?: TwapReading;
  rtds?: TwapReading;
  delta?: string;
}
