import {
  ChatMessage,
  CustomWebhookTool,
  ProviderConfig,
  RoutingConfig,
  RoutingTaskSlot,
  ServerEnvStatus,
  ToolCallProposal,
} from '../types';

export interface RouteChatParams {
  slot: RoutingTaskSlot;
  personaSlot: 'fast' | 'reasoning';
  systemInstruction: string;
  messages: ChatMessage[];
  providers: ProviderConfig[];
  routing: RoutingConfig;
  customTools: CustomWebhookTool[];
  envKeys: ServerEnvStatus;
}

export interface RouteChatResponse {
  text: string;
  toolCalls: ToolCallProposal[];
  providerLabel: string;
  model: string;
  latencyMs: number;
  tokens: number;
  fallbackUsed: boolean;
  demoMode: boolean;
  attempts: Array<{
    providerLabel: string;
    model: string;
    latencyMs: number;
    ok: boolean;
    error?: string;
  }>;
}

export function isLocalHttpBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1')
    );
  } catch {
    return false;
  }
}

export function isProviderReady(provider: ProviderConfig, envKeys: ServerEnvStatus): boolean {
  if (!provider.enabled) return false;
  if (isLocalHttpBaseUrl(provider.baseUrl)) return true; // Local Ollama/LM Studio doesn't require an API key
  if (provider.apiKey.trim().length > 0) return true;
  if (provider.useServerEnv) {
    if (provider.kind === 'gemini' && envKeys.gemini) return true;
    if (provider.kind === 'anthropic' && envKeys.anthropic) return true;
    if (provider.kind === 'openai') {
      const b = provider.baseUrl.toLowerCase();
      if (b.includes('deepseek') && envKeys.deepseek) return true;
      if ((b.includes('moonshot') || b.includes('kimi')) && envKeys.moonshot) return true;
      if (b.includes('openrouter') && envKeys.openrouter) return true;
      if (b.includes('groq') && envKeys.groq) return true;
      if (envKeys.openai) return true;
    }
  }
  return false;
}

async function callLocalOpenAiEndpoint(
  provider: ProviderConfig,
  model: string,
  systemInstruction: string,
  messages: ChatMessage[],
) {
  const start = performance.now();
  const base = provider.baseUrl.replace(/\/+$/, '');
  const formatted = [
    ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  }

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: formatted,
    }),
  });

  const data = (await resp.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };

  if (!resp.ok) {
    throw new Error(data.error?.message || `Local endpoint HTTP ${resp.status}`);
  }

  return {
    text: data.choices?.[0]?.message?.content || '',
    toolCalls: [] as Array<{ id: string; name: string; args: Record<string, unknown> }>,
    tokens: data.usage?.total_tokens || 0,
    latencyMs: Math.round(performance.now() - start),
  };
}

