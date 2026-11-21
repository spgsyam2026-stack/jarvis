import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Contrast,
  Ear,
  FileCode2,
  Image as ImageIcon,
  Mic,
  MicOff,
  Moon,
  Play,
  Plus,
  SlidersHorizontal,
  Square,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AppTheme,
  ChatAttachment,
  RoutingTaskSlot,
  VoiceSettings,
  VoiceState,
  WorkflowMacro,
} from '../types';

interface CommandDockProps {
  input: string;
  onChangeInput: (val: string) => void;
  onSubmit: () => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  voiceState: VoiceState;
  voiceSettings: VoiceSettings;
  onChangeVoiceSettings: (patch: Partial<VoiceSettings>) => void;
  availableVoices: SpeechSynthesisVoice[];
  onToggleWakeWord: () => void;
  onToggleDirectMic: () => void;
  onStopSpeaking: () => void;
  isSending: boolean;
  routingSlot: RoutingTaskSlot;
  onChangeRoutingSlot: (slot: RoutingTaskSlot) => void;
  macros: WorkflowMacro[];
  liveAudioLevel?: number;
  isMonitoringMic?: boolean;
  onToggleMicMonitor?: () => void;
  onStopMicMonitor?: () => void;
  appTheme: AppTheme;
  onChangeTheme: (theme: AppTheme) => void;
  compactMode?: boolean;
  micMuted?: boolean;
  micBlocked?: boolean;
  isMicGated?: boolean;
  onToggleGlobalMicMute?: () => void;
}

const THEME_OPTIONS: Array<{
  id: AppTheme;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'obsidian', label: 'Obsidian', shortLabel: 'Obsidian', icon: Moon },
  { id: 'cyber-day', label: 'Cyber-Day', shortLabel: 'Cyber-Day', icon: Sun },
  { id: 'high-contrast', label: 'High-Contrast', shortLabel: 'Hi-Contrast', icon: Contrast },
];

const SLASH_COMMANDS = [
  { cmd: '/mute', desc: 'Toggle global microphone mute' },
  { cmd: '/theme', desc: 'Switch theme (/theme obsidian | cyber-day | high-contrast)' },
  { cmd: '/personality', desc: 'Inject personality (/personality jarvis | cortana | hal)' },
  { cmd: '/clear', desc: 'Clear current conversation' },
  { cmd: '/mode', desc: 'Switch persona (/mode architect)' },
  { cmd: '/model', desc: 'Routing mode (/model fast | reasoning | auto)' },
  { cmd: '/task', desc: 'Add mission (/task Review Win11 build)' },
  { cmd: '/note', desc: 'Save note to Vault (/note Quick idea)' },
  { cmd: '/macro', desc: 'Run workflow macro (/macro brief)' },
  { cmd: '/export', desc: 'Export workspace JSON' },
  { cmd: '/keys', desc: 'Open API & Model Matrix' },
];

