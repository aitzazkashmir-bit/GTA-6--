import React, { useState } from 'react';
import { Volume2, AlertCircle, CheckCircle2, Save } from 'lucide-react';
import {
  apiRequest,
  getBackendBaseUrl,
  setBackendBaseUrl,
} from '../lib/api';
import type {
  StreamQualityPreset,
  StudioSettings,
  TtsModelId,
  VoicePersonaId,
} from '../types';

interface SettingsViewProps {
  settings: StudioSettings;
  onChange: (next: StudioSettings) => void;
}

const VOICE_OPTIONS: Array<{ id: VoicePersonaId; title: string; note: string }> = [
  { id: 'Fenrir', title: 'Kamran (Deep Bold Karachi Gamer)', note: 'Confident, punchy male delivery' },
  { id: 'Charon', title: 'Bilal (Lahori Storyteller)', note: 'Warm, expressive comedy & banter' },
  { id: 'Puck', title: 'Hamza (Fast-Paced Hype Streamer)', note: 'High-energy action reactions' },
];

const COLOR_SWATCHES = ['#FFFFFF', '#FDE047', '#67E8F9', '#FDA4AF'];

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onChange }) => {
  const [testingVoice, setTestingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [backendUrlInput, setBackendUrlInput] = useState(() => getBackendBaseUrl());
  const [backendSaved, setBackendSaved] = useState(false);

  const handleTestVoice = async () => {
    setVoiceError(null);
    setTestingVoice(true);
    try {
      const res = await apiRequest<{ audioBase64: string; audioMimeType: string }>(
        '/api/tts/test',
        {
          method: 'POST',
          body: JSON.stringify({
            voiceId: settings.voiceId,
            ttsModel: settings.ttsModel,
            speed: settings.commentarySpeed,
          }),
        }
      );
      const audio = new Audio(`data:${res.audioMimeType};base64,${res.audioBase64}`);
      await audio.play();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not synthesize voice test.');
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setBackendBaseUrl(backendUrlInput);
    setBackendSaved(true);
    setTimeout(() => setBackendSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide text-white">
          Voice, Subtitles &amp; Studio Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure Pakistani Urdu male TTS voice persona, commentary pacing, subtitle styling, and
          stream quality without editing code.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Voice & AI Commentary Brain */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">01. Pakistani Urdu Male Voice</h2>
            <button
              type="button"
              onClick={handleTestVoice}
              disabled={testingVoice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#FF4D6D] to-[#FF7A59] hover:opacity-95 disabled:opacity-50"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {testingVoice ? 'Synthesizing…' : 'Test Urdu Voice'}
            </button>
          </div>

          {voiceError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{voiceError}</span>
            </div>
          )}

          <div className="space-y-2.5">
            {VOICE_OPTIONS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange({ ...settings, voiceId: v.id })}
                className={`w-full text-left p-3.5 rounded-lg border transition-colors ${
                  settings.voiceId === v.id
                    ? 'bg-[#FF4D6D]/10 border-[#FF4D6D]/60 text-white'
                    : 'bg-[#090B10] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <div className="text-sm font-semibold">{v.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{v.note}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Gemini TTS Model</span>
              <select
                value={settings.ttsModel}
                onChange={(e) =>
                  onChange({ ...settings, ttsModel: e.target.value as TtsModelId })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS (Expressive)</option>
                <option value="gemini-3.8-flash-lite-tts">
                  Gemini 3.8 Flash-Lite TTS (Low Latency)
                </option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Humor Level</span>
              <select
                value={settings.humorLevel}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    humorLevel: e.target.value as StudioSettings['humorLevel'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="high">High (Desi Gamer Banter)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="low">Low (Focused Play-by-Play)</option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium flex justify-between">
                <span>Commentary Speed</span>
                <span className="font-mono-tabular">{settings.commentarySpeed.toFixed(2)}×</span>
              </span>
              <input
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={settings.commentarySpeed}
                onChange={(e) =>
                  onChange({ ...settings, commentarySpeed: Number.parseFloat(e.target.value) })
                }
                className="w-full accent-[#FF4D6D]"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium flex justify-between">
                <span>Reaction Frequency</span>
                <span className="font-mono-tabular">Every {settings.commentaryIntervalSec}s</span>
              </span>
              <input
                type="range"
                min={6}
                max={20}
                step={2}
                value={settings.commentaryIntervalSec}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    commentaryIntervalSec: Number.parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-[#FF7A59]"
              />
            </label>
          </div>
        </div>

        {/* Subtitle Engine Settings */}
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">02. Urdu Subtitle Engine</h2>
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.subtitles.enabled}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    subtitles: { ...settings.subtitles, enabled: e.target.checked },
                  })
                }
                className="accent-[#FF4D6D] w-4 h-4"
              />
              Enable Captions
            </label>
          </div>

          {/* Live Caption Preview Box */}
          <div className="rounded-lg bg-[#07090D] border border-white/10 p-4 text-center">
            <div
              className="inline-block px-4 py-2 rounded-lg"
              style={{
                backgroundColor: `rgba(9, 11, 16, ${settings.subtitles.bgOpacity})`,
                color: settings.subtitles.textColor,
              }}
            >
              {settings.subtitles.scriptMode !== 'roman' && (
                <p
                  dir="rtl"
                  lang="ur"
                  style={{
                    fontFamily: settings.subtitles.fontFamily,
                    fontSize: `${settings.subtitles.fontSizePx}px`,
                  }}
                >
                  او بھائی سین چیک کرو، فل اسپیڈ میں ڈرفٹ ماری ہے!
                </p>
              )}
              {settings.subtitles.scriptMode !== 'urdu' && (
                <p className="text-xs text-slate-200 mt-1">
                  O bhai scene check karo, full speed mein drift maari hai!
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Caption Language Mode</span>
              <select
                value={settings.subtitles.scriptMode}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    subtitles: {
                      ...settings.subtitles,
                      scriptMode: e.target.value as StudioSettings['subtitles']['scriptMode'],
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="dual">Dual (Urdu Script + Roman Urdu)</option>
                <option value="urdu">Urdu Script Only (اردو)</option>
                <option value="roman">Roman Urdu Only</option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Urdu Font Family</span>
              <select
                value={settings.subtitles.fontFamily}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    subtitles: {
                      ...settings.subtitles,
                      fontFamily: e.target.value as StudioSettings['subtitles']['fontFamily'],
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="Noto Nastaliq Urdu">Noto Nastaliq Urdu</option>
                <option value="Noto Sans Arabic">Noto Sans Arabic (Clean)</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Position</span>
              <select
                value={settings.subtitles.position}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    subtitles: {
                      ...settings.subtitles,
                      position: e.target.value as StudioSettings['subtitles']['position'],
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="bottom">Bottom Third</option>
                <option value="center_low">Raised Above HUD</option>
                <option value="top">Top Overlay</option>
              </select>
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium flex justify-between">
                <span>Font Size</span>
                <span className="font-mono-tabular">{settings.subtitles.fontSizePx}px</span>
              </span>
              <input
                type="range"
                min={18}
                max={38}
                step={2}
                value={settings.subtitles.fontSizePx}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    subtitles: {
                      ...settings.subtitles,
                      fontSizePx: Number.parseInt(e.target.value, 10),
                    },
                  })
                }
                className="w-full accent-[#FF4D6D]"
              />
            </label>

            <div className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Subtitle Color</span>
              <div className="flex items-center gap-2.5 pt-1">
                {COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Select color ${hex}`}
                    onClick={() =>
                      onChange({
                        ...settings,
                        subtitles: { ...settings.subtitles, textColor: hex },
                      })
                    }
                    className={`w-7 h-7 rounded-full border-2 ${
                      settings.subtitles.textColor === hex
                        ? 'border-[#FF4D6D] scale-110'
                        : 'border-white/20'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-300 font-medium block">Broadcast Quality</span>
              <select
                value={settings.streamQuality}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    streamQuality: e.target.value as StreamQualityPreset,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white"
              >
                <option value="720p30">720p @ 30fps (Free-Tier Friendly)</option>
                <option value="1080p30">1080p @ 30fps (Full HD)</option>
                <option value="1080p60">1080p @ 60fps (High Bitrate)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Configurable Backend URL */}
      <form
        onSubmit={handleSaveBackendUrl}
        className="bg-[#11151E] border border-white/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-semibold text-white block">
            Configurable Backend API URL
          </label>
          <p className="text-xs text-slate-400">
            Leave blank to use the same origin, or point to an external Node + FFmpeg container URL.
          </p>
          <input
            type="text"
            value={backendUrlInput}
            onChange={(e) => setBackendUrlInput(e.target.value)}
            placeholder="https://your-streaming-backend.example.com (blank = same origin)"
            className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/15 text-sm text-white font-mono-tabular"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 whitespace-nowrap"
        >
          {backendSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Backend URL
            </>
          )}
        </button>
      </form>
    </div>
  );
};
