import React, { useMemo, useState } from 'react';
import {
  Activity,
  AudioLines,
  BarChart3,
  BookMarked,
  CalendarDays,
  CheckSquare,
  CornerDownLeft,
  List,
  Mic,
  Pin,
  Plus,
  Search,
  Square,
  Trash2,
  Wrench,
  Play,
} from 'lucide-react';
import {
  CustomWebhookTool,
  MissionItem,
  TelemetryEvent,
  VaultNote,
  VoiceLogEntry,
  VoicePerformanceSample,
  WorkflowMacro,
} from '../types';
import {
  buildMissionTimelineBuckets,
  getUpcomingDaySlots,
  resolveMissionSchedule,
} from '../lib/missionTimeline';

export type InspectorTab = 'missions' | 'vault' | 'voice' | 'voicePerf' | 'tools' | 'telemetry';

interface InspectorDrawerProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  missions: MissionItem[];
  onAddMission: (title: string, priority: 'P1' | 'P2' | 'P3', dueLabel?: string) => void;
  onToggleMission: (id: string) => void;
  onUpdateMissionDue: (id: string, dueLabel: string) => void;
  onDeleteMission: (id: string) => void;
  notes: VaultNote[];
  onAddNote: (title: string, content: string, tags: string[]) => void;
  onTogglePinNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  voiceLogs: VoiceLogEntry[];
  onReplayVoiceLog: (entry: VoiceLogEntry) => void;
  onLoadVoiceLogToInput: (transcript: string) => void;
  onDeleteVoiceLog: (id: string) => void;
  onClearVoiceLogs: () => void;
  voicePerf: VoicePerformanceSample[];
  onClearVoicePerf: () => void;
  onTriggerVoiceCapture: () => void;
  macros: WorkflowMacro[];
  onRunMacro: (macro: WorkflowMacro) => void;
  onAddMacro: (name: string, command: string, prompt: string) => void;
  customTools: CustomWebhookTool[];
  telemetry: TelemetryEvent[];
  onOpenApiMatrix: () => void;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  activeTab,
  onChangeTab,
  missions,
  onAddMission,
  onToggleMission,
  onUpdateMissionDue,
  onDeleteMission,
  notes,
  onAddNote,
  onTogglePinNote,
  onDeleteNote,
  voiceLogs,
  onReplayVoiceLog,
  onLoadVoiceLogToInput,
  onDeleteVoiceLog,
  onClearVoiceLogs,
  voicePerf,
  onClearVoicePerf,
  onTriggerVoiceCapture,
  macros,
  onRunMacro,
  onAddMacro,
  customTools,
  telemetry,
  onOpenApiMatrix,
}) => {
  const [missionView, setMissionView] = useState<'list' | 'timeline'>('list');
  const [missionFilter, setMissionFilter] = useState<'all' | 'active' | 'done'>('all');
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [newMissionPriority, setNewMissionPriority] = useState<'P1' | 'P2' | 'P3'>('P2');
  const [newMissionDue, setNewMissionDue] = useState('Today');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const [noteSearch, setNoteSearch] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');

  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedPerfId, setSelectedPerfId] = useState<string | null>(null);

  const [newMacroName, setNewMacroName] = useState('');
  const [newMacroCmd, setNewMacroCmd] = useState('');
  const [newMacroPrompt, setNewMacroPrompt] = useState('');

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => (missionFilter === 'all' ? true : m.status === missionFilter));
  }, [missions, missionFilter]);

  const upcomingDaySlots = useMemo(() => getUpcomingDaySlots(7), []);

  const dayMissionDots = useMemo(() => {
    const map = new Map<string, { activeP1: number; activeOther: number; done: number }>();
    for (const m of missions) {
      const sched = resolveMissionSchedule(m);
      if (!sched.dateKey) continue;
      const curr = map.get(sched.dateKey) || { activeP1: 0, activeOther: 0, done: 0 };
      if (m.status === 'done') {
        curr.done += 1;
      } else if (m.priority === 'P1') {
        curr.activeP1 += 1;
      } else {
        curr.activeOther += 1;
      }
      map.set(sched.dateKey, curr);
    }
    return map;
  }, [missions]);

  const timelineBuckets = useMemo(() => {
    const buckets = buildMissionTimelineBuckets(filteredMissions);
    if (!selectedDayKey) return buckets;
    return buckets.filter((b) => b.dateKey === selectedDayKey);
  }, [filteredMissions, selectedDayKey]);

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const list = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    if (!q) return list;
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [notes, noteSearch]);

  const filteredVoiceLogs = useMemo(() => {
    const recent = voiceLogs.slice(0, 20);
    const q = voiceSearch.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter(
      (entry) =>
        entry.transcript.toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q) ||
        (entry.wakePhrase && entry.wakePhrase.toLowerCase().includes(q)),
    );
  }, [voiceLogs, voiceSearch]);

  const latencyPoints = useMemo(() => {
    const slice = telemetry.slice(-20);
    if (slice.length === 0) return '';
    const maxLat = Math.max(200, ...slice.map((t) => t.latencyMs));
    return slice
      .map((t, i) => {
        const x = slice.length === 1 ? 140 : (i / (slice.length - 1)) * 270;
        const y = 56 - Math.min(50, (t.latencyMs / maxLat) * 50);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [telemetry]);

  const avgLatency = useMemo(() => {
    if (telemetry.length === 0) return 0;
    return Math.round(telemetry.reduce((acc, t) => acc + t.latencyMs, 0) / telemetry.length);
  }, [telemetry]);

  const totalTokens = useMemo(() => telemetry.reduce((acc, t) => acc + t.tokens, 0), [telemetry]);

  const voicePerfMetrics = useMemo(() => {
    const slice = voicePerf.slice(-16);
    if (slice.length === 0) {
      return {
        slice: [] as VoicePerformanceSample[],
        avgAccuracy: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 600,
        accuracyPoints: '',
        accuracyAreaPoints: '',
      };
    }

    const avgAccuracy =
      Math.round(
        (slice.reduce((acc, s) => acc + s.sttAccuracyPct, 0) / slice.length) * 10,
      ) / 10;

    const completedLatencies = slice.filter((s) => s.commandLatencyMs > 0);
    const avgLatencyMs =
      completedLatencies.length > 0
        ? Math.round(
            completedLatencies.reduce((acc, s) => acc + s.commandLatencyMs, 0) /
              completedLatencies.length,
          )
        : 0;
    const minLatencyMs =
      completedLatencies.length > 0
        ? Math.min(...completedLatencies.map((s) => s.commandLatencyMs))
        : 0;
    const maxLatencyMs = Math.max(
      400,
      ...slice.map((s) => Math.max(s.commandLatencyMs, s.sttLatencyMs)),
    );

    const chartW = 280;
    const chartH = 72;
    const coords = slice.map((s, idx) => {
      const x = slice.length === 1 ? chartW / 2 : 8 + (idx / (slice.length - 1)) * (chartW - 16);
      const y = chartH - 6 - (Math.min(100, Math.max(0, s.sttAccuracyPct)) / 100) * (chartH - 14);
      return { x, y, sample: s };
    });

    const accuracyPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const accuracyAreaPoints =
      coords.length > 1
        ? `${coords[0].x.toFixed(1)},${chartH} ${accuracyPoints} ${coords[coords.length - 1].x.toFixed(1)},${chartH}`
        : '';

    return {
      slice,
      avgAccuracy,
      avgLatencyMs,
      minLatencyMs,
      maxLatencyMs,
      coords,
      accuracyPoints,
      accuracyAreaPoints,
    };
  }, [voicePerf]);

  const activePerfSample = useMemo(() => {
    if (voicePerfMetrics.slice.length === 0) return null;
    if (selectedPerfId) {
      const found = voicePerfMetrics.slice.find((s) => s.id === selectedPerfId);
      if (found) return found;
    }
    return voicePerfMetrics.slice[voicePerfMetrics.slice.length - 1];
  }, [voicePerfMetrics.slice, selectedPerfId]);

  return (
    <aside className="w-[345px] sm:w-[410px] shrink-0 border-l hud-hairline bg-[#070B14] flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b hud-hairline bg-[#090E1A]">
        {(
          [
            { id: 'missions', label: 'Missions', icon: CheckSquare },
            { id: 'vault', label: 'Vault', icon: BookMarked },
            { id: 'voice', label: 'Voice Log', icon: AudioLines },
            { id: 'voicePerf', label: 'Voice Perf', icon: BarChart3 },
            { id: 'tools', label: 'Macros', icon: Wrench },
            { id: 'telemetry', label: 'Metrics', icon: Activity },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`flex-1 min-w-[64px] flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-[#00F0FF] text-[#00F0FF] bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {activeTab === 'missions' && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMissionTitle.trim()) return;
                onAddMission(
                  newMissionTitle.trim(),
                  newMissionPriority,
                  newMissionDue.trim() || 'Today',
                );
                setNewMissionTitle('');
              }}
              className="space-y-2 pb-3 border-b hud-hairline"
            >
              <input
                type="text"
                value={newMissionTitle}
                onChange={(e) => setNewMissionTitle(e.target.value)}
                placeholder="Add new mission or reminder..."
                className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/50"
              />
              <div className="flex items-center gap-1.5">
                <select
                  value={newMissionPriority}
                  onChange={(e) => setNewMissionPriority(e.target.value as 'P1' | 'P2' | 'P3')}
                  aria-label="Mission priority"
                  className="px-2 py-1 rounded-md border hud-hairline bg-[#0A0F1A] text-[11px] font-mono text-slate-300 shrink-0"
                >
                  <option value="P1">P1 · Crit</option>
                  <option value="P2">P2 · Std</option>
                  <option value="P3">P3 · Low</option>
                </select>
                <input
                  type="text"
                  list="aether-due-presets"
                  value={newMissionDue}
                  onChange={(e) => setNewMissionDue(e.target.value)}
                  placeholder="Due (Today, Nov 24...)"
                  aria-label="Mission due label"
                  className="flex-1 min-w-0 px-2 py-1 rounded-md border hud-hairline bg-[#0A0F1A] text-[11px] font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/50"
                />
                <datalist id="aether-due-presets">
                  <option value="Today" />
                  <option value="Tomorrow" />
                  <option value="This Week" />
                  <option value="Next Week" />
                  <option value="Later" />
                </datalist>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-cyan-500/25 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Queue</span>
                </button>
              </div>
            </form>

            {/* View Switcher: Queue List vs Mission Timeline */}
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-2 flex-1 bg-[#0A0F1A] p-1 rounded-lg border hud-hairline">
                <button
                  type="button"
                  onClick={() => setMissionView('list')}
                  className={`inline-flex items-center justify-center gap-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    missionView === 'list'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Queue</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMissionView('timeline')}
                  className={`inline-flex items-center justify-center gap-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    missionView === 'timeline'
                      ? 'bg-cyan-500/15 text-[#00F0FF]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Mission Timeline</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#0A0F1A] p-1 rounded-lg border hud-hairline">
              {(['all', 'active', 'done'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setMissionFilter(f)}
                  className={`flex-1 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                    missionFilter === f ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {missionView === 'list' ? (
              <div className="space-y-2">
                {filteredMissions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">No missions in this view.</div>
                ) : (
                  filteredMissions.map((m) => (
                    <div
                      key={m.id}
                      className="group rounded-lg border hud-hairline bg-[#0A0F1A]/80 p-2.5 flex items-start gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleMission(m.id)}
                        className="mt-0.5 text-slate-400 hover:text-[#00F0FF] shrink-0"
                        aria-label={`Toggle ${m.title}`}
                      >
                        {m.status === 'done' ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-xs font-medium ${
                            m.status === 'done' ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          {m.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-1">
                          <span
                            className={
                              m.priority === 'P1'
                                ? 'text-rose-400'
                                : m.priority === 'P2'
                                  ? 'text-cyan-400'
                                  : 'text-slate-400'
                            }
                          >
                            {m.priority}
                          </span>
                          {m.dueLabel && (
                            <>
                              <span className="mx-1.5">·</span>
                              <span>{m.dueLabel}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMission(m.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                        aria-label="Delete mission"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* 7-Day Mini Calendar Strip */}
                <div className="rounded-xl border hud-hairline bg-[#0A0F1A]/90 p-2 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      7-Day Horizon
                    </span>
                    {selectedDayKey ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDayKey(null)}
                        className="text-[10px] font-mono text-[#00F0FF] hover:underline"
                      >
                        Show all dates
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">Select day to filter</span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {upcomingDaySlots.map((slot) => {
                      const counts = dayMissionDots.get(slot.dateKey);
                      const isSelected = selectedDayKey === slot.dateKey;
                      const totalCount = counts
                        ? counts.activeP1 + counts.activeOther + counts.done
                        : 0;
                      return (
                        <button
                          key={slot.dateKey}
                          type="button"
                          onClick={() => {
                            const next = isSelected ? null : slot.dateKey;
                            setSelectedDayKey(next);
                            if (next) setNewMissionDue(slot.dueLabelValue);
                          }}
                          title={`${slot.dueLabelValue} (${totalCount} mission${totalCount === 1 ? '' : 's'})`}
                          className={`flex flex-col items-center py-1.5 rounded-lg border transition-colors ${
                            isSelected
                              ? 'border-[#00F0FF] bg-cyan-500/15 text-white'
                              : slot.isToday
                                ? 'border-cyan-500/35 bg-cyan-500/5 text-cyan-200 hover:border-[#00F0FF]/60'
                                : 'border-transparent bg-[#060912] text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <span className="text-[9px] font-mono tracking-tight">{slot.dayShort}</span>
                          <span className="text-xs font-mono font-semibold tabular-nums mt-0.5">
                            {slot.dayNum}
                          </span>
                          <div className="flex items-center justify-center gap-0.5 h-2 mt-0.5">
                            {counts && counts.activeP1 > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            )}
                            {counts && counts.activeOther > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]" />
                            )}
                            {counts && counts.done > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chronological Timeline Rail */}
                {timelineBuckets.length === 0 ? (
                  <div className="rounded-lg border hud-hairline bg-[#0A0F1A]/60 p-5 text-center space-y-1.5">
                    <CalendarDays className="w-5 h-5 text-slate-500 mx-auto" />
                    <div className="text-xs font-medium text-slate-300">
                      {selectedDayKey ? 'No missions scheduled on this date' : 'No missions to plot'}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {selectedDayKey
                        ? `Use the composer above (Due: "${newMissionDue}") to schedule one.`
                        : 'Add missions with due labels like Today, Tomorrow, or Nov 25.'}
                    </p>
                  </div>
                ) : (
                  <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-[#00F0FF]/50 before:via-violet-500/35 before:to-slate-800">
                    {timelineBuckets.map((bucket) => {
                      const dotClass = bucket.isOverdue
                        ? 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : bucket.isToday
                          ? 'bg-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,0.85)]'
                          : bucket.bucketKey === 'completed'
                            ? 'bg-emerald-400'
                            : bucket.bucketKey === 'unscheduled'
                              ? 'bg-slate-500'
                              : 'bg-violet-400';

                      return (
                        <div key={bucket.bucketKey} className="relative space-y-2">
                          {/* Timeline Node Marker */}
                          <span
                            className={`absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#070B14] ${dotClass}`}
                          />

                          {/* Bucket Header */}
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-baseline gap-1.5 min-w-0">
                              <span
                                className={`text-xs font-semibold truncate ${
                                  bucket.isOverdue
                                    ? 'text-rose-300'
                                    : bucket.isToday
                                      ? 'text-[#00F0FF]'
                                      : 'text-slate-100'
                                }`}
                              >
                                {bucket.bucketLabel}
                              </span>
                              {bucket.subLabel && (
                                <span className="text-[10px] font-mono text-slate-500 truncate">
                                  · {bucket.subLabel}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                              {bucket.items.length}
                            </span>
                          </div>

                          {/* Bucket Missions */}
                          <div className="space-y-1.5">
                            {bucket.items.map((m) => (
                              <div
                                key={m.id}
                                className="group rounded-lg border hud-hairline bg-[#0A0F1A]/85 p-2.5 space-y-1.5"
                              >
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onToggleMission(m.id)}
                                    className="mt-0.5 text-slate-400 hover:text-[#00F0FF] shrink-0"
                                    aria-label={`Toggle ${m.title}`}
                                  >
                                    {m.status === 'done' ? (
                                      <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className={`text-xs font-medium leading-snug ${
                                        m.status === 'done'
                                          ? 'line-through text-slate-500'
                                          : 'text-slate-200'
                                      }`}
                                    >
                                      {m.title}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-1.5">
                                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                        <span
                                          className={
                                            m.priority === 'P1'
                                              ? 'text-rose-400 font-semibold'
                                              : m.priority === 'P2'
                                                ? 'text-cyan-400'
                                                : 'text-slate-400'
                                          }
                                        >
                                          {m.priority}
                                        </span>
                                        <span className="text-slate-600">·</span>
                                        <select
                                          value={m.dueLabel || 'Later'}
                                          onChange={(e) => onUpdateMissionDue(m.id, e.target.value)}
                                          aria-label={`Reschedule ${m.title}`}
                                          className="bg-transparent text-slate-400 hover:text-[#00F0FF] focus:outline-none cursor-pointer"
                                        >
                                          {![
                                            'Today',
                                            'Tomorrow',
                                            'This Week',
                                            'Next Week',
                                            'Later',
                                            'Completed',
                                          ].includes(m.dueLabel || 'Later') && (
                                            <option value={m.dueLabel} className="bg-[#0A0F1A]">
                                              {m.dueLabel}
                                            </option>
                                          )}
                                          <option value="Today" className="bg-[#0A0F1A]">
                                            Today
                                          </option>
                                          <option value="Tomorrow" className="bg-[#0A0F1A]">
                                            Tomorrow
                                          </option>
                                          <option value="This Week" className="bg-[#0A0F1A]">
                                            This Week
                                          </option>
                                          <option value="Next Week" className="bg-[#0A0F1A]">
                                            Next Week
                                          </option>
                                          <option value="Later" className="bg-[#0A0F1A]">
                                            Later
                                          </option>
                                          <option value="Completed" className="bg-[#0A0F1A]">
                                            Completed
                                          </option>
                                        </select>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => onDeleteMission(m.id)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400 transition-opacity"
                                        aria-label="Delete mission"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'vault' && (
          <>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder="Search vault notes..."
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/40"
              />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newNoteTitle.trim() || !newNoteBody.trim()) return;
                onAddNote(newNoteTitle.trim(), newNoteBody.trim(), ['scratchpad']);
                setNewNoteTitle('');
                setNewNoteBody('');
              }}
              className="space-y-2 pb-3 border-b hud-hairline"
            >
              <input
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="New note title..."
                className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-white placeholder-slate-500"
              />
              <textarea
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                rows={2}
                placeholder="Markdown scratchpad content..."
                className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 placeholder-slate-500 resize-none"
              />
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-cyan-500/25"
              >
                Save to Vault
              </button>
            </form>

            <div className="space-y-2">
              {filteredNotes.map((n) => (
                <div key={n.id} className="rounded-lg border hud-hairline bg-[#0A0F1A]/80 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white truncate">{n.title}</h4>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onTogglePinNote(n.id)}
                        className={`p-1 rounded ${n.pinned ? 'text-[#00F0FF]' : 'text-slate-500 hover:text-slate-300'}`}
                        aria-label="Pin note"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(n.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400"
                        aria-label="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                  {n.tags.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-500">{n.tags.join(' · ')}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'voice' && (
          <>
            <div className="flex items-center justify-between gap-2 pb-2 border-b hud-hairline">
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                <span className="text-[#00F0FF] font-semibold">{Math.min(voiceLogs.length, 20)}</span> / 20 captured
              </div>
              {voiceLogs.length > 0 && (
                <button
                  type="button"
                  onClick={onClearVoiceLogs}
                  className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Clear Log
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Filter voice transcripts..."
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/40"
              />
            </div>

            {filteredVoiceLogs.length === 0 ? (
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A]/60 p-5 text-center space-y-2">
                <AudioLines className="w-5 h-5 text-slate-500 mx-auto" />
                <div className="text-xs font-medium text-slate-300">
                  {voiceLogs.length === 0 ? 'No voice commands logged yet' : 'No matching transcripts'}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Speak via direct mic (Ctrl+M) or “Hey Jarvis” wake-word capture to store your last 20 commands here.
                </p>
                {voiceLogs.length === 0 && (
                  <button
                    type="button"
                    onClick={onTriggerVoiceCapture}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/35 hover:bg-cyan-500/25 transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Capture Voice Command</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredVoiceLogs.map((entry) => {
                  const sourceLabel =
                    entry.source === 'wake-word'
                      ? entry.wakePhrase
                        ? `Wake: "${entry.wakePhrase}"`
                        : 'Wake Word'
                      : entry.source === 'audio-transcribe'
                        ? 'Audio STT'
                        : 'Direct Mic';
                  const timeLabel = new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <div
                      key={entry.id}
                      className="group rounded-lg border hud-hairline bg-[#0A0F1A]/85 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-500">
                        <span
                          className={
                            entry.source === 'wake-word' ? 'text-sky-400' : 'text-cyan-400'
                          }
                        >
                          {sourceLabel}
                        </span>
                        <span>
                          {typeof entry.confidencePct === 'number' ? `${entry.confidencePct}% · ` : ''}
                          {typeof entry.commandLatencyMs === 'number' && entry.commandLatencyMs > 0
                            ? `${entry.commandLatencyMs}ms · `
                            : ''}
                          {timeLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed break-words select-text">
                        “{entry.transcript}”
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t hud-hairline">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onReplayVoiceLog(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-cyan-500/25 transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            <span>Re-run</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onLoadVoiceLogToInput(entry.transcript)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-300 border hud-hairline hover:text-white hover:border-slate-600 transition-colors"
                            title="Load into command dock for editing"
                          >
                            <CornerDownLeft className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteVoiceLog(entry.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                          aria-label="Delete voice transcript"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'voicePerf' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b hud-hairline">
              <div>
                <h3 className="text-xs font-semibold text-white">Voice Performance</h3>
                <p className="text-[10px] font-mono text-slate-500">
                  STT accuracy &amp; end-to-end command latency
                </p>
              </div>
              {voicePerf.length > 0 && (
                <button
                  type="button"
                  onClick={onClearVoicePerf}
                  className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-2.5">
                <div className="text-[10px] text-slate-400">Mean STT</div>
                <div className="text-base font-mono font-semibold tabular-nums text-emerald-400 mt-0.5">
                  {voicePerfMetrics.slice.length > 0 ? `${voicePerfMetrics.avgAccuracy}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-2.5">
                <div className="text-[10px] text-slate-400">Avg Latency</div>
                <div className="text-base font-mono font-semibold tabular-nums text-[#00F0FF] mt-0.5">
                  {voicePerfMetrics.avgLatencyMs > 0 ? `${voicePerfMetrics.avgLatencyMs}ms` : '—'}
                </div>
              </div>
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-2.5">
                <div className="text-[10px] text-slate-400">Fastest</div>
                <div className="text-base font-mono font-semibold tabular-nums text-white mt-0.5">
                  {voicePerfMetrics.minLatencyMs > 0 ? `${voicePerfMetrics.minLatencyMs}ms` : '—'}
                </div>
              </div>
            </div>

            {voicePerfMetrics.slice.length === 0 ? (
              <div className="rounded-xl border hud-hairline bg-[#0A0F1A]/75 p-5 text-center space-y-2.5">
                <BarChart3 className="w-6 h-6 text-[#00F0FF]/70 mx-auto" />
                <div className="text-xs font-semibold text-slate-200">
                  No voice performance telemetry yet
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Speak a command via direct mic or &ldquo;Hey Jarvis&rdquo; wake mode to plot live
                  speech-to-text accuracy and command latency bars.
                </p>
                <button
                  type="button"
                  onClick={onTriggerVoiceCapture}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/35 hover:bg-cyan-500/25 transition-colors"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Capture Voice Command</span>
                </button>
              </div>
            ) : (
              <>
                {/* STT Accuracy Over Time Chart */}
                <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-medium">STT Accuracy Over Time</span>
                    <span className="font-mono tabular-nums text-emerald-400">
                      {voicePerfMetrics.slice.length} turns
                    </span>
                  </div>
                  <div className="relative">
                    <svg viewBox="0 0 280 76" className="w-full h-24 overflow-visible">
                      <defs>
                        <linearGradient id="sttAccGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Reference threshold lines (95%, 80%, 50%) */}
                      {[
                        { pct: 95, label: '95%' },
                        { pct: 80, label: '80%' },
                        { pct: 50, label: '50%' },
                      ].map((guide) => {
                        const gy = 72 - 6 - (guide.pct / 100) * (72 - 14);
                        return (
                          <g key={guide.pct}>
                            <line
                              x1="8"
                              y1={gy}
                              x2="274"
                              y2={gy}
                              stroke="rgba(148, 163, 184, 0.16)"
                              strokeDasharray="3 3"
                              strokeWidth="0.8"
                            />
                            <text
                              x="276"
                              y={gy + 3}
                              textAnchor="end"
                              fill="rgba(148, 163, 184, 0.6)"
                              fontSize="7"
                              fontFamily="monospace"
                            >
                              {guide.label}
                            </text>
                          </g>
                        );
                      })}

                      {voicePerfMetrics.accuracyAreaPoints && (
                        <polygon points={voicePerfMetrics.accuracyAreaPoints} fill="url(#sttAccGrad)" />
                      )}

                      {voicePerfMetrics.slice.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={voicePerfMetrics.accuracyPoints}
                        />
                      )}

                      {voicePerfMetrics.coords?.map(({ x, y, sample }) => {
                        const isSelected = activePerfSample?.id === sample.id;
                        return (
                          <g
                            key={sample.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedPerfId(sample.id)}
                          >
                            <circle
                              cx={x}
                              cy={y}
                              r={isSelected ? 4.2 : 2.8}
                              fill={isSelected ? '#00F0FF' : '#10B981'}
                              stroke="#070B14"
                              strokeWidth="1.2"
                            />
                            <title>
                              {`${sample.sttAccuracyPct}% · "${sample.transcript.slice(0, 48)}"`}
                            </title>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Command Latency Bar Chart */}
                <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-medium">Command Latency (Bar Chart)</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      max {voicePerfMetrics.maxLatencyMs}ms
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <svg viewBox="0 0 280 96" className="w-full h-28 overflow-visible">
                      {/* Horizontal scale guides */}
                      {[1, 0.5, 0].map((ratio) => {
                        const gy = 80 - ratio * 68;
                        const labelVal = Math.round(voicePerfMetrics.maxLatencyMs * ratio);
                        return (
                          <g key={ratio}>
                            <line
                              x1="28"
                              y1={gy}
                              x2="276"
                              y2={gy}
                              stroke="rgba(148, 163, 184, 0.14)"
                              strokeDasharray={ratio > 0 ? '3 3' : undefined}
                              strokeWidth="0.8"
                            />
                            <text
                              x="24"
                              y={gy + 3}
                              textAnchor="end"
                              fill="rgba(148, 163, 184, 0.65)"
                              fontSize="7"
                              fontFamily="monospace"
                            >
                              {labelVal}
                            </text>
                          </g>
                        );
                      })}

                      {/* Mean latency dashed reference */}
                      {voicePerfMetrics.avgLatencyMs > 0 && (
                        <line
                          x1="28"
                          y1={
                            80 -
                            Math.min(
                              68,
                              (voicePerfMetrics.avgLatencyMs / voicePerfMetrics.maxLatencyMs) * 68,
                            )
                          }
                          x2="276"
                          y2={
                            80 -
                            Math.min(
                              68,
                              (voicePerfMetrics.avgLatencyMs / voicePerfMetrics.maxLatencyMs) * 68,
                            )
                          }
                          stroke="rgba(0, 240, 255, 0.45)"
                          strokeDasharray="4 2"
                          strokeWidth="1"
                        />
                      )}

                      {/* Vertical Bars per Voice Command */}
                      {voicePerfMetrics.slice.map((sample, idx) => {
                        const plotW = 244;
                        const slotW = plotW / Math.max(1, voicePerfMetrics.slice.length);
                        const barW = Math.min(18, Math.max(5, slotW * 0.64));
                        const bx = 30 + idx * slotW + (slotW - barW) / 2;
                        const lat = sample.commandLatencyMs || sample.sttLatencyMs;
                        const barH = Math.max(
                          4,
                          (Math.min(lat, voicePerfMetrics.maxLatencyMs) /
                            voicePerfMetrics.maxLatencyMs) *
                            68,
                        );
                        const by = 80 - barH;
                        const isSelected = activePerfSample?.id === sample.id;
                        const barColor = !sample.ok
                          ? '#F43F5E'
                          : lat <= 800
                            ? '#10B981'
                            : lat <= 2200
                              ? '#00F0FF'
                              : '#F59E0B';

                        return (
                          <g
                            key={sample.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedPerfId(sample.id)}
                          >
                            <rect
                              x={bx}
                              y={by}
                              width={barW}
                              height={barH}
                              rx="2"
                              fill={barColor}
                              fillOpacity={isSelected ? 1 : 0.78}
                              stroke={isSelected ? '#FFFFFF' : 'none'}
                              strokeWidth={isSelected ? 1 : 0}
                            />
                            <text
                              x={bx + barW / 2}
                              y="92"
                              textAnchor="middle"
                              fill={isSelected ? '#00F0FF' : 'rgba(148, 163, 184, 0.6)'}
                              fontSize="6.5"
                              fontFamily="monospace"
                            >
                              #{idx + 1}
                            </text>
                            <title>
                              {`#${idx + 1}: ${lat}ms · "${sample.transcript.slice(0, 48)}"`}
                            </title>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Bar Legend */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-emerald-400" />
                        &le;800ms
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-[#00F0FF]" />
                        0.8–2.2s
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-amber-400" />
                        &gt;2.2s
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selected Command Inspector Card */}
                {activePerfSample && (
                  <div className="rounded-lg border hud-hairline-cyan bg-[#08101D] p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-[#00F0FF] uppercase">{activePerfSample.source}</span>
                      <span>
                        {new Date(activePerfSample.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-100 leading-snug">
                      &ldquo;{activePerfSample.transcript}&rdquo;
                    </p>
                    <div className="flex items-center gap-3 text-[10.5px] font-mono tabular-nums pt-0.5">
                      <span className="text-emerald-400">
                        STT: {activePerfSample.sttAccuracyPct}%
                        {activePerfSample.isEstimatedConfidence ? ' (est)' : ''}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-cyan-300">
                        Cmd:{' '}
                        {activePerfSample.commandLatencyMs > 0
                          ? `${activePerfSample.commandLatencyMs} ms`
                          : 'pending'}
                      </span>
                      {activePerfSample.sttLatencyMs > 0 && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">
                            Capture: {activePerfSample.sttLatencyMs} ms
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Chronological Turn Breakdown */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-300">Recent Voice Turns</h4>
                  {[...voicePerfMetrics.slice]
                    .reverse()
                    .slice(0, 10)
                    .map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => setSelectedPerfId(sample.id)}
                        className={`w-full text-left rounded border px-2.5 py-2 text-[11px] font-mono tabular-nums transition-colors ${
                          activePerfSample?.id === sample.id
                            ? 'border-[#00F0FF]/50 bg-cyan-500/10'
                            : 'hud-hairline bg-[#060912] hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-200 truncate font-sans">
                            {sample.transcript}
                          </span>
                          <span className={sample.ok ? 'text-[#00F0FF] shrink-0' : 'text-rose-400 shrink-0'}>
                            {sample.commandLatencyMs > 0 ? `${sample.commandLatencyMs} ms` : '…'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                          <span>
                            STT {sample.sttAccuracyPct}% · {sample.source}
                          </span>
                          <span>
                            {new Date(sample.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-white mb-2">Workflow Macros</h3>
              <div className="space-y-2">
                {macros.map((m) => (
                  <div key={m.id} className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{m.name}</span>
                      <button
                        type="button"
                        onClick={() => onRunMacro(m)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-cyan-500/15 text-[#00F0FF] hover:bg-cyan-500/25"
                      >
                        <Play className="w-3 h-3" />
                        <span>Run</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">{m.description}</p>
                    <div className="text-[10px] font-mono text-cyan-400">/{m.command}</div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMacroName.trim() || !newMacroCmd.trim() || !newMacroPrompt.trim()) return;
                onAddMacro(newMacroName.trim(), newMacroCmd.trim().toLowerCase(), newMacroPrompt.trim());
                setNewMacroName('');
                setNewMacroCmd('');
                setNewMacroPrompt('');
              }}
              className="rounded-lg border hud-hairline bg-[#060912] p-3 space-y-2"
            >
              <h4 className="text-xs font-semibold text-slate-200">Create Macro</h4>
              <input
                type="text"
                value={newMacroName}
                onChange={(e) => setNewMacroName(e.target.value)}
                placeholder="Macro name"
                className="w-full px-2 py-1 rounded border hud-hairline bg-[#0A0F1A] text-xs text-white"
              />
              <input
                type="text"
                value={newMacroCmd}
                onChange={(e) => setNewMacroCmd(e.target.value)}
                placeholder="Slash trigger (e.g. standup)"
                className="w-full px-2 py-1 rounded border hud-hairline bg-[#0A0F1A] text-xs font-mono text-white"
              />
              <textarea
                value={newMacroPrompt}
                onChange={(e) => setNewMacroPrompt(e.target.value)}
                rows={2}
                placeholder="Prompt workflow instruction..."
                className="w-full px-2 py-1 rounded border hud-hairline bg-[#0A0F1A] text-xs text-white resize-none"
              />
              <button
                type="submit"
                className="w-full py-1.5 rounded text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40"
              >
                Add Workflow Macro
              </button>
            </form>

            <div className="border-t hud-hairline pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">Custom REST Tools</h3>
                <button
                  type="button"
                  onClick={onOpenApiMatrix}
                  className="text-[11px] text-[#00F0FF] hover:underline"
                >
                  Configure
                </button>
              </div>
              {customTools.map((t) => (
                <div key={t.id} className="rounded-lg border hud-hairline bg-[#0A0F1A] p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">{t.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{t.method}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{t.url}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3">
                <div className="text-[11px] text-slate-400">Mean Latency</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-[#00F0FF] mt-0.5">
                  {avgLatency} <span className="text-xs text-slate-400">ms</span>
                </div>
              </div>
              <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3">
                <div className="text-[11px] text-slate-400">Session Tokens</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-white mt-0.5">
                  {totalTokens.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="rounded-lg border hud-hairline bg-[#0A0F1A] p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Response Latency Trend</span>
                <span className="font-mono tabular-nums">{telemetry.length} turns</span>
              </div>
              {telemetry.length === 0 ? (
                <div className="h-16 flex items-center justify-center text-[11px] text-slate-500">
                  Send a prompt to record real turn telemetry
                </div>
              ) : (
                <svg viewBox="0 0 280 64" className="w-full h-16 overflow-visible">
                  <polyline
                    fill="none"
                    stroke="#00F0FF"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    points={latencyPoints}
                  />
                </svg>
              )}
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-300">Recent Execution Log</h4>
              {telemetry.length === 0 ? (
                <p className="text-[11px] text-slate-500">No executions recorded yet.</p>
              ) : (
                [...telemetry]
                  .reverse()
                  .slice(0, 12)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded border hud-hairline bg-[#060912] px-2.5 py-2 text-[11px] font-mono tabular-nums"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 truncate">{ev.providerLabel}</span>
                        <span className={ev.ok ? 'text-emerald-400' : 'text-rose-400'}>
                          {ev.latencyMs} ms
                        </span>
                      </div>
                      <div className="text-slate-500 truncate mt-0.5">
                        {ev.model}
                        {ev.tokens > 0 ? ` · ${ev.tokens} tok` : ''}
                        {ev.fallbackUsed ? ' · Fallback' : ''}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
