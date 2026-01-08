# DominionLayer Projects - Full Context

**Last Updated**: January 8, 2026 (Session 2 - Complete)  
**GitHub Organization**: DominionLayer  
**Git Author**: DominionLayer (layer3@dominionlayer.io)

---

## GitHub Repositories

| Project | GitHub URL | Local Path |
|---------|------------|------------|
| Whale Watcher | https://github.com/DominionLayer/whale-layer | `c:\Users\HP\polymarket-whale-watcher` |
| Prediction CLI | https://github.com/DominionLayer/prediction-layer | `c:\Users\HP\prediction-layer` |
| Dominion Swarm | https://github.com/DominionLayer/dominion-swarm | `c:\Users\HP\OneDrive\Documents\dominion` |
| GitBook Docs | https://github.com/DominionLayer/dominion-gitbook | `c:\Users\HP\dominion-gitbook` |

---

## Deployed Services

| Service | URL | Platform |
|---------|-----|----------|
| **Dominion Gateway** | https://api.dominionlayer.io | Railway |
| **Whale Watcher Bot** | Discord Bot | Railway |

---

## API Tokens & Credentials (SENSITIVE)

### Gateway Admin Token
```
ADMIN_TOKEN=25475727-1ef5-4e06-830d-b771dde24fd2
```

### Whale Watcher Bot Gateway Token
```
DOMINION_API_TOKEN=dom_kD6MOtNBOTpptGepR298SgTeMYQvCg4v
User ID: f_hb66XYBa5Dg4NvrYAY4
```

### Discord Configuration
```
DISCORD_GUILD_ID=1457023248452812802
DISCORD_PRIVATE_CHANNEL_ID=1457535965374709938
DISCORD_ADMIN_ROLE_ID=1457707480829137062
Discord Bot Client ID: 1457506504524566851
```

---

## Overview

Four interconnected projects for Polymarket analysis, autonomous agent orchestration, and whale tracking.

| Project | Purpose |
|---------|---------|
| **Whale Watcher** | Discord bot for whale trade alerts + market analysis with LLM |
| **Prediction CLI** | CLI for market analysis & probability estimation |
| **Dominion Gateway** | LLM proxy API (centralized OpenAI/Anthropic access) |
| **Dominion Swarm** | Autonomous agent swarm orchestrator |

---

## 1. Polymarket Whale Watcher (whale-layer)

### Description
A Discord bot that monitors Polymarket trades in real-time, detects profitable whale activity, sends alerts, and provides AI-powered market analysis.

### Deployment
- **Platform**: Railway
- **Database**: SQLite (persistent volume at `/app/data/whale-watcher.db`)
- **Bot Status**: Running

### Key Features
- Real-time trade monitoring via Polymarket Data API
- Whale detection based on trade size and historical profitability
- Automatic whale discovery (scans active wallets, calculates PnL)
- Historical trade backfill for wallet analysis
- **NEW: `/analyze` command with LLM probability estimation**
- Discord slash commands for management
- Alert deduplication and rate limiting

### Architecture

```
src/
  config/         # Configuration (YAML + env) with Zod validation
  db/             # SQLite schema and repositories
    repositories/
      - markets.ts       # Market CRUD + search
      - trades.ts        # Trade ingestion with FK check
      - wallets.ts       # Wallet tracking and active wallet queries
      - alerts.ts        # Alert history
      - service-runs.ts  # Service health tracking
  gateway/
    - client.ts          # Gateway API client for LLM analysis (NEW)
  polymarket/
    - client.ts          # API client (Gamma + Data APIs)
    - ingestion.ts       # Market & trade ingestion, wallet backfill
    - types.ts           # Zod schemas for API responses
  stats/
    - pnl.ts             # PnL calculation from resolved markets
    - profitability.ts   # Whale criteria checking
  alerts/
    - formatter.ts       # Discord embed formatting
    - dedupe.ts          # Alert deduplication
  discord/
    - bot.ts             # Discord.js client
    - commands.ts        # Slash commands (/whales, /analyze)
    - permissions.ts     # Admin role checking
  service/
    - runner.ts          # Main service orchestration
    - scheduler.ts       # Task scheduling
```

### Polymarket API Integration

| API | Base URL | Purpose |
|-----|----------|---------|
| Gamma API | `https://gamma-api.polymarket.com` | Market data (questions, outcomes, resolution) |
| Data API | `https://data-api.polymarket.com` | Trade data (recent trades, user trades) |

**Important**: Market IDs differ between APIs. The `conditionId` from Gamma API matches the `market` field in Data API trades.

### Discord Commands

