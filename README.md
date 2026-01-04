# Dominion

**General-Purpose Autonomous Agent Swarm Orchestrator**

Dominion is a production-grade CLI application for running autonomous agent swarms that can observe, analyze, execute, coordinate infrastructure, run markets, govern systems, and self-improve over time.

## Features

- **Multi-Agent System**: Agents with distinct roles (watcher, analyst, executor, coordinator, auditor, governor)
- **Blockchain Integration**: Watch EVM chains using ethers v6 (blocks, transactions, events)
- **LLM-Powered Analysis**: Connect to OpenAI or Anthropic for intelligent analysis
- **Safe by Default**: Dry-run mode, approval gates, and auditor oversight
- **Full Audit Trail**: SQLite-based persistence for all runs, tasks, and decisions
- **Plugin Architecture**: Modular plugins for observe, analyze, execute, infra, market, governance, self-improve
- **Structured Logging**: JSON-formatted logs with run/agent/task context

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd dominion

# Install dependencies
npm install

# Build the project
npm run build

# Initialize Dominion
npx dominion init
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your API keys:
```env
# For OpenAI
OPENAI_API_KEY=sk-your-key-here

# For Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here

# For blockchain watching
EVM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-key
```

3. Edit `dominion.config.yaml` to customize your setup.

### Running the Sentinel Workflow

The sentinel workflow watches blockchain activity, analyzes it, and generates reports:

```bash
# Run with stub provider (offline testing)
npx dominion run sentinel

# Run with OpenAI
LLM_PROVIDER=openai npx dominion run sentinel

# Run with Anthropic
LLM_PROVIDER=anthropic npx dominion run sentinel

# Run with actual execution (not dry-run)
npx dominion run sentinel --no-dry-run --approve
```

### Validating Your Setup

```bash
npx dominion doctor
```

This will check:
- Configuration validity
- Database connectivity
- LLM provider availability
- EVM RPC connectivity
- Safety settings

## CLI Commands

| Command | Description |
|---------|-------------|
| `dominion init` | Initialize configuration and database |
| `dominion run <workflow>` | Run a workflow (sentinel, operator, autopilot) |
| `dominion observe` | Watch blockchain activity |
| `dominion analyze` | Analyze observations |
| `dominion execute report <runId>` | Generate a report |
| `dominion execute webhook <url>` | Send a webhook |
| `dominion queue list` | List job queue |
| `dominion queue add <type>` | Add job to queue |
| `dominion market jobs` | List marketplace jobs |
| `dominion market stats` | Show market statistics |
| `dominion gov list` | List proposals |
| `dominion gov create <title>` | Create a proposal |
| `dominion gov vote <id> <choice>` | Vote on a proposal |
| `dominion agents list` | List agents |
| `dominion logs` | View audit logs |
| `dominion doctor` | Validate configuration |

## Built-in Workflows

### Sentinel
Watch → Analyze → Report

Best for passive monitoring and alerting.

```bash
npx dominion run sentinel
```

### Operator
Watch → Analyze → Propose Actions

Extends sentinel with action proposals (no execution).

```bash
npx dominion run operator
```

### Autopilot
Watch → Analyze → Execute (with approval)

Full pipeline with approval gates for dangerous actions.

```bash
# Interactive mode (prompts for approval)
npx dominion run autopilot --no-dry-run

# Auto-approve (USE WITH CAUTION)
npx dominion run autopilot --no-dry-run --approve
```

## Switching LLM Providers

### Using OpenAI

```yaml
# dominion.config.yaml
llm:
  default_provider: "openai"
  openai:
    model: "gpt-4-turbo-preview"
    temperature: 0.1
    max_tokens: 4096
```

```bash
export OPENAI_API_KEY=sk-your-key
npx dominion run sentinel
```

### Using Anthropic

```yaml
# dominion.config.yaml
llm:
  default_provider: "anthropic"
  anthropic:
    model: "claude-3-5-sonnet-20241022"
    temperature: 0.1
    max_tokens: 4096
```

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
npx dominion run sentinel
```

### Using Stub (Offline Testing)

```yaml
# dominion.config.yaml
llm:
  default_provider: "stub"
  stub:
    deterministic: true
```

## Adding a New Plugin

1. Create a new directory under `src/plugins/`:

```
src/plugins/myplugin/
  plugin.ts
```

2. Implement the plugin:

```typescript
import { Plugin } from '../base.js';
import { createTool, type Tool } from '../../core/tools/tool.js';
import { z } from 'zod';

export class MyPlugin extends Plugin {
  readonly name = 'myplugin';
  readonly version = '1.0.0';
  readonly description = 'My custom plugin';

  protected async onInitialize(): Promise<void> {
    // Setup code
  }

  protected async onShutdown(): Promise<void> {
    // Cleanup code
  }

  protected registerTools(): Tool[] {
    return [
      createTool({
        name: `${this.name}:myaction`,
        description: 'Does something useful',
        category: 'myplugin',
        inputSchema: z.object({
          input: z.string(),
        }),
        outputSchema: z.object({
          output: z.string(),
        }),
        execute: async (input) => {
          return { output: `Processed: ${input.input}` };
        },
      }),
    ];
  }
}
```

3. Register the plugin in `src/plugins/index.ts`

4. Add configuration in `dominion.config.yaml`:

```yaml
myplugin:
  enabled: true
```

## Sample Configuration

```yaml
# Watch two addresses and ERC20 Transfer events
observe:
  enabled: true
  evm:
    rpc_url: "${EVM_RPC_URL}"
    chain_id: 1
    
    watch_addresses:
      - address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        label: "USDC Contract"
      - address: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
        label: "USDT Contract"
    
    watch_events:
      - contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        label: "USDC Transfers"
        abi:
          - "event Transfer(address indexed from, address indexed to, uint256 value)"
        events:
          - "Transfer"
```

## Project Structure

```
src/
  cli/                  # CLI commands
  core/
    agent/              # Agent system
    task/               # Task management
    tools/              # Tool framework
    policy/             # Policy engine
    orchestrator/       # Workflow orchestration
  providers/
    openai/             # OpenAI provider
    anthropic/          # Anthropic provider
    stub/               # Stub provider for testing
  plugins/
    observe/            # Blockchain observation
    analyze/            # LLM-powered analysis
    execute/            # Action execution
    infra/              # Job queue & scheduling
    market/             # Marketplace simulation
    governance/         # Proposal & voting
    selfimprove/        # Performance tracking
  db/
    schema/             # Database schema
    repositories/       # Data access layer
  workflows/            # Built-in workflows
  util/                 # Utilities (config, logging, etc.)
```

## Safety & Security

- **No secrets in repository**: All sensitive data via environment variables
- **Dry-run by default**: No real execution without explicit opt-in
- **Approval gates**: Dangerous actions require approval
- **Auditor veto**: Auditor agents can block execution
- **Rate limiting**: Built-in rate limiting for RPC and LLM calls
- **Circuit breaker**: Automatic fallback on repeated failures

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | For OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For Anthropic |
| `EVM_RPC_URL` | Ethereum RPC endpoint | For blockchain watching |
| `EXECUTOR_PRIVATE_KEY` | Private key for transactions | Optional, dangerous |
| `DATABASE_PATH` | SQLite database path | Optional |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | Optional |

## Testing

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run specific test file
npx vitest run tests/unit/task.test.ts
```

## Development

```bash
# Run in development mode (with hot reload)
npm run dev -- run sentinel

# Build
npm run build

# Lint
npm run lint
```

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.


