import type { Signal } from '../types.js';

/**
 * BaNano Protocol - 12-byte header + JSON payload
 *
 * Header:
 * ┌─────────┬─────────┬─────────┬─────────────┬─────────────┐
 * │  Type   │ Ver Maj │ Ver Min │ Payload Len │  Timestamp  │
 * │ 1 byte  │ 1 byte  │ 1 byte  │   4 bytes   │   4 bytes   │
 * └─────────┴─────────┴─────────┴─────────────┴─────────────┘
 * + JSON payload (UTF-8)
 */

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

  // Error/System signals
  ERROR: 0xF0,
  SHUTDOWN: 0xFF
} as const;

export type SignalTypeName = keyof typeof SignalTypes;

export function getSignalName(type: number): string {
  for (const [name, value] of Object.entries(SignalTypes)) {
    if (value === type) return name;
  }
  return `UNKNOWN_0x${type.toString(16).padStart(2, '0')}`;
}

export class BaNanoProtocol {
  static readonly HEADER_SIZE = 12;
  static readonly VERSION_MAJOR = 1;
  static readonly VERSION_MINOR = 0;

  /**
   * Encode a signal into a buffer
   */
  static encode(signal: Signal): Buffer {
    const json = JSON.stringify(signal.data || {});
    const payload = Buffer.from(json, 'utf8');
    const header = Buffer.alloc(this.HEADER_SIZE);

    header.writeUInt8(signal.type, 0);
    header.writeUInt8(this.VERSION_MAJOR, 1);
    header.writeUInt8(this.VERSION_MINOR, 2);
    // Byte 3 is reserved
    header.writeUInt32BE(payload.length, 4);
    header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);

    return Buffer.concat([header, payload]);
  }

  /**
   * Decode a buffer into a signal
   */
  static decode(buffer: Buffer): Signal {
    if (buffer.length < this.HEADER_SIZE) {
      throw new Error(`Buffer too small: ${buffer.length} < ${this.HEADER_SIZE}`);
    }

    const type = buffer.readUInt8(0);
    const versionMajor = buffer.readUInt8(1);
    const versionMinor = buffer.readUInt8(2);
    const payloadLength = buffer.readUInt32BE(4);
    const timestamp = buffer.readUInt32BE(8);

    if (buffer.length < this.HEADER_SIZE + payloadLength) {
      throw new Error(`Incomplete payload: expected ${payloadLength}, got ${buffer.length - this.HEADER_SIZE}`);
    }

    const payloadBuffer = buffer.slice(this.HEADER_SIZE, this.HEADER_SIZE + payloadLength);
    let data: Record<string, unknown> = {};

    try {
      const jsonStr = payloadBuffer.toString('utf8');
      if (jsonStr.trim()) {
        data = JSON.parse(jsonStr);
      }
    } catch {
      // Empty or invalid JSON - use empty object
    }

    // Extract sender from data if present
    const sender = (data.sender || data.serverId || data.server_id || 'unknown') as string;

    return {
      type,
      version: `${versionMajor}.${versionMinor}`,
      sender,
      data,
      timestamp: timestamp * 1000 // Convert to milliseconds
    };
  }

  /**
   * Create a signal object
   */
  static createSignal(
    type: number,
    sender: string,
    data: Record<string, unknown> = {}
  ): Signal {
    return {
      type,
      version: `${this.VERSION_MAJOR}.${this.VERSION_MINOR}`,
      sender,
      data: { ...data, sender },
      timestamp: Date.now()
    };
  }
}

export default BaNanoProtocol;
