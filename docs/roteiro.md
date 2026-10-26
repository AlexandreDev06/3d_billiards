# Roteiro

Fases de §10 do estudo quebradas em lotes. `‖` separa trabalhos paralelos (pastas disjuntas). O Principal marca `[x]` quando o lote passa na revisão e registra o veredito em `sinuca-status`. Lotes das fases 1–3 são detalhados ao fechar a fase anterior.

## Fase 0 — protótipo hot-seat (no monorepo)

Objetivo: validar a sensação da tacada. Saída: o usuário joga uma partida inteira de par ou ímpar no mesmo PC e aprova (ou lista ajustes de sensação).
Time ativo: Taco, Feltro, Juiz (Giz ficou de fora para poupar limite). O estudo já cobre o design da Fase 0 (§1 e §6), então o Boteco fica de fora; a Sala também.

- [x] **Base** (2026-10-08, feito direto pelo Principal): monorepo, medidas, cena estática com mesa, bolão e taco.
- [x] **L0** Taco: contratos de `packages/fisica` (`tipos.ts`, `ConfigFisica`, RNG, triângulo, gravação de teste) e pacote `packages/regras` com tipos, preset Boteco em JSON e stubs.
- [x] **L1** (+ L2b e L2c de ajustes da revisão) Taco: física v0 (estados da bola, deslizar→rolar, efeito, bola-bola com throw simples, tabela com contato acima do centro, caçapas com quinas, instante de contato, taco-bola com squirt e miscue, `simularTacada`) com testes golden. ‖ Feltro: as 16 bolas (cor por número, sem textura), player de `Gravacao`, controles de §6 (mira com Shift fina, câmera orbital e vista de cima, tacada com Pointer Lock, efeito no mini-bolão, giz) produzindo `ParametrosTacada`.
- [x] **L2** (+ L2b de integração) Taco: regras v0 (`novaPartida`, `aplicarTacada` puros) com testes por cenário. ‖ Feltro: laço hot-seat ligando física + regras, HUD de vez/grupo/bolas/falta. (os cenários golden ficaram nos testes dos próprios pacotes; `testes/cenarios/` e `e2e/` do Giz ficam para a Fase 1).
- [x] **L3** Feltro: áudio sintetizado, painel dev de física (F1) e acabamento do HUD (o painel ficou com o Feltro, que é dono da UI). Giz não foi recrutado na Fase 0, para poupar limite: a cobertura veio dos testes por mutação de cada lote e das partidas pelo gancho no Chrome.
- [x] **Fechamento técnico**: varredura do Juiz (passou, 0 crítico/alto) → L3b de ajustes (Taco e Feltro).
- [ ] **Aprovação do usuário**: jogar, ajustar a sensação no painel (F1) e responder `sinuca-perguntas`.

## Fase 1 — jogo local completo

Throw, squirt, tabela Mathavan e caçapas reais (quinas); todas as opções de "Regras da casa" + tela; sons completos; qualidade gráfica (HDRI, clearcoat, sheen, sombras de contato, pós-processamento com níveis); suíte de regras completa.

## Fase 2 — online 1×1 (antecipada em 2026-10-09, auto-hospedada via ngrok)

- [x] **L4/L4b** Feltro: mesa visual nova (antes de tudo, pedido do usuário).
- [x] **L5** (+ L5b de segurança) Sala: `packages/protocolo` + `apps/sala` (Node + ws, estático + /sala na 8001, `pnpm online`). ‖ Taco: duplas em `packages/regras` (rodízio, `passarVez`).
- [x] **L6** Feltro: linha de previsão de teste no painel dev (pedido do usuário).
- [x] **L7** Feltro: cliente online (tela inicial, sala de espera, partida online, mira ao vivo, reconexão). Depois: Principal sobe com ngrok e testa com dois navegadores.

- [x] **L8/L8b/L9** (depois da 1ª sessão com amigos): Feltro → configurações do jogador (sensibilidade), aviso de "só falta a 8", qualidade gráfica automática (o amigo ficou a ~10 fps) e F3 de diagnóstico ‖ Sala → relógio da tacada (padrão 30 s, perde a vez) e motivo das quedas no log ‖ Taco → 8 como bola final (sem a 1 e a 15) e caçapas mais abertas (8,5/9,5 cm) com quinas que guiam a bola. Depois: ajuste visual da mesa às medidas novas, HUD do relógio, reiniciar o servidor no ar.

- [x] **L15** (pedidos do usuário, 2026-10-14):
  - Taco/física: caçapa funda.
  - Taco/regras: mata-mata.
  - Feltro: taco sem atravessar, força por linha (puxar e soltar), giz novo e alerta de espirrada, ainda com a configuração local.
- [x] **L16** Sala: modalidade e catálogo de modos no protocolo, mata-mata na sala, giz e força como regras da sala, placar com N lados, `PROTOCOLO_VERSAO` 3.
- [x] **L17** Feltro:
  - lobby com o catálogo de modos e as regras de giz e força (online e no mesmo PC);
  - HUD e fim do mata-mata;
  - buraco visual da caçapa funda.