| Command | Description |
|---------|-------------|
| `/analyze <market>` | **NEW** - Analyze market with whale activity + AI probability |
| `/whales status` | Service health and database stats |
| `/whales list` | List discovered profitable whales |
| `/whales add <wallet> [tag]` | Tag a wallet for tracking |
| `/whales remove <wallet>` | Remove wallet tag |
| `/whales thresholds` | Show whale detection thresholds |
| `/whales backfill` | Trigger historical data sync |
| `/whales stats` | Database counts (markets, trades, wallets) |
| `/whales testalert` | Send a test alert |

### Environment Variables (Railway)

```env
# Polymarket API
POLYMARKET_BASE_URL=https://data-api.polymarket.com

# Discord
DISCORD_BOT_TOKEN=<bot token>
DISCORD_GUILD_ID=1457023248452812802
DISCORD_PRIVATE_CHANNEL_ID=1457535965374709938
DISCORD_ADMIN_ROLE_ID=1457707480829137062

# Database
SQLITE_PATH=/app/data/whale-watcher.db

# Gateway for LLM analysis (NEW)
DOMINION_API_URL=https://api.dominionlayer.io
DOMINION_API_TOKEN=dom_kD6MOtNBOTpptGepR298SgTeMYQvCg4v
```

### /analyze Command Output Example

```
📊 Market Analysis

Market: US strikes Iran by January 31?
Current Price: $0.18 (18% implied)
End Date: Jan 31, 2026

Whale Activity:
🟢 BULLISH
Trades: 15 | Unique Whales: 4
Recent: 12 buys / 3 sells

🤖 AI Analysis:
Model Probability: 22.5%
Confidence: 65%
Edge vs Market: +4.5%
Key Factors:
- Recent diplomatic tensions
- Historical precedent
- Current administration posture

Recommendation: HOLD - Edge within noise range

Link: View on Polymarket

⚠️ Analysis only. Not financial advice.
```

---

## 2. Dominion Gateway (api.dominionlayer.io)

### Description
LLM proxy API that provides centralized access to OpenAI/Anthropic with authentication, rate limiting, and quota management.

### Deployment
- **URL**: https://api.dominionlayer.io
- **Platform**: Railway
- **Database**: PostgreSQL

### API Endpoints

#### Health
```
GET /health         - Basic health check
GET /health/ready   - Readiness with DB + provider checks
```

#### LLM Completions (requires API key)
```
POST /v1/llm/complete
Authorization: Bearer dom_xxxxx

{
  "provider": "openai" | "anthropic" | "auto",
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.2,
  "max_tokens": 1024
}

GET /v1/llm/models   - List available models
GET /v1/llm/quota    - Check remaining quota
```

#### Admin (requires ADMIN_TOKEN)
```
POST /admin/users              - Create user
GET  /admin/users              - List users
GET  /admin/users/:id          - Get user details
POST /admin/users/:id/suspend  - Suspend user
POST /admin/users/:id/activate - Activate user

POST /admin/keys               - Create API key (returns plaintext ONCE)
DELETE /admin/keys/:id         - Revoke API key

POST /admin/limits             - Update user quotas
GET  /admin/usage?user_id=...  - Get usage stats
```

### Creating Users & API Keys

```powershell
# PowerShell syntax for Windows

# Create user
$headers = @{ "Authorization" = "Bearer 25475727-1ef5-4e06-830d-b771dde24fd2"; "Content-Type" = "application/json" }
$body = '{"name": "User Name", "email": "user@example.com"}'
Invoke-RestMethod -Uri "https://api.dominionlayer.io/admin/users" -Method POST -Headers $headers -Body $body

# Create API key (use user_id from above)
$body = '{"user_id": "USER_ID", "name": "key-name"}'
$result = Invoke-RestMethod -Uri "https://api.dominionlayer.io/admin/keys" -Method POST -Headers $headers -Body $body
$result | ConvertTo-Json  # Shows dom_xxx token
```

---

## 3. Polymarket Prediction CLI (prediction-layer)

### Description
A production-grade CLI for Polymarket analysis, probability estimation using LLMs, and position simulation.

### Key Commands

```bash
dominion-pm init              # Create config and database
dominion-pm login             # Authenticate with Gateway
dominion-pm whoami            # Show user and quota
dominion-pm scan              # Fetch active markets
dominion-pm show <id>         # Display market details
dominion-pm analyze <id>      # Run probability estimation
dominion-pm compare           # Find top opportunities by edge
dominion-pm simulate <id>     # Simulate positions
dominion-pm doctor            # Validate configuration
```

### User Login Flow

1. Admin creates user via Gateway `/admin/users`
2. Admin creates API key via Gateway `/admin/keys`
3. Admin gives `dom_xxx` token to user
4. User runs `dominion-pm login` and enters token
5. Token saved to `pm.config.yaml`

### Configuration

