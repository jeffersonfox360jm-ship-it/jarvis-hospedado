// Teste no navegador real (Chromium): voz, player embutido, PIN e conversa. YouTube e IA simulados.
import { createRequire } from 'node:module';
import http from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

let nTrans = 0, pedidoDescricao = '';
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'content-type': 'application/json' });
  if (u.pathname === '/yt/search') return res.end(JSON.stringify({ items: [
    { id: { videoId: 'aaa111' }, snippet: { title: 'Evidências', channelTitle: 'Chitãozinho & Xororó', thumbnails: {} } },
    { id: { videoId: 'bbb222' }, snippet: { title: 'Página de Amigos', channelTitle: 'Chitãozinho & Xororó', thumbnails: {} } },
    { id: { videoId: 'ccc333' }, snippet: { title: 'Fio de Cabelo', channelTitle: 'Chitãozinho & Xororó', thumbnails: {} } } ] }));
  if (u.pathname === '/groq/audio/transcriptions') {
    for await (const c of req) void c; nTrans++;
    return res.end(JSON.stringify({ text: nTrans === 2 ? 'Legendas pela comunidade Amara.org' : `Linha cantada ${nTrans}.` }));
  }
  let b = ''; for await (const c of req) b += c;
  if (b.includes('Descreva a música')) { pedidoDescricao = b; return res.end(JSON.stringify({ choices: [{ message: { content: 'É uma balada romântica sertaneja sobre um amor que não acabou.' } }] })); }
  return res.end(JSON.stringify({ choices: [{ message: { content: 'Bom dia, senhor. Em que posso ajudar?' } }] }));
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const m = `http://127.0.0.1:${mock.address().port}`;
Object.assign(process.env, { APP_PIN: '4321', SESSION_SECRET: 's', YOUTUBE_API_KEY: 'k', YOUTUBE_API_BASE: `${m}/yt`, GROQ_API_KEY: 'g', MODEL_GROQ: 'mg', GROQ_BASE_URL: `${m}/groq` });
const { createServer } = await import('../server.js');
const srv = createServer(); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

const FAKE_YT = `window.__yt={log:[],criados:[]};window.YT={PlayerState:{ENDED:0,PLAYING:1,PAUSED:2},Player:class{constructor(el,o){this.o=o;window.__yt.criados.push(o.videoId);window.__yt.p=this;const f=document.createElement('iframe');f.id='ytframe';f.title='player';document.getElementById(el).replaceWith(f);setTimeout(()=>o.events.onReady({target:this}),20);}
playVideo(){window.__yt.log.push('play');this.o.events.onStateChange({data:1});}pauseVideo(){window.__yt.log.push('pause');this.o.events.onStateChange({data:2});}
loadVideoById(id){window.__yt.log.push('load:'+id);this.o.events.onStateChange({data:1});}setVolume(v){window.__yt.log.push('vol:'+v);}stopVideo(){window.__yt.log.push('stop');}mute(){window.__yt.log.push('mute');}unMute(){}getCurrentTime(){return (Date.now()-(window.__t0||(window.__t0=Date.now())))/1000;}loadModule(m){window.__yt.log.push('load-mod:'+m);}unloadModule(m){window.__yt.log.push('unload-mod:'+m);}setOption(){}seekTo(t){window.__yt.log.push('seek:'+Math.round(t));}}};
setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),10);`;

const INIT = () => {
  window.__falado = [];
  window.__CICLO_MS = 1500;
  window.__capturas = 0;
  navigator.mediaDevices.getDisplayMedia = async (opts) => {
    window.__capturas++; window.__opcoesCaptura = JSON.parse(JSON.stringify(opts));
    const ac = new AudioContext(); const osc = ac.createOscillator(); osc.frequency.value = 440; const dest = ac.createMediaStreamDestination(); osc.connect(dest); osc.start();
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.getContext('2d').fillRect(0, 0, 16, 16);
    return new MediaStream([...dest.stream.getAudioTracks(), ...cv.captureStream(1).getVideoTracks()]);
  };
  class FakeSR { constructor() { window.__sr = this; } start() { setTimeout(() => this.onstart && this.onstart(), 5); } stop() { this.onend && this.onend(); } }
  window.SpeechRecognition = FakeSR;
  window.__dizer = (texto) => { const ev = { resultIndex: 0, results: [Object.assign([{ transcript: texto }], { isFinal: true })] }; window.__sr.onresult(ev); };
  const synth = { speaking: false, getVoices: () => [], cancel() {}, speak(u) { window.__falado.push(u.text); setTimeout(() => u.onend && u.onend(), 30); }, set onvoiceschanged(f) {} };
  Object.defineProperty(window, 'speechSynthesis', { get: () => synth });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (/youtube\.com\/iframe_api/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }); return r.abort(); });
