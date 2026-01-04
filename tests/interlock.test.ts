/**
 * InterLock protocol and component tests for consciousness-mcp
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BaNanoProtocol, SignalTypes, getSignalName } from '../src/interlock/protocol.js';
import { Tumbler } from '../src/interlock/tumbler.js';
import type { Signal } from '../src/types.js';

describe('BaNanoProtocol', () => {
  describe('Header Constants', () => {
    it('should have correct header size', () => {
      expect(BaNanoProtocol.HEADER_SIZE).toBe(12);
    });

    it('should have correct version', () => {
      expect(BaNanoProtocol.VERSION_MAJOR).toBe(1);
      expect(BaNanoProtocol.VERSION_MINOR).toBe(0);
    });
  });

  describe('encode', () => {
    it('should encode signal with correct header', () => {
      const signal: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test-server',
        data: { status: 'active' },
        timestamp: Date.now()
      };

      const buffer = BaNanoProtocol.encode(signal);

      expect(buffer.length).toBeGreaterThan(BaNanoProtocol.HEADER_SIZE);
      expect(buffer.readUInt8(0)).toBe(SignalTypes.HEARTBEAT);
      expect(buffer.readUInt8(1)).toBe(1); // Major version
      expect(buffer.readUInt8(2)).toBe(0); // Minor version
    });

    it('should encode payload length correctly', () => {
      const signal: Signal = {
        type: SignalTypes.BUILD_STARTED,
        version: '1.0',
        sender: 'neurogenesis',
        data: { project: 'test-project' },
        timestamp: Date.now()
      };

      const buffer = BaNanoProtocol.encode(signal);
      const payloadLength = buffer.readUInt32BE(4);
      const actualPayload = buffer.slice(BaNanoProtocol.HEADER_SIZE);

      expect(payloadLength).toBe(actualPayload.length);
    });

    it('should encode empty data correctly', () => {
      const signal: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      const buffer = BaNanoProtocol.encode(signal);
      const payloadLength = buffer.readUInt32BE(4);

      expect(payloadLength).toBe(2); // "{}"
    });
  });

  describe('decode', () => {
    it('should decode encoded signal correctly', () => {
      const original: Signal = {
        type: SignalTypes.FILE_DISCOVERED,
        version: '1.0',
        sender: 'enterspect',
        data: { path: '/test/file.ts', sender: 'enterspect' },
        timestamp: Date.now()
      };

      const buffer = BaNanoProtocol.encode(original);
      const decoded = BaNanoProtocol.decode(buffer);

      expect(decoded.type).toBe(original.type);
      expect(decoded.data.path).toBe('/test/file.ts');
      expect(decoded.sender).toBe('enterspect');
    });

    it('should throw on buffer too small', () => {
      const smallBuffer = Buffer.alloc(5);
      expect(() => BaNanoProtocol.decode(smallBuffer)).toThrow('Buffer too small');
    });

    it('should throw on incomplete payload', () => {
      const header = Buffer.alloc(BaNanoProtocol.HEADER_SIZE);
      header.writeUInt8(SignalTypes.HEARTBEAT, 0);
      header.writeUInt32BE(100, 4); // Claim 100 bytes of payload

      expect(() => BaNanoProtocol.decode(header)).toThrow('Incomplete payload');
    });

    it('should handle empty payload gracefully', () => {
      const header = Buffer.alloc(BaNanoProtocol.HEADER_SIZE);
      header.writeUInt8(SignalTypes.HEARTBEAT, 0);
      header.writeUInt8(1, 1); // Major version
      header.writeUInt8(0, 2); // Minor version
      header.writeUInt32BE(0, 4); // No payload
      header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);

      const decoded = BaNanoProtocol.decode(header);
      expect(decoded.type).toBe(SignalTypes.HEARTBEAT);
      expect(decoded.data).toEqual({});
    });
  });

  describe('createSignal', () => {
    it('should create signal with correct structure', () => {
      const signal = BaNanoProtocol.createSignal(
        SignalTypes.AWARENESS_UPDATE,
        'consciousness-mcp',
        { active_servers: ['a', 'b'] }
      );

      expect(signal.type).toBe(SignalTypes.AWARENESS_UPDATE);
      expect(signal.sender).toBe('consciousness-mcp');
      expect(signal.version).toBe('1.0');
      expect(signal.data.active_servers).toEqual(['a', 'b']);
      expect(signal.timestamp).toBeDefined();
    });

    it('should include sender in data', () => {
      const signal = BaNanoProtocol.createSignal(
        SignalTypes.PATTERN_DETECTED,
        'consciousness-mcp',
        { pattern: 'test' }
      );

      expect(signal.data.sender).toBe('consciousness-mcp');
    });
  });

  describe('roundtrip encoding', () => {
    it('should preserve data through encode/decode cycle', () => {
      const testCases = [
        { type: SignalTypes.BUILD_COMPLETED, data: { success: true, duration: 5000 } },
        { type: SignalTypes.VALIDATION_APPROVED, data: { validator: 'context-guardian' } },
        { type: SignalTypes.PATTERN_DETECTED, data: { pattern_type: 'failure', confidence: 0.85 } },
        { type: SignalTypes.ERROR, data: { message: 'Test error', code: 500 } }
      ];

      for (const tc of testCases) {
        const signal = BaNanoProtocol.createSignal(tc.type, 'test', tc.data);
        const encoded = BaNanoProtocol.encode(signal);
        const decoded = BaNanoProtocol.decode(encoded);

        expect(decoded.type).toBe(tc.type);
        for (const [key, value] of Object.entries(tc.data)) {
          expect(decoded.data[key]).toEqual(value);
        }
      }
    });
  });
});

describe('SignalTypes', () => {
  it('should have all core signals', () => {
    expect(SignalTypes.DOCK_REQUEST).toBe(0x01);
    expect(SignalTypes.DOCK_APPROVED).toBe(0x02);
    expect(SignalTypes.DOCK_REJECTED).toBe(0x03);
    expect(SignalTypes.HEARTBEAT).toBe(0x04);
    expect(SignalTypes.UNDOCK).toBe(0x05);
  });

  it('should have consciousness-specific signals', () => {
    expect(SignalTypes.AWARENESS_UPDATE).toBe(0xE0);
    expect(SignalTypes.PATTERN_DETECTED).toBe(0xE1);
    expect(SignalTypes.BLIND_SPOT_ALERT).toBe(0xE2);
    expect(SignalTypes.REASONING_CONCERN).toBe(0xE3);
    expect(SignalTypes.ATTENTION_SHIFT).toBe(0xE4);
    expect(SignalTypes.LESSON_LEARNED).toBe(0xE5);
  });

  it('should have unique values for all signals', () => {
    const values = Object.values(SignalTypes);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});

describe('getSignalName', () => {
  it('should return correct names for known signals', () => {
    expect(getSignalName(SignalTypes.HEARTBEAT)).toBe('HEARTBEAT');
    expect(getSignalName(SignalTypes.BUILD_COMPLETED)).toBe('BUILD_COMPLETED');
    expect(getSignalName(SignalTypes.AWARENESS_UPDATE)).toBe('AWARENESS_UPDATE');
  });

  it('should return unknown format for unrecognized signals', () => {
    expect(getSignalName(0xFE)).toBe('UNKNOWN_0xfe');
  });
});

describe('Tumbler', () => {
  describe('Initialization', () => {
    it('should initialize with empty whitelist', () => {
      const tumbler = new Tumbler([]);
      expect(tumbler.getAcceptedTypes()).toHaveLength(0);
    });

    it('should parse hex strings correctly', () => {
      const tumbler = new Tumbler(['0x01', '0x04', '0xE0']);
      expect(tumbler.isAccepted(0x01)).toBe(true);
      expect(tumbler.isAccepted(0x04)).toBe(true);
      expect(tumbler.isAccepted(0xE0)).toBe(true);
    });
  });

  describe('process', () => {
    it('should accept all signals when whitelist is empty', () => {
      const tumbler = new Tumbler([]);

      const signal: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      const result = tumbler.process(signal);
      expect(result.accepted).toBe(true);
      expect(result.signalName).toBe('HEARTBEAT');
    });

    it('should accept whitelisted signals', () => {
      const tumbler = new Tumbler(['0x04']); // Only HEARTBEAT

      const heartbeat: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      const result = tumbler.process(heartbeat);
      expect(result.accepted).toBe(true);
    });

    it('should reject non-whitelisted signals', () => {
      const tumbler = new Tumbler(['0x04']); // Only HEARTBEAT

      const buildSignal: Signal = {
        type: SignalTypes.BUILD_STARTED,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      const result = tumbler.process(buildSignal);
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('not in whitelist');
    });
  });

  describe('Whitelist Management', () => {
    let tumbler: Tumbler;

    beforeEach(() => {
      tumbler = new Tumbler(['0x01']);
    });

    it('should add signal types', () => {
      expect(tumbler.isAccepted(0x02)).toBe(false);
      tumbler.addAcceptedSignal(0x02);
      expect(tumbler.isAccepted(0x02)).toBe(true);
    });

    it('should add signal types from hex string', () => {
      tumbler.addAcceptedSignal('0x03');
      expect(tumbler.isAccepted(0x03)).toBe(true);
    });

    it('should remove signal types', () => {
      // Add another signal first so the list won't become empty
      tumbler.addAcceptedSignal(0x02);
      expect(tumbler.isAccepted(0x01)).toBe(true);
      tumbler.removeAcceptedSignal(0x01);
      // When whitelist has items, it only accepts what's in the list
      expect(tumbler.isAccepted(0x01)).toBe(false);
      expect(tumbler.isAccepted(0x02)).toBe(true);
    });

    it('should return accepted types as hex strings', () => {
      tumbler.addAcceptedSignal(0x02);
      const types = tumbler.getAcceptedTypes();
      expect(types).toContain('0x01');
      expect(types).toContain('0x02');
    });
  });

  describe('Statistics', () => {
    let tumbler: Tumbler;

    beforeEach(() => {
      tumbler = new Tumbler(['0x04']); // Only HEARTBEAT
    });

    it('should track accepted signals', () => {
      const signal: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      tumbler.process(signal);
      tumbler.process(signal);

      const stats = tumbler.getStats();
      expect(stats.accepted).toBe(2);
    });

    it('should track rejected signals', () => {
      const signal: Signal = {
        type: SignalTypes.BUILD_STARTED,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      tumbler.process(signal);

      const stats = tumbler.getStats();
      expect(stats.rejected).toBe(1);
    });

    it('should track by signal type', () => {
      const signals: Signal[] = [
        { type: SignalTypes.HEARTBEAT, version: '1.0', sender: 'a', data: {}, timestamp: Date.now() },
        { type: SignalTypes.HEARTBEAT, version: '1.0', sender: 'b', data: {}, timestamp: Date.now() },
        { type: SignalTypes.BUILD_STARTED, version: '1.0', sender: 'c', data: {}, timestamp: Date.now() }
      ];

      for (const sig of signals) {
        tumbler.process(sig);
      }

      const stats = tumbler.getStats();
      expect(stats.byType['HEARTBEAT']).toBe(2);
      expect(stats.byType['BUILD_STARTED']).toBe(1);
    });

    it('should reset statistics', () => {
      const signal: Signal = {
        type: SignalTypes.HEARTBEAT,
        version: '1.0',
        sender: 'test',
        data: {},
        timestamp: Date.now()
      };

      tumbler.process(signal);
      tumbler.resetStats();

      const stats = tumbler.getStats();
      expect(stats.accepted).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(Object.keys(stats.byType)).toHaveLength(0);
    });
  });
});
