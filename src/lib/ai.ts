'use client';

import { api, ApiError } from './client';

// Pemanggil AI di sisi klien: mengirim pesan ke /api/ai dan menjalankan alat (tool) secara lokal
// sampai AI selesai menjawab.

export interface AiTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string> | string;
}
type Block = Record<string, unknown> & { type: string };
interface Msg { role: 'user' | 'assistant'; content: string | Block[] }
interface AiReply { content: Block[]; stop_reason: string }

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// Perkecil foto ke maksimal 1400 px agar hemat kuota dan cepat dikirim.
async function toImageBlock(file: Blob): Promise<Block> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.82).split(',')[1];
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
  } catch {
    throw new ApiError('image_rejected', 'Foto tidak bisa dibaca');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SampleOptions {
  images?: Blob | Blob[] | FileList;
  tools?: AiTool[];
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

export async function sample(input: string | Msg[], opts: SampleOptions = {}): Promise<{ text: string; truncated: boolean }> {
  const messages: Msg[] = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map((m) => ({ ...m }));
  if (opts.images) {
    const list = opts.images instanceof Blob ? [opts.images] : Array.from(opts.images);
    const blocks = await Promise.all(list.slice(0, 3).map(toImageBlock));
    const last = messages[messages.length - 1];
    last.content = [...blocks, { type: 'text', text: String(last.content) }];
  }
  const tools = (opts.tools || []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  let text = '';
  let truncated = false;
  for (let round = 0; round < 6; round++) {
    if (opts.signal?.aborted) throw new ApiError('cancelled', 'Dihentikan');
    const r = await api<AiReply>('/api/ai', { json: { messages, tools: tools.length ? tools : undefined }, signal: opts.signal });
    const blocks = r.content || [];
    const t = blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('');
    if (t) {
      text += (text ? '\n\n' : '') + t;
      opts.onText?.(text);
    }
    truncated = r.stop_reason === 'max_tokens';
    const uses = blocks.filter((b) => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !uses.length) break;
    messages.push({ role: 'assistant', content: blocks });
    const results = await Promise.all(
      uses.map(async (u) => {
        const tool = opts.tools?.find((x) => x.name === u.name);
        try {
          const out = tool ? await tool.execute((u.input as Record<string, unknown>) || {}) : 'Error: alat tidak dikenal';
          return { type: 'tool_result', tool_use_id: u.id, content: out };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + ((err as Error)?.message || err), is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  return { text, truncated };
}

// Minta jawaban JSON dari AI (dipakai untuk membaca surat jalan dan memeriksa foto).
export async function sampleJSON<T>(input: string, opts: SampleOptions = {}): Promise<T> {
  const r = await sample(input, opts);
  const s = r.text.replace(/```json|```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  try {
    return JSON.parse(s.slice(a, b + 1)) as T;
  } catch {
    throw new ApiError('invalid_argument', 'Jawaban AI bukan JSON');
  }
}

export function aiErrorMessage(e: unknown, fallback: string) {
  const code = e instanceof ApiError ? e.code : '';
  if (code === 'rate_limited') return 'AI sedang sibuk, coba sebentar lagi';
  if (code === 'image_rejected') return 'Foto tidak bisa dibaca. Coba foto lain (JPG/PNG).';
  return fallback + (e instanceof Error && e.message ? ` (${e.message})` : '');
}
