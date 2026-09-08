import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

interface OpenAiParams {
  apiKey: string;
  baseUrl: string;
  model: string;
  history: ChatMessage[];
  systemPrompt: string;
  tools: McpTool[];
  callTool?: ToolCaller;
}

export async function runOpenAiCompatConversation(params: OpenAiParams): Promise<ChatTurnResult> {
  if (!params.apiKey.trim()) return { reply: 'ยังไม่ได้ตั้งค่า API key ของ provider นี้ จึงยังไม่สามารถเรียกโมเดลได้', toolTrace: [] };
  if (!params.baseUrl.trim()) return { reply: 'ยังไม่ได้ตั้งค่า base URL ของ provider นี้ จึงยังไม่สามารถเรียกโมเดลได้', toolTrace: [] };

  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: params.systemPrompt }, ...params.history];
  const toolTrace: ToolTraceEntry[] = [];
  const tools = params.tools.map((tool) => ({ type: 'function', function: { name: tool.serverId ? `${tool.serverId}__${tool.name}` : tool.name, description: tool.description, parameters: tool.inputSchema } }));
  const endpoint = `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { model: params.model, messages, temperature: 0.7 };
    if (tools.length > 0) { body.tools = tools; body.tool_choice = 'auto'; }
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${params.apiKey}` }, body: JSON.stringify(body) });
    } catch {
      return { reply: 'ไม่สามารถเชื่อมต่อ provider ได้ กรุณาตรวจสอบ base URL หรือเครือข่าย', toolTrace };
    }
    if (!response.ok) return { reply: `provider ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบ API key, base URL และชื่อโมเดล`, toolTrace };
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const message = data.choices?.[0]?.message;
    if (!message) return { reply: 'provider ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    if (!message.tool_calls?.length) return { reply: message.content || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls });
    if (!params.callTool) return { reply: message.content || 'โมเดลขอใช้เครื่องมือ แต่ยังไม่มีเครื่องมือเปิดใช้งาน', toolTrace };
    for (const call of message.tool_calls) {
      const trace: ToolTraceEntry = { name: call.function.name, arguments: call.function.arguments };
      try { trace.result = await params.callTool(call.function.name, JSON.parse(call.function.arguments || '{}')); }
      catch (error) { trace.error = error instanceof Error ? error.message : 'เรียกเครื่องมือไม่สำเร็จ'; }
      toolTrace.push(trace);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(trace.error ? { error: trace.error } : trace.result) });
    }
  }
  return { reply: 'โมเดลเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace };
}