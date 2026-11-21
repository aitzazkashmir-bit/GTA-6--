import React, { useRef, useState } from 'react';
import {
  Film,
  Upload,
  Link2,
  MonitorUp,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { VideoSourceInfo } from '../types';

interface VideoSourceViewProps {
  activeSource: VideoSourceInfo | null;
  accessToken: string | null;
  onSourceSelected: (source: VideoSourceInfo, captureStream?: MediaStream | null) => void;
  onGoToStudio: () => void;
}

export const VideoSourceView: React.FC<VideoSourceViewProps> = ({
  activeSource,
  accessToken,
  onSourceSelected,
  onGoToStudio,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [loadingMode, setLoadingMode] = useState<'demo' | 'upload' | 'url' | 'screen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleLoadDemo = async () => {
    setError(null);
    setStatusMessage(null);
    setLoadingMode('demo');
    try {
      const data = await apiRequest<{ source: VideoSourceInfo }>('/api/media/demo', {
        method: 'POST',
      });
      onSourceSelected(data.source, null);
      setStatusMessage('Built-in Leonida Highway Pursuit demo video loaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo video.');
    } finally {
      setLoadingMode(null);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    setStatusMessage(null);
    setLoadingMode('upload');
    try {
      const formData = new FormData();
      formData.append('video', file);
      const data = await apiRequest<{ source: VideoSourceInfo }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      onSourceSelected(data.source, null);
      setStatusMessage(`Uploaded and probed "${file.name}" successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload video file.');
    } finally {
      setLoadingMode(null);
    }
  };

  const handleValidateUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setError(null);
    setStatusMessage(null);
    setLoadingMode('url');
    try {
      const data = await apiRequest<{ source: VideoSourceInfo }>(
        '/api/media/validate-url',
        {
          method: 'POST',
          body: JSON.stringify({ url: urlInput.trim() }),
        },
        accessToken
      );
      onSourceSelected(data.source, null);
      setStatusMessage('Authorized stream URL verified with ffprobe.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'URL validation failed.');
    } finally {
      setLoadingMode(null);
    }
  };

  const handleStartScreenCapture = async () => {
    setError(null);
    setStatusMessage(null);
    setLoadingMode('screen');
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen/window capture is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const data = await apiRequest<{ source: VideoSourceInfo }>('/api/media/source/screen', {
        method: 'POST',
        body: JSON.stringify({
          label: track?.label || 'Live Game Window / Capture Card',
          width: settings?.width,
          height: settings?.height,
        }),
      });
      onSourceSelected(data.source, stream);
      setStatusMessage('Live display capture connected. Switch to Live Studio to start commentary.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start display capture.');
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-white">
            Gameplay Video Source
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Provide an owned gameplay recording, authorized stream URL, live screen capture, or
            use Test Mode.
          </p>
        </div>
        {activeSource && (
          <button
            type="button"
            onClick={onGoToStudio}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 transition-opacity whitespace-nowrap"
          >
            Open in Live Studio
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/50 border border-red-500/35 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-100">Source Cannot Be Loaded</p>
            <p className="mt-1 text-red-200/90 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-sm text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Test Mode Demo */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="relative h-44 bg-[#090B10]">
            <img
              src="/src/assets/images/sample_thumb_chase_1795236995584.jpg"
              alt="Leonida Highway Pursuit demo frame"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#11151E] via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-200">
              <span className="font-semibold">Built-In Test Mode</span>
              <span className="font-mono-tabular text-slate-300">1280×720 · 24s · H.264</span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-[#FF7A59]" />
                01. Leonida Highway Pursuit Demo
              </h2>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                Playable local MP4 generated with FFmpeg. Ideal for testing Gemini gameplay vision,
                Pakistani Urdu TTS, and synchronized Urdu captions before connecting YouTube.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={loadingMode !== null}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 disabled:opacity-50 transition-opacity"
            >
              {loadingMode === 'demo' ? 'Generating & Loading Demo…' : 'Load Test Mode Video'}
            </button>
          </div>
        </div>

        {/* 2. Upload Owned Gameplay */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#FF7A59]" />
              02. Upload Owned Gameplay Recording
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Upload your own GTA 6 or gaming recording (MP4, MOV, or WebM up to 500 MB). Files are
              probed with FFprobe on the server for direct playback and FFmpeg broadcasting.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            className="border border-dashed border-white/20 rounded-xl p-6 text-center bg-[#0D1017] hover:border-[#FF7A59]/60 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <p className="text-sm text-slate-200 font-medium mb-1">
              Drop gameplay video here or browse disk
            </p>
            <p className="text-xs text-slate-400 mb-4">MP4 · MOV · WebM · MKV</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingMode !== null}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-colors disabled:opacity-50"
            >
              {loadingMode === 'upload' ? 'Uploading & Probing…' : 'Select Video File'}
            </button>
          </div>
        </div>

        {/* 3. Live Screen / Capture Card */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <MonitorUp className="w-4 h-4 text-[#FF7A59]" />
              03. Live Game Window or Capture Input
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Capture an active game window, console capture card preview, or authorized browser tab
              directly into the AI Gameplay Brain for live Urdu commentary.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartScreenCapture}
            disabled={loadingMode !== null}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-colors disabled:opacity-50"
          >
            {loadingMode === 'screen' ? 'Requesting Screen Permission…' : 'Connect Screen / Capture Input'}
          </button>
        </div>

        {/* 4. Authorized URL */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#FF7A59]" />
              04. Authorized Video or Stream URL
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Enter a direct, authorized MP4, HLS (.m3u8), or RTMP stream URL. Standard YouTube
              watch links are checked via the YouTube Data API and blocked from DRM/ToS ripping.
            </p>
          </div>

          <form onSubmit={handleValidateUrl} className="space-y-3">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/gameplay.mp4 or rtmp://..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FF7A59]"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                DRM &amp; YouTube ToS compliant
              </span>
              <button
                type="submit"
                disabled={loadingMode !== null || !urlInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {loadingMode === 'url' ? 'Validating…' : 'Validate & Load'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
