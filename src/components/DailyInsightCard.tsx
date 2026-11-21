import React from 'react';
import {
  ArrowUpRight,
  BookmarkPlus,
  ExternalLink,
  Globe,
  KeyRound,
  Newspaper,
  Quote,
  RefreshCw,
} from 'lucide-react';
import { DailyInsightData } from '../types';

interface DailyInsightCardProps {
  insight: DailyInsightData | null;
  kind: 'tech-news' | 'quote';
  loading: boolean;
  error: string | null;
  missingKey: boolean;
  onChangeKind: (kind: 'tech-news' | 'quote') => void;
  onRefresh: () => void;
  onExplore: (insight: DailyInsightData) => void;
  onSaveToVault: (insight: DailyInsightData) => void;
  onOpenApiKeys: () => void;
}

export const DailyInsightCard: React.FC<DailyInsightCardProps> = ({
  insight,
  kind,
  loading,
  error,
  missingKey,
  onChangeKind,
  onRefresh,
  onExplore,
  onSaveToVault,
  onOpenApiKeys,
}) => {
  return (
    <section
      aria-label="Daily Insight"
      className="w-full max-w-2xl mx-auto rounded-2xl border hud-hairline bg-[#0A0F1A]/85 backdrop-blur-md px-4 py-3.5 shadow-xl"
    >
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-cyan-500/12 border border-cyan-400/30 text-[#00F0FF] shrink-0">
            {kind === 'quote' ? <Quote className="w-3.5 h-3.5" /> : <Newspaper className="w-3.5 h-3.5" />}
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#00F0FF] font-semibold">
            Daily Insight
          </span>
          {insight?.topic && !loading && (
            <span className="px-2 py-0.5 rounded-md border border-slate-700/80 bg-[#060912] text-[10px] font-mono text-slate-300 truncate max-w-[130px]">
              {insight.topic}
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
            <Globe className="w-3 h-3 text-emerald-400/80" />
            <span>Search Grounded</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Kind Switch */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#060912] p-0.5 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => onChangeKind('tech-news')}
              disabled={loading}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                kind === 'tech-news'
                  ? 'bg-cyan-500/20 text-[#00F0FF]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tech News
            </button>
            <button
              type="button"
              onClick={() => onChangeKind('quote')}
              disabled={loading}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                kind === 'quote'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quote
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Fetch fresh insight via live web search"
            aria-label="Refresh Daily Insight"
            className="p-1.5 rounded-lg border border-slate-800 bg-[#060912] text-slate-400 hover:text-white hover:border-cyan-400/40 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00F0FF]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Card Body */}
      {loading ? (
        <div className="space-y-2 py-1">
          <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300/80">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
            <span>
              Searching web for {kind === 'quote' ? 'a verified daily quote' : "today's tech highlight"}...
            </span>
          </div>
          <div className="h-3.5 w-3/4 rounded bg-slate-800/70 animate-pulse" />
          <div className="h-3 w-full rounded bg-slate-800/50 animate-pulse" />
        </div>
      ) : error ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-1">
          <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
          <div className="flex items-center gap-2 shrink-0">
            {missingKey && (
              <button
                type="button"
                onClick={onOpenApiKeys}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 text-[11px] font-medium text-[#00F0FF] hover:bg-cyan-500/25 transition-colors"
              >
                <KeyRound className="w-3 h-3" />
                <span>API Keys</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-[#060912] text-[11px] text-slate-200 hover:border-cyan-400/40 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      ) : insight ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-white leading-snug">{insight.headline}</h3>
            <p className="text-xs text-slate-300 leading-relaxed mt-1">{insight.snippet}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/70">
            {/* Search Grounding Sources */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {insight.sources.length > 0 ? (
                insight.sources.map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-800 bg-[#060912] text-[10px] font-mono text-slate-400 hover:text-[#00F0FF] hover:border-cyan-400/35 transition-colors max-w-[175px]"
                    title={src.title}
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ))
              ) : (
                <span className="text-[10px] font-mono text-slate-500">
                  {insight.latencyMs ? `Fetched in ${insight.latencyMs} ms` : 'Live search verified'}
                </span>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onSaveToVault(insight)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-800 bg-[#060912] text-[11px] text-slate-300 hover:text-white hover:border-violet-400/40 transition-colors"
                title="Save insight to Knowledge Vault"
              >
                <BookmarkPlus className="w-3 h-3 text-violet-400" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => onExplore(insight)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-400/35 bg-cyan-500/12 text-[11px] font-medium text-[#00F0FF] hover:bg-cyan-500/20 transition-colors"
              >
                <span>Deep Dive</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
