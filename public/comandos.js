// Interpreta o que foi dito ou digitado. Sem dependências; roda no navegador e nos testes (Node).
(function (raiz) {
  'use strict';
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ORD = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6, setimo: 7, setima: 7, oitavo: 8, oitava: 8, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8 };
  const WAKE = /^(?:(?:ei|ok|oi|ola|e ai|fala)\s+)?(?:jarvis|jarves|jarvys|jarbas|javis|garvis|j a r v i s)\b[\s,.!?]*/;
  const FIM = /[\s,.!?]*\b(?:ok|okay|okey|oquei|o\.k|finalizar|finaliza|pronto|cambio|enviar|envia)[\s.!?]*$/;

  /** Tira "Jarvis" do começo e "ok" do fim. chamou = começou com o nome. */
  function limparFala(texto) {
    let t = semAcento(texto).replace(/\s+/g, ' ').trim();
    const chamou = WAKE.test(t);
    t = t.replace(WAKE, '').replace(FIM, '').replace(/^[\s,]+|[\s,]+$/g, '');
    return { texto: t, chamou, terminouComOk: FIM.test(semAcento(texto).trim()) };
  }

  const VERBO = /^(?:por favor\s+)?(?:coloca|coloque|colocar|bota|bote|botar|toca|toque|tocar|abre|abra|abrir|passa|passe|poe|ponha|quero ouvir|quero ver|quero assistir|queria ouvir|queria ver|me mostra|mostra|mostre|procura|procure|pesquisa|pesquise|busca|busque|acha|ache|assistir|assiste|ouvir|escutar|reproduz|reproduza|play|roda|rode)\b\s*/;
  const MIDIA = /\b(youtube|videos?|clipes?|trailers?|musicas?|cancao|cancoes|som|playlist|filmes?|series?|episodios?|novelas?|desenhos?|documentarios?|lives?|show|hino|album|podcast)\b/;
  const MUSICA = /\b(musicas?|cancao|cancoes|som|playlist|album|hino|cantor|cantora|banda|funk|sertanejo|pagode|samba|rock|rap|trap|forro|gospel|mpb|pop|eletronica|lofi|lo-fi)\b/;

  function numero(p) { if (/^\d{1,2}$/.test(p)) return +p; return ORD[p] || null; }

  /**
   * estado: { temLista: bool, tocando: bool }
   * Retorna { tipo, ... }: tocar | escolher | pausar | continuar | proximo | anterior | volume | mudo | som | parar | conversa | vazio
   */
  function interpretar(texto, estado = {}) {
    const { texto: t } = limparFala(texto);
    if (!t) return { tipo: 'vazio' };

    if (/^(?:pausa|pausar|pause|da (?:um )?pause|espera|segura)$/.test(t)) return { tipo: 'pausar' };
    if (/^(?:para|parar|pare|chega|fecha(?: o video)?|fechar(?: o video)?|desliga(?: o video| a musica)?)$/.test(t)) return { tipo: 'parar' };
    if (/^(?:continua|continuar|continue|volta a tocar|play|despausa|retoma|retomar|toca|tocar)$/.test(t)) return { tipo: 'continuar' };
    if (/^(?:proxim[oa]|pula|pular|passa|avanca|outr[oa]|muda(?: de)? (?:musica|video)|next)(?: (?:musica|video))?$/.test(t)) return { tipo: 'proximo' };
    if (/^(?:anterior|volta(?: um| uma)?|voltar|a de antes|o de antes)(?: (?:musica|video))?$/.test(t)) return { tipo: 'anterior' };
    if (/^(?:mudo|muta|silencia|sem som)$/.test(t)) return { tipo: 'mudo' };
    if (/^(?:tira o mudo|com som|desmuta|liga o som)$/.test(t)) return { tipo: 'som' };

    if (/^(?:escreve|escrever|escreva|transcreve|transcrever|transcreva|mostra|mostrar|liga)\s+(?:a\s+)?(?:letra|transcricao|legenda)(?:\s+(?:da|do)\s+(?:musica|video))?$|^(?:transcreve|transcreva|transcrever)(?: (?:a|o) (?:musica|video))?$/.test(t)) return { tipo: 'transcrever' };
    if (/^(?:para|parar|pare|desliga|desligar)\s+(?:de\s+)?(?:a\s+)?(?:escrever|transcrever|transcricao|letra)(?:\s+(?:a\s+)?letra)?$/.test(t)) return { tipo: 'parar_transcricao' };
    if (/^(?:descreve|descrever|descreva|explica|explicar|explique|fala sobre|me fala (?:sobre|da))\s+(?:a|o|essa|esse|esta|este)?\s*(?:musica|video|cancao|letra)(?:\s+que (?:esta|ta) tocando)?$/.test(t)) return { tipo: 'descrever' };
    let m;
    if ((m = /^(?:aumenta|aumentar|sobe|subir|mais alto)(?: o)?(?: volume| som)?$/.exec(t))) return { tipo: 'volume', delta: +20 };
    if ((m = /^(?:diminui|diminuir|abaixa|abaixar|baixa|desce|mais baixo)(?: o)?(?: volume| som)?$/.exec(t))) return { tipo: 'volume', delta: -20 };
    if ((m = /^(?:volume|som)(?: (?:no|em|para|pra))? (\d{1,3})(?: por cento|%)?$/.exec(t))) return { tipo: 'volume', valor: Math.max(0, Math.min(100, +m[1])) };
    if (/^volume (?:maximo|no maximo|alto)$/.test(t)) return { tipo: 'volume', valor: 100 };
    if (/^volume (?:baixo|minimo)$/.test(t)) return { tipo: 'volume', valor: 20 };

    if (estado.temLista && (m = /^(?:abre|abra|abrir|toca|toque|tocar|coloca|coloque|bota|poe|play|quero|escolhe|seleciona|clica|clique|assistir|assiste|passa)?\s*(?:n?[oa]s?\s+|em\s+)?(?:o\s+|a\s+)?(?:video|musica|numero|opcao|item|link|faixa)?\s*(?:numero\s+)?(\d{1,2}|[a-z]+)(?:\s+(?:video|musica|opcao|faixa))?$/.exec(t))) {
      const n = numero(m[1]);
      if (n) return { tipo: 'escolher', n };
    }

    if (VERBO.test(t) && (MIDIA.test(t) || MUSICA.test(t) || estado.tocando || /^(?:toca|toque|tocar|coloca|coloque|bota|poe|ouvir|escutar|quero ouvir|queria ouvir)\b/.test(t))) {
      let termo = t.replace(VERBO, '');
      termo = termo.replace(/\b(?:no|na|do|da|pelo|pela|em)\s+(?:o\s+)?youtube\b/g, ' ').replace(/\byoutube\b/g, ' ');
      termo = termo.replace(/^(?:pra mim|para mim|ai|um|uma|o|a|os|as|algum|alguma|uns|umas)\s+/, '').replace(/\s+(?:pra mim|para mim|ai|por favor)$/, '');
      termo = termo.replace(/^(?:um|uma|o|a)\s+/, '').replace(/\s+/g, ' ').trim();
      if (termo) return { tipo: 'tocar', termo, musica: MUSICA.test(t) };
    }
    return { tipo: 'conversa', texto: String(texto).trim() };
  }

  const api = { interpretar, limparFala, semAcento };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Comandos = api;
})(typeof window !== 'undefined' ? window : globalThis);
