> Estudo de viabilidade trazido pelo usuário em 2026-10-08. Documento de referência **congelado**: não editar.
> Decisões vigentes ficam em `docs/decisoes.md` (que aponta para as seções daqui). Leia só a seção que o seu papel precisa:
> `sed -n '/^### 3\./,/^### 4\./p' docs/estudo-viabilidade.md` (troque os números).

# Sinuca 3D "Par ou Ímpar" no navegador: viabilidade, arquitetura e plano de construção

Sim, dá para fazer: um jogo de sinuca 3D bonito, jogável no PC pelo navegador, com regras de par ou ímpar de bar, tacada controlada pelo mouse, sem linha de mira, efeito e giz é totalmente viável em 2026 com three.js + física de bilhar própria em TypeScript + um servidor leve de salas (Cloudflare Durable Objects), e eu consigo escrever praticamente todo o código — mas o online exige que você publique um pequeno servidor (gratuito) e a "sensação" da física vai precisar de rodadas de teste suas.

## TL;DR

- **Viável e com caminho claro:** renderização em three.js (WebGL2 hoje, WebGPU opcional), física de bilhar escrita sob medida com os modelos publicados (Han 2005, Mathavan 2010, throw de Alciatore) — não um motor genérico — e o projeto open source tailuge/billiards (TypeScript + three.js, GPL-3.0) como prova de que isso funciona no navegador, inclusive com online e replays.
- **Multiplayer simples e robusto:** como sinuca é por turnos, o cliente de quem tacou simula a tacada inteira em milissegundos e envia a "gravação" (parâmetros + trajetória) para uma sala; todos assistem à mesma gravação, o que elimina o problema de determinismo entre navegadores. Hospedagem recomendada: Cloudflare Workers + Durable Objects (com a biblioteca PartyServer), cujo plano gratuito oferece, segundo a documentação de preços da Cloudflare, 100.000 requisições/dia (incluindo requisições HTTP, sessões RPC, mensagens WebSocket e alarmes) e 13.000 GB-s/dia — muito acima do que um grupo de amigos usa.
- **Regras:** "par ou ímpar" não tem regra única no Brasil; o jogo deve ter um conjunto padrão "boteco" (bolas 2–15, grupo definido pela primeira bola encaçapada, falta = adversário "recebe" a menor bola dele) e expor como opções: bola 1/15 como "castigo" final, penalidade simples ou acumulada, o que acontece na saída com bolas dos dois grupos, duplas e "ranca-saia" para 3–4 jogadores.

## Key Findings

