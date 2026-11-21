import React from 'react';
import { Volume2, Mic, AlertCircle } from 'lucide-react';
import type { CommentaryItem } from '../types';

interface CommentaryFeedProps {
  items: CommentaryItem[];
  isAnalyzing: boolean;
  onPlayClip: (item: CommentaryItem) => void;
  activePlayingId: string | null;
}

const EVENT_LABELS: Record<CommentaryItem['eventType'], string> = {
  driving: 'Highway Drive',
  police_chase: 'Police Chase',
  crash: 'Collision',
  combat: 'Action / Combat',
  mission: 'Mission Moment',
  comedy: 'Comedy Moment',
  exploration: 'Freeroam',
};

export const CommentaryFeed: React.FC<CommentaryFeedProps> = ({
  items,
  isAnalyzing,
  onPlayClip,
  activePlayingId,
}) => {
  return (
    <div className="bg-[#11151E] border border-white/10 rounded-xl flex flex-col h-full min-h-[420px]">
      <div className="px-4 py-3 border-b border-white/10 bg-[#141923] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mic className="w-4 h-4 text-[#FF7A59]" />
          <h2 className="text-sm font-semibold text-white">AI Urdu Commentary Feed</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular">
          {items.length} clips
        </span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/10 max-h-[540px]">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <img
              src="/src/assets/images/urdu_host_avatar_1795236995523.jpg"
              alt="Pakistani Urdu AI gaming host avatar"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border border-white/15"
            />
            <p className="text-sm font-medium text-slate-200 mb-1">
              AI Host Listening to Gameplay
            </p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Start the AI Host or click React Now. Gemini inspects the live frame and speaks
              authentic Pakistani Urdu commentary with synchronized subtitles.
            </p>
          </div>
        ) : (
          items
            .slice()
            .reverse()
            .map((item) => (
              <div key={item.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[#FF7A59]">
                      {EVENT_LABELS[item.eventType]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {item.videoTimeSec.toFixed(1)}s
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{item.latencyMs}ms</span>
                  </div>

                  {(item.audioUrl || item.audioBase64) && (
                    <button
                      type="button"
                      onClick={() => onPlayClip(item)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        activePlayingId === item.id
                          ? 'bg-[#FF4D6D] text-white'
                          : 'bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {activePlayingId === item.id ? 'Playing' : 'Play'}
                    </button>
                  )}
                </div>

                <p dir="rtl" lang="ur" className="font-urdu text-base text-white mb-1.5">
                  {item.commentaryUrdu}
                </p>
                <p className="text-sm text-slate-200 leading-snug mb-1.5">
                  {item.commentaryRoman}
                </p>
                <p className="text-xs text-slate-400">
                  Scene: {item.sceneSummary}
                </p>

                {item.ttsError && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Voice error: {item.ttsError}</span>
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {isAnalyzing && (
        <div className="px-4 py-2.5 border-t border-white/10 bg-[#141923] text-xs text-amber-300">
          Analyzing current gameplay frame with Gemini…
        </div>
      )}
    </div>
  );
};
