# Chainlink TWAP Research

TypeScript tooling to explore [Polymarket Chainlink TWAP prices](https://docs.polymarket.com/market-data/chainlink-twap): 30-second and 60-second time-weighted averages from Chainlink Data Streams (testnet) and Polymarket RTDS (production relay, scheduled **August 4, 2026**).

## Setup

```bash
cd chainlink-twap-research
npm install
cp .env.example .env
# Add Chainlink testnet credentials to .env
npm run selfcheck
```

| Variable | Description |
|----------|-------------|
| `CHAINLINK_CLIENT_ID` | Chainlink Data Streams API key |
| `CHAINLINK_CLIENT_SECRET` | Chainlink user secret |
| `CHAINLINK_NETWORK` | `testnet` (default) or `mainnet` (Aug 4+) |

## Commands

```bash
# Validate E18 math, feed IDs, RTDS connectivity
npm run selfcheck

# List testnet feed IDs
npm run feeds

# Latest signed TWAP from Chainlink testnet
npm run latest -- --symbol btc/usd --window both --compact

# Stream sources
npm run stream:chainlink -- --symbol btc/usd --window 30 --record --duration 120
npm run stream:rtds -- --symbol btc/usd --window 60

# Live dashboard: RTDS spot + TWAP 30/60 (+ optional Chainlink)
npm run watch -- --symbol btc/usd --chainlink --record --stale-ms 15000

# Side-by-side Chainlink testnet vs RTDS
npm run compare -- --symbol btc/usd --window 30 --compact --duration 300

# Summarize recorded JSONL
npm run analyze -- data/watch-btc-usd.jsonl
```

### Flags

| Flag | Description |
|------|-------------|
| `--compact` | One-line output instead of JSON |
| `--duration SEC` | Auto-stop after N seconds |
| `--record` | Append JSONL under `data/` |
| `--stale-ms MS` | Mark stale feeds in `watch` (default 15000) |
| `--chainlink` | Include Chainlink stream in `watch` |

## Watch output example

```
17:04:12  btc/usd  spot=95000.12  rtds30=—  rtds60=—  cl30=94998.50  cl60=94995.10  s-30=+1.62
```

RTDS TWAP columns stay empty until the topic goes live (Aug 4, 2026). Spot oracle (`crypto_prices_chainlink`) works today.

## Architecture

| Path | Role |
|------|------|
| `src/chainlink/` | Chainlink Data Streams SDK — latest + stream |
| `src/rtds/client.ts` | Shared RTDS WebSocket multiplexer |
| `src/rtds/spot.ts` | Polymarket resolution oracle spot price |
| `src/rtds/stream.ts` | TWAP parse + subscribe |
| `src/commands/watch.ts` | Multi-feed research dashboard |
| `src/commands/analyze.ts` | JSONL stats (deltas, spot vs TWAP) |
| `src/feeds.ts` | All testnet feed IDs |

## Feed IDs

BTC/USD testnet (full list in `src/feeds.ts`):

| Window | Feed ID |
|--------|---------|
| 30s | `0x00027603752fe85a4c86c3adcc71abcb5ed826831d8afd4fd746a11c10cee188` |
| 60s | `0x0002e64f0b0166fa748cc05cd510a11442be16279873574f98c8cfa06b42b3dd` |

## Notes

- TWAP windows are **lookback periods**, not publish cadence.
- Use `observationsTimestamp` / `payload.timestamp` for freshness.
- `decodeReport()` parses but does not verify DON signatures.
- RTDS has no snapshot/history — live updates only after subscribe.

## References

- [Polymarket Chainlink TWAP docs](https://docs.polymarket.com/market-data/chainlink-twap)
- [Chainlink Data Streams TypeScript SDK](https://docs.chain.link/data-streams/reference/data-streams-api/ts-sdk)
