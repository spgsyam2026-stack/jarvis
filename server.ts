import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const REQUEST_TIMEOUT_MS = 45000;

interface CustomToolSchema {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  parametersJson?: string;
}

interface ChatAttachment {
  name: string;
  mimeType: string;
  dataUrl?: string;
  textContent?: string;
  kind: 'image' | 'code' | 'document' | 'audio';
}

interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
}

type SupportedEnvKey =
  | 'GEMINI_API_KEY'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'MOONSHOT_API_KEY'
  | 'OPENROUTER_API_KEY'
  | 'GROQ_API_KEY';

function getEnvKey(name: SupportedEnvKey): string {
  const val = (process.env[name] || '').trim();
  if (!val || val.startsWith('MY_')) return '';
  return val;
}

function resolveOpenAiCompatibleKey(baseUrl: string, clientKey?: string): string {
  const custom = (clientKey || '').trim();
  if (custom) return custom;
  const base = baseUrl.toLowerCase();
  if (base.includes('deepseek')) {
    return getEnvKey('DEEPSEEK_API_KEY') || getEnvKey('OPENAI_API_KEY');
  }
  if (base.includes('moonshot') || base.includes('kimi')) {
    return getEnvKey('MOONSHOT_API_KEY') || getEnvKey('OPENAI_API_KEY');
  }
  if (base.includes('openrouter')) {
    return getEnvKey('OPENROUTER_API_KEY') || getEnvKey('OPENAI_API_KEY');
  }
  if (base.includes('groq')) {
    return getEnvKey('GROQ_API_KEY') || getEnvKey('OPENAI_API_KEY');
  }
  return getEnvKey('OPENAI_API_KEY');
}

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'metadata.google.internal' ||
    host === 'metadata' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv4 private / loopback / link-local ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // IPv6 unique local / link-local
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return true;
  }

  return false;
}

function validateExternalHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Server proxy only permits HTTPS external URLs. Local HTTP endpoints (such as localhost Ollama) run directly from the client.');
  }

  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    throw new Error('Blocked private, loopback, or metadata network host.');
  }

  return parsed;
}

function createGeminiClient(runtimeApiKey?: string): GoogleGenAI {
  const key = (runtimeApiKey || '').trim() || getEnvKey('GEMINI_API_KEY');
  if (!key) {
    throw new Error('No Gemini API key configured.');
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveThinkingLevel(model: string, level?: string): ThinkingLevel | undefined {
  const normalized = (level || '').toUpperCase();
  if (!normalized || normalized === 'AUTO') return undefined;

  const isGemini4 = model.startsWith('gemini-4-');
  if (!isGemini4) {
    return undefined;
  }

  if (normalized === 'XHIGH') {
    if (model === 'gemini-4-neon' || model === 'gemini-4-hydrogen') {
      return ThinkingLevel.XHIGH;
    }
    return ThinkingLevel.HIGH;
  }
  if (normalized === 'HIGH') return ThinkingLevel.HIGH;
  if (normalized === 'MEDIUM') return ThinkingLevel.MEDIUM;
  if (normalized === 'LOW') return ThinkingLevel.LOW;
  return undefined;
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'custom_tool';
}

function buildBuiltinGeminiTools(customTools: CustomToolSchema[] = []) {
  const declarations: Array<Record<string, unknown>> = [
    {
      name: 'create_mission',
      description: 'Create a prioritized task or reminder in the user Mission Queue.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Short actionable title of the mission/task.' },
          priority: { type: Type.STRING, description: 'Priority level: P1, P2, or P3.' },
          dueLabel: { type: Type.STRING, description: 'Optional due time or schedule string (e.g., Today 17:00).' },
          notes: { type: Type.STRING, description: 'Optional concise context for the mission.' },
        },
        required: ['title'],
      },
    },
    {
      name: 'complete_mission',
      description: 'Mark an existing task or mission in the queue as completed.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          titleQuery: { type: Type.STRING, description: 'Title or substring matching the mission to complete.' },
        },
        required: ['titleQuery'],
      },
    },
    {
      name: 'save_note',
      description: 'Save a markdown note or reference card to the Knowledge Vault.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Note heading.' },
          content: { type: Type.STRING, description: 'Markdown body of the note.' },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Optional topic keywords.',
          },
          pinned: { type: Type.BOOLEAN, description: 'Whether to pin the note at the top of the vault.' },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'run_js_sandbox',
      description: 'Execute safe client-side JavaScript computation or data transformation (requires user confirmation).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'What this script computes or verifies.' },
          code: { type: Type.STRING, description: 'Self-contained JavaScript code using console.log or return.' },
        },
        required: ['description', 'code'],
      },
    },
    {
      name: 'analyze_image',
      description: 'Analyze and describe an attached image from the user active session using a vision-capable model.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          imageName: {
            type: Type.STRING,
            description: 'Optional filename of the attached image to inspect (defaults to latest attached image).',
          },
          focus: {
            type: Type.STRING,
            description: 'Specific question, aspect, OCR, UI issue, or detail to analyze in the image.',
          },
        },
      },
    },
    {
      name: 'inject_personality',
      description: 'Switch the AI personality injector mode and Humanoid visual theme between Jarvis-style (dry, professional), Cortana-style (empathetic, personal), or HAL-style (logical, detached).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mode: {
            type: Type.STRING,
            description: 'Target personality mode: jarvis, cortana, or hal.',
          },
        },
        required: ['mode'],
      },
    },
  ];

  for (const ct of customTools) {
    declarations.push({
      name: `webhook_${sanitizeToolName(ct.id)}`,
      description: `${ct.name}: ${ct.description} (Method: ${ct.method})`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          payloadJson: {
            type: Type.STRING,
            description: 'JSON string payload or query parameters matching the endpoint schema.',
          },
        },
      },
    });
  }

  return declarations;
}

