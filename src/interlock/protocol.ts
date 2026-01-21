/**
 * InterLock Protocol - Official BaNano Binary Format
 *
 * 12-byte header:
 * Bytes 0-1:   Signal Type (uint16, big-endian)
 * Bytes 2-3:   Protocol Version (uint16, big-endian)
 * Bytes 4-7:   Payload Length (uint32, big-endian)
 * Bytes 8-11:  Timestamp (uint32, Unix seconds)
 * Bytes 12+:   Payload (JSON, UTF-8)
 */

// Protocol version 1.0
const PROTOCOL_VERSION = 0x0100;

export interface Signal {
  signalType: number;
  version: number;
  timestamp: number;
  payload: {
    sender: string;
    [key: string]: unknown;
  };
}

export const SignalTypes = {
  // Core signals
  DOCK_REQUEST: 0x01,
  DOCK_APPROVED: 0x02,
  DOCK_REJECTED: 0x03,
  HEARTBEAT: 0x04,
  UNDOCK: 0x05,

  // File signals
  FILE_DISCOVERED: 0x10,
  FILE_INDEXED: 0x11,
  FILE_MODIFIED: 0x12,
  FILE_DELETED: 0x13,

  // Validation signals
  VALIDATION_REQUEST: 0x20,
  VALIDATION_APPROVED: 0x21,
  VALIDATION_REJECTED: 0x22,

  // Search signals (EntroSpect)
  SEARCH_STARTED: 0x30,
  SEARCH_COMPLETED: 0x31,
  SEARCH_RESULT: 0x32,
  INDEX_UPDATED: 0x33,

  // Classification signals (Catasorter)
  CLASSIFICATION_REQUEST: 0x40,
  CLASSIFICATION_RESULT: 0x41,
  CLASSIFICATION_BATCH: 0x42,

  // Snapshot signals
  SNAPSHOT_CREATED: 0x50,
  SNAPSHOT_RESTORED: 0x51,
  SNAPSHOT_DELETED: 0x52,

  // Coordination signals (Trinity)
  HANDOFF_REQUEST: 0x60,
  HANDOFF_APPROVED: 0x61,
  HANDOFF_COMPLETED: 0x62,
  MODE_SWITCH: 0x63,

  // Build signals (Neurogenesis)
  BUILD_STARTED: 0x70,
  BUILD_COMPLETED: 0x71,
  BUILD_FAILED: 0x72,

  // Dedup signals (BBB)
  DUPLICATE_FOUND: 0x80,
  DEDUP_COMPLETED: 0x81,
  SIMILARITY_RESULT: 0x82,

  // Verification signals
  VERIFICATION_STARTED: 0x90,
  VERIFICATION_RESULT: 0x91,
  CLAIM_EXTRACTED: 0x92,

  // Configuration signals (Project-Context)
  CONFIG_CHANGED: 0xA0,
  CONFIG_LOADED: 0xA1,
  CONFIG_ERROR: 0xA2,

  // Knowledge signals (Knowledge-Curator)
  KNOWLEDGE_COMPRESSED: 0xB0,
  KNOWLEDGE_EXPANDED: 0xB1,
  KNOWLEDGE_LINKED: 0xB2,

  // Routing signals (Intelligent-Router)
  ROUTE_SELECTED: 0xC0,
  ROUTE_FAILED: 0xC1,
  ROUTE_OPTIMIZED: 0xC2,

  // Rebuild signals (PK-Manager)
  REBUILD_STARTED: 0xD0,
  REBUILD_COMPLETED: 0xD1,
  REBUILD_FAILED: 0xD2,

  // Consciousness signals (emitted by this server)
  AWARENESS_UPDATE: 0xE0,
  PATTERN_DETECTED: 0xE1,
  BLIND_SPOT_ALERT: 0xE2,
  REASONING_CONCERN: 0xE3,
  ATTENTION_SHIFT: 0xE4,
  LESSON_LEARNED: 0xE5,

  // AstroSentry signals (received from HTTP→Cognitive bridge)
  ASTROSENTRY_EVENT: 0xE6,
  COGNITIVE_INSIGHT: 0xE7,  // Cognitive → AstroSentry

  // Error/System signals
  ERROR: 0xF0,
  SHUTDOWN: 0xFF
} as const;

export type SignalTypeName = keyof typeof SignalTypes;

// Signal name mappings
const SIGNAL_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(SignalTypes).map(([name, value]) => [value, name])
);

/**
 * Get signal name from type code
 */
export function getSignalName(signalType: number): string {
  return SIGNAL_NAMES[signalType] || `UNKNOWN_0x${signalType.toString(16).toUpperCase()}`;
}

/**
 * Encode a signal to BaNano binary format
 */
export function encode(signalType: number, sender: string, data?: Record<string, unknown>): Buffer {
  const payload = JSON.stringify({ sender, ...data });
  const payloadBuffer = Buffer.from(payload, 'utf8');

  const header = Buffer.alloc(12);
  header.writeUInt16BE(signalType, 0);
  header.writeUInt16BE(PROTOCOL_VERSION, 2);
  header.writeUInt32BE(payloadBuffer.length, 4);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);

  return Buffer.concat([header, payloadBuffer]);
}

