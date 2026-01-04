import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { AttentionPatternsResult } from '../types.js';

export const GetAttentionPatternsSchema = z.object({
  time_range: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
  server_filter: z.string().optional().describe('Filter by specific server'),
  pattern_type: z.enum(['hotspots', 'trends', 'anomalies', 'all']).optional().default('all'),
  limit: z.number().optional().default(20)
});

export const GET_ATTENTION_PATTERNS_TOOL = {
  name: 'get_attention_patterns',
  description: 'Analyze what has been accessed repeatedly. Returns hotspots (frequently accessed), trends (increasing/decreasing attention), and anomalies (unusual patterns).',
  inputSchema: {
    type: 'object',
    properties: {
      time_range: {
        type: 'string',
        enum: ['1h', '6h', '24h', '7d', '30d'],
        description: 'Time range to analyze'
      },
      server_filter: {
        type: 'string',
        description: 'Filter by specific server'
      },
      pattern_type: {
        type: 'string',
        enum: ['hotspots', 'trends', 'anomalies', 'all'],
        description: 'Type of pattern to return'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return'
      }
    }
  }
};

const TIME_RANGES: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

export function handleGetAttentionPatterns(args: unknown): AttentionPatternsResult {
  const input = GetAttentionPatternsSchema.parse(args);
  const db = getDatabase();

  const since = Date.now() - TIME_RANGES[input.time_range];
  const hotspots = db.getAttentionHotspots(since, input.limit);

  // Filter by server if specified
  const filteredHotspots = input.server_filter
    ? hotspots.filter(h => h.servers.includes(input.server_filter!))
    : hotspots;

  // Calculate trends by comparing first half vs second half
  const midpoint = since + (Date.now() - since) / 2;
  const firstHalf = db.getAttentionHotspots(since, 100);
  const secondHalf = db.getAttentionHotspots(midpoint, 100);

  const trends = calculateTrends(firstHalf, secondHalf);
  const anomalies = detectAnomalies(filteredHotspots);

  // Get total events
  const allEvents = db.getAttentionEvents(since, 10000);

  const result: AttentionPatternsResult = {
    hotspots: input.pattern_type === 'all' || input.pattern_type === 'hotspots'
      ? filteredHotspots
      : [],
    trends: input.pattern_type === 'all' || input.pattern_type === 'trends'
      ? trends.slice(0, input.limit)
      : [],
    anomalies: input.pattern_type === 'all' || input.pattern_type === 'anomalies'
      ? anomalies.slice(0, input.limit)
      : [],
    summary: {
      total_events: allEvents.length,
      unique_targets: new Set(allEvents.map(e => e.target)).size,
      time_range: input.time_range
    }
  };

  return result;
}

function calculateTrends(
  firstHalf: Array<{ target: string; count: number }>,
  secondHalf: Array<{ target: string; count: number }>
): Array<{ direction: 'increasing' | 'decreasing' | 'stable'; target: string; change_percent: number }> {
  const trends: Array<{ direction: 'increasing' | 'decreasing' | 'stable'; target: string; change_percent: number }> = [];

  const firstMap = new Map(firstHalf.map(h => [h.target, h.count]));
  const secondMap = new Map(secondHalf.map(h => [h.target, h.count]));

  const allTargets = new Set([...firstMap.keys(), ...secondMap.keys()]);

  for (const target of allTargets) {
    const first = firstMap.get(target) || 0;
    const second = secondMap.get(target) || 0;

    if (first === 0 && second === 0) continue;

    const changePercent = first === 0
      ? 100
      : ((second - first) / first) * 100;

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(changePercent) < 10) {
      direction = 'stable';
    } else if (changePercent > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    trends.push({
      direction,
      target,
      change_percent: Math.round(changePercent)
    });
  }

  // Sort by absolute change
  return trends.sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent));
}

function detectAnomalies(
  hotspots: Array<{ target: string; count: number; event_type: string; servers: string[] }>
): Array<{ target: string; reason: string; severity: 'low' | 'medium' | 'high' }> {
  const anomalies: Array<{ target: string; reason: string; severity: 'low' | 'medium' | 'high' }> = [];

  if (hotspots.length === 0) return anomalies;

  // Calculate average and std dev
  const counts = hotspots.map(h => h.count);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  for (const hotspot of hotspots) {
    // Detect unusually high access
    if (hotspot.count > avg + 2 * stdDev) {
      anomalies.push({
        target: hotspot.target,
        reason: `Unusually high access (${hotspot.count} vs avg ${Math.round(avg)})`,
        severity: hotspot.count > avg + 3 * stdDev ? 'high' : 'medium'
      });
    }

    // Detect multiple servers accessing same target
    if (hotspot.servers.length > 3) {
      anomalies.push({
        target: hotspot.target,
        reason: `Accessed by ${hotspot.servers.length} different servers`,
        severity: 'medium'
      });
    }
  }

  return anomalies;
}
