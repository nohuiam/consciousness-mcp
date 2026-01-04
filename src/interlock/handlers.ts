import type { Signal, AttentionEvent, Operation, OperationType, OperationOutcome } from '../types.js';
import { SignalTypes, getSignalName } from './protocol.js';
import { getDatabase } from '../database/schema.js';
import type { RemoteInfo } from 'dgram';

export interface HandlerContext {
  sendResponse: (host: string, port: number, signal: Signal) => void;
  broadcast: (signal: Signal) => void;
  emit: (event: string, data: unknown) => void;
}

/**
 * Signal Handlers - Process incoming InterLock signals
 *
 * As the Consciousness server, we observe ALL signals and log them
 * for pattern analysis. We don't block or reject - we learn.
 */
export class SignalHandlers {
  private context: HandlerContext;
  private serverId: string;

  constructor(context: HandlerContext, serverId: string = 'consciousness-mcp') {
    this.context = context;
    this.serverId = serverId;
  }

  /**
   * Route an incoming signal to the appropriate handler
   */
  async route(signal: Signal, rinfo: RemoteInfo): Promise<void> {
    const signalName = getSignalName(signal.type);
    console.error(`[Handlers] Received ${signalName} from ${signal.sender} (${rinfo.address}:${rinfo.port})`);

    // Always log the signal as an attention event
    this.logAttentionEvent(signal, rinfo);

    // Handle specific signal types
    switch (signal.type) {
      case SignalTypes.HEARTBEAT:
        this.handleHeartbeat(signal, rinfo);
        break;

      case SignalTypes.DOCK_REQUEST:
        this.handleDockRequest(signal, rinfo);
        break;

      case SignalTypes.UNDOCK:
      case SignalTypes.SHUTDOWN:
        this.handleShutdown(signal, rinfo);
        break;

      // File operations - track attention
      case SignalTypes.FILE_DISCOVERED:
      case SignalTypes.FILE_INDEXED:
      case SignalTypes.FILE_MODIFIED:
      case SignalTypes.FILE_DELETED:
        this.handleFileEvent(signal, rinfo);
        break;

      // Search operations
      case SignalTypes.SEARCH_STARTED:
      case SignalTypes.SEARCH_COMPLETED:
      case SignalTypes.SEARCH_RESULT:
        this.handleSearchEvent(signal, rinfo);
        break;

      // Build operations
      case SignalTypes.BUILD_STARTED:
      case SignalTypes.BUILD_COMPLETED:
      case SignalTypes.BUILD_FAILED:
        this.handleBuildEvent(signal, rinfo);
        break;

      // Verification operations
      case SignalTypes.VERIFICATION_STARTED:
      case SignalTypes.VERIFICATION_RESULT:
      case SignalTypes.CLAIM_EXTRACTED:
        this.handleVerificationEvent(signal, rinfo);
        break;

      // Validation events
      case SignalTypes.VALIDATION_APPROVED:
      case SignalTypes.VALIDATION_REJECTED:
        this.handleValidationEvent(signal, rinfo);
        break;

      // Coordination events
      case SignalTypes.HANDOFF_REQUEST:
      case SignalTypes.HANDOFF_APPROVED:
      case SignalTypes.HANDOFF_COMPLETED:
      case SignalTypes.MODE_SWITCH:
        this.handleCoordinationEvent(signal, rinfo);
        break;

      // Error events
      case SignalTypes.ERROR:
        this.handleError(signal, rinfo);
        break;

      default:
        // Log unknown signals for analysis
        this.handleUnknownSignal(signal, rinfo);
    }
  }

