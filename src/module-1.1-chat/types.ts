export type ChatProvider = 'gemini' | 'openai' | 'openai-compat';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
}

export interface ToolTraceEntry {
  name: string;
  arguments?: unknown;
  result?: unknown;
  error?: string;
}

export interface ChatTurnResult {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

export type ToolCaller = (name: string, arguments_: unknown) => Promise<unknown>;

export function toolFunctionName(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`;
}