/**
 * Retry and rate limiting utilities
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  multiplier: number = 2
): number {
  const delay = baseDelayMs * Math.pow(multiplier, attempt - 1);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      if (opts.retryableErrors && !opts.retryableErrors(lastError)) {
        throw lastError;
      }

      if (attempt < opts.maxAttempts) {
        const delay = calculateBackoff(
          attempt,
          opts.baseDelayMs,
          opts.maxDelayMs,
          opts.backoffMultiplier
        );
        
        logger.debug(`Retry attempt ${attempt}/${opts.maxAttempts}`, {
          error: lastError.message,
          delayMs: delay,
        });
        
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────
// Rate Limiter
// ─────────────────────────────────────────────────────────────

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }

  private cleanup(): void {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);
  }

  async acquire(): Promise<void> {
    this.cleanup();

    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      if (oldestRequest) {
        const waitTime = this.windowMs - (Date.now() - oldestRequest);
        if (waitTime > 0) {
          logger.debug('Rate limit reached, waiting', { waitTimeMs: waitTime });
          await sleep(waitTime);
          this.cleanup();
        }
      }
    }

    this.requests.push(Date.now());
  }

  remaining(): number {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  reset(): void {
    this.requests = [];
  }
}

// Create rate limiters for different services
export function createRPCRateLimiter(ratePerSecond: number): RateLimiter {
  return new RateLimiter({
    maxRequests: ratePerSecond,
    windowMs: 1000,
  });
}

export function createLLMRateLimiter(ratePerMinute: number): RateLimiter {
  return new RateLimiter({
    maxRequests: ratePerMinute,
    windowMs: 60000,
  });
}

// ─────────────────────────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────────────────────────

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenSuccesses: number = 0;
  
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenRequests: number;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.halfOpenRequests = options.halfOpenRequests ?? 1;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenSuccesses = 0;
        logger.debug('Circuit breaker transitioning to half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenRequests) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        logger.debug('Circuit breaker closed');
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened', {
        failures: this.failures,
        threshold: this.failureThreshold,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.halfOpenSuccesses = 0;
  }
}

