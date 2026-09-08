import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, McpTool, ToolCaller } from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const candidate = typeof value === 'string' ? value : env.DEFAULT_CHAT_PROVIDER;
  return candidate === 'openai' || candidate === 'openai-compat' ? candidate : 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') return env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  return env.OPENAI_COMPAT_MODEL?.trim() || 'gpt-4o-mini';
}

export function getChatConfig(env: Env): {
  defaultProvider: ChatProvider;
  providers: Record<ChatProvider, { defaultModel: string; models: string[] }>;
} {
  const defaultProvider = resolveProvider(undefined, env);
  const fallbackModels: Record<ChatProvider, string[]> = {
    gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    'openai-compat': ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'claude-3-5-sonnet', 'llama-3.1-8b-instruct']
  };

  const providers = {
    gemini: {
      defaultModel: defaultModelFor('gemini', env),
      models: Array.from(new Set([...fallbackModels.gemini, defaultModelFor('gemini', env)])),
    },
    openai: {
      defaultModel: defaultModelFor('openai', env),
      models: Array.from(new Set([...fallbackModels.openai, defaultModelFor('openai', env)])),
    },
    'openai-compat': {
      defaultModel: defaultModelFor('openai-compat', env),
      models: Array.from(new Set([...fallbackModels['openai-compat'], defaultModelFor('openai-compat', env)])),
    }
  } satisfies Record<ChatProvider, { defaultModel: string; models: string[] }>;

  return { defaultProvider, providers };
}

export function buildSystemPrompt(hasTools: boolean): string {
  return `คุณคือผู้ช่วย AI ของระบบ AI Desk ตอบเป็นภาษาไทยอย่างสุภาพและกระชับ${hasTools ? ' หากมีเครื่องมือ ให้ใช้เมื่อจำเป็นและอธิบายผลลัพธ์ให้ผู้ใช้เข้าใจ' : ''}`;
}

export function resolveApiKey(env: Env, provider: ChatProvider): string {
  return provider === 'gemini' ? env.GEMINI_API_KEY || '' : provider === 'openai' ? env.OPENAI_API_KEY || '' : env.OPENAI_COMPAT_API_KEY || '';
}

export function resolveBaseUrl(env: Env, provider: ChatProvider): string {
  return provider === 'openai' ? OPENAI_BASE_URL : provider === 'openai-compat' ? env.OPENAI_COMPAT_BASE_URL || '' : '';
}

export async function resolveTools(_env: Env): Promise<{ tools: McpTool[]; callTool?: ToolCaller }> {
  return { tools: [] };
}

async function runProvider(provider: ChatProvider, params: { history: ChatMessage[]; tools: McpTool[]; apiKey: string; baseUrl: string; model: string; systemPrompt: string; callTool?: ToolCaller }) {
  return provider === 'gemini'
    ? runGeminiConversation(params)
    : runOpenAiCompatConversation(params);
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('เส้นทางนี้รองรับเฉพาะ POST', 405);
  let body: unknown;
  try { body = await request.json(); } catch { return errorJson('รูปแบบ JSON ไม่ถูกต้อง', 400); }
  if (!body || typeof body !== 'object') return errorJson('ข้อมูลคำขอต้องเป็น JSON object', 400);
  const input = body as Record<string, unknown>;
  if (typeof input.message !== 'string' || !input.message.trim()) return errorJson('กรุณาระบุ message ที่ไม่ว่าง', 400);
  const history: ChatMessage[] = Array.isArray(input.history) ? input.history.filter((item): item is ChatMessage => Boolean(item && typeof item === 'object' && ((item as ChatMessage).role === 'user' || (item as ChatMessage).role === 'assistant') && typeof (item as ChatMessage).content === 'string')) : [];
  history.push({ role: 'user', content: input.message.trim() });
  const provider = resolveProvider(input.provider, env);
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : defaultModelFor(provider, env);
  const [apiKey, baseUrl, toolConfig] = await Promise.all([resolveApiKey(env, provider), resolveBaseUrl(env, provider), resolveTools(env)]);
  const result = await runProvider(provider, { history, tools: toolConfig.tools, apiKey, baseUrl, model, systemPrompt: buildSystemPrompt(toolConfig.tools.length > 0), callTool: toolConfig.callTool });
  return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
}

export async function runChatTurn(params: { env: Env; provider: ChatProvider; model?: string; history: ChatMessage[] }): Promise<{ reply: string; toolTraceCount: number }> {
  const provider = resolveProvider(params.provider, params.env);
  const model = params.model?.trim() || defaultModelFor(provider, params.env);
  const [apiKey, baseUrl, toolConfig] = await Promise.all([resolveApiKey(params.env, provider), resolveBaseUrl(params.env, provider), resolveTools(params.env)]);
  const result = await runProvider(provider, { history: params.history, tools: toolConfig.tools, apiKey, baseUrl, model, systemPrompt: buildSystemPrompt(toolConfig.tools.length > 0), callTool: toolConfig.callTool });
  return { reply: result.reply, toolTraceCount: result.toolTrace.length };
}