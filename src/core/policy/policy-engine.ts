/**
 * Policy Engine - Manages and evaluates policies
 */

import { Policy, type PolicyRule, type PolicyEvaluationResult } from './policy.js';
import type { Agent } from '../agent/agent.js';
import { logger } from '../../util/logger.js';

export interface PolicyEngineConfig {
  defaultPolicy?: Policy;
  strictMode?: boolean;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private agentPolicies: Map<string, string> = new Map();
  private defaultPolicy?: Policy;
  private strictMode: boolean;

  constructor(config: PolicyEngineConfig = {}) {
    this.defaultPolicy = config.defaultPolicy;
    this.strictMode = config.strictMode ?? true;
  }

  // ─────────────────────────────────────────────────────────────
  // Policy Management
  // ─────────────────────────────────────────────────────────────

  registerPolicy(policy: Policy): void {
    this.policies.set(policy.id, policy);
    logger.debug('Policy registered', { policyId: policy.id, name: policy.name });
  }

  unregisterPolicy(policyId: string): boolean {
    // Check if any agents are using this policy
    for (const [agentId, pid] of this.agentPolicies.entries()) {
      if (pid === policyId) {
        logger.warn('Cannot unregister policy in use', { policyId, agentId });
        return false;
      }
    }

    return this.policies.delete(policyId);
  }

  getPolicy(policyId: string): Policy | undefined {
    return this.policies.get(policyId);
  }

  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  // ─────────────────────────────────────────────────────────────
  // Agent-Policy Binding
  // ─────────────────────────────────────────────────────────────

  assignPolicy(agentId: string, policyId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) {
      logger.error('Policy not found', undefined, { policyId });
      return false;
    }

    this.agentPolicies.set(agentId, policyId);
    logger.debug('Policy assigned to agent', { agentId, policyId });
    return true;
  }

  unassignPolicy(agentId: string): void {
    this.agentPolicies.delete(agentId);
  }

  getAgentPolicy(agentId: string): Policy | undefined {
    const policyId = this.agentPolicies.get(agentId);
    if (policyId) {
      return this.policies.get(policyId);
    }
    return this.defaultPolicy;
  }

  // ─────────────────────────────────────────────────────────────
  // Evaluation
  // ─────────────────────────────────────────────────────────────

  async evaluate(
    agent: Agent,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<PolicyEvaluationResult> {
    const policy = this.getAgentPolicy(agent.id);

    if (!policy) {
      if (this.strictMode) {
        logger.warn('No policy found for agent in strict mode', { agentId: agent.id });
        return {
          allowed: false,
          action: 'deny',
          reason: 'No policy assigned and strict mode is enabled',
        };
      }

      // In non-strict mode, allow by default
      return {
        allowed: true,
        action: 'allow',
        reason: 'No policy assigned and strict mode is disabled',
      };
    }

    return policy.evaluate(agent, toolName, params);
  }

  async checkPermission(
    agent: Agent,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<boolean> {
    const result = await this.evaluate(agent, toolName, params);
    return result.allowed;
  }

  // ─────────────────────────────────────────────────────────────
  // Batch Operations
  // ─────────────────────────────────────────────────────────────

  async evaluateBatch(
    agent: Agent,
    operations: Array<{ toolName: string; params: Record<string, unknown> }>
  ): Promise<PolicyEvaluationResult[]> {
    const results: PolicyEvaluationResult[] = [];
    
    for (const op of operations) {
      const result = await this.evaluate(agent, op.toolName, op.params);
      results.push(result);
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────

  getStats(): Record<string, unknown> {
    return {
      totalPolicies: this.policies.size,
      assignedAgents: this.agentPolicies.size,
      strictMode: this.strictMode,
      hasDefaultPolicy: !!this.defaultPolicy,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────

  toJSON(): Record<string, unknown> {
    return {
      policies: Array.from(this.policies.entries()).map(([id, policy]) => ({
        id,
        ...policy.toJSON(),
      })),
      agentPolicies: Object.fromEntries(this.agentPolicies),
      defaultPolicy: this.defaultPolicy?.toJSON(),
      strictMode: this.strictMode,
    };
  }
}

// Global policy engine instance
export const globalPolicyEngine = new PolicyEngine();


