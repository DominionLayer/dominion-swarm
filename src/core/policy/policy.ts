/**
 * Policy - Rule set defining what an agent may do
 */

import type { Agent } from '../agent/agent.js';
import { logger } from '../../util/logger.js';

export type PolicyAction = 'allow' | 'deny' | 'require_approval';

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
}

export interface PolicyCondition {
  type: 'tool' | 'role' | 'time' | 'rate' | 'custom';
  operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt' | 'gte' | 'lte';
  value: unknown;
  field?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  action: PolicyAction;
  matchedRule?: PolicyRule;
  reason?: string;
}

export class Policy {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  private rules: PolicyRule[] = [];
  private defaultAction: PolicyAction = 'deny';

  constructor(config: {
    id: string;
    name: string;
    description?: string;
    defaultAction?: PolicyAction;
    rules?: PolicyRule[];
  }) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.defaultAction = config.defaultAction || 'deny';
    
    if (config.rules) {
      this.rules = [...config.rules].sort((a, b) => b.priority - a.priority);
    }
  }

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  async checkPermission(
    agent: Agent,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<boolean> {
    const result = await this.evaluate(agent, toolName, params);
    return result.allowed;
  }

  async evaluate(
    agent: Agent,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<PolicyEvaluationResult> {
    const context = {
      agent,
      toolName,
      params,
      timestamp: Date.now(),
    };

    for (const rule of this.rules) {
      const matches = await this.evaluateCondition(rule.condition, context);
      
      if (matches) {
        logger.debug('Policy rule matched', {
          policyId: this.id,
          ruleId: rule.id,
          agentId: agent.id,
          toolName,
          action: rule.action,
        });

        return {
          allowed: rule.action === 'allow',
          action: rule.action,
          matchedRule: rule,
          reason: rule.description || `Matched rule: ${rule.name}`,
        };
      }
    }

    // No rule matched, use default action
    return {
      allowed: this.defaultAction === 'allow',
      action: this.defaultAction,
      reason: 'No matching rule found, using default policy',
    };
  }

  private async evaluateCondition(
    condition: PolicyCondition,
    context: {
      agent: Agent;
      toolName: string;
      params: Record<string, unknown>;
      timestamp: number;
    }
  ): Promise<boolean> {
    const { agent, toolName, params } = context;

    switch (condition.type) {
      case 'tool':
        return this.evaluateToolCondition(condition, toolName);
      
      case 'role':
        return this.evaluateRoleCondition(condition, agent.role);
      
      case 'custom':
        return this.evaluateCustomCondition(condition, { agent, toolName, params });
      
      default:
        return false;
    }
  }

  private evaluateToolCondition(condition: PolicyCondition, toolName: string): boolean {
    switch (condition.operator) {
      case 'equals':
        return toolName === condition.value;
      case 'contains':
        return toolName.includes(String(condition.value));
      case 'matches':
        return new RegExp(String(condition.value)).test(toolName);
      default:
        return false;
    }
  }

  private evaluateRoleCondition(condition: PolicyCondition, role: string): boolean {
    switch (condition.operator) {
      case 'equals':
        return role === condition.value;
      case 'contains':
        if (Array.isArray(condition.value)) {
          return condition.value.includes(role);
        }
        return false;
      default:
        return false;
    }
  }

  private evaluateCustomCondition(
    condition: PolicyCondition,
    context: { agent: Agent; toolName: string; params: Record<string, unknown> }
  ): boolean {
    // Custom conditions can check specific fields in params
    if (!condition.field) return false;

    const value = context.params[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'gt':
        return typeof value === 'number' && value > (condition.value as number);
      case 'lt':
        return typeof value === 'number' && value < (condition.value as number);
      case 'gte':
        return typeof value === 'number' && value >= (condition.value as number);
      case 'lte':
        return typeof value === 'number' && value <= (condition.value as number);
      default:
        return false;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      defaultAction: this.defaultAction,
      rules: this.rules,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Policy Presets
// ─────────────────────────────────────────────────────────────

export function createReadOnlyPolicy(id: string): Policy {
  return new Policy({
    id,
    name: 'Read Only',
    description: 'Only allows read operations',
    defaultAction: 'deny',
    rules: [
      {
        id: 'allow-read',
        name: 'Allow Read Operations',
        condition: { type: 'tool', operator: 'contains', value: 'read' },
        action: 'allow',
        priority: 100,
      },
      {
        id: 'allow-get',
        name: 'Allow Get Operations',
        condition: { type: 'tool', operator: 'contains', value: 'get' },
        action: 'allow',
        priority: 100,
      },
      {
        id: 'allow-list',
        name: 'Allow List Operations',
        condition: { type: 'tool', operator: 'contains', value: 'list' },
        action: 'allow',
        priority: 100,
      },
      {
        id: 'allow-watch',
        name: 'Allow Watch Operations',
        condition: { type: 'tool', operator: 'contains', value: 'watch' },
        action: 'allow',
        priority: 100,
      },
    ],
  });
}

export function createApprovalRequiredPolicy(id: string): Policy {
  return new Policy({
    id,
    name: 'Approval Required',
    description: 'Requires approval for all actions',
    defaultAction: 'require_approval',
    rules: [],
  });
}

export function createExecutorPolicy(id: string): Policy {
  return new Policy({
    id,
    name: 'Executor Policy',
    description: 'Policy for executor agents',
    defaultAction: 'deny',
    rules: [
      {
        id: 'allow-execute',
        name: 'Allow Execute Operations',
        condition: { type: 'tool', operator: 'contains', value: 'execute' },
        action: 'require_approval',
        priority: 100,
      },
      {
        id: 'allow-webhook',
        name: 'Allow Webhook Operations',
        condition: { type: 'tool', operator: 'contains', value: 'webhook' },
        action: 'allow',
        priority: 90,
      },
      {
        id: 'allow-file',
        name: 'Allow File Write to Reports',
        condition: { type: 'tool', operator: 'contains', value: 'file_write' },
        action: 'allow',
        priority: 90,
      },
    ],
  });
}


