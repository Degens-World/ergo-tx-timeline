# Ergo TX Timeline

## Live Demo

**[https://ad-ergo-tx-timeline-1775099432899.vercel.app](https://ad-ergo-tx-timeline-1775099432899.vercel.app)**

## Features

- **Balance Over Time** — Chart.js area chart showing ERG balance evolution across all transactions
- **Time Range Filters** — Switch between All time / 90 days / 30 days views
- **Wallet Stats Bar** — Current balance, total received, total sent, tx count, and active-since date
- **Transaction Timeline** — Scrollable list of every transaction with:
  - Color-coded dots (green = incoming, red = outgoing, orange = mixed)
  - Net ERG change per transaction
  - Running balance after each transaction
  - Direct links to Ergo Explorer for full details
- **Load More** — Paginated display (20 per page) for wallets with many transactions
- **Up to 500 transactions** fetched automatically with progress indicator
- Fully client-side — no backend, no wallet connection required

## How to Use

1. Open `index.html` in any modern browser
2. Paste your Ergo wallet address (starts with `9`, 51 characters)
3. Click **Analyze** or press Enter
4. Explore the balance chart and scroll through transaction history

## How to Run Locally

```bash
# No build step needed — just open the file
open index.html
# or serve with any static server:
npx serve .
python -m http.server 8080
```

## Tech Stack

- Vanilla HTML / CSS / JavaScript (no framework)
- [Chart.js 4.4](https://www.chartjs.org/) for the balance chart
- [Ergo Explorer API v1](https://api.ergoplatform.com/api/v1/docs/) for live on-chain data

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /addresses/{addr}/balance/confirmed` | Current confirmed balance |
| `GET /addresses/{addr}/transactions` | Full transaction history |

---

Built for [Degens.World](https://degens.world) · Part of the Ergo Tools suite
