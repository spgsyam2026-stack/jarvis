import React from 'react';
import { ArrowUpRight, Mic, RotateCcw } from 'lucide-react';
import { VoiceLogEntry } from '../types';

interface VoiceCommandHistoryCardProps {
  voiceLogs: VoiceLogEntry[];
  isSending: boolean;
  onRerun: (entry: VoiceLogEntry) => void;
  onOpenFullLog: () => void;
  onTriggerVoiceCapture: () => void;
}

function formatShortTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getSourceMeta(source: VoiceLogEntry['source']) {
  if (source === 'wake-word') {
    return {
      label: 'Wake',
      className: 'border-sky-400/35 bg-sky-500/12 text-sky-300',
    };
  }
  if (source === 'audio-transcribe') {
    return {
      label: 'Audio',
      className: 'border-violet-400/35 bg-violet-500/12 text-violet-300',
    };
  }
  return {
    label: 'Mic',
    className: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300',
  };
}

export const VoiceCommandHistoryCard: React.FC<VoiceCommandHistoryCardProps> = ({
  voiceLogs,
  isSending,
  onRerun,
  onOpenFullLog,
  onTriggerVoiceCapture,
}) => {
  const recentLogs = voiceLogs.slice(0, 4);

  return (
    <section
      aria-label="Voice Command History"
      className="w-full rounded-2xl border hud-hairline bg-[#0A0F1A]/85 backdrop-blur-md px-4 py-3.5 shadow-xl flex flex-col justify-between"
    >
      {/* Header Strip */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/12 border border-emerald-400/30 text-emerald-300 shrink-0">
            <Mic className="w-3.5 h-3.5" />
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-emerald-300 font-semibold truncate">
            Voice Command History
          </span>
          <span className="px-1.5 py-0.5 rounded-md border border-slate-700/80 bg-[#060912] text-[10px] font-mono tabular-nums text-slate-300 shrink-0">
            {voiceLogs.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenFullLog}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-[#060912] text-[10px] font-mono text-slate-400 hover:text-[#00F0FF] hover:border-cyan-400/40 transition-colors shrink-0"
          title="Open complete Voice Log in Workspace"
        >
          <span>Full Log</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      {recentLogs.length === 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-slate-200">No voice commands captured yet</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use the microphone or say your wake phrase to record commands for 1-click replay.
            </p>
          </div>
          <button
            type="button"
            onClick={onTriggerVoiceCapture}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors shrink-0"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Speak Command</span>
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {recentLogs.map((entry) => {
            const sourceMeta = getSourceMeta(entry.source);
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-800/80 bg-[#060912]/80 px-2.5 py-1.5 hover:border-slate-700 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`px-1.5 py-0.2 rounded border text-[9px] font-mono uppercase tracking-wider shrink-0 ${sourceMeta.className}`}
                    >
                      {sourceMeta.label}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                      {formatShortTime(entry.timestamp)}
                    </span>
                    {typeof entry.confidencePct === 'number' && (
                      <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                        · {entry.confidencePct}%
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs text-slate-200 truncate"
                    title={entry.transcript}
                  >
                    {entry.transcript}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onRerun(entry)}
                  disabled={isSending}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-400/35 bg-cyan-500/12 text-[11px] font-medium text-[#00F0FF] hover:bg-cyan-500/22 transition-colors disabled:opacity-40 shrink-0"
                  title={`Re-run "${entry.transcript}"`}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-run</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
