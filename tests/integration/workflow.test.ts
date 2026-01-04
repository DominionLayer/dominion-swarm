/**
 * Integration Tests - Full Workflow Execution
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DominionDatabase } from '../../src/db/database.js';
import { StubProvider } from '../../src/providers/stub/provider.js';
import { WorkflowRunner } from '../../src/workflows/runner.js';
import { loadConfig, clearConfigCache, type DominionConfig } from '../../src/util/config.js';

describe('Workflow Integration', () => {
  const testDbPath = path.join(process.cwd(), 'test-data', 'integration-test.db');
  let db: DominionDatabase;
  let llm: StubProvider;
  let config: DominionConfig;

  beforeAll(() => {
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test config
    clearConfigCache();
    config = loadConfig();
    
    // Override for testing
    config.database.path = testDbPath;
    config.llm.defaultProvider = 'stub';
    config.general.dryRun = true;
    config.observe.enabled = true;
    config.analyze.enabled = true;
    config.execute.enabled = true;
    
    // Define test workflows
    config.workflows = {
      ...config.workflows,
      test_workflow: {
        description: 'Test workflow for integration tests',
        steps: [
          { plugin: 'analyze', action: 'analyze' },
          { plugin: 'execute', action: 'report' },
        ],
      },
    };
  });

  beforeEach(() => {
    // Fresh database for each test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    db = new DominionDatabase({ path: testDbPath });
    db.initialize();
    
    llm = new StubProvider({
      model: 'stub-1.0',
      deterministic: true,
    });
  });

  afterAll(() => {
    // Clean up
    if (db?.isOpen) {
      db.close();
    }
    
    const testDir = path.dirname(testDbPath);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('WorkflowRunner', () => {
    it('should execute a complete workflow', async () => {
      const runner = new WorkflowRunner({
        config,
        db,
        llm,
        dryRun: true,
      });

      await runner.initialize();

      try {
        const result = await runner.run('test_workflow');

        expect(result.status).toBe('completed');
        expect(result.runId).toBeDefined();
        expect(result.duration).toBeGreaterThan(0);
        expect(result.steps.length).toBe(2);
      } finally {
        await runner.shutdown();
      }
    });

    it('should persist run data to database', async () => {
      const runner = new WorkflowRunner({
        config,
        db,
        llm,
        dryRun: true,
      });

      await runner.initialize();

      try {
        const result = await runner.run('test_workflow');

        // Verify run was persisted
        const run = db.runs.getById(result.runId);
        expect(run).toBeDefined();
        expect(run?.workflow_id).toBe('test_workflow');
        expect(run?.status).toBe('completed');

        // Verify tasks were persisted
        const tasks = db.tasks.findByRun(result.runId);
        expect(tasks.length).toBe(2);
      } finally {
        await runner.shutdown();
      }
    });

    it('should handle workflow errors gracefully', async () => {
      // Create config with invalid workflow
      const badConfig = {
        ...config,
        workflows: {
          error_workflow: {
            description: 'Workflow that will fail',
            steps: [
              { plugin: 'nonexistent', action: 'action' },
            ],
          },
        },
      };

      const runner = new WorkflowRunner({
        config: badConfig,
        db,
        llm,
        dryRun: true,
      });

      await runner.initialize();

      try {
        const result = await runner.run('error_workflow');

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.steps[0].status).toBe('failed');
      } finally {
        await runner.shutdown();
      }
    });

    it('should generate workflow summary', async () => {
      const runner = new WorkflowRunner({
        config,
        db,
        llm,
        dryRun: true,
      });

      await runner.initialize();

      try {
        const result = await runner.run('test_workflow');

        expect(result.summary).toBeDefined();
        expect(typeof result.summary.stepsCompleted).toBe('number');
        expect(typeof result.summary.stepsFailed).toBe('number');
        expect(result.summary.stepsCompleted + result.summary.stepsFailed).toBe(result.steps.length);
      } finally {
        await runner.shutdown();
      }
    });
  });

  describe('Database Integration', () => {
    it('should create and query runs', () => {
      const run = db.runs.create({
        workflowId: 'test',
        config: { test: true },
      });

      expect(run.id).toBeDefined();
      expect(run.workflow_id).toBe('test');
      expect(run.status).toBe('pending');

      const retrieved = db.runs.getById(run.id);
      expect(retrieved).toEqual(run);
    });

    it('should create and update tasks', () => {
      const run = db.runs.create({ workflowId: 'test' });
      
      const task = db.tasks.create({
        runId: run.id,
        type: 'test:action',
        input: JSON.stringify({ key: 'value' }),
      });

      expect(task.status).toBe('pending');

      db.tasks.update(task.id, { status: 'completed' });
      
      const updated = db.tasks.getById(task.id);
      expect(updated?.status).toBe('completed');
    });

    it('should track observations and analyses', () => {
      const run = db.runs.create({ workflowId: 'test' });
      
      const observation = db.observations.create({
        runId: run.id,
        type: 'transaction',
        source: 'test',
        data: { tx: 'hash123' },
      });

      const analysis = db.analyses.create({
        runId: run.id,
        observationId: observation.id,
        agentId: 'test-agent',
        category: 'test',
        score: 75,
        confidence: 0.9,
        rationale: 'Test analysis',
      });

      expect(observation.id).toBeDefined();
      expect(analysis.id).toBeDefined();

      const highScore = db.analyses.findHighScore(70, run.id);
      expect(highScore.length).toBe(1);
      expect(highScore[0].id).toBe(analysis.id);
    });
  });

  describe('LLM Integration', () => {
    it('should use stub provider for analysis', async () => {
      const response = await llm.complete({
        messages: [
          { role: 'system', content: 'You are an analyst.' },
          { role: 'user', content: 'Analyze this observation.' },
        ],
      });

      expect(response.content).toBeDefined();
      expect(response.model).toBe('stub-1.0');
    });

    it('should track LLM call count', async () => {
      llm.resetCallCount();
      
      await llm.complete({ messages: [{ role: 'user', content: 'Hello' }] });
      await llm.complete({ messages: [{ role: 'user', content: 'Hello again' }] });
      
      expect(llm.getCallCount()).toBe(2);
    });
  });
});


