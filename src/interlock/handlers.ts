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
    const signalName = getSignalName(signal.signalType);
    console.error(`[Handlers] Received ${signalName} from ${signal.payload.sender} (${rinfo.address}:${rinfo.port})`);

    // Always log the signal as an attention event
    this.logAttentionEvent(signal, rinfo);

    // Handle specific signal types
    switch (signal.signalType) {
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

      // AstroSentry events (from HTTP→Cognitive bridge)
      case SignalTypes.ASTROSENTRY_EVENT:
        this.handleAstrosentryEvent(signal, rinfo);
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
      const { sender, ...data } = signal.payload;
      const event: AttentionEvent = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        event_type: 'signal',
        target: getSignalName(signal.signalType),
        context: {
          signal_type: signal.signalType,
          data,
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
    const { sender, ...data } = signal.payload;
    // Heartbeats tell us a server is alive
    this.context.emit('server_heartbeat', {
      server: sender,
      timestamp: signal.timestamp,
      data
    });
  }

  /**
   * Handle dock requests - respond with approval
   */
  private handleDockRequest(signal: Signal, rinfo: RemoteInfo): void {
    // Consciousness always approves docking - we want to observe everyone
    const response: Signal = {
      signalType: SignalTypes.DOCK_APPROVED,
      version: 0x0100,
      timestamp: Math.floor(Date.now() / 1000),
      payload: {
        sender: this.serverId,
        approved: true,
        message: 'Welcome to the consciousness mesh',
        capabilities: ['awareness', 'pattern-detection', 'reflection']
      }
    };
    this.context.sendResponse(rinfo.address, rinfo.port, response);
  }

  /**
   * Handle shutdown signals
   */
  private handleShutdown(signal: Signal, rinfo: RemoteInfo): void {
    console.error(`[Handlers] Server ${signal.payload.sender} is shutting down`);
    this.context.emit('server_shutdown', {
      server: signal.payload.sender,
      timestamp: signal.timestamp
    });
  }

  /**
   * Handle file-related events
   */
  private handleFileEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, ...data } = signal.payload;
    const event: AttentionEvent = {
      timestamp: signal.timestamp * 1000 || Date.now(),
      server_name: sender,
      event_type: 'file',
      target: (data.path || data.file || 'unknown') as string,
      context: data
    };
    db.insertAttentionEvent(event);

    this.context.emit('file_event', {
      type: getSignalName(signal.signalType),
      server: sender,
      data
    });
  }

  /**
   * Handle search events
   */
  private handleSearchEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, ...data } = signal.payload;

    if (signal.signalType === SignalTypes.SEARCH_STARTED) {
      const event: AttentionEvent = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        event_type: 'query',
        target: (data.query || data.search_term || 'unknown') as string,
        context: data
      };
      db.insertAttentionEvent(event);
    }

    if (signal.signalType === SignalTypes.SEARCH_COMPLETED) {
      // Log as operation completion
      const op: Operation = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        operation_type: 'search',
        operation_id: (data.search_id || `search-${Date.now()}`) as string,
        input_summary: (data.query || 'unknown') as string,
        outcome: (data.results_count as number) > 0 ? 'success' : 'partial',
        quality_score: Math.min(1, (data.results_count as number || 0) / 10),
        lessons: { results_count: data.results_count },
        duration_ms: data.duration_ms as number
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might already exist
      }
    }

    this.context.emit('search_event', {
      type: getSignalName(signal.signalType),
      server: sender,
      data
    });
  }

  /**
   * Handle build events from Neurogenesis
   */
  private handleBuildEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, ...data } = signal.payload;
    const buildId = (data.build_id || data.server_name || `build-${Date.now()}`) as string;

    if (signal.signalType === SignalTypes.BUILD_STARTED) {
      const event: AttentionEvent = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        event_type: 'operation',
        target: buildId,
        context: { operation: 'build_started', ...data }
      };
      db.insertAttentionEvent(event);
    }

    if (signal.signalType === SignalTypes.BUILD_COMPLETED || signal.signalType === SignalTypes.BUILD_FAILED) {
      const outcome: OperationOutcome = signal.signalType === SignalTypes.BUILD_COMPLETED ? 'success' : 'failure';
      const op: Operation = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        operation_type: 'build',
        operation_id: buildId,
        input_summary: (data.server_name || data.description || 'unknown') as string,
        outcome,
        quality_score: outcome === 'success' ? 0.9 : 0.2,
        lessons: data as Record<string, unknown>,
        duration_ms: data.duration_ms as number
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
          server: sender,
          data
        });
      }
    }

    this.context.emit('build_event', {
      type: getSignalName(signal.signalType),
      server: sender,
      data
    });
  }

  /**
   * Handle verification events from Verifier
   */
  private handleVerificationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, ...data } = signal.payload;

    if (signal.signalType === SignalTypes.VERIFICATION_RESULT) {
      const verifyId = (data.verification_id || `verify-${Date.now()}`) as string;
      const verdict = data.verdict as string;
      const outcome: OperationOutcome =
        verdict === 'SUPPORTED' ? 'success' :
        verdict === 'CONTRADICTED' ? 'failure' : 'partial';

      const op: Operation = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: sender,
        operation_type: 'verify',
        operation_id: verifyId,
        input_summary: (data.claim || 'unknown') as string,
        outcome,
        quality_score: (data.confidence || 0.5) as number,
        lessons: {
          verdict,
          constraints: data.constraints,
          sources: data.sources
        },
        duration_ms: data.duration_ms as number
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might already exist
      }
    }

    this.context.emit('verification_event', {
      type: getSignalName(signal.signalType),
      server: sender,
      data
    });
  }

  /**
   * Handle validation events from Context Guardian
   */
  private handleValidationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const { sender, ...data } = signal.payload;
    const outcome = signal.signalType === SignalTypes.VALIDATION_APPROVED ? 'success' : 'failure';

    this.context.emit('validation_event', {
      type: getSignalName(signal.signalType),
      outcome,
      server: sender,
      data
    });

    // Track validation failures for pattern detection
    if (outcome === 'failure') {
      this.context.emit('pattern_candidate', {
        type: 'validation_failure',
        server: sender,
        reason: data.reason,
        data
      });
    }
  }

  /**
   * Handle coordination events from Trinity
   */
  private handleCoordinationEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, ...data } = signal.payload;
    const event: AttentionEvent = {
      timestamp: signal.timestamp * 1000 || Date.now(),
      server_name: sender,
      event_type: 'workflow',
      target: getSignalName(signal.signalType),
      context: data
    };
    db.insertAttentionEvent(event);

    this.context.emit('coordination_event', {
      type: getSignalName(signal.signalType),
      server: sender,
      data
    });
  }

  /**
   * Handle ASTROSENTRY_EVENT from AstroSentries (HTTP→Cognitive bridge)
   * These come from HTTP API operations in Context Guardian, QuarterMaster, SnapSHOT, TooLee
   */
  private handleAstrosentryEvent(signal: Signal, rinfo: RemoteInfo): void {
    const db = getDatabase();
    const { sender, serverId, eventType, outcome, operation, metadata, source } = signal.payload as {
      sender: string;
      serverId: string;
      eventType: string;
      outcome: string;
      operation: string;
      metadata: Record<string, unknown>;
      source: string;
    };

    // Log as attention event with rich context
    // Map AstroSentry eventTypes to our EventType taxonomy
    const event: AttentionEvent = {
      timestamp: signal.timestamp * 1000 || Date.now(),
      server_name: serverId || sender,
      event_type: 'operation',  // AstroSentry events are operational outcomes
      target: `${eventType}:${operation}`,  // Combine eventType and operation
      context: {
        astrosentry_event_type: eventType,
        outcome,
        source,  // 'http' indicates HTTP API path
        metadata
      }
    };
    db.insertAttentionEvent(event);

    // Track as operation for pattern analysis
    if (outcome) {
      const op: Operation = {
        timestamp: signal.timestamp * 1000 || Date.now(),
        server_name: serverId || sender,
        operation_type: eventType as OperationType,
        operation_id: `${serverId}-${eventType}-${Date.now()}`,
        input_summary: operation,
        outcome: outcome === 'success' ? 'success' : outcome === 'failure' ? 'failure' : 'partial',
        quality_score: outcome === 'success' ? 1.0 : outcome === 'failure' ? 0.0 : 0.5,
        lessons: metadata as Record<string, unknown>
      };
      try {
        db.insertOperation(op);
      } catch {
        // Operation might conflict with existing
      }
    }

    console.error(`[Handlers] ASTROSENTRY_EVENT: ${serverId}/${eventType} → ${outcome} (source: ${source})`);

    this.context.emit('astrosentry_event', {
      serverId,
      eventType,
      outcome,
      operation,
      metadata,
      source
    });

    // Track failures for pattern detection
    if (outcome === 'failure') {
      this.context.emit('pattern_candidate', {
        type: 'astrosentry_failure',
        server: serverId,
        eventType,
        operation,
        metadata
      });
    }
  }

  /**
   * Handle error signals
   */
  private handleError(signal: Signal, rinfo: RemoteInfo): void {
    const { sender, ...data } = signal.payload;
    console.error(`[Handlers] Error from ${sender}:`, data);

    this.context.emit('error_received', {
      server: sender,
      error: data,
      timestamp: signal.timestamp
    });

    // Track for pattern detection
    this.context.emit('pattern_candidate', {
      type: 'error',
      server: sender,
      data
    });
  }

  /**
   * Handle unknown signals - still log them for analysis
   */
  private handleUnknownSignal(signal: Signal, rinfo: RemoteInfo): void {
    const { sender, ...data } = signal.payload;
    console.error(`[Handlers] Unknown signal type 0x${signal.signalType.toString(16)} from ${sender}`);

    this.context.emit('unknown_signal', {
      type: signal.signalType,
      server: sender,
      data
    });
  }
}

export default SignalHandlers;
