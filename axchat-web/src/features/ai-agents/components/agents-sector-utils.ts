import type { AiAgent } from '../services/ai-agents.service';
import type { AgentSector } from '../services/agent-sectors.service';

export type SectorFilter = 'all' | 'unassigned' | string;

export function filterAgentsForSectorCards(
  agents: AiAgent[],
  sectors: AgentSector[],
  filter: SectorFilter,
): AiAgent[] {
  if (filter === 'all') return agents;
  if (filter === 'unassigned') {
    return agents.filter(
      (a) => !sectors.some((s) => s.agents.some((l) => l.agent.id === a.id)),
    );
  }
  const sector = sectors.find((s) => s.id === filter);
  if (!sector) return agents;
  return agents.filter((a) =>
    sector.agents.some((link) => link.agent.id === a.id),
  );
}

/** Inclui ancestrais na hierarquia para o organograma fazer sentido. */
export function filterAgentsForOrganogram(
  agents: AiAgent[],
  sectors: AgentSector[],
  filter: SectorFilter,
): AiAgent[] {
  if (filter === 'all') return agents;

  if (filter === 'unassigned') {
    return agents.filter(
      (a) => !sectors.some((s) => s.agents.some((l) => l.agent.id === a.id)),
    );
  }

  const sector = sectors.find((s) => s.id === filter);
  if (!sector) return agents;

  const byId = new Map(agents.map((a) => [a.id, a]));
  const ids = new Set<string>();

  for (const link of sector.agents) {
    let current = byId.get(link.agent.id);
    while (current) {
      ids.add(current.id);
      current = current.parentAgentId
        ? byId.get(current.parentAgentId)
        : undefined;
    }
  }

  return agents.filter((a) => ids.has(a.id));
}
