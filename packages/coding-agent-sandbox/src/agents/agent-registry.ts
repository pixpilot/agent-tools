import type { AgentAdapter } from './agent-adapter';
import { ClaudeAgent } from './claude-agent';
import { CodexAgent } from './codex-agent';
import { CopilotAgent } from './copilot-agent';

const REGISTRY: readonly AgentAdapter[] = [
  new ClaudeAgent(),
  new CodexAgent(),
  new CopilotAgent(),
];

/** Every supported coding agent, in menu order. */
export function listAgents(): readonly AgentAdapter[] {
  return REGISTRY;
}

/** Looks up an agent by id, throwing a helpful error for unknown ids. */
export function getAgent(id: string): AgentAdapter {
  const agent = REGISTRY.find((candidate) => candidate.id === id.toLowerCase().trim());

  if (agent == null) {
    const known = REGISTRY.map((candidate) => candidate.id).join(', ');
    throw new Error(`Unknown agent "${id}". Supported agents: ${known}.`);
  }

  return agent;
}