export const CommandDock: React.FC<CommandDockProps> = ({
  input,
  onChangeInput,
  onSubmit,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  voiceState,
  voiceSettings,
  onChangeVoiceSettings,
  availableVoices,
  onToggleWakeWord,
  onToggleDirectMic,
  onStopSpeaking,
  isSending,
  routingSlot,
  onChangeRoutingSlot,
  macros,
  liveAudioLevel = 0,
  isMonitoringMic = false,
  onToggleMicMonitor,
  onStopMicMonitor,
  appTheme,
  onChangeTheme,
  compactMode = false,
  micMuted = false,
  micBlocked = false,
  isMicGated = false,
  onToggleGlobalMicMute,
}) => {
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState('');
  const [previewingVoiceURI, setPreviewingVoiceURI] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const stopVoicePreview = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewingVoiceURI(null);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePreviewVoice = (voice: SpeechSynthesisVoice | null) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const key = voice ? voice.voiceURI : '__default__';
    if (previewingVoiceURI === key) {
      stopVoicePreview();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      voice
        ? `AETHER systems online. Previewing ${voice.name.replace(/microsoft|google/gi, '').trim() || 'voice'} telemetry.`
        : 'AETHER systems online. Previewing default system voice.',
    );
    if (voice) {
      utter.voice = voice;
    }
    utter.rate = voiceSettings.rate;
    utter.pitch = voiceSettings.pitch;
    utter.onstart = () => setPreviewingVoiceURI(key);
    utter.onend = () => setPreviewingVoiceURI((curr) => (curr === key ? null : curr));
    utter.onerror = () => setPreviewingVoiceURI((curr) => (curr === key ? null : curr));
    setPreviewingVoiceURI(key);
    window.speechSynthesis.speak(utter);
  };

  const handleTestSpeed = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const key = '__speed_test__';
    if (previewingVoiceURI === key) {
      stopVoicePreview();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      `AETHER speech cadence calibrated to ${voiceSettings.rate.toFixed(2)}x playback speed.`
    );
    if (voiceSettings.voiceURI) {
      const selected = availableVoices.find((v) => v.voiceURI === voiceSettings.voiceURI);
      if (selected) utter.voice = selected;
    }
    utter.rate = voiceSettings.rate;
    utter.pitch = voiceSettings.pitch;
    utter.onstart = () => setPreviewingVoiceURI(key);
    utter.onend = () => setPreviewingVoiceURI((curr) => (curr === key ? null : curr));
    utter.onerror = () => setPreviewingVoiceURI((curr) => (curr === key ? null : curr));
    setPreviewingVoiceURI(key);
    window.speechSynthesis.speak(utter);
  };

  const getSpeedLabel = (rate: number): string => {
    if (rate < 0.65) return 'Very Slow';
    if (rate < 0.88) return 'Slow / Relaxed';
    if (rate <= 1.05) return 'Natural (1.0x)';
    if (rate <= 1.35) return 'Brisk';
    if (rate <= 1.75) return 'Fast';
    if (rate <= 2.25) return 'Rapid';
    return 'Max Speed';
  };

  const filteredVoices = useMemo(() => {
    const q = voiceFilter.trim().toLowerCase();
    if (!q) return availableVoices;
    return availableVoices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.lang.toLowerCase().includes(q) ||
        v.voiceURI.toLowerCase().includes(q),
    );
  }, [availableVoices, voiceFilter]);

  const slashSuggestions = useMemo(() => {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith('/') || trimmed.includes(' ')) return [];
    const q = trimmed.toLowerCase();
    const macroCmds = macros.map((m) => ({
      cmd: `/macro ${m.command}`,
      desc: m.name,
    }));
    return [...SLASH_COMMANDS, ...macroCmds].filter((item) => item.cmd.toLowerCase().startsWith(q));
  }, [input, macros]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) onAddFiles(files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending) onSubmit();
    }
  };

  const isListening = voiceState === 'LISTENING';
  const isMicDisabled = micMuted || micBlocked;
  const currentThemeMeta = THEME_OPTIONS.find((t) => t.id === appTheme) || THEME_OPTIONS[0];
  const CurrentThemeIcon = currentThemeMeta.icon;
  const cycleTheme = () => {
    const idx = THEME_OPTIONS.findIndex((t) => t.id === appTheme);
    const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
    onChangeTheme(next.id);
  };

  return (
    <div
      className="px-4 pb-5 pt-2 relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto relative">
        {/* Slash Command Autocomplete */}
        {slashSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border hud-hairline-cyan bg-[#0A0F1A] shadow-2xl overflow-hidden z-30 max-h-48 overflow-y-auto">
            {slashSuggestions.map((s) => (
              <button
                key={s.cmd}
                type="button"
                onClick={() => {
                  onChangeInput(s.cmd + ' ');
                  textareaRef.current?.focus();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs hover:bg-cyan-500/12 transition-colors border-b border-slate-800/40 last:border-b-0"
              >
                <span className="font-mono text-[#00F0FF] font-medium">{s.cmd}</span>
                <span className="text-slate-400 truncate ml-4">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Voice, Wake Word & Routing Settings Popover */}
        {settingsOpen && (
          <div className="absolute right-0 bottom-full mb-2 w-80 sm:w-96 max-h-[78vh] overflow-y-auto rounded-xl border hud-hairline-cyan bg-[#0A0F1A] p-4 shadow-2xl z-30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Voice & Routing Controls</span>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  stopVoicePreview();
                  onStopMicMonitor?.();
                }}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Close voice settings"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Wake Word Phrase</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={voiceSettings.wakeWordPhrase}
                  onChange={(e) => onChangeVoiceSettings({ wakeWordPhrase: e.target.value })}
                  placeholder="hey jarvis"
                  className="flex-1 px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#060912] text-xs font-mono text-white"
                />
                <button
                  type="button"
                  onClick={() => onChangeVoiceSettings({ wakeWordPhrase: 'hey jarvis' })}
                  className="px-2 py-1.5 rounded-lg border hud-hairline text-[11px] text-slate-300 hover:text-white"
                >
                  Reset
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Model Routing Slot</label>
              <select
                value={routingSlot}
                onChange={(e) => onChangeRoutingSlot(e.target.value as RoutingTaskSlot)}
                className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#060912] text-xs text-slate-200"
              >
                <option value="auto">Auto (Persona Default)</option>
                <option value="fast">Fast / Low-Latency Voice</option>
                <option value="reasoning">Deep Reasoning</option>
              </select>
            </div>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Speak responses aloud (TTS)</span>
              <input
                type="checkbox"
                checked={voiceSettings.ttsEnabled}
                onChange={(e) => onChangeVoiceSettings({ ttsEnabled: e.target.checked })}
                className="accent-[#00F0FF] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Interrupt speech on wake / prompt</span>
              <input
                type="checkbox"
                checked={voiceSettings.interruptOnSpeech}
                onChange={(e) => onChangeVoiceSettings({ interruptOnSpeech: e.target.checked })}
                className="accent-[#00F0FF] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span className={micMuted ? 'text-rose-300 font-medium' : ''}>
                Global Mic Mute (Disable input)
              </span>
              <input
                type="checkbox"
                checked={micMuted}
                onChange={() => {
                  if (onToggleGlobalMicMute) {
                    onToggleGlobalMicMute();
                  } else {
                    onChangeVoiceSettings({ micMuted: !micMuted });
                  }
                }}
                className="accent-rose-500 w-4 h-4"
              />
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">System Voice</span>
                <span className="font-mono tabular-nums text-[10px] text-slate-500">
                  {availableVoices.length} available
                </span>
              </div>

              {availableVoices.length > 5 && (
                <input
                  type="text"
                  value={voiceFilter}
                  onChange={(e) => setVoiceFilter(e.target.value)}
                  placeholder="Filter voices by name or language..."
                  className="w-full px-2.5 py-1 rounded-lg border hud-hairline bg-[#060912] text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/50"
                />
              )}

              <div className="max-h-40 overflow-y-auto rounded-lg border hud-hairline bg-[#060912] divide-y divide-slate-800/60">
                {/* Default System Voice Option */}
                {(!voiceFilter.trim() ||
                  'default neural system voice'.includes(voiceFilter.trim().toLowerCase())) && (
                  <div
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 transition-colors ${
                      voiceSettings.voiceURI === '' ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onChangeVoiceSettings({ voiceURI: '' })}
                      className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
                          voiceSettings.voiceURI === ''
                            ? 'text-[#00F0FF]'
                            : 'text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span
                        className={`truncate text-[11px] ${
                          voiceSettings.voiceURI === ''
                            ? 'text-white font-medium'
                            : 'text-slate-300'
                        }`}
                      >
                        Default Neural / System Voice
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewVoice(null)}
                      aria-label="Preview Default System Voice"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono transition-colors shrink-0 ${
                        previewingVoiceURI === '__default__'
                          ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                          : 'border-slate-700/80 bg-[#0A0F1A] text-slate-300 hover:text-white hover:border-cyan-400/40'
                      }`}
                    >
                      {previewingVoiceURI === '__default__' ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Preview</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {filteredVoices.map((v) => {
                  const isSelected = voiceSettings.voiceURI === v.voiceURI;
                  const isPreviewing = previewingVoiceURI === v.voiceURI;
                  return (
                    <div
                      key={v.voiceURI}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 transition-colors ${
                        isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onChangeVoiceSettings({ voiceURI: v.voiceURI })}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                        title={`${v.name} (${v.lang})`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
                            isSelected ? 'text-[#00F0FF]' : 'text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                        <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
                          <span
                            className={`truncate text-[11px] ${
                              isSelected ? 'text-white font-medium' : 'text-slate-300'
                            }`}
                          >
                            {v.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {v.lang}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreviewVoice(v)}
                        aria-label={`Preview ${v.name}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono transition-colors shrink-0 ${
                          isPreviewing
                            ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                            : 'border-slate-700/80 bg-[#0A0F1A] text-slate-300 hover:text-white hover:border-cyan-400/40'
                        }`}
                      >
                        {isPreviewing ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {filteredVoices.length === 0 && availableVoices.length > 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-slate-500 text-center">
                    No voices matching &ldquo;{voiceFilter}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Speech Speed & Cadence Section */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-300 font-medium">Speech Speed</span>
                  <span className="text-xs font-mono font-bold text-[#00F0FF] tabular-nums">
                    {voiceSettings.rate.toFixed(2)}x
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({getSpeedLabel(voiceSettings.rate)})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVoiceSettings({
                        rate: Math.max(0.25, Number((voiceSettings.rate - 0.05).toFixed(2))),
                      })
                    }
                    title="Fine-tune decrease (-0.05x)"
                    className="px-1.5 py-0.5 rounded border border-slate-700/80 bg-[#0A0F1A] text-[10px] font-mono text-slate-300 hover:text-white hover:border-cyan-400/40"
                  >
                    -0.05
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeVoiceSettings({ rate: 1.0 })}
                    title="Reset to 1.0x standard"
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                      Math.abs(voiceSettings.rate - 1.0) < 0.01
                        ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                        : 'border-slate-700/80 bg-[#0A0F1A] text-slate-400 hover:text-white'
                    }`}
                  >
                    1.0x
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVoiceSettings({
                        rate: Math.min(2.75, Number((voiceSettings.rate + 0.05).toFixed(2))),
                      })
                    }
                    title="Fine-tune increase (+0.05x)"
                    className="px-1.5 py-0.5 rounded border border-slate-700/80 bg-[#0A0F1A] text-[10px] font-mono text-slate-300 hover:text-white hover:border-cyan-400/40"
                  >
                    +0.05
                  </button>
                  <button
                    type="button"
                    onClick={handleTestSpeed}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ml-1 ${
                      previewingVoiceURI === '__speed_test__'
                        ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                        : 'border-slate-700/80 bg-[#0A0F1A] text-slate-300 hover:text-white hover:border-cyan-400/40'
                    }`}
                  >
                    {previewingVoiceURI === '__speed_test__' ? (
                      <>
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Test Speed</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* High-precision range slider: 0.25x to 2.75x in 0.01 steps */}
              <input
                type="range"
                min="0.25"
                max="2.75"
                step="0.01"
                value={voiceSettings.rate}
                onChange={(e) => onChangeVoiceSettings({ rate: Number(e.target.value) })}
                className="w-full accent-[#00F0FF] cursor-pointer"
                aria-label="Speech Speed playback rate"
              />

              {/* Speed Preset Quick Pills */}
              <div className="grid grid-cols-6 gap-1 pt-0.5">
                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((preset) => {
                  const isActive = Math.abs(voiceSettings.rate - preset) < 0.02;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onChangeVoiceSettings({ rate: preset })}
                      className={`py-0.5 px-1 rounded text-[10px] font-mono text-center transition-colors border ${
                        isActive
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-[#00F0FF] font-semibold'
                          : 'border-slate-800 bg-[#080C16] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {preset === 1.0 ? '1.0x Def' : `${preset}x`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice Pitch */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                <span>Voice Pitch</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-slate-300">{voiceSettings.pitch.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => onChangeVoiceSettings({ pitch: 1.0 })}
                    className="text-[10px] text-slate-500 hover:text-cyan-300 font-mono"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.5"
                step="0.05"
                value={voiceSettings.pitch}
                onChange={(e) => onChangeVoiceSettings({ pitch: Number(e.target.value) })}
                className="w-full accent-[#00F0FF]"
                aria-label="Voice Pitch"
              />
            </div>

            {/* Audio Input Sensitivity Threshold */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Audio Input Sensitivity</span>
                <span className="font-mono tabular-nums text-[#00F0FF]">
                  {voiceSettings.inputSensitivityThreshold}% ·{' '}
                  <span className="text-slate-400">
                    {voiceSettings.inputSensitivityThreshold === 0
                      ? 'Always Open'
                      : voiceSettings.inputSensitivityThreshold <= 15
                        ? 'Quiet Room'
                        : voiceSettings.inputSensitivityThreshold <= 35
                          ? 'Balanced'
                          : 'Noisy Env'}
                  </span>
                </span>
              </div>

              {/* Real-time ambient level bar vs. threshold marker */}
              <div className="relative h-2 rounded-full bg-[#060912] border border-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    liveAudioLevel >= voiceSettings.inputSensitivityThreshold && liveAudioLevel > 0
                      ? 'bg-emerald-400'
                      : 'bg-cyan-500/50'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, liveAudioLevel))}%` }}
                />
                {voiceSettings.inputSensitivityThreshold > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                    style={{ left: `${Math.min(99, voiceSettings.inputSensitivityThreshold)}%` }}
                    title={`Threshold: ${voiceSettings.inputSensitivityThreshold}%`}
                  />
                )}
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={voiceSettings.inputSensitivityThreshold}
                onChange={(e) =>
                  onChangeVoiceSettings({ inputSensitivityThreshold: Number(e.target.value) })
                }
                aria-label="Audio Input Sensitivity"
                className="w-full accent-[#00F0FF]"
              />

              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                <span>Noise floor before AI starts listening</span>
                {voiceState === 'IDLE' && onToggleMicMonitor ? (
                  <button
                    type="button"
                    onClick={onToggleMicMonitor}
                    className={`px-2 py-0.5 rounded border font-mono transition-colors shrink-0 ${
                      isMonitoringMic
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isMonitoringMic ? `Stop (${liveAudioLevel}%)` : 'Test Mic'}
                  </button>
                ) : (
                  <span className="font-mono tabular-nums text-emerald-400 shrink-0">
                    Input: {liveAudioLevel}%
                  </span>
                )}
              </div>
            </div>

            {/* Visual & Accessibility Theme Switcher */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Interface Theme</span>
                <span className="font-mono text-[10px] text-slate-400">Win11 Accessibility</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = appTheme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeTheme(opt.id)}
                      className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-cyan-400/50 bg-cyan-500/15 text-[#00F0FF]'
                          : 'border-slate-800 bg-[#060912] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{opt.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Attachments Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200"
              >
                {att.kind === 'image' && att.dataUrl ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded object-cover"
                  />
                ) : att.kind === 'image' ? (
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-violet-400" />
                )}
                <span className="max-w-[140px] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="text-slate-500 hover:text-rose-400"
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Sleek Floating Command Bar */}
        <div
          className={`rounded-2xl border bg-[#0A0F1A]/90 backdrop-blur-xl px-3 py-2 flex items-end gap-2 shadow-2xl transition-colors ${
            dragging
              ? 'border-[#00F0FF] bg-cyan-950/20'
              : isMicDisabled
                ? 'border-rose-500/45'
                : isMicGated
                  ? 'border-amber-400/45'
                  : isListening
                    ? 'border-emerald-400/50'
                    : voiceSettings.wakeWordEnabled
                      ? 'border-sky-400/35'
                      : 'hud-hairline focus-within:border-[#00F0FF]/50'
          }`}
        >
          {/* Attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors shrink-0"
            title="Attach image, code, markdown, JSON, or CSV"
            aria-label="Attach file"
          >
            <Plus className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.ps1,.yml,.yaml"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAddFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Wake Word ("Hey Jarvis") Toggle */}
          <button
            type="button"
            onClick={onToggleWakeWord}
            disabled={isMicDisabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 ${
              voiceSettings.wakeWordEnabled
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70 border border-transparent'
            }`}
            title={
              isMicDisabled
                ? 'Microphone is disabled/muted'
                : `Toggle "${voiceSettings.wakeWordPhrase}" hands-free wake word`
            }
          >
            <Ear className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {voiceSettings.wakeWordEnabled ? 'Jarvis Armed' : 'Hey Jarvis'}
            </span>
          </button>

          {/* Clean Prompt Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder={
              dragging
                ? 'Drop files here...'
                : isMicDisabled
                  ? 'Mic muted — type a message or click indicator to unmute...'
                  : voiceSettings.wakeWordEnabled
                    ? `Say "${voiceSettings.wakeWordPhrase}" or type a message...`
                    : 'Message AETHER or type / for commands...'
            }
            className="flex-1 bg-transparent py-2 px-1 text-sm text-white placeholder-slate-500 focus:outline-none resize-none max-h-32 leading-relaxed"
          />

          {/* Right Voice & Send Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Persistent Visual Indicator (Always visible, including Compact Mode) when Mic Muted / Blocked / Gated */}
            {isMicDisabled ? (
              <button
                type="button"
                onClick={onToggleGlobalMicMute}
                aria-label={micBlocked ? 'Microphone Blocked by System' : 'Mic Muted — Click to Unmute'}
                title={
                  micBlocked
                    ? 'Microphone permission blocked by browser/OS — click to retry'
                    : 'Microphone globally muted — click to unmute'
                }
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-rose-500/45 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors text-[11px] font-mono shrink-0"
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
                <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className={compactMode ? 'inline font-semibold' : 'inline'}>
                  {micBlocked ? 'Blocked' : 'Muted'}
                </span>
              </button>
            ) : isMicGated ? (
              <div
                role="status"
                aria-label={`Microphone Gated (${liveAudioLevel}% below ${voiceSettings.inputSensitivityThreshold}% threshold)`}
                title={`Audio input gated below ${voiceSettings.inputSensitivityThreshold}% noise floor (current: ${liveAudioLevel}%)`}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-amber-400/45 bg-amber-500/15 text-amber-300 text-[11px] font-mono shrink-0"
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <MicOff className="w-3.5 h-3.5 text-amber-300 animate-pulse shrink-0" />
                <span className="tabular-nums">
                  {compactMode
                    ? `Gated`
                    : `Gated ${liveAudioLevel}/${voiceSettings.inputSensitivityThreshold}%`}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={isMicDisabled ? onToggleGlobalMicMute : onToggleDirectMic}
              className={`relative p-2 rounded-xl transition-colors ${
                isMicDisabled
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40 hover:bg-rose-500/25'
                  : isMicGated
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-400/45'
                    : isListening
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
              title={
                isMicDisabled
                  ? 'Microphone muted/disabled — click to unmute'
                  : isMicGated
                    ? `Gated below ${voiceSettings.inputSensitivityThreshold}% sensitivity floor`
                    : 'Speak Now (Ctrl+M)'
              }
              aria-label={
                isMicDisabled
                  ? 'Microphone Muted'
                  : isMicGated
                    ? 'Microphone Gated'
                    : 'Toggle Microphone'
              }
            >
              {isMicDisabled ? (
                <>
                  <MicOff className="w-4 h-4 text-rose-400" />
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse"
                    aria-hidden="true"
                  />
                </>
              ) : isMicGated ? (
                <>
                  <MicOff className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-ping"
                    aria-hidden="true"
                  />
                </>
              ) : isListening ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-300" />
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {voiceState === 'SPEAKING' ? (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="p-2 rounded-xl bg-cyan-500/20 text-[#00F0FF] hover:bg-cyan-500/30 transition-colors"
                title="Stop Speaking"
                aria-label="Stop Speaking"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onChangeVoiceSettings({ ttsEnabled: !voiceSettings.ttsEnabled })}
                className={`p-2 rounded-xl transition-colors ${
                  voiceSettings.ttsEnabled ? 'text-[#00F0FF] hover:bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle Voice Reply (TTS)"
                aria-label="Toggle Voice Reply"
              >
                {voiceSettings.ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={cycleTheme}
              className="inline-flex items-center gap-1 px-2 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors text-[11px] font-mono shrink-0"
              title={`Theme: ${currentThemeMeta.label} (click to switch)`}
              aria-label={`Theme Toggle: ${currentThemeMeta.label}`}
            >
              <CurrentThemeIcon className="w-4 h-4 text-[#00F0FF]" />
              <span className="hidden md:inline text-slate-300">{currentThemeMeta.shortLabel}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSettingsOpen((v) => {
                  const next = !v;
                  if (!next) {
                    stopVoicePreview();
                    onStopMicMonitor?.();
                  }
                  return next;
                })
              }
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
              title="Voice & Routing Settings"
              aria-label="Voice and Routing Settings"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onSubmit}
              disabled={isSending || (!input.trim() && attachments.length === 0)}
              className="p-2 rounded-xl bg-[#00F0FF] text-[#05070C] hover:bg-cyan-300 transition-colors disabled:opacity-35"
              title="Send"
              aria-label="Send Message"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
