import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import { getInterLock } from '../interlock/index.js';
import type { BlindSpotResult, EventType, OperationType, PatternType } from '../types.js';

export const IdentifyBlindSpotsSchema = z.object({
  scope: z.enum(['attention', 'servers', 'operations', 'patterns', 'all']).optional().default('all'),
  time_range: z.enum(['24h', '7d', '30d']).optional().default('7d'),
  context: z.record(z.unknown()).optional()
});

export const IDENTIFY_BLIND_SPOTS_TOOL = {
  name: 'identify_blind_spots',
  description: 'Discover what is NOT being attended to that should be. Cross-references ecosystem capabilities with actual usage to find overlooked areas, underutilized servers, and neglected patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['attention', 'servers', 'operations', 'patterns', 'all'],
        description: 'What area to analyze for blind spots'
      },
      time_range: {
        type: 'string',
        enum: ['24h', '7d', '30d'],
        description: 'Time range to analyze'
      },
      context: { type: 'object', description: 'Additional context' }
    }
  }
};

const TIME_RANGES: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

// Known ecosystem servers - should match interlock config
const ECOSYSTEM_SERVERS = [
  'context-guardian', 'quartermaster', 'snapshot', 'toolee', 'catasorter',
  'looker', 'smart-file-organizer', 'bonzai-bloat-buster', 'enterspect',
  'neurogenesis-engine', 'chronos-synapse', 'trinity-coordinator',
  'niws-server', 'project-context', 'knowledge-curator', 'pk-manager',
  'research-bus', 'intelligent-router', 'verifier-mcp', 'safe-batch-processor',
  'intake-guardian', 'health-monitor', 'synapse-relay', 'filesystem-guardian',
  'consolidation-engine', 'consciousness-mcp'
];

// Expected operation types for a healthy ecosystem
const EXPECTED_OPERATION_TYPES: OperationType[] = [
  'build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate'
];

