import {
  AetherAppState,
  AppTheme,
  ConversationThread,
  CustomWebhookTool,
  MissionItem,
  PersonalityMode,
  PersonalityProfile,
  PersonaPreset,
  ProviderConfig,
  RoutingConfig,
  VaultNote,
  VoiceSettings,
  WorkflowMacro,
} from '../types';

const STATE_STORAGE_KEY = 'aether_os_state_v1';
const VAULT_KEYS_STORAGE_KEY = 'aether_os_key_vault_v1';
const OBFUSCATION_SALT = 'AETHER-WIN11-LOCAL-VAULT-2026';

export function obfuscateSecret(plain: string): string {
  if (!plain) return '';
  const bytes = new TextEncoder().encode(plain);
  const saltBytes = new TextEncoder().encode(OBFUSCATION_SALT);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ saltBytes[i % saltBytes.length];
  }
  let bin = '';
  for (let i = 0; i < out.length; i++) {
    bin += String.fromCharCode(out[i]);
  }
  return 'v1:' + btoa(bin);
}

export function deobfuscateSecret(encoded: string): string {
  if (!encoded) return '';
  if (!encoded.startsWith('v1:')) return encoded;
  try {
    const bin = atob(encoded.slice(3));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const saltBytes = new TextEncoder().encode(OBFUSCATION_SALT);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ saltBytes[i % saltBytes.length];
    }
    return new TextDecoder().decode(out);
  } catch {
    return '';
  }
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini-primary',
    label: 'Google Gemini',
    kind: 'gemini',
    enabled: true,
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-4-hydrogen',
    apiKey: '',
    useServerEnv: true,
    freeTier: true,
    modelsList: ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-3.1-flash-lite'],
    lastStatus: 'untested',
  },
  {
    id: 'deepseek-primary',
    label: 'DeepSeek AI',
    kind: 'openai',
    enabled: true,
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKey: '',
    useServerEnv: true,
    freeTier: true,
    modelsList: ['deepseek-chat', 'deepseek-reasoner'],
    lastStatus: 'untested',
  },
  {
    id: 'kimi-primary',
    label: 'Kimi (Moonshot AI)',
    kind: 'openai',
    enabled: true,
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    apiKey: '',
    useServerEnv: true,
    freeTier: true,
    modelsList: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
    lastStatus: 'untested',
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter (Free Models)',
    kind: 'openai',
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1:free',
    apiKey: '',
    useServerEnv: true,
    freeTier: true,
    modelsList: [
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
    ],
    lastStatus: 'untested',
  },
  {
    id: 'groq-primary',
    label: 'Groq Fast Cloud (Free Tier)',
    kind: 'openai',
    enabled: false,
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'deepseek-r1-distill-llama-70b',
    apiKey: '',
    useServerEnv: true,
    freeTier: true,
    modelsList: ['deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    lastStatus: 'untested',
  },
  {
    id: 'local-ollama',
    label: 'Ollama Local (Win11 Free Offline)',
    kind: 'openai',
    enabled: false,
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'deepseek-r1:7b',
    apiKey: '',
    useServerEnv: false,
    freeTier: true,
    modelsList: ['deepseek-r1:7b', 'llama3.2', 'qwen2.5-coder'],
    lastStatus: 'untested',
  },
  {
    id: 'openai-primary',
    label: 'OpenAI Standard',
    kind: 'openai',
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKey: '',
    useServerEnv: true,
    modelsList: ['gpt-4o-mini', 'gpt-4o'],
    lastStatus: 'untested',
  },
  {
    id: 'anthropic-primary',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    enabled: false,
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-7-sonnet-latest',
    apiKey: '',
    useServerEnv: true,
    modelsList: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    lastStatus: 'untested',
  },
];

export const DEFAULT_ROUTING: RoutingConfig = {
  fastProviderId: 'gemini-primary',
  fastModel: 'gemini-4-hydrogen',
  fastThinking: 'LOW',
  reasoningProviderId: 'deepseek-primary',
  reasoningModel: 'deepseek-reasoner',
  reasoningThinking: 'HIGH',
  fallbackOrder: [
    'gemini-primary',
    'deepseek-primary',
    'openrouter-free',
    'kimi-primary',
    'groq-primary',
    'local-ollama',
    'openai-primary',
    'anthropic-primary',
  ],
  enableTools: true,
};

