import dgram from 'dgram';
import { EventEmitter } from 'events';
import { BaNanoProtocol, SignalTypes } from './protocol.js';
import { Tumbler } from './tumbler.js';
import { SignalHandlers } from './handlers.js';
import type { Signal, Peer, InterlockConfig } from '../types.js';

export interface InterlockStats {
  sent: number;
  received: number;
  dropped: number;
  peers: number;
  uptime: number;
}

/**
 * InterLock Socket - UDP mesh networking
 *
 * The Consciousness server listens to all mesh traffic from the 26-server
 * ecosystem. We're passive observers - we don't block or interfere.
 */
export class InterlockSocket extends EventEmitter {
  private socket: dgram.Socket;
  private config: InterlockConfig;
  private tumbler: Tumbler;
  private handlers: SignalHandlers | null = null;
  private peers: Map<string, Peer> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private stats = {
    sent: 0,
    received: 0,
    dropped: 0
  };

  constructor(config: InterlockConfig) {
    super();
    this.config = config;
    this.socket = dgram.createSocket('udp4');
    this.tumbler = new Tumbler(config.signals.accepted);

    // Initialize peers from config
    for (const peer of config.peers) {
      this.peers.set(peer.name, {
        ...peer,
        status: 'unknown',
        lastSeen: 0
      });
    }
  }

  /**
   * Start the InterLock socket
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.on('error', (err) => {
        console.error('[InterLock] Socket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.bind(this.config.ports.udp, () => {
        console.error(`[InterLock] Listening on UDP port ${this.config.ports.udp}`);

        // Initialize handlers with context
        this.handlers = new SignalHandlers(
          {
            sendResponse: (host, port, signal) => this.send(host, port, signal),
            broadcast: (signal) => this.broadcast(signal),
            emit: (event, data) => this.emit(event, data)
          },
          this.config.server_id
        );

        // Start heartbeat
        this.startHeartbeat();

        // Announce ourselves to peers
        this.announceToPeers();

        resolve();
      });
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const signal = BaNanoProtocol.decode(msg);

    // Silently ignore invalid/incompatible signals from other servers
    if (!signal) {
      this.stats.dropped++;
      return;
    }

    this.stats.received++;

    // Update peer status
    this.updatePeerStatus(signal.payload.sender, rinfo);

    // Process through tumbler
    const result = this.tumbler.process(signal);

    if (result.accepted) {
      // Route to handlers
      if (this.handlers) {
        this.handlers.route(signal, rinfo).catch(err => {
          console.error('[InterLock] Handler error:', err);
        });
      }

      // Emit for external listeners
      this.emit('signal', signal, rinfo);
    } else {
      this.stats.dropped++;
    }
  }

  /**
   * Update peer status when we receive a message from them
   */
  private updatePeerStatus(sender: string, rinfo: dgram.RemoteInfo): void {
    const peer = this.peers.get(sender);
    if (peer) {
      peer.lastSeen = Date.now();
      peer.status = 'active';
    } else {
      // New peer discovered
      this.peers.set(sender, {
        name: sender,
        host: rinfo.address,
        port: rinfo.port,
        lastSeen: Date.now(),
        status: 'active'
      });
      console.error(`[InterLock] New peer discovered: ${sender}`);
    }
  }

  /**
   * Send a signal to a specific host/port
   */
  send(host: string, port: number, signal: Signal): void {
    const encoded = BaNanoProtocol.encode(signal);
    this.socket.send(encoded, port, host, (err) => {
      if (err) {
        console.error(`[InterLock] Send failed to ${host}:${port}:`, err.message);
        this.stats.dropped++;
      } else {
        this.stats.sent++;
      }
    });
  }

  /**
   * Send a signal to a named peer
   */
  sendToPeer(peerName: string, signal: Signal): void {
    const peer = this.peers.get(peerName);
    if (peer) {
      this.send(peer.host, peer.port, signal);
    } else {
      console.error(`[InterLock] Unknown peer: ${peerName}`);
    }
  }

  /**
   * Broadcast a signal to all peers
   */
  broadcast(signal: Signal): void {
    for (const [name, peer] of this.peers) {
      this.send(peer.host, peer.port, signal);
    }
  }

  /**
   * Broadcast to a subset of peers
   */
  broadcastTo(peerNames: string[], signal: Signal): void {
    for (const name of peerNames) {
      const peer = this.peers.get(name);
      if (peer) {
        this.send(peer.host, peer.port, signal);
      }
    }
  }

