/**
 * Sentinel Workflow - Watch, Analyze, Report
 * 
 * The sentinel workflow is designed for continuous monitoring:
 * 1. Observe blockchain activity
 * 2. Analyze observations for significance
 * 3. Generate reports and alerts
 */

import { WorkflowRunner, type WorkflowResult } from './runner.js';
import type { DominionDatabase } from '../db/database.js';
import type { LLMProvider } from '../providers/base.js';
import type { DominionConfig } from '../util/config.js';
import { logger } from '../util/logger.js';

export interface SentinelOptions {
  config: DominionConfig;
  db: DominionDatabase;
  llm: LLMProvider;
  dryRun?: boolean;
  blockCount?: number;
  alertThreshold?: number;
}

export interface SentinelResult extends WorkflowResult {
  alerts: Alert[];
}

export interface Alert {
  level: 'info' | 'warning' | 'critical';
  category: string;
  score: number;
  message: string;
  observationId: string;
}

export async function runSentinel(options: SentinelOptions): Promise<SentinelResult> {
  const runner = new WorkflowRunner({
    config: options.config,
    db: options.db,
    llm: options.llm,
    dryRun: options.dryRun ?? true,
  });

  await runner.initialize();

  try {
    // Run the sentinel workflow
    const result = await runner.run('sentinel', {
      blockCount: options.blockCount || 10,
    });

    // Generate alerts from high-score analyses
    const alerts = generateAlerts(
      options.db,
      result.runId,
      options.alertThreshold ?? options.config.analyze.scoring.thresholdAlert
    );

    // Log alerts
    for (const alert of alerts) {
      if (alert.level === 'critical') {
        logger.warn(`[ALERT] ${alert.category}: ${alert.message}`, {
          runId: result.runId,
          score: alert.score,
        });
      }
    }

    return {
      ...result,
      alerts,
    };
  } finally {
    await runner.shutdown();
  }
}

function generateAlerts(
  db: DominionDatabase,
  runId: string,
  threshold: number
): Alert[] {
  const analyses = db.analyses.findHighScore(threshold, runId);
  const alerts: Alert[] = [];

  for (const analysis of analyses) {
    const level: Alert['level'] = 
      analysis.score >= 90 ? 'critical' :
      analysis.score >= 70 ? 'warning' : 'info';

    alerts.push({
      level,
      category: analysis.category,
      score: analysis.score,
      message: analysis.rationale || `High score ${analysis.category} activity detected`,
      observationId: analysis.observation_id,
    });
  }

  // Sort by score descending
  alerts.sort((a, b) => b.score - a.score);

  return alerts;
}

/**
 * Run sentinel in continuous mode
 */
export async function runSentinelContinuous(
  options: SentinelOptions,
  intervalMs: number = 60000,
  onResult?: (result: SentinelResult) => void
): Promise<() => void> {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const result = await runSentinel(options);
        if (onResult) {
          onResult(result);
        }
      } catch (error) {
        logger.error('Sentinel run failed', error as Error);
      }

      // Wait for next interval
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  };

  // Start the loop
  loop();

  // Return stop function
  return () => {
    running = false;
  };
}


