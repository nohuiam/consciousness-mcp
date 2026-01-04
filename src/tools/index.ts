// Attention & Awareness Tools
import { TRACK_FOCUS_TOOL, handleTrackFocus } from './track-focus.js';
import { GET_ATTENTION_PATTERNS_TOOL, handleGetAttentionPatterns } from './get-attention-patterns.js';
import { IDENTIFY_BLIND_SPOTS_TOOL, handleIdentifyBlindSpots } from './identify-blind-spots.js';

// Reflection & Analysis Tools
import { REFLECT_ON_OPERATION_TOOL, handleReflectOnOperation } from './reflect-on-operation.js';
import { ANALYZE_PATTERN_TOOL, handleAnalyzePattern } from './analyze-pattern.js';
import { AUDIT_REASONING_TOOL, handleAuditReasoning } from './audit-reasoning.js';
import { PREDICT_OUTCOME_TOOL, handlePredictOutcome } from './predict-outcome.js';

// Synthesis & Guidance Tools
import { SYNTHESIZE_CONTEXT_TOOL, handleSynthesizeContext } from './synthesize-context.js';
import { SUGGEST_NEXT_ACTION_TOOL, handleSuggestNextAction } from './suggest-next-action.js';
import { GET_ECOSYSTEM_AWARENESS_TOOL, handleGetEcosystemAwareness } from './get-ecosystem-awareness.js';

// Re-export schemas
export { TrackFocusSchema } from './track-focus.js';
export { GetAttentionPatternsSchema } from './get-attention-patterns.js';
export { IdentifyBlindSpotsSchema } from './identify-blind-spots.js';
export { ReflectOnOperationSchema } from './reflect-on-operation.js';
export { AnalyzePatternSchema } from './analyze-pattern.js';
export { AuditReasoningSchema } from './audit-reasoning.js';
export { PredictOutcomeSchema } from './predict-outcome.js';
export { SynthesizeContextSchema } from './synthesize-context.js';
export { SuggestNextActionSchema } from './suggest-next-action.js';
export { GetEcosystemAwarenessSchema } from './get-ecosystem-awareness.js';

// Re-export handlers
export {
  handleTrackFocus,
  handleGetAttentionPatterns,
  handleIdentifyBlindSpots,
  handleReflectOnOperation,
  handleAnalyzePattern,
  handleAuditReasoning,
  handlePredictOutcome,
  handleSynthesizeContext,
  handleSuggestNextAction,
  handleGetEcosystemAwareness
};

// All tool definitions for MCP registration
export const ALL_TOOLS = [
  // Attention & Awareness
  TRACK_FOCUS_TOOL,
  GET_ATTENTION_PATTERNS_TOOL,
  IDENTIFY_BLIND_SPOTS_TOOL,
  // Reflection & Analysis
  REFLECT_ON_OPERATION_TOOL,
  ANALYZE_PATTERN_TOOL,
  AUDIT_REASONING_TOOL,
  PREDICT_OUTCOME_TOOL,
  // Synthesis & Guidance
  SYNTHESIZE_CONTEXT_TOOL,
  SUGGEST_NEXT_ACTION_TOOL,
  GET_ECOSYSTEM_AWARENESS_TOOL
];

// Tool handler map
export const TOOL_HANDLERS: Record<string, (args: unknown) => unknown> = {
  track_focus: handleTrackFocus,
  get_attention_patterns: handleGetAttentionPatterns,
  identify_blind_spots: handleIdentifyBlindSpots,
  reflect_on_operation: handleReflectOnOperation,
  analyze_pattern: handleAnalyzePattern,
  audit_reasoning: handleAuditReasoning,
  predict_outcome: handlePredictOutcome,
  synthesize_context: handleSynthesizeContext,
  suggest_next_action: handleSuggestNextAction,
  get_ecosystem_awareness: handleGetEcosystemAwareness
};
