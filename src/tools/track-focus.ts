import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { AttentionEvent, EventType } from '../types.js';

export const TrackFocusSchema = z.object({
  event_type: z.enum(['file', 'tool', 'query', 'workflow', 'operation', 'signal']),
  target: z.string().describe('What is being focused on (file path, tool name, query text, etc.)'),
  server_name: z.string().optional().describe('Which server is reporting this focus'),
  context: z.record(z.unknown()).optional().describe('Additional context about the focus'),
  duration_ms: z.number().optional().describe('How long focus was held (for completed events)')
});

export const TRACK_FOCUS_TOOL = {
  name: 'track_focus',
  description: 'Log current focus - what is being worked on. Called by skills/workflows to register attention. Builds attention history for pattern detection.',
  inputSchema: {
    type: 'object',
    properties: {
      event_type: {
        type: 'string',
        enum: ['file', 'tool', 'query', 'workflow', 'operation', 'signal'],
        description: 'Type of focus event'
      },
      target: {
        type: 'string',
        description: 'What is being focused on'
      },
      server_name: {
        type: 'string',
        description: 'Which server is reporting this focus'
      },
      context: {
        type: 'object',
        description: 'Additional context about the focus'
      },
      duration_ms: {
        type: 'number',
        description: 'How long focus was held'
      }
    },
    required: ['event_type', 'target']
  }
};

export function handleTrackFocus(args: unknown): {
  success: boolean;
  event_id: number;
  message: string;
  timestamp: string;
} {
  const input = TrackFocusSchema.parse(args);
  const db = getDatabase();

  const event: AttentionEvent = {
    timestamp: Date.now(),
    server_name: input.server_name || 'unknown',
    event_type: input.event_type as EventType,
    target: input.target,
    context: input.context,
    duration_ms: input.duration_ms
  };

  const eventId = db.insertAttentionEvent(event);

  return {
    success: true,
    event_id: eventId,
    message: `Focus tracked: ${input.event_type} on "${input.target}"`,
    timestamp: new Date().toISOString()
  };
}
