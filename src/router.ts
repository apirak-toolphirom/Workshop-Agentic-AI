import type { Env } from './env';
import { json } from './lib/http';
import { handleChatRoute } from './module-1.1-chat/chat-routes';

export async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/chat') return handleChatRoute(request, env);
  if (pathname === '/healthz') return json({ ok: true });
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return json({ error: 'ไม่พบเส้นทางที่ร้องขอ' }, 404);
}