/**
 * Map string signal type to numeric code
 */
function mapStringToSignalType(typeStr: string): number {
  const mapping: Record<string, number> = {
    // Core signals
    'HEARTBEAT': 0x04,
    'DOCK_REQUEST': 0x01,
    'DOCK_APPROVED': 0x02,
    'DOCK_REJECTED': 0x03,
    'UNDOCK': 0x05,
    'SHUTDOWN': 0xFF,
    'ERROR': 0xF0,
    // File signals
    'FILE_DISCOVERED': 0x10,
    'FILE_INDEXED': 0x11,
    // Add more as needed
  };
  return mapping[typeStr.toUpperCase()] || 0x00;
}

/**
 * Decode binary BaNano format (12-byte header + JSON)
 */
function decodeBinary(buffer: Buffer): Signal | null {
  try {
    const signalType = buffer.readUInt16BE(0);
    const version = buffer.readUInt16BE(2);
    const payloadLength = buffer.readUInt32BE(4);
    const timestamp = buffer.readUInt32BE(8);

    // Validate: signal type should be in valid range and payload length reasonable
    if (signalType === 0 || signalType > 0xFF) {
      return null;
    }
    if (payloadLength > buffer.length - 12) {
      return null;
    }

    // Parse JSON payload
    const payloadStr = buffer.slice(12, 12 + payloadLength).toString('utf8');
    const payload = JSON.parse(payloadStr);

    // Ensure payload has sender (servers may send serverId instead)
    if (!payload.sender) {
      payload.sender = payload.serverId || payload.source || 'unknown';
    }

    return {
      signalType,
      version,
      timestamp,
      payload,
    };
  } catch {
    return null;
  }
}

/**
 * Decode text-based formats:
 * - Format A: {t, s, d, ts} (consolidation-engine, intake-guardian, safe-batch-processor)
 * - Format B: {type, source, payload, timestamp, nonce} (filesystem-guardian)
 */
function decodeText(buffer: Buffer): Signal | null {
  try {
    const str = buffer.toString('utf-8');

    // Must start with { to be JSON
    if (!str.startsWith('{')) {
      return null;
    }

    const json = JSON.parse(str);

    // Format A: {t, s, d, ts}
    if ('t' in json && 's' in json) {
      return {
        signalType: typeof json.t === 'number' ? json.t : mapStringToSignalType(String(json.t)),
        version: PROTOCOL_VERSION,
        timestamp: Math.floor((json.ts || Date.now()) / 1000),
        payload: {
          sender: json.s,
          ...(typeof json.d === 'object' && json.d !== null ? json.d : { data: json.d })
        }
      };
    }

    // Format B: {type, source, payload, timestamp, nonce}
    if ('type' in json && 'source' in json) {
      return {
        signalType: typeof json.type === 'number' ? json.type : mapStringToSignalType(String(json.type)),
        version: PROTOCOL_VERSION,
        timestamp: Math.floor((json.timestamp || Date.now()) / 1000),
        payload: {
          sender: json.source,
          ...(typeof json.payload === 'object' && json.payload !== null ? json.payload : {})
        }
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Decode a buffer to Signal - supports multiple formats
 * Tries binary format first, falls back to text formats
 * Returns null if buffer is invalid
 */
export function decode(buffer: Buffer): Signal | null {
  if (!buffer || buffer.length < 2) {
    return null;
  }

  // Try binary format first (12-byte header)
  if (buffer.length >= 12) {
    const binaryResult = decodeBinary(buffer);
    if (binaryResult) return binaryResult;
  }

  // Fall back to text formats
  const textResult = decodeText(buffer);
  if (textResult) return textResult;

  return null;
}

/**
 * Check if a signal type is valid (known)
 */
export function isValidSignal(signalType: number): boolean {
  return signalType in SIGNAL_NAMES;
}

/**
 * Create a Signal object for emitting
 */
export function createSignal(
  signalType: number,
  sender: string,
  data?: Record<string, unknown>
): Signal {
  return {
    signalType,
    version: PROTOCOL_VERSION,
    timestamp: Math.floor(Date.now() / 1000),
    payload: {
      sender,
      ...data,
    },
  };
}

// Legacy class wrapper for backwards compatibility during transition
export class BaNanoProtocol {
  static readonly HEADER_SIZE = 12;
  static readonly VERSION_MAJOR = 1;
  static readonly VERSION_MINOR = 0;

  static encode(signal: Signal): Buffer {
    const { sender, ...data } = signal.payload;
    return encode(signal.signalType, sender, data);
  }

  static decode(buffer: Buffer): Signal {
    if (!buffer || buffer.length < BaNanoProtocol.HEADER_SIZE) {
      throw new Error('Buffer too small for BaNano header');
    }
    const payloadLength = buffer.readUInt32BE(4);
    if (buffer.length < BaNanoProtocol.HEADER_SIZE + payloadLength) {
      throw new Error('Incomplete payload');
    }
    const result = decode(buffer);
    if (!result) {
      throw new Error('Invalid signal format');
    }
    return result;
  }

  static createSignal(signalType: number, sender: string, data?: Record<string, unknown>): Signal {
    return createSignal(signalType, sender, data);
  }
}

export default BaNanoProtocol;