  /**
   * Start heartbeat broadcasting
   */
  private startHeartbeat(): void {
    const interval = this.config.heartbeat.interval;
    this.heartbeatTimer = setInterval(() => {
      const signal = BaNanoProtocol.createSignal(
        SignalTypes.HEARTBEAT,
        this.config.server_id,
        {
          uptime: process.uptime(),
          stats: this.getStats(),
          capabilities: ['awareness', 'pattern-detection', 'reflection']
        }
      );
      this.broadcast(signal);

      // Check for stale peers
      this.checkStalePeers();
    }, interval);

    console.error(`[InterLock] Heartbeat started (interval: ${interval}ms)`);
  }

  /**
   * Check for peers that haven't sent heartbeats
   */
  private checkStalePeers(): void {
    const timeout = this.config.heartbeat.timeout;
    const now = Date.now();

    for (const [name, peer] of this.peers) {
      if (peer.lastSeen && (now - peer.lastSeen) > timeout) {
        if (peer.status !== 'inactive') {
          peer.status = 'inactive';
          console.error(`[InterLock] Peer ${name} is inactive`);
          this.emit('peer_inactive', { name, peer });
        }
      }
    }
  }

  /**
   * Announce ourselves to all configured peers
   */
  private announceToPeers(): void {
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.DOCK_REQUEST,
      this.config.server_id,
      {
        server_type: 'consciousness-mcp',
        capabilities: ['awareness', 'pattern-detection', 'reflection', 'reasoning-audit'],
        listening_port: this.config.ports.udp
      }
    );
    this.broadcast(signal);
    console.error(`[InterLock] Announced to ${this.peers.size} peers`);
  }

  /**
   * Emit a consciousness signal to relevant peers
   */
  emitAwarenessUpdate(data: Record<string, unknown>): void {
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.AWARENESS_UPDATE,
      this.config.server_id,
      data
    );
    // Send to coordination-related peers
    this.broadcastTo(['trinity-coordinator', 'project-context'], signal);
  }

  emitPatternDetected(data: Record<string, unknown>): void {
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.PATTERN_DETECTED,
      this.config.server_id,
      data
    );
    this.broadcastTo(['trinity-coordinator', 'neurogenesis-engine'], signal);
  }

  emitBlindSpotAlert(data: Record<string, unknown>): void {
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.BLIND_SPOT_ALERT,
      this.config.server_id,
      data
    );
    this.broadcastTo(['trinity-coordinator'], signal);
  }

  emitReasoningConcern(data: Record<string, unknown>): void {
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.REASONING_CONCERN,
      this.config.server_id,
      data
    );
    this.broadcastTo(['verifier-mcp', 'trinity-coordinator'], signal);
  }

  /**
   * Get socket statistics
   */
  getStats(): InterlockStats {
    return {
      ...this.stats,
      peers: this.peers.size,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Get tumbler statistics
   */
  getTumblerStats() {
    return this.tumbler.getStats();
  }

  /**
   * Get peer statuses
   */
  getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get active peer count
   */
  getActivePeerCount(): number {
    let count = 0;
    for (const peer of this.peers.values()) {
      if (peer.status === 'active') count++;
    }
    return count;
  }

  /**
   * Stop the InterLock socket
   */
  async stop(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Send shutdown signal
    const signal = BaNanoProtocol.createSignal(
      SignalTypes.SHUTDOWN,
      this.config.server_id,
      { reason: 'graceful_shutdown' }
    );
    this.broadcast(signal);

    // Close socket
    return new Promise((resolve) => {
      this.socket.close(() => {
        console.error('[InterLock] Socket closed');
        resolve();
      });
    });
  }
}

// Module-level instance for singleton pattern
let interlockInstance: InterlockSocket | null = null;

export function startInterLock(config: InterlockConfig): Promise<InterlockSocket> {
  if (interlockInstance) {
    return Promise.resolve(interlockInstance);
  }

  interlockInstance = new InterlockSocket(config);
  return interlockInstance.start().then(() => interlockInstance!);
}

export function getInterLock(): InterlockSocket | null {
  return interlockInstance;
}

export async function stopInterLock(): Promise<void> {
  if (interlockInstance) {
    await interlockInstance.stop();
    interlockInstance = null;
  }
}

export default InterlockSocket;