- [x] **L18** (pedido do usuário, 2026-10-16) emojis na sala: Sala → `emoji`/`emoji-retransmitido`, lista fechada de 8, `PROTOCOLO_VERSAO` 4; depois Feltro → teclas 1 a 8 e botão, bolhas "Nome 😂" no alto da tela.
- [x] **L19** (pedido do usuário, 2026-10-16) suicídio no mata-mata perde a próxima vez: Taco → opção nas regras e no preset; Sala → esquema da partida; Feltro → HUD e aviso.
- [x] **L20** (pedido do usuário, 2026-10-16) emojis personalizáveis: Sala → catálogo de 40 e `EMOJIS_PADRAO`, versão 5 ‖ Feltro → cada aparelho escolhe os seus 8.
- [x] **L21** (pedido do usuário, 2026-10-16) cegar no mata-mata também perde a próxima vez: Taco → opção `cegarNoMataMata`; depois Sala confere os testes e Feltro ajusta os textos.
- [x] **L22** (pedidos do usuário, 2026-10-21): Sala → carteira no servidor, aposta da sala, pote ao vencedor, loja de skins, versão 6 (o Juiz pediu ajuste: L25) ‖ Feltro → taco realista com as 8 skins no desenho e a câmera com a bola perto da tabela.
- [x] **L23** Feltro: balão com mãos (minha vez: só as mãos; online, o balão do outro inteiro) e a animação do giz.
- [x] **L24** Feltro: carteira, loja, aposta no lobby, moedas no fim, skins dos outros online e o giz do outro ‖ Sala: `giz` na mira.
- [x] **L25** Sala: ajustes da revisão do L22 (nova-partida sem o ausente, trava do arquivo das carteiras, teto de 2 min na vez apostada, baldes de criação).
- [x] **L26** Sala: ajustes da revisão do L25 (fim do balde global de criação, gravação depois da trava, trava com boot_id).
- [x] **L27** Feltro: mãos de personagem (malha procedural com esqueleto, ponte aberta em V, punho solto, pinça do giz).
- [x] **L27b** Feltro: a mão de trás no fundo da tela, sem se amontoar com a ponte.
- [x] **P1** Pincel (artista, novo): piloto do personagem no Blender (mão com esqueleto, poses e joinha em `.glb`, comparada com o L27). Decide como seguem o L28, o L29 e o L30.
- [x] **L28** Feltro: a mão do Blender (`mao.glb`) no jogo, com o joinha ao encaçapar, e o `packages/personagens` genérico (carregar, tingir, nível, espelhar, poses e gestos); sai a malha procedural.
- [x] **P1c** Pincel: boca do punho fechada e o balão no Blender (corpo, rosto 3D com 5 caras, piscar, olhar, 6 ações).
- [x] **L29** Pincel faz as poses e os gestos que faltam (6 pontes, tapinha, quase, palmas, tamborilar) e o Feltro faz a escolha pelo lugar e as reações.
- [x] **L30** Feltro: o `balao.glb` no jogo (olhos seguindo a bola, caras pela gravação, estufar e murchar no fim).
- [ ] **L31** (pedido do usuário, 2026-10-26) missões diárias: Sala → catálogo e mensagens no protocolo (versão 7), conferência das missões pela gravação, progresso na carteira e 50 moedas por missão. Juiz revisa (dinheiro e contrato).
- [ ] **L32** Feltro: painel "Missões do dia" no lobby e aviso de progresso e de missão cumprida na partida.
- [ ] **L33** (pedido do usuário, 2026-10-26) skins de taco no estilo do CS: Boteco → análise e catálogo em `docs/design/skins-de-taco.md`, com nomes e artes próprios; o usuário aprova e daí saem os lotes do Pincel, do Feltro e da Sala. (Feito; aprovado pelo usuário com semente e contador já no primeiro lote.)
- [ ] **L34** Sala: catálogo de 21 skins com faixas, vitrine do dia (3 a 20%), itens por carteira com semente sorteada na compra e contador de bolas, migração do `carteiras.json`, versão 8. ‖ **P2** Pincel: pinturas da *Coral*, *Bicho Solto*, *Corujão* e *Dragão das Quinze*.
- [ ] **L35** Feltro: tramas novas, semente, iridescência e brilho, textura pintada, contador no cabo, loja com faixas e vitrine.

Plano original desta fase:

Sala entra: `packages/protocolo`, `apps/sala` (PartyServer/DO), código de sala, envio e retransmissão da gravação, reconexão com token, chat; `wrangler dev` local. Deploy e conta Cloudflare são do usuário: só com pedido explícito.

## Fase 3 — 3–4 jogadores e acabamento

Ranca-saia, duplas, três jogadores; espectadores; mira ao vivo; replays compartilháveis; histórico e ranking (SQLite do DO); ambiente de bar; massé/pulo.
