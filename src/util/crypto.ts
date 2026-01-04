/**
 * Cryptographic utilities
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * Generate a secure random hex string
 */
export function randomHex(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generate a SHA-256 hash of the input
 */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a deterministic ID from multiple inputs
 */
export function deterministicId(...inputs: (string | number)[]): string {
  const combined = inputs.map(String).join(':');
  return sha256(combined).slice(0, 24);
}
