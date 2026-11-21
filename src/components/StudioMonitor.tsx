import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  Tv,
  AlertTriangle,
} from 'lucide-react';
import { resolveMediaUrl } from '../lib/api';
import type {
  CommentaryItem,
  StreamLifecycleStatus,
  SubtitleSettings,
  VideoSourceInfo,
} from '../types';

export interface StudioMonitorHandle {
  captureFrameBase64: () => string | null;
  getCurrentTimeSec: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
}

interface StudioMonitorProps {
  source: VideoSourceInfo | null;
  captureStream: MediaStream | null;
  streamStatus: StreamLifecycleStatus;
  subtitles: SubtitleSettings;
  activeCaption: CommentaryItem | null;
  gameVolume: number;
  onGameVolumeChange: (v: number) => void;
  voiceVolume: number;
  onVoiceVolumeChange: (v: number) => void;
  isAnalyzingFrame: boolean;
  onStartHost: () => void;
  onPauseHost: () => void;
  onStopHost: () => void;
  onTriggerReaction: () => void;
  onLoadDemo: () => void;
  isDemoLoading: boolean;
}

export const StudioMonitor = React.forwardRef<StudioMonitorHandle, StudioMonitorProps>(
  function StudioMonitor(
    {
      source,
      captureStream,
      streamStatus,
      subtitles,
      activeCaption,
      gameVolume,
      onGameVolumeChange,
      voiceVolume,
      onVoiceVolumeChange,
      isAnalyzingFrame,
      onStartHost,
      onPauseHost,
      onStopHost,
      onTriggerReaction,
      onLoadDemo,
      isDemoLoading,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [muted, setMuted] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = muted ? 0 : gameVolume;
    }, [gameVolume, muted]);

    useEffect(() => {
      setVideoError(null);
      const video = videoRef.current;
      if (!video) return;

      if (source?.kind === 'screen_capture' && captureStream) {
        video.srcObject = captureStream;
        video.play().catch(() => {});
      } else {
        video.srcObject = null;
      }
    }, [source, captureStream]);

    useImperativeHandle(ref, () => ({
      captureFrameBase64: () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
          return null;
        }
        const targetW = 640;
        const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW) || 360;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        return canvas.toDataURL('image/jpeg', 0.78);
      },
      getCurrentTimeSec: () => videoRef.current?.currentTime ?? 0,
      playVideo: () => {
        videoRef.current?.play().catch(() => {});
      },
      pauseVideo: () => {
        videoRef.current?.pause();
      },
      stopVideo: () => {
        if (videoRef.current) {
          videoRef.current.pause();
          if (source?.kind !== 'screen_capture') {
            videoRef.current.currentTime = 0;
          }
        }
      },
    }));

    const resolvedPlaybackUrl =
      source?.kind !== 'screen_capture' ? resolveMediaUrl(source?.playbackUrl) : undefined;

    const positionClass =
      subtitles.position === 'top'
        ? 'top-4'
        : subtitles.position === 'center_low'
          ? 'bottom-20'
          : 'bottom-4';

    const showUrdu = subtitles.scriptMode === 'urdu' || subtitles.scriptMode === 'dual';
    const showRoman = subtitles.scriptMode === 'roman' || subtitles.scriptMode === 'dual';

    return (
      <div className="bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
        {/* Top Monitor Strip */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#141923]">
          <div className="flex items-center gap-3 min-w-0">
            <Tv className="w-4 h-4 text-[#FF4D6D] shrink-0" />
            <span className="text-sm font-semibold text-white truncate">
              {source ? source.label : 'No Video Source Loaded'}
            </span>
            {source?.width && source?.height && (
              <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
                {source.width}×{source.height}
                {source.codec ? ` · ${source.codec.toUpperCase()}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-medium shrink-0">
            {isAnalyzingFrame && (
              <span className="text-amber-400 whitespace-nowrap">Analyzing Frame…</span>
            )}
            <span
              className={
                streamStatus === 'live'
                  ? 'text-emerald-400'
                  : streamStatus === 'analyzing'
                    ? 'text-[#FF7A59]'
                    : streamStatus === 'paused'
                      ? 'text-amber-400'
                      : 'text-slate-400'
              }
            >
              {streamStatus === 'live'
                ? 'Live Broadcast'
                : streamStatus === 'analyzing'
                  ? 'AI Host Active'
                  : streamStatus === 'paused'
                    ? 'Paused'
                    : 'Standby'}
            </span>
          </div>
        </div>

        {/* 16:9 Video Canvas */}
        <div className="relative aspect-video bg-[#07090D] flex items-center justify-center overflow-hidden">
          {!source ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src="/src/assets/images/gta_vice_backdrop_1795236994789.jpg"
                alt="Vice City coastal highway studio backdrop"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-45"
              />
              <div className="relative z-10 text-center px-6 max-w-md bg-[#090B10]/85 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
                <h2 className="font-display text-2xl font-bold tracking-wide text-white mb-2">
                  Ready for Gameplay Input
                </h2>
                <p className="text-sm text-slate-300 mb-5">
                  Load the built-in Test Mode clip to try real Gemini gameplay vision, Pakistani
                  Urdu voice, and live subtitles right away.
                </p>
                <button
                  type="button"
                  onClick={onLoadDemo}
                  disabled={isDemoLoading}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 transition-opacity disabled:opacity-50 whitespace-nowrap"
                >
                  {isDemoLoading ? 'Preparing Demo Video…' : 'Load Test Mode Demo'}
                </button>
              </div>
            </div>
          ) : source.kind === 'authorized_url' && !resolvedPlaybackUrl ? (
            <div className="text-center px-6 max-w-md">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-slate-200 font-medium mb-1">
                Server-Side RTMP Stream Selected
              </p>
              <p className="text-xs text-slate-400">
                Direct RTMP feeds ({source.externalUrl}) cannot play directly in browser HTML5
                video, but FFmpeg can ingest and broadcast them from the YouTube &amp; RTMP tab.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={resolvedPlaybackUrl}
              loop={source.kind === 'demo'}
              playsInline
              controls
              crossOrigin="anonymous"
              onError={() =>
                setVideoError(
                  'Browser could not decode this media URL directly. For CORS-protected streams, use Uploaded Video, Test Mode, or Screen Capture.'
                )
              }
              className="w-full h-full object-contain bg-black"
            />
          )}

          {videoError && (
            <div className="absolute inset-x-4 top-4 bg-red-950/90 border border-red-500/40 rounded-lg px-4 py-2.5 text-xs text-red-200">
              {videoError}
            </div>
          )}

          {/* Live Synchronized Urdu Subtitle Overlay */}
          {subtitles.enabled && activeCaption && (
            <div
              className={`pointer-events-none absolute inset-x-6 ${positionClass} flex justify-center z-20`}
            >
              <div
                className="max-w-3xl px-5 py-2.5 rounded-lg text-center border border-white/10 shadow-lg"
                style={{
                  backgroundColor: `rgba(9, 11, 16, ${subtitles.bgOpacity})`,
                  color: subtitles.textColor,
                }}
              >
                {showUrdu && (
                  <p
                    dir="rtl"
                    lang="ur"
                    className="leading-relaxed font-semibold"
                    style={{
                      fontFamily: subtitles.fontFamily,
                      fontSize: `${subtitles.fontSizePx}px`,
                    }}
                  >
                    {activeCaption.commentaryUrdu}
                  </p>
                )}
                {showRoman && (
                  <p className="text-xs sm:text-sm text-slate-200 font-medium mt-1">
                    {activeCaption.commentaryRoman}
                  </p>
                )}
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Transport & Audio Controls */}
        <div className="p-4 border-t border-white/10 bg-[#141923] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {streamStatus === 'idle' || streamStatus === 'paused' ? (
              <button
                type="button"
                onClick={onStartHost}
                disabled={!source}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4" />
                {streamStatus === 'paused' ? 'Resume AI Host' : 'Start AI Host'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseHost}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={onStopHost}
              disabled={streamStatus === 'idle'}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>

            <button
              type="button"
              onClick={onTriggerReaction}
              disabled={!source || isAnalyzingFrame}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4 text-[#FF7A59]" />
              React Now
            </button>
          </div>

          <div className="flex items-center gap-5 text-xs text-slate-300">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
              aria-label={muted ? 'Unmute studio audio' : 'Mute studio audio'}
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-slate-400">Game</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gameVolume}
                onChange={(e) => onGameVolumeChange(Number.parseFloat(e.target.value))}
                className="w-20 accent-[#FF4D6D]"
              />
            </label>

            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-slate-400">Urdu AI</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={voiceVolume}
                onChange={(e) => onVoiceVolumeChange(Number.parseFloat(e.target.value))}
                className="w-20 accent-[#FF7A59]"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }
);