1. **O navegador já não é o gargalo.** Segundo o web.dev (Google), o WebGPU está disponível no Chrome/Edge desde a versão 113 (Windows, macOS, ChromeOS), no Firefox 141 para Windows (e no macOS Tahoe 26 em ARM64 a partir do Firefox 145) e no Safari 26; o suporte a Linux ainda está "em progresso". Para um jogo só de desktop, isso significa: WebGL2 funciona em todos os PCs; WebGPU é um bônus, não um requisito.
2. **Three.js é a melhor escolha para este projeto**, principalmente pelo ecossistema e porque a referência mais forte (tailuge/billiards) usa three.js. O próprio manual do three.js diz que o WebGPURenderer usa WebGPU por padrão com fallback para WebGL 2, mas que ShaderMaterial, onBeforeCompile e o EffectComposer não são suportados nele, e que o WebGLRenderer "ainda é mantido e é a escolha recomendada para aplicações puramente WebGL 2". Conclusão prática: comece com WebGLRenderer + EffectComposer (maduro), e migre para WebGPU/TSL só se precisar.
3. **Motores de física genéricos são o caminho errado para bilhar realista.** O que dá "alma" à sinuca — transição deslizando→rolando, efeito lateral, retrocesso (puxada), throw entre bolas, tabela que bate acima do centro da bola, squirt — não é modelado por Rapier/cannon-es/Havok; é modelado por equações específicas. O tailuge implementa exatamente isso: movimento deslizante/rolante de Han 2005, colisão bola-bola com throw baseada em Alciatore, tabela de Mathavan (com ângulo de contato sin θ = 2/5) e um modelo de tabela "compliant" de Stronge.
4. **Determinismo entre navegadores é um risco real, mas evitável pela arquitetura.** O ECMAScript permite que Math.sin, Math.cos, Math.atan2 etc. sejam "aproximadas" pela implementação; o projeto open source sunset-driver (jjgroenendijk, issue #471 no GitHub) documentou Math.cos arredondando um bit diferente entre o V8 do Node e o V8 do Chromium — com 627 resultados divergentes medidos —, o que mudou todo o resultado da simulação. A documentação do Rapier confirma que funções transcendentais como Math.sin e Math.cos não são determinísticas entre plataformas. Solução: não depender de dois clientes simularem igual — transmitir a gravação da tacada.
5. **O público brasileiro conhece sinuca online 3D, mas não com par ou ímpar casual entre amigos.** O MegaJogos (no ar desde 2002) tem "Sinuca Brasileira" 3D para 2 jogadores, por pontos, com 7 bolas, câmera livre na roda do mouse, câmera superior (F6) e câmera de caçapa automática. Par ou Ímpar aparece no app Sinuquinha, mas como jogo valendo dinheiro. Há espaço claro para um jogo de amigos com regra de boteco configurável.
6. **O giz tem base física para virar mecânica.** Dr. Dave Alciatore (Colorado State) escreve na Billiards Digest (setembro de 2011) que o "limite de miscue" é "geralmente aceito" como metade do raio da bola (0,5R) a partir do centro; em seu artigo de física do bilhar, o maior deslocamento efetivo medido foi cerca de 0,55R; na Billiards Digest de maio de 2009, mostra que a 50% de deslocamento já se obtém cerca de 75% do efeito máximo; e ele demonstra em vídeo o miscue por batida fora do centro sem giz. Isso permite um design honesto: giz fresco = limite seguro ~0,5R; taco sem giz = limite encolhe e o risco de espirrar sobe.

## Details

### 1. As regras de "Par ou Ímpar" (como jogadas em bares) e o que deve ser configurável

Fontes brasileiras consultadas: blog Sinuca de Boteco (Rodnei Vete, 2014, com centenas de comentários de jogadores de várias regiões), Lord's Diversões (locadora de bilhares de Mogi), Empório Sinuca, Sinuca Verso, Bilhares Delcol, regulamento de campeonato da AFIA (Gramado, 2025), Rodrigues e Carneiro (locadora) e o blog Regras de Sinuca ("regra carioca" de campeonato). A própria página do Empório Sinuca abre com: "Em cada local existe uma regra particular." Isso é o dado mais importante para o design: **regras como dados, não como código fixo.**

**Núcleo comum (praticamente todas as fontes concordam):**

| Elemento | Regra-base |
|---|---|
| Bolas | Bola branca ("bolão", "tacadeira") + numeradas. Pares: 2, 4, 6, 8, 10, 12, 14. Ímpares: 3, 5, 7, 9, 11, 13, 15. |
| Bola 1 | Ou é retirada para igualar 7×7 (Lord's, Empório Sinuca usa bolas 2 a 15), ou fica como "castigo"/"curinga" final. |
| Arrumação | Triângulo; Empório Sinuca: base de 5 bolas voltada para a tabela superior e vértice sobre a marca superior; bolas agrupadas aleatoriamente. |
| Saída | Bolão em qualquer ponto da área de saída (semicírculo "D") ou, sem marcação, na metade da mesa oposta ao triângulo. |
| Definição do grupo | A bola encaçapada (na saída ou depois) define se o jogador é par ou ímpar; o outro grupo fica com o adversário. |
| Tacada válida | Atingir primeiro (ou simultaneamente) uma bola do próprio grupo (Empório Sinuca, Art. 10). |
| Continuidade | Encaçapou bola sua, continua; perde a vez se cometer falta, não encaçapar ou encaçapar bola do adversário (Art. 11). |
| Pena típica ("pagar bola") | O adversário tem a menor bola dele retirada da mesa (é um "presente" para ele). |
| Vitória | Encaçapar todas as bolas do seu grupo (e, na variante com castigo, depois encaçapar a bola castigo). |
| Bola que volta da caçapa | Considerada não encaçapada (Empório Sinuca, Art. 18). |

**Faltas mais comuns e penas do padrão "boteco" (Sinuca de Boteco):**

- **Suicídio / branca na caçapa:** retira-se a menor bola do adversário; a branca volta numa marca fixa do lado da saída (sem "bola na mão" livre). Se houver bola na marca, a branca é solta encostada nela.
- **"Cegar" (não acertar nenhuma bola):** retira-se a menor bola do adversário; a branca fica onde parou.
- **Acertar direto a bola do adversário (direto ou pela tabela):** retira-se a menor bola do adversário (duas, se combinado antes para a "direta").
- **Encaçapar bola do adversário:** ela conta para ele (e, na regra carioca, ainda tem pena).
- **Sem pena dupla:** se acontecerem duas faltas na mesma tacada, só uma pena é aplicada.
- **Bola fora da mesa:** a numerada volta encostada na tabela perto de onde saiu (ou no centro da mesa, conforme combinado); bolão fora da mesa volta à marca de saída e paga uma bola.

**Variantes regionais que devem virar opções no menu "Regras da casa":**

| Opção | Valores possíveis (com origem) |
|---|---|
| Conjunto de bolas | 2–15 sem a 1 (Empório, Lord's) / 1–15 com a 1 como castigo (Sinuca Verso, Sinuca de Boteco) / 15 como castigo (AFIA Gramado; Rodrigues e Carneiro aceita 1 ou 15). |
| Onde fica o castigo | Colado na tabela do lado da saída após a quebra; ou colocado pelo adversário quando alguém zera as bolas, no lado oposto da branca e sem ficar escondido (resposta de Rodnei Vete no Sinuca de Boteco). |
| Castigo na mesma tacada da última bola | Proibido: o castigo deve sair em tacada separada; encaçapar o castigo antes de terminar o grupo = derrota (Sinuca Verso). |
| Saída com bolas dos dois grupos | (a) vale a primeira que caiu e o jogador perde a vez (Sinuca de Boteco); (b) o jogador escolhe o grupo e nenhuma volta (Empório, Art. 7; Rodrigues e Carneiro); (c) quantidades iguais = jogo indeterminado, passa a vez (Sinuca Verso, Delcol); (d) quantidades diferentes, ex. 2 pares e 1 ímpar = encaçapa-se a menor ímpar e segue indeterminado (Delcol, AFIA); (e) vale o grupo com mais bolas, mas paga uma (comentário "Castigadão" de Araçatuba-SP). |
| Tentativas na saída | Três chances de acertar o triângulo sem a branca cair (Sinuca de Boteco). |
| Quem sai na próxima | O perdedor da anterior (Empório); alternado (Rodrigues e Carneiro); o vencedor no "ranca-saia". |
| Pena por falta | Simples (1 bola) / "direta" = 2 bolas / acumulada estilo "Castigadão" de Araçatuba (cegou = 1; cegou + suicídio = 2; direta = 2; direta + suicídio = 3; até 4 no "cúmulo do azar"). |
| Quem escolhe a bola retirada | Sempre a menor (padrão) / o adversário escolhe qualquer uma das dele (regra carioca de campeonato). |
| Pena invertida (Lord's, "regras elementares") | Em vez de retirar bola do adversário, o faltoso devolve à mesa uma bola sua já encaçapada. |
| Tocar primeiro bola do adversário | Falta (padrão) / permitido se for para encaçapar a sua (Lord's, "regras elementares"). |
| Suicídio na regra carioca | O adversário dá nova saída a partir do "D", sem rearrumar as bolas. |
| Sinuca (snooker) | Só vale se o bolão percorreu ao menos ~20 cm / "um palmo" (regra carioca); pular bola com o bolão é falta. |
| Final polêmico: matar o castigo e suicidar | Perde se o adversário tem 1 bola; se tem 2+, paga a menor e o adversário precisa limpar a mesa sem errar (comentários no Sinuca de Boteco/Araçatuba). O próprio dono do blog chama essa jogada de "polêmica" — por isso deve ser opção explícita. |

**3 e 4 jogadores (as regras formais assumem 1×1; o resto é costume de bar):**

- **Ranca-saia / "perdeu sai":** com mais de dois jogadores, quem vence fica e dá a saída na próxima; quem perde sai e entra o próximo da fila (comentário de Araçatuba no Sinuca de Boteco). É o modo mais fiel ao bar para 3–4 amigos, e os que estão "na fila" assistem como espectadores.
- **Duplas (2×2):** cada dupla fica com um grupo (pares ou ímpares) e joga "na vez da dupla" (regulamento do Mini Torneio da Afya Palmas). Nenhuma fonte brasileira encontrada define a ordem exata dos parceiros; a proposta para o jogo é alternar A1 → B1 → A2 → B2, com opção "parceiro continua enquanto encaçapar".
- **Três jogadores em grupos de 5 (Lord's):** um fica com as bolas 1–5, outro com 6–10, outro com 11–15; vence quem encaçapar as suas primeiro. (A página da Lord's escreve "1 a15", erro de digitação para "1 a 5".)

**Conjunto padrão proposto ("Boteco", para vir ligado de fábrica):** bolas 1–15 com a 1 como castigo colocado na tabela do lado da saída; grupo definido pela primeira bola encaçapada; saída com bolas dos dois grupos → vale a primeira que caiu e perde a vez; falta = paga a menor do adversário; direta = 1 bola (opção 2); sem pena dupla; castigo só em tacada separada; branca volta à marca da saída após suicídio. Tudo isso fica num arquivo de configuração `regras.json` que você e seus amigos ajustam.

### 2. Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem/build | TypeScript + Vite | Tipagem para física e regras; código compartilhado entre cliente e servidor. |
| Renderização | three.js (WebGLRenderer + EffectComposer), opcional WebGPURenderer depois | Ecossistema enorme, a referência tailuge usa three.js, HDRI/PBR maduros. |
| UI (menus, lobby) | HTML/CSS simples, ou React só para o menu (sem r3f na mesa) | O laço do jogo fica mais simples e previsível fora do React. |
| Física | Motor próprio em TypeScript (≈1–2 mil linhas) | Modelos específicos de bilhar; controle total do efeito, do giz e do miscue. |
| Regras | Máquina de estados pura em TS, alimentada pela lista de eventos da tacada | Testável, configurável e executável no servidor. |
| Rede | WebSocket para Cloudflare Durable Objects via PartyServer + PartySocket (reconexão automática) | Uma "sala" por código; estado persistente; plano gratuito suficiente. |
| Hospedagem do front | Cloudflare Pages/Workers ou GitHub Pages | Grátis, estático. |
| Áudio | Web Audio API + amostras CC0/CC-BY | Volume e tom variam com a velocidade do impacto. |

**Comparação de motores 3D para uma mesa realista:**

| Critério | three.js | Babylon.js | PlayCanvas | React Three Fiber |
|---|---|---|---|---|
| PBR, HDRI, clearcoat (bola envernizada), sheen (feltro) | Sim (MeshPhysicalMaterial) | Sim (PBRMaterial) | Sim | É three.js |
| Pós-processamento (SSAO/GTAO, bloom) | EffectComposer maduro; novo pipeline TSL no WebGPU | Pipeline padrão integrado | Integrado | Via pacote de pós-processamento |
| WebGPU | WebGPURenderer com fallback WebGL2 | Desde a 8.0 (anunciada no Windows Developer Blog da Microsoft em 27/03/2025), todos os shaders do núcleo em GLSL e WGSL nativo — cerca de 2x menor ao mirar WebGPU | Sim | Herda do three.js |
| Física embutida | Não (bom: você escreve a sua) | Havok | Ammo/integrações | Não |
| Referência de bilhar existente | tailuge/billiards | — | — | — |
| Veredito | **Recomendado** | Ótima alternativa se você preferir um motor "completo" | Bom, mas centrado no editor online | Só se o projeto inteiro for React |

O Babylon.js 8.0 trouxe ainda sombras IBL e luzes de área, que ajudariam no visual — é uma escolha legítima. Mas a física embutida dele (Havok) não resolve o problema do bilhar, e você perderia a referência de código mais próxima. Por isso three.js.

### 3. Física: por que escrever a própria e como

**Por que não Rapier/cannon-es/Ammo/Havok/Jolt:** eles resolvem colisões de corpos rígidos genéricos com atrito e restituição únicos. Na sinuca, o que importa é: (1) a bola sai deslizando e passa a rolar por atrito com o pano; (2) a tabela toca a bola acima do centro, o que muda o efeito na volta; (3) o atrito bola-bola gera throw; (4) a batida fora do centro gera squirt (desvio da branca). Dá para imitar parte disso num motor genérico, mas a sensação de efeito e de puxada fica falsa e difícil de ajustar. Um detalhe: o Rapier até tem um build determinístico entre plataformas, mas determinismo não é o gargalo aqui (ver seção 4).

**Modelo recomendado (o mesmo conjunto do tailuge, documentado em artigos):**

- Estados da bola: parada, girando no lugar, deslizando e rolando.
- Movimento: equações de Han 2005 (velocidade na superfície, desaceleração deslizante, desaceleração rolante, decaimento do giro vertical). Atenção: Evan Kiefl (autor do pooltool) publicou correções importantes ao Han 2005, citadas no README do tailuge — use a versão corrigida.
- Bola-bola: impulso normal com restituição + impulso tangencial limitado por atrito (throw), conforme Alciatore.
- Tabela: Mathavan 2010 (numérico, compressão + restituição) ou um modelo simplificado com contato em sin θ = 2/5; o tailuge mantém diagramas que reproduzem as figuras do artigo e servem para validar.
- Taco-bola: velocidade e giro iniciais a partir de velocidade do taco, ponto de contato (deslocamento lateral/vertical) e elevação; squirt quase linear com o deslocamento do taco (Alciatore); miscue acima do limite (ver giz, seção 6).
- Caçapas: bocas como segmentos e círculos (as "quinas" das tabelas) + teste de queda quando o centro da bola passa do raio da caçapa. Para o visual brasileiro, use as medidas de mesa de bar: o fabricante Noel Snooker anuncia mesa "sinuquinha" de 2×1 m interna com caçapas de canto de 6,5 cm e de meio de 8 cm; as bolas nacionais são de 54 mm (com o bolão de 56 mm, segundo a Maxxi Tacos); a Sinuca Verso recomenda tabela com altura de 61% a 64% do diâmetro da bola (32–34,5 mm para bolas de 54 mm). Deixe o tamanho da mesa como opção: 2,10×1,20 m interna (mesa de bar "tradicional" 2,20×1,30 m externa) ou oficial 2,54×1,27 m.

**Passo de tempo:** duas escolhas válidas. (a) Passo fixo pequeno com sub-passos, como faz um fork do tailuge com passo fixo de 1/512 s, separado do desenho na tela — mais simples. (b) Algoritmo por eventos (Leckie & Greenspan), usado pelo pooltool, que calcula analiticamente quando acontece a próxima colisão (resolvendo um polinômio de quarto grau) e pula direto para ela — mais exato, mais complexo. Recomendação: comece com (a). Como a tacada inteira é simulada antes de ser animada (seção 4), dá para usar um passo bem pequeno sem custo perceptível.

**Fork do tailuge ou motor próprio?** O tailuge/billiards já tem física boa, replays, regras de nine ball, snooker, três tabelas e sagu, online para dois jogadores, lobby e bots — e foi feito para rodar até num Raspberry Pi 4. Fazer um fork e adicionar um `ruletype` de par ou ímpar é o atalho mais rápido para física de alto nível. Os contras: licença GPL-3.0 (se você distribuir, o código derivado precisa continuar aberto sob GPL; vender não é proibido, mas fechar o código é), uma base grande (3.864 commits) e uma interface pensada para teclado, roda do mouse e uma linha de mira que se liga e desliga (tecla A). **Minha recomendação:** escrever um motor próprio, enxuto, a partir dos mesmos artigos (equações não são protegidas por direito autoral), usando o tailuge como "gabarito" para comparar comportamento; manter o fork como plano B se a sensação da física travar.

### 4. Multiplayer online (2–4 jogadores)

**O ponto-chave:** sinuca é por turnos e cada tacada é um evento fechado. Isso permite a arquitetura mais simples e robusta possível:

1. O jogador da vez mira e taca localmente (sem latência na mira).
2. O cliente dele simula a tacada **inteira** na hora (milissegundos), gerando a lista de eventos (quem bateu em quem, o que caiu) e uma trajetória amostrada (ex.: 60 quadros por segundo × 16 bolas × posição + rotação). Comprimida, dá na casa de dezenas de KB por tacada.
3. Envia para a sala: parâmetros da tacada + gravação + estado final.
4. A sala (Durable Object) valida a vez, roda o **motor de regras** sobre a lista de eventos (falta? quem joga agora? qual bola é retirada?), grava o novo estado e transmite para todos.
5. Todos os clientes (adversários e espectadores) animam a mesma gravação, com som — ficam sincronizados por construção, sem depender de ponto flutuante idêntico.

**Por que não lockstep/simulação determinística em cada cliente:** daria para usar um build determinístico de física, mas qualquer Math.sin/cos, ordem de soma ou versão diferente do motor quebraria a sincronia — e na sinuca um erro de 0,001 na saída muda a mesa inteira. A gravação resolve isso de graça. **Por que não servidor autoritativo simulando:** seria mais "à prova de trapaça", mas para amigos é complexidade desnecessária; a arquitetura acima permite migrar depois (o servidor pode re-simular os parâmetros e comparar, quando o projeto crescer).

**Comparação de tecnologias de rede:**

| Opção | Custo para um hobby | Prós | Contras |
|---|---|---|---|
| **Cloudflare Durable Objects + PartyServer** | Grátis, segundo a documentação de preços da Cloudflare: 100.000 requisições/dia (incluindo requisições HTTP, sessões RPC, mensagens WebSocket e alarmes), 13.000 GB-s/dia, 5 GB de armazenamento SQLite | Uma sala = um objeto com estado e armazenamento; API de hibernação evita cobrança de duração ociosa; PartySocket com reconexão | Precisa de conta Cloudflare e deploy via wrangler |
| PartyKit hospedado (partykit.dev) | — | API simples | A Cloudflare comprou o PartyKit em abril de 2024 e o desenvolvimento migrou para PartyServer; há relatos (PRs no GitHub, 2026) de deploy quebrado na hospedagem compartilhada por limite de domínios — evite e use PartyServer na sua conta |
| Colyseus (Node.js) | Framework grátis (MIT) se você hospedar; Colyseus Cloud sem plano grátis, a partir de US$ 15/mês | Salas, matchmaking, sincronização de estado | Precisa de um servidor Node sempre ligado |
| Supabase Realtime (broadcast) | Grátis: 200 conexões simultâneas, 2 milhões de mensagens/mês, 100 mensagens/s | Junta login e banco | Projetos grátis podem ser pausados após 7 dias de pouca atividade; lógica de regras fica no cliente |
| Socket.IO num VPS/Render/Fly | Variável | Familiar | Você cuida do servidor |
| WebRTC P2P | Grátis em tese | Sem servidor de jogo | Precisa de sinalização e TURN; complexo demais para o ganho |
| Nakama | Grátis se hospedar | Contas, rankings, matchmaking | Pesado para 4 amigos |

**Recomendação:** Cloudflare Durable Objects com PartyServer. Uma partida de par ou ímpar tem algumas dezenas de tacadas; mesmo com 4 jogadores trocando mensagens de mira e chat, uma noite inteira de jogo fica em milhares de requisições — duas ordens de grandeza abaixo do limite diário gratuito.

**Recursos de sala:**
- **Código da sala** (ex.: `SINUCA-7K2P`) gerado pelo anfitrião e compartilhado por WhatsApp; o código vira o nome do Durable Object.
- **Lugares (seats)** 0–3, anfitrião no lugar 0, modo escolhido (1×1, duplas, ranca-saia, três jogadores).
- **Reconexão:** cada jogador recebe um token salvo no localStorage; ao reconectar, a sala reenvia estado atual + última gravação. Se o jogador da vez cair, tempo de tolerância (ex.: 60 s) e depois a vez passa.
- **Mira ao vivo para espectadores (opcional):** enviar o ângulo do taco ~10×/s para os outros verem você mirando — dá muito clima de bar e custa pouco.
- **Chat e "zoeira"** rápida (emotes), como nas salas do MegaJogos.

### 5. Gráficos: como chegar no "bonito"

- **Ambiente e reflexos:** HDRI de interior do Poly Haven (licença CC0: uso para qualquer fim, inclusive comercial, sem atribuição) convertido com PMREM para reflexos nas bolas e no verniz. Para clima de bar, uma luminária retangular sobre a mesa (RectAreaLight ou 2–3 spots suaves) faz 80% do visual.
- **Bolas:** MeshPhysicalMaterial com clearcoat = 1 e rugosidade baixa; texturas numeradas geradas por código num canvas (cor sólida 1–8, faixa 9–15, círculo branco com o número) — sem precisar de arquivo de arte.
- **Feltro:** rugosidade alta + "sheen" (brilho de tecido) + mapa normal de trama fina; cor verde, azul ou vinho como opção.
- **Madeira:** textura PBR de madeira do Poly Haven com clearcoat para o verniz; caçapas de alumínio com rede ou gaveta — detalhe que o jogador brasileiro nota (um avaliador do app Sinuquinha pediu exatamente "as mesas do Brazil com as caçapa de alumínio").
- **Sombras:** shadow map suave para a luminária + uma "sombra de contato" barata (disco escurecido) sob cada bola, o que dá muito realismo com custo mínimo.
- **Pós-processamento:** SSAO/GTAO leve (cantos da tabela), bloom discreto nos reflexos, tonemapping ACES ou AgX, SMAA/FXAA. Tudo com chave "Qualidade: baixa/média/alta".
- **WebGPU:** só depois do jogo pronto; a troca exige reescrever o pós-processamento em TSL (o EffectComposer não funciona no WebGPURenderer).

### 6. Controles no desktop (força, efeito, giz, sem linha)

**Modos (inspirados no pooltool, no ShootersPool e no 8 Ball Pool web):**

| Ação | Controle proposto |
|---|---|
| Mirar | Mover o mouse na horizontal gira o taco em volta da branca; Shift = mira fina (sensibilidade 1/5). |
| Olhar a mesa | Segurar o botão direito: câmera orbital livre; roda = zoom; Tab = vista de cima (para planejar, sem linha). |
| Tacada (stroke) | Segurar o botão esquerdo (ou S) entra no modo tacada com Pointer Lock; puxar o mouse para trás recua o taco; empurrar para frente dá a tacada. A força é a **velocidade do taco no impacto** (média dos últimos ~50 ms do movimento), com curva não linear e limite máximo. No pooltool é assim: "quanto mais rápido o movimento, mais forte a tacada". |
| Força assistida (opção de acessibilidade) | Segurar e soltar com barra de força, como no 8 Ball Pool web (clicar e puxar para trás define a força). |
| Efeito | Teclas W/A/S/D (ou segurar E + mouse) movem o ponto de contato num "mini-bolão" no canto da tela; o círculo do limite seguro é desenhado nele. |
| Elevação do taco (massé/pulo) | Segurar Q + roda; liberar só na fase 3. |
| Giz | Tecla G: animação de passar giz (~1 s). |

**Mira justa sem linha:** a câmera de tacada fica atrás do taco, na altura dos olhos, alinhada com ele — como no bar. Sem bola-fantasma, sem trajetória, sem previsão de rebote. O que mantém a justiça: (1) mira fina com Shift; (2) a vista de cima sempre disponível antes de entrar no modo tacada; (3) sensibilidade configurável; (4) um "tremor" opcional zero (nada de aleatoriedade escondida na mira — o erro vem do jogador).

**Giz como mecânica (com base em Alciatore):**
- Cada taco tem "nível de giz" de 0 a 100%. Cada tacada consome um pouco; tacadas com muito efeito consomem mais.
- Limite seguro de efeito = 0,5R com giz fresco, encolhendo linearmente até ~0,3R sem giz (valor de design, ajustável).
- Batida além do limite → probabilidade de miscue crescente: a branca sai fraca, com direção levemente aleatória e pouco efeito, com o som seco característico. Pela regra de bar, miscue em si não é falta; a falta só vem pelo resultado (cegar, direta, suicídio).
- Mostrar o estado do giz no HUD (ponta azul viva vs. desbotada) — e deixar como opção "Giz realista: ligado/desligado".
- Bônus de design útil: como a 50% de deslocamento já se tem cerca de 75% do efeito máximo (Alciatore, Billiards Digest, maio de 2009), o jogador cuidadoso que não abusa do efeito quase não perde nada — o giz pune o exagero, não o jogo normal.

### 7. Áudio

| Som | Fonte | Licença |
|---|---|---|
| Clique bola-bola | Freesound, "billiard ball clack", Za-Games | CC0 |
| Batida seca | Freesound, "Billiard balls single hit-dry.wav", juskiddink | CC-BY 4.0 (exige crédito) |
| Batidas, caçapa, arrumação | Pixabay, série "Billiard Sound 01–06", "Billiard Hole" e "Billiard Setup Sound" (Alex_Jauk) | Pixabay Content License, sem atribuição |
| Tacada na branca | ZapSplat, "Snooker cue strike cue ball…" | Listado como CC0 (a maioria do ZapSplat usa licença própria e exige conta) |

Nenhuma dessas fontes tem um som rotulado de "tabela"; o truque comum é usar uma batida curta com filtro passa-baixa. No código, varie volume e tom pela velocidade do impacto e limite sons simultâneos na quebra.

### 8. Assets 3D

- **Mesa, taco, triângulo e gaveta:** gerar por código (perfis extrudados para tabelas e bocas, torno/LatheGeometry para o taco). É o caminho certo aqui: a geometria da mesa precisa bater exatamente com a física.
- **Texturas e HDRI:** Poly Haven (CC0) para madeira, piso, paredes e HDRI de interior.
- **Ambiente de bar (opcional):** modelos de cadeira, balcão e luminária do Poly Haven (CC0) ou do Sketchfab/CGTrader — nestes, confira a licença de cada modelo (muitos são CC-BY ou têm licença comercial restrita).
- **Formato:** glTF/GLB comprimido (o tailuge usa gltfpack no build).

### 9. Referências existentes (com links)

| Projeto | O que é | Tecnologia / licença | Online | Efeito / força |
|---|---|---|---|---|
| tailuge/billiards — github.com/tailuge/billiards | Pool, snooker, três tabelas e sagu no navegador; jogável em billiards.tailuge.workers.dev | TypeScript + three.js, GPL-3.0, 249 estrelas | Sim (dois jogadores; lobby; placar no Vercel) | Sim; força segurando espaço ou pela roda do mouse; tem linha de mira que se liga e desliga |
| Forks do tailuge (ex.: velikodimov, liburce0412-alt "Break Builder 3D") | Treinos de três tabelas; oito bolas chinês, salas de amigos, IA | GPL-3.0 | Sim | Sim |
| pooltool — github.com/ekiefl/pooltool | Simulador científico por eventos + jogo 3D (Panda3D) | Python; artigo no JOSS 2024 (doi 10.21105/joss.07301) | Não | Sim; tacada com o mouse (puxar e empurrar) |
| Blog do Evan Kiefl — ekiefl.github.io | Série didática sobre a física e os algoritmos do bilhar | — | — | Leitura obrigatória para o motor |
| Dr. Dave (Alciatore) — drdavepoolinfo.com | Artigos e provas técnicas: miscue, squirt, throw, puxada | — | — | Fonte das constantes |
| MegaJogos Sinuca Brasileira — megajogos.com.br/sinuca-brasileira-online | Sinuca brasileira 3D por pontos, 2 jogadores, salas | Plataforma comercial | Sim | Referência de UX de câmera e salas |
| Sinuquinha — sinuquinhabrasil.net | App com Par ou Ímpar, Carioquinha e Bolinho | Comercial, valendo dinheiro | Sim | Mostra que existe demanda pela modalidade |

### 10. Plano por fases

| Fase | Entregas | Esforço estimado* | Riscos principais |
|---|---|---|---|
| 0 — Protótipo (1 página) | Mesa procedural, 16 bolas, física deslizar/rolar + colisões + tabela simples, taco com tacada por mouse, efeito, giz, câmera de tacada, regras básicas de par ou ímpar em "hot-seat" (2 jogadores no mesmo PC) | 1–3 sessões de trabalho comigo | Sensação da força e do pano |
| 1 — Jogo local completo | Motor com throw, squirt, tabela de Mathavan e caçapas reais; motor de regras configurável (todas as opções da seção 1); HUD; sons; qualidade gráfica média/alta; testes automáticos das regras | 3–6 fins de semana | Ajuste fino da física (exige jogar muito); bordas das caçapas "comendo" ou "cuspindo" bola |
| 2 — Online 1×1 | Sala com código, PartyServer/Durable Object, transmissão da gravação, reconexão, chat, deploy | 2–4 fins de semana | Primeiro deploy; casos de borda de reconexão |
| 3 — 3–4 jogadores e acabamento | Duplas, ranca-saia, três jogadores; espectadores; mira ao vivo; replays compartilháveis; histórico e ranking entre amigos (SQLite do Durable Object); ambiente de bar; massé/pulo | Contínuo | Escopo crescente; desempenho em PCs fracos |

*Estimativas para um hobby com um assistente de IA escrevendo a maior parte do código; não são medições.

**Riscos técnicos e mitigação:**
- **Física "sem graça":** mitigar com parâmetros expostos num painel de desenvolvedor (atrito do pano, restituição das bolas e da tabela, throw), comparação lado a lado com o tailuge e gravação de tacadas de teste padronizadas.
- **Tunelamento na quebra:** passo pequeno/sub-passos ou detecção de colisão por tempo de impacto (ou motor por eventos).
- **Determinismo:** resolvido pela gravação transmitida; nunca depender de duas simulações iguais.
- **Desempenho:** 16 bolas é pouco; o custo está nos gráficos — níveis de qualidade e resolução dinâmica.
- **Divergência de regras entre amigos:** a tela "Regras da casa" é escolhida antes da partida e fica gravada na sala.

### 11. O que eu (Claude) consigo construir de fato

**Consigo fazer bem:**
- Um **protótipo jogável numa única página/artefato** (HTML + three.js via CDN + física própria + regras + controles de mouse + efeito + giz + sons sintetizados por Web Audio) — você abre e joga no mesmo PC.
- O **projeto completo em múltiplos arquivos** (Vite + TypeScript, pacote compartilhado de física e regras, servidor PartyServer, testes), com instruções passo a passo de deploy (wrangler) e o arquivo de configuração das regras.
- Texturas procedurais (bolas numeradas, feltro), geometria procedural da mesa e do taco, integração de HDRI e texturas CC0.

**Limites honestos:**
- **Online de verdade precisa de servidor publicado por você.** Um artefato de página única não mantém uma sala WebSocket; você terá que criar uma conta grátis na Cloudflare e rodar alguns comandos que eu escrevo. Até lá, o protótipo é local (hot-seat).
- **Ajuste da física exige seus testes.** Eu escrevo os modelos e valores iniciais da literatura, mas "parece pano de bar?" só se responde jogando; espere vários ciclos de "está muito rápido / a puxada está fraca".
- **Arte de alto nível:** não modelo um taco esculpido ou um bar fotorrealista como um artista 3D; o caminho é geometria procedural bem feita + assets CC0. Dependendo do ambiente onde o artefato roda, carregar arquivos externos (HDRI, texturas) pode ser restrito — por isso o protótipo deve ser autossuficiente (texturas geradas por código) e os assets reais entram no projeto local.
- **Não consigo testar em rede com vocês** nem ouvir o som; a validação de sincronização e de áudio é sua.

## Recommendations

1. **Comece pela Fase 0 agora:** peça o protótipo de página única com mesa de bar 2,10×1,20 m, bolas de 54 mm, conjunto de regras "Boteco" e tacada por mouse com Pointer Lock. Isso valida o que mais importa — a sensação da tacada — antes de qualquer servidor.
2. **Física própria em TypeScript, com o tailuge como gabarito.** Não use motor genérico; não faça fork logo de cara (GPL e base grande), mas mantenha-o como plano B.
3. **Regras como dados desde o primeiro dia** (`regras.json` + tela "Regras da casa"), com o padrão "Boteco" e as variantes da seção 1.
4. **Online por "gravação da tacada" + Cloudflare Durable Objects (PartyServer).** É grátis no seu volume, aguenta reconexão e elimina o problema de determinismo. Evite a hospedagem compartilhada do PartyKit e WebRTC.
5. **Gráficos em three.js com WebGLRenderer**; HDRI do Poly Haven, clearcoat nas bolas, sheen no feltro, luminária de bar, sombras de contato. WebGPU só como evolução.
6. **Giz com base física, mas configurável:** limite seguro 0,5R com giz e menor sem giz; miscue probabilístico só além do limite.
7. **Para 3–4 jogadores, priorize o ranca-saia** (é como se joga no bar e é trivial na arquitetura de salas); duplas em seguida.

## Caveats

- **Regras de bar são folclore escrito:** as fontes são blogs, locadoras, regulamentos de torneios locais e comentários de leitores, que se contradizem (o próprio dono do Sinuca de Boteco erra e é corrigido nos comentários). A "regra carioca" de campeonato consultada manda arrumar as bolas "sem a bola 8", o que deixaria grupos desiguais (8 ímpares contra 6 pares) — provável erro da fonte ou variante incomum, não adotada aqui. A ordem de tacada dentro da dupla não aparece em nenhuma fonte encontrada; a proposta é decisão de design.
- **Preços e limites de nuvem mudam:** os números da Cloudflare, do Supabase e do Colyseus refletem a documentação e os resumos de 2025–2026; confira antes do deploy. Os problemas de deploy do PartyKit vêm de relatos em pull requests no GitHub, não de comunicado oficial.
- **Suporte a WebGPU:** no Linux e em Macs Intel com Firefox ainda está "em progresso" segundo o web.dev — mais um motivo para WebGL2 como base.
- **As estimativas de esforço são juízo de engenharia**, não dados medidos; dependem do quanto vocês vão testar e do nível de acabamento desejado.
- **Licenças:** CC-BY (ex.: o som do juskiddink) exige crédito na tela de créditos; o GPL-3.0 do tailuge se aplica a qualquer código copiado dele. O app Sinuquinha envolve apostas com dinheiro — citado só como referência de mercado.
