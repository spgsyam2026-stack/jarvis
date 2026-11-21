import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Webhook,
  X,
  Zap,
} from 'lucide-react';
import {
  CustomWebhookTool,
  ProviderConfig,
  RoutingConfig,
  ServerEnvStatus,
  ThinkingPreset,
} from '../types';
import { isProviderReady, testProviderConnection } from '../lib/aiRouter';

interface ApiMatrixModalProps {
  open: boolean;
  onClose: () => void;
  providers: ProviderConfig[];
  onChangeProviders: (providers: ProviderConfig[]) => void;
  routing: RoutingConfig;
  onChangeRouting: (routing: RoutingConfig) => void;
  customTools: CustomWebhookTool[];
  onChangeCustomTools: (tools: CustomWebhookTool[]) => void;
  persistKeysLocally: boolean;
  onChangePersistKeys: (persist: boolean) => void;
  onClearStoredKeys: () => void;
  envKeys: ServerEnvStatus;
}

type MatrixTab = 'providers' | 'routing' | 'webhooks' | 'security';

const GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
];

const isServerEnvForProvider = (p: ProviderConfig, envKeys: ServerEnvStatus): boolean => {
  if (p.kind === 'gemini') return Boolean(envKeys.gemini);
  if (p.kind === 'anthropic') return Boolean(envKeys.anthropic);
  if (p.kind === 'openai') {
    const base = p.baseUrl.toLowerCase();
    if (base.includes('deepseek.com')) return Boolean(envKeys.deepseek || envKeys.openai);
    if (base.includes('moonshot.cn')) return Boolean(envKeys.moonshot || envKeys.openai);
    if (base.includes('openrouter.ai')) return Boolean(envKeys.openrouter || envKeys.openai);
    if (base.includes('groq.com')) return Boolean(envKeys.groq || envKeys.openai);
    return Boolean(envKeys.openai);
  }
  return false;
};

