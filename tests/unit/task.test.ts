/**
 * Task Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Task } from '../../src/core/task/task.js';

describe('Task', () => {
  let task: Task;

  beforeEach(() => {
    task = new Task({
      runId: 'test-run-123',
      type: 'test:action',
      input: { key: 'value' },
      priority: 'normal',
      maxRetries: 3,
    });
  });

  describe('creation', () => {
    it('should create task with correct properties', () => {
      expect(task.runId).toBe('test-run-123');
      expect(task.type).toBe('test:action');
      expect(task.input).toEqual({ key: 'value' });
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('normal');
      expect(task.maxRetries).toBe(3);
    });

    it('should generate unique ID', () => {
      const task2 = new Task({
        runId: 'test-run-123',
        type: 'test:action',
        input: {},
      });
      expect(task.id).not.toBe(task2.id);
    });
  });

  describe('state transitions', () => {
    it('should transition from pending to queued', () => {
      task.queue();
      expect(task.status).toBe('queued');
    });

    it('should transition from pending to running', () => {
      task.start();
      expect(task.status).toBe('running');
      expect(task.startedAt).toBeDefined();
    });

    it('should complete with output', () => {
      task.start();
      task.complete({ result: 'success' });
      
      expect(task.status).toBe('completed');
      expect(task.output).toEqual({ result: 'success' });
      expect(task.completedAt).toBeDefined();
    });

    it('should fail with error', () => {
      task.start();
      task.fail('Something went wrong');
      
      expect(task.status).toBe('failed');
      expect(task.error).toBe('Something went wrong');
    });

    it('should cancel task', () => {
      task.start();
      task.cancel();
      
      expect(task.status).toBe('cancelled');
    });

    it('should retry failed task', () => {
      task.start();
      task.fail('Error');
      
      expect(task.canRetry()).toBe(true);
      
      task.retry();
      expect(task.status).toBe('pending');
      expect(task.retries).toBe(1);
    });

    it('should not retry beyond max attempts', () => {
      for (let i = 0; i < 3; i++) {
        task.start();
        task.fail('Error');
        if (i < 2) task.retry();
      }
      
      expect(task.canRetry()).toBe(false);
    });
  });

  describe('duration tracking', () => {
    it('should calculate duration for completed task', async () => {
      task.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      task.complete({});
      
      expect(task.duration).toBeGreaterThan(0);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const json = task.toJSON();
      
      expect(json.id).toBe(task.id);
      expect(json.runId).toBe('test-run-123');
      expect(json.type).toBe('test:action');
      expect(json.status).toBe('pending');
    });
  });
});


