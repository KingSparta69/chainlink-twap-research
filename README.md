# Chainlink TWAP Research

TypeScript tooling to explore [Polymarket Chainlink TWAP prices](https://docs.polymarket.com/market-data/chainlink-twap): Chainlink-computed 30-second and 60-second time-weighted average prices (TWAPs) for crypto assets used in Polymarket resolution.

---

## What is Chainlink TWAP?

Polymarket crypto markets (e.g. BTC Up/Down 5m) resolve against **Chainlink**, not Binance or Coinbase spot. Today most tooling streams the **spot oracle** (`crypto_prices_chainlink` on RTDS) — a point-in-time Chainlink price tick. **TWAP** is a different product: a **time-weighted average** over a fixed lookback window, computed and signed by Chainlink’s Data Streams DON.

| | Spot oracle (`crypto_prices_chainlink`) | Chainlink TWAP |
|---|----------------------------------------|----------------|
| **What it is** | Latest Chainlink observation | Average price over the last **30s** or **60s** |
| **Who computes it** | Relayed via Polymarket RTDS | Chainlink Data Streams (signed report) |
| **Typical use** | Live charts, near-close momentum | Settlement-style averaging, smoother reference |
| **Available now** | Yes (RTDS) | Testnet via credentials; RTDS relay **Aug 4, 2026** |
| **Value format** | JS `number` or decimal string | Signed **E18** fixed-point (`bigint` / exact decimal string) |

### Lookback window ≠ update frequency

The **30** and **60** refer to the **lookback window in seconds**, not how often reports arrive. Chainlink computes the TWAP over that window and signs a report; update cadence is independent. Do not infer the window from message spacing — use `observationsTimestamp` (Chainlink observation time) for freshness.

### Two windows, two feeds per asset

Each asset has **separate feed IDs** for 30s and 60s TWAP. Reports do **not** include symbol or window labels in the payload — you must map `report.feedID` yourself (see `src/feeds.ts`).

Example BTC/USD testnet:

| Window | Feed ID |
|--------|---------|
| 30s | `0x00027603752fe85a4c86c3adcc71abcb5ed826831d8afd4fd746a11c10cee188` |
| 60s | `0x0002e64f0b0166fa748cc05cd510a11442be16279873574f98c8cfa06b42b3dd` |

Supported testnet symbols: BTC, ETH, SOL, XRP, DOGE, LINK, BNB, TRX, ZEC, HYPE — each with 30s + 60s feeds ([full table in docs](https://docs.polymarket.com/market-data/chainlink-twap#view-30-second-and-60-second-feed-ids)).

### Signed reports (schema V2)

Chainlink TWAP feeds use **report schema V2**. The TWAP value is `decoded.price` — a signed **E18** integer (`benchmarkPrice`). This repo keeps it as an exact decimal **string**; never round through JavaScript `number` for settlement-sensitive logic.

```ts
// V2 report → TWAP decimal string
const decoded = decodeReport(report.fullReport, report.feedID);
// decoded.version === "V2"
const twap = formatE18(decoded.price); // e.g. "65000.5"
```

Important timestamps on each report:

| Field | Meaning |
|-------|---------|
| `observationsTimestamp` | When Chainlink observed/computed the TWAP (use for freshness) |
| `validFromTimestamp` | Earliest valid time (Unix seconds) |
| `decoded.expiresAt` | Report expiration (Unix seconds) |
| `report.fullReport` | Original signed blob (verify DON signatures before trust-sensitive use) |

`decodeReport()` **parses** fields only — it does **not** verify DON signatures. Follow [Chainlink verification requirements](https://docs.chain.link/data-streams/developer-responsibilities) before using reports for settlement or trading decisions.

### Spot vs TWAP in practice

Near market close on a BTC 5m bar:

- **Spot** reacts instantly to the latest Chainlink tick — good for momentum / “where is price right now?”
- **TWAP 30s/60s** lags and smooths — good for “what was the average over the last half-minute?” research

A large spot move in the final seconds may **not** fully appear in a 30s TWAP if most of the window was at the old level. This repo’s `watch` command shows both side-by-side (`spot=` vs `rtds30=` / `cl30=`) so you can study that gap.

### Two ways to consume TWAP

| Path | When to use | Auth |
|------|-------------|------|
| **Chainlink Data Streams** (`src/chainlink/`) | Testnet now; direct access to signed reports | `CHAINLINK_CLIENT_ID` + `CHAINLINK_CLIENT_SECRET` |
| **Polymarket RTDS** (`src/rtds/`) | Production relay (no Chainlink credentials) | None |

**Testnet** (available now):

- REST: `https://api.testnet-dataengine.chain.link`
- WS: `wss://ws.testnet-dataengine.chain.link`

**Mainnet** (scheduled **August 4, 2026**):

- REST: `https://api.dataengine.chain.link`
- WS: `wss://ws.dataengine.chain.link`
- Replace testnet feed IDs with mainnet IDs when Chainlink publishes them

RTDS TWAP topics (after activation):

| Window | RTDS topic |
|--------|------------|
| 30s | `crypto_prices_twap_thirty` |
| 60s | `crypto_prices_twap_sixty` |

SDK topic: `prices.crypto.chainlink.twap` with `windowSeconds: 30 | 60`.

**Pre-launch note:** RTDS TWAP subscriptions may return `topic not found` until Aug 4, 2026. Spot oracle still works. This repo uses **separate WebSocket connections** for spot vs TWAP because a combined subscribe batch fails on RTDS today.

RTDS TWAP streams have **no snapshot or history** — only live updates after subscribe. Reconnect and resubscribe after disconnect.

---

## Setup

```bash
cd chainlink-twap-research
npm install
cp .env.example .env
# Add Chainlink testnet credentials for direct Data Streams access
npm run selfcheck
```

| Variable | Description |
|----------|-------------|
| `CHAINLINK_CLIENT_ID` | Chainlink Data Streams API key |
| `CHAINLINK_CLIENT_SECRET` | Chainlink user secret |
| `CHAINLINK_NETWORK` | `testnet` (default) or `mainnet` (Aug 4+) |

Keep server clock within ~5 seconds of Chainlink time. **Never expose credentials to browsers or client apps** — run Chainlink SDK only on a trusted backend.

---

## Commands

```bash
# Validate E18 math, feed IDs, RTDS connectivity
npm run selfcheck

# List all testnet TWAP feed IDs
npm run feeds

# Latest signed TWAP report(s) from Chainlink testnet
npm run latest -- --symbol btc/usd --window both --compact

# Stream Chainlink-signed TWAP (direct from DON)
npm run stream:chainlink -- --symbol btc/usd --window 30 --record --duration 120

# Stream Polymarket RTDS TWAP relay (live after Aug 4, 2026)
npm run stream:rtds -- --symbol btc/usd --window 60

# Live dashboard: RTDS spot + TWAP 30/60 (+ optional Chainlink testnet)
npm run watch -- --symbol btc/usd --chainlink --record --stale-ms 15000

# Compare Chainlink testnet TWAP vs RTDS relay (same window)
npm run compare -- --symbol btc/usd --window 30 --compact --duration 300

# Summarize recorded JSONL (deltas, spot vs TWAP)
npm run analyze -- data/watch-btc-usd.jsonl
```

### Flags

| Flag | Description |
|------|-------------|
| `--compact` | One-line output instead of JSON |
| `--duration SEC` | Auto-stop after N seconds |
| `--record` | Append JSONL under `data/` |
| `--stale-ms MS` | Mark feeds older than MS in `watch` (default 15000) |
| `--chainlink` | Include Chainlink Data Streams in `watch` (needs credentials) |

---

## Watch output example

```
17:04:12  btc/usd  spot=95000.12  rtds30=—  rtds60=—  cl30=94998.50  cl60=94995.10  s-30=+1.62
```

| Column | Source |
|--------|--------|
| `spot` | RTDS `crypto_prices_chainlink` (point oracle) |
| `rtds30` / `rtds60` | RTDS TWAP relay (empty until Aug 4, 2026) |
| `cl30` / `cl60` | Chainlink Data Streams testnet (needs credentials) |
| `s-30` | Spot minus TWAP30 (when both available) |

---

## Project layout

| Path | Role |
|------|------|
| `src/feeds.ts` | Feed ID → symbol/window mapping (required for decoding) |
| `src/e18.ts` | E18 bigint ↔ decimal string (no float drift) |
| `src/chainlink/` | Data Streams SDK — latest + stream signed TWAP |
| `src/rtds/spot.ts` | Polymarket spot oracle parser |
| `src/rtds/stream.ts` | RTDS TWAP parser + subscribe |
| `src/rtds/client.ts` | WebSocket multiplexer (spot/TWAP on separate sockets) |
| `src/commands/watch.ts` | Multi-feed research dashboard |
| `src/commands/analyze.ts` | JSONL stats |

---

## Research tips

1. **Always map feed ID → window yourself** — reports never label 30 vs 60.
2. **Compare spot vs TWAP near bar close** — especially last 30–60s of BTC 5m markets.
3. **Use `--record` + `analyze`** to quantify RTDS vs Chainlink testnet divergence once both are live.
4. **Treat testnet feed IDs as temporary** — swap to mainnet IDs after Aug 4, 2026 and re-validate schema/scale.
5. Chainlink does not publish sampling boundaries, weighting, or rounding rules for custom TWAP feeds — do not independently reproduce the exact value without a Chainlink spec.

---

## References

- [Polymarket — Chainlink TWAP Prices](https://docs.polymarket.com/market-data/chainlink-twap)
- [Chainlink Data Streams TypeScript SDK](https://docs.chain.link/data-streams/reference/data-streams-api/ts-sdk)
- [Chainlink authentication](https://docs.chain.link/data-streams/reference/data-streams-api/authentication)
- [Chainlink developer responsibilities](https://docs.chain.link/data-streams/developer-responsibilities)
