(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { interpretar, limparFala } = window.Comandos;
  const S = {
    lista: [], atual: -1, player: null, ytPronto: null, tocando: false, pausado: false, volume: 80,
    historico: [], micLigado: false, ouvindo: false, falando: false, ignorarAte: 0,
    buffer: '', timerSilencio: 0, ativo: false, ocupado: false, cc: true, sessao: {},
  };

  // ---------- UI ----------
  function chip(id, cls) { const c = $(id); c.classList.remove('on', 'ouvindo', 'ruim'); if (cls) c.classList.add(cls); }
  function estado(t) { $('estado').textContent = t; }
  function msg(tipo, texto) { const d = document.createElement('div'); d.className = 'msg ' + tipo; d.textContent = texto; $('log').append(d); $('log').scrollTop = $('log').scrollHeight; return d; }
  function corpo() { document.body.classList.toggle('ouvindo', S.ouvindo && !S.falando); document.body.classList.toggle('falando', S.falando); document.body.classList.toggle('tocando', S.tocando); if (S.ativo) transUI(); }

  async function api(caminho, opts) {
    const r = await fetch(caminho, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...(opts && opts.headers) } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && caminho !== '/api/login') { mostrarPin(); throw new Error('faça login com o PIN'); }
    if (!r.ok) throw new Error(j.error || `erro ${r.status}`);
    return j;
  }

  // ---------- Voz (fala) ----------
  let vozPt = null;
  function escolherVoz() { const vs = window.speechSynthesis ? speechSynthesis.getVoices() : []; vozPt = vs.find((v) => /pt[-_]BR/i.test(v.lang) && /google|luciana|francisca|antonio|natural/i.test(v.name)) || vs.find((v) => /pt[-_]BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null; }
  if (window.speechSynthesis) { escolherVoz(); speechSynthesis.onvoiceschanged = escolherVoz; }
  function falar(texto) {
    return new Promise((ok) => {
      if (!window.speechSynthesis || !texto) return ok();
      const u = new SpeechSynthesisUtterance(texto.replace(/[*_#`>]/g, '').slice(0, 600));
      u.lang = 'pt-BR'; if (vozPt) u.voice = vozPt; u.rate = 1.05;
      const fim = () => { S.falando = false; S.ignorarAte = Date.now() + 700; if (S.tocando && S.player && !S.pausado) try { S.player.setVolume(S.volume); } catch {} corpo(); ok(); };
      u.onend = fim; u.onerror = fim;
      S.falando = true; corpo();
      if (S.tocando && S.player) try { S.player.setVolume(Math.min(S.volume, 15)); } catch {}
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    });
  }

  // ---------- YouTube ----------
  function carregarYT() {
    if (S.ytPronto) return S.ytPronto;
    S.ytPronto = new Promise((ok, falha) => {
      if (window.YT && window.YT.Player) return ok();
      window.onYouTubeIframeAPIReady = () => ok();
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { S.ytPronto = null; falha(new Error('não consegui carregar o player do YouTube')); };
      document.head.append(s);
    });
    return S.ytPronto;
  }
  async function tocarIndice(i) {
    const v = S.lista[i]; if (!v) return false;
    await carregarYT();
    $('playerWrap').hidden = false; $('controles').hidden = false;
    S.atual = i; S.tocando = true; S.pausado = false; corpo(); marcarAtual();
    if (!S.player) {
      await new Promise((ok) => {
        S.player = new YT.Player('player', {
          videoId: v.id, playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: S.cc ? 1 : 0, cc_lang_pref: 'pt', hl: 'pt' },
          events: {
            onReady: (e) => { try { e.target.setVolume(S.volume); e.target.playVideo(); } catch {} ok(); },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) proximo(true);
              else if (e.data === YT.PlayerState.PAUSED) { S.pausado = true; estado('PAUSADO'); corpo(); }
              else if (e.data === YT.PlayerState.PLAYING) { S.pausado = false; S.tocando = true; $('playerWrap').hidden = false; $('controles').hidden = false; corpo(); estado('TOCANDO'); }
            },
            onError: () => { msg('s', `Este vídeo não pode tocar fora do YouTube. Passando para o próximo.`); proximo(true); },
          },
        });
      });
    } else { S.player.loadVideoById(v.id); try { S.player.setVolume(S.volume); } catch {} }
    estado('TOCANDO'); $('ouvi').textContent = '▶ ' + v.titulo;
    if (T.ativo || T.linhas.length) { T.linhas.push({ t: 0, texto: '— ' + v.titulo + ' —', cls: 'desc' }); const li = document.createElement('li'); li.className = 'desc'; li.textContent = '▶ ' + v.titulo; $('transLinhas').append(li); }
    return true;
  }
  function marcarAtual() { [...$('lista').children].forEach((li, i) => li.classList.toggle('atual', i === S.atual)); }
  function mostrarLista() {
    const ol = $('lista'); ol.textContent = '';
    S.lista.forEach((v, i) => {
      const li = document.createElement('li'); li.tabIndex = 0; li.setAttribute('aria-label', `Tocar ${v.titulo}`);
      const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; if (v.thumb) img.src = v.thumb;
      const t = document.createElement('span'); t.className = 't'; t.textContent = v.titulo; const c = document.createElement('span'); c.className = 'c'; c.textContent = v.canal; t.append(c);
      li.append(n, img, t); li.onclick = () => tocarIndice(i); li.onkeydown = (e) => { if (e.key === 'Enter') tocarIndice(i); };
      ol.append(li);
    });
    marcarAtual();
  }
  function proximo(auto) { if (S.atual + 1 < S.lista.length) return tocarIndice(S.atual + 1); if (!auto) msg('s', 'Esse era o último da lista.'); else { S.tocando = false; estado('FIM DA LISTA'); corpo(); } }
  function anterior() { if (S.atual > 0) return tocarIndice(S.atual - 1); msg('s', 'Esse é o primeiro da lista.'); }
  function parar() { try { S.player && S.player.stopVideo(); } catch {} S.tocando = false; S.pausado = false; $('playerWrap').hidden = true; $('controles').hidden = true; estado('AGUARDANDO'); $('ouvi').textContent = ''; corpo(); }
  function volume(c) { S.volume = c.valor != null ? c.valor : Math.max(0, Math.min(100, S.volume + c.delta)); try { S.player && S.player.setVolume(S.volume); S.player && S.player.unMute(); } catch {} msg('s', `Volume ${S.volume}%.`); }


  // ---------- Transcrição do que está tocando (o próprio aparelho grava o som da aba) ----------
  const T = { stream: null, ativo: false, rec: null, timer: 0, fila: Promise.resolve(), linhas: [], cicloMs: window.__CICLO_MS || 10000 };
  const podeCapturar = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder) && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const posVideo = () => { try { return S.player ? S.player.getCurrentTime() : 0; } catch { return 0; } };
  function transUI() {
    $('trans').hidden = !T.ativo && !T.linhas.length;
    $('bTrans').setAttribute('aria-pressed', String(T.ativo));
    $('transSt').textContent = T.ativo ? (S.tocando && !S.pausado ? '● escrevendo' : 'esperando a música tocar') : (T.stream ? 'pausado' : '');
  }
  function ligarCC(on) {
    S.cc = on; $('bCC').setAttribute('aria-pressed', String(on));
    if (!S.player) return;
    try { if (on) { S.player.loadModule('captions'); S.player.setOption('captions', 'track', { languageCode: 'pt' }); } else S.player.unloadModule('captions'); } catch {}
  }
  /** Precisa vir de um toque (o navegador exige um gesto para compartilhar o som da aba). */
  async function ligarTranscricao() {
    if (T.stream) { T.ativo = true; ciclo(); transUI(); msg('s', '📝 Voltei a escrever a letra.'); return true; }
    if (!podeCapturar) { ligarCC(true); msg('s', 'Neste aparelho o navegador não deixa a página ouvir o próprio som. Liguei as legendas do YouTube (CC) no player. A letra escrita aqui funciona no Chrome ou Edge do computador.'); return false; }
    if (!S.sessao.transcricao) { msg('s', 'O servidor está sem chave de transcrição (GROQ_API_KEY ou OPENAI_API_KEY).'); return false; }
    let st;
    try {
      st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include' });
    } catch (e) { msg('s', e && e.name === 'NotAllowedError' ? 'Compartilhamento cancelado. Toque em 📝 Escrever letra quando quiser.' : 'Não consegui capturar o som: ' + ((e && e.message) || e)); return false; }
    if (!st.getAudioTracks().length) { st.getTracks().forEach((t) => t.stop()); msg('s', 'O som não foi compartilhado. Toque de novo em 📝 e marque "Compartilhar áudio da aba".'); return false; }
    st.getVideoTracks().forEach((t) => t.stop()); // só o som interessa
    T.stream = st; T.ativo = true;
    st.getAudioTracks()[0].addEventListener('ended', () => { T.ativo = false; T.stream = null; clearTimeout(T.timer); transUI(); msg('s', 'O compartilhamento do som foi encerrado.'); });
    ciclo(); transUI(); msg('s', '📝 Escrevendo a letra do que tocar. Não precisa de outro aparelho.');
    return true;
  }
  function pausarTranscricao() { T.ativo = false; clearTimeout(T.timer); try { T.rec && T.rec.state !== 'inactive' && T.rec.stop(); } catch {} transUI(); }
  /** Grava trechos completos de ~10 s (para e recomeça o gravador, para cada arquivo ser válido) e envia em ordem. */
  function ciclo() {
    clearTimeout(T.timer);
    if (!T.ativo || !T.stream) return;
    const tocando = S.tocando && !S.pausado;
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    let rec;
    try { rec = new MediaRecorder(new MediaStream(T.stream.getAudioTracks()), tipo ? { mimeType: tipo, audioBitsPerSecond: 48000 } : undefined); }
    catch (e) { pausarTranscricao(); msg('s', 'Este navegador não grava áudio: ' + e.message); return; }
    const partes = [], t0 = posVideo(), atual = S.lista[S.atual];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      if (tocando && partes.length) enviar(new Blob(partes, { type: (rec.mimeType || tipo || 'audio/webm').split(';')[0] }), t0, atual ? atual.titulo : '');
      if (T.ativo) ciclo();
    };
    T.rec = rec; rec.start();
    T.timer = setTimeout(() => { try { rec.state !== 'inactive' && rec.stop(); } catch {} }, T.cicloMs);
    transUI();
  }
  function enviar(blob, t0, titulo) {
    T.fila = T.fila.then(async () => {
      const ctx = (titulo ? `Música: ${titulo}. ` : '') + T.linhas.slice(-3).map((l) => l.texto).join(' ');
      const r = await fetch('/api/transcrever?contexto=' + encodeURIComponent(ctx.slice(-500)), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'erro ' + r.status);
      if (j.texto) linha(t0, j.texto);
    }).catch((e) => { $('transSt').textContent = 'falha: ' + e.message; });
  }
  function linha(t, texto, cls) {
    T.linhas.push({ t, texto, cls });
    const li = document.createElement('li'); if (cls) li.className = cls;
    const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = cls ? '✨' : fmt(t);
    if (!cls) { ts.title = 'Ir para este ponto'; ts.onclick = () => { try { S.player.seekTo(t, true); } catch {} }; }
    const tx = document.createElement('span'); tx.textContent = texto;
    li.append(ts, tx); $('transLinhas').append(li); $('transLinhas').scrollTop = $('transLinhas').scrollHeight; transUI();
  }
  async function descreverMusica() {
    const v = S.lista[S.atual];
    if (!v) { msg('s', 'Nada tocando agora.'); return; }
    const letra = T.linhas.filter((l) => !l.cls).map((l) => l.texto).join(' ').slice(-3000);
    const pedido = `Descreva a música que está tocando: "${v.titulo}" (canal ${v.canal}). Diga o tema, o estilo e o sentimento${letra ? ' e o que a letra diz, com base neste trecho transcrito: ' + letra : ''}. Em até 4 frases curtas.`;
    $('trans').hidden = false; estado('PENSANDO');
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: pedido }] }) });
    const resp = r.texto || 'Não consegui descrever agora.';
    linha(posVideo(), resp, 'desc'); estado(S.tocando ? 'TOCANDO' : 'AGUARDANDO');
    await falar(resp);
  }
  $('bTrans').onclick = () => (T.ativo ? (pausarTranscricao(), msg('s', '📝 Parei de escrever.')) : ligarTranscricao());
  $('bCC').onclick = () => ligarCC(!S.cc);
  $('tDesc').onclick = () => descreverMusica().catch((e) => msg('s', 'Não consegui: ' + e.message));
  $('tCopiar').onclick = async () => { try { await navigator.clipboard.writeText(T.linhas.map((l) => (l.cls ? '' : `[${fmt(l.t)}] `) + l.texto).join('\n')); msg('s', 'Letra copiada.'); } catch { msg('s', 'Não consegui copiar.'); } };
  $('tBaixar').onclick = () => { const v = S.lista[S.atual]; const txt = (v ? v.titulo + '\n\n' : '') + T.linhas.map((l) => (l.cls ? '' : `[${fmt(l.t)}] `) + l.texto).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); a.download = ((v && v.titulo) || 'letra').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('tLimpar').onclick = () => { T.linhas = []; $('transLinhas').textContent = ''; transUI(); };

  // ---------- Execução de um comando ----------
  async function processar(texto, origem) {
    texto = String(texto || '').trim(); if (!texto || S.ocupado) return;
    const c = interpretar(texto, { temLista: S.lista.length > 0, tocando: S.tocando });
    if (c.tipo === 'vazio') return;
    msg('u', texto);
    try {
      switch (c.tipo) {
        case 'tocar': {
          S.ocupado = true; estado('PROCURANDO NO YOUTUBE'); $('ouvi').textContent = `Procurando "${c.termo}"…`;
          const r = await api(`/api/youtube?q=${encodeURIComponent(c.termo)}${c.musica ? '&musica=1' : ''}`);
          S.lista = r.videos || []; mostrarLista();
          if (!S.lista.length) { msg('s', `Não achei nada para "${c.termo}".`); await falar('Não achei nada com esse nome.'); estado('AGUARDANDO'); break; }
          await tocarIndice(0);
          msg('s', `▶ Tocando: ${S.lista[0].titulo}. Diga "próxima" ou "abre o 2" para trocar.`);
          break;
        }
        case 'escolher': if (!(await tocarIndice(c.n - 1))) msg('s', `Não há o número ${c.n} na lista.`); break;
        case 'pausar': try { S.player.pauseVideo(); } catch {} break;
        case 'continuar': if (S.player) try { S.player.playVideo(); } catch {} else msg('s', 'Nada tocando. Diga "toca" e o nome.'); break;
        case 'proximo': await proximo(false); break;
        case 'anterior': await anterior(); break;
        case 'parar': parar(); break;
        case 'volume': volume(c); break;
        case 'mudo': try { S.player.mute(); } catch {} break;
        case 'som': try { S.player.unMute(); } catch {} break;
        case 'transcrever':
          if (T.stream || origem !== 'voz') await ligarTranscricao();
          else { msg('s', 'Toque uma vez em 📝 Escrever letra: o navegador exige um toque para compartilhar o som. Depois, por voz, "escreve a letra" e "para de escrever" funcionam.'); await falar('Toque uma vez em escrever letra.'); }
          break;
        case 'parar_transcricao': pausarTranscricao(); msg('s', '📝 Parei de escrever.'); break;
        case 'descrever': await descreverMusica(); break;
        default: {
          S.ocupado = true; estado('PENSANDO');
          S.historico.push({ role: 'user', content: texto });
          const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ messages: S.historico.slice(-12) }) });
          const resp = r.texto || 'Pronto.'; S.historico.push({ role: 'assistant', content: resp });
          msg('j', resp); estado(S.tocando ? 'TOCANDO' : 'AGUARDANDO');
          await falar(resp);
        }
      }
    } catch (e) {
      msg('s', 'Não consegui: ' + e.message);
      if (origem === 'voz') await falar('Não consegui fazer isso agora.');
      estado(S.tocando ? 'TOCANDO' : 'AGUARDANDO');
    } finally { S.ocupado = false; if (!S.tocando && $('estado').textContent.startsWith('PROCURANDO')) estado('AGUARDANDO'); }
  }

  // ---------- Microfone (escuta contínua) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function iniciarEscuta() {
    if (!SR) { chip('chipVoz', 'ruim'); $('mic').hidden = true; msg('s', 'Este navegador não ouve continuamente. Use o Chrome (computador ou Android). No iPhone, use o microfone do teclado e toque em Enviar.'); return; }
    if (rec) return;
    rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => { S.ouvindo = true; chip('chipVoz', 'ouvindo'); corpo(); };
    rec.onend = () => { S.ouvindo = false; rec = null; corpo(); if (S.micLigado) setTimeout(iniciarEscuta, 250); else chip('chipVoz', 'on'); };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.micLigado = false; $('mic').classList.remove('on'); chip('chipVoz', 'ruim'); msg('s', 'Microfone bloqueado. Libere o microfone para este site nas configurações do navegador.'); } };
    rec.onresult = (e) => {
      if (S.falando || Date.now() < S.ignorarAte) return;
      let parcial = ''; let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript + ' '; else parcial += r[0].transcript; }
      const visto = (S.buffer + ' ' + final + parcial).trim();
      $('ouvi').textContent = visto ? '“' + visto + '”' : '';
      // Com vídeo tocando, ao ouvir "Jarvis" abaixa o volume para entender melhor.
      if (S.tocando && !S.pausado && S.player && limparFala(visto).chamou) try { S.player.setVolume(Math.min(S.volume, 15)); } catch {}
      if (final) {
        // Um novo "Jarvis" começa outro comando: executa o anterior antes de juntar.
        if (S.buffer && limparFala(final).chamou) fecharFala();
        S.buffer = (S.buffer + ' ' + final).trim();
        clearTimeout(S.timerSilencio);
        if (limparFala(S.buffer).terminouComOk) fecharFala(); else S.timerSilencio = setTimeout(fecharFala, 1400);
      }
    };
    try { rec.start(); } catch {}
  }
  function fecharFala() {
    clearTimeout(S.timerSilencio);
    const dito = S.buffer.trim(); S.buffer = '';
    if (!dito) return;
    const { chamou, texto } = limparFala(dito);
    if (S.tocando && !S.pausado && !chamou) { $('ouvi').textContent = ''; return; } // é o som do vídeo, não você
    if (S.tocando && S.player && !S.falando) try { S.player.setVolume(S.volume); } catch {}
    if (chamou && !texto) { falar('Pois não?'); return; }
    processar(dito, 'voz');
  }
  $('mic').onclick = () => {
    S.micLigado = !S.micLigado; $('mic').classList.toggle('on', S.micLigado);
    if (S.micLigado) iniciarEscuta(); else { try { rec && rec.stop(); } catch {} chip('chipVoz', SR ? 'on' : 'ruim'); }
  };

  // ---------- Entrada por texto e botões ----------
  $('form').onsubmit = (e) => { e.preventDefault(); const v = $('txt').value; $('txt').value = ''; processar(v, 'texto'); };
  $('bAnt').onclick = () => anterior();
  $('bProx').onclick = () => proximo(false);
  $('bParar').onclick = () => parar();
  $('bPlay').onclick = () => { if (!S.player) return; S.pausado ? S.player.playVideo() : S.player.pauseVideo(); };

  // ---------- Entrada: PIN e ativação (o toque libera som e microfone) ----------
  function mostrarPin() { $('capa').hidden = false; $('pinForm').hidden = false; $('ativar').hidden = true; $('capaDica').hidden = true; $('opTrans').hidden = true; $('pin').focus(); }
  $('pinForm').onsubmit = async (e) => {
    e.preventDefault(); $('pinErro').textContent = '';
    try { await api('/api/login', { method: 'POST', body: JSON.stringify({ pin: $('pin').value }) }); $('pinForm').hidden = true; $('ativar').hidden = false; $('capaDica').hidden = false; $('opTrans').hidden = !(podeCapturar && S.sessao.transcricao); $('ativar').focus(); }
    catch (err) { $('pinErro').textContent = err.message; }
  };
  $('ativar').onclick = () => {
    if (podeCapturar && S.sessao.transcricao && $('cTrans').checked) ligarTranscricao(); // mesmo toque: pede para compartilhar o som da aba
    $('capa').hidden = true; S.ativo = true;
    if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    carregarYT().then(() => chip('chipYt', 'on')).catch(() => chip('chipYt', 'ruim'));
    if (SR) { S.micLigado = true; $('mic').classList.add('on'); iniciarEscuta(); } else iniciarEscuta();
    estado('AGUARDANDO');
    falar('Sistemas online. O que deseja?');
  };

  (async () => {
    try {
      const s = await fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json());
      S.sessao = s; $('opTrans').hidden = !(podeCapturar && s.transcricao);
      chip('chipIa', s.ia ? 'on' : 'ruim'); if (!s.youtube) { chip('chipYt', 'ruim'); msg('s', 'O servidor está sem YOUTUBE_API_KEY: vídeos e músicas não vão funcionar até configurar.'); }
      if (s.pin && !s.ok) mostrarPin(); else { $('ativar').hidden = false; $('ativar').focus(); }
      estado('TOQUE PARA ATIVAR');
    } catch { estado('SERVIDOR FORA DO AR'); }
    if (SR) chip('chipVoz', 'on');
  })();

  window.__jarvis = { S, processar, fecharFala }; // usado pelos testes
})();