export async function testProviderConnection(
  provider: ProviderConfig,
  modelOverride?: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  const model = modelOverride || provider.defaultModel;

  if (isLocalHttpBaseUrl(provider.baseUrl)) {
    try {
      const base = provider.baseUrl.replace(/\/+$/, '');
      const resp = await fetch(`${base}/models`);
      if (!resp.ok) {
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - start),
          error: `Local server returned HTTP ${resp.status}`,
        };
      }
      return { ok: true, latencyMs: Math.round(performance.now() - start) };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - start),
        error:
          err instanceof Error
            ? `${err.message} (Ensure Ollama/LM Studio is running with CORS enabled)`
            : 'Could not connect to localhost',
      };
    }
  }

  try {
    const resp = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerType: provider.kind,
        model,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      }),
    });
    const data = (await resp.json()) as { ok: boolean; latencyMs?: number; error?: string };
    return {
      ok: Boolean(data.ok),
      latencyMs: data.latencyMs ?? Math.round(performance.now() - start),
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function buildDemoModeResponse(userPrompt: string, attachmentsCount: number): RouteChatResponse {
  const lower = userPrompt.toLowerCase();
  const toolCalls: ToolCallProposal[] = [];
  let text = '';

  if (lower.includes('mission') || lower.includes('task') || lower.includes('remind')) {
    const cleanTitle = userPrompt.replace(/^(create|add|schedule)\s+(a\s+)?(mission|task|reminder)\s*:?\s*/i, '').trim() || 'Follow up on AETHER operational item';
    toolCalls.push({
      id: `demo_task_${Date.now()}`,
      name: 'create_mission',
      args: { title: cleanTitle.slice(0, 72), priority: 'P1', dueLabel: 'Today' },
      status: 'pending',
      requiresConfirmation: false,
    });
    text =
      'Local Demo Engine processed your request and queued the mission in your Mission Queue.\n\n*Tip: Connect an API key in **API & Model Matrix** for live Gemini 4 / Claude / OpenAI reasoning.*';
  } else if (lower.includes('note') || lower.includes('vault') || lower.includes('brief')) {
    toolCalls.push({
      id: `demo_note_${Date.now()}`,
      name: 'save_note',
      args: {
        title: 'Demo Operational Note',
        content: `Captured prompt:\n\n> ${userPrompt}\n\nReady for live LLM synthesis once an API key is active.`,
        tags: ['demo', 'brief'],
        pinned: true,
      },
      status: 'pending',
      requiresConfirmation: false,
    });
    text = 'Saved a structured card to your **Knowledge Vault** via Local Demo Engine.';
  } else if (lower.includes('calc') || lower.includes('compute') || lower.includes('sandbox') || lower.includes('js')) {
    toolCalls.push({
      id: `demo_js_${Date.now()}`,
      name: 'run_js_sandbox',
      args: {
        description: 'Sample client-side telemetry computation in isolated Web Worker',
        code: `const latencies = [142, 118, 165, 109, 134];\nconst avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;\nconsole.log('Sample latencies (ms):', latencies);\nconsole.log('Mean latency:', avg.toFixed(1) + ' ms');\nreturn { meanMs: Number(avg.toFixed(1)), p95Ms: 165 };`,
      },
      status: 'pending',
      requiresConfirmation: true,
    });
    text =
      'Prepared an isolated **JavaScript Sandbox** execution proposal below. Click **Approve & Run** to execute inside a secure Web Worker.';
  } else if (
    lower.includes('cortana') ||
    lower.includes('hal') ||
    (lower.includes('jarvis') && (lower.includes('style') || lower.includes('mode') || lower.includes('switch') || lower.includes('personality')))
  ) {
    const mode = lower.includes('cortana') ? 'cortana' : lower.includes('hal') ? 'hal' : 'jarvis';
    toolCalls.push({
      id: `demo_personality_${Date.now()}`,
      name: 'inject_personality',
      args: { mode },
      status: 'pending',
      requiresConfirmation: false,
    });
    text = `Personality Injector engaged: switching to **${mode === 'jarvis' ? 'Jarvis-style' : mode === 'cortana' ? 'Cortana-style' : 'HAL-style'}**.`;
  } else if (
    lower.includes('image') ||
    lower.includes('picture') ||
    lower.includes('photo') ||
    lower.includes('screenshot') ||
    lower.includes('analyze') ||
    attachmentsCount > 0
  ) {
    toolCalls.push({
      id: `demo_vision_${Date.now()}`,
      name: 'analyze_image',
      args: { focus: userPrompt || 'Describe visual contents in session context' },
      status: 'pending',
      requiresConfirmation: false,
    });
    text =
      'Running **`analyze_image`** on the attached image in your active session.';
  } else {
    text =
      `Running in **Local Demo Engine** (no live API key active for external providers${attachmentsCount > 0 ? `, received ${attachmentsCount} attachment(s)` : ''}).\n\n` +
      `Here is what you can test immediately:\n` +
      `- **Create a Mission**: Ask *"Create a P1 mission to benchmark Windows 11 Tauri startup"*\n` +
      `- **JS Sandbox**: Ask *"Run a JS sandbox computation"*\n` +
      `- **Live LLM**: Open **API & Model Matrix** to configure Gemini, OpenRouter, OpenAI, Claude, or local Ollama.\n\n` +
      `\`\`\`json\n{\n  "mode": "local_demo",\n  "promptPreview": ${JSON.stringify(userPrompt.slice(0, 80))},\n  "attachments": ${attachmentsCount},\n  "readyForLiveKeys": true\n}\n\`\`\``;
  }

  return {
    text,
    toolCalls,
    providerLabel: 'Local Demo Engine',
    model: 'offline-simulator',
    latencyMs: 18,
    tokens: 0,
    fallbackUsed: false,
    demoMode: true,
    attempts: [
      {
        providerLabel: 'Local Demo Engine',
        model: 'offline-simulator',
        latencyMs: 18,
        ok: true,
      },
    ],
  };
}

function normalizeToolProposal(raw: { id: string; name: string; args: Record<string, unknown> }): ToolCallProposal {
  const highImpact = raw.name === 'run_js_sandbox' || raw.name.startsWith('webhook_');
  return {
    id: raw.id,
    name: raw.name,
    args: raw.args,
    status: 'pending',
    requiresConfirmation: highImpact,
  };
}

export async function routeAgentChat(params: RouteChatParams): Promise<RouteChatResponse> {
  const { slot, personaSlot, systemInstruction, messages, providers, routing, customTools, envKeys } = params;

  const effectiveSlot = slot === 'auto' ? personaSlot : slot;
  const primaryProviderId = effectiveSlot === 'fast' ? routing.fastProviderId : routing.reasoningProviderId;
  const primaryModel = effectiveSlot === 'fast' ? routing.fastModel : routing.reasoningModel;
  const primaryThinking = effectiveSlot === 'fast' ? routing.fastThinking : routing.reasoningThinking;

  // Build ordered candidate chain: primary first, then fallbackOrder
  const orderedIds = Array.from(new Set([primaryProviderId, ...routing.fallbackOrder]));
  const candidates = orderedIds
    .map((id) => providers.find((p) => p.id === id))
    .filter((p): p is ProviderConfig => Boolean(p && isProviderReady(p, envKeys)));

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (candidates.length === 0) {
    return buildDemoModeResponse(lastUserMsg?.content || '', lastUserMsg?.attachments?.length || 0);
  }

  const attempts: RouteChatResponse['attempts'] = [];

  for (let idx = 0; idx < candidates.length; idx++) {
    const provider = candidates[idx];
    const isPrimary = idx === 0;
    const model = isPrimary ? primaryModel || provider.defaultModel : provider.defaultModel;
    const thinkingLevel = isPrimary ? primaryThinking : 'LOW';
    const attemptStart = performance.now();

    try {
      if (isLocalHttpBaseUrl(provider.baseUrl)) {
        const localRes = await callLocalOpenAiEndpoint(provider, model, systemInstruction, messages);
        attempts.push({
          providerLabel: provider.label,
          model,
          latencyMs: localRes.latencyMs,
          ok: true,
        });
        return {
          text: localRes.text,
          toolCalls: localRes.toolCalls.map(normalizeToolProposal),
          providerLabel: provider.label,
          model,
          latencyMs: localRes.latencyMs,
          tokens: localRes.tokens,
          fallbackUsed: !isPrimary,
          demoMode: false,
          attempts,
        };
      }

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: provider.kind,
          model,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          systemInstruction,
          thinkingLevel,
          enableTools: routing.enableTools,
          customTools: customTools.filter((t) => t.enabled),
          messages: messages.slice(-16).map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              kind: a.kind,
              dataUrl: a.dataUrl,
              textContent: a.textContent,
            })),
          })),
        }),
      });

      const data = (await resp.json()) as {
        ok: boolean;
        text?: string;
        toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
        usage?: { totalTokens?: number };
        latencyMs?: number;
        error?: string;
      };

      const latencyMs = data.latencyMs ?? Math.round(performance.now() - attemptStart);

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      attempts.push({
        providerLabel: provider.label,
        model,
        latencyMs,
        ok: true,
      });

      return {
        text: data.text || '',
        toolCalls: (data.toolCalls || []).map(normalizeToolProposal),
        providerLabel: provider.label,
        model,
        latencyMs,
        tokens: data.usage?.totalTokens || 0,
        fallbackUsed: !isPrimary,
        demoMode: false,
        attempts,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Request failed';
      attempts.push({
        providerLabel: provider.label,
        model,
        latencyMs: Math.round(performance.now() - attemptStart),
        ok: false,
        error: errMsg,
      });
    }
  }

  const errorsSummary = attempts.map((a) => `${a.providerLabel} (${a.model}): ${a.error}`).join('\n- ');
  throw new Error(`All configured providers in routing chain failed:\n- ${errorsSummary}`);
}