Default Gateway URL is now `https://api.dominionlayer.io`

---

## 4. Dominion Swarm (dominion-swarm)

### Description
A general-purpose autonomous agent swarm orchestrator for watching, analyzing, and executing actions on blockchain and other systems.

### External APIs Used
- **OpenAI API** - For LLM analysis
- **Anthropic API** - For LLM analysis  
- **EVM RPC** - For blockchain watching (Alchemy, Infura, etc.)

### Built-in Workflows

| Workflow | Pipeline | Use Case |
|----------|----------|----------|
| Sentinel | Watch -> Analyze -> Report | Passive monitoring |
| Operator | Watch -> Analyze -> Propose | Action proposals |
| Autopilot | Watch -> Analyze -> Execute | Full automation |

---

## Session 2 Changes (January 8, 2026)

### 1. Gateway URL Updated
Changed default Gateway URL from `web-production-2fb66.up.railway.app` to `https://api.dominionlayer.io` in:
- `prediction-layer/src/commands/login.ts`
- `prediction-layer/src/commands/whoami.ts`
- `prediction-layer/src/core/providers/gateway.ts`
- `prediction-layer/src/core/config/schema.ts`
- `dominion-gitbook/docs/products/polymarket-cli.md`

### 2. GitBook Authentication Section
Added authentication documentation to `polymarket-cli.md` explaining:
- How to get API token (from admin)
- How `dominion-pm login` works
- Alternative env var method

### 3. /analyze Command Added to Whale Watcher
New Discord command that:
- Accepts market URL or slug
- Fetches market data
- Shows whale activity (trades, sentiment, buy/sell ratio)
- Calls Gateway API for LLM probability estimation
- Displays AI analysis with edge calculation

Files changed:
- `src/discord/commands.ts` - Added /analyze command
- `src/service/runner.ts` - Added analyzeMarket method
- `src/db/repositories/markets.ts` - Added getMarketBySlug, searchMarkets
- `src/gateway/client.ts` - NEW: Gateway client for LLM
- `src/config/schema.ts` - Added DOMINION_API_URL, DOMINION_API_TOKEN

### 4. Whale Watcher Gateway Token Created
```
User: Whale Watcher Bot (f_hb66XYBa5Dg4NvrYAY4)
Token: dom_kD6MOtNBOTpptGepR298SgTeMYQvCg4v
```

---

## Quick Start on New PC

### 1. Clone All Repos

```bash
git clone https://github.com/DominionLayer/whale-layer.git polymarket-whale-watcher
git clone https://github.com/DominionLayer/prediction-layer.git
git clone https://github.com/DominionLayer/dominion-swarm.git dominion
git clone https://github.com/DominionLayer/dominion-gitbook.git
```

### 2. Set Git Identity

```bash
git config --global user.name "DominionLayer"
git config --global user.email "layer3@dominionlayer.io"
```

### 3. Install Dependencies

```bash
# Whale Watcher
cd polymarket-whale-watcher
pnpm install
pnpm build

# Prediction CLI
cd ../prediction-layer
pnpm install
pnpm build
pnpm link --global  # Makes dominion-pm available globally

# Dominion Swarm
cd ../dominion
npm install
npm run build
```

### 4. Test Prediction CLI

```bash
dominion-pm login
# Enter: https://api.dominionlayer.io
# Enter: dom_kD6MOtNBOTpptGepR298SgTeMYQvCg4v (or your own token)

dominion-pm whoami  # Verify connection
dominion-pm scan    # Fetch markets
```

---

## Railway Services

| Service | Auto-Deploy | Branch |
|---------|-------------|--------|
| whale-layer | Yes | main |
| prediction-layer/server (Gateway) | Yes | main |

Both services auto-deploy when you push to `main`.

---

## Useful Commands

### Analyze a Market (Discord)
```
/analyze market:us-strikes-iran-by-january-31-2026
```

### Create Gateway User (PowerShell)
```powershell
$headers = @{ "Authorization" = "Bearer 25475727-1ef5-4e06-830d-b771dde24fd2"; "Content-Type" = "application/json" }
$body = '{"name": "New User", "email": "user@example.com"}'
Invoke-RestMethod -Uri "https://api.dominionlayer.io/admin/users" -Method POST -Headers $headers -Body $body
```

### Check Gateway Health
```bash
curl https://api.dominionlayer.io/health
```

---

## External Resources

- **Polymarket Gamma API**: https://gamma-api.polymarket.com
- **Polymarket Data API**: https://data-api.polymarket.com
- **Discord Developer Portal**: https://discord.com/developers/applications
- **Railway Dashboard**: https://railway.app
- **GitHub Org**: https://github.com/DominionLayer

---

*Last updated: January 8, 2026 - Session 2 Complete*
