import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Ear,
  History,
  KeyRound,
  Layers,
  Monitor,
  Play,
  ScanEye,
  ShieldAlert,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';
import {
  AetherAppState,
  AppTheme,
  ChatAttachment,
  ChatMessage,
  ConversationThread,
  DailyInsightData,
  MissionItem,
  PersonalityMode,
  RoutingTaskSlot,
  ServerEnvStatus,
  ToolCallProposal,
  VaultNote,
  VoiceLogEntry,
  VoicePerformanceSample,
  VoiceSettings,
  VoiceState,
  WorkflowMacro,
} from './types';
import {
  clearStoredKeyVault,
  createInitialThread,
  loadAppState,
  PERSONALITY_PROFILES,
  saveAppState,
} from './lib/storage';
import { analyzeSessionImage, isProviderReady, routeAgentChat } from './lib/aiRouter';
import { runJsInWorkerSandbox } from './lib/sandbox';
import { HumanoidCore, HapticPulseSignal } from './components/HumanoidCore';
import { PersonalityInjector } from './components/PersonalityInjector';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { LeftSidebar } from './components/LeftSidebar';
import { InspectorDrawer, InspectorTab } from './components/InspectorDrawer';
import { CommandDock } from './components/CommandDock';
import { ApiMatrixModal } from './components/ApiMatrixModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { Win11GuideModal } from './components/Win11GuideModal';
import { DailyInsightCard } from './components/DailyInsightCard';
import { VoiceCommandHistoryCard } from './components/VoiceCommandHistoryCard';

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence?: number };
  }>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

/**
 * Plays a crisp futuristic harmonic wake chime using Web Audio API.
 */
function playWakeChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.14); // A5
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch {
    // Audio playback blocked or unavailable
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractWakeCommand(transcript: string, wakePhrase: string): {
  triggered: boolean;
  remainder: string;
} {
  const cleanPhrase = wakePhrase.trim().toLowerCase() || 'hey jarvis';
  const words = cleanPhrase.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] || 'jarvis';

  // Match either full phrase ("hey jarvis") or common phonetic variants ("jarvis", "hey aether")
  const patterns = [
    new RegExp(`\\b${escapeRegex(cleanPhrase)}\\b[,:\\s]*([\\s\\S]*)`, 'i'),
    new RegExp(`\\b(?:hey|ok|okay)?\\s*${escapeRegex(lastWord)}\\b[,:\\s]*([\\s\\S]*)`, 'i'),
  ];

  for (const rx of patterns) {
    const m = transcript.match(rx);
    if (m) {
      return { triggered: true, remainder: (m[1] || '').trim() };
    }
  }
  return { triggered: false, remainder: '' };
}