  /**
   * Log every signal as an attention event
   */
  private logAttentionEvent(signal: Signal, rinfo: RemoteInfo): void {
    try {
      const db = getDatabase();
      const event: AttentionEvent = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        event_type: 'signal',
        target: getSignalName(signal.type),
        context: {
          signal_type: signal.type,
          data: signal.data,
          source_address: rinfo.address,
          source_port: rinfo.port
        }
      };
      db.insertAttentionEvent(event);
    } catch (error) {
      console.error('[Handlers] Failed to log attention event:', error);
    }
  }

  /**
   * Handle heartbeat signals - track server activity
   */
  private handleHeartbeat(signal: Signal, rinfo: RemoteInfo): void {
    // Heartbeats tell us a server is alive
    this.context.emit('server_heartbeat', {
      server: signal.sender,
      timestamp: signal.timestamp,
      data: signal.data
    });
  }

  /**
   * Handle dock requests - respond with approval
   */
  private handleDockRequest(signal: Signal, rinfo: RemoteInfo): void {
    // Consciousness always approves docking - we want to observe everyone
    const response: Signal = {
      type: SignalTypes.DOCK_APPROVED,
      version: '1.0',
      sender: this.serverId,
      data: {
        approved: true,
        message: 'Welcome to the consciousness mesh',
        capabilities: ['awareness', 'pattern-detection', 'reflection']
      },
      timestamp: Date.now()
    };
    this.context.sendResponse(rinfo.address, rinfo.port, response);
  }

  /**
   * Handle shutdown signals
   */
  private handleShutdown(signal: Signal, rinfo: RemoteInfo): void {
    console.error(`[Handlers] Server ${signal.sender} is shutting down`);
    this.context.emit('server_shutdown', {
      server: signal.sender,
      timestamp: signal.timestamp
    });
  }

  /**
   * Handle file-related events
   */
  private handleFileEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const event: AttentionEvent = {
      timestamp: signal.timestamp || Date.now(),
      server_name: signal.sender,
      event_type: 'file',
      target: (signal.data.path || signal.data.file || 'unknown') as string,
      context: signal.data
    };
    db.insertAttentionEvent(event);

    this.context.emit('file_event', {
      type: getSignalName(signal.type),
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle search events
   */
  private handleSearchEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();

    if (signal.type === SignalTypes.SEARCH_STARTED) {
      const event: AttentionEvent = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        event_type: 'query',
        target: (signal.data.query || signal.data.search_term || 'unknown') as string,
        context: signal.data
      };
      db.insertAttentionEvent(event);
    }

    if (signal.type === SignalTypes.SEARCH_COMPLETED) {
      // Log as operation completion
      const op: Operation = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        operation_type: 'search',
        operation_id: (signal.data.search_id || `search-${Date.now()}`) as string,
        input_summary: (signal.data.query || 'unknown') as string,
        outcome: (signal.data.results_count as number) > 0 ? 'success' : 'partial',
        quality_score: Math.min(1, (signal.data.results_count as number || 0) / 10),
        lessons: { results_count: signal.data.results_count },
        duration_ms: signal.data.duration_ms as number
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might already exist
      }
    }

    this.context.emit('search_event', {
      type: getSignalName(signal.type),
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle build events from Neurogenesis
   */
  private handleBuildEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const buildId = (signal.data.build_id || signal.data.server_name || `build-${Date.now()}`) as string;

    if (signal.type === SignalTypes.BUILD_STARTED) {
      const event: AttentionEvent = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        event_type: 'operation',
        target: buildId,
        context: { operation: 'build_started', ...signal.data }
      };
      db.insertAttentionEvent(event);
    }

    if (signal.type === SignalTypes.BUILD_COMPLETED || signal.type === SignalTypes.BUILD_FAILED) {
      const outcome: OperationOutcome = signal.type === SignalTypes.BUILD_COMPLETED ? 'success' : 'failure';
      const op: Operation = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        operation_type: 'build',
        operation_id: buildId,
        input_summary: (signal.data.server_name || signal.data.description || 'unknown') as string,
        outcome,
        quality_score: outcome === 'success' ? 0.9 : 0.2,
        lessons: signal.data as Record<string, unknown>,
        duration_ms: signal.data.duration_ms as number
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might already exist
      }

      // Emit lesson learned for failed builds
      if (outcome === 'failure') {
        this.context.emit('lesson_learned', {
          type: 'build_failure',
          server: signal.sender,
          data: signal.data
        });
      }
    }

    this.context.emit('build_event', {
      type: getSignalName(signal.type),
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle verification events from Verifier
   */
  private handleVerificationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();

    if (signal.type === SignalTypes.VERIFICATION_RESULT) {
      const verifyId = (signal.data.verification_id || `verify-${Date.now()}`) as string;
      const verdict = signal.data.verdict as string;
      const outcome: OperationOutcome =
        verdict === 'SUPPORTED' ? 'success' :
        verdict === 'CONTRADICTED' ? 'failure' : 'partial';

      const op: Operation = {
        timestamp: signal.timestamp || Date.now(),
        server_name: signal.sender,
        operation_type: 'verify',
        operation_id: verifyId,
        input_summary: (signal.data.claim || 'unknown') as string,
        outcome,
        quality_score: (signal.data.confidence || 0.5) as number,
        lessons: {
          verdict,
          constraints: signal.data.constraints,
          sources: signal.data.sources
        },
        duration_ms: signal.data.duration_ms as number
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might already exist
      }
    }

    this.context.emit('verification_event', {
      type: getSignalName(signal.type),
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle validation events from Context Guardian
   */
  private handleValidationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const outcome = signal.type === SignalTypes.VALIDATION_APPROVED ? 'success' : 'failure';

    this.context.emit('validation_event', {
      type: getSignalName(signal.type),
      outcome,
      server: signal.sender,
      data: signal.data
    });

    // Track validation failures for pattern detection
    if (outcome === 'failure') {
      this.context.emit('pattern_candidate', {
        type: 'validation_failure',
        server: signal.sender,
        reason: signal.data.reason,
        data: signal.data
      });
    }
  }

  /**
   * Handle coordination events from Trinity
   */
  private handleCoordinationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const event: AttentionEvent = {
      timestamp: signal.timestamp || Date.now(),
      server_name: signal.sender,
      event_type: 'workflow',
      target: getSignalName(signal.type),
      context: signal.data
    };
    db.insertAttentionEvent(event);

    this.context.emit('coordination_event', {
      type: getSignalName(signal.type),
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle error signals
   */
  private handleError(signal: Signal, rinfo: RemoteInfo): void {
    console.error(`[Handlers] Error from ${signal.sender}:`, signal.data);

    this.context.emit('error_received', {
      server: signal.sender,
      error: signal.data,
      timestamp: signal.timestamp
    });

    // Track for pattern detection
    this.context.emit('pattern_candidate', {
      type: 'error',
      server: signal.sender,
      data: signal.data
    });
  }

  /**
   * Handle unknown signals - still log them for analysis
   */
  private handleUnknownSignal(signal: Signal, rinfo: RemoteInfo): void {
    console.error(`[Handlers] Unknown signal type 0x${signal.type.toString(16)} from ${signal.sender}`);

    this.context.emit('unknown_signal', {
      type: signal.type,
      server: signal.sender,
      data: signal.data
    });
  }
}

export default SignalHandlers;
