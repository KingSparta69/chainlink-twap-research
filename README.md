# Chainlink TWAP Research

TypeScript tooling to explore [Polymarket Chainlink TWAP prices](https://docs.polymarket.com/market-data/chainlink-twap): 30-second and 60-second time-weighted averages from Chainlink Data Streams (testnet today) and Polymarket RTDS (production relay, scheduled **August 4, 2026**).

## Setup

```bash
cd chainlink-twap-research
npm install
cp .env.example .env
# Add Chainlink testnet credentials to .env
```

Required for Chainlink testnet commands:

| Variable | Description |
|----------|-------------|
| `CHAINLINK_CLIENT_ID` | Chainlink Data Streams API key |
| `CHAINLINK_CLIENT_SECRET` | Chainlink user secret |

Keep server clock within ~5 seconds of Chainlink time. Never expose credentials to browsers.

## Commands

```bash
# List all testnet feed IDs (BTC, ETH, SOL, … × 30s/60s)
npm run feeds

# Fetch latest signed TWAP reports from Chainlink testnet
npm run latest -- --symbol btc/usd --window both

# Stream Chainlink testnet TWAP updates
npm run stream:chainlink -- --symbol btc/usd --window 30 --record

# Stream Polymarket RTDS TWAP (raw WebSocket; works on Node 22+)
npm run stream:rtds -- --symbol btc/usd --window 60

# Stream RTDS via @polymarket/client SDK (requires Node 24+)
npm run stream:rtds -- --symbol btc/usd --sdk

# Compare Chainlink testnet vs RTDS side-by-side (research)
npm run compare -- --symbol btc/usd --window 30 --record
```

`--record` writes JSONL under `data/`.

## Architecture

| Path | Source | Auth | Status |
|------|--------|------|--------|
| `src/chainlink/` | Chainlink Data Streams SDK | API key + secret | Testnet available now |
| `src/rtds/stream.ts` | Polymarket RTDS WebSocket | None | TWAP topic live Aug 4, 2026 |

### Chainlink (testnet)

Uses `@chainlink/data-streams-sdk@1.2.1` per docs:

- REST: `https://api.testnet-dataengine.chain.link`
- WS: `wss://ws.testnet-dataengine.chain.link`
- Reports are schema **V2**; TWAP is `decoded.price` as signed E18 (`bigint` preserved via decimal string)

### Polymarket RTDS

Two integration options:

1. **Raw WebSocket** (`wss://ws-live-data.polymarket.com`) — topics `crypto_prices_twap_thirty` / `crypto_prices_twap_sixty`, send `PING` every 5s
2. **SDK** (`@polymarket/client@0.3.0-beta.0`) — topic `prices.crypto.chainlink.twap`

Before RTDS activation, subscriptions may return `topic not found`. Reconnect after launch.

## Feed IDs

All testnet IDs are in `src/feeds.ts` (from [docs table](https://docs.polymarket.com/market-data/chainlink-twap#view-30-second-and-60-second-feed-ids)). Example BTC/USD:

| Window | Feed ID |
|--------|---------|
| 30s | `0x00027603752fe85a4c86c3adcc71abcb5ed826831d8afd4fd746a11c10cee188` |
| 60s | `0x0002e64f0b0166fa748cc05cd510a11442be16279873574f98c8cfa06b42b3dd` |

Replace with mainnet IDs when Chainlink publishes them (Aug 4, 2026).

## Notes

- TWAP windows are **lookback periods**, not publish cadence.
- Use `observationsTimestamp` / `payload.timestamp` for freshness, not arrival rate.
- `decodeReport()` parses fields but does not verify DON signatures — follow Chainlink verification guidance before settlement use.
- RTDS has no snapshot/history; only live updates after subscribe.

## References

- [Polymarket Chainlink TWAP docs](https://docs.polymarket.com/market-data/chainlink-twap)
- [Chainlink Data Streams TypeScript SDK](https://docs.chain.link/data-streams/reference/data-streams-api/ts-sdk)