export default function App() {
  const [state, setState] = useState<AetherAppState>(() => loadAppState());
  const [envKeys, setEnvKeys] = useState<ServerEnvStatus>({
    gemini: false,
    openai: false,
    anthropic: false,
    deepseek: false,
    moonshot: false,
    openrouter: false,
    groq: false,
  });

  // Slide-over drawers (closed by default for a calm, uncluttered Humanoid canvas)
  const [sessionsDrawerOpen, setSessionsDrawerOpen] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [compactHud, setCompactHud] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('missions');

  const [apiMatrixOpen, setApiMatrixOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [win11GuideOpen, setWin11GuideOpen] = useState(false);

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [routingSlot, setRoutingSlot] = useState<RoutingTaskSlot>('auto');
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hapticPulse, setHapticPulse] = useState<HapticPulseSignal | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Daily Insight (Search-grounded quote or tech-news snippet on startup)
  const [dailyInsightKind, setDailyInsightKind] = useState<'tech-news' | 'quote'>('tech-news');
  const [dailyInsight, setDailyInsight] = useState<DailyInsightData | null>(null);
  const [dailyInsightLoading, setDailyInsightLoading] = useState(false);
  const [dailyInsightError, setDailyInsightError] = useState<string | null>(null);
  const [dailyInsightMissingKey, setDailyInsightMissingKey] = useState(false);

  const triggerHapticPulse = useCallback((reason: HapticPulseSignal['reason']) => {
    setHapticPulse({ id: Date.now() + Math.random(), reason });
  }, []);

  // Voice & Audio HUD State
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [liveAudioLevel, setLiveAudioLevel] = useState(0);
  const [isMonitoringMic, setIsMonitoringMic] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [isMicGated, setIsMicGated] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeActiveCaptureRef = useRef(false);
  const wakeTimeoutRef = useRef<number | null>(null);
  const utteranceStartRef = useRef<number | null>(null);
  const lastAboveThresholdAtRef = useRef<number>(0);
  const gateOpenForTurnRef = useRef<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const voiceStateRef = useRef(voiceState);
  voiceStateRef.current = voiceState;

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.colorScheme =
      state.theme === 'cyber-day' ? 'light' : 'dark';
  }, [state.theme]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { envKeys?: ServerEnvStatus }) => {
        if (d.envKeys) setEnvKeys(d.envKeys);
      })
      .catch(() => {});
  }, []);

  const fetchDailyInsight = useCallback(
    async (targetKind: 'tech-news' | 'quote', forceRefresh = false) => {
      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const cacheStorageKey = 'aether_daily_insight_v1';

      if (!forceRefresh) {
        try {
          const cachedRaw = localStorage.getItem(cacheStorageKey);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw) as Record<string, DailyInsightData>;
            const cachedEntry = parsed?.[targetKind];
            if (cachedEntry && cachedEntry.dateKey === dateKey && cachedEntry.headline) {
              setDailyInsight(cachedEntry);
              setDailyInsightError(null);
              setDailyInsightMissingKey(false);
              return;
            }
          }
        } catch {
          // ignore malformed cache
        }
      }

      setDailyInsightLoading(true);
      setDailyInsightError(null);
      setDailyInsightMissingKey(false);

      const geminiProv = stateRef.current.providers.find((p) => p.kind === 'gemini');
      try {
        const resp = await fetch('/api/ai/daily-insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: targetKind,
            apiKey: geminiProv?.apiKey,
            dateLabel: dateKey,
          }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          missingKey?: boolean;
          error?: string;
          kind?: 'tech-news' | 'quote';
          headline?: string;
          snippet?: string;
          topic?: string;
          sources?: Array<{ title: string; uri: string }>;
          searchQueries?: string[];
          fetchedAt?: number;
          latencyMs?: number;
        };

        if (!data.ok || !data.headline) {
          setDailyInsight(null);
          setDailyInsightMissingKey(Boolean(data.missingKey));
          setDailyInsightError(data.error || 'Could not fetch Daily Insight via search.');
          return;
        }

        const fresh: DailyInsightData = {
          kind: data.kind || targetKind,
          headline: data.headline,
          snippet: data.snippet || '',
          topic: data.topic || (targetKind === 'quote' ? 'Wisdom' : 'Tech Brief'),
          sources: Array.isArray(data.sources) ? data.sources : [],
          searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries : undefined,
          fetchedAt: data.fetchedAt || Date.now(),
          latencyMs: data.latencyMs,
          dateKey,
        };
        setDailyInsight(fresh);
        try {
          const existingRaw = localStorage.getItem(cacheStorageKey);
          const existing = existingRaw
            ? (JSON.parse(existingRaw) as Record<string, DailyInsightData>)
            : {};
          localStorage.setItem(
            cacheStorageKey,
            JSON.stringify({ ...existing, [fresh.kind]: fresh }),
          );
        } catch {
          // ignore cache write issues
        }
      } catch (err) {
        setDailyInsight(null);
        setDailyInsightError(
          err instanceof Error ? err.message : 'Network error while fetching Daily Insight.',
        );
      } finally {
        setDailyInsightLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchDailyInsight('tech-news', false);
  }, [fetchDailyInsight]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const sorted = [...voices].sort((a, b) => {
        const aNat = /natural|neural|google|guy|ryan|aria|jarvis/i.test(a.name) ? 0 : 1;
        const bNat = /natural|neural|google|guy|ryan|aria|jarvis/i.test(b.name) ? 0 : 1;
        return aNat - bNat || a.name.localeCompare(b.name);
      });
      setAvailableVoices(sorted);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const activeThread = useMemo(
    () => state.threads.find((t) => t.id === state.activeThreadId) || state.threads[0],
    [state.threads, state.activeThreadId],
  );

  const activePersona = useMemo(
    () => state.personas.find((p) => p.id === activeThread.personaId) || state.personas[0],
    [state.personas, activeThread.personaId],
  );

  const activeProviderDisplay = useMemo(() => {
    const slot = routingSlot === 'auto' ? activePersona.preferredSlot : routingSlot;
    const pid = slot === 'fast' ? state.routing.fastProviderId : state.routing.reasoningProviderId;
    const model = slot === 'fast' ? state.routing.fastModel : state.routing.reasoningModel;
    const prov = state.providers.find((p) => p.id === pid);
    if (!prov || !isProviderReady(prov, envKeys)) {
      return 'Demo Engine (Add Key)';
    }
    return `${prov.label} · ${model}`;
  }, [routingSlot, activePersona, state.routing, state.providers, envKeys]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread.messages.length]);

  const showToast = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const handleChangeTheme = useCallback(
    (nextTheme: AppTheme) => {
      setState((prev) => ({ ...prev, theme: nextTheme }));
      const label =
        nextTheme === 'cyber-day'
          ? 'Cyber-Day (Light)'
          : nextTheme === 'high-contrast'
            ? 'High-Contrast (Win11 Accessibility)'
            : 'Obsidian (Dark)';
      showToast(`Theme: ${label}`);
    },
    [showToast],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState((prev) => {
      if (prev === 'SPEAKING') {
        return stateRef.current.voice.wakeWordEnabled ? 'WAKE_ARMED' : 'IDLE';
      }
      return prev;
    });
  }, []);

  const speakText = useCallback((rawText: string) => {
    if (!stateRef.current.voice.ttsEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = rawText
      .replace(/```[\s\S]*?```/g, ' Code block displayed on screen. ')
      .replace(/[*_`#>]/g, '')
      .slice(0, 1000)
      .trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = stateRef.current.voice.rate;
    utter.pitch = stateRef.current.voice.pitch;
    if (stateRef.current.voice.voiceURI) {
      const chosen = window.speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === stateRef.current.voice.voiceURI);
      if (chosen) utter.voice = chosen;
    }
    utter.onstart = () => setVoiceState('SPEAKING');
    utter.onend = () =>
      setVoiceState(stateRef.current.voice.wakeWordEnabled ? 'WAKE_ARMED' : 'IDLE');
    utter.onerror = () =>
      setVoiceState(stateRef.current.voice.wakeWordEnabled ? 'WAKE_ARMED' : 'IDLE');
    window.speechSynthesis.speak(utter);
  }, []);

  const teardownMicStream = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAnalyser(null);
  }, []);

  const initMicAnalyser = useCallback(async () => {
    if (micStreamRef.current && audioCtxRef.current) return micStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 128;
      source.connect(node);
      setMicBlocked(false);
      setAnalyser(node);
      return stream;
    } catch {
      setMicBlocked(true);
      return null;
    }
  }, []);

  // Continuously sample ambient audio RMS level (0-100) for sensitivity gating & UI meter
  useEffect(() => {
    if (!analyser) {
      setLiveAudioLevel(0);
      setIsMicGated(false);
      return;
    }
    const buf = new Uint8Array(analyser.fftSize);
    let rafId = 0;
    let lastUiUpdate = 0;

    const sample = (now: number) => {
      analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const norm = (buf[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      const level = Math.min(100, Math.round(rms * 280));
      const threshold = stateRef.current.voice.inputSensitivityThreshold ?? 18;
      if (threshold <= 0 || level >= threshold) {
        lastAboveThresholdAtRef.current = performance.now();
      }
      if (now - lastUiUpdate >= 50) {
        lastUiUpdate = now;
        setLiveAudioLevel(level);
        const activelyListeningOrArmed =
          voiceStateRef.current === 'LISTENING' || voiceStateRef.current === 'WAKE_ARMED';
        const gatedNow =
          activelyListeningOrArmed &&
          threshold > 0 &&
          performance.now() - lastAboveThresholdAtRef.current > 1400;
        setIsMicGated(gatedNow);
      }
      rafId = window.requestAnimationFrame(sample);
    };

    rafId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(rafId);
  }, [analyser]);

  const isAudioAboveThreshold = useCallback(() => {
    const threshold = stateRef.current.voice.inputSensitivityThreshold ?? 18;
    if (threshold <= 0) return true;
    return performance.now() - lastAboveThresholdAtRef.current <= 1400;
  }, []);

  const stopMicMonitor = useCallback(() => {
    setIsMonitoringMic(false);
    if (voiceStateRef.current === 'IDLE' && !recognitionRef.current && !mediaRecorderRef.current) {
      teardownMicStream();
    }
  }, [teardownMicStream]);

  const toggleMicMonitor = useCallback(async () => {
    if (isMonitoringMic) {
      stopMicMonitor();
      return;
    }
    const stream = await initMicAnalyser();
    if (!stream) {
      showToast('Microphone permission denied or unavailable');
      return;
    }
    setIsMonitoringMic(true);
  }, [initMicAnalyser, isMonitoringMic, showToast, stopMicMonitor]);

  const handleExportJson = useCallback(() => {
    const safePayload = {
      exportedAt: new Date().toISOString(),
      app: 'AETHER // OS',
      threads: stateRef.current.threads,
      missions: stateRef.current.missions,
      notes: stateRef.current.notes,
      personas: stateRef.current.personas,
      macros: stateRef.current.macros,
      voiceLogs: stateRef.current.voiceLogs,
      voicePerf: stateRef.current.voicePerf,
      routing: stateRef.current.routing,
    };
    const blob = new Blob([JSON.stringify(safePayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Workspace backup exported');
  }, [showToast]);

  const handleImportJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Partial<AetherAppState>;
        setState((prev) => ({
          ...prev,
          threads: Array.isArray(data.threads) && data.threads.length > 0 ? data.threads : prev.threads,
          activeThreadId:
            Array.isArray(data.threads) && data.threads.length > 0 ? data.threads[0].id : prev.activeThreadId,
          missions: Array.isArray(data.missions) ? data.missions : prev.missions,
          notes: Array.isArray(data.notes) ? data.notes : prev.notes,
          personas: Array.isArray(data.personas) && data.personas.length > 0 ? data.personas : prev.personas,
          macros: Array.isArray(data.macros) && data.macros.length > 0 ? data.macros : prev.macros,
          voiceLogs: Array.isArray(data.voiceLogs) ? data.voiceLogs.slice(0, 20) : prev.voiceLogs,
          voicePerf: Array.isArray(data.voicePerf) ? data.voicePerf.slice(-40) : prev.voicePerf,
          routing: data.routing ? { ...prev.routing, ...data.routing } : prev.routing,
        }));
        showToast('Workspace backup imported');
      } catch {
        showToast('Invalid JSON backup file');
      }
    },
    [showToast],
  );

  const executeToolCall = useCallback(async (messageId: string, toolCall: ToolCallProposal) => {
    let status: ToolCallProposal['status'] = 'executed';
    let resultText = '';

    try {
      if (toolCall.name === 'create_mission') {
        const title = String(toolCall.args.title || 'Untitled Mission');
        const rawPrio = String(toolCall.args.priority || 'P2').toUpperCase();
        const priority: 'P1' | 'P2' | 'P3' =
          rawPrio === 'P1' || rawPrio === 'P2' || rawPrio === 'P3' ? rawPrio : 'P2';
        const dueLabel = toolCall.args.dueLabel ? String(toolCall.args.dueLabel) : 'Today';
        const newItem: MissionItem = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          priority,
          status: 'active',
          dueLabel,
          notes: toolCall.args.notes ? String(toolCall.args.notes) : undefined,
          createdAt: Date.now(),
        };
        setState((prev) => ({ ...prev, missions: [newItem, ...prev.missions] }));
        resultText = `Queued ${priority} mission: "${title}"`;
      } else if (toolCall.name === 'complete_mission') {
        const query = String(toolCall.args.titleQuery || '').toLowerCase();
        let matchedTitle = '';
        setState((prev) => ({
          ...prev,
          missions: prev.missions.map((m) => {
            if (!matchedTitle && m.status === 'active' && m.title.toLowerCase().includes(query)) {
              matchedTitle = m.title;
              return { ...m, status: 'done' };
            }
            return m;
          }),
        }));
        resultText = matchedTitle ? `Completed mission: "${matchedTitle}"` : `No active mission matched "${query}"`;
      } else if (toolCall.name === 'save_note') {
        const title = String(toolCall.args.title || 'Agent Note');
        const content = String(toolCall.args.content || '');
        const tags = Array.isArray(toolCall.args.tags) ? toolCall.args.tags.map(String) : ['agent'];
        const note: VaultNote = {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          content,
          tags,
          pinned: Boolean(toolCall.args.pinned),
          updatedAt: Date.now(),
        };
        setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
        resultText = `Saved note "${title}" to Knowledge Vault`;
      } else if (toolCall.name === 'run_js_sandbox') {
        const code = String(toolCall.args.code || '');
        const res = await runJsInWorkerSandbox(code);
        status = res.ok ? 'executed' : 'error';
        const parts: string[] = [];
        if (res.logs.length > 0) parts.push(res.logs.join('\n'));
        if (res.returnValue) parts.push(`Return: ${res.returnValue}`);
        if (res.error) parts.push(`Error: ${res.error}`);
        resultText = parts.join('\n') || `Executed cleanly in ${res.durationMs}ms`;
      } else if (toolCall.name === 'analyze_image') {
        const requestedName = toolCall.args.imageName ? String(toolCall.args.imageName).toLowerCase() : '';
        const focus = toolCall.args.focus ? String(toolCall.args.focus) : undefined;
        const currentThread =
          stateRef.current.threads.find((t) => t.id === stateRef.current.activeThreadId) ||
          stateRef.current.threads[0];

        const sessionImages: ChatAttachment[] = [];
        for (const m of currentThread.messages) {
          if (m.attachments) {
            for (const att of m.attachments) {
              if (att.kind === 'image' && att.dataUrl) {
                sessionImages.push(att);
              }
            }
          }
        }

        const targetImage = requestedName
          ? [...sessionImages].reverse().find((img) => img.name.toLowerCase().includes(requestedName)) ||
            sessionImages[sessionImages.length - 1]
          : sessionImages[sessionImages.length - 1];

        if (!targetImage || !targetImage.dataUrl) {
          status = 'error';
          resultText = 'No attached image found in the active session to analyze.';
        } else {
          const recentTranscript = currentThread.messages
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'User' : 'AETHER'}: ${m.content.slice(0, 240)}`)
            .join('\n');

          const visionRes = await analyzeSessionImage({
            imageDataUrl: targetImage.dataUrl,
            imageName: targetImage.name,
            focus,
            sessionContext: `Session: ${currentThread.title}\n${recentTranscript}`,
            providers: stateRef.current.providers,
            routing: stateRef.current.routing,
            envKeys,
          });

          resultText = `[${visionRes.providerLabel} · ${visionRes.model} · ${visionRes.latencyMs}ms]\n\n${visionRes.description}`;
          setState((prev) => ({
            ...prev,
            telemetry: [
              ...prev.telemetry,
              {
                id: `tel-vis-${Date.now()}`,
                timestamp: Date.now(),
                providerLabel: visionRes.providerLabel,
                model: visionRes.model,
                latencyMs: visionRes.latencyMs,
                tokens: visionRes.tokens,
                ok: true,
              },
            ],
          }));
        }
      } else if (toolCall.name === 'inject_personality') {
        const rawMode = String(toolCall.args.mode || 'jarvis').toLowerCase();
        const mode: PersonalityMode =
          rawMode.includes('cortana') ? 'cortana' : rawMode.includes('hal') ? 'hal' : 'jarvis';
        setState((prev) => ({ ...prev, personalityMode: mode }));
        const profile = PERSONALITY_PROFILES[mode];
        resultText = `Injected ${profile.label} (${profile.tagline})`;
      } else if (toolCall.name.startsWith('webhook_')) {
        const toolId = toolCall.name.replace(/^webhook_/, '');
        const matchedTool = stateRef.current.customTools.find(
          (t) => t.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) === toolId,
        );
        if (!matchedTool) {
          throw new Error(`Custom REST tool "${toolId}" not found.`);
        }
        const resp = await fetch('/api/tools/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: matchedTool.url,
            method: matchedTool.method,
            authHeaderName: matchedTool.authHeaderName,
            authHeaderValue: matchedTool.authHeaderValue,
            payloadJson: toolCall.args.payloadJson,
          }),
        });
        const data = (await resp.json()) as { ok: boolean; status?: number; body?: string; error?: string };
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${data.status}`);
        }
        resultText = `HTTP ${data.status}\n${(data.body || '').slice(0, 600)}`;
      }
    } catch (err) {
      status = 'error';
      resultText = err instanceof Error ? err.message : 'Tool execution error';
    }

    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === prev.activeThreadId
          ? {
              ...t,
              messages: t.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      toolCalls: msg.toolCalls?.map((tc) =>
                        tc.id === toolCall.id ? { ...tc, status, resultText } : tc,
                      ),
                    }
                  : msg,
              ),
            }
          : t,
      ),
    }));

    if (
      status === 'executed' &&
      (toolCall.requiresConfirmation ||
        toolCall.name === 'analyze_image' ||
        toolCall.name === 'run_js_sandbox' ||
        toolCall.name.startsWith('webhook_'))
    ) {
      triggerHapticPulse('tool-chain');
    }
  }, [envKeys, triggerHapticPulse]);

  const rejectToolCall = useCallback((messageId: string, toolCallId: string) => {
    setState((prev) => ({
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === prev.activeThreadId
          ? {
              ...t,
              messages: t.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      toolCalls: msg.toolCalls?.map((tc) =>
                        tc.id === toolCallId ? { ...tc, status: 'rejected', resultText: 'Declined' } : tc,
                      ),
                    }
                  : msg,
              ),
            }
          : t,
      ),
    }));
  }, []);

  const finalizeVoicePerf = useCallback(
    (
      tracking: { voiceLogId?: string; voicePerfId?: string; startedAt: number } | undefined,
      ok: boolean,
    ) => {
      if (!tracking) return;
      const commandLatencyMs = Math.max(1, Math.round(performance.now() - tracking.startedAt));
      setState((prev) => ({
        ...prev,
        voicePerf: tracking.voicePerfId
          ? prev.voicePerf.map((s) =>
              s.id === tracking.voicePerfId ? { ...s, commandLatencyMs, ok } : s,
            )
          : prev.voicePerf,
        voiceLogs: tracking.voiceLogId
          ? prev.voiceLogs.map((v) =>
              v.id === tracking.voiceLogId ? { ...v, commandLatencyMs } : v,
            )
          : prev.voiceLogs,
      }));
    },
    [],
  );

  const sendPrompt = useCallback(
    async (
      overridePrompt?: string,
      voiceTracking?: { voiceLogId?: string; voicePerfId?: string; startedAt: number },
    ) => {
      const rawText = (overridePrompt !== undefined ? overridePrompt : input).trim();
      const currentAttachments = overridePrompt !== undefined ? [] : attachments;
      if (!rawText && currentAttachments.length === 0) return;

      if (stateRef.current.voice.interruptOnSpeech) {
        stopSpeaking();
      }

      // Built-in Voice/Slash Quick Commands
      const lowerRaw = rawText.toLowerCase();
      if (overridePrompt !== undefined) {
        if (lowerRaw === 'stop talking' || lowerRaw === 'quiet' || lowerRaw === 'mute') {
          stopSpeaking();
          finalizeVoicePerf(voiceTracking, true);
          return;
        }
        if (lowerRaw === 'open api matrix' || lowerRaw === 'open settings') {
          setApiMatrixOpen(true);
          speakText('Opening API and Model Matrix.');
          finalizeVoicePerf(voiceTracking, true);
          return;
        }
        if (lowerRaw === 'open missions' || lowerRaw === 'show tasks') {
          setInspectorTab('missions');
          setWorkspaceDrawerOpen(true);
          speakText('Opening your mission queue.');
          finalizeVoicePerf(voiceTracking, true);
          return;
        }
        if (lowerRaw === 'clear chat' || lowerRaw === 'clear conversation') {
          setState((prev) => ({
            ...prev,
            threads: prev.threads.map((t) =>
              t.id === prev.activeThreadId ? { ...t, messages: [], updatedAt: Date.now() } : t,
            ),
          }));
          speakText('Conversation cleared.');
          finalizeVoicePerf(voiceTracking, true);
          return;
        }
      }

      // Slash Commands
      if (rawText.startsWith('/') && currentAttachments.length === 0) {
        const [cmd, ...restParts] = rawText.split(/\s+/);
        const arg = restParts.join(' ').trim();
        const lowerCmd = cmd.toLowerCase();

        if (lowerCmd === '/clear') {
          setInput('');
          setState((prev) => ({
            ...prev,
            threads: prev.threads.map((t) =>
              t.id === prev.activeThreadId ? { ...t, messages: [], updatedAt: Date.now() } : t,
            ),
          }));
          showToast('Conversation cleared');
          return;
        }
        if (lowerCmd === '/hud') {
          setInput('');
          setCompactHud((v) => !v);
          return;
        }
        if (lowerCmd === '/keys') {
          setInput('');
          setApiMatrixOpen(true);
          return;
        }
        if (lowerCmd === '/export') {
          setInput('');
          handleExportJson();
          return;
        }
        if (lowerCmd === '/model') {
          setInput('');
          if (arg === 'fast' || arg === 'reasoning' || arg === 'auto') {
            setRoutingSlot(arg);
            showToast(`Routing switched to ${arg.toUpperCase()}`);
          } else {
            setApiMatrixOpen(true);
          }
          return;
        }
        if (lowerCmd === '/mute') {
          setInput('');
          toggleGlobalMicMute();
          return;
        }
        if (lowerCmd === '/theme') {
          setInput('');
          const normalized = arg.toLowerCase();
          if (normalized.includes('day') || normalized.includes('light')) {
            handleChangeTheme('cyber-day');
          } else if (normalized.includes('contrast') || normalized.includes('hc')) {
            handleChangeTheme('high-contrast');
          } else if (normalized.includes('obsidian') || normalized.includes('dark')) {
            handleChangeTheme('obsidian');
          } else {
            const order: AppTheme[] = ['obsidian', 'cyber-day', 'high-contrast'];
            const next = order[(order.indexOf(stateRef.current.theme) + 1) % order.length];
            handleChangeTheme(next);
          }
          return;
        }
        if (lowerCmd === '/personality') {
          setInput('');
          const normalized = arg.toLowerCase();
          const mode: PersonalityMode | null = normalized.includes('cortana')
            ? 'cortana'
            : normalized.includes('hal')
              ? 'hal'
              : normalized.includes('jarvis')
                ? 'jarvis'
                : null;
          if (mode) {
            setState((prev) => ({ ...prev, personalityMode: mode }));
            const profile = PERSONALITY_PROFILES[mode];
            showToast(`Personality Injector: ${profile.label} (${profile.tagline})`);
          } else {
            showToast('Usage: /personality jarvis | cortana | hal');
          }
          return;
        }
        if (lowerCmd === '/mode') {
          setInput('');
          const match = stateRef.current.personas.find(
            (p) => p.name.toLowerCase().includes(arg.toLowerCase()) || p.id.toLowerCase() === arg.toLowerCase(),
          );
          if (match) {
            setState((prev) => ({
              ...prev,
              threads: prev.threads.map((t) =>
                t.id === prev.activeThreadId ? { ...t, personaId: match.id } : t,
              ),
            }));
            showToast(`Persona: ${match.name}`);
          }
          return;
        }
        if (lowerCmd === '/task' && arg) {
          setInput('');
          const item: MissionItem = {
            id: `m-${Date.now()}`,
            title: arg,
            priority: 'P2',
            status: 'active',
            dueLabel: 'Today',
            createdAt: Date.now(),
          };
          setState((prev) => ({ ...prev, missions: [item, ...prev.missions] }));
          setInspectorTab('missions');
          setWorkspaceDrawerOpen(true);
          showToast(`Mission added: ${arg}`);
          return;
        }
        if (lowerCmd === '/note' && arg) {
          setInput('');
          const note: VaultNote = {
            id: `n-${Date.now()}`,
            title: arg.slice(0, 40),
            content: arg,
            tags: ['quick-note'],
            pinned: false,
            updatedAt: Date.now(),
          };
          setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
          setInspectorTab('vault');
          setWorkspaceDrawerOpen(true);
          showToast('Saved note to Vault');
          return;
        }
        if (lowerCmd === '/macro') {
          const macro = stateRef.current.macros.find(
            (m) => m.command.toLowerCase() === arg.toLowerCase() || m.name.toLowerCase().includes(arg.toLowerCase()),
          );
          if (macro) {
            setInput('');
            await sendPrompt(macro.steps.join('\n'));
            return;
          }
        }
      }

      if (overridePrompt === undefined) {
        setInput('');
        setAttachments([]);
      }

      const userMsg: ChatMessage = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        content: rawText || '(Attached files)',
        timestamp: Date.now(),
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      };

      const targetThreadId = stateRef.current.activeThreadId;
      const currentThread =
        stateRef.current.threads.find((t) => t.id === targetThreadId) || stateRef.current.threads[0];
      const updatedMessages = [...currentThread.messages, userMsg];
      const newTitle =
        currentThread.messages.filter((m) => m.role === 'user').length === 0 && rawText
          ? rawText.slice(0, 36)
          : currentThread.title;

      setState((prev) => ({
        ...prev,
        threads: prev.threads.map((t) =>
          t.id === targetThreadId
            ? { ...t, title: newTitle, messages: updatedMessages, updatedAt: Date.now() }
            : t,
        ),
      }));

      setIsSending(true);
      setVoiceState('THINKING');

      const persona =
        stateRef.current.personas.find((p) => p.id === currentThread.personaId) || stateRef.current.personas[0];

      const activeMissionsSummary = stateRef.current.missions
        .filter((m) => m.status === 'active')
        .slice(0, 8)
        .map((m) => `- [${m.priority}] ${m.title}`)
        .join('\n');

      const personalityProfile =
        PERSONALITY_PROFILES[stateRef.current.personalityMode] || PERSONALITY_PROFILES.jarvis;

      const systemContext =
        `${personalityProfile.systemPromptInjection}\n\n` +
        `${persona.systemInstruction}\n\n` +
        `Active Missions:\n${activeMissionsSummary || 'None'}`;

      try {
        const result = await routeAgentChat({
          slot: routingSlot,
          personaSlot: persona.preferredSlot,
          systemInstruction: systemContext,
          messages: updatedMessages,
          providers: stateRef.current.providers,
          routing: stateRef.current.routing,
          customTools: stateRef.current.customTools,
          envKeys,
        });

        const assistantMsgId = `msg-a-${Date.now()}`;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: result.text || (result.toolCalls.length > 0 ? 'Proposed action:' : '(No response)'),
          timestamp: Date.now(),
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
          meta: {
            providerLabel: result.providerLabel,
            model: result.model,
            latencyMs: result.latencyMs,
            tokens: result.tokens,
            fallbackUsed: result.fallbackUsed,
            demoMode: result.demoMode,
          },
        };

        setState((prev) => ({
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === targetThreadId
              ? { ...t, messages: [...t.messages, assistantMsg], updatedAt: Date.now() }
              : t,
          ),
          telemetry: [
            ...prev.telemetry,
            ...result.attempts.map((a, idx) => ({
              id: `tel-${Date.now()}-${idx}`,
              timestamp: Date.now(),
              providerLabel: a.providerLabel,
              model: a.model,
              latencyMs: a.latencyMs,
              tokens: a.ok ? result.tokens : 0,
              ok: a.ok,
              fallbackUsed: result.fallbackUsed && a.ok,
              error: a.error,
            })),
          ],
        }));

        let autoExecutedCount = 0;
        for (const tc of result.toolCalls) {
          if (!tc.requiresConfirmation) {
            await executeToolCall(assistantMsgId, tc);
            autoExecutedCount += 1;
          }
        }

        // Trigger haptic pulse on multi-step tool chains or high-confidence conclusions
        const isHighConfidenceConclusion =
          Boolean(result.text) &&
          !result.demoMode &&
          (result.text.length >= 260 ||
            /\b(conclusion|summary|verified|confirmed|recommendation|final answer)\b/i.test(
              result.text,
            ));

        if (autoExecutedCount >= 2 || (autoExecutedCount >= 1 && isHighConfidenceConclusion)) {
          triggerHapticPulse('tool-chain');
        } else if (
          isHighConfidenceConclusion ||
          (result.toolCalls.length === 0 &&
            result.text.length >= 260 &&
            /\b(conclusion|verified|summary|confirmed)\b/i.test(result.text))
        ) {
          triggerHapticPulse('high-confidence');
        }

        setVoiceState(stateRef.current.voice.wakeWordEnabled ? 'WAKE_ARMED' : 'IDLE');
        finalizeVoicePerf(voiceTracking, true);
        if (result.text) {
          speakText(result.text);
        }
      } catch (err) {
        const errText = err instanceof Error ? err.message : 'Request failed.';
        const errMsg: ChatMessage = {
          id: `msg-e-${Date.now()}`,
          role: 'assistant',
          content: `**Execution Error**\n\n${errText}`,
          timestamp: Date.now(),
          meta: {
            providerLabel: 'Router Fault',
            model: 'error',
            latencyMs: 0,
          },
        };
        setState((prev) => ({
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === targetThreadId
              ? { ...t, messages: [...t.messages, errMsg], updatedAt: Date.now() }
              : t,
          ),
        }));
        finalizeVoicePerf(voiceTracking, false);
        setVoiceState(stateRef.current.voice.wakeWordEnabled ? 'WAKE_ARMED' : 'IDLE');
      } finally {
        setIsSending(false);
      }
    },
    [input, attachments, routingSlot, envKeys, stopSpeaking, showToast, handleExportJson, executeToolCall, speakText, finalizeVoicePerf, triggerHapticPulse],
  );

  const recordVoiceLog = useCallback(
    (
      transcript: string,
      source: VoiceLogEntry['source'],
      opts?: {
        wakePhrase?: string;
        sttAccuracyPct?: number;
        isEstimatedConfidence?: boolean;
        sttLatencyMs?: number;
      },
    ) => {
      const clean = transcript.trim();
      const now = Date.now();
      const voiceLogId = `vlog-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const voicePerfId = `vperf-${now}-${Math.random().toString(36).slice(2, 6)}`;
      if (!clean) return { voiceLogId, voicePerfId, startedAt: performance.now() };

      const sttAccuracyPct = opts?.sttAccuracyPct ?? 94;
      const entry: VoiceLogEntry = {
        id: voiceLogId,
        transcript: clean,
        source,
        timestamp: now,
        wakePhrase: source === 'wake-word' ? opts?.wakePhrase : undefined,
        confidencePct: sttAccuracyPct,
      };
      const perfSample: VoicePerformanceSample = {
        id: voicePerfId,
        timestamp: now,
        transcript: clean,
        source,
        sttAccuracyPct,
        isEstimatedConfidence: opts?.isEstimatedConfidence,
        sttLatencyMs: opts?.sttLatencyMs ?? 120,
        commandLatencyMs: 0,
        ok: true,
      };

      setState((prev) => ({
        ...prev,
        voiceLogs: [entry, ...prev.voiceLogs].slice(0, 20),
        voicePerf: [...prev.voicePerf, perfSample].slice(-40),
      }));

      return { voiceLogId, voicePerfId, startedAt: performance.now() };
    },
    [],
  );

  // Stop all voice capture
  const stopVoiceCapture = useCallback(() => {
    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
    wakeActiveCaptureRef.current = false;
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    teardownMicStream();
    setIsMonitoringMic(false);
    setIsMicGated(false);
    gateOpenForTurnRef.current = false;
    setInterimTranscript('');
    setVoiceState('IDLE');
  }, [teardownMicStream]);

  // Unified SpeechRecognition listener supporting both "Hey Jarvis" Wake-Word and Direct Mic
  const startSpeechEngine = useCallback(
    async (mode: 'wake' | 'direct') => {
      if (recognitionRef.current) {
        const old = recognitionRef.current;
        recognitionRef.current = null;
        try {
          old.stop();
        } catch {
          // ignore
        }
      }

      const stream = await initMicAnalyser();
      if (!stream) {
        showToast('Microphone permission denied or unavailable');
        setState((prev) => ({
          ...prev,
          voice: { ...prev.voice, wakeWordEnabled: false, handsFreeMode: false },
        }));
        setVoiceState('IDLE');
        return;
      }

      setIsMonitoringMic(false);
      gateOpenForTurnRef.current = false;
      wakeActiveCaptureRef.current = mode === 'direct';
      setVoiceState(mode === 'wake' ? 'WAKE_ARMED' : 'LISTENING');

      const SpeechRecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecCtor) {
        const rec = new SpeechRecCtor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (event: BrowserSpeechRecognitionEvent) => {
          let interim = '';
          let finalChunk = '';
          let confSum = 0;
          let confCount = 0;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const alt = event.results[i][0];
            const text = alt.transcript;
            if (event.results[i].isFinal) {
              finalChunk += ' ' + text;
              if (typeof alt.confidence === 'number' && alt.confidence > 0) {
                confSum += alt.confidence;
                confCount += 1;
              }
            } else {
              interim += text;
            }
          }

          const rawConfidence = confCount > 0 ? confSum / confCount : 0;
          const sttAccuracyPct =
            rawConfidence > 0
              ? Math.round(Math.min(100, Math.max(1, rawConfidence * 100)))
              : 94;
          const isEstimatedConfidence = rawConfidence <= 0;

          const combined = (finalChunk || interim).trim();
          const wakePhrase = stateRef.current.voice.wakeWordPhrase;
          const aboveThreshold = isAudioAboveThreshold();

          // If in passive WAKE_ARMED mode, watch for wake phrase ("Hey Jarvis") above sensitivity floor
          if (!wakeActiveCaptureRef.current && stateRef.current.voice.wakeWordEnabled) {
            if (!aboveThreshold) return;
            const wakeCheck = extractWakeCommand(combined, wakePhrase);
            if (wakeCheck.triggered) {
              playWakeChime();
              if (stateRef.current.voice.interruptOnSpeech) {
                window.speechSynthesis?.cancel();
              }
              gateOpenForTurnRef.current = true;
              utteranceStartRef.current = performance.now();
              wakeActiveCaptureRef.current = true;
              setVoiceState('LISTENING');
              setInterimTranscript(wakeCheck.remainder || 'Listening...');

              // Auto-disarm back to WAKE_ARMED after 8s if no final command arrives
              if (wakeTimeoutRef.current) window.clearTimeout(wakeTimeoutRef.current);
              wakeTimeoutRef.current = window.setTimeout(() => {
                if (wakeActiveCaptureRef.current && stateRef.current.voice.wakeWordEnabled) {
                  wakeActiveCaptureRef.current = false;
                  gateOpenForTurnRef.current = false;
                  utteranceStartRef.current = null;
                  setInterimTranscript('');
                  setVoiceState('WAKE_ARMED');
                }
              }, 8000);

              if (finalChunk.trim() && wakeCheck.remainder.length > 1) {
                if (wakeTimeoutRef.current) window.clearTimeout(wakeTimeoutRef.current);
                const sttLatencyMs = Math.max(
                  40,
                  Math.round(performance.now() - (utteranceStartRef.current ?? performance.now())),
                );
                utteranceStartRef.current = null;
                gateOpenForTurnRef.current = false;
                wakeActiveCaptureRef.current = false;
                setInterimTranscript('');
                const tracking = recordVoiceLog(wakeCheck.remainder, 'wake-word', {
                  wakePhrase,
                  sttAccuracyPct,
                  isEstimatedConfidence,
                  sttLatencyMs,
                });
                void sendPrompt(wakeCheck.remainder, tracking);
              }
            }
            return;
          }

          // Active command capture mode: wait until ambient sound exceeds sensitivity threshold
          if (!gateOpenForTurnRef.current) {
            if (!aboveThreshold) {
              return;
            }
            gateOpenForTurnRef.current = true;
          }

          if (utteranceStartRef.current === null) {
            utteranceStartRef.current = performance.now();
          }

          if (interim) {
            const stripped = stateRef.current.voice.wakeWordEnabled
              ? extractWakeCommand(interim, wakePhrase).remainder || interim
              : interim;
            setInterimTranscript(stripped);
          }

          if (finalChunk.trim()) {
            if (wakeTimeoutRef.current) window.clearTimeout(wakeTimeoutRef.current);
            const sttLatencyMs = Math.max(
              40,
              Math.round(performance.now() - (utteranceStartRef.current ?? performance.now())),
            );
            utteranceStartRef.current = null;
            gateOpenForTurnRef.current = false;
            const cleaned = stateRef.current.voice.wakeWordEnabled
              ? extractWakeCommand(finalChunk.trim(), wakePhrase).remainder || finalChunk.trim()
              : finalChunk.trim();

            setInterimTranscript('');
            if (cleaned) {
              if (stateRef.current.voice.wakeWordEnabled) {
                wakeActiveCaptureRef.current = false;
                const tracking = recordVoiceLog(cleaned, 'wake-word', {
                  wakePhrase,
                  sttAccuracyPct,
                  isEstimatedConfidence,
                  sttLatencyMs,
                });
                void sendPrompt(cleaned, tracking);
              } else {
                // Single-turn direct mic stops after sending
                stopVoiceCapture();
                const tracking = recordVoiceLog(cleaned, 'direct-mic', {
                  sttAccuracyPct,
                  isEstimatedConfidence,
                  sttLatencyMs,
                });
                void sendPrompt(cleaned, tracking);
              }
            }
          }
        };

        rec.onerror = (ev) => {
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setMicBlocked(true);
            showToast('Microphone access blocked by browser');
            stopVoiceCapture();
            setState((prev) => ({ ...prev, voice: { ...prev.voice, wakeWordEnabled: false } }));
          }
        };

        rec.onend = () => {
          if (recognitionRef.current === rec && stateRef.current.voice.wakeWordEnabled) {
            try {
              rec.start();
              return;
            } catch {
              // ignore restart error
            }
          }
          if (recognitionRef.current === rec && !stateRef.current.voice.wakeWordEnabled) {
            teardownMicStream();
            setVoiceState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
          }
        };

        recognitionRef.current = rec;
        try {
          rec.start();
          return;
        } catch {
          // fall through to MediaRecorder fallback
        }
      }

      // Fallback when browser lacks SpeechRecognition
      if (mode === 'direct' && typeof MediaRecorder !== 'undefined') {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size < 500) return;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.split(',')[1];
            if (!base64) return;
            const geminiProv = stateRef.current.providers.find((p) => p.kind === 'gemini');
            try {
              setInterimTranscript('Transcribing audio...');
              const sttStart = performance.now();
              const resp = await fetch('/api/ai/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  mimeType: blob.type || 'audio/webm',
                  base64Data: base64,
                  apiKey: geminiProv?.apiKey,
                }),
              });
              const data = (await resp.json()) as { ok: boolean; transcript?: string; error?: string };
              const sttLatencyMs = Math.max(20, Math.round(performance.now() - sttStart));
              setInterimTranscript('');
              if (data.ok && data.transcript) {
                const tracking = recordVoiceLog(data.transcript, 'audio-transcribe', {
                  sttAccuracyPct: 97,
                  isEstimatedConfidence: true,
                  sttLatencyMs,
                });
                void sendPrompt(data.transcript, tracking);
              } else if (data.error) {
                showToast(data.error);
              }
            } catch {
              setInterimTranscript('');
            }
          };
          reader.readAsDataURL(blob);
        };
        recorder.start();
        showToast('Recording audio — click mic again to send');
      } else {
        showToast('Wake-word recognition requires Chrome, Edge, or Windows 11 WebView2');
        setState((prev) => ({ ...prev, voice: { ...prev.voice, wakeWordEnabled: false } }));
        stopVoiceCapture();
      }
    },
    [
      initMicAnalyser,
      isAudioAboveThreshold,
      recordVoiceLog,
      sendPrompt,
      showToast,
      stopVoiceCapture,
      teardownMicStream,
    ],
  );

  const toggleGlobalMicMute = useCallback(() => {
    const nextMuted = !stateRef.current.voice.micMuted;
    if (nextMuted) {
      stopVoiceCapture();
      setState((prev) => ({
        ...prev,
        voice: { ...prev.voice, micMuted: true, wakeWordEnabled: false },
      }));
      showToast('Microphone globally muted');
    } else {
      setMicBlocked(false);
      setState((prev) => ({
        ...prev,
        voice: { ...prev.voice, micMuted: false },
      }));
      showToast('Microphone unmuted');
    }
  }, [showToast, stopVoiceCapture]);

  const toggleWakeWord = useCallback(() => {
    if (stateRef.current.voice.micMuted) {
      showToast('Microphone is globally muted — unmute first to arm Wake Word');
      return;
    }
    const next = !stateRef.current.voice.wakeWordEnabled;
    setState((prev) => ({
      ...prev,
      voice: { ...prev.voice, wakeWordEnabled: next, ttsEnabled: next ? true : prev.voice.ttsEnabled },
    }));
    if (next) {
      playWakeChime();
      showToast(`"${stateRef.current.voice.wakeWordPhrase}" wake listener armed`);
      void startSpeechEngine('wake');
    } else {
      stopVoiceCapture();
      showToast('Wake word disarmed');
    }
  }, [showToast, startSpeechEngine, stopVoiceCapture]);

  const toggleDirectMic = useCallback(() => {
    if (stateRef.current.voice.micMuted) {
      showToast('Microphone is globally muted — click Muted indicator to unmute');
      return;
    }
    if (voiceStateRef.current === 'LISTENING') {
      if (stateRef.current.voice.wakeWordEnabled) {
        wakeActiveCaptureRef.current = false;
        setInterimTranscript('');
        setVoiceState('WAKE_ARMED');
      } else {
        stopVoiceCapture();
      }
      return;
    }

    if (voiceStateRef.current === 'SPEAKING') {
      stopSpeaking();
    }

    if (stateRef.current.voice.wakeWordEnabled && recognitionRef.current) {
      playWakeChime();
      wakeActiveCaptureRef.current = true;
      setVoiceState('LISTENING');
    } else {
      void startSpeechEngine('direct');
    }
  }, [showToast, startSpeechEngine, stopSpeaking, stopVoiceCapture]);

  const cyclePersonality = useCallback(() => {
    const order: PersonalityMode[] = ['jarvis', 'cortana', 'hal'];
    const currentIdx = order.indexOf(stateRef.current.personalityMode);
    const nextMode = order[(currentIdx + 1) % order.length];
    setState((prev) => ({ ...prev, personalityMode: nextMode }));
    const profile = PERSONALITY_PROFILES[nextMode];
    showToast(`Personality Injector: ${profile.label} (${profile.tagline})`);
  }, [showToast]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleGlobalMicMute();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleDirectMic();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setCompactHud((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        cyclePersonality();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setWorkspaceDrawerOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setApiMatrixOpen(false);
        setWin11GuideOpen(false);
        setSessionsDrawerOpen(false);
        setWorkspaceDrawerOpen(false);
        stopSpeaking();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleDirectMic, toggleGlobalMicMute, stopSpeaking, cyclePersonality]);

  const handleAddFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const loaded: ChatAttachment[] = [];

    for (const file of arr.slice(0, 6)) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(file);
        });
        loaded.push({
          id,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          kind: 'image',
          dataUrl,
        });
      } else {
        const textContent = await file.text();
        const isCode = /\.(ts|tsx|js|jsx|py|rs|ps1|json|css|html)$/i.test(file.name);
        loaded.push({
          id,
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          kind: isCode ? 'code' : 'document',
          textContent,
        });
      }
    }
    setAttachments((prev) => [...prev, ...loaded]);
  }, []);

  const handleCreateThread = useCallback(() => {
    const fresh: ConversationThread = {
      ...createInitialThread(),
      id: `thread-${Date.now()}`,
      title: `Session ${stateRef.current.threads.length + 1}`,
      messages: [],
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      threads: [fresh, ...prev.threads],
      activeThreadId: fresh.id,
    }));
  }, []);

  const handleRunMacro = useCallback(
    (macro: WorkflowMacro) => {
      void sendPrompt(macro.steps.join('\n'));
    },
    [sendPrompt],
  );

  const hasMessages = activeThread.messages.length > 0;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#05070C] text-slate-100 relative">
      {/* Minimal 3-Zone Top Bar */}
      <header className="h-13 shrink-0 border-b hud-hairline bg-[#070B14]/85 backdrop-blur-md px-4 flex items-center justify-between gap-4 z-20">
        {/* Zone 1: Wordmark + Sessions Drawer Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSessionsDrawerOpen((v) => !v)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            title="Sessions & Personas"
            aria-label="Open Sessions Drawer"
          >
            <History className="w-4 h-4" />
          </button>
          <span className="font-display font-bold tracking-tight text-base text-white whitespace-nowrap shrink-0">
            AETHER <span className="text-[#00F0FF]">//</span> OS
          </span>
        </div>

        {/* Zone 2: Personality Injector, Wake-Word & Active Model Controls */}
        {!compactHud && (
          <div className="hidden md:flex items-center gap-3">
            <PersonalityInjector
              mode={state.personalityMode}
              onChangeMode={(mode) => {
                setState((prev) => ({ ...prev, personalityMode: mode }));
                const profile = PERSONALITY_PROFILES[mode];
                showToast(`Personality Injector: ${profile.label} (${profile.tagline})`);
              }}
            />

            <button
              type="button"
              onClick={toggleWakeWord}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                state.voice.wakeWordEnabled
                  ? 'bg-sky-500/15 text-sky-300 border-sky-400/40'
                  : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Ear className="w-3.5 h-3.5" />
              <span>
                {state.voice.wakeWordEnabled
                  ? `Listening: "${state.voice.wakeWordPhrase}"`
                  : `Enable "${state.voice.wakeWordPhrase}"`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setApiMatrixOpen(true)}
              className="hidden xl:inline text-xs font-mono text-slate-400 hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0"
              title="Switch Model or Provider"
            >
              {activeProviderDisplay}
            </button>
          </div>
        )}

        {/* Zone 3: Drawer & System Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setWorkspaceDrawerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hud-hairline text-xs text-slate-300 hover:text-white hover:border-cyan-400/40 transition-colors whitespace-nowrap shrink-0"
            title="Missions, Vault, Voice Log & Telemetry (Ctrl+/)"
          >
            <Layers className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span className="hidden sm:inline">Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setApiMatrixOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hud-hairline-cyan bg-cyan-500/10 text-xs font-medium text-[#00F0FF] hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">API Keys</span>
          </button>

          <button
            type="button"
            onClick={() => setWin11GuideOpen(true)}
            className="p-2 rounded-lg border hud-hairline text-slate-400 hover:text-white hover:border-cyan-400/40 transition-colors"
            title="Windows 11 Build Guide"
            aria-label="Windows 11 Build Guide"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Calm Humanoid Stage */}
      <main className="flex-1 flex flex-col min-h-0 bg-[#05070C] hud-grid-bg relative overflow-hidden">
        {notice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full border hud-hairline-cyan bg-[#0A0F1A]/95 text-xs text-cyan-200 shadow-lg z-30">
            {notice}
          </div>
        )}

        {/* Mobile / Narrow-Window Personality Injector Bar */}
        <div className="md:hidden flex justify-center pt-2 px-4">
          <PersonalityInjector
            mode={state.personalityMode}
            onChangeMode={(mode) => {
              setState((prev) => ({ ...prev, personalityMode: mode }));
              const profile = PERSONALITY_PROFILES[mode];
              showToast(`Personality Injector: ${profile.label} (${profile.tagline})`);
            }}
          />
        </div>

        {/* Humanoid Presence Core */}
        <HumanoidCore
          voiceState={voiceState}
          personalityMode={state.personalityMode}
          appTheme={state.theme}
          analyser={analyser}
          interimTranscript={interimTranscript}
          wakeWordPhrase={state.voice.wakeWordPhrase}
          wakeWordEnabled={state.voice.wakeWordEnabled}
          docked={hasMessages || compactHud}
          hapticPulse={hapticPulse}
          onCoreClick={toggleDirectMic}
        />

        {/* Empty State Daily Insight + Voice Command History + Quick Actions OR Conversation Stream */}
        {!hasMessages ? (
          <div className="px-4 pb-3 space-y-3 overflow-y-auto max-h-[48vh] shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-5xl mx-auto items-stretch">
              <DailyInsightCard
                insight={dailyInsight}
                kind={dailyInsightKind}
                loading={dailyInsightLoading}
                error={dailyInsightError}
                missingKey={dailyInsightMissingKey}
                onChangeKind={(nextKind) => {
                  setDailyInsightKind(nextKind);
                  void fetchDailyInsight(nextKind, false);
                }}
                onRefresh={() => void fetchDailyInsight(dailyInsightKind, true)}
                onOpenApiKeys={() => setApiMatrixOpen(true)}
                onSaveToVault={(item) => {
                  const sourcesBlock =
                    item.sources.length > 0
                      ? `\n\nSources:\n${item.sources.map((s) => `- [${s.title}](${s.uri})`).join('\n')}`
                      : '';
                  const note: VaultNote = {
                    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    title: item.headline,
                    content: `${item.snippet}${sourcesBlock}`,
                    tags: [item.kind, item.topic.toLowerCase().replace(/\s+/g, '-')],
                    pinned: false,
                    updatedAt: Date.now(),
                  };
                  setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
                  showToast('Saved Daily Insight to Knowledge Vault');
                }}
                onExplore={(item) => {
                  const promptText =
                    item.kind === 'quote'
                      ? `Reflect on this quote and how it applies to building resilient software systems: ${item.headline} — ${item.snippet}`
                      : `Give me a deeper technical breakdown and practical implications of this topic: "${item.headline}". Summary: ${item.snippet}`;
                  void sendPrompt(promptText);
                }}
              />

              <VoiceCommandHistoryCard
                voiceLogs={state.voiceLogs}
                isSending={isSending}
                onRerun={(entry) => {
                  const now = Date.now();
                  const voicePerfId = `vperf-rep-${now}`;
                  const replaySample: VoicePerformanceSample = {
                    id: voicePerfId,
                    timestamp: now,
                    transcript: entry.transcript,
                    source: 'voice-replay',
                    sttAccuracyPct: entry.confidencePct ?? 96,
                    isEstimatedConfidence: entry.confidencePct === undefined,
                    sttLatencyMs: 0,
                    commandLatencyMs: 0,
                    ok: true,
                  };
                  setState((prev) => ({
                    ...prev,
                    voicePerf: [...prev.voicePerf, replaySample].slice(-40),
                  }));
                  void sendPrompt(entry.transcript, {
                    voiceLogId: entry.id,
                    voicePerfId,
                    startedAt: performance.now(),
                  });
                }}
                onOpenFullLog={() => {
                  setInspectorTab('voice');
                  setWorkspaceDrawerOpen(true);
                }}
                onTriggerVoiceCapture={toggleDirectMic}
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto">
              {[
                {
                  label: state.voice.wakeWordEnabled ? 'Test "Hey Jarvis" Voice' : 'Enable "Hey Jarvis"',
                  action: () => (state.voice.wakeWordEnabled ? toggleDirectMic() : toggleWakeWord()),
                },
                {
                  label: 'Morning Tactical Brief',
                  action: () => void sendPrompt('/macro brief'),
                },
                {
                  label: 'Queue a Mission',
                  action: () =>
                    void sendPrompt('Create a P1 mission to finalize my Windows 11 desktop build'),
                },
                {
                  label: 'Run JS Sandbox',
                  action: () =>
                    void sendPrompt('Run a JS sandbox computation to verify telemetry latency'),
                },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.action}
                  className="px-3.5 py-2 rounded-xl border hud-hairline bg-[#0A0F1A]/80 hover:border-[#00F0FF]/45 hover:text-white text-xs text-slate-300 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
            {activeThread.messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isHighlighted = highlightedMessageId === msg.id;
              return (
                <div
                  key={msg.id}
                  id={`chat-msg-${msg.id}`}
                  className={`max-w-3xl mx-auto flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`w-full transition-all duration-300 ${
                      isUser
                        ? 'max-w-xl rounded-2xl border border-violet-500/25 bg-[#101629]/90 px-4 py-3'
                        : 'rounded-2xl border hud-hairline bg-[#0A0F1A]/85 px-4 py-3.5'
                    } ${isHighlighted ? 'ring-2 ring-[#00F0FF]/80 shadow-[0_0_24px_rgba(0,240,255,0.2)]' : ''}`}
                  >
                    {/* Minimal Header */}
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 mb-1.5">
                      <span className={isUser ? 'text-violet-300 font-semibold' : 'text-[#00F0FF] font-semibold'}>
                        {isUser ? 'You' : 'AETHER'}
                      </span>
                      <span className="tabular-nums">
                        {msg.meta?.model ? `${msg.meta.model}` : ''}
                        {typeof msg.meta?.latencyMs === 'number' && msg.meta.latencyMs > 0
                          ? ` · ${msg.meta.latencyMs} ms`
                          : ''}
                      </span>
                    </div>

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2.5">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="rounded-lg border hud-hairline bg-[#060912] p-1.5 text-[11px] text-slate-300"
                          >
                            {att.kind === 'image' && att.dataUrl ? (
                              <div className="space-y-1.5">
                                <img
                                  src={att.dataUrl}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="max-h-40 rounded object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void sendPrompt(
                                      `Use analyze_image to describe "${att.name}" in the context of our current session.`,
                                    )
                                  }
                                  className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-cyan-500/10 text-[#00F0FF] hover:bg-cyan-500/20 transition-colors font-mono text-[10px]"
                                >
                                  <ScanEye className="w-3 h-3" />
                                  <span>Analyze Image</span>
                                </button>
                              </div>
                            ) : (
                              <span className="px-1.5 font-mono">{att.name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <MarkdownRenderer content={msg.content} />

                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 pt-3 border-t hud-hairline space-y-2">
                        {msg.toolCalls.map((tc) => (
                          <div
                            key={tc.id}
                            className="rounded-lg border hud-hairline bg-[#060912] p-3 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 font-mono">
                                {tc.requiresConfirmation && tc.status === 'pending' ? (
                                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                                ) : tc.status === 'executed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : tc.status === 'rejected' || tc.status === 'error' ? (
                                  <XCircle className="w-4 h-4 text-rose-400" />
                                ) : (
                                  <Terminal className="w-4 h-4 text-[#00F0FF]" />
                                )}
                                <span className="text-white font-semibold">{tc.name}</span>
                              </div>
                              <span
                                className={`font-mono text-[11px] uppercase ${
                                  tc.status === 'executed'
                                    ? 'text-emerald-400'
                                    : tc.status === 'pending'
                                      ? 'text-amber-300'
                                      : 'text-rose-400'
                                }`}
                              >
                                {tc.status}
                              </span>
                            </div>

                            <pre className="p-2 rounded bg-[#0A0F1A] font-mono text-[11px] text-slate-300 overflow-x-auto">
                              {JSON.stringify(tc.args, null, 2)}
                            </pre>

                            {tc.status === 'pending' && tc.requiresConfirmation && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => void executeToolCall(msg.id, tc)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>Approve & Run</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectToolCall(msg.id, tc.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hud-hairline text-slate-300 hover:text-rose-300"
                                >
                                  <span>Decline</span>
                                </button>
                              </div>
                            )}

                            {tc.resultText && (
                              <div className="p-2 rounded bg-[#090F1A] font-mono text-[11px] text-cyan-200 whitespace-pre-wrap">
                                {tc.resultText}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
        )}

        {/* Bottom Floating Voice & Command Dock */}
        <CommandDock
          input={input}
          onChangeInput={setInput}
          onSubmit={() => void sendPrompt()}
          attachments={attachments}
          onAddFiles={(f) => void handleAddFiles(f)}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          voiceState={voiceState}
          voiceSettings={state.voice}
          onChangeVoiceSettings={(patch: Partial<VoiceSettings>) =>
            setState((prev) => ({ ...prev, voice: { ...prev.voice, ...patch } }))
          }
          availableVoices={availableVoices}
          onToggleWakeWord={toggleWakeWord}
          onToggleDirectMic={toggleDirectMic}
          onStopSpeaking={stopSpeaking}
          isSending={isSending}
          routingSlot={routingSlot}
          onChangeRoutingSlot={setRoutingSlot}
          macros={state.macros}
          liveAudioLevel={liveAudioLevel}
          isMonitoringMic={isMonitoringMic}
          onToggleMicMonitor={() => void toggleMicMonitor()}
          onStopMicMonitor={stopMicMonitor}
          appTheme={state.theme}
          onChangeTheme={handleChangeTheme}
          compactMode={compactHud}
          micMuted={state.voice.micMuted}
          micBlocked={micBlocked}
          isMicGated={isMicGated}
          onToggleGlobalMicMute={toggleGlobalMicMute}
        />
      </main>

      {/* Slide-Over Left Drawer (Sessions & Personas) */}
      {sessionsDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm flex"
          onClick={() => setSessionsDrawerOpen(false)}
        >
          <div className="h-full flex" onClick={(e) => e.stopPropagation()}>
            <LeftSidebar
              threads={state.threads}
              activeThreadId={activeThread.id}
              onSelectThread={(id) => {
                setState((prev) => ({ ...prev, activeThreadId: id }));
                setSessionsDrawerOpen(false);
              }}
              onCreateThread={() => {
                handleCreateThread();
                setSessionsDrawerOpen(false);
              }}
              onDeleteThread={(id) =>
                setState((prev) => {
                  const remaining = prev.threads.filter((t) => t.id !== id);
                  if (remaining.length === 0) return prev;
                  return {
                    ...prev,
                    threads: remaining,
                    activeThreadId: prev.activeThreadId === id ? remaining[0].id : prev.activeThreadId,
                  };
                })
              }
              personas={state.personas}
              activePersonaId={activeThread.personaId}
              onSelectPersona={(personaId) =>
                setState((prev) => ({
                  ...prev,
                  threads: prev.threads.map((t) =>
                    t.id === prev.activeThreadId ? { ...t, personaId } : t,
                  ),
                }))
              }
              onUpdatePersonaInstruction={(id, systemInstruction) =>
                setState((prev) => ({
                  ...prev,
                  personas: prev.personas.map((p) => (p.id === id ? { ...p, systemInstruction } : p)),
                }))
              }
              macros={state.macros}
              onRunMacro={(m) => {
                setSessionsDrawerOpen(false);
                handleRunMacro(m);
              }}
              onExportJson={handleExportJson}
              onImportJson={handleImportJson}
            />
            <button
              type="button"
              onClick={() => setSessionsDrawerOpen(false)}
              className="m-3 p-2 h-fit rounded-lg bg-[#0A0F1A] border hud-hairline text-slate-300 hover:text-white"
              aria-label="Close Sessions Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Right Drawer (Missions, Vault, Macros, Metrics) */}
      {workspaceDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm flex justify-end"
          onClick={() => setWorkspaceDrawerOpen(false)}
        >
          <div className="h-full flex" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setWorkspaceDrawerOpen(false)}
              className="m-3 p-2 h-fit rounded-lg bg-[#0A0F1A] border hud-hairline text-slate-300 hover:text-white"
              aria-label="Close Workspace Drawer"
            >
              <X className="w-4 h-4" />
            </button>
            <InspectorDrawer
              activeTab={inspectorTab}
              onChangeTab={setInspectorTab}
              missions={state.missions}
              onAddMission={(title, priority, dueLabel) =>
                setState((prev) => ({
                  ...prev,
                  missions: [
                    {
                      id: `m-${Date.now()}`,
                      title,
                      priority,
                      status: 'active',
                      dueLabel,
                      createdAt: Date.now(),
                    },
                    ...prev.missions,
                  ],
                }))
              }
              onToggleMission={(id) =>
                setState((prev) => ({
                  ...prev,
                  missions: prev.missions.map((m) =>
                    m.id === id ? { ...m, status: m.status === 'done' ? 'active' : 'done' } : m,
                  ),
                }))
              }
              onUpdateMissionDue={(id, dueLabel) =>
                setState((prev) => ({
                  ...prev,
                  missions: prev.missions.map((m) => (m.id === id ? { ...m, dueLabel } : m)),
                }))
              }
              onDeleteMission={(id) =>
                setState((prev) => ({ ...prev, missions: prev.missions.filter((m) => m.id !== id) }))
              }
              notes={state.notes}
              onAddNote={(title, content, tags) =>
                setState((prev) => ({
                  ...prev,
                  notes: [
                    {
                      id: `n-${Date.now()}`,
                      title,
                      content,
                      tags,
                      pinned: false,
                      updatedAt: Date.now(),
                    },
                    ...prev.notes,
                  ],
                }))
              }
              onTogglePinNote={(id) =>
                setState((prev) => ({
                  ...prev,
                  notes: prev.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
                }))
              }
              onDeleteNote={(id) =>
                setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }))
              }
              voiceLogs={state.voiceLogs}
              voicePerf={state.voicePerf}
              onReplayVoiceLog={(entry) => {
                setWorkspaceDrawerOpen(false);
                const now = Date.now();
                const voicePerfId = `vperf-rep-${now}`;
                const replaySample: VoicePerformanceSample = {
                  id: voicePerfId,
                  timestamp: now,
                  transcript: entry.transcript,
                  source: 'voice-replay',
                  sttAccuracyPct: entry.confidencePct ?? 96,
                  isEstimatedConfidence: entry.confidencePct === undefined,
                  sttLatencyMs: 0,
                  commandLatencyMs: 0,
                  ok: true,
                };
                setState((prev) => ({
                  ...prev,
                  voicePerf: [...prev.voicePerf, replaySample].slice(-40),
                }));
                void sendPrompt(entry.transcript, {
                  voiceLogId: entry.id,
                  voicePerfId,
                  startedAt: performance.now(),
                });
              }}
              onLoadVoiceLogToInput={(transcript) => {
                setInput(transcript);
                setWorkspaceDrawerOpen(false);
                showToast('Voice transcript loaded into command dock');
              }}
              onDeleteVoiceLog={(id) =>
                setState((prev) => ({
                  ...prev,
                  voiceLogs: prev.voiceLogs.filter((v) => v.id !== id),
                }))
              }
              onClearVoiceLogs={() => {
                setState((prev) => ({ ...prev, voiceLogs: [] }));
                showToast('Voice Log cleared');
              }}
              onClearVoicePerf={() => {
                setState((prev) => ({ ...prev, voicePerf: [] }));
                showToast('Voice Performance telemetry cleared');
              }}
              onTriggerVoiceCapture={() => {
                setWorkspaceDrawerOpen(false);
                toggleDirectMic();
              }}
              macros={state.macros}
              onRunMacro={(m) => {
                setWorkspaceDrawerOpen(false);
                handleRunMacro(m);
              }}
              onAddMacro={(name, command, prompt) =>
                setState((prev) => ({
                  ...prev,
                  macros: [
                    ...prev.macros,
                    {
                      id: `macro-${Date.now()}`,
                      name,
                      command,
                      description: prompt.slice(0, 80),
                      steps: [prompt],
                    },
                  ],
                }))
              }
              customTools={state.customTools}
              telemetry={state.telemetry}
              onOpenApiMatrix={() => {
                setWorkspaceDrawerOpen(false);
                setApiMatrixOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <ApiMatrixModal
        open={apiMatrixOpen}
        onClose={() => setApiMatrixOpen(false)}
        providers={state.providers}
        onChangeProviders={(providers) => setState((prev) => ({ ...prev, providers }))}
        routing={state.routing}
        onChangeRouting={(routing) => setState((prev) => ({ ...prev, routing }))}
        customTools={state.customTools}
        onChangeCustomTools={(customTools) => setState((prev) => ({ ...prev, customTools }))}
        persistKeysLocally={state.persistKeysLocally}
        onChangePersistKeys={(persistKeysLocally) => setState((prev) => ({ ...prev, persistKeysLocally }))}
        onClearStoredKeys={() => {
          clearStoredKeyVault();
          setState((prev) => ({
            ...prev,
            providers: prev.providers.map((p) => ({ ...p, apiKey: '' })),
            customTools: prev.customTools.map((t) => ({ ...t, authHeaderValue: '' })),
          }));
          showToast('All stored runtime keys purged');
        }}
        envKeys={envKeys}
      />

      <CommandPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        threads={state.threads}
        notes={state.notes}
        missions={state.missions}
        personas={state.personas}
        macros={state.macros}
        onSelectThread={(id) => setState((prev) => ({ ...prev, activeThreadId: id }))}
        onJumpToMessage={(threadId, messageId) => {
          setState((prev) => ({ ...prev, activeThreadId: threadId }));
          setHighlightedMessageId(messageId);
          window.setTimeout(() => {
            document
              .getElementById(`chat-msg-${messageId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
          window.setTimeout(() => {
            setHighlightedMessageId((curr) => (curr === messageId ? null : curr));
          }, 2400);
        }}
        onOpenVault={() => {
          setInspectorTab('vault');
          setWorkspaceDrawerOpen(true);
        }}
        onOpenMissions={() => {
          setInspectorTab('missions');
          setWorkspaceDrawerOpen(true);
        }}
        onSelectPersona={(personaId) =>
          setState((prev) => ({
            ...prev,
            threads: prev.threads.map((t) =>
              t.id === prev.activeThreadId ? { ...t, personaId } : t,
            ),
          }))
        }
        onRunMacro={handleRunMacro}
        onCreateThread={handleCreateThread}
        onOpenApiMatrix={() => setApiMatrixOpen(true)}
        onOpenWin11Guide={() => setWin11GuideOpen(true)}
        onToggleCompactHud={() => setCompactHud((v) => !v)}
        onToggleMic={toggleDirectMic}
        onToggleMicMute={toggleGlobalMicMute}
        onExportJson={handleExportJson}
      />

      <Win11GuideModal open={win11GuideOpen} onClose={() => setWin11GuideOpen(false)} />
    </div>
  );
}
