import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import { getInterLock } from '../interlock/index.js';
import type { EcosystemAwarenessResult } from '../types.js';

export const GetEcosystemAwarenessSchema = z.object({
  include_history: z.boolean().optional().default(false),
  history_hours: z.number().optional().default(24)
});

export const GET_ECOSYSTEM_AWARENESS_TOOL = {
  name: 'get_ecosystem_awareness',
  description: 'Get the current state of the entire ecosystem - which servers are active, what is being worked on, pending issues, and overall health. Real-time "state of mind" of the system.',
  inputSchema: {
    type: 'object',
    properties: {
      include_history: {
        type: 'boolean',
        description: 'Include historical snapshots'
      },
      history_hours: {
        type: 'number',
        description: 'How many hours of history to include'
      }
    }
  }
};

export function handleGetEcosystemAwareness(args: unknown): EcosystemAwarenessResult {
  const input = GetEcosystemAwarenessSchema.parse(args);
  const db = getDatabase();
  const interlock = getInterLock();

  // Get peer statuses
  const peers = interlock?.getPeers() || [];
  const activeServers = peers.map(p => ({
    name: p.name,
    status: p.status || 'unknown' as const,
    last_seen: p.lastSeen || 0
  }));

  // Get recent attention to determine current focus
  const recentAttention = db.getAttentionHotspots(Date.now() - 60 * 60 * 1000, 5);
  const primaryFocus = recentAttention.length > 0 ? recentAttention[0].target : null;
  const secondaryFocus = recentAttention.slice(1, 4).map(h => h.target);

  // Get recent patterns
  const patterns = db.getPatterns(undefined, 5);

  // Get operation stats for health
  const stats = db.getOperationStats(Date.now() - 24 * 60 * 60 * 1000);
  const successRate = stats.total > 0
    ? stats.by_outcome.success / stats.total
    : 1;

  // Determine overall health
  const activeCount = activeServers.filter(s => s.status === 'active').length;
  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (activeCount < peers.length * 0.5) {
    overallHealth = 'critical';
  } else if (activeCount < peers.length * 0.8 || successRate < 0.7) {
    overallHealth = 'degraded';
  }

  // Identify pending issues
  const pendingIssues: Array<{ issue: string; severity: 'low' | 'medium' | 'high'; server: string }> = [];

  // Check for inactive servers
  for (const server of activeServers) {
    if (server.status === 'inactive') {
      pendingIssues.push({
        issue: `Server ${server.name} is inactive`,
        severity: 'medium',
        server: server.name
      });
    }
  }

  // Check for failure patterns
  const failurePatterns = patterns.filter(p => p.pattern_type === 'failure');
  for (const pattern of failurePatterns) {
    if (pattern.confidence > 0.5) {
      pendingIssues.push({
        issue: pattern.description,
        severity: pattern.confidence > 0.7 ? 'high' : 'medium',
        server: pattern.related_servers?.[0] || 'unknown'
      });
    }
  }

  const result: EcosystemAwarenessResult = {
    timestamp: new Date().toISOString(),
    active_servers: activeServers,
    current_focus: {
      primary: primaryFocus,
      secondary: secondaryFocus
    },
    pending_issues: pendingIssues,
    recent_patterns: patterns,
    health_summary: {
      overall: overallHealth,
      servers_active: activeCount,
      servers_total: peers.length
    }
  };

  // Include history if requested
  if (input.include_history) {
    const since = Date.now() - input.history_hours * 60 * 60 * 1000;
    result.history = db.getSnapshots(since, Math.min(input.history_hours, 48));
  }

  return result;
}
