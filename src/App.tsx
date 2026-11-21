import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tv,
  Film,
  Radio,
  Sliders,
  ShieldCheck,
  Menu,
  X,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, getWebSocketUrl, resolveMediaUrl } from './lib/api';
import { getAccessToken, googleSignIn, initAuth, logout } from './lib/firebaseAuth';
import { StudioMonitor, type StudioMonitorHandle } from './components/StudioMonitor';
import { CommentaryFeed } from './components/CommentaryFeed';
import { VideoSourceView } from './components/VideoSourceView';
import { YouTubeLiveView } from './components/YouTubeLiveView';
import { SettingsView } from './components/SettingsView';
import { SystemGuideView } from './components/SystemGuideView';
import type {
  CommentaryItem,
  FfmpegTelemetry,
  ServerStudioState,
  StreamLifecycleStatus,
  StudioSettings,
  SystemCapabilities,
  VideoSourceInfo,
  YouTubeBroadcastState,
  YouTubeChannelInfo,
} from './types';

type NavTab = 'studio' | 'sources' | 'youtube' | 'settings' | 'system';

const DEFAULT_SETTINGS: StudioSettings = {
  voiceId: 'Fenrir',
  ttsModel: 'gemini-3.8-flash-tts',
  commentarySpeed: 1.0,
  commentaryIntervalSec: 10,
  humorLevel: 'high',
  streamQuality: '720p30',
  subtitles: {
    enabled: true,
    scriptMode: 'dual',
    fontFamily: 'Noto Nastaliq Urdu',
    fontSizePx: 26,
    position: 'bottom',
    textColor: '#FFFFFF',
    bgOpacity: 0.78,
  },
};

