/**
 * Retry Utility Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, RateLimiter, CircuitBreaker, CircuitState } from '../../src/util/retry.js';

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })
    ).rejects.toThrow('always fails');
    
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        retryableErrors: () => false,
      })
    ).rejects.toThrow('not retryable');
    
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    
    expect(limiter.remaining()).toBe(0);
  });

  it('should track remaining capacity', async () => {
    const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });
    
    expect(limiter.remaining()).toBe(10);
    
    await limiter.acquire();
    await limiter.acquire();
    
    expect(limiter.remaining()).toBe(8);
  });

  it('should reset', async () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    
    await limiter.acquire();
    await limiter.acquire();
    
    limiter.reset();
    
    expect(limiter.remaining()).toBe(5);
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
    });
    
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });
    
    const failingFn = () => Promise.reject(new Error('fail'));
    
    await expect(breaker.execute(failingFn)).rejects.toThrow();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    
    await expect(breaker.execute(failingFn)).rejects.toThrow();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should reject calls when open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10000,
    });
    
    await expect(
      breaker.execute(() => Promise.reject(new Error()))
    ).rejects.toThrow();
    
    await expect(
      breaker.execute(() => Promise.resolve('success'))
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('should reset to closed after success in half-open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });
    
    // Open the circuit
    await expect(
      breaker.execute(() => Promise.reject(new Error()))
    ).rejects.toThrow();
    
    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // Should transition to half-open and then closed on success
    const result = await breaker.execute(() => Promise.resolve('success'));
    
    expect(result).toBe('success');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});


