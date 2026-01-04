/**
 * Agent Memory - Persistent and ephemeral memory for agents
 */

import { v4 as uuidv4 } from 'uuid';
import type { MemoryType } from '../../util/schemas.js';
import { logger } from '../../util/logger.js';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: unknown;
  importance: number;
  expiresAt: number | null;
  createdAt: number;
  accessedAt: number;
}

export interface MemoryQuery {
  type?: MemoryType;
  key?: string;
  minImportance?: number;
  limit?: number;
}

export class AgentMemory {
  private agentId: string;
  private shortTerm: Map<string, MemoryEntry> = new Map();
  private longTerm: Map<string, MemoryEntry> = new Map();
  private maxShortTermSize: number;
  private persistFn?: (entry: MemoryEntry) => Promise<void>;
  private loadFn?: (agentId: string) => Promise<MemoryEntry[]>;

  constructor(
    agentId: string,
    options: {
      maxShortTermSize?: number;
      persistFn?: (entry: MemoryEntry) => Promise<void>;
      loadFn?: (agentId: string) => Promise<MemoryEntry[]>;
    } = {}
  ) {
    this.agentId = agentId;
    this.maxShortTermSize = options.maxShortTermSize ?? 100;
    this.persistFn = options.persistFn;
    this.loadFn = options.loadFn;
  }

  // ─────────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────────

  async store(
    key: string,
    value: unknown,
    options: {
      type?: MemoryType;
      importance?: number;
      ttlMs?: number;
    } = {}
  ): Promise<MemoryEntry> {
    const now = Date.now();
    const type = options.type ?? 'short_term';
    const importance = options.importance ?? 0.5;
    
    const entry: MemoryEntry = {
      id: uuidv4(),
      type,
      key,
      value,
      importance,
      expiresAt: options.ttlMs ? now + options.ttlMs : null,
      createdAt: now,
      accessedAt: now,
    };

    if (type === 'short_term' || type === 'episodic') {
      this.shortTerm.set(key, entry);
      this.evictIfNeeded();
    } else {
      this.longTerm.set(key, entry);
      
      // Persist long-term memories
      if (this.persistFn) {
        await this.persistFn(entry);
      }
    }

    logger.debug('Memory stored', {
      agentId: this.agentId,
      key,
      type,
      importance,
    });

    return entry;
  }

  get(key: string): unknown | undefined {
    const entry = this.shortTerm.get(key) || this.longTerm.get(key);
    
    if (!entry) return undefined;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Update access time
    entry.accessedAt = Date.now();
    
    return entry.value;
  }

  getEntry(key: string): MemoryEntry | undefined {
    return this.shortTerm.get(key) || this.longTerm.get(key);
  }

  has(key: string): boolean {
    return this.shortTerm.has(key) || this.longTerm.has(key);
  }

  delete(key: string): boolean {
    const shortDeleted = this.shortTerm.delete(key);
    const longDeleted = this.longTerm.delete(key);
    return shortDeleted || longDeleted;
  }

  // ─────────────────────────────────────────────────────────────
  // Query Operations
  // ─────────────────────────────────────────────────────────────

  query(query: MemoryQuery): MemoryEntry[] {
    const allEntries = [
      ...this.shortTerm.values(),
      ...this.longTerm.values(),
    ];

    let results = allEntries.filter((entry) => {
      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        return false;
      }

      if (query.type && entry.type !== query.type) {
        return false;
      }

      if (query.key && !entry.key.includes(query.key)) {
        return false;
      }

      if (query.minImportance !== undefined && entry.importance < query.minImportance) {
        return false;
      }

      return true;
    });

    // Sort by importance (descending), then by access time (most recent first)
    results.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return b.accessedAt - a.accessedAt;
    });

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  getRecent(limit: number = 10): MemoryEntry[] {
    return this.query({ limit });
  }

  getImportant(minImportance: number = 0.7): MemoryEntry[] {
    return this.query({ minImportance });
  }

  // ─────────────────────────────────────────────────────────────
  // Memory Management
  // ─────────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    if (this.shortTerm.size <= this.maxShortTermSize) return;

    // Get entries sorted by importance (ascending) and access time (oldest first)
    const entries = Array.from(this.shortTerm.entries()).sort(
      ([, a], [, b]) => {
        if (a.importance !== b.importance) {
          return a.importance - b.importance;
        }
        return a.accessedAt - b.accessedAt;
      }
    );

    // Remove least important/oldest entries
    const toRemove = entries.slice(0, this.shortTerm.size - this.maxShortTermSize);
    for (const [key] of toRemove) {
      this.shortTerm.delete(key);
    }

    logger.debug('Memory evicted entries', {
      agentId: this.agentId,
      evictedCount: toRemove.length,
    });
  }

  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.shortTerm) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.shortTerm.delete(key);
      }
    }

    for (const [key, entry] of this.longTerm) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.longTerm.delete(key);
      }
    }
  }

  clear(type?: MemoryType): void {
    if (!type) {
      this.shortTerm.clear();
      this.longTerm.clear();
    } else if (type === 'short_term' || type === 'episodic') {
      this.shortTerm.clear();
    } else {
      this.longTerm.clear();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.loadFn) return;

    const entries = await this.loadFn(this.agentId);
    
    for (const entry of entries) {
      if (entry.type === 'short_term' || entry.type === 'episodic') {
        this.shortTerm.set(entry.key, entry);
      } else {
        this.longTerm.set(entry.key, entry);
      }
    }

    logger.debug('Memory loaded from persistence', {
      agentId: this.agentId,
      entryCount: entries.length,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────

  getStats(): Record<string, unknown> {
    return {
      shortTermCount: this.shortTerm.size,
      longTermCount: this.longTerm.size,
      totalCount: this.shortTerm.size + this.longTerm.size,
      maxShortTermSize: this.maxShortTermSize,
    };
  }
}

