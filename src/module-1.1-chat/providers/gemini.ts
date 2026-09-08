import { toGeminiSchema } from '../tool-schema';
import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

interface GeminiParams {
  apiKey: string;
  model: string;
  history: ChatMessage[];
  systemPrompt: string;
  tools: McpTool[];
  callTool?: ToolCaller;
}

export async function runGeminiConversation(params: GeminiParams): Promise<ChatTurnResult> {
  if (!params.apiKey.trim()) {
    return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY จึงยังไม่สามารถเรียก Gemini ได้', toolTrace: [] };
  }

  const contents: Array<Record<string, unknown>> = params.history.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const toolTrace: ToolTraceEntry[] = [];
  const declarations = params.tools.map((tool) => ({
    name: tool.serverId ? `${tool.serverId}__${tool.name}` : tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.inputSchema),
  }));

  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: params.systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 },
    };
    if (declarations.length > 0) body.tools = [{ functionDeclarations: declarations }];

    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { reply: 'ไม่สามารถเชื่อมต่อ Gemini ได้ กรุณาตรวจสอบเครือข่ายหรือการตั้งค่า API key', toolTrace };
    }
    if (!response.ok) return { reply: `Gemini ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบ API key และชื่อโมเดล`, toolTrace };

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((part) => typeof part.text === 'string').map((part) => part.text as string).join('');
    const call = parts.find((part) => part.functionCall && typeof part.functionCall === 'object')?.functionCall as { name: string; args?: unknown } | undefined;
    if (!call) return { reply: text || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    if (!params.callTool) return { reply: text || 'โมเดลขอใช้เครื่องมือ แต่ยังไม่มีเครื่องมือเปิดใช้งาน', toolTrace };

    const trace: ToolTraceEntry = { name: call.name, arguments: call.args };
    try {
      trace.result = await params.callTool(call.name, call.args ?? {});
      contents.push({ role: 'model', parts: [{ functionCall: call }] });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { result: trace.result } } }] });
    } catch (error) {
      trace.error = error instanceof Error ? error.message : 'เรียกเครื่องมือไม่สำเร็จ';
      contents.push({ role: 'model', parts: [{ functionCall: call }] });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { error: trace.error } } }] });
    }
    toolTrace.push(trace);
  }
  return { reply: 'โมเดลเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace };
}