await page.addInitScript(INIT);
let pass = 0; const ok = (n) => { pass++; console.log('OK  ', n); };
const yt = () => page.evaluate(() => window.__yt);
const esperar = async (fn, arg) => { try { await page.waitForFunction(fn, arg, { timeout: 8000 }); } catch (e) { console.log('DBG', JSON.stringify(await page.evaluate(() => ({ estado: document.getElementById('estado').textContent, ouvi: document.getElementById('ouvi').textContent, log: [...document.querySelectorAll('.msg')].map((x) => x.textContent), yt: window.__yt, falado: window.__falado, sr: !!window.__sr, capa: document.getElementById('capa').hidden }))), erros); throw e; } };

await page.goto(base);
await page.waitForSelector('#pinForm:not([hidden])');
await page.fill('#pin', '0000'); await page.click('#pinForm button');
await esperar(() => /PIN incorreto/.test(document.getElementById('pinErro').textContent));
await page.fill('#pin', '4321'); await page.click('#pinForm button');
await page.waitForSelector('#ativar:not([hidden])');
ok('PIN: errado é recusado, certo libera');

await page.click('#ativar');
await esperar(() => window.__sr && document.getElementById('capa').hidden && window.__falado.includes('Sistemas online. O que deseja?'));
await esperar(() => !document.body.classList.contains('falando')); await page.waitForTimeout(800);
ok('um toque em "Ativar": microfone escutando e J.A.R.V.I.S. fala');

await page.evaluate(() => window.__dizer('Jarvis, toca Evidências ok'));
await esperar(() => window.__yt && window.__yt.criados.length === 1 && window.__yt.log.includes('play'));
let y = await yt();
assert.deepEqual(y.criados, ['aaa111']);
assert.equal(await page.isVisible('#ytframe'), true, 'o player está DENTRO da página');
assert.equal(await page.locator('#lista li').count(), 3);
ok('"Jarvis, toca Evidências ok" → o vídeo toca dentro da página, sem nenhum toque');

await page.evaluate(() => window.__dizer('pausa'));
await page.waitForTimeout(1600);
assert.ok(!(await yt()).log.includes('pause'), 'sem "Jarvis", com vídeo tocando, ignora (é o som do vídeo)');
await page.evaluate(() => window.__dizer('Jarvis, pausa'));
await esperar(() => window.__yt.log.includes('pause'));
ok('com vídeo tocando, só obedece quando começa com "Jarvis"');

await page.evaluate(() => window.__dizer('Jarvis, continua'));
await esperar(() => window.__yt.log.filter((x) => x === 'play').length >= 2);
await page.evaluate(() => window.__dizer('Jarvis, próxima ok'));
await esperar(() => window.__yt.log.includes('load:bbb222'));
await page.evaluate(() => window.__dizer('Jarvis abre o 3'));
await esperar(() => window.__yt.log.includes('load:ccc333'));
await page.evaluate(() => window.__dizer('Jarvis, volume 30'));
await esperar(() => window.__yt.log.includes('vol:30'));
assert.equal(await page.locator('#lista li.atual .t').evaluate((e) => e.firstChild.textContent), 'Fio de Cabelo');
ok('continua, próxima, "abre o 3" e volume por voz');

await page.evaluate(() => { window.__yt.p.o.events.onStateChange({ data: 0 }); });
await page.waitForTimeout(300);
ok('fim do vídeo: segue a lista (último → para)');

// ---------- Transcrição no próprio aparelho ----------
assert.equal(await page.evaluate(() => window.__capturas), 1, 'o mesmo toque de "Ativar" pediu para compartilhar o som da aba');
const op = await page.evaluate(() => window.__opcoesCaptura);
assert.equal(op.preferCurrentTab, true); assert.equal(op.audio.echoCancellation, false);
const antes = await page.$$eval('#transLinhas li:not(.desc)', (ls) => ls.length);
await page.evaluate(() => window.__dizer('Jarvis, continua'));
await esperar(() => document.body.classList.contains('tocando'));
await esperar((n) => document.querySelectorAll('#transLinhas li:not(.desc)').length >= n + 1, antes);
const linhas = await page.$$eval('#transLinhas li:not(.desc)', (ls) => ls.map((l) => l.textContent));
assert.ok(linhas.every((l) => /^\d+:\d{2}Linha cantada \d\.$/.test(l)), 'linhas com o tempo do vídeo: ' + linhas.join(' | '));
assert.ok(!linhas.some((l) => /Amara/.test(l)), 'frase inventada pelo Whisper foi descartada');
assert.equal(await page.isVisible('#trans'), true);
ok('música tocando → o próprio aparelho grava o som da aba e escreve a letra com os tempos (sem outro aparelho)');

