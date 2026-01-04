/**
 * Doctor Command - Validate configuration and connectivity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../../util/config.js';
import { getDatabase, closeDatabase } from '../../db/database.js';
import { checkProviderAvailability, createProvider } from '../../providers/index.js';
import { ethers } from 'ethers';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  details?: string;
}

export const doctorCommand = new Command('doctor')
  .description('Validate configuration and connectivity')
  .option('--fix', 'Attempt to fix issues')
  .action(async (options) => {
    console.log();
    console.log(chalk.bold('Dominion Doctor'));
    console.log('─'.repeat(60));
    console.log();

    const results: CheckResult[] = [];

    // Check config
    results.push(await checkConfig());

    // Check database
    results.push(await checkDatabase());

    // Check LLM providers
    const llmResults = await checkLLMProviders();
    results.push(...llmResults);

    // Check EVM connectivity
    results.push(await checkEVMConnectivity());

    // Check environment variables
    results.push(...checkEnvironmentVariables());

    // Display results
    console.log();
    console.log(chalk.bold('Results'));
    console.log('─'.repeat(60));
    console.log();

    let hasErrors = false;
    let hasWarnings = false;

    for (const result of results) {
      const icon = result.status === 'pass' ? chalk.green('✓') :
                   result.status === 'fail' ? chalk.red('✗') :
                   result.status === 'warn' ? chalk.yellow('⚠') :
                   chalk.gray('○');
      
      console.log(`${icon} ${result.name}`);
      console.log(`  ${chalk.gray(result.message)}`);
      if (result.details) {
        console.log(`  ${chalk.gray(result.details)}`);
      }
      console.log();

      if (result.status === 'fail') hasErrors = true;
      if (result.status === 'warn') hasWarnings = true;
    }

    // Summary
    console.log('─'.repeat(60));
    const passCount = results.filter(r => r.status === 'pass').length;
    const failCount = results.filter(r => r.status === 'fail').length;
    const warnCount = results.filter(r => r.status === 'warn').length;

    console.log(`${chalk.green(passCount)} passed, ${chalk.red(failCount)} failed, ${chalk.yellow(warnCount)} warnings`);
    console.log();

    if (hasErrors) {
      console.log(chalk.red('Some checks failed. Please fix the issues above.'));
      process.exit(1);
    } else if (hasWarnings) {
      console.log(chalk.yellow('Some warnings detected. Dominion should work but may have limited functionality.'));
    } else {
      console.log(chalk.green('All checks passed! Dominion is ready to use.'));
    }
  });

async function checkConfig(): Promise<CheckResult> {
  try {
    const config = getConfig();
    return {
      name: 'Configuration',
      status: 'pass',
      message: `Loaded configuration: ${config.general.name}`,
      details: `Environment: ${config.general.environment}, Dry-run: ${config.general.dryRun}`,
    };
  } catch (error) {
    return {
      name: 'Configuration',
      status: 'fail',
      message: `Failed to load config: ${(error as Error).message}`,
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const stats = db.getStats();
    closeDatabase();

    return {
      name: 'Database',
      status: 'pass',
      message: `SQLite database operational at ${config.database.path}`,
      details: `Tables: ${stats.totalTables}`,
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'fail',
      message: `Database error: ${(error as Error).message}`,
    };
  }
}

async function checkLLMProviders(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const config = getConfig();

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const provider = createProvider('openai');
      const available = await provider.isAvailable();
      results.push({
        name: 'OpenAI Provider',
        status: available ? 'pass' : 'warn',
        message: available ? 'OpenAI API is reachable' : 'OpenAI API key set but connection failed',
        details: `Model: ${config.llm.openai?.model || 'default'}`,
      });
    } catch (error) {
      results.push({
        name: 'OpenAI Provider',
        status: 'warn',
        message: `OpenAI check failed: ${(error as Error).message}`,
      });
    }
  } else {
    results.push({
      name: 'OpenAI Provider',
      status: 'skip',
      message: 'OPENAI_API_KEY not set',
    });
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const provider = createProvider('anthropic');
      const available = await provider.isAvailable();
      results.push({
        name: 'Anthropic Provider',
        status: available ? 'pass' : 'warn',
        message: available ? 'Anthropic API is reachable' : 'Anthropic API key set but connection failed',
        details: `Model: ${config.llm.anthropic?.model || 'default'}`,
      });
    } catch (error) {
      results.push({
        name: 'Anthropic Provider',
        status: 'warn',
        message: `Anthropic check failed: ${(error as Error).message}`,
      });
    }
  } else {
    results.push({
      name: 'Anthropic Provider',
      status: 'skip',
      message: 'ANTHROPIC_API_KEY not set',
    });
  }

  // Stub (always available)
  results.push({
    name: 'Stub Provider',
    status: 'pass',
    message: 'Stub provider always available for testing',
  });

  // Check default provider
  const defaultProvider = config.llm.defaultProvider;
  const providerAvailable = (defaultProvider === 'stub') ||
    (defaultProvider === 'openai' && process.env.OPENAI_API_KEY) ||
    (defaultProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY);

  if (!providerAvailable && defaultProvider !== 'stub') {
    results.push({
      name: 'Default LLM Provider',
      status: 'warn',
      message: `Default provider "${defaultProvider}" not configured`,
      details: 'Will fall back to stub provider',
    });
  }

  return results;
}

async function checkEVMConnectivity(): Promise<CheckResult> {
  const rpcUrl = process.env.EVM_RPC_URL;
  
  if (!rpcUrl) {
    return {
      name: 'EVM Connectivity',
      status: 'skip',
      message: 'EVM_RPC_URL not set',
      details: 'Blockchain observation features will be unavailable',
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    provider.destroy();

    return {
      name: 'EVM Connectivity',
      status: 'pass',
      message: `Connected to chain ID ${network.chainId}`,
      details: `Current block: ${blockNumber}`,
    };
  } catch (error) {
    return {
      name: 'EVM Connectivity',
      status: 'warn',
      message: `Failed to connect: ${(error as Error).message}`,
      details: 'Check your RPC URL and network connectivity',
    };
  }
}

function checkEnvironmentVariables(): CheckResult[] {
  const results: CheckResult[] = [];

  // Check for dangerous config
  if (process.env.EXECUTOR_PRIVATE_KEY) {
    results.push({
      name: 'Executor Private Key',
      status: 'warn',
      message: 'EXECUTOR_PRIVATE_KEY is set',
      details: 'Ensure this is intentional and the key is secure',
    });
  }

  // Check for unsafe config
  const config = getConfig();
  if (!config.general.dryRun) {
    results.push({
      name: 'Dry Run Mode',
      status: 'warn',
      message: 'Dry run is DISABLED',
      details: 'Actions will be executed for real!',
    });
  } else {
    results.push({
      name: 'Dry Run Mode',
      status: 'pass',
      message: 'Dry run is enabled (safe mode)',
    });
  }

  if (!config.general.requireApproval) {
    results.push({
      name: 'Approval Required',
      status: 'warn',
      message: 'Action approval is DISABLED',
      details: 'Actions may execute without confirmation',
    });
  } else {
    results.push({
      name: 'Approval Required',
      status: 'pass',
      message: 'Action approval is required',
    });
  }

  return results;
}


