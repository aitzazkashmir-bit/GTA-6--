import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Server } from 'lucide-react';
import type { SystemCapabilities } from '../types';

interface SystemGuideViewProps {
  capabilities: SystemCapabilities | null;
  wsConnected: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const SystemGuideView: React.FC<SystemGuideViewProps> = ({
  capabilities,
  wsConnected,
  isRefreshing,
  onRefresh,
}) => {
  const rows = [
    {
      name: 'Gemini Gameplay Brain (gemini-4-hydrogen)',
      ok: Boolean(capabilities?.geminiConfigured),
      detail: capabilities?.geminiConfigured
        ? 'Server GEMINI_API_KEY configured'
        : 'Missing GEMINI_API_KEY on server',
      requirement: 'Requires Gemini API Key (free tier works with rate limits; paid key lifts quotas)',
    },
    {
      name: 'Pakistani Urdu Male TTS (Gemini 3.8 Flash TTS)',
      ok: Boolean(capabilities?.geminiConfigured),
      detail: capabilities?.geminiConfigured
        ? 'gemini-3.8-flash-tts & gemini-3.8-flash-lite-tts ready'
        : 'Requires GEMINI_API_KEY',
      requirement: 'Included via Gemini API Key',
    },
    {
      name: 'FFmpeg Video / RTMP Compositor',
      ok: Boolean(capabilities?.ffmpegAvailable),
      detail: capabilities?.ffmpegAvailable
        ? `Version ${capabilities.ffmpegVersion}`
        : 'FFmpeg binary not found on server PATH',
      requirement: 'Requires persistent Node + FFmpeg host (Cloud Run, Railway, Fly.io, Render, VPS)',
    },
    {
      name: 'Real-Time WebSocket Sync',
      ok: wsConnected,
      detail: wsConnected ? 'Connected to /ws' : 'Disconnected / Reconnecting',
      requirement: 'Standard HTTP/WS server on port 3000',
    },
    {
      name: 'YouTube Data API & Google OAuth',
      ok: Boolean(capabilities?.firebaseOAuthConfigured),
      detail: capabilities?.firebaseOAuthConfigured
        ? 'Google OAuth client provisioned'
        : 'OAuth config missing',
      requirement: 'Channel must have YouTube Live Streaming enabled (24h activation on new channels)',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-white">
            System Diagnostics &amp; Deployment Guide
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live validation of backend binaries, API connections, and hosting requirements.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 border border-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Re-Run Validation
        </button>
      </div>

      <div className="bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-[#141923] text-xs text-slate-400">
              <th className="py-3 px-4 font-semibold">Component</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Live Check</th>
              <th className="py-3 px-4 font-semibold">External Requirement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-white/[0.02]">
                <td className="py-3.5 px-4 font-medium text-white">{r.name}</td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  {r.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      Action Needed
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-300 font-mono-tabular">{r.detail}</td>
                <td className="py-3.5 px-4 text-xs text-slate-400">{r.requirement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-[#FF7A59]" />
            Deployment &amp; Hosting Notes
          </h2>
          <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-white">Free-Tier Compatible Core:</strong> Frontend + Express
              API + Gemini API + Google OAuth run cleanly on Google Cloud Run, Render, or Railway.
            </li>
            <li>
              <strong className="text-white">FFmpeg Live Streaming:</strong> Static serverless hosts
              (like standard Vercel edge functions) cannot run long-lived FFmpeg RTMP processes. Use
              a Docker/Node container with <code className="text-[#FF7A59]">ffmpeg</code> installed
              and set <code className="text-[#FF7A59]">VITE_BACKEND_URL</code> or configure the URL
              in Settings.
            </li>
            <li>
              <strong className="text-white">Build &amp; Run:</strong>{' '}
              <code className="text-slate-200">npm install &amp;&amp; npm run build &amp;&amp; npm start</code>
            </li>
          </ul>
        </div>

        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-white">
            API Keys &amp; YouTube OAuth Requirements
          </h2>
          <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-white">GEMINI_API_KEY:</strong> Required server-side for
              multimodal gameplay understanding and Pakistani Urdu speech synthesis.
            </li>
            <li>
              <strong className="text-white">YouTube Channel Eligibility:</strong> Your Google
              account must have a YouTube channel with Live Streaming verified and enabled in
              YouTube Studio.
            </li>
            <li>
              <strong className="text-white">Google OAuth Verification:</strong> In testing mode,
              Google OAuth allows authorized test users. Publishing to external public streamers
              requires Google Cloud OAuth verification for the YouTube scope.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
