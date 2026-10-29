# apps/portal — becogames.app

Portal dos jogos do Beco Games (dono: Frontend). Site estático, só HTML e CSS (JS só para a faixa de cookies), fontes do sistema, sem dependência de runtime. A Sinuca é o primeiro jogo, em `https://sinuca.becogames.app` (outro Worker, `apps/sala`). Nome do Worker: `becogames-portal`.

## Mapa

```text
wrangler.jsonc          Worker só de assets (assets.directory ./public, drop-trailing-slash, 404-page)
public/index.html       página inicial: marca, frase, card da Sinuca (botão Jogar e links Como jogar / Regras), texto, "mais jogos", rodapé
public/como-jogar/      L50: guia da Sinuca (mira, tacada, efeito e giz, câmera e atalhos, online e mesmo PC, moedas/missões/loja/balão, dicas), 4 capturas próprias
public/regras/          L50: par ou ímpar (preset Boteco) e mata-mata como os presets de `packages/regras` aplicam; "regras da casa" do lobby
public/sobre/           L50: quem é o Beco Games (sem nome de pessoa) e contato
public/sitemap.xml      todas as páginas (robots.txt aponta para ele); página nova entra aqui
public/privacidade/     política de privacidade (LGPD), com a seção de publicidade (Google, partner-sites)
public/termos/          termos de uso (moedas virtuais, conduta, "como está")
public/404.html         página de erro
public/estilo.css       um CSS só, tokens em :root
public/faixa.js         aviso de cookies: "Entendi" guardado em localStorage `becogames.cookies` (try/catch), não bloqueia o site
public/ads.txt          por enquanto só um comentário
public/_headers         CSP estrita (script/style/img 'self', sem terceiros), nosniff, HSTS, Referrer/Permissions-Policy
public/img/             sinuca.jpg (captura própria do jogo, `.outros/lote-49/jogo-a.png`), guia-*.jpg (4 capturas do build local, L50), favicon.svg
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

- Toda página, inclusive a 404, leva `<meta name="google-adsense-account" content="ca-pub-8270923634039876">`, canonical, título e descrição próprios, o mesmo cabeçalho e rodapé (Como jogar, Regras, Sobre, Privacidade, Termos, Contato) e entra no `sitemap.xml`.
- `como-jogar` e `regras` descrevem o jogo de verdade: mudou controle (`apps/web/src/hud/ajuda.ts`) ou preset (`packages/regras/presets`)? Atualize as duas páginas.

- Assets só próprios ou CC0; nada de marca real. Sem script, fonte ou imagem de terceiros (a CSP barra).
- A política de privacidade tem de continuar verdadeira: mudou o que o jogo guarda (`apps/sala/CLAUDE.md`, `apps/web/CLAUDE.md`)? Atualize `public/privacidade/index.html` e a data.
- Não importa nada de `packages/*` nem de `apps/*`.