export interface AnalyzeImageParams {
  imageDataUrl: string;
  imageName: string;
  focus?: string;
  sessionContext?: string;
  providers: ProviderConfig[];
  routing: RoutingConfig;
  envKeys: ServerEnvStatus;
}

export interface AnalyzeImageResult {
  description: string;
  providerLabel: string;
  model: string;
  latencyMs: number;
  tokens: number;
  demoMode: boolean;
}

export async function analyzeSessionImage(params: AnalyzeImageParams): Promise<AnalyzeImageResult> {
  const { imageDataUrl, imageName, focus, sessionContext, providers, routing, envKeys } = params;

  const orderedIds = Array.from(
    new Set([routing.reasoningProviderId, routing.fastProviderId, ...routing.fallbackOrder]),
  );
  const candidates = orderedIds
    .map((id) => providers.find((p) => p.id === id))
    .filter((p): p is ProviderConfig => Boolean(p && isProviderReady(p, envKeys)));

  if (candidates.length === 0) {
    return {
      description:
        `Local Demo Vision Preview for "${imageName}". ` +
        `No live vision-capable API key is currently active. Add a Gemini, OpenAI, Anthropic, or local Ollama vision model in API Keys to run live multimodal image analysis${focus ? ` for "${focus}"` : ''}.`,
      providerLabel: 'Local Demo Engine',
      model: 'offline-vision-preview',
      latencyMs: 14,
      tokens: 0,
      demoMode: true,
    };
  }

  let lastError = 'No vision-capable provider succeeded.';

  for (let idx = 0; idx < candidates.length; idx++) {
    const provider = candidates[idx];
    const model =
      idx === 0 && provider.id === routing.reasoningProviderId
        ? routing.reasoningModel || provider.defaultModel
        : provider.defaultModel;
    const start = performance.now();

    try {
      if (isLocalHttpBaseUrl(provider.baseUrl)) {
        const base = provider.baseUrl.replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (provider.apiKey.trim()) {
          headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
        }
        const prompt = [
          `Describe and analyze this attached image (${imageName}) in the context of the active session.`,
          focus ? `Focus: ${focus}` : '',
          sessionContext ? `Session context:\n${sessionContext}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        const resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                ],
              },
            ],
          }),
        });
        const data = (await resp.json()) as {
          error?: { message?: string };
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        if (!resp.ok) {
          throw new Error(data.error?.message || `Local vision HTTP ${resp.status}`);
        }
        return {
          description: (data.choices?.[0]?.message?.content || '').trim(),
          providerLabel: provider.label,
          model,
          latencyMs: Math.round(performance.now() - start),
          tokens: data.usage?.total_tokens || 0,
          demoMode: false,
        };
      }

      const resp = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: provider.kind,
          model,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          imageDataUrl,
          imageName,
          focus,
          sessionContext,
        }),
      });
      const data = (await resp.json()) as {
        ok: boolean;
        description?: string;
        model?: string;
        latencyMs?: number;
        tokens?: number;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      return {
        description: data.description || 'No visual description returned.',
        providerLabel: provider.label,
        model: data.model || model,
        latencyMs: data.latencyMs ?? Math.round(performance.now() - start),
        tokens: data.tokens || 0,
        demoMode: false,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Vision request failed';
    }
  }

  throw new Error(lastError);
}

