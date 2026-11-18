const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../public/comandos.js'), 'utf8'), ctx);
const plano = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));
const interpretar = plano(ctx.window.Comandos.interpretar), limparFala = plano(ctx.window.Comandos.limparFala);

test('limparFala tira o nome e o "ok"', () => {
  assert.deepEqual(limparFala('Jarvis, coloca um vídeo de ação no YouTube ok'), { texto: 'coloca um video de acao no youtube', chamou: true, terminouComOk: true });
  assert.equal(limparFala('pausa').chamou, false);
});

test('tocar: extrai o termo e detecta música', () => {
  const casos = [
    ['Jarvis, coloca um vídeo de ação no YouTube ok', 'video de acao', false],
    ['toca a música Evidências do Chitãozinho e Xororó', 'musica evidencias do chitaozinho e xororo', true],
    ['Ei Jarvis, quero ouvir sertanejo', 'sertanejo', true],
    ['quero ver o trailer do novo filme do Batman', 'trailer do novo filme do batman', false],
    ['põe um filme de comédia dublado pra mim', 'filme de comedia dublado', false],
    ['bota um funk aí', 'funk', true],
    ['toca Legião Urbana', 'legiao urbana', false],
  ];
  for (const [frase, termo, musica] of casos) assert.deepEqual(interpretar(frase), { tipo: 'tocar', termo, musica }, frase);
});

test('controles do player', () => {
  assert.equal(interpretar('Jarvis, pausa').tipo, 'pausar');
  assert.equal(interpretar('continua ok').tipo, 'continuar');
  assert.equal(interpretar('próxima música').tipo, 'proximo');
  assert.equal(interpretar('pula').tipo, 'proximo');
  assert.equal(interpretar('anterior').tipo, 'anterior');
  assert.equal(interpretar('para').tipo, 'parar');
  assert.equal(interpretar('fecha o vídeo').tipo, 'parar');
  assert.deepEqual(interpretar('aumenta o volume'), { tipo: 'volume', delta: 20 });
  assert.deepEqual(interpretar('abaixa o som'), { tipo: 'volume', delta: -20 });
  assert.deepEqual(interpretar('volume 50'), { tipo: 'volume', valor: 50 });
  assert.deepEqual(interpretar('volume 300'), { tipo: 'volume', valor: 100 });
  assert.equal(interpretar('mudo').tipo, 'mudo');
});

test('escolher da lista só quando há lista', () => {
  assert.deepEqual(interpretar('abre o 2', { temLista: true }), { tipo: 'escolher', n: 2 });
  assert.deepEqual(interpretar('toca o terceiro', { temLista: true }), { tipo: 'escolher', n: 3 });
  assert.deepEqual(interpretar('clica no segundo vídeo', { temLista: true }), { tipo: 'escolher', n: 2 });
  assert.deepEqual(interpretar('5', { temLista: true }), { tipo: 'escolher', n: 5 });
  assert.equal(interpretar('abre o 2').tipo, 'conversa');
});

test('o resto vira conversa com a IA', () => {
  assert.equal(interpretar('Qual a capital da França?').tipo, 'conversa');
  assert.equal(interpretar('Bom dia Jarvis').tipo, 'conversa');
  assert.equal(interpretar('faça um resumo do vídeo').tipo, 'conversa');
  assert.equal(interpretar('ok').tipo, 'vazio');
});

test('transcrição e descrição por voz', () => {
  assert.equal(interpretar('Jarvis, escreve a letra').tipo, 'transcrever');
  assert.equal(interpretar('transcreve a música ok').tipo, 'transcrever');
  assert.equal(interpretar('mostra a letra da música').tipo, 'transcrever');
  assert.equal(interpretar('para de escrever').tipo, 'parar_transcricao');
  assert.equal(interpretar('Jarvis, descreve a música').tipo, 'descrever');
  assert.equal(interpretar('explica essa música que está tocando').tipo, 'descrever');
  assert.equal(interpretar('para').tipo, 'parar');
});
