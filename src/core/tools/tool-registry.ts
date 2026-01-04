/**
 * Tool Registry - Central registry for all available tools
 */

import { Tool } from './tool.js';
import { logger } from '../../util/logger.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  // ─────────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────────

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, replacing', { name: tool.name });
    }

    this.tools.set(tool.name, tool);

    // Index by category
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category)!.add(tool.name);

    logger.debug('Tool registered', {
      name: tool.name,
      category: tool.category,
      dangerous: tool.dangerous,
    });
  }

  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);
    this.categories.get(tool.category)?.delete(name);

    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Retrieval
  // ─────────────────────────────────────────────────────────────

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getByCategory(category: string): Tool[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  getDangerous(): Tool[] {
    return this.getAll().filter((t) => t.dangerous);
  }

  getRequiringApproval(): Tool[] {
    return this.getAll().filter((t) => t.requiresApproval);
  }

  // ─────────────────────────────────────────────────────────────
  // Filtering
  // ─────────────────────────────────────────────────────────────

  filter(predicate: (tool: Tool) => boolean): Tool[] {
    return this.getAll().filter(predicate);
  }

  filterByNames(names: string[]): Tool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────

  getStats(): Record<string, unknown> {
    const tools = this.getAll();
    const byCategory: Record<string, number> = {};

    for (const tool of tools) {
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    }

    return {
      total: tools.length,
      dangerous: tools.filter((t) => t.dangerous).length,
      requiresApproval: tools.filter((t) => t.requiresApproval).length,
      byCategory,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────

  toJSON(): Record<string, unknown>[] {
    return this.getAll().map((t) => t.toJSON());
  }
}

// Global tool registry instance
export const globalToolRegistry = new ToolRegistry();