const SETTINGS_STORAGE_KEY = 'gta6_urdu_studio_settings_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('studio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [settings, setSettings] = useState<StudioSettings>(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const [streamStatus, setStreamStatus] = useState<StreamLifecycleStatus>('idle');
  const [activeSource, setActiveSource] = useState<VideoSourceInfo | null>(null);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const [activeBroadcast, setActiveBroadcast] = useState<YouTubeBroadcastState | null>(null);
  const [ffmpeg, setFfmpeg] = useState<FfmpegTelemetry>({
    active: false,
    mode: 'idle',
    fps: 0,
    bitrateKbps: 0,
    frameCount: 0,
    speed: '0.0x',
    outTime: '00:00:00',
    recentLogs: [],
  });

  const [commentaries, setCommentaries] = useState<CommentaryItem[]>([]);
  const [activeCaption, setActiveCaption] = useState<CommentaryItem | null>(null);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  const [gameVolume, setGameVolume] = useState(0.35);
  const [voiceVolume, setVoiceVolume] = useState(1.0);

  // Google OAuth / YouTube Channel State
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [channel, setChannel] = useState<YouTubeChannelInfo | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const monitorRef = useRef<StudioMonitorHandle | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const analysisInFlightRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  const refreshHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const data = await apiRequest<{
        capabilities: SystemCapabilities;
        studio: ServerStudioState;
      }>('/api/health');
      setCapabilities(data.capabilities);
      setStreamStatus(data.studio.streamStatus);
      if (data.studio.activeSource && !activeSource) {
        setActiveSource(data.studio.activeSource);
      }
      if (data.studio.activeBroadcast) {
        setActiveBroadcast(data.studio.activeBroadcast);
      }
      setFfmpeg(data.studio.ffmpeg);
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Unable to reach studio backend.'
      );
    } finally {
      setIsCheckingHealth(false);
    }
  }, [activeSource]);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // Real-time WebSocket connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;

    const connect = () => {
      try {
        ws = new WebSocket(getWebSocketUrl());
        ws.onopen = () => {
          if (!unmounted) setWsConnected(true);
        };
        ws.onclose = () => {
          if (!unmounted) {
            setWsConnected(false);
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => {
          if (!unmounted) setWsConnected(false);
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              payload: unknown;
            };
            if (msg.type === 'studio:init') {
              const p = msg.payload as {
                state: ServerStudioState;
                recentCommentaries: CommentaryItem[];
              };
              setStreamStatus(p.state.streamStatus);
              if (p.state.activeSource) setActiveSource(p.state.activeSource);
              setActiveBroadcast(p.state.activeBroadcast);
              setFfmpeg(p.state.ffmpeg);
              if (p.recentCommentaries.length > 0) {
                setCommentaries(p.recentCommentaries);
                setActiveCaption(p.recentCommentaries[p.recentCommentaries.length - 1]);
              }
            } else if (msg.type === 'studio:state') {
              const st = msg.payload as ServerStudioState;
              setStreamStatus(st.streamStatus);
              if (st.activeSource) setActiveSource(st.activeSource);
              setActiveBroadcast(st.activeBroadcast);
              setFfmpeg(st.ffmpeg);
            } else if (msg.type === 'ffmpeg:telemetry') {
              setFfmpeg(msg.payload as FfmpegTelemetry);
            } else if (msg.type === 'studio:error') {
              const err = msg.payload as { message: string };
              setStudioError(err.message);
            }
          } catch {
            // ignore malformed frame
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Firebase Google OAuth listener
  useEffect(() => {
    const unsub = initAuth(
      async (_user, token) => {
        setAccessToken(token);
        try {
          const data = await apiRequest<{ channel: YouTubeChannelInfo }>(
            '/api/youtube/channel',
            {},
            token
          );
          setChannel(data.channel);
        } catch {
          // ignore until explicit sign-in
        }
      },
      () => {
        setAccessToken(null);
        setChannel(null);
      }
    );
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setStudioError(null);
    try {
      const result = await googleSignIn();
      setAccessToken(result.accessToken);
      const data = await apiRequest<{ channel: YouTubeChannelInfo }>(
        '/api/youtube/channel',
        {},
        result.accessToken
      );
      setChannel(data.channel);
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Google Sign-In failed.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setAccessToken(null);
    setChannel(null);
  };

  const playCommentaryAudio = useCallback(
    (item: CommentaryItem) => {
      const src = item.audioBase64
        ? `data:${item.audioMimeType || 'audio/wav'};base64,${item.audioBase64}`
        : resolveMediaUrl(item.audioUrl);
      if (!src) return;

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(src);
      audio.volume = voiceVolume;
      audio.playbackRate = settings.commentarySpeed;
      audioPlayerRef.current = audio;
      setActivePlayingId(item.id);
      audio.onended = () => setActivePlayingId(null);
      audio.onerror = () => setActivePlayingId(null);
      audio.play().catch(() => setActivePlayingId(null));
    },
    [voiceVolume, settings.commentarySpeed]
  );

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.volume = voiceVolume;
    }
  }, [voiceVolume]);

  const analyzeAndSpeakFrame = useCallback(
    async (forceSpeak = false) => {
      if (analysisInFlightRef.current) return;
      const frameBase64 = monitorRef.current?.captureFrameBase64();
      if (!frameBase64) return;

      analysisInFlightRef.current = true;
      setIsAnalyzingFrame(true);
      setStudioError(null);

      try {
        const videoTimeSec = monitorRef.current?.getCurrentTimeSec() ?? 0;
        const data = await apiRequest<{
          commentary: CommentaryItem;
          shouldSpeak: boolean;
        }>('/api/ai/analyze-frame', {
          method: 'POST',
          body: JSON.stringify({
            frameBase64,
            mimeType: 'image/jpeg',
            videoTimeSec,
            recentLines: recentLinesRef.current.slice(-6),
            settings,
            forceSpeak,
          }),
        });

        if (data.shouldSpeak) {
          const item = data.commentary;
          recentLinesRef.current = [...recentLinesRef.current.slice(-5), item.commentaryRoman];
          setCommentaries((prev) => {
            if (prev.some((c) => c.id === item.id)) return prev;
            return [...prev.slice(-29), item];
          });
          setActiveCaption(item);
          playCommentaryAudio(item);
        }
      } catch (err) {
        setStudioError(
          err instanceof Error ? err.message : 'AI gameplay analysis error.'
        );
      } finally {
        analysisInFlightRef.current = false;
        setIsAnalyzingFrame(false);
      }
    },
    [settings, playCommentaryAudio]
  );

  // Periodic AI Gameplay Brain loop when AI Host is active
  useEffect(() => {
    if (streamStatus !== 'analyzing' && streamStatus !== 'live') return;
    const initialTimer = window.setTimeout(() => {
      analyzeAndSpeakFrame(true);
    }, 900);
    const interval = window.setInterval(() => {
      analyzeAndSpeakFrame(false);
    }, settings.commentaryIntervalSec * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [streamStatus, settings.commentaryIntervalSec, analyzeAndSpeakFrame]);

  const handleLoadDemo = async () => {
    setIsDemoLoading(true);
    setStudioError(null);
    try {
      const data = await apiRequest<{ source: VideoSourceInfo }>('/api/media/demo', {
        method: 'POST',
      });
      setActiveSource(data.source);
      setCaptureStream(null);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Could not load demo video.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleStartHost = async () => {
    if (!activeSource) return;
    setStudioError(null);
    monitorRef.current?.playVideo();
    setStreamStatus('analyzing');
    await apiRequest('/api/studio/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'analyzing' }),
    }).catch(() => {});
  };

  const handlePauseHost = async () => {
    monitorRef.current?.pauseVideo();
    audioPlayerRef.current?.pause();
    setStreamStatus('paused');
    await apiRequest('/api/studio/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'paused' }),
    }).catch(() => {});
  };

  const handleStopHost = async () => {
    monitorRef.current?.stopVideo();
    audioPlayerRef.current?.pause();
    setActivePlayingId(null);
    setStreamStatus('idle');
    await apiRequest('/api/studio/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'idle' }),
    }).catch(() => {});
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'studio', label: 'Live Studio', icon: <Tv className="w-4 h-4" /> },
    { id: 'sources', label: 'Video Source', icon: <Film className="w-4 h-4" /> },
    { id: 'youtube', label: 'YouTube Live', icon: <Radio className="w-4 h-4" /> },
    { id: 'settings', label: 'Voice & Captions', icon: <Sliders className="w-4 h-4" /> },
    { id: 'system', label: 'System & Setup', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  const latestLatency =
    commentaries.length > 0 ? `${commentaries[commentaries.length - 1].latencyMs} ms` : '—';

  return (
    <div className="min-h-screen bg-[#090B10] text-slate-100 flex flex-col lg:flex-row">
      {/* Left Navigation Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-0 z-40 flex' : 'hidden'
        } lg:static lg:flex lg:w-64 lg:shrink-0 flex-col bg-[#0D1017] border-r border-white/10`}
      >
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <span className="font-display text-xl font-extrabold tracking-wide text-white whitespace-nowrap">
            GTA 6 URDU LIVE
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-[#FF4D6D]/20 to-[#FF7A59]/10 text-white border border-[#FF4D6D]/35'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Gemini AI</span>
            <span className={capabilities?.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'}>
              {capabilities?.geminiConfigured ? 'Ready' : 'Key Needed'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>YouTube</span>
            <span className={channel ? 'text-emerald-400 truncate max-w-[120px]' : 'text-slate-500'}>
              {channel ? channel.title : 'Not Connected'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>FFmpeg</span>
            <span className={capabilities?.ffmpegAvailable ? 'text-emerald-400' : 'text-red-400'}>
              {capabilities?.ffmpegAvailable ? 'Installed' : 'Missing'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (3-zone contract: Breadcrumb — Spacer — 1 Primary Action) */}
        <header className="h-16 px-4 sm:px-6 border-b border-white/10 bg-[#0D1017] flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-white/5 text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-400 truncate">
              Studio <span className="mx-1.5 text-slate-600">/</span>
              <span className="text-white font-medium">
                {navItems.find((n) => n.id === activeTab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {streamStatus === 'idle' || streamStatus === 'paused' ? (
              <button
                type="button"
                onClick={activeSource ? handleStartHost : handleLoadDemo}
                disabled={isDemoLoading}
                className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
              >
                {activeSource
                  ? streamStatus === 'paused'
                    ? 'Resume AI Host'
                    : 'Start AI Host'
                  : isDemoLoading
                    ? 'Loading Demo…'
                    : 'Launch Test Mode'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopHost}
                className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-red-100 bg-red-600/80 hover:bg-red-600 transition-colors whitespace-nowrap shrink-0"
              >
                Stop AI Host
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-6">
          {studioError && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-red-950/50 border border-red-500/35 text-sm text-red-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{studioError}</span>
              </div>
              <button
                type="button"
                onClick={() => setStudioError(null)}
                className="text-xs text-red-300 hover:text-white shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'studio' && (
            <>
              {/* Health & Metrics Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#11151E] border border-white/10 rounded-xl px-4 py-3">
                  <div className="text-xs text-slate-400">Broadcast State</div>
                  <div className="text-base font-semibold text-white mt-0.5 capitalize">
                    {streamStatus === 'analyzing' ? 'AI Host Active' : streamStatus}
                  </div>
                </div>
                <div className="bg-[#11151E] border border-white/10 rounded-xl px-4 py-3">
                  <div className="text-xs text-slate-400">AI Brain Latency</div>
                  <div className="text-base font-semibold text-white mt-0.5 font-mono-tabular">
                    {latestLatency}
                  </div>
                </div>
                <div className="bg-[#11151E] border border-white/10 rounded-xl px-4 py-3">
                  <div className="text-xs text-slate-400">FFmpeg Output</div>
                  <div className="text-base font-semibold text-white mt-0.5 font-mono-tabular">
                    {ffmpeg.active ? `${ffmpeg.fps} fps · ${ffmpeg.bitrateKbps} kbps` : 'Standby'}
                  </div>
                </div>
                <div className="bg-[#11151E] border border-white/10 rounded-xl px-4 py-3">
                  <div className="text-xs text-slate-400">YouTube Channel</div>
                  <div className="text-base font-semibold text-white mt-0.5 truncate">
                    {channel ? channel.title : 'Not Linked'}
                  </div>
                </div>
              </div>

              {/* Primary 2-Column Studio Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-8">
                  <StudioMonitor
                    ref={monitorRef}
                    source={activeSource}
                    captureStream={captureStream}
                    streamStatus={streamStatus}
                    subtitles={settings.subtitles}
                    activeCaption={activeCaption}
                    gameVolume={gameVolume}
                    onGameVolumeChange={setGameVolume}
                    voiceVolume={voiceVolume}
                    onVoiceVolumeChange={setVoiceVolume}
                    isAnalyzingFrame={isAnalyzingFrame}
                    onStartHost={handleStartHost}
                    onPauseHost={handlePauseHost}
                    onStopHost={handleStopHost}
                    onTriggerReaction={() => analyzeAndSpeakFrame(true)}
                    onLoadDemo={handleLoadDemo}
                    isDemoLoading={isDemoLoading}
                  />
                </div>
                <div className="xl:col-span-4">
                  <CommentaryFeed
                    items={commentaries}
                    isAnalyzing={isAnalyzingFrame}
                    onPlayClip={playCommentaryAudio}
                    activePlayingId={activePlayingId}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'sources' && (
            <VideoSourceView
              activeSource={activeSource}
              accessToken={accessToken}
              onSourceSelected={(src, stream) => {
                setActiveSource(src);
                setCaptureStream(stream ?? null);
              }}
              onGoToStudio={() => setActiveTab('studio')}
            />
          )}

          {activeTab === 'youtube' && (
            <YouTubeLiveView
              accessToken={accessToken}
              channel={channel}
              isLoggingIn={isLoggingIn}
              onGoogleLogin={handleGoogleLogin}
              onLogout={handleLogout}
              activeSource={activeSource}
              activeBroadcast={activeBroadcast}
              ffmpeg={ffmpeg}
              settings={settings}
              onBroadcastUpdated={setActiveBroadcast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView settings={settings} onChange={setSettings} />
          )}

          {activeTab === 'system' && (
            <SystemGuideView
              capabilities={capabilities}
              wsConnected={wsConnected}
              isRefreshing={isCheckingHealth}
              onRefresh={refreshHealth}
            />
          )}
        </main>
      </div>
    </div>
  );
}
