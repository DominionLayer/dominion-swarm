/**
 * Agents Command - Manage agents
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';

export const agentsCommand = new Command('agents')
  .description('Manage agents')
  .addCommand(
    new Command('list')
      .description('List all agents')
      .option('-r, --role <role>', 'Filter by role')
      .action(async (options) => {
        await listAgents(options);
      })
  )
  .addCommand(
    new Command('show')
      .description('Show agent details')
      .argument('<agentId>', 'Agent ID')
      .action(async (agentId) => {
        await showAgent(agentId);
      })
  )
  .addCommand(
    new Command('stats')
      .description('Show agent statistics')
      .action(async () => {
        await showAgentStats();
      })
  );

async function listAgents(options: { role?: string }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    let agents;
    if (options.role) {
      agents = db.agents.findByRole(options.role);
    } else {
      agents = db.agents.getAll();
    }

    // Also include agents from config that might not be in DB yet
    const configAgents = config.agents;

    console.log();
    console.log(chalk.bold('Agents'));
    console.log('─'.repeat(80));
    console.log();

    if (agents.length === 0 && configAgents.length === 0) {
      console.log(chalk.gray('No agents configured'));
    } else {
      const table = new Table({
        head: ['ID', 'Name', 'Role', 'Status', 'Tools'],
        style: { head: ['cyan'] },
      });

      const seenIds = new Set<string>();

      // DB agents
      for (const agent of agents) {
        seenIds.add(agent.id);
        const tools = agent.tools ? JSON.parse(agent.tools) : [];
        table.push([
          agent.id.slice(0, 12),
          agent.name,
          getRoleColor(agent.role),
          getStatusColor(agent.status),
          tools.length.toString(),
        ]);
      }

      // Config agents not yet in DB
      for (const agent of configAgents) {
        if (!seenIds.has(agent.id)) {
          table.push([
            agent.id.slice(0, 12),
            agent.name,
            getRoleColor(agent.role),
            chalk.gray('not started'),
            agent.tools.length.toString(),
          ]);
        }
      }

      console.log(table.toString());
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function showAgent(agentId: string): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    // Try DB first
    let agent = db.agents.getById(agentId);
    let fromConfig = false;

    // Then try config
    if (!agent) {
      const configAgent = config.agents.find(a => a.id === agentId);
      if (configAgent) {
        agent = {
          id: configAgent.id,
          role: configAgent.role,
          name: configAgent.name,
          description: configAgent.description || null,
          tools: JSON.stringify(configAgent.tools),
          policy: JSON.stringify(configAgent.policy),
          status: 'not started',
          created_at: 0,
          updated_at: 0,
        };
        fromConfig = true;
      }
    }

    if (!agent) {
      console.log(chalk.red(`Agent not found: ${agentId}`));
      process.exit(1);
    }

    const tools = agent.tools ? JSON.parse(agent.tools) : [];
    const policy = agent.policy ? JSON.parse(agent.policy) : {};

    console.log();
    console.log(chalk.bold('─'.repeat(60)));
    console.log(chalk.bold(agent.name));
    console.log(chalk.bold('─'.repeat(60)));
    console.log();
    console.log(`ID:          ${chalk.cyan(agent.id)}`);
    console.log(`Role:        ${getRoleColor(agent.role)}`);
    console.log(`Status:      ${getStatusColor(agent.status)}`);
    console.log(`Source:      ${fromConfig ? 'config' : 'database'}`);
    console.log();
    
    if (agent.description) {
      console.log(chalk.bold('Description:'));
      console.log(agent.description);
      console.log();
    }

    console.log(chalk.bold('Tools:'));
    if (tools.length === 0) {
      console.log(chalk.gray('  No tools configured'));
    } else {
      for (const tool of tools) {
        console.log(`  - ${tool}`);
      }
    }
    console.log();

    console.log(chalk.bold('Policy:'));
    if (Object.keys(policy).length === 0) {
      console.log(chalk.gray('  No policy configured'));
    } else {
      console.log(JSON.stringify(policy, null, 2));
    }

    // Get recent tasks
    const tasks = db.tasks.findByAgent(agentId);
    if (tasks.length > 0) {
      console.log();
      console.log(chalk.bold('Recent Tasks:'));
      for (const task of tasks.slice(0, 5)) {
        const statusIcon = task.status === 'completed' ? '[done]' : task.status === 'failed' ? '[fail]' : '[..]';
        console.log(`  ${statusIcon} ${task.type} (${task.status})`);
      }
    }

    // Get scores
    const scores = db.scores.findByAgent(agentId, 5);
    if (scores.length > 0) {
      console.log();
      console.log(chalk.bold('Recent Scores:'));
      for (const score of scores) {
        console.log(`  ${score.metric}: ${score.value.toFixed(2)}`);
      }
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function showAgentStats(): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const agents = db.agents.getAll();
    const configAgents = config.agents;

    const byRole: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    // Count from both sources
    for (const agent of agents) {
      byRole[agent.role] = (byRole[agent.role] || 0) + 1;
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
    }

    const seenIds = new Set(agents.map(a => a.id));
    for (const agent of configAgents) {
      if (!seenIds.has(agent.id)) {
        byRole[agent.role] = (byRole[agent.role] || 0) + 1;
        byStatus['not started'] = (byStatus['not started'] || 0) + 1;
      }
    }

    console.log();
    console.log(chalk.bold('Agent Statistics'));
    console.log('─'.repeat(40));
    console.log(`Total Agents: ${chalk.cyan(agents.length + configAgents.filter(a => !seenIds.has(a.id)).length)}`);
    console.log();
    console.log(chalk.bold('By Role:'));
    for (const [role, count] of Object.entries(byRole)) {
      console.log(`  ${getRoleColor(role)}: ${count}`);
    }
    console.log();
    console.log(chalk.bold('By Status:'));
    for (const [status, count] of Object.entries(byStatus)) {
      console.log(`  ${getStatusColor(status)}: ${count}`);
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'watcher': return chalk.blue(role);
    case 'analyst': return chalk.magenta(role);
    case 'executor': return chalk.yellow(role);
    case 'coordinator': return chalk.cyan(role);
    case 'auditor': return chalk.red(role);
    case 'governor': return chalk.green(role);
    default: return chalk.gray(role);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'idle': return chalk.gray(status);
    case 'running': return chalk.green(status);
    case 'paused': return chalk.yellow(status);
    case 'error': return chalk.red(status);
    case 'terminated': return chalk.red(status);
    default: return chalk.gray(status);
  }
}


