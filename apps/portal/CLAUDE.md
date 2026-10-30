# apps/portal — becogames.app

Portal dos jogos do Beco Games (dono: Frontend). Site estático (HTML e CSS; JS só na faixa de cookies e nas telas de conta), fontes locais (Instrument Serif nos títulos e Inter no texto, SIL OFL 1.1), mais um Worker pequeno que repassa `/api/conta/*` ao Banco (`apps/conta`). A Sinuca é o primeiro jogo, em `https://sinuca.becogames.app` (outro Worker, `apps/sala`). Nome do Worker: `becogames-portal`.

## Mapa

```text
wrangler.jsonc          main src/entrada.ts, assets (./public, binding ASSETS, run_worker_first ["/api/*"], drop-trailing-slash, 404-page) e services CONTA -> becogames-conta/Banco
tsconfig.json           src (testes, tipos node); tsconfig.worker.json confere src/entrada.ts com @cloudflare/workers-types (`pnpm --filter @sinuca/portal typecheck`)
src/entrada.ts          L56: `/api/conta/<acao>` (acao em /^[a-z-]{1,20}$/) vira PedidoDaConta (`pedidoDoRequest`: corpo até 8 KB, senão 413; ip de CF-Connecting-IP; convidado sempre null) e o Banco responde (`respostaDaConta`: JSON, no-store, nosniff, Set-Cookie); o resto de /api é 404; Banco que lança vira 503; fora de /api vai ao ASSETS. Só repassa: Origin, limites, cookie e mensagens são do Banco
src/entrada.test.ts     unidade, com CONTA falso
src/integracao.test.ts  sobe `wrangler dev --local -c apps/portal/wrangler.jsonc -c apps/conta/wrangler.jsonc` (cria e apaga apps/conta/.dev.vars de teste, com ORIGENS_DE_DEV da porta) e roda criar, eu, sair, entrar, esqueci, Origin de fora, nome, excluir
public/entrar, criar-conta, esqueci-a-senha, nova-senha, minha-conta   L56: telas de conta (noindex, fora do sitemap e com Disallow no robots.txt); o `<body data-pagina>` escolhe o fluxo em public/conta.js
public/conta.js         fetch para /api/conta/*, erros em `role="alert"`, botão desabilitado enquanto espera, token de nova-senha só no fragmento (apagado na hora por replaceState), excluir em dois passos (sem confirm())
public/index.html       L58d (estilo resend.com, estrutura do L58c): selo em pílula "Novo: conta Beco Games ›" (link a `/criar-conta`), h1 em duas linhas na serifa (72 px, degradê de branco a cinza), texto cinza, botão "Jogar Sinuca" em pílula clara e "Como jogar" só em texto, 3 destaques com ponto néon e a única captura do jogo (`mesa-*`) num quadro de produto à direita (borda de 1 px, brilho verde atrás, reflexo no alto); seção "Sinuca, do jeito que se joga no bar" com 4 cartões (ícone de linha, degradê fino no alto), "Em breve" em duas colunas com a foto `bolas-*` e o crédito, FAQ em `<details>` centralizado (sem JS); a home tem ~2,4 telas de 1440×900. O "Como funciona", "A conta" e a foto da bola 8 saíram a pedido do usuário em 2026-10-30 (não voltam)
public/como-jogar/      L50: guia da Sinuca (mira, tacada, efeito e giz, câmera e atalhos, online e mesmo PC, moedas/missões/loja/balão, dicas), 4 capturas próprias
public/regras/          L50: par ou ímpar (preset Boteco) e mata-mata como os presets de `packages/regras` aplicam; "regras da casa" do lobby
public/sobre/           L50: quem é o Beco Games (sem nome de pessoa) e contato
public/sitemap.xml      todas as páginas (robots.txt aponta para ele); página nova entra aqui
public/privacidade/     política de privacidade (LGPD), com a seção de publicidade (Google, partner-sites)
public/termos/          termos de uso (moedas virtuais, conduta, "como está")
public/404.html         página de erro
public/estilo.css       um CSS só (L58d), tokens em :root (`--fundo` #0a0a0a, `--cartao`, `--linha` branco a 8%, `--texto` #fafafa, `--suave` #a1a1a1 [AA sobre o preto], `--neon`, `--feltro`, `--serifa`, `--fonte`). Títulos h1 e h2 na Instrument Serif 400 (home 72 px, h2 46 px, página interna 44 px, h2 de texto 32 px), h3 e corpo na Inter (15 a 16 px, cinza com destaques em branco). Fundo: `body::before` com um brilho verde-feltro e dois feixes diagonais em degradê (só CSS, 1000 px no alto de toda página). Cabeçalho fino (64 px), `position: sticky` (abaixo da faixa de cookies, que corre no fluxo), translúcido com `backdrop-filter: blur` e linha de 1 px sempre; âncora ativa em branco com um ponto néon (`:target-current` onde o navegador sabe; `aria-current` nas páginas). Botão principal é pílula clara (`.botao`), secundário `.contorno` com borda fina ou `.link-forte` só texto; o rosa néon fica só em detalhes (ponto dos destaques, ponto da âncora, anel de foco). Seções separadas por linha de 1 px, sem cor chapada; cartões um pouco acima do preto com degradê fino no alto e borda quase invisível. Páginas de texto e de conta (`.texto`): coluna de 720 px; campos escuros com borda de 1 px e foco em anel suave (sem outline). Sem animação de entrada (o surgir por `animation-timeline: view()` foi testado e saiu: esconde o conteúdo para quem captura a página sem rolar); nada de `style=` inline (a CSP barra). As classes `cap-*` no `<main>` ficaram sem efeito (o traço colorido do h1 saiu)
public/fontes/          L58d: `instrument-serif.woff2` (400, subconjunto latino, 21 KB) e `inter.woff2` (variável 100 a 900, latino, 48 KB), cada uma com o seu `*-OFL.txt`; a Bricolage saiu
public/faixa.js         aviso de cookies: a faixa já vem visível no HTML, no fluxo acima do cabeçalho (sem layout shift e sem cobrir texto); quem já deu "Entendi" (localStorage `becogames.cookies`, try/catch) a recebe escondida; não bloqueia o site
public/ads.txt          por enquanto só um comentário
public/_headers         CSP estrita (script/style/img/connect 'self', sem terceiros), nosniff, HSTS, Referrer/Permissions-Policy
public/img/             logo.svg e favicon.svg (bola preta com faixa néon), `mesa-1600/800.webp` e `.jpg` (a única imagem do jogo na home, 1600×1023, sem recorte) e `bolas-*` (fotos livres do Wikimedia Commons, CC-BY, crédito na legenda e em `docs/creditos.md`), sinuca.jpg (og:image, a mesma captura com barras), guia-*.jpg (L50, só no `como-jogar`)
```

