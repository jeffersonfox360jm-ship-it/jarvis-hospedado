import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

// Só Gemini configurado (Groq com valor errado é ignorada): conversa e letra ao vivo pelo Gemini.
test('Gemini: conversa e transcrição; Groq com chave de formato errado é ignorada', async () => {
  const reqs = [];
  const mock = http.createServer(async (req, res) => {
    let b = ''; for await (const c of req) b += c;
    reqs.push({ url: req.url, key: req.headers['x-goog-api-key'], body: JSON.parse(b || '{}') });
    const temAudio = b.includes('inline_data');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: temAudio ? '[música] Quando eu digo que deixei de te amar' : 'Sistemas online, senhor.' }] } }] }));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const GEMINI = 'AIza' + 'b'.repeat(35);
  const env = { ...process.env, APP_PIN: '', GROQ_API_KEY: 'srv-valor-errado', MODEL_GROQ: 'x', GEMINI_API_KEY: GEMINI, MODEL_GEMINI: 'gemini-3.8-flash', GEMINI_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1beta` };
  const p = spawn(process.execPath, ['-e', "import('./server.js').then(({createServer})=>{const s=createServer().listen(0,'127.0.0.1',()=>console.log('PORTA '+s.address().port))})"], { env, cwd: new URL('..', import.meta.url).pathname });
  const porta = await new Promise((ok, falha) => { p.stdout.on('data', (d) => { const m = /PORTA (\d+)/.exec(String(d)); if (m) ok(m[1]); }); setTimeout(() => falha(new Error('tempo')), 8000); });
  try {
    const base = `http://127.0.0.1:${porta}`;
    const h = await (await fetch(`${base}/health`)).json();
    assert.deepEqual(h.ia, ['gemini'], 'Groq com chave errada foi ignorada');
    assert.deepEqual(h.transcricao, ['gemini']);
    const c = await (await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] }) })).json();
    assert.deepEqual(c, { texto: 'Sistemas online, senhor.', provedor: 'gemini' });
    const t = await (await fetch(`${base}/api/transcrever?contexto=${encodeURIComponent('Música: Evidências')}`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.alloc(4000, 3) })).json();
    assert.deepEqual(t, { texto: 'Quando eu digo que deixei de te amar', provedor: 'gemini' });
    const tr = reqs.find((r) => JSON.stringify(r.body).includes('inline_data'));
    assert.equal(tr.key, GEMINI); assert.match(tr.url, /gemini-3\.8-flash:generateContent/);
    assert.equal(tr.body.contents[0].parts[1].inline_data.mime_type, 'audio/webm');
    assert.equal(tr.body.contents[0].parts[1].inline_data.data, Buffer.alloc(4000, 3).toString('base64'));
    assert.ok(!reqs.some((r) => JSON.stringify(r).includes('srv-valor-errado')), 'valor errado da Groq nunca saiu do servidor');
  } finally { p.kill(); mock.close(); }
});
