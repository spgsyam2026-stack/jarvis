export type VoiceState = 'IDLE' | 'WAKE_ARMED' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export type AppTheme = 'obsidian' | 'cyber-day' | 'high-contrast';

export type ProviderKind = 'gemini' | 'openai' | 'anthropic';

export type ThinkingPreset = 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type RoutingTaskSlot = 'auto' | 'fast' | 'reasoning';

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  useServerEnv?: boolean;
  lastLatencyMs?: number | null;
  lastStatus?: 'untested' | 'ok' | 'error';
  lastError?: string;
  freeTier?: boolean;
  modelsList?: string[];
}

export interface RoutingConfig {
  fastProviderId: string;
  fastModel: string;
  fastThinking: ThinkingPreset;
  reasoningProviderId: string;
  reasoningModel: string;
  reasoningThinking: ThinkingPreset;
  fallbackOrder: string[];
  enableTools: boolean;
}

export interface CustomWebhookTool {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  authHeaderName: string;
  authHeaderValue: string;
  parametersJson: string;
  enabled: boolean;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'code' | 'document' | 'audio';
  dataUrl?: string;
  textContent?: string;
}

export interface ToolCallProposal {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'executed' | 'rejected' | 'error';
  requiresConfirmation: boolean;
  resultText?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCallProposal[];
  meta?: {
    providerLabel?: string;
    model?: string;
    latencyMs?: number;
    tokens?: number;
    fallbackUsed?: boolean;
    demoMode?: boolean;
  };
}

export interface ConversationThread {
  id: string;
  title: string;
  workspace: string;
  personaId: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface MissionItem {
  id: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  status: 'active' | 'done';
  dueLabel?: string;
  notes?: string;
  createdAt: number;
}

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  updatedAt: number;
}

export interface PersonaPreset {
  id: string;
  name: string;
  role: string;
  systemInstruction: string;
  preferredSlot: 'fast' | 'reasoning';
}

export interface WorkflowMacro {
  id: string;
  name: string;
  command: string;
  description: string;
  steps: string[];
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  providerLabel: string;
  model: string;
  latencyMs: number;
  tokens: number;
  ok: boolean;
  fallbackUsed?: boolean;
  error?: string;
}

export interface VoiceSettings {
  ttsEnabled: boolean;
  handsFreeMode: boolean;
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  voiceURI: string;
  rate: number;
  pitch: number;
  interruptOnSpeech: boolean;
  inputSensitivityThreshold: number;
  micMuted: boolean;
}

export interface ServerEnvStatus {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  deepseek?: boolean;
  moonshot?: boolean;
  openrouter?: boolean;
  groq?: boolean;
}

export type PersonalityMode = 'jarvis' | 'cortana' | 'hal';

export interface PersonalityProfile {
  id: PersonalityMode;
  label: string;
  tagline: string;
  systemPromptInjection: string;
  primaryColor: string;
  secondaryColor: string;
  skinHighlight: string;
  auraRgba: string;
}

export interface VoiceLogEntry {
  id: string;
  transcript: string;
  source: 'wake-word' | 'direct-mic' | 'audio-transcribe';
  timestamp: number;
  wakePhrase?: string;
  confidencePct?: number;
  commandLatencyMs?: number;
}

export interface VoicePerformanceSample {
  id: string;
  timestamp: number;
  transcript: string;
  source: 'wake-word' | 'direct-mic' | 'audio-transcribe' | 'voice-replay';
  sttAccuracyPct: number;
  isEstimatedConfidence?: boolean;
  sttLatencyMs: number;
  commandLatencyMs: number;
  ok: boolean;
}

export interface DailyInsightSource {
  title: string;
  uri: string;
}

export interface DailyInsightData {
  kind: 'tech-news' | 'quote';
  headline: string;
  snippet: string;
  topic: string;
  sources: DailyInsightSource[];
  searchQueries?: string[];
  fetchedAt: number;
  latencyMs?: number;
  dateKey: string;
}

export interface AetherAppState {
  providers: ProviderConfig[];
  routing: RoutingConfig;
  customTools: CustomWebhookTool[];
  threads: ConversationThread[];
  activeThreadId: string;
  missions: MissionItem[];
  notes: VaultNote[];
  personas: PersonaPreset[];
  macros: WorkflowMacro[];
  telemetry: TelemetryEvent[];
  voiceLogs: VoiceLogEntry[];
  voicePerf: VoicePerformanceSample[];
  voice: VoiceSettings;
  personalityMode: PersonalityMode;
  theme: AppTheme;
  persistKeysLocally: boolean;
}