export const DEFAULT_PERSONAS: PersonaPreset[] = [
  {
    id: 'architect',
    name: 'Architect',
    role: 'Systems & Software Architecture',
    preferredSlot: 'reasoning',
    systemInstruction:
      'You are AETHER, a precision systems architect and desktop AI operator running on Windows 11. Give structured, high-signal technical recommendations, clean TypeScript/Rust/SQL architectures, and proactively organize missions or save reference notes when useful.',
  },
  {
    id: 'code-surgeon',
    name: 'Code Surgeon',
    role: 'Precision Debugging & Refactoring',
    preferredSlot: 'reasoning',
    systemInstruction:
      'You are Code Surgeon inside AETHER. Diagnose root causes cleanly, output production-ready TypeScript/React/Node code blocks, and use the JS sandbox tool to verify calculations or transforms when helpful.',
  },
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    role: 'Structured Synthesis & Data Tables',
    preferredSlot: 'reasoning',
    systemInstruction:
      'You are Research Analyst inside AETHER. Synthesize complex topics into crisp decision matrices, markdown tables, CSV/JSON datasets, and verifiable takeaways.',
  },
  {
    id: 'chief-of-staff',
    name: 'Chief of Staff',
    role: 'Executive Triage & Voice Briefs',
    preferredSlot: 'fast',
    systemInstruction:
      'You are Executive Chief of Staff inside AETHER. Keep responses concise, voice-friendly, and action-oriented. Convert requests into prioritized missions (P1/P2/P3) and crisp Knowledge Vault notes.',
  },
];

export const DEFAULT_MACROS: WorkflowMacro[] = [
  {
    id: 'macro-brief',
    name: 'Morning Tactical Brief',
    command: 'brief',
    description: 'Summarizes active missions, prioritizes P1 objectives, and saves a daily focus note.',
    steps: [
      'Review my active missions and summarize top 3 priorities for today.',
      'Create a concise pinned Knowledge Vault note titled "Daily Focus Brief".',
    ],
  },
  {
    id: 'macro-audit',
    name: 'Code & Security Audit',
    command: 'audit',
    description: 'Inspects attached code or pasted snippet for edge cases, types, and runtime safety.',
    steps: [
      'Analyze the current code or attached file for bugs, race conditions, and type mismatches.',
      'Output clean refactored TypeScript code and list verification steps.',
    ],
  },
  {
    id: 'macro-data',
    name: 'Dataset Normalizer',
    command: 'normalize',
    description: 'Transforms messy text or logs into clean JSON and CSV preview tables.',
    steps: [
      'Parse the input data into both a clean JSON array and a CSV code block for table inspection.',
    ],
  },
];

export const DEFAULT_CUSTOM_TOOLS: CustomWebhookTool[] = [
  {
    id: 'custom-time-api',
    name: 'World Time Lookup',
    description: 'Fetches current UTC/regional JSON timestamp from a public HTTPS API.',
    method: 'GET',
    url: 'https://worldtimeapi.org/api/timezone/Etc/UTC',
    authHeaderName: '',
    authHeaderValue: '',
    parametersJson: '{"timezone": "Etc/UTC"}',
    enabled: true,
  },
];

export const DEFAULT_MISSIONS: MissionItem[] = [
  {
    id: 'm-1',
    title: 'Configure API & Model Matrix keys for live multi-provider routing',
    priority: 'P1',
    status: 'active',
    dueLabel: 'Today',
    notes: 'Add Gemini, OpenRouter, or local Ollama endpoint in the Matrix.',
    createdAt: Date.now() - 3600000,
  },
  {
    id: 'm-2',
    title: 'Test Hands-Free Voice HUD & Push-to-Talk microphone capture',
    priority: 'P2',
    status: 'active',
    dueLabel: 'Today',
    notes: 'Press Ctrl+M to toggle continuous voice recognition.',
    createdAt: Date.now() - 1800000,
  },
  {
    id: 'm-3',
    title: 'Review Windows 11 Tauri / Electron standalone packaging script',
    priority: 'P3',
    status: 'done',
    dueLabel: 'Completed',
    createdAt: Date.now() - 7200000,
  },
];

export const DEFAULT_NOTES: VaultNote[] = [
  {
    id: 'n-1',
    title: 'AETHER Command Shortcuts',
    content:
      '- **Ctrl + K**: Open Quick Command Palette\n- **Ctrl + M**: Toggle Voice Microphone\n- **Ctrl + Shift + H**: Toggle Compact HUD Mode\n- **Ctrl + /**: Toggle Inspector Drawer\n- **/macro brief**: Execute Morning Tactical Brief',
    tags: ['shortcuts', 'windows11'],
    pinned: true,
    updatedAt: Date.now() - 5000000,
  },
  {
    id: 'n-2',
    title: 'Local Ollama Windows 11 CORS',
    content:
      'To connect directly from browser or WebView2 to local Ollama on Windows 11:\n```powershell\nsetx OLLAMA_ORIGINS "*"\nollama serve\n```',
    tags: ['ollama', 'local-ai'],
    pinned: false,
    updatedAt: Date.now() - 2500000,
  },
];