const getServerEnvKeyName = (p: ProviderConfig): string => {
  if (p.kind === 'gemini') return 'GEMINI_API_KEY';
  if (p.kind === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (p.kind === 'openai') {
    const base = p.baseUrl.toLowerCase();
    if (base.includes('deepseek.com')) return 'DEEPSEEK_API_KEY';
    if (base.includes('moonshot.cn')) return 'MOONSHOT_API_KEY';
    if (base.includes('openrouter.ai')) return 'OPENROUTER_API_KEY';
    if (base.includes('groq.com')) return 'GROQ_API_KEY';
    return 'OPENAI_API_KEY';
  }
  return 'API_KEY';
};

const getSuggestedModels = (p: ProviderConfig): string[] => {
  if (p.modelsList && p.modelsList.length > 0) return p.modelsList;
  const base = p.baseUrl.toLowerCase();
  if (base.includes('deepseek.com')) return ['deepseek-chat', 'deepseek-reasoner'];
  if (base.includes('moonshot.cn')) return ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'];
  if (base.includes('openrouter.ai')) {
    return [
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ];
  }
  if (base.includes('groq.com')) {
    return ['deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  }
  if (base.includes('localhost:11434')) return ['deepseek-r1', 'llama3.2', 'qwen2.5'];
  if (base.includes('localhost:1234')) return ['local-model'];
  return [];
};

export const ApiMatrixModal: React.FC<ApiMatrixModalProps> = ({
  open,
  onClose,
  providers,
  onChangeProviders,
  routing,
  onChangeRouting,
  customTools,
  onChangeCustomTools,
  persistKeysLocally,
  onChangePersistKeys,
  onClearStoredKeys,
  envKeys,
}) => {
  const [tab, setTab] = useState<MatrixTab>('providers');
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  if (!open) return null;

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) => {
    onChangeProviders(providers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handleTestProvider = async (provider: ProviderConfig) => {
    setTestingId(provider.id);
    const result = await testProviderConnection(provider);
    updateProvider(provider.id, {
      lastLatencyMs: result.latencyMs,
      lastStatus: result.ok ? 'ok' : 'error',
      lastError: result.error,
    });
    setTestingId(null);
  };

  const handleAddOpenAiProvider = (preset?: {
    label: string;
    baseUrl: string;
    model: string;
    freeTier?: boolean;
    modelsList?: string[];
  }) => {
    const newId = `custom-oai-${Date.now()}`;
    const newProvider: ProviderConfig = {
      id: newId,
      label: preset?.label || 'Custom OpenAI-Compatible',
      kind: 'openai',
      enabled: true,
      baseUrl: preset?.baseUrl || 'https://openrouter.ai/api/v1',
      defaultModel: preset?.model || 'openai/gpt-4o-mini',
      apiKey: '',
      useServerEnv: false,
      lastStatus: 'untested',
      freeTier: preset?.freeTier,
      modelsList: preset?.modelsList,
    };
    onChangeProviders([...providers, newProvider]);
    onChangeRouting({
      ...routing,
      fallbackOrder: [...routing.fallbackOrder, newId],
    });
  };

  const handleRemoveProvider = (id: string) => {
    if (providers.length <= 1) return;
    onChangeProviders(providers.filter((p) => p.id !== id));
    onChangeRouting({
      ...routing,
      fallbackOrder: routing.fallbackOrder.filter((fid) => fid !== id),
    });
  };

  const moveFallback = (index: number, delta: -1 | 1) => {
    const next = [...routing.fallbackOrder];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChangeRouting({ ...routing, fallbackOrder: next });
  };

  const handleAddCustomTool = () => {
    const next: CustomWebhookTool = {
      id: `hook_${Date.now().toString(36)}`,
      name: 'New REST Action',
      description: 'Calls an external HTTPS endpoint and returns JSON.',
      method: 'POST',
      url: 'https://api.example.com/v1/action',
      authHeaderName: 'Authorization',
      authHeaderValue: '',
      parametersJson: '{"query": "string"}',
      enabled: true,
    };
    onChangeCustomTools([...customTools, next]);
  };

  const updateCustomTool = (id: string, patch: Partial<CustomWebhookTool>) => {
    onChangeCustomTools(customTools.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeCustomTool = (id: string) => {
    onChangeCustomTools(customTools.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl border hud-hairline-cyan bg-[#0A0F1A] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="API and Model Matrix"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b hud-hairline bg-[#070B14]">
          <div>
            <h2 className="text-lg font-display font-semibold text-white">API & Model Matrix</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Runtime multi-provider key hub, per-task model routing, fallback priority, and REST tools
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            aria-label="Close API Matrix"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 py-2.5 border-b hud-hairline bg-[#080C16] overflow-x-auto">
          {(
            [
              { id: 'providers', label: 'Providers & Keys', icon: KeyRound },
              { id: 'routing', label: 'Task Routing & Fallback', icon: Zap },
              { id: 'webhooks', label: 'Custom REST / Webhooks', icon: Webhook },
              { id: 'security', label: 'Local Vault Policy', icon: ShieldCheck },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'providers' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b hud-hairline">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Server Env:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.gemini
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    Gemini {envKeys.gemini ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.deepseek
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    DeepSeek {envKeys.deepseek ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.moonshot
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    Kimi {envKeys.moonshot ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.openrouter
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    OpenRouter {envKeys.openrouter ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.groq
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    Groq {envKeys.groq ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.openai
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    OpenAI {envKeys.openai ? 'Active' : 'Not Set'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      envKeys.anthropic
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-800'
                    }`}
                  >
                    Anthropic {envKeys.anthropic ? 'Active' : 'Not Set'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'DeepSeek',
                        baseUrl: 'https://api.deepseek.com/v1',
                        model: 'deepseek-chat',
                        freeTier: false,
                        modelsList: ['deepseek-chat', 'deepseek-reasoner'],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>DeepSeek</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'Kimi (Moonshot AI)',
                        baseUrl: 'https://api.moonshot.cn/v1',
                        model: 'moonshot-v1-8k',
                        freeTier: false,
                        modelsList: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Kimi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'OpenRouter (Free)',
                        baseUrl: 'https://openrouter.ai/api/v1',
                        model: 'deepseek/deepseek-r1:free',
                        freeTier: true,
                        modelsList: [
                          'deepseek/deepseek-r1:free',
                          'deepseek/deepseek-chat:free',
                          'meta-llama/llama-3.3-70b-instruct:free',
                          'mistralai/mistral-7b-instruct:free',
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>OpenRouter Free</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'Groq Cloud',
                        baseUrl: 'https://api.groq.com/openai/v1',
                        model: 'deepseek-r1-distill-llama-70b',
                        freeTier: true,
                        modelsList: [
                          'deepseek-r1-distill-llama-70b',
                          'llama-3.3-70b-versatile',
                          'llama-3.1-8b-instant',
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Groq</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'Ollama (Local Offline)',
                        baseUrl: 'http://localhost:11434/v1',
                        model: 'deepseek-r1',
                        freeTier: true,
                        modelsList: ['deepseek-r1', 'llama3.2', 'qwen2.5'],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ollama</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddOpenAiProvider({
                        label: 'LM Studio (Win11)',
                        baseUrl: 'http://localhost:1234/v1',
                        model: 'local-model',
                        freeTier: true,
                        modelsList: ['local-model'],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>LM Studio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddOpenAiProvider()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Custom</span>
                  </button>
                </div>
              </div>

              {/* Free Models & Environment Configuration Guide Banner */}
              <div className="rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 via-[#060A14] to-blue-950/20 p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#00F0FF] shrink-0" />
                    <h3 className="text-xs font-display font-semibold text-white">
                      Free Available AI Models & Environment Variables
                    </h3>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/15 border border-cyan-500/30 text-[#00F0FF]">
                    Win11 Multi-Model Hub
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Configure server environment keys in <code className="text-cyan-300 font-mono bg-cyan-950/50 px-1 py-0.5 rounded border border-cyan-800/40">.env</code> or supply runtime keys below. AETHER provides out-of-the-box routing to free and low-cost reasoning models:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>DeepSeek V3 & R1</span>
                      <span className="text-[9px] font-mono text-emerald-400">Ultra-Low Cost</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Top reasoning. Set <code className="text-slate-300">DEEPSEEK_API_KEY</code> in .env or route via OpenRouter.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>Kimi (Moonshot AI)</span>
                      <span className="text-[9px] font-mono text-cyan-400">8k-128k Tokens</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Long context memory. Set <code className="text-slate-300">MOONSHOT_API_KEY</code> or paste runtime key.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>OpenRouter Free</span>
                      <span className="text-[9px] font-mono text-emerald-400">100% Free (:free)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Zero cost DeepSeek R1 & Llama 3.3. Set <code className="text-slate-300">OPENROUTER_API_KEY</code>.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>Groq Cloud</span>
                      <span className="text-[9px] font-mono text-emerald-400">Free Fast LPUs</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Blazing fast inference. Set <code className="text-slate-300">GROQ_API_KEY</code> in server environment.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>Ollama & LM Studio</span>
                      <span className="text-[9px] font-mono text-emerald-400">100% Offline / Free</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Local on Win11 (<code className="text-slate-300">:11434</code> / <code className="text-slate-300">:1234</code>). Zero keys required.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#0A0F1A]/80 border border-slate-800">
                    <div className="flex items-center justify-between font-semibold text-cyan-300">
                      <span>Google Gemini</span>
                      <span className="text-[9px] font-mono text-emerald-400">Free Tier (AI Studio)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Hydrogen/Neon models. Set <code className="text-slate-300">GEMINI_API_KEY</code> on server.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {providers.map((p) => {
                  const ready = isProviderReady(p, envKeys);
                  const revealed = Boolean(revealedKeys[p.id]);
                  const serverEnvAvailable = isServerEnvForProvider(p, envKeys);
                  const serverKeyName = getServerEnvKeyName(p);
                  const suggestedModels = getSuggestedModels(p);

                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                              className="accent-[#00F0FF] w-4 h-4 rounded"
                            />
                            <input
                              type="text"
                              value={p.label}
                              onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                              aria-label="Provider label"
                              className="bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-cyan-400/50 px-0.5"
                            />
                          </label>
                          <span className="text-xs font-mono text-slate-400">
                            {p.kind}
                            <span className="mx-1.5 text-slate-600">·</span>
                            <span className={ready ? 'text-emerald-400' : 'text-amber-400'}>
                              {ready ? 'Ready' : 'Key Required'}
                            </span>
                          </span>
                          {p.freeTier && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                              Free Tier
                            </span>
                          )}
                          {p.baseUrl.includes('localhost') && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-cyan-500/15 border border-cyan-500/30 text-[#00F0FF]">
                              Local / 100% Free
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {p.lastStatus === 'ok' && typeof p.lastLatencyMs === 'number' && (
                            <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{p.lastLatencyMs} ms</span>
                            </span>
                          )}
                          {p.lastStatus === 'error' && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-mono text-rose-400 max-w-[200px] truncate"
                              title={p.lastError}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{p.lastError || 'Failed'}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleTestProvider(p)}
                            disabled={testingId === p.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hud-hairline text-slate-200 hover:border-cyan-400/40 hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>{testingId === p.id ? 'Pinging...' : 'Test Connection'}</span>
                          </button>
                          {!['gemini-primary'].includes(p.id) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveProvider(p.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              aria-label={`Remove ${p.label}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-1">
                            Base URL
                          </label>
                          <input
                            type="text"
                            value={p.baseUrl}
                            onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                            disabled={p.kind === 'gemini' || p.kind === 'anthropic'}
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00F0FF]/50 disabled:opacity-60"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-slate-400">
                              Default Model ID
                            </label>
                          </div>
                          {p.kind === 'gemini' ? (
                            <select
                              value={p.defaultModel}
                              onChange={(e) => updateProvider(p.id, { defaultModel: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00F0FF]/50"
                            >
                              {GEMINI_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={p.defaultModel}
                              onChange={(e) => updateProvider(p.id, { defaultModel: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00F0FF]/50"
                            />
                          )}

                          {/* Quick Model Selection Pills */}
                          {suggestedModels.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              <span className="text-[9px] text-slate-500 font-mono">Models:</span>
                              {suggestedModels.map((m) => {
                                const isSelected = p.defaultModel === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => updateProvider(p.id, { defaultModel: m })}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border ${
                                      isSelected
                                        ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                                        : 'border-slate-800 bg-[#080C16] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                                    }`}
                                  >
                                    {m.replace(/^.*\//, '')}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-slate-400">
                              API Key {serverEnvAvailable ? `(Active: ${serverKeyName})` : ''}
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedKeys((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                              }
                              className="text-[11px] text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1"
                            >
                              {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              <span>{revealed ? 'Mask' : 'Reveal'}</span>
                            </button>
                          </div>
                          <input
                            type={revealed ? 'text' : 'password'}
                            value={p.apiKey}
                            onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                            placeholder={
                              serverEnvAvailable
                                ? `Using server environment (${serverKeyName})`
                                : p.baseUrl.includes('localhost')
                                  ? 'Not required for offline local engine'
                                  : 'Paste runtime API key...'
                            }
                            autoComplete="off"
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00F0FF]/50"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'routing' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fast / Voice Slot */}
                <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Fast / Voice & Quick Commands</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Used for hands-free voice turns, quick briefs, and low-latency interactions.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Provider</label>
                    <select
                      value={routing.fastProviderId}
                      onChange={(e) => {
                        const prov = providers.find((x) => x.id === e.target.value);
                        onChangeRouting({
                          ...routing,
                          fastProviderId: e.target.value,
                          fastModel: prov?.defaultModel || routing.fastModel,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Model ID</label>
                    <input
                      type="text"
                      value={routing.fastModel}
                      onChange={(e) => onChangeRouting({ ...routing, fastModel: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                    />
                    {(() => {
                      const fastProv = providers.find((x) => x.id === routing.fastProviderId);
                      const suggested = fastProv ? getSuggestedModels(fastProv) : [];
                      if (suggested.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className="text-[9px] text-slate-500 font-mono">Quick:</span>
                          {suggested.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => onChangeRouting({ ...routing, fastModel: m })}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border ${
                                routing.fastModel === m
                                  ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                                  : 'border-slate-800 bg-[#080C16] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {m.replace(/^.*\//, '')}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gemini Thinking Depth</label>
                    <select
                      value={routing.fastThinking}
                      onChange={(e) =>
                        onChangeRouting({ ...routing, fastThinking: e.target.value as ThinkingPreset })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                    >
                      <option value="LOW">LOW (Fastest)</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="AUTO">AUTO</option>
                    </select>
                  </div>
                </div>

                {/* Deep Reasoning Slot */}
                <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Deep Reasoning & Architecture</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Used for complex coding, architecture planning, and multi-document analysis.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Provider</label>
                    <select
                      value={routing.reasoningProviderId}
                      onChange={(e) => {
                        const prov = providers.find((x) => x.id === e.target.value);
                        onChangeRouting({
                          ...routing,
                          reasoningProviderId: e.target.value,
                          reasoningModel: prov?.defaultModel || routing.reasoningModel,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Model ID</label>
                    <input
                      type="text"
                      value={routing.reasoningModel}
                      onChange={(e) => onChangeRouting({ ...routing, reasoningModel: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                    />
                    {(() => {
                      const reasoningProv = providers.find((x) => x.id === routing.reasoningProviderId);
                      const suggested = reasoningProv ? getSuggestedModels(reasoningProv) : [];
                      if (suggested.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className="text-[9px] text-slate-500 font-mono">Quick:</span>
                          {suggested.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => onChangeRouting({ ...routing, reasoningModel: m })}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border ${
                                routing.reasoningModel === m
                                  ? 'border-cyan-400/50 bg-cyan-500/20 text-[#00F0FF]'
                                  : 'border-slate-800 bg-[#080C16] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {m.replace(/^.*\//, '')}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gemini Thinking Depth</label>
                    <select
                      value={routing.reasoningThinking}
                      onChange={(e) =>
                        onChangeRouting({ ...routing, reasoningThinking: e.target.value as ThinkingPreset })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                    >
                      <option value="HIGH">HIGH (Recommended)</option>
                      <option value="XHIGH">XHIGH (Max Depth · Neon/Hydrogen)</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                      <option value="AUTO">AUTO</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Fallback Priority Order */}
              <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Automatic Fallback Order</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      If the primary provider fails or hits a rate limit (429), requests cascade down this chain.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={routing.enableTools}
                      onChange={(e) => onChangeRouting({ ...routing, enableTools: e.target.checked })}
                      className="accent-[#00F0FF] w-4 h-4"
                    />
                    <span>Enable Structured Tool Calling</span>
                  </label>
                </div>

                <div className="divide-y divide-slate-800/70 border hud-hairline rounded-lg overflow-hidden">
                  {routing.fallbackOrder.map((fid, idx) => {
                    const prov = providers.find((p) => p.id === fid);
                    if (!prov) return null;
                    const ready = isProviderReady(prov, envKeys);
                    return (
                      <div
                        key={fid}
                        className="flex items-center justify-between px-3 py-2 bg-[#0A0F1A] text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-slate-500">0{idx + 1}.</span>
                          <span className="font-medium text-slate-200">{prov.label}</span>
                          <span className="font-mono text-slate-400">{prov.defaultModel}</span>
                          <span className={ready ? 'text-emerald-400' : 'text-slate-500'}>
                            {ready ? 'Active' : 'Standby'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveFallback(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFallback(idx, 1)}
                            disabled={idx === routing.fallbackOrder.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'webhooks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">
                  Configure external HTTPS REST endpoints that the AI agent can propose calling as structured tools (every call requires your explicit confirmation before firing).
                </p>
                <button
                  type="button"
                  onClick={handleAddCustomTool}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add REST Tool</span>
                </button>
              </div>

              {customTools.length === 0 ? (
                <div className="rounded-lg border hud-hairline bg-[#060912] p-6 text-center text-xs text-slate-400">
                  No custom REST tools configured yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {customTools.map((tool) => (
                    <div key={tool.id} className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={tool.enabled}
                            onChange={(e) => updateCustomTool(tool.id, { enabled: e.target.checked })}
                            className="accent-[#00F0FF] w-4 h-4"
                          />
                          <input
                            type="text"
                            value={tool.name}
                            onChange={(e) => updateCustomTool(tool.id, { name: e.target.value })}
                            className="bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-cyan-400/50 flex-1"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomTool(tool.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                          aria-label="Delete tool"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Method</label>
                          <select
                            value={tool.method}
                            onChange={(e) =>
                              updateCustomTool(tool.id, { method: e.target.value as 'GET' | 'POST' | 'PUT' })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-[11px] text-slate-400 mb-1">HTTPS Endpoint URL</label>
                          <input
                            type="url"
                            value={tool.url}
                            onChange={(e) => updateCustomTool(tool.id, { url: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Auth Header Name</label>
                          <input
                            type="text"
                            value={tool.authHeaderName}
                            onChange={(e) => updateCustomTool(tool.id, { authHeaderName: e.target.value })}
                            placeholder="Authorization"
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Auth Header Value</label>
                          <input
                            type="password"
                            value={tool.authHeaderValue}
                            onChange={(e) => updateCustomTool(tool.id, { authHeaderValue: e.target.value })}
                            placeholder="Bearer ..."
                            className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-200"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Agent Tool Description & JSON Schema Hint
                        </label>
                        <input
                          type="text"
                          value={tool.description}
                          onChange={(e) => updateCustomTool(tool.id, { description: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 mb-2"
                        />
                        <input
                          type="text"
                          value={tool.parametersJson}
                          onChange={(e) => updateCustomTool(tool.id, { parametersJson: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs font-mono text-slate-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200/90 space-y-1.5">
                <div className="font-semibold text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Local-Only Runtime Key Notice</span>
                </div>
                <p>
                  API keys entered in this matrix remain strictly inside your browser session (and optionally obfuscated in localStorage on this machine). They are never written to server files or included in standard workspace JSON exports.
                </p>
              </div>

              <div className="rounded-lg border hud-hairline bg-[#060912] p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">Persist Obfuscated Keys in Browser Storage</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    When disabled, runtime keys exist only in active RAM and vanish when you close this window.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={persistKeysLocally}
                  onChange={(e) => onChangePersistKeys(e.target.checked)}
                  className="accent-[#00F0FF] w-4 h-4"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClearStoredKeys}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge All Stored Browser Keys</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t hud-hairline bg-[#070B14] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#00F0FF] text-[#05070C] hover:bg-cyan-300 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
