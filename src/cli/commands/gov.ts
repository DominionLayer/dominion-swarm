/**
 * Gov Command - Governance operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { GovernancePlugin } from '../../plugins/governance/plugin.js';
import { nanoid } from 'nanoid';

export const govCommand = new Command('gov')
  .description('Governance operations')
  .addCommand(
    new Command('list')
      .description('List proposals')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await listProposals(options);
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new proposal')
      .argument('<title>', 'Proposal title')
      .option('-d, --description <text>', 'Proposal description')
      .option('-c, --category <category>', 'Proposal category', 'general')
      .action(async (title, options) => {
        await createProposal(title, options);
      })
  )
  .addCommand(
    new Command('vote')
      .description('Vote on a proposal')
      .argument('<proposalId>', 'Proposal ID')
      .argument('<choice>', 'Vote choice (for, against, abstain)')
      .option('-r, --reason <text>', 'Reason for vote')
      .action(async (proposalId, choice, options) => {
        await voteOnProposal(proposalId, choice, options);
      })
  )
  .addCommand(
    new Command('show')
      .description('Show proposal details')
      .argument('<proposalId>', 'Proposal ID')
      .action(async (proposalId) => {
        await showProposal(proposalId);
      })
  );

async function listProposals(options: { status?: string }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    let proposals;
    if (options.status) {
      proposals = db.governance.findByStatus(options.status);
    } else {
      proposals = db.governance.getAll();
    }

    console.log();
    console.log(chalk.bold('Proposals'));
    console.log('─'.repeat(80));
    console.log();

    if (proposals.length === 0) {
      console.log(chalk.gray('No proposals found'));
    } else {
      const table = new Table({
        head: ['ID', 'Title', 'Status', 'For', 'Against', 'Category'],
        style: { head: ['cyan'] },
      });

      for (const proposal of proposals) {
        table.push([
          proposal.id.slice(0, 8),
          proposal.title.slice(0, 25),
          getStatusColor(proposal.status),
          chalk.green(proposal.votes_for.toString()),
          chalk.red(proposal.votes_against.toString()),
          proposal.category,
        ]);
      }

      console.log(table.toString());
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function createProposal(title: string, options: { description?: string; category: string }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new GovernancePlugin(config, db, llm);
    await plugin.initialize();

    const description = options.description || await promptForDescription();

    const result = await plugin.execute('create_proposal', {
      runId: nanoid(),
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      title,
      description,
      authorId: 'cli-user',
      category: options.category,
    });

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;

    console.log();
    console.log(chalk.green('[OK] Proposal created'));
    console.log(`  ID: ${chalk.cyan(data.proposalId)}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Discussion ends: ${new Date(data.discussionEndAt).toISOString()}`);
    console.log(`  Voting ends: ${new Date(data.votingEndAt).toISOString()}`);

    await plugin.shutdown();
    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function voteOnProposal(proposalId: string, choice: string, options: { reason?: string }): Promise<void> {
  try {
    if (!['for', 'against', 'abstain'].includes(choice)) {
      console.log(chalk.red('Invalid choice. Use: for, against, or abstain'));
      process.exit(1);
    }

    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new GovernancePlugin(config, db, llm);
    await plugin.initialize();

    const result = await plugin.execute('vote', {
      runId: nanoid(),
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      proposalId,
      voterId: 'cli-user',
      choice: choice as 'for' | 'against' | 'abstain',
      reason: options.reason,
    });

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;

    console.log();
    console.log(chalk.green('[OK] Vote cast'));
    console.log(`  Choice: ${choice}`);
    console.log(`  Current tally: For=${chalk.green(data.currentTally.for)}, Against=${chalk.red(data.currentTally.against)}, Abstain=${data.currentTally.abstain}`);

    await plugin.shutdown();
    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function showProposal(proposalId: string): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const proposal = db.governance.getById(proposalId);
    if (!proposal) {
      console.log(chalk.red(`Proposal not found: ${proposalId}`));
      process.exit(1);
    }

    const votes = db.governance.getVotesByProposal(proposalId);

    console.log();
    console.log(chalk.bold('─'.repeat(60)));
    console.log(chalk.bold(proposal.title));
    console.log(chalk.bold('─'.repeat(60)));
    console.log();
    console.log(`ID:          ${chalk.cyan(proposal.id)}`);
    console.log(`Status:      ${getStatusColor(proposal.status)}`);
    console.log(`Category:    ${proposal.category}`);
    console.log(`Author:      ${proposal.author_id}`);
    console.log(`Created:     ${new Date(proposal.created_at).toISOString()}`);
    console.log();
    console.log(chalk.bold('Description:'));
    console.log(proposal.description || 'No description');
    console.log();
    console.log(chalk.bold('Votes:'));
    console.log(`  For:     ${chalk.green(proposal.votes_for)}`);
    console.log(`  Against: ${chalk.red(proposal.votes_against)}`);
    console.log(`  Abstain: ${proposal.votes_abstain}`);
    console.log(`  Quorum:  ${proposal.quorum_required}`);
    console.log();

    if (proposal.discussion_summary) {
      console.log(chalk.bold('Discussion Summary:'));
      console.log(proposal.discussion_summary);
      console.log();
    }

    if (votes.length > 0) {
      console.log(chalk.bold('Recent Votes:'));
      for (const vote of votes.slice(0, 5)) {
        const icon = vote.choice === 'for' ? '[+]' : vote.choice === 'against' ? '[-]' : '[?]';
        console.log(`  ${icon} ${vote.voter_id.slice(0, 8)}: ${vote.reason || 'No reason'}`);
      }
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function promptForDescription(): Promise<string> {
  const answer = await inquirer.prompt([{
    type: 'editor',
    name: 'description',
    message: 'Enter proposal description:',
  }]);
  return answer.description;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'draft': return chalk.gray(status);
    case 'discussion': return chalk.yellow(status);
    case 'voting': return chalk.blue(status);
    case 'passed': return chalk.green(status);
    case 'rejected': return chalk.red(status);
    case 'executed': return chalk.green(status);
    default: return chalk.gray(status);
  }
}


