// J.A.R.V.I.S. hospedado — servidor sem dependências (Node 20+)
// Serve a página, pesquisa no YouTube com a chave guardada aqui e conversa via Groq/OpenAI/Gemini.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
const CFG = {
  port: Number(env.PORT || 3000),
  pin: (env.APP_PIN || '').trim(),
  secret: env.SESSION_SECRET || env.JWT_SECRET || randomBytes(32).toString('hex'),
  ytKey: env.YOUTUBE_API_KEY || '',
  ytBase: env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3',
  region: env.YOUTUBE_REGION || 'BR',
  providers: [
    { id: 'groq', key: env.GROQ_API_KEY, model: env.MODEL_GROQ, url: (env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1') + '/chat/completions', kind: 'openai' },
    { id: 'openai', key: env.OPENAI_API_KEY, model: env.MODEL_OPENAI, url: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', kind: 'openai' },
    { id: 'gemini', key: env.GEMINI_API_KEY, model: env.MODEL_GEMINI, url: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini' },
  ].filter((p) => p.key && p.model),
  // Transcrição (Whisper): Groq primeiro, OpenAI depois. Modelos trocáveis por variável de ambiente.
  transcricao: [
    { id: 'groq', key: env.GROQ_API_KEY, model: env.TRANSCRIBE_MODEL_GROQ || 'whisper-large-v3-turbo', url: (env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1') + '/audio/transcriptions' },
    { id: 'openai', key: env.OPENAI_API_KEY, model: env.TRANSCRIBE_MODEL_OPENAI || 'whisper-1', url: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/audio/transcriptions' },
  ].filter((p) => p.key),
};

// ---------- Sessão por PIN (cookie assinado, 30 dias) ----------
const sign = (v) => createHmac('sha256', CFG.secret).update(v).digest('base64url');
function makeToken() { const exp = String(Date.now() + 30 * 864e5); return `${exp}.${sign(exp)}`; }
function validToken(t) {
  if (!t) return false; const [exp, sig] = String(t).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const authed = (req) => !CFG.pin || validToken(cookies(req).jv);
function pinOk(given) { const a = Buffer.from(String(given || '')), b = Buffer.from(CFG.pin); return a.length === b.length && timingSafeEqual(a, b); }

// ---------- Limite de uso por IP ----------
const hits = new Map();
function limited(req, max) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now(), win = 60_000; const h = (hits.get(ip) || []).filter((t) => now - t < win);
  h.push(now); hits.set(ip, h); if (hits.size > 5000) hits.clear();
  return h.length > max;
}

// ---------- YouTube ----------
const cache = new Map(); // termo → {at, data}
async function youtubeSearch(q, musica) {
  const key = `${musica ? 'm' : 'v'}:${q.toLowerCase()}`; const c = cache.get(key);
  if (c && Date.now() - c.at < 30 * 60_000) return c.data;
  const p = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8', q, regionCode: CFG.region, relevanceLanguage: 'pt', safeSearch: 'moderate', key: CFG.ytKey });
  if (musica) p.set('videoCategoryId', '10');
  const r = await fetch(`${CFG.ytBase}/search?${p}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || r.status;
    const texto = String(j?.error?.message || '');
    const msg = reason === 'quotaExceeded' ? 'cota diária da API do YouTube esgotada; volta amanhã'
      : /api key not valid|keyInvalid/i.test(texto + reason) ? 'a chave do YouTube não é válida: confira YOUTUBE_API_KEY no Render (deve começar com AIza)'
      : /has not been used|disabled|accessNotConfigured/i.test(texto + reason) ? 'a YouTube Data API v3 não está ativada no projeto dessa chave'
      : /blocked|API_KEY_SERVICE_BLOCKED|forbidden/i.test(texto + reason) ? 'a chave do YouTube está bloqueada para a YouTube Data API v3 (restrições da chave)'
      : `YouTube respondeu ${reason}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  const data = (j.items || []).filter((i) => i.id?.videoId).map((i) => ({
    id: i.id.videoId,
    titulo: decodeEntities(i.snippet?.title || ''),
    canal: decodeEntities(i.snippet?.channelTitle || ''),
    thumb: i.snippet?.thumbnails?.medium?.url || i.snippet?.thumbnails?.default?.url || '',
  }));
  cache.set(key, { at: Date.now(), data }); if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}
const decodeEntities = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Mensagem de erro sem risco de vazar a chave: só o código HTTP ou um aviso genérico.
function erroSeguro(e) {
  const m = String((e && e.message) || '');
  if (/^HTTP \d{3}$/.test(m)) return m === 'HTTP 401' || m === 'HTTP 403' ? `${m} (chave recusada: confira a chave no Render)` : m;
  if (/aborted|timeout/i.test(m)) return 'sem resposta a tempo';
  if (/header|Bearer|invalid/i.test(m)) return 'chave com formato inválido (confira se colou a chave certa, sem espaços)';
  return 'falha de conexão';
}

// ---------- Conversa (Groq → OpenAI → Gemini, com fallback) ----------
const SYSTEM = 'Você é o J.A.R.V.I.S., assistente pessoal: elegante, leal, calmo e direto. Responda em português do Brasil. A resposta será falada em voz alta: no máximo 3 frases curtas, sem listas, markdown ou emojis. Você também controla um player de YouTube nesta página: se o usuário pedir música ou vídeo, diga para ele falar "toca" e o nome. Não invente fatos.';
async function chat(messages) {
  const msgs = [{ role: 'system', content: SYSTEM }, ...messages.slice(-12)];
  const erros = [];
  for (const p of CFG.providers) {
    try {
      if (p.kind === 'openai') {
        const r = await fetch(p.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` }, body: JSON.stringify({ model: p.model, messages: msgs, temperature: 0.5, max_tokens: 400 }), signal: AbortSignal.timeout(30_000) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { texto: j.choices?.[0]?.message?.content?.trim() || '', provedor: p.id };
      }
      const r = await fetch(`${p.url}/models/${encodeURIComponent(p.model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': p.key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.5, maxOutputTokens: 400 } }), signal: AbortSignal.timeout(30_000) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { texto: (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim(), provedor: p.id };
    } catch (e) { erros.push(`${p.id}: ${erroSeguro(e)}`); }
  }
  throw Object.assign(new Error(CFG.providers.length ? `nenhum provedor respondeu (${erros.join('; ')})` : 'nenhum provedor de IA configurado'), { status: 502 });
}

// ---------- Transcrição do áudio que está tocando ----------
// Frases que o Whisper inventa em trechos sem fala/música instrumental.
const ALUCINACOES = [/legendas? (?:pela|por) comunidade amara/i, /amara\.org/i, /obrigad[oa] por assistir/i, /inscreva-?se no canal/i, /^\s*(?:m[uú]sica|\[m[uú]sica\]|♪+|\.+|tchau\.?)\s*$/i, /legendas? (?:em portugu[eê]s|por )/i];
const limpaTranscricao = (t) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter((f) => f && !ALUCINACOES.some((r) => r.test(f))).join(' ').trim();
async function transcrever(audio, tipo, contexto) {
  const erros = [];
  for (const p of CFG.transcricao) {
    try {
      const fd = new FormData();
      fd.append('file', new Blob([audio], { type: tipo }), tipo.includes('ogg') ? 'trecho.ogg' : tipo.includes('mp4') ? 'trecho.mp4' : 'trecho.webm');
      fd.append('model', p.model); fd.append('language', 'pt'); fd.append('response_format', 'json'); fd.append('temperature', '0');
      if (contexto) fd.append('prompt', contexto.slice(-400));
      const r = await fetch(p.url, { method: 'POST', headers: { authorization: `Bearer ${p.key}` }, body: fd, signal: AbortSignal.timeout(45_000) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { texto: limpaTranscricao(j.text), provedor: p.id };
    } catch (e) { erros.push(`${p.id}: ${erroSeguro(e)}`); }
  }
  throw Object.assign(new Error(CFG.transcricao.length ? `transcrição falhou (${erros.join('; ')})` : 'configure GROQ_API_KEY ou OPENAI_API_KEY para transcrever'), { status: 502 });
}
async function lerBinario(req, max) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('áudio grande demais'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

function avisosDeConfiguracao() {
  const a = [];
  if (CFG.ytKey && !/^AIza[0-9A-Za-z_-]{30,}$/.test(CFG.ytKey)) a.push('YOUTUBE_API_KEY não parece uma chave do Google (deve começar com AIza)');
  if (env.GROQ_API_KEY && !/^gsk_[A-Za-z0-9]{20,}$/.test(env.GROQ_API_KEY)) a.push('GROQ_API_KEY não parece uma chave da Groq (deve começar com gsk_)');
  if (env.OPENAI_API_KEY && !/^sk-[A-Za-z0-9_-]{20,}$/.test(env.OPENAI_API_KEY)) a.push('OPENAI_API_KEY não parece uma chave da OpenAI (deve começar com sk-)');
  if (!CFG.pin) a.push('APP_PIN não definido: qualquer pessoa com o link usa as suas chaves');
  return a;
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SECURITY = {
  'content-security-policy': "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data: https://i.ytimg.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'microphone=(self), camera=(), display-capture=(self)',
};
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY, ...(isObj ? { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
async function readJson(req, max = 32_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('corpo grande demais'), { status: 413 }); chunks.push(c); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (typeof v !== 'object' || !v || Array.isArray(v)) throw 0; return v; }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true, youtube: Boolean(CFG.ytKey), ia: CFG.providers.map((p) => p.id), transcricao: CFG.transcricao.map((p) => p.id), pin: Boolean(CFG.pin), avisos: avisosDeConfiguracao() });

      if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { ok: authed(req), pin: Boolean(CFG.pin), youtube: Boolean(CFG.ytKey), ia: CFG.providers.length > 0, transcricao: CFG.transcricao.length > 0 });

      if (url.pathname === '/api/login' && req.method === 'POST') {
        if (limited(req, 10)) return send(res, 429, { error: 'muitas tentativas; espere um minuto' });
        const { pin } = await readJson(req);
        if (CFG.pin && !pinOk(pin)) return send(res, 401, { error: 'PIN incorreto' });
        const secure = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
        return send(res, 200, { ok: true }, { 'set-cookie': `jv=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${secure}` });
      }

      if (url.pathname.startsWith('/api/')) {
        if (!authed(req)) return send(res, 401, { error: 'faça login com o PIN' });
        if (limited(req, 60)) return send(res, 429, { error: 'muitas solicitações; espere um pouco' });

        if (url.pathname === '/api/youtube' && req.method === 'GET') {
          const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
          if (!q) return send(res, 400, { error: 'diga o que procurar' });
          if (!CFG.ytKey) return send(res, 503, { error: 'YOUTUBE_API_KEY não configurada no servidor' });
          return send(res, 200, { termo: q, videos: await youtubeSearch(q, url.searchParams.get('musica') === '1') });
        }
        if (url.pathname === '/api/transcrever' && req.method === 'POST') {
          const tipo = String(req.headers['content-type'] || '').split(';')[0];
          if (!/^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(tipo)) return send(res, 415, { error: 'envie áudio (webm, ogg, mp4, mp3 ou wav)' });
          const audio = await lerBinario(req, 6 * 1024 * 1024);
          if (audio.length < 1000) return send(res, 200, { texto: '' });
          return send(res, 200, await transcrever(audio, tipo, (url.searchParams.get('contexto') || '').slice(0, 600)));
        }
        if (url.pathname === '/api/chat' && req.method === 'POST') {
          const body = await readJson(req);
          const messages = (Array.isArray(body.messages) ? body.messages : [])
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
          if (!messages.length || messages[messages.length - 1].role !== 'user') return send(res, 400, { error: 'mensagem vazia' });
          return send(res, 200, await chat(messages));
        }
        return send(res, 404, { error: 'rota não encontrada' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'método não permitido');
      const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
      if (rel.includes('..')) return send(res, 400, 'caminho inválido');
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT)) return send(res, 400, 'caminho inválido');
      const data = await readFile(file).catch(() => null);
      if (!data) return send(res, 404, 'não encontrado');
      return send(res, 200, data, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300' });
    } catch (e) {
      // Corpo recusado no meio do envio: fecha a conexão para o resto do upload não contaminar a próxima requisição.
      const extra = e.status === 413 ? { connection: 'close' } : {};
      if (res.headersSent) return res.end();
      send(res, e.status || 500, { error: e.status ? e.message : 'erro interno' }, extra);
      if (e.status === 413) res.on('finish', () => req.destroy());
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(CFG.port, () => {
    console.log(`J.A.R.V.I.S. no ar na porta ${CFG.port} · YouTube: ${CFG.ytKey ? 'ok' : 'SEM CHAVE'} · IA: ${CFG.providers.map((p) => p.id).join(', ') || 'nenhuma'} · PIN: ${CFG.pin ? 'ativo' : 'DESLIGADO'}`);
    for (const a of avisosDeConfiguracao()) console.warn('Aviso: ' + a);
  });
}
