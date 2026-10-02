import { checkAuth } from '../lib/common.js';

// Proxy tipis ke Anthropic Messages API. Kunci API hanya ada di server.
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diatur' });

  const { messages, tools } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages kosong' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2048,
        messages,
        ...(Array.isArray(tools) && tools.length ? { tools } : {}),
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: j?.error?.message || 'Gagal memanggil AI' });
    return res.status(200).json({ content: j.content, stop_reason: j.stop_reason });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