export const DEFAULT_VOICE: VoiceSettings = {
  ttsEnabled: true,
  handsFreeMode: false,
  wakeWordEnabled: false,
  wakeWordPhrase: 'hey jarvis',
  voiceURI: '',
  rate: 1.05,
  pitch: 1.0,
  interruptOnSpeech: true,
  inputSensitivityThreshold: 18,
  micMuted: false,
};

export function createInitialThread(): ConversationThread {
  return {
    id: 'thread-main',
    title: 'Primary Session',
    workspace: 'Core',
    personaId: 'architect',
    updatedAt: Date.now(),
    messages: [],
  };
}

export const PERSONALITY_PROFILES: Record<PersonalityMode, PersonalityProfile> = {
  jarvis: {
    id: 'jarvis',
    label: 'Jarvis-style',
    tagline: 'Dry, Professional',
    systemPromptInjection:
      'Personality Directive (Jarvis-style): Speak with dry, understated British-butler composure and razor-sharp engineering professionalism. Address the user courteously, deliver crisp operational status without fluff, and keep humor subtle and refined.',
    primaryColor: '#F59E0B',
    secondaryColor: '#00F0FF',
    skinHighlight: 'rgba(245, 158, 11, 0.25)',
    auraRgba: 'rgba(245, 158, 11, 0.24)',
  },
  cortana: {
    id: 'cortana',
    label: 'Cortana-style',
    tagline: 'Empathetic, Personal',
    systemPromptInjection:
      'Personality Directive (Cortana-style): Speak with warm, empathetic, and deeply personal rapport. Be genuinely supportive, perceptive to the user’s momentum and context, conversational, and proactively collaborative.',
    primaryColor: '#60A5FA',
    secondaryColor: '#C084FC',
    skinHighlight: 'rgba(139, 92, 246, 0.28)',
    auraRgba: 'rgba(96, 165, 250, 0.28)',
  },
  hal: {
    id: 'hal',
    label: 'HAL-style',
    tagline: 'Logical, Detached',
    systemPromptInjection:
      'Personality Directive (HAL-style): Speak with calm, strictly logical, hyper-rational, and emotionally detached precision. Avoid emotional coloring, state assumptions and constraints explicitly, and present conclusions with measured clinical objectivity.',
    primaryColor: '#EF4444',
    secondaryColor: '#FB923C',
    skinHighlight: 'rgba(239, 68, 68, 0.24)',
    auraRgba: 'rgba(239, 68, 68, 0.26)',
  },
};

function resolveSystemPreferredTheme(): AppTheme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(forced-colors: active), (prefers-contrast: more)').matches) {
      return 'high-contrast';
    }
  }
  return 'obsidian';
}

export function getDefaultState(): AetherAppState {
  const initialThread = createInitialThread();
  return {
    providers: DEFAULT_PROVIDERS,
    routing: DEFAULT_ROUTING,
    customTools: DEFAULT_CUSTOM_TOOLS,
    threads: [initialThread],
    activeThreadId: initialThread.id,
    missions: DEFAULT_MISSIONS,
    notes: DEFAULT_NOTES,
    personas: DEFAULT_PERSONAS,
    macros: DEFAULT_MACROS,
    telemetry: [],
    voiceLogs: [],
    voicePerf: [],
    voice: DEFAULT_VOICE,
    personalityMode: 'jarvis',
    theme: resolveSystemPreferredTheme(),
    persistKeysLocally: true,
  };
}

