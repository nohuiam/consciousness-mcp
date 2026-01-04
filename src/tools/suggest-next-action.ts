import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { SuggestionResult } from '../types.js';

export const SuggestNextActionSchema = z.object({
  current_context: z.object({
    active_task: z.string().optional(),
    recent_operations: z.array(z.string()).optional(),
    current_server: z.string().optional(),
    blockers: z.array(z.string()).optional()
  }).describe('Current working context'),
  goals: z.array(z.string()).describe('What you are trying to achieve'),
  constraints: z.array(z.string()).optional().describe('Any constraints to consider')
});

export const SUGGEST_NEXT_ACTION_TOOL = {
  name: 'suggest_next_action',
  description: 'Based on current state, historical patterns, and goals, recommend the best next steps. Avoids past pitfalls and leverages past successes.',
  inputSchema: {
    type: 'object',
    properties: {
      current_context: {
        type: 'object',
        properties: {
          active_task: { type: 'string' },
          recent_operations: { type: 'array', items: { type: 'string' } },
          current_server: { type: 'string' },
          blockers: { type: 'array', items: { type: 'string' } }
        },
        description: 'Current working context'
      },
      goals: {
        type: 'array',
        items: { type: 'string' },
        description: 'What you are trying to achieve'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any constraints to consider'
      }
    },
    required: ['current_context', 'goals']
  }
};

export function handleSuggestNextAction(args: unknown): SuggestionResult {
  const input = SuggestNextActionSchema.parse(args);
  const db = getDatabase();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const suggestions: Array<{
    action: string;
    rationale: string;
    confidence: number;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  const warnings: string[] = [];
  const opportunities: string[] = [];

  // Get relevant patterns
  const patterns = db.getPatterns(undefined, 50);
  const failurePatterns = patterns.filter(p => p.pattern_type === 'failure');
  const successPatterns = patterns.filter(p => p.pattern_type === 'success');

  // Get recent operations for context
  const recentOps = db.getOperations(since, 100);
  const recentSuccesses = recentOps.filter(o => o.outcome === 'success');
  const recentFailures = recentOps.filter(o => o.outcome === 'failure');

  // Analyze goals
  for (const goal of input.goals) {
    const goalLower = goal.toLowerCase();

    // Find similar past operations
    const similarOps = recentOps.filter(o =>
      o.input_summary.toLowerCase().includes(goalLower.substring(0, 20)) ||
      goalLower.includes(o.operation_type)
    );

    if (similarOps.length > 0) {
      const successRate = similarOps.filter(o => o.outcome === 'success').length / similarOps.length;
      if (successRate > 0.7) {
        opportunities.push(`Goal "${goal.substring(0, 30)}..." has high historical success rate`);
      } else if (successRate < 0.3) {
        warnings.push(`Goal "${goal.substring(0, 30)}..." has low historical success rate`);
      }
    }

    // Check for matching failure patterns
    for (const pattern of failurePatterns) {
      if (goalLower.includes(pattern.description.toLowerCase().substring(0, 15))) {
        warnings.push(`Goal may trigger known failure pattern: ${pattern.description.substring(0, 50)}`);
        if (pattern.recommendations) {
          const recs = Array.isArray(pattern.recommendations)
            ? pattern.recommendations
            : [pattern.recommendations];
          for (const rec of recs.slice(0, 2)) {
            suggestions.push({
              action: typeof rec === 'string' ? rec : String(rec),
              rationale: 'Avoid known failure pattern',
              confidence: pattern.confidence,
              priority: 'high'
            });
          }
        }
      }
    }

    // Check for matching success patterns
    for (const pattern of successPatterns) {
      if (goalLower.includes(pattern.description.toLowerCase().substring(0, 15))) {
        opportunities.push(`Goal matches success pattern: ${pattern.description.substring(0, 50)}`);
      }
    }
  }

  // Handle blockers
  if (input.current_context.blockers && input.current_context.blockers.length > 0) {
    for (const blocker of input.current_context.blockers) {
      suggestions.push({
        action: `Address blocker: ${blocker}`,
        rationale: 'Blockers should be resolved before proceeding',
        confidence: 0.9,
        priority: 'high'
      });
    }
  }

  // Suggest based on current server
  if (input.current_context.current_server) {
    const serverOps = recentOps.filter(o => o.server_name === input.current_context.current_server);
    const serverSuccessRate = serverOps.length > 0
      ? serverOps.filter(o => o.outcome === 'success').length / serverOps.length
      : 0.5;

    if (serverSuccessRate < 0.5 && serverOps.length > 5) {
      warnings.push(`Current server ${input.current_context.current_server} has low success rate`);
      suggestions.push({
        action: 'Consider using a different server for this task',
        rationale: `${input.current_context.current_server} has ${Math.round(serverSuccessRate * 100)}% success rate`,
        confidence: 0.7,
        priority: 'medium'
      });
    }
  }

  // Generate goal-based suggestions
  for (const goal of input.goals) {
    if (goal.toLowerCase().includes('build')) {
      suggestions.push({
        action: 'Use predict_outcome before starting build',
        rationale: 'Prediction helps estimate complexity and identify risks',
        confidence: 0.8,
        priority: 'medium'
      });
    }

    if (goal.toLowerCase().includes('fix') || goal.toLowerCase().includes('debug')) {
      suggestions.push({
        action: 'Check analyze_pattern for similar past fixes',
        rationale: 'Past fixes may provide solution hints',
        confidence: 0.75,
        priority: 'medium'
      });
    }

    if (goal.toLowerCase().includes('research') || goal.toLowerCase().includes('find')) {
      suggestions.push({
        action: 'Use synthesize_context to integrate findings',
        rationale: 'Synthesis prevents information fragmentation',
        confidence: 0.7,
        priority: 'low'
      });
    }
  }

  // Handle constraints
  if (input.constraints) {
    for (const constraint of input.constraints) {
      if (constraint.toLowerCase().includes('time') || constraint.toLowerCase().includes('fast')) {
        suggestions.push({
          action: 'Prioritize quick-win operations first',
          rationale: 'Time constraint requires efficient approach',
          confidence: 0.8,
          priority: 'high'
        });
      }

      if (constraint.toLowerCase().includes('safe') || constraint.toLowerCase().includes('careful')) {
        suggestions.push({
          action: 'Use audit_reasoning before major decisions',
          rationale: 'Safety constraint requires verification',
          confidence: 0.85,
          priority: 'high'
        });
      }
    }
  }

  // Add default suggestions if none generated
  if (suggestions.length === 0) {
    suggestions.push({
      action: 'Review ecosystem awareness for context',
      rationale: 'Understanding current state helps planning',
      confidence: 0.6,
      priority: 'low'
    });
  }

  // Sort by priority and confidence
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  // Limit suggestions
  const topSuggestions = suggestions.slice(0, 5);

  // Calculate overall confidence
  const avgConfidence = topSuggestions.reduce((s, x) => s + x.confidence, 0) / (topSuggestions.length || 1);

  return {
    suggested_actions: topSuggestions,
    warnings,
    opportunities,
    context_summary: {
      goals_analyzed: input.goals.length,
      patterns_matched: failurePatterns.length + successPatterns.length,
      historical_operations: recentOps.length
    },
    confidence: Math.round(avgConfidence * 100) / 100
  };
}