Rodar local: `pnpm --filter @sinuca/portal dev` (ou `npx wrangler dev --local --port 8098` na pasta). Sem telemetria do Wrangler.

## Deploy

`npx wrangler deploy` na pasta, **só pelo Principal** (conta Cloudflare). Depois: domínio `becogames.app` como rota/domínio personalizado do Worker `becogames-portal` no painel.

**`www.becogames.app` para a raiz:** um Worker só de assets não redireciona por host (`_redirects` casa só o caminho). Fazer no painel da Cloudflare, em Regras de Redirecionamento (Redirect Rules): host igual a `www.becogames.app` → `https://becogames.app` + caminho, 301, e o DNS de `www` proxied. Sem isso, `www` não responde.

## O que falta para o AdSense

1. Publicar e esperar o DNS de `becogames.app` e `www`.
2. Pedir o site no AdSense (código de verificação). **A CSP hoje bloqueia script de terceiros**: ao colocar o script do AdSense, liberar em `_headers` só o necessário (`script-src`, `frame-src`, `img-src`, `connect-src` do Google, conforme a documentação dele) e rever a seção de publicidade da política.
3. Quando o Google der o ID de editor, trocar o conteúdo de `public/ads.txt` por esta linha:
   `google.com, pub-8270923634039876, DIRECT, f08c47fec0942fa0`
