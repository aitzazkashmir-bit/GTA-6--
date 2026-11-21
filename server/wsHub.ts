import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type {
  CommentaryItem,
  FfmpegTelemetry,
  ServerStudioState,
  StreamLifecycleStatus,
  VideoSourceInfo,
  YouTubeBroadcastState,
} from '../src/types.ts';

class WsHub {
  private wss: WebSocketServer | null = null;
  private state: ServerStudioState = {
    streamStatus: 'idle',
    activeSource: null,
    activeBroadcast: null,
    ffmpeg: {
      active: false,
      mode: 'idle',
      fps: 0,
      bitrateKbps: 0,
      frameCount: 0,
      speed: '0.0x',
      outTime: '00:00:00',
      recentLogs: [],
    },
    subtitlesCount: 0,
    commentaryCount: 0,
  };
  private recentCommentaries: CommentaryItem[] = [];

  attach(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws) => {
      this.send(ws, {
        type: 'studio:init',
        payload: {
          state: this.state,
          recentCommentaries: this.recentCommentaries.slice(-20),
        },
      });
    });
  }

  getState(): ServerStudioState {
    return this.state;
  }

  setStreamStatus(status: StreamLifecycleStatus) {
    this.state.streamStatus = status;
    this.broadcast({ type: 'studio:state', payload: this.state });
  }

  setActiveSource(source: VideoSourceInfo | null) {
    this.state.activeSource = source;
    this.broadcast({ type: 'studio:state', payload: this.state });
  }

  setActiveBroadcast(broadcast: YouTubeBroadcastState | null) {
    this.state.activeBroadcast = broadcast;
    this.broadcast({ type: 'studio:state', payload: this.state });
  }

  updateFfmpegTelemetry(telemetry: FfmpegTelemetry) {
    this.state.ffmpeg = telemetry;
    this.broadcast({ type: 'ffmpeg:telemetry', payload: telemetry });
  }

  pushCommentary(item: CommentaryItem) {
    // Strip large base64 audio from cached history to avoid memory bloat; keep recent 30 items
    const compactItem: CommentaryItem = { ...item, audioBase64: undefined };
    this.recentCommentaries = [...this.recentCommentaries.slice(-29), compactItem];
    this.state.commentaryCount += 1;
    this.state.subtitlesCount += 1;
    this.broadcast({ type: 'commentary:new', payload: item });
    this.broadcast({ type: 'studio:state', payload: this.state });
  }

  broadcastError(message: string) {
    this.broadcast({ type: 'studio:error', payload: { message, timestamp: new Date().toISOString() } });
  }

  private send(ws: WebSocket, event: { type: string; payload: unknown }) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private broadcast(event: { type: string; payload: unknown }) {
    if (!this.wss) return;
    const raw = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }
}

export const wsHub = new WsHub();
