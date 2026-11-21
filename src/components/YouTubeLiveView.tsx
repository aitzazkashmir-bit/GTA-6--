import React, { useState } from 'react';
import {
  Radio,
  LogOut,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Play,
  Square,
  Terminal,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  FfmpegTelemetry,
  StudioSettings,
  VideoSourceInfo,
  YouTubeBroadcastState,
  YouTubeChannelInfo,
} from '../types';

interface YouTubeLiveViewProps {
  accessToken: string | null;
  channel: YouTubeChannelInfo | null;
  isLoggingIn: boolean;
  onGoogleLogin: () => void;
  onLogout: () => void;
  activeSource: VideoSourceInfo | null;
  activeBroadcast: YouTubeBroadcastState | null;
  ffmpeg: FfmpegTelemetry;
  settings: StudioSettings;
  onBroadcastUpdated: (broadcast: YouTubeBroadcastState | null) => void;
}

export const YouTubeLiveView: React.FC<YouTubeLiveViewProps> = ({
  accessToken,
  channel,
  isLoggingIn,
  onGoogleLogin,
  onLogout,
  activeSource,
  activeBroadcast,
  ffmpeg,
  settings,
  onBroadcastUpdated,
}) => {
  const [title, setTitle] = useState('GTA 6 Live Gameplay — Pakistani Urdu AI Commentary');
  const [description, setDescription] = useState(
    'Live Pakistani Urdu gaming commentary with real-time Urdu subtitles.'
  );
  const [privacyStatus, setPrivacyStatus] = useState<'unlisted' | 'public' | 'private'>('unlisted');
  const [customRtmpUrl, setCustomRtmpUrl] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: 'live' | 'complete';
    label: string;
    detail: string;
  } | null>(null);

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setBusyAction('create');
    try {
      const resolution = settings.streamQuality === '720p30' ? '720p' : '1080p';
      const frameRate = settings.streamQuality === '1080p60' ? '60fps' : '30fps';
      const data = await apiRequest<{ broadcast: YouTubeBroadcastState }>(
        '/api/youtube/broadcast',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            description,
            privacyStatus,
            resolution,
            frameRate,
          }),
        },
        accessToken
      );
      onBroadcastUpdated(data.broadcast);
      setNotice('YouTube Live Broadcast created and bound to RTMP ingest on server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create YouTube broadcast.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartFfmpeg = async (mode: 'youtube_rtmp' | 'custom_rtmp' | 'local_preview') => {
    setError(null);
    setNotice(null);
    setBusyAction(`ffmpeg-${mode}`);
    try {
      await apiRequest('/api/stream/ffmpeg/start', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          broadcastId: activeBroadcast?.broadcastId,
          customRtmpUrl: mode === 'custom_rtmp' ? customRtmpUrl : undefined,
          quality: settings.streamQuality,
          subtitleSettings: settings.subtitles,
        }),
      });
      setNotice(
        mode === 'local_preview'
          ? 'FFmpeg local 20-second encode check started.'
          : 'FFmpeg live RTMP pipeline started.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start FFmpeg pipeline.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStopFfmpeg = async () => {
    setError(null);
    setBusyAction('ffmpeg-stop');
    try {
      await apiRequest('/api/stream/ffmpeg/stop', { method: 'POST' });
      setNotice('FFmpeg encoder stopped.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop FFmpeg.');
    } finally {
      setBusyAction(null);
    }
  };

  const executeBroadcastTransition = async (status: 'testing' | 'live' | 'complete') => {
    if (!accessToken || !activeBroadcast) return;
    setPendingConfirm(null);
    setError(null);
    setNotice(null);
    setBusyAction(`transition-${status}`);
    try {
      const data = await apiRequest<{ lifeCycleStatus: string }>(
        '/api/youtube/broadcast/transition',
        {
          method: 'POST',
          body: JSON.stringify({
            broadcastId: activeBroadcast.broadcastId,
            broadcastStatus: status,
          }),
        },
        accessToken
      );
      onBroadcastUpdated({
        ...activeBroadcast,
        lifeCycleStatus: data.lifeCycleStatus,
      });
      setNotice(`YouTube broadcast transitioned to "${data.lifeCycleStatus}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast transition failed.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide text-white">
          YouTube Live &amp; FFmpeg Broadcast
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect your YouTube channel via Google OAuth, create a broadcast, and push audio/video
          via server-side FFmpeg. Stream keys stay strictly on the server.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/50 border border-red-500/35 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-sm text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Confirmation Modal for mutating YouTube Broadcast state */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#141923] border border-white/15 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">{pendingConfirm.label}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{pendingConfirm.detail}</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeBroadcastTransition(pendingConfirm.action)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Connection Card */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-semibold text-white">01. YouTube Channel Connection</h2>

          {!accessToken || !channel ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Sign in with your Google account that owns the YouTube channel. Your OAuth token is
                kept in memory only during this session and sent over Bearer authorization headers.
              </p>
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isLoggingIn ? 'Connecting Google Account…' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-[#090B10] border border-white/10">
                <div className="flex items-center gap-3 min-w-0">
                  {channel.thumbnailUrl && (
                    <img
                      src={channel.thumbnailUrl}
                      alt={channel.title}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border border-white/15 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{channel.title}</p>
                    <p className="text-xs text-slate-400 font-mono-tabular truncate">
                      {channel.customUrl || channel.id}
                      {channel.subscriberCount ? ` · ${channel.subscriberCount} subscribers` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>

              <form onSubmit={handleCreateBroadcast} className="space-y-3 pt-2 border-t border-white/10">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-300">Broadcast Title</span>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white focus:outline-none focus:border-[#FF7A59]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-300">Description</span>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white focus:outline-none focus:border-[#FF7A59]"
                  />
                </label>

                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <span>Privacy</span>
                    <select
                      value={privacyStatus}
                      onChange={(e) =>
                        setPrivacyStatus(e.target.value as 'unlisted' | 'public' | 'private')
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
                    >
                      <option value="unlisted">Unlisted (Recommended Test)</option>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
                  >
                    {busyAction === 'create' ? 'Creating Broadcast…' : 'Create Live Broadcast'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* FFmpeg Stream & Broadcast Lifecycle */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">02. FFmpeg Broadcast Pipeline</h2>
            <span className="text-xs font-mono-tabular text-slate-400">
              {settings.streamQuality}
            </span>
          </div>

          {activeBroadcast ? (
            <div className="p-4 rounded-lg bg-[#090B10] border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white truncate">{activeBroadcast.title}</span>
                <span className="text-emerald-400 font-mono-tabular">
                  {activeBroadcast.lifeCycleStatus}
                </span>
              </div>
              <p className="text-slate-400 font-mono-tabular truncate">
                Server Ingest: {activeBroadcast.maskedIngestionUrl}
              </p>
              <a
                href={activeBroadcast.watchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[#FF7A59] hover:underline"
              >
                Open Broadcast Watch Page <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Active Video Source:{' '}
              <span className="text-slate-200 font-medium">
                {activeSource ? activeSource.label : 'None selected'}
              </span>
            </p>
          )}

          <div className="flex flex-wrap gap-2.5">
            {activeBroadcast && (
              <button
                type="button"
                onClick={() => handleStartFfmpeg('youtube_rtmp')}
                disabled={busyAction !== null || ffmpeg.active || !activeSource}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] disabled:opacity-45"
              >
                <Radio className="w-4 h-4" />
                Push FFmpeg to YouTube
              </button>
            )}

            <button
              type="button"
              onClick={() => handleStartFfmpeg('local_preview')}
              disabled={busyAction !== null || ffmpeg.active || !activeSource}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-45"
            >
              <Play className="w-4 h-4" />
              Test FFmpeg Encode (20s)
            </button>

            {ffmpeg.active && (
              <button
                type="button"
                onClick={handleStopFfmpeg}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-red-200 bg-red-500/20 border border-red-500/35 hover:bg-red-500/30"
              >
                <Square className="w-4 h-4" />
                Stop FFmpeg
              </button>
            )}
          </div>

          {activeBroadcast && (
            <div className="flex flex-wrap gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => executeBroadcastTransition('testing')}
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Move to Testing
              </button>
              <button
                type="button"
                onClick={() =>
                  setPendingConfirm({
                    action: 'live',
                    label: 'Go Live on YouTube?',
                    detail: `This will transition "${activeBroadcast.title}" (${activeBroadcast.privacyStatus}) to LIVE on your YouTube channel.`,
                  })
                }
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-200 bg-emerald-600/25 border border-emerald-500/35 hover:bg-emerald-600/35"
              >
                Transition to LIVE
              </button>
              <button
                type="button"
                onClick={() =>
                  setPendingConfirm({
                    action: 'complete',
                    label: 'End YouTube Broadcast?',
                    detail:
                      'Ending a YouTube Live broadcast is permanent for this broadcast ID and stops FFmpeg streaming.',
                  })
                }
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-200 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25"
              >
                End Broadcast
              </button>
            </div>
          )}

          {/* Optional Custom RTMP */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <span className="text-xs font-medium text-slate-300 block">
              Or Push to Custom Authorized RTMP Server
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={customRtmpUrl}
                onChange={(e) => setCustomRtmpUrl(e.target.value)}
                placeholder="rtmp://host/live/stream_key"
                className="flex-1 px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-xs text-white font-mono-tabular"
              />
              <button
                type="button"
                onClick={() => handleStartFfmpeg('custom_rtmp')}
                disabled={ffmpeg.active || !customRtmpUrl.startsWith('rtmp://') || !activeSource}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/15 disabled:opacity-40 whitespace-nowrap"
              >
                Push RTMP
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Real FFmpeg Metrics & Log Panel */}
      <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Terminal className="w-4 h-4 text-[#FF7A59]" />
            FFmpeg Encoder Telemetry
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-mono-tabular">
            <span>State: {ffmpeg.active ? `Active (${ffmpeg.mode})` : 'Idle'}</span>
            <span>FPS: {ffmpeg.fps}</span>
            <span>Bitrate: {ffmpeg.bitrateKbps} kbps</span>
            <span>Frames: {ffmpeg.frameCount}</span>
            <span>Timecode: {ffmpeg.outTime}</span>
          </div>
        </div>
        <div className="bg-[#090B10] border border-white/10 rounded-lg p-3 max-h-40 overflow-y-auto font-mono-tabular text-xs text-slate-400 space-y-1">
          {ffmpeg.recentLogs.length === 0 ? (
            <p>FFmpeg idle. Start a local encode test or YouTube RTMP push to inspect live logs.</p>
          ) : (
            ffmpeg.recentLogs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
};