await page.evaluate(() => window.__dizer('Jarvis, descreve a música'));
await esperar(() => window.__falado.includes('É uma balada romântica sertaneja sobre um amor que não acabou.'));
assert.match(pedidoDescricao, /Fio de Cabelo/); assert.match(pedidoDescricao, /Linha cantada/);
assert.equal(await page.locator('#transLinhas li.desc').last().textContent(), '✨É uma balada romântica sertaneja sobre um amor que não acabou.');
await esperar(() => !document.body.classList.contains('falando')); await page.waitForTimeout(800);
ok('"Jarvis, descreve a música": usa o título + a letra transcrita, mostra e fala a descrição');

await page.evaluate(() => window.__dizer('Jarvis, para de escrever'));
await esperar(() => document.getElementById('bTrans').getAttribute('aria-pressed') === 'false');
const n1 = nTrans; await page.waitForTimeout(2500);
assert.ok(nTrans <= n1 + 1, 'parou de enviar áudio');
await page.evaluate(() => window.__dizer('Jarvis, escreve a letra'));
await esperar(() => document.getElementById('bTrans').getAttribute('aria-pressed') === 'true');
assert.equal(await page.evaluate(() => window.__capturas), 1, 'retomou sem pedir para compartilhar de novo');
ok('"para de escrever" e "escreve a letra" por voz');

await page.click('#bCC');
await esperar(() => window.__yt.log.includes('unload-mod:captions'));
await page.click('#transLinhas li:not(.desc) .ts');
await esperar(() => window.__yt.log.some((x) => x.startsWith('seek:')));
ok('botão CC liga/desliga legendas do YouTube; tocar no tempo volta o vídeo àquele ponto');

await page.evaluate(() => window.__dizer('Jarvis, para'));
await esperar(() => window.__yt.log.includes('stop'));
assert.equal(await page.isVisible('#playerWrap'), false);
await page.evaluate(() => window.__dizer('Bom dia Jarvis, tudo bem?'));
await esperar(() => window.__falado.includes('Bom dia, senhor. Em que posso ajudar?'));
await esperar(() => !document.body.classList.contains('falando')); await page.waitForTimeout(800);
ok('conversa normal: responde pela IA e fala a resposta');

await page.fill('#txt', 'coloca um vídeo de ação no YouTube'); await page.press('#txt', 'Enter');
await esperar(() => window.__yt.log.filter((x) => x === 'load:aaa111').length >= 1);
ok('digitando também funciona (coloca um vídeo de ação → toca o primeiro)');

// Celular: sem captura de som da aba → legendas do YouTube, sem erro
const cel = await browser.newPage({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', viewport: { width: 390, height: 844 } });
cel.on('pageerror', (e) => erros.push('celular: ' + e));
await cel.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (/iframe_api/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }); return r.abort(); });
await cel.addInitScript(INIT);
await cel.context().addCookies((await page.context().cookies()).map((c) => ({ ...c })));
await cel.goto(base);
await cel.waitForSelector('#ativar:not([hidden])');
assert.equal(await cel.isVisible('#opTrans'), false, 'no celular não oferece a captura');
await cel.click('#ativar');
assert.equal(await cel.evaluate(() => window.__capturas), 0);
await cel.fill('#txt', 'toca Evidências'); await cel.press('#txt', 'Enter');
await cel.waitForFunction(() => window.__yt && window.__yt.criados.length === 1);
await cel.click('#bTrans');
await cel.waitForFunction(() => /legendas do YouTube \(CC\)/.test(document.getElementById('log').textContent));
assert.equal(await cel.getAttribute('#bCC', 'aria-pressed'), 'true');
assert.deepEqual((await cel.evaluate(() => window.__yt.p.o.playerVars)).cc_load_policy, 1);
await cel.screenshot({ path: new URL('./tela-celular.png', import.meta.url).pathname, fullPage: true });
ok('celular: avisa com clareza e usa as legendas do YouTube no player');

assert.deepEqual(erros, []); ok('nenhum erro de JavaScript');
await page.screenshot({ path: new URL('./tela.png', import.meta.url).pathname });
console.log(`\n${pass} testes aprovados, 0 falhas`);
await browser.close(); srv.close(); mock.close();
