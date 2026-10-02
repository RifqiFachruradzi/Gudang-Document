import { checkAuth } from '../lib/common.js';

// Proxy tipis ke penyedia AI. Kunci API hanya ada di server.
// Frontend selalu mengirim format pesan Anthropic; jika GEMINI_API_KEY diatur,
// pesan diterjemahkan ke format Google Gemini (ada paket gratis), jika tidak memakai Anthropic.
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });

  const { messages, tools } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages kosong' });
  const toolList = Array.isArray(tools) && tools.length ? tools : null;

  try {
    if (process.env.GEMINI_API_KEY) return await gemini(res, messages, toolList);
    if (process.env.ANTHROPIC_API_KEY) return await anthropic(res, messages, toolList);
    return res.status(500).json({ error: 'GEMINI_API_KEY atau ANTHROPIC_API_KEY belum diatur' });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}

async function anthropic(res, messages, tools) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 2048,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: j?.error?.message || 'Gagal memanggil AI' });
  return res.status(200).json({ content: j.content, stop_reason: j.stop_reason });
}

async function gemini(res, messages, tools) {
  // Nama alat untuk setiap tool_use_id, karena Gemini mencocokkan hasil alat lewat nama.
  const toolNames = {};
  for (const m of messages) {
    if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') toolNames[b.id] = b.name;
  }

  const contents = messages.map(m => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const parts = blocks.map(b => {
      if (b.type === 'text') return { text: b.text };
      if (b.type === 'image') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
      if (b.type === 'tool_use') {
        return { functionCall: { name: b.name, args: b.input || {} }, ...(b.signature ? { thoughtSignature: b.signature } : {}) };
      }
      if (b.type === 'tool_result') {
        return { functionResponse: { name: toolNames[b.tool_use_id] || 'alat', response: { content: b.content } } };
      }
      return null;
    }).filter(Boolean);
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: 4096 },
      ...(tools ? {
        tools: [{
          functionDeclarations: tools.map(t => {
            const p = t.input_schema;
            const hasProps = p && p.properties && Object.keys(p.properties).length;
            return { name: t.name, description: t.description, ...(hasProps ? { parameters: p } : {}) };
          }),
        }],
      } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: j?.error?.message || 'Gagal memanggil AI' });

  const cand = (j.candidates || [])[0];
  if (!cand) return res.status(400).json({ error: j?.promptFeedback?.blockReason ? 'Permintaan ditolak oleh Gemini' : 'Gemini tidak memberi jawaban' });

  const content = [];
  let calls = 0;
  for (const p of cand.content?.parts || []) {
    if (p.thought) continue;
    if (p.functionCall) {
      calls++;
      content.push({
        type: 'tool_use',
        id: `call_${Date.now()}_${calls}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
        ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}),
      });
    } else if (typeof p.text === 'string' && p.text) {
      content.push({ type: 'text', text: p.text });
    }
  }
  const stop_reason = calls ? 'tool_use' : cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  return res.status(200).json({ content, stop_reason });
}
