// Pengganti runtime Claude untuk versi mandiri (Vercel).
// Menyediakan claude.use("db" | "sample" | "user") yang memanggil /api/data dan /api/ai.
(function () {
  if (window.claude && window.claude.use) return;

  // Sesi login: token dari /login.html. Tanpa token, arahkan ke halaman masuk.
  const TOKEN_KEY = 'gudang-ai-token', USER_KEY = 'gudang-ai-user';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function getMe() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } }
  function toLogin() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
    location.replace('/login.html');
  }
  if (!getToken()) { toLogin(); return; }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken(), ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      toLogin();
      throw { code: 'not_granted', message: 'Sesi berakhir, silakan masuk lagi' };
    }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error || ''; } catch (e) {}
      const code = res.status === 429 || res.status === 529 ? 'rate_limited'
        : res.status === 413 ? 'image_rejected'
        : res.status === 403 ? 'forbidden'
        : res.status === 400 ? 'invalid_argument' : 'unavailable';
      throw { code, message: msg || 'HTTP ' + res.status };
    }
    return res.json();
  }

  async function logout() {
    try { await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); } catch (e) {}
    toLogin();
  }

  // ---------- user ----------
  let meCache = null;
  async function me() {
    if (!meCache) {
      try {
        meCache = (await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'me' }) })).user;
        try { localStorage.setItem(USER_KEY, JSON.stringify(meCache)); } catch (e) {}
      } catch (e) { meCache = getMe() || {}; }
    }
    return meCache;
  }
  const user = {
    async id() { return (await me()).email || null; },
    async me() { const m = await me(); return { name: m.name || '', email: m.email || '', role: m.role || 'petugas' }; },
    async profiles(ids) { return api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'profiles', ids }) }); },
    logout,
  };

  // Dipakai halaman aplikasi untuk fitur akun dan admin.
  window.gudangApi = {
    changePassword: (oldPw, newPw) => api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'password', old: oldPw, new: newPw }) }),
    adminList: () => api('/api/admin'),
    adminUpdate: (email, patch) => api('/api/admin', { method: 'POST', body: JSON.stringify({ email, ...patch }) }),
  };

  // ---------- db ----------
  const listeners = {};
  let cache = null, polling = null;
  async function refresh() {
    try {
      cache = await api('/api/data');
      for (const col in listeners) deliver(col);
    } catch (e) {
      for (const col in listeners) listeners[col].forEach(l => l.err && l.err(e));
    }
  }
  function deliver(col) {
    const docsObj = (cache && cache[col]) || {};
    const docs = Object.keys(docsObj).sort().map(id => ({ id, exists: true, data: () => docsObj[id] }));
    const snap = { docs, size: docs.length, empty: !docs.length };
    (listeners[col] || []).forEach(l => l.next(snap));
  }
  const db = {
    collection(col) {
      return {
        onSnapshot(next, err) {
          (listeners[col] = listeners[col] || []).push({ next, err });
          if (cache) setTimeout(() => deliver(col), 0);
          if (!polling) { refresh(); polling = setInterval(() => { if (!document.hidden) refresh(); }, 5000); }
          return () => { listeners[col] = (listeners[col] || []).filter(l => l.next !== next); };
        },
        doc(id) {
          return {
            async set(data) {
              await api('/api/data', { method: 'POST', body: JSON.stringify({ col, id, data }) });
              if (cache) { cache[col] = cache[col] || {}; cache[col][id] = data; deliver(col); }
              refresh();
            },
          };
        },
      };
    },
  };

  // ---------- sample (AI) ----------
  async function toImageBlock(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.82).split(',')[1];
      return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
    } catch (e) {
      throw { code: 'image_rejected', message: 'Foto tidak bisa dibaca' };
    } finally { URL.revokeObjectURL(url); }
  }

  async function sample(input, opts = {}) {
    let messages = typeof input === 'string' ? [{ role: 'user', content: input }]
      : input.map(m => ({ role: m.role, content: m.content }));
    if (opts.images) {
      const list = opts.images instanceof Blob ? [opts.images] : Array.from(opts.images);
      const blocks = await Promise.all(list.slice(0, 3).map(toImageBlock));
      const last = messages[messages.length - 1];
      last.content = [...blocks, { type: 'text', text: last.content }];
    }
    const tools = (opts.tools || []).map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    let text = '', truncated = false;
    const emit = (delta) => { if (!delta) return; text += delta; opts.onText && opts.onText({ text, delta }); };
    for (let round = 0; round < 6; round++) {
      let r;
      try {
        r = await api('/api/ai', { method: 'POST', body: JSON.stringify({ messages, tools: tools.length ? tools : undefined, tier: opts.modelTier }), signal: opts.signal });
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'Dihentikan', text };
        throw { ...e, text };
      }
      const blocks = r.content || [];
      const t = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
      if (t) emit((text ? '\n\n' : '') + t);
      truncated = r.stop_reason === 'max_tokens';
      const uses = blocks.filter(b => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) break;
      messages.push({ role: 'assistant', content: blocks });
      const results = await Promise.all(uses.map(async u => {
        const tool = (opts.tools || []).find(x => x.name === u.name);
        try {
          const out = tool ? await tool.execute(u.input || {}, { signal: opts.signal || new AbortController().signal }) : 'Error: alat tidak dikenal';
          return { type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + (err && err.message || err), is_error: true };
        }
      }));
      messages.push({ role: 'user', content: results });
    }
    return { text, truncated };
  }
  sample.json = async function (input, opts = {}) {
    const r = await sample(input, opts);
    const s = r.text.replace(/```json|```/g, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    try { return JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw { code: 'invalid_json', message: 'Jawaban bukan JSON', text: r.text }; }
  };
  sample.limits = async function () {
    return { images: { maxCount: 3, maxInputBytes: 20 * 1024 * 1024, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] }, tools: { maxTools: 10 } };
  };

  window.gudangLogout = logout;
  window.claude = {
    use(name) {
      if (name === 'db') return Promise.resolve(db);
      if (name === 'sample') return Promise.resolve(sample);
      if (name === 'user') return Promise.resolve(user);
      return Promise.resolve(null);
    },
  };
})();