export function handleIdentifyBlindSpots(args: unknown): BlindSpotResult {
  const input = IdentifyBlindSpotsSchema.parse(args);
  const db = getDatabase();
  const interlock = getInterLock();
  const since = Date.now() - TIME_RANGES[input.time_range];

  const blindSpots: Array<{
    area: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    recommendation: string;
  }> = [];

  const coverage: Record<string, number> = {};
  const suggestions: string[] = [];

  // Analyze attention blind spots
  if (input.scope === 'attention' || input.scope === 'all') {
    const attentionEvents = db.getAttentionEvents(since, 1000);
    const hotspots = db.getAttentionHotspots(since, 100);

    // Check for event type coverage
    const eventTypes = new Set(attentionEvents.map(e => e.event_type));
    const expectedEventTypes: EventType[] = ['file', 'tool', 'query', 'workflow', 'signal'];

    for (const expected of expectedEventTypes) {
      if (!eventTypes.has(expected)) {
        blindSpots.push({
          area: 'attention',
          description: `No "${expected}" type attention events recorded`,
          severity: 'medium',
          recommendation: `Start tracking ${expected} events for better awareness`
        });
      }
    }

    // Check for attention concentration
    if (hotspots.length > 0) {
      const topHotspot = hotspots[0];
      const totalCount = hotspots.reduce((s, h) => s + h.count, 0);
      if (topHotspot.count / totalCount > 0.5) {
        blindSpots.push({
          area: 'attention',
          description: `Attention heavily concentrated on "${topHotspot.target}"`,
          severity: 'low',
          recommendation: 'Consider diversifying attention across more areas'
        });
      }
    }

    coverage['attention'] = Math.min(1, eventTypes.size / expectedEventTypes.length);
  }

  // Analyze server blind spots
  if (input.scope === 'servers' || input.scope === 'all') {
    const operations = db.getOperations(since, 1000);
    const activeServers = new Set(operations.map(o => o.server_name));

    // Check for peers from InterLock
    const peers = interlock?.getPeers() || [];
    const peerNames = new Set(peers.map(p => p.name));

    // Find servers that exist but haven't been used
    for (const server of ECOSYSTEM_SERVERS) {
      if (!activeServers.has(server)) {
        const inPeers = peerNames.has(server);
        blindSpots.push({
          area: 'servers',
          description: `Server "${server}" has not been used in ${input.time_range}`,
          severity: inPeers ? 'medium' : 'low',
          recommendation: inPeers
            ? `Consider leveraging ${server} capabilities`
            : `Server ${server} may need to be started`
        });
      }
    }

    // Check for inactive peers
    for (const peer of peers) {
      if (peer.status === 'inactive' || peer.status === 'unknown') {
        blindSpots.push({
          area: 'servers',
          description: `Server "${peer.name}" is ${peer.status}`,
          severity: 'high',
          recommendation: `Check ${peer.name} health and restart if needed`
        });
      }
    }

    coverage['servers'] = activeServers.size / ECOSYSTEM_SERVERS.length;
  }

  // Analyze operation blind spots
  if (input.scope === 'operations' || input.scope === 'all') {
    const operations = db.getOperations(since, 1000);
    const operationTypes = new Set(operations.map(o => o.operation_type));

    // Find missing operation types
    for (const expected of EXPECTED_OPERATION_TYPES) {
      if (!operationTypes.has(expected)) {
        blindSpots.push({
          area: 'operations',
          description: `No "${expected}" operations recorded in ${input.time_range}`,
          severity: 'low',
          recommendation: `May need to perform ${expected} operations for balance`
        });
      }
    }

    // Check for operation type imbalance
    const typeCounts: Record<string, number> = {};
    operations.forEach(o => {
      typeCounts[o.operation_type] = (typeCounts[o.operation_type] || 0) + 1;
    });

    const totalOps = operations.length;
    for (const [type, count] of Object.entries(typeCounts)) {
      const ratio = count / totalOps;
      if (ratio > 0.5 && totalOps > 10) {
        blindSpots.push({
          area: 'operations',
          description: `Operations heavily skewed toward "${type}" (${Math.round(ratio * 100)}%)`,
          severity: 'low',
          recommendation: 'Consider if other operation types are being neglected'
        });
      }
    }

    // Check for verification coverage
    const hasVerify = operationTypes.has('verify');
    const hasBuild = operationTypes.has('build') || operationTypes.has('generate');
    if (hasBuild && !hasVerify) {
      blindSpots.push({
        area: 'operations',
        description: 'Build/generate operations without verification',
        severity: 'medium',
        recommendation: 'Add verification steps to build workflows'
      });
    }

    coverage['operations'] = operationTypes.size / EXPECTED_OPERATION_TYPES.length;
  }

  // Analyze pattern blind spots
  if (input.scope === 'patterns' || input.scope === 'all') {
    const patterns = db.getPatterns(undefined, 100);
    const patternTypes = new Set(patterns.map(p => p.pattern_type));

    // Check for pattern type coverage
    const expectedPatternTypes: PatternType[] = ['success', 'failure', 'recurring', 'bottleneck'];
    for (const expected of expectedPatternTypes) {
      if (!patternTypes.has(expected)) {
        blindSpots.push({
          area: 'patterns',
          description: `No "${expected}" patterns identified`,
          severity: expected === 'failure' ? 'medium' : 'low',
          recommendation: `Actively look for ${expected} patterns in operations`
        });
      }
    }

    // Check for stale patterns
    const now = Date.now();
    const stalePatterns = patterns.filter(p =>
      p.last_seen && (now - p.last_seen) > 30 * 24 * 60 * 60 * 1000
    );

    if (stalePatterns.length > patterns.length * 0.5) {
      blindSpots.push({
        area: 'patterns',
        description: 'Many patterns are stale (not seen in 30+ days)',
        severity: 'low',
        recommendation: 'Review and update pattern database'
      });
    }

    coverage['patterns'] = patternTypes.size / expectedPatternTypes.length;
  }

  // Generate overall suggestions
  const highSeverityCount = blindSpots.filter(b => b.severity === 'high').length;
  const mediumSeverityCount = blindSpots.filter(b => b.severity === 'medium').length;

  if (highSeverityCount > 0) {
    suggestions.push(`Address ${highSeverityCount} high-severity blind spots immediately`);
  }

  if (mediumSeverityCount > 3) {
    suggestions.push('Multiple medium-severity blind spots suggest systemic gap');
  }

  const avgCoverage = Object.values(coverage).reduce((s, v) => s + v, 0) / (Object.keys(coverage).length || 1);
  if (avgCoverage < 0.5) {
    suggestions.push('Overall ecosystem coverage is low - expand monitoring');
  }

  if (blindSpots.length === 0) {
    suggestions.push('No significant blind spots detected - ecosystem awareness is good');
  }

  return {
    blind_spots: blindSpots,
    coverage_analysis: coverage,
    suggestions,
    analysis_scope: input.scope,
    time_range: input.time_range
  };
}
