import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

// Sobe o servidor num processo separado com chaves coladas erradas (espaço, quebra de linha, valor de outra coisa).
test('chave colada errada: erro não vaza o valor; espaços são ignorados; /health avisa', async () => {
  const SEGREDO = 'srv-valor-que-nao-pode-vazar-123';
  const env = { ...process.env, PORT: '0', APP_PIN: '', GROQ_API_KEY: `\n${SEGREDO} com espaço\n`, MODEL_GROQ: '  modelo-x  ', YOUTUBE_API_KEY: '  AIzaSyA1234567890abcdefghijklmnopqrstu  ', GROQ_BASE_URL: 'http://127.0.0.1:9/nada' };
  const p = spawn(process.execPath, ['-e', "import('./server.js').then(({createServer})=>{const s=createServer().listen(0,'127.0.0.1',()=>console.log('PORTA '+s.address().port))})"], { env, cwd: new URL('..', import.meta.url).pathname });
  const porta = await new Promise((ok, falha) => { p.stdout.on('data', (d) => { const m = /PORTA (\d+)/.exec(String(d)); if (m) ok(m[1]); }); p.on('exit', () => falha(new Error('servidor caiu'))); setTimeout(() => falha(new Error('tempo')), 8000); });
  try {
    const base = `http://127.0.0.1:${porta}`;
    const h = await (await fetch(`${base}/health`)).json();
    assert.ok(h.avisos.some((a) => /GROQ_API_KEY não parece/.test(a)));
    assert.ok(!h.avisos.some((a) => /YOUTUBE_API_KEY/.test(a)), 'chave do YouTube com espaços foi aceita depois de limpar');
    assert.ok(h.avisos.some((a) => /APP_PIN não definido/.test(a)));
    const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] }) });
    const texto = await r.text();
    assert.equal(r.status, 502);
    assert.doesNotMatch(texto, new RegExp(SEGREDO), 'a mensagem de erro NÃO pode conter a chave');
    assert.doesNotMatch(JSON.stringify(h), new RegExp(SEGREDO));
  } finally { p.kill(); }
});
