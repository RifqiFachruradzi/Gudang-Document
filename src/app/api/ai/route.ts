import { body, fail, handle, json, requireUser } from '@/server/core';

export const maxDuration = 60;

// Format pesan mengikuti Anthropic Messages API. Jika GEMINI_API_KEY diatur, pesan
// diterjemahkan ke Google Gemini (ada paket gratis); jika tidak, dipakai Anthropic.
type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown>; signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
interface Msg { role: 'user' | 'assistant'; content: string | Block[] }
interface Tool { name: string; description: string; input_schema?: { properties?: Record<string, unknown> } }

export const POST = handle(async (req) => {
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const { messages, tools } = await body<{ messages?: Msg[]; tools?: Tool[] }>(req);
  if (!Array.isArray(messages) || !messages.length) return fail(400, 'messages kosong');
  const toolList = Array.isArray(tools) && tools.length ? tools : null;
  try {
    if (process.env.GEMINI_API_KEY) return await gemini(messages, toolList);
    if (process.env.ANTHROPIC_API_KEY) return await anthropic(messages, toolList);
    return fail(500, 'GEMINI_API_KEY atau ANTHROPIC_API_KEY belum diatur');
  } catch (e) {
    return fail(502, String((e as Error)?.message || e));
  }
});

async function anthropic(messages: Msg[], tools: Tool[] | null) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 2048, messages, ...(tools ? { tools } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) return fail(r.status, j?.error?.message || 'Gagal memanggil AI');
  return json({ content: j.content, stop_reason: j.stop_reason });
}

async function gemini(messages: Msg[], tools: Tool[] | null) {
  // Nama alat per tool_use_id, karena Gemini mencocokkan hasil alat lewat nama.
  const toolNames: Record<string, string> = {};
  for (const m of messages) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') toolNames[b.id] = b.name;

  const contents = messages.map((m) => {
    const blocks: Block[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const parts = blocks
      .map((b) => {
        if (b.type === 'text') return { text: b.text };
        if (b.type === 'image') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
        if (b.type === 'tool_use') return { functionCall: { name: b.name, args: b.input || {} }, ...(b.signature ? { thoughtSignature: b.signature } : {}) };
        if (b.type === 'tool_result') return { functionResponse: { name: toolNames[b.tool_use_id] || 'alat', response: { content: b.content } } };
        return null;
      })
      .filter(Boolean);
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const payload = {
    contents,
    generationConfig: { maxOutputTokens: 4096 },
    ...(tools
      ? {
          tools: [{
            functionDeclarations: tools.map((t) => {
              const p = t.input_schema;
              const hasProps = p?.properties && Object.keys(p.properties).length;
              return { name: t.name, description: t.description, ...(hasProps ? { parameters: p } : {}) };
            }),
          }],
        }
      : {}),
  };

  // Model gratis kadang penuh (503) atau kena batas (429): coba ulang, lalu pindah ke model cadangan.
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let r: Response | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let j: any = {};
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      j = await r.json().catch(() => ({}));
      if (r.ok || ![429, 500, 503].includes(r.status)) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    if (r!.ok || ![404, 429, 500, 503].includes(r!.status)) break;
  }
  if (!r!.ok) return fail(r!.status, j?.error?.message || 'Gagal memanggil AI');

  const cand = (j.candidates || [])[0];
  if (!cand) return fail(400, j?.promptFeedback?.blockReason ? 'Permintaan ditolak oleh Gemini' : 'Gemini tidak memberi jawaban');

  const content: Block[] = [];
  let calls = 0;
  for (const p of cand.content?.parts || []) {
    if (p.thought) continue;
    if (p.functionCall) {
      calls++;
      content.push({ type: 'tool_use', id: `call_${Date.now()}_${calls}`, name: p.functionCall.name, input: p.functionCall.args || {}, ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}) });
    } else if (typeof p.text === 'string' && p.text) {
      content.push({ type: 'text', text: p.text });
    }
  }
  const stop_reason = calls ? 'tool_use' : cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  return json({ content, stop_reason });
}
