# J.A.R.V.I.S. hospedado (vídeo e música por voz)

Site próprio do J.A.R.V.I.S. em que **vídeos e músicas do YouTube tocam dentro da página**, por voz e sem toque. Você toca **uma vez** em "Ativar" ao abrir, o que libera o microfone e o som. Depois é só falar:

| Você diz | Ele faz |
| --- | --- |
| "Jarvis, toca Evidências, ok" | pesquisa e toca a primeira música dentro da página |
| "coloca um vídeo de ação no YouTube" | pesquisa e toca o primeiro vídeo |
| "Jarvis, pausa" / "continua" / "para" | pausa, continua, fecha |
| "Jarvis, próxima" / "anterior" / "abre o 3" | troca de vídeo na lista |
| "Jarvis, volume 50" / "aumenta o volume" / "mudo" | volume |
| qualquer outra frase | conversa com a IA (Groq, OpenAI ou Gemini) e responde falando |

| "Jarvis, escreve a letra" / "para de escrever" | escreve na tela o que está sendo cantado/falado no vídeo |
| "Jarvis, descreve a música" | explica tema, estilo e o que a letra diz, e fala a explicação |

Com um vídeo tocando, **comece com "Jarvis"**. Assim ele obedece você e não o som do vídeo. Ao ouvir "Jarvis", ele abaixa o volume para entender melhor. Quando um vídeo termina, ele passa para o próximo da lista.

## Letra ao vivo: o próprio aparelho escreve o que está tocando

Não precisa de outro aparelho perto do microfone:

1. A página grava o **som da própria aba** em trechos de 10 segundos.
2. Cada trecho vai para a transcrição (Whisper, pela sua chave da Groq ou da OpenAI).
3. A letra aparece no painel "📝 Letra / transcrição ao vivo" com o tempo do vídeo. Tocar no tempo volta o vídeo àquele ponto.

Detalhes:

- **Computador (Chrome ou Edge):** no primeiro toque em "Ativar", o navegador pergunta o que compartilhar. Escolha **"Esta aba"** e deixe marcado **"Compartilhar áudio da aba"**. É uma vez por visita. Depois, "escreve a letra" e "para de escrever" funcionam por voz.
- **Celular (Android e iPhone):** o navegador não deixa a página gravar o próprio som. No lugar, o J.A.R.V.I.S. liga as **legendas automáticas do YouTube** (botão CC) dentro do player.
- Só grava enquanto a música está tocando, e descarta as frases que o Whisper costuma inventar em trechos só instrumentais ("Legendas pela comunidade Amara.org" e parecidas).
- Os botões **Copiar** e **Baixar .txt** salvam a letra. **✨ Descrever a música** explica a música usando o título e o que foi transcrito.
- Custo: a Groq cobra por minuto de áudio transcrito, com valor baixo e limite gratuito diário. Confira no painel da Groq.

## Do que você precisa

1. **Chave da API do YouTube** (gratuita):
   1. Entre em https://console.cloud.google.com e crie um projeto.
   2. Vá em "APIs e serviços" → "Biblioteca", procure **YouTube Data API v3** e clique em **Ativar**.
   3. Vá em "APIs e serviços" → "Credenciais" → "Criar credenciais" → **Chave de API**.
   4. Em "Restringir chave", limite à YouTube Data API v3.
   5. A cota grátis dá cerca de **100 pesquisas por dia**. Buscas repetidas em 30 minutos vêm do cache e não gastam cota.
2. **Pelo menos um provedor de IA** (chave + modelo): Groq, OpenAI ou Gemini. São os mesmos que a plataforma já usa. Para a letra ao vivo, é preciso ter a chave da **Groq ou da OpenAI** (o Gemini não faz essa transcrição aqui).
3. **Um PIN** de acesso, para ninguém usar as suas chaves.

## Publicar no Render (recomendado)

1. Suba esta pasta para um repositório no GitHub.
2. No Render: **New → Blueprint** e escolha o repositório. Ele lê o `render.yaml`.
3. Preencha `APP_PIN`, `YOUTUBE_API_KEY` e a chave + modelo de pelo menos um provedor. O `SESSION_SECRET` é gerado sozinho.
4. Abra o endereço `https://jarvis-xxxx.onrender.com`. Para conferir a configuração, acesse `/health`.

No plano grátis o serviço dorme sem uso, e a primeira abertura do dia demora até 1 minuto. No plano pago ele fica sempre ligado.

## Publicar na Hostinger

Use um plano com **Node.js** (VPS ou hospedagem de aplicativo Node):

1. Envie a pasta.
2. Comando de início: `node server.js`.
3. Configure as variáveis do `.env.example` no painel.

Ative HTTPS: o microfone só funciona em sites com HTTPS.

## Rodar no seu computador

```bash
cp .env.example .env   # preencha os valores
set -a; . ./.env; set +a
npm start              # http://localhost:3000
npm test               # testes do servidor e dos comandos
node tests/navegador.e2e.mjs   # teste no navegador (precisa do Playwright)
```

## Navegadores

- **Chrome (computador e Android):** tudo funciona, inclusive a escuta contínua.
- **iPhone:** o Safari não oferece escuta contínua para sites. Use o microfone do teclado e toque em Enviar. O player toca normalmente.
- Alguns vídeos têm a reprodução fora do YouTube bloqueada pelo dono. Nesse caso ele pula para o próximo e avisa.

## Segurança

- As chaves ficam só no servidor. O navegador nunca as recebe.
- O acesso é por PIN, com cookie assinado por 30 dias, e há limite de tentativas e de uso por minuto.
- A política de segurança (CSP) só permite o player oficial do YouTube.
