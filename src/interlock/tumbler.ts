import type { Signal } from '../types.js';
import { getSignalName } from './protocol.js';

export interface TumblerResult {
  accepted: boolean;
  signalType: string;
  signalName: string;
  reason?: string;
}

export interface TumblerStats {
  accepted: number;
  rejected: number;
  byType: Record<string, number>;
}

/**
 * Tumbler - Signal whitelist filter
 *
 * The Tumbler acts as a gatekeeper, only allowing signals that are
 * explicitly in the whitelist to pass through for processing.
 */
export class Tumbler {
  private acceptedSignals: Set<number>;
  private stats: TumblerStats = {
    accepted: 0,
    rejected: 0,
    byType: {}
  };

  constructor(acceptedSignals: string[] = []) {
    this.acceptedSignals = new Set();

    // Parse hex strings like "0x01" into numbers
    for (const sig of acceptedSignals) {
      const num = parseInt(sig, 16);
      if (!isNaN(num)) {
        this.acceptedSignals.add(num);
      }
    }

    console.error(`[Tumbler] Initialized with ${this.acceptedSignals.size} accepted signal types`);
  }

  /**
   * Process a signal through the tumbler
   */
  process(signal: Signal): TumblerResult {
    const typeHex = `0x${signal.type.toString(16).padStart(2, '0')}`;
    const signalName = getSignalName(signal.type);

    // Track by type
    this.stats.byType[signalName] = (this.stats.byType[signalName] || 0) + 1;

    // For consciousness server, we accept ALL signals by default
    // since our job is to observe everything
    if (this.acceptedSignals.size === 0 || this.acceptedSignals.has(signal.type)) {
      this.stats.accepted++;
      return {
        accepted: true,
        signalType: typeHex,
        signalName
      };
    }

    this.stats.rejected++;
    return {
      accepted: false,
      signalType: typeHex,
      signalName,
      reason: `Signal ${typeHex} (${signalName}) not in whitelist`
    };
  }

  /**
   * Add a signal type to the whitelist
   */
  addAcceptedSignal(type: number | string): void {
    const num = typeof type === 'string' ? parseInt(type, 16) : type;
    if (!isNaN(num)) {
      this.acceptedSignals.add(num);
    }
  }

  /**
   * Remove a signal type from the whitelist
   */
  removeAcceptedSignal(type: number | string): void {
    const num = typeof type === 'string' ? parseInt(type, 16) : type;
    if (!isNaN(num)) {
      this.acceptedSignals.delete(num);
    }
  }

  /**
   * Check if a signal type is accepted
   */
  isAccepted(type: number): boolean {
    return this.acceptedSignals.size === 0 || this.acceptedSignals.has(type);
  }

  /**
   * Get tumbler statistics
   */
  getStats(): TumblerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      accepted: 0,
      rejected: 0,
      byType: {}
    };
  }

  /**
   * Get list of accepted signal types
   */
  getAcceptedTypes(): string[] {
    return Array.from(this.acceptedSignals).map(
      n => `0x${n.toString(16).padStart(2, '0')}`
    );
  }
}

export default Tumbler;