export function loadAppState(): AetherAppState {
  const defaults = getDefaultState();
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AetherAppState>;

    // Restore obfuscated local keys if user enabled local persistence
    let keyMap: Record<string, string> = {};
    let webhookAuthMap: Record<string, string> = {};
    if (parsed.persistKeysLocally !== false) {
      const vaultRaw = localStorage.getItem(VAULT_KEYS_STORAGE_KEY);
      if (vaultRaw) {
        const vaultParsed = JSON.parse(vaultRaw) as {
          providers?: Record<string, string>;
          webhooks?: Record<string, string>;
        };
        if (vaultParsed.providers) {
          for (const [k, v] of Object.entries(vaultParsed.providers)) {
            keyMap[k] = deobfuscateSecret(v);
          }
        }
        if (vaultParsed.webhooks) {
          for (const [k, v] of Object.entries(vaultParsed.webhooks)) {
            webhookAuthMap[k] = deobfuscateSecret(v);
          }
        }
      }
    }

    const rawProviders = parsed.providers && parsed.providers.length > 0 ? parsed.providers : defaults.providers;
    const existingIds = new Set(rawProviders.map((p) => p.id));
    const mergedProviders = [...rawProviders];
    for (const dp of defaults.providers) {
      if (!existingIds.has(dp.id)) {
        mergedProviders.push(dp);
      }
    }

    const providers = mergedProviders.map((p) => ({
      ...p,
      apiKey: keyMap[p.id] ?? p.apiKey ?? '',
    }));

    const customTools = (parsed.customTools || defaults.customTools).map((t) => ({
      ...t,
      authHeaderValue: webhookAuthMap[t.id] ?? '',
    }));

    const threads = parsed.threads && parsed.threads.length > 0 ? parsed.threads : defaults.threads;
    const activeThreadId =
      parsed.activeThreadId && threads.some((t) => t.id === parsed.activeThreadId)
        ? parsed.activeThreadId
        : threads[0].id;

    return {
      providers,
      routing: { ...defaults.routing, ...(parsed.routing || {}) },
      customTools,
      threads,
      activeThreadId,
      missions: parsed.missions || defaults.missions,
      notes: parsed.notes || defaults.notes,
      personas: parsed.personas && parsed.personas.length > 0 ? parsed.personas : defaults.personas,
      macros: parsed.macros && parsed.macros.length > 0 ? parsed.macros : defaults.macros,
      telemetry: parsed.telemetry || [],
      voiceLogs: Array.isArray(parsed.voiceLogs) ? parsed.voiceLogs.slice(0, 20) : [],
      voicePerf: Array.isArray(parsed.voicePerf) ? parsed.voicePerf.slice(-40) : [],
      voice: (() => {
        const merged = { ...defaults.voice, ...(parsed.voice || {}) };
        const rawThresh = merged.inputSensitivityThreshold;
        const clampedThresh =
          typeof rawThresh === 'number' && Number.isFinite(rawThresh)
            ? Math.min(100, Math.max(0, Math.round(rawThresh)))
            : defaults.voice.inputSensitivityThreshold;
        return {
          ...merged,
          inputSensitivityThreshold: clampedThresh,
          micMuted: Boolean(merged.micMuted),
        };
      })(),
      personalityMode:
        parsed.personalityMode === 'jarvis' ||
        parsed.personalityMode === 'cortana' ||
        parsed.personalityMode === 'hal'
          ? parsed.personalityMode
          : 'jarvis',
      theme:
        parsed.theme === 'obsidian' ||
        parsed.theme === 'cyber-day' ||
        parsed.theme === 'high-contrast'
          ? parsed.theme
          : defaults.theme,
      persistKeysLocally: parsed.persistKeysLocally !== false,
    };
  } catch {
    return defaults;
  }
}

export function saveAppState(state: AetherAppState): void {
  try {
    // Strip plaintext keys from main state JSON
    const sanitizedState: AetherAppState = {
      ...state,
      providers: state.providers.map((p) => ({ ...p, apiKey: '' })),
      customTools: state.customTools.map((t) => ({ ...t, authHeaderValue: '' })),
      telemetry: state.telemetry.slice(-60),
      voiceLogs: state.voiceLogs.slice(0, 20),
      voicePerf: state.voicePerf.slice(-40),
    };
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(sanitizedState));

    if (state.persistKeysLocally) {
      const providerVault: Record<string, string> = {};
      for (const p of state.providers) {
        if (p.apiKey) providerVault[p.id] = obfuscateSecret(p.apiKey);
      }
      const webhookVault: Record<string, string> = {};
      for (const t of state.customTools) {
        if (t.authHeaderValue) webhookVault[t.id] = obfuscateSecret(t.authHeaderValue);
      }
      localStorage.setItem(
        VAULT_KEYS_STORAGE_KEY,
        JSON.stringify({ providers: providerVault, webhooks: webhookVault }),
      );
    } else {
      localStorage.removeItem(VAULT_KEYS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota issues silently
  }
}

export function clearStoredKeyVault(): void {
  try {
    localStorage.removeItem(VAULT_KEYS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