interface OpenAiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function buildOpenAiTools(customTools: CustomToolSchema[] = []): OpenAiToolDef[] {
  const builtin: OpenAiToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'create_mission',
        description: 'Create a prioritized task or reminder in the user Mission Queue.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short actionable title.' },
            priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
            dueLabel: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'complete_mission',
        description: 'Mark an existing mission as completed.',
        parameters: {
          type: 'object',
          properties: {
            titleQuery: { type: 'string' },
          },
          required: ['titleQuery'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_note',
        description: 'Save a markdown note to the Knowledge Vault.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            pinned: { type: 'boolean' },
          },
          required: ['title', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_js_sandbox',
        description: 'Propose safe client-side JavaScript code execution for user confirmation.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            code: { type: 'string' },
          },
          required: ['description', 'code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'analyze_image',
        description: 'Analyze and describe an attached image from the user active session using a vision-capable model.',
        parameters: {
          type: 'object',
          properties: {
            imageName: {
              type: 'string',
              description: 'Optional filename of the attached image (defaults to latest image).',
            },
            focus: {
              type: 'string',
              description: 'Specific question or detail to analyze in the image.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'inject_personality',
        description: 'Switch the AI personality injector mode and Humanoid visual theme between jarvis, cortana, or hal.',
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['jarvis', 'cortana', 'hal'],
            },
          },
          required: ['mode'],
        },
      },
    },
  ];

  for (const ct of customTools) {
    builtin.push({
      type: 'function',
      function: {
        name: `webhook_${sanitizeToolName(ct.id)}`,
        description: `${ct.name}: ${ct.description}`,
        parameters: {
          type: 'object',
          properties: {
            payloadJson: { type: 'string', description: 'JSON payload for the custom endpoint.' },
          },
          required: [],
        },
      },
    });
  }

  return builtin;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      envKeys: {
        gemini: Boolean(getEnvKey('GEMINI_API_KEY')),
        openai: Boolean(getEnvKey('OPENAI_API_KEY')),
        anthropic: Boolean(getEnvKey('ANTHROPIC_API_KEY')),
        deepseek: Boolean(getEnvKey('DEEPSEEK_API_KEY')),
        moonshot: Boolean(getEnvKey('MOONSHOT_API_KEY')),
        openrouter: Boolean(getEnvKey('OPENROUTER_API_KEY')),
        groq: Boolean(getEnvKey('GROQ_API_KEY')),
      },
    });
  });

  app.post('/api/ai/test', async (req: Request, res: Response) => {
    const start = Date.now();
    const { providerType, model, baseUrl, apiKey } = req.body as {
      providerType: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
    };

    try {
      if (providerType === 'gemini') {
        const ai = createGeminiClient(apiKey);
        const testModel = model || 'gemini-4-hydrogen';
        const thinkingLevel = resolveThinkingLevel(testModel, 'LOW');
        const response = await ai.models.generateContent({
          model: testModel,
          contents: 'Respond with OK.',
          config: thinkingLevel ? { thinkingConfig: { thinkingLevel } } : undefined,
        });
        return res.json({
          ok: true,
          latencyMs: Date.now() - start,
          model: testModel,
          preview: (response.text || 'OK').slice(0, 60),
        });
      }

      if (providerType === 'openai') {
        const targetBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        validateExternalHttpsUrl(targetBase);
        const resolvedKey = resolveOpenAiCompatibleKey(targetBase, apiKey);
        if (!resolvedKey) {
          return res.status(400).json({
            ok: false,
            error: `Missing API key for ${targetBase}. Please provide an API key or configure DEEPSEEK_API_KEY / MOONSHOT_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY in environment variables.`,
          });
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolvedKey}`,
        };
        if (targetBase.includes('openrouter.ai')) {
          headers['HTTP-Referer'] = 'https://aether-os.local';
          headers['X-Title'] = 'AETHER OS';
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch(`${targetBase}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: model || 'gpt-4o-mini',
              messages: [{ role: 'user', content: 'Respond with OK.' }],
              max_tokens: 8,
            }),
            signal: controller.signal,
          });
          const data = (await resp.json()) as Record<string, unknown>;
          if (!resp.ok) {
            let errMsg =
              (data?.error as { message?: string } | undefined)?.message ||
              `Provider responded with HTTP ${resp.status}`;
            if (errMsg.toLowerCase().includes('user not found')) {
              errMsg =
                'OpenRouter reported "User not found". Please check or generate a fresh key at https://openrouter.ai/settings/keys.';
            }
            return res.status(resp.status).json({ ok: false, error: errMsg, latencyMs: Date.now() - start });
          }
          return res.json({
            ok: true,
            latencyMs: Date.now() - start,
            model: model || 'gpt-4o-mini',
            preview: 'Connection verified',
          });
        } finally {
          clearTimeout(timer);
        }
      }

      if (providerType === 'anthropic') {
        const resolvedKey = (apiKey || '').trim() || getEnvKey('ANTHROPIC_API_KEY');
        if (!resolvedKey) {
          return res.status(400).json({ ok: false, error: 'Missing Anthropic API key.' });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': resolvedKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: model || 'claude-3-7-sonnet-latest',
              max_tokens: 16,
              messages: [{ role: 'user', content: 'Respond with OK.' }],
            }),
            signal: controller.signal,
          });
          const data = (await resp.json()) as Record<string, unknown>;
          if (!resp.ok) {
            const errMsg =
              (data?.error as { message?: string } | undefined)?.message ||
              `Anthropic responded with HTTP ${resp.status}`;
            return res.status(resp.status).json({ ok: false, error: errMsg, latencyMs: Date.now() - start });
          }
          return res.json({
            ok: true,
            latencyMs: Date.now() - start,
            model: model || 'claude-3-7-sonnet-latest',
            preview: 'Connection verified',
          });
        } finally {
          clearTimeout(timer);
        }
      }

      return res.status(400).json({ ok: false, error: `Unsupported provider type: ${providerType}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed.';
      return res.status(500).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const start = Date.now();
    const {
      providerType,
      model,
      baseUrl,
      apiKey,
      systemInstruction,
      messages,
      thinkingLevel,
      enableTools,
      customTools,
    } = req.body as {
      providerType: string;
      model: string;
      baseUrl?: string;
      apiKey?: string;
      systemInstruction?: string;
      messages: ChatMessageInput[];
      thinkingLevel?: string;
      enableTools?: boolean;
      customTools?: CustomToolSchema[];
    };

    try {
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ ok: false, error: 'Messages array is required.' });
      }

      if (providerType === 'gemini') {
        const ai = createGeminiClient(apiKey);
        const resolvedModel = model || 'gemini-4-hydrogen';
        const resolvedThinking = resolveThinkingLevel(resolvedModel, thinkingLevel);

        const contents = messages
          .filter((m) => m.role !== 'system')
          .map((m) => {
            const parts: Array<Record<string, unknown>> = [];
            if (m.attachments && m.attachments.length > 0) {
              for (const att of m.attachments) {
                if ((att.kind === 'image' || att.kind === 'audio') && att.dataUrl) {
                  const base64Match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (base64Match) {
                    parts.push({
                      inlineData: {
                        mimeType: base64Match[1],
                        data: base64Match[2],
                      },
                    });
                  }
                } else if (att.textContent) {
                  parts.push({
                    text: `[Attached File: ${att.name}]\n\`\`\`\n${att.textContent.slice(0, 24000)}\n\`\`\``,
                  });
                }
              }
            }
            if (m.content) {
              parts.push({ text: m.content });
            }
            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts,
            };
          });

        const config: Record<string, unknown> = {};
        if (systemInstruction) {
          config.systemInstruction = systemInstruction;
        }
        if (resolvedThinking) {
          config.thinkingConfig = { thinkingLevel: resolvedThinking };
        }
        if (enableTools) {
          config.tools = [{ functionDeclarations: buildBuiltinGeminiTools(customTools || []) }];
        }

        const response = await ai.models.generateContent({
          model: resolvedModel,
          contents,
          config,
        });

        const toolCalls = (response.functionCalls || []).map((fc, idx) => ({
          id: fc.id || `call_${Date.now()}_${idx}`,
          name: fc.name || 'unknown_tool',
          args: (fc.args || {}) as Record<string, unknown>,
        }));

        const usage = response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount || 0,
              outputTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            }
          : undefined;

        return res.json({
          ok: true,
          text: response.text || '',
          toolCalls,
          usage,
          latencyMs: Date.now() - start,
          model: resolvedModel,
          providerType: 'gemini',
        });
      }

      if (providerType === 'openai') {
        const targetBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        validateExternalHttpsUrl(targetBase);
        const resolvedKey = resolveOpenAiCompatibleKey(targetBase, apiKey);
        if (!resolvedKey) {
          return res.status(400).json({
            ok: false,
            error: `Missing API key for ${targetBase}. Please provide an API key or configure DEEPSEEK_API_KEY / MOONSHOT_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY in environment variables.`,
          });
        }

        const formattedMessages: Array<Record<string, unknown>> = [];
        if (systemInstruction) {
          formattedMessages.push({ role: 'system', content: systemInstruction });
        }
        for (const m of messages) {
          if (m.role === 'system') continue;
          const contentParts: Array<Record<string, unknown>> = [];
          let textAccum = m.content || '';
          if (m.attachments) {
            for (const att of m.attachments) {
              if (att.kind === 'image' && att.dataUrl) {
                contentParts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
              } else if (att.textContent) {
                textAccum += `\n\n[Attached File: ${att.name}]\n\`\`\`\n${att.textContent.slice(0, 20000)}\n\`\`\``;
              }
            }
          }
          if (contentParts.length > 0) {
            contentParts.unshift({ type: 'text', text: textAccum });
            formattedMessages.push({ role: m.role, content: contentParts });
          } else {
            formattedMessages.push({ role: m.role, content: textAccum });
          }
        }

        const payload: Record<string, unknown> = {
          model: model || 'gpt-4o-mini',
          messages: formattedMessages,
        };
        if (enableTools) {
          payload.tools = buildOpenAiTools(customTools || []);
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolvedKey}`,
        };
        if (targetBase.includes('openrouter.ai')) {
          headers['HTTP-Referer'] = 'https://aether-os.local';
          headers['X-Title'] = 'AETHER OS';
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch(`${targetBase}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const data = (await resp.json()) as {
            error?: { message?: string };
            choices?: Array<{
              message?: {
                content?: string;
                tool_calls?: Array<{
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          if (!resp.ok) {
            let errMsg = data.error?.message || `OpenAI-compatible error (${resp.status})`;
            if (errMsg.toLowerCase().includes('user not found')) {
              errMsg =
                'OpenRouter reported "User not found". Please check or generate a fresh key at https://openrouter.ai/settings/keys.';
            }
            return res.status(resp.status).json({
              ok: false,
              error: errMsg,
              latencyMs: Date.now() - start,
            });
          }

          const choice = data.choices?.[0]?.message;
          const toolCalls = (choice?.tool_calls || []).map((tc, idx) => {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              parsedArgs = {};
            }
            return {
              id: tc.id || `oai_${Date.now()}_${idx}`,
              name: tc.function?.name || 'unknown_tool',
              args: parsedArgs,
            };
          });

          return res.json({
            ok: true,
            text: choice?.content || '',
            toolCalls,
            usage: data.usage
              ? {
                  inputTokens: data.usage.prompt_tokens || 0,
                  outputTokens: data.usage.completion_tokens || 0,
                  totalTokens: data.usage.total_tokens || 0,
                }
              : undefined,
            latencyMs: Date.now() - start,
            model: model || 'gpt-4o-mini',
            providerType: 'openai',
          });
        } finally {
          clearTimeout(timer);
        }
      }

      if (providerType === 'anthropic') {
        const resolvedKey = (apiKey || '').trim() || getEnvKey('ANTHROPIC_API_KEY');
        if (!resolvedKey) {
          return res.status(400).json({ ok: false, error: 'Missing Anthropic API key.' });
        }

        const formattedMessages = messages
          .filter((m) => m.role !== 'system')
          .map((m) => {
            const blocks: Array<Record<string, unknown>> = [];
            let textAccum = m.content || '';
            if (m.attachments) {
              for (const att of m.attachments) {
                if (att.kind === 'image' && att.dataUrl) {
                  const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    blocks.push({
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: match[1],
                        data: match[2],
                      },
                    });
                  }
                } else if (att.textContent) {
                  textAccum += `\n\n[Attached File: ${att.name}]\n\`\`\`\n${att.textContent.slice(0, 20000)}\n\`\`\``;
                }
              }
            }
            blocks.push({ type: 'text', text: textAccum });
            return {
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: blocks,
            };
          });

        const payload: Record<string, unknown> = {
          model: model || 'claude-3-7-sonnet-latest',
          max_tokens: 4096,
          messages: formattedMessages,
        };
        if (systemInstruction) {
          payload.system = systemInstruction;
        }
        if (enableTools) {
          payload.tools = buildOpenAiTools(customTools || []).map((t) => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters,
          }));
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': resolvedKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const data = (await resp.json()) as {
            error?: { message?: string };
            content?: Array<{
              type: string;
              text?: string;
              id?: string;
              name?: string;
              input?: Record<string, unknown>;
            }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (!resp.ok) {
            return res.status(resp.status).json({
              ok: false,
              error: data.error?.message || `Anthropic API error (${resp.status})`,
              latencyMs: Date.now() - start,
            });
          }

          const textParts = (data.content || [])
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text)
            .join('\n');

          const toolCalls = (data.content || [])
            .filter((b) => b.type === 'tool_use')
            .map((b, idx) => ({
              id: b.id || `claude_${Date.now()}_${idx}`,
              name: b.name || 'unknown_tool',
              args: b.input || {},
            }));

          return res.json({
            ok: true,
            text: textParts,
            toolCalls,
            usage: data.usage
              ? {
                  inputTokens: data.usage.input_tokens || 0,
                  outputTokens: data.usage.output_tokens || 0,
                  totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
                }
              : undefined,
            latencyMs: Date.now() - start,
            model: model || 'claude-3-7-sonnet-latest',
            providerType: 'anthropic',
          });
        } finally {
          clearTimeout(timer);
        }
      }

      return res.status(400).json({ ok: false, error: `Unsupported provider: ${providerType}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat execution failed.';
      return res.status(500).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    const start = Date.now();
    const { mimeType, base64Data, apiKey } = req.body as {
      mimeType: string;
      base64Data: string;
      apiKey?: string;
    };

    try {
      if (!base64Data) {
        return res.status(400).json({ ok: false, error: 'Audio data is required.' });
      }
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: base64Data,
              },
            },
            { text: 'Transcribe this audio accurately. Return only the spoken text.' },
          ],
        },
      });
      return res.json({
        ok: true,
        transcript: (response.text || '').trim(),
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Audio transcription failed.';
      return res.status(500).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  app.post('/api/ai/daily-insight', async (req: Request, res: Response) => {
    const start = Date.now();
    const { kind, apiKey, dateLabel } = (req.body || {}) as {
      kind?: 'auto' | 'tech-news' | 'quote';
      apiKey?: string;
      dateLabel?: string;
    };

    const resolvedKey = (apiKey || '').trim() || getEnvKey('GEMINI_API_KEY');
    if (!resolvedKey) {
      return res.status(400).json({
        ok: false,
        missingKey: true,
        error: 'No Gemini API key configured. Add a Gemini key in API Keys to enable Search-grounded Daily Insights.',
        latencyMs: Date.now() - start,
      });
    }

    const resolvedKind: 'tech-news' | 'quote' =
      kind === 'quote' ? 'quote' : 'tech-news';
    const todayStr = (dateLabel || new Date().toISOString().slice(0, 10)).slice(0, 32);

    const prompt =
      resolvedKind === 'quote'
        ? `Use Google Search to find and verify one inspiring, authentic quote by a notable scientist, computer scientist, engineer, architect, or philosopher about craftsmanship, systems thinking, or discovery. Avoid clichés. Respond strictly using these 3 labeled lines with plain text only (no markdown formatting or code fences):\nHEADLINE: <Author Name — Role or Context>\nSNIPPET: "<Verified quote text>"\nTOPIC: <1-2 word theme>`
        : `Use Google Search to find one notable technology, AI, software engineering, or developer tooling news highlight from around ${todayStr}. Respond strictly using these 3 labeled lines with plain text only (no markdown formatting or code fences):\nHEADLINE: <Concise 6-12 word headline>\nSNIPPET: <1-2 crisp, informative sentences summarizing the core development and why it matters>\nTOPIC: <1-2 word category such as AI Systems, Cloud, Security, Hardware, DevTools>`;

    try {
      const ai = createGeminiClient(resolvedKey);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text || '').replace(/```[\s\S]*?```/g, '').trim();
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let headline = '';
      let snippet = '';
      let topic = resolvedKind === 'quote' ? 'Wisdom' : 'Tech Brief';

      for (const line of lines) {
        const cleanLine = line.replace(/^\*\*|\*\*$/g, '').trim();
        if (/^HEADLINE\s*:/i.test(cleanLine)) {
          headline = cleanLine.replace(/^HEADLINE\s*:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
        } else if (/^SNIPPET\s*:/i.test(cleanLine)) {
          snippet = cleanLine.replace(/^SNIPPET\s*:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
        } else if (/^TOPIC\s*:/i.test(cleanLine)) {
          topic = cleanLine.replace(/^TOPIC\s*:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
        }
      }

      if (!headline && lines.length > 0) {
        headline = lines[0].slice(0, 120);
      }
      if (!snippet) {
        const bodyLines = lines.slice(1).join(' ').trim();
        snippet = bodyLines || rawText || 'No summary returned by search grounding.';
      }

      const groundingMeta = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMeta?.groundingChunks || [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];

      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (uri && /^https?:\/\//i.test(uri) && !seenUris.has(uri)) {
          seenUris.add(uri);
          let fallbackHost = uri;
          try {
            fallbackHost = new URL(uri).hostname.replace(/^www\./, '');
          } catch {
            // keep uri
          }
          sources.push({
            title: (title || fallbackHost).slice(0, 80),
            uri,
          });
          if (sources.length >= 3) break;
        }
      }

      return res.json({
        ok: true,
        kind: resolvedKind,
        headline,
        snippet,
        topic,
        sources,
        searchQueries: (groundingMeta?.webSearchQueries || []).slice(0, 3),
        fetchedAt: Date.now(),
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Daily insight search failed.';
      return res.status(500).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  app.post('/api/ai/vision', async (req: Request, res: Response) => {
    const start = Date.now();
    const {
      providerType,
      model,
      baseUrl,
      apiKey,
      imageDataUrl,
      imageName,
      focus,
      sessionContext,
    } = req.body as {
      providerType: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      imageDataUrl: string;
      imageName?: string;
      focus?: string;
      sessionContext?: string;
    };

    try {
      if (!imageDataUrl) {
        return res.status(400).json({ ok: false, error: 'Image data URL is required.' });
      }
      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ ok: false, error: 'Invalid base64 image data URL.' });
      }
      const [, mimeType, base64Data] = match;

      const analysisPrompt = [
        'Analyze this attached image for the user in the context of their active session.',
        imageName ? `Filename: ${imageName}` : '',
        focus ? `Focus / Question: ${focus}` : 'Provide a clear, structured description of all salient visual details, text/OCR, and actionable observations.',
        sessionContext ? `Active Session Context:\n${sessionContext}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      if (providerType === 'gemini') {
        const ai = createGeminiClient(apiKey);
        const resolvedModel = model || 'gemini-4-hydrogen';
        const response = await ai.models.generateContent({
          model: resolvedModel,
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: analysisPrompt },
            ],
          },
        });
        return res.json({
          ok: true,
          description: (response.text || '').trim(),
          model: resolvedModel,
          latencyMs: Date.now() - start,
          tokens: response.usageMetadata?.totalTokenCount || 0,
        });
      }

      if (providerType === 'openai') {
        const targetBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        validateExternalHttpsUrl(targetBase);
        const resolvedKey = resolveOpenAiCompatibleKey(targetBase, apiKey);
        if (!resolvedKey) {
          return res.status(400).json({
            ok: false,
            error: `Missing API key for ${targetBase}. Please provide an API key or configure DEEPSEEK_API_KEY / MOONSHOT_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY in environment variables.`,
          });
        }

        const resolvedModel = model || 'gpt-4o-mini';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolvedKey}`,
        };
        if (targetBase.includes('openrouter.ai')) {
          headers['HTTP-Referer'] = 'https://aether-os.local';
          headers['X-Title'] = 'AETHER OS';
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch(`${targetBase}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: analysisPrompt },
                    { type: 'image_url', image_url: { url: imageDataUrl } },
                  ],
                },
              ],
            }),
            signal: controller.signal,
          });
          const data = (await resp.json()) as {
            error?: { message?: string };
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };
          if (!resp.ok) {
            return res.status(resp.status).json({
              ok: false,
              error: data.error?.message || `Vision provider error (${resp.status})`,
              latencyMs: Date.now() - start,
            });
          }
          return res.json({
            ok: true,
            description: (data.choices?.[0]?.message?.content || '').trim(),
            model: resolvedModel,
            latencyMs: Date.now() - start,
            tokens: data.usage?.total_tokens || 0,
          });
        } finally {
          clearTimeout(timer);
        }
      }

      if (providerType === 'anthropic') {
        const resolvedKey = (apiKey || '').trim() || getEnvKey('ANTHROPIC_API_KEY');
        if (!resolvedKey) {
          return res.status(400).json({ ok: false, error: 'Missing Anthropic API key.' });
        }
        const resolvedModel = model || 'claude-3-7-sonnet-latest';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': resolvedKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: resolvedModel,
              max_tokens: 1500,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: mimeType,
                        data: base64Data,
                      },
                    },
                    { type: 'text', text: analysisPrompt },
                  ],
                },
              ],
            }),
            signal: controller.signal,
          });
          const data = (await resp.json()) as {
            error?: { message?: string };
            content?: Array<{ type: string; text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (!resp.ok) {
            return res.status(resp.status).json({
              ok: false,
              error: data.error?.message || `Anthropic vision error (${resp.status})`,
              latencyMs: Date.now() - start,
            });
          }
          const description = (data.content || [])
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text)
            .join('\n')
            .trim();
          return res.json({
            ok: true,
            description,
            model: resolvedModel,
            latencyMs: Date.now() - start,
            tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          });
        } finally {
          clearTimeout(timer);
        }
      }

      return res.status(400).json({ ok: false, error: `Unsupported vision provider: ${providerType}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image analysis failed.';
      return res.status(500).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  app.post('/api/tools/webhook', async (req: Request, res: Response) => {
    const start = Date.now();
    const { url, method, authHeaderName, authHeaderValue, payloadJson } = req.body as {
      url: string;
      method: 'GET' | 'POST' | 'PUT';
      authHeaderName?: string;
      authHeaderValue?: string;
      payloadJson?: string;
    };

    try {
      const validated = validateExternalHttpsUrl(url);
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain',
      };
      if (authHeaderName && authHeaderValue) {
        headers[authHeaderName.trim()] = authHeaderValue.trim();
      }

      const fetchInit: RequestInit = {
        method: method || 'GET',
        headers,
      };

      if (method !== 'GET' && payloadJson) {
        headers['Content-Type'] = 'application/json';
        fetchInit.body = typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        fetchInit.signal = controller.signal;
        const resp = await fetch(validated.toString(), fetchInit);
        const text = await resp.text();
        return res.json({
          ok: resp.ok,
          status: resp.status,
          latencyMs: Date.now() - start,
          body: text.slice(0, 12000),
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook call failed.';
      return res.status(400).json({ ok: false, error: message, latencyMs: Date.now() - start });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AETHER // OS server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AETHER // OS server:', err);
  process.exit(1);
});