4. **Consentimento na Europa (EEE, Reino Unido, Suíça):** será o do Google, a CMP do AdSense (Privacidade e mensagens), ativada depois da aprovação. A faixa "Entendi" daqui é só aviso informativo e não vale como consentimento de anúncios.
5. Conteúdo original na raiz, privacidade, termos e contato já existem; quando entrarem mais jogos, mais texto próprio.

## Regras da pasta

- Cabeçalho, rodapé e faixa de cookies são o mesmo bloco HTML em todas as páginas (copiar, não reinventar): mudou um, mude todos os arquivos (os sete do site, a 404 e os cinco de conta). O cabeçalho tem Jogos, Como jogar, Regras, Em breve e Dúvidas (âncoras `/#...`) e o `aria-current="page"` fica só em Como jogar e Regras; Sobre, Privacidade, Termos e o e-mail ficam no rodapé. O link "Entrar" do cabeçalho está visível desde 2026-10-30, quando a Parte 4 (login na sinuca) foi publicada.
- Telas de conta: nada inline, `autocomplete` em todo campo, nunca `confirm()`, token só no fragmento. O link "Entrar" fica fora do `sitemap.xml`; as páginas de conta ficam `noindex` (o Lighthouse dá SEO 69 por isso, de propósito).
- Rodar a conta local junto do portal: `apps/conta/.dev.vars` com `PEPPER_DA_SENHA`, `DOMINIO_DO_COOKIE=""`, `COOKIE_SEGURO="0"` e `ORIGENS_DE_DEV=http://127.0.0.1:<porta>`, e `wrangler dev --local -c apps/portal/wrangler.jsonc -c apps/conta/wrangler.jsonc --port <porta>`. Apague o `.dev.vars` e os `.wrangler` depois.
- Cores só pelas variáveis de `:root`; contraste conferido (`--suave` #a1a1a1 sobre #0a0a0a e #111). Estilo "resend" (L58d): quase preto, títulos em serifa leve, botão principal em pílula clara, rosa néon só como detalhe pequeno, cartões de 14 px com borda de 1 px, conteúdo até 1200 px, 64 a 80 px de espaço vertical. Antes de entregar o visual: capturas em 1440, 1280×720 e 390, 0 erro de console, sem rolagem horizontal e Lighthouse da home ≥ 90.
- Toda página, inclusive a 404, leva `<meta name="google-adsense-account" content="ca-pub-8270923634039876">`, canonical, título e descrição próprios, o mesmo cabeçalho e rodapé (Como jogar, Regras, Sobre, Privacidade, Termos, Contato) e entra no `sitemap.xml`.
- `como-jogar` e `regras` descrevem o jogo de verdade: mudou controle (`apps/web/src/hud/ajuda.ts`) ou preset (`packages/regras/presets`)? Atualize as duas páginas.

- Assets só próprios, CC0, domínio público ou CC-BY com crédito em `docs/creditos.md` (o teste `creditos-modelo` aceita `CC0|CC-BY|SIL OFL 1.1` na licença); nada de marca real. A home tem uma só imagem do jogo (`mesa-*`). Tudo é servido pelo próprio site: sem script, fonte ou imagem carregados de terceiros (a CSP barra).
- A política de privacidade tem de continuar verdadeira: mudou o que o jogo guarda (`apps/sala/CLAUDE.md`, `apps/web/CLAUDE.md`)? Atualize `public/privacidade/index.html` e a data.
- Só `import type` de `@sinuca/conta/contrato` (src/entrada.ts); nada mais de `packages/*` nem de `apps/*`.
