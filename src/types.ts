export type StreamLifecycleStatus = 'idle' | 'analyzing' | 'live' | 'paused' | 'error';

export type VideoSourceKind = 'demo' | 'upload' | 'authorized_url' | 'screen_capture';

export type GameplayEventType =
  | 'driving'
  | 'police_chase'
  | 'crash'
  | 'combat'
  | 'mission'
  | 'comedy'
  | 'exploration';

export type VoicePersonaId = 'Fenrir' | 'Charon' | 'Puck';

export type TtsModelId = 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts';

export type SubtitleScriptMode = 'urdu' | 'roman' | 'dual';

export type SubtitlePosition = 'bottom' | 'center_low' | 'top';

export type StreamQualityPreset = '720p30' | '1080p30' | '1080p60';

export interface VideoSourceInfo {
  id: string;
  kind: VideoSourceKind;
  label: string;
  playbackUrl?: string;
  serverPath?: string;
  externalUrl?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  codec?: string;
  authorizedNotice?: string;
}

export interface SubtitleSettings {
  enabled: boolean;
  scriptMode: SubtitleScriptMode;
  fontFamily: 'Noto Nastaliq Urdu' | 'Noto Sans Arabic' | 'Plus Jakarta Sans';
  fontSizePx: number;
  position: SubtitlePosition;
  textColor: string;
  bgOpacity: number;
}

export interface StudioSettings {
  voiceId: VoicePersonaId;
  ttsModel: TtsModelId;
  commentarySpeed: number; // 0.85 - 1.25
  commentaryIntervalSec: number; // 6 - 20
  humorLevel: 'low' | 'medium' | 'high';
  streamQuality: StreamQualityPreset;
  subtitles: SubtitleSettings;
}

export interface CommentaryItem {
  id: string;
  createdAt: string;
  videoTimeSec: number;
  eventType: GameplayEventType;
  intensity: number;
  emotion: 'excited' | 'funny' | 'tense' | 'chill';
  sceneSummary: string;
  commentaryRoman: string;
  commentaryUrdu: string;
  audioUrl?: string;
  audioBase64?: string;
  audioMimeType?: string;
  ttsError?: string;
  latencyMs: number;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount?: string;
  liveStreamingEnabled?: boolean;
}

export interface YouTubeBroadcastState {
  broadcastId: string;
  streamId: string;
  title: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  lifeCycleStatus: string;
  maskedIngestionUrl: string;
  watchUrl: string;
  resolution: string;
}

export interface FfmpegTelemetry {
  active: boolean;
  mode: 'idle' | 'youtube_rtmp' | 'custom_rtmp' | 'local_preview';
  fps: number;
  bitrateKbps: number;
  frameCount: number;
  speed: string;
  outTime: string;
  lastError?: string;
  recentLogs: string[];
}

export interface SystemCapabilities {
  geminiConfigured: boolean;
  geminiModel: string;
  ttsModels: TtsModelId[];
  ffmpegAvailable: boolean;
  ffmpegVersion: string;
  ffprobeAvailable: boolean;
  firebaseOAuthConfigured: boolean;
  youtubeApiKeyConfigured: boolean;
  serverTime: string;
}

export interface ServerStudioState {
  streamStatus: StreamLifecycleStatus;
  activeSource: VideoSourceInfo | null;
  activeBroadcast: YouTubeBroadcastState | null;
  ffmpeg: FfmpegTelemetry;
  subtitlesCount: number;
  commentaryCount: number;
}
