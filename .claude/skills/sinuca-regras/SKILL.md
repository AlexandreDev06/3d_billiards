---
name: sinuca-regras
description: Use ao criar, alterar, testar ou revisar as regras do par ou ímpar e do mata-mata (packages/regras) — presets "Boteco" e "Mata-mata", modalidades e formações aceitas, opções da tela "Regras da casa", faltas e penas, castigo, saída, vez, vitória, modos de 3–4 jogadores — ou ao decidir como uma regra de bar vira dado.
---

# Regras do par ou ímpar e do mata-mata (`packages/regras`)

Regra de boteco é folclore: cada turma joga de um jeito. Por isso **regras são dados** (preset JSON + config da partida) e o motor é uma função pura. Fonte: estudo §1 (`sed -n '/^### 1\./,/^### 2\./p' docs/estudo-viabilidade.md`); nunca invente variante sem origem.

## Forma do motor

```text
novaPartida(config, jogadores, rng) → { partida, arrumacao }   (arrumacao = ids na ordem das vagas de mesaInicial; com 14 o centro fica vazio; com 13 as pontas da base, e a bola final vai no centro, índice 4)
aplicarTacada(partida, eventos: EventoTacada[]) → { partida, consequencias }   (a config vive em partida.config)
passarVez(partida) → partida   (a sala pula quem caiu: a vez passa à outra equipe, como numa tacada sem falta que não encaçapou)
```

Duas modalidades (`ConfigRegras.modalidade`, L15): `par-ou-impar` (tudo abaixo, salvo a seção "Mata-mata") e `mata-mata`. `aplicarTacada`, `passarVez` e `novaPartida` despacham por ela no começo; o resto da config só vale no `par-ou-impar`. Mais o **treino** (L39, seção própria abaixo): não é um valor de `modalidade`, é `ConfigRegras.treino: true` sobre o mata-mata, e o despacho olha `ehTreino(config)` antes dela.

`packages/regras` não monta mesa nem resolve coordenada: devolve ids e lugares semânticos (`LugarMesa`). Quem joga (hot-seat em `apps/web`, sala na Fase 2) monta a mesa com `fisica.mesaInicial` e resolve lugares com `fisica.lugares` + `posicaoLivre`.

Pipeline, nesta ordem:

1. **Fatos da tacada** a partir dos eventos da física: primeira bola tocada pela branca (ou nenhuma), bolas encaçapadas em ordem, branca caiu, bola saiu da mesa, castigo caiu.
2. **Faltas**: suicídio, cegar, direta (tocar primeiro bola do adversário), branca fora da mesa, castigo fora de hora; bola numerada fora da mesa só com `bolaForaDaMesa: 'falta'`.
3. **Pena** conforme config (simples, direta = N, acumulada); **sem pena dupla** quando a config manda.
4. **Grupos**: define par/ímpar se ainda indefinido (regra de saída da config).
5. **Vez**: continua só se encaçapou bola sua sem falta (`quemContinua`); senão a roda anda um (`ordemDaVez`).
6. **Fim**: vitória, derrota (ex.: castigo antes da hora), próxima saída (perdedor, alternado, ranca-saia).

`consequencias` é o que o cliente mostra e anima: faltas com nome, bolas retiradas ou devolvidas, onde a branca volta, quem joga, vencedor.

Como o L2 leu o estudo (código em `src/partida.ts`, frase do HUD em `src/texto.ts`):

- **Bola final (L8):** "castigo" nas chaves `castigo*` é a bola final (`bolaFinal`): a 8 no Boteco, a 1 em `1-15`; `ultima-do-grupo` = sem bola final. `validarPreset` recusa bola final fora de `bolas` e grupos de tamanhos diferentes (só fecham 2-14 + 8, 1-15 + 1, 2-15 sem final). `grupoDaBola(bola, config)` precisa da config: a bola final e as que a casa não usa não têm grupo.
- **Bola final na saída:** com `castigoInicio: 'centro-triangulo'` (Boteco) ela está no triângulo e em jogo na saída; caindo nela vale `castigoNaSaida` (`volta` para `castigoLugar` sem falta, e o resto da tacada vale; `antes-da-hora`; `vence` = como na hora dela). Com `depois-da-saida` (opção 1-15) fica fora do triângulo, entra pelo `recolocar` da saída em `castigoLugar` ("após a quebra", §1), conta em `naMesa` desde o início e eventos com ela durante a saída são ignorados.
- **Pena usa os grupos do início da tacada:** falta na tacada que define o grupo segue `penaSemGrupo`. A pena escolhe entre as bolas que sobraram na mesa depois das quedas; bola que pulou e foi paga sai de vez.
- **Bola da vitória:** a bola final ou, sem ela (`2-15`), a última do grupo. Caindo com suicídio: `castigoEBrancaJuntos`; com outra falta: `castigoComFalta`; quando volta, vai para `castigoLugar` (a 8: marca do pé, `LugarMesa` `marca-pe`). Sem bola final, quem fica sem bolas do grupo pela pena ou pela mão do adversário vence com `ultimaPorPenaOuAdversario: 'vence'`; com `'volta'`, a pena não tira a última e, encaçapada pelo adversário, ela volta para `castigoLugar` e ele perde a vez (`Pena.poupada` e `voltaDeles` levam isso à frase).
- **Toque simultâneo** (eventos da branca a menos de 1 µs): vale se uma das bolas for do alvo. A física dá o mesmo `t` aos choques que resolve em grupo (começam até `janelaChoqueSimultaneo` = 0,1 ms um do outro), então o bolão que pega duas bolas nessa janela cai aqui. Toque com velocidade normal abaixo de `velocidadeMinimaChoque` (1 mm/s) não vira evento, então não conta como toque: a bola andaria menos de 5 µm.
- **Fim:** `consequencias.proximo` = quem sai na próxima (`proximaSaida`); `novaPartida` sempre começa por `jogadores[0]`, e `jogadoresDaProxima` gira a roda para isso.
- **Equipes de 1 ou 2 (L5 duplas, L13 2×1)**: `jogadores` é a roda, em 2 equipes (0 e 1) de 1 ou 2 jogadores, alternando as equipes: 2 (1×1), 3 (2×1: A1, B1, A2; com a equipe de 1 saindo, B1, A1, A2) ou 4 (A1, B1, A2, B2); `novaPartida` recusa outra coisa com mensagem (conta, equipes 0/1 com 1 ou 2, alternância, id repetido). A vez alterna entre as equipes e cada equipe reveza os seus na ordem em que aparecem em `jogadores` (2×1: A1 → B1 → A2 → B1; quem está sozinho joga todas as vezes da equipe). Com equipes desiguais a roda precisa de memória: `EstadoPartida.proximoDaRoda` = quem começa a próxima vez da outra equipe, só quando não é o primeiro dela depois de `vezDaRoda ?? vez` em `jogadores` (na prática, na vez de quem está sozinho; nunca no 1×1 nem no 2×2, e o fim apaga). Grupo, pena, objetivo e vitória são da equipe (`Jogador.equipe`). Perder a mesa passa a vez a partir de quem a roda escolheu; com `quemContinua: 'parceiro'` o taco passa entre os dois enquanto encaçaparem e `vezDaRoda` guarda quem começou a vez (ausente = `vez`, então o 1×1 não muda). Quem sai na próxima: o primeiro da equipe escolhida por `proximaSaida` depois de `jogadores[0]`, e `jogadoresDaProxima` refaz a roda (`intercalar` de `src/roda.ts`: X1, Y1, X2, Y2 sem quem não existe) de modo que cada equipe de 2 alterna quem sai e a de 1 sai sempre com o mesmo. A frase do HUD usa a equipe ("Ana e Caio recebem a 2", "Beto recebe a 3"; no 1×1, igual a antes).
- **Leitura para o HUD** (`src/leitura.ts`): `bolasDaCasa`, `grupoDaBola(bola, config)`, `bolaDeCastigo` (a bola final), `nomeDaBolaFinal` ("a 8" / "o castigo"), `rotuloDaFalta` ("A 8 fora de hora"), `bolasRestantes`, `objetivo`, `ROTULO_FALTA`, `jogadoresDaProxima`.
- **Bolas alvo (L11)**: `bolasAlvo(partida, jogador = partida.vez)` = as bolas que o jogador pode tocar primeiro sem falta de toque (`direta`, `castigo-fora-de-hora`), em ordem: mesa aberta, as numeradas em jogo (a bola final só com `castigoPrimeiroMesaAberta: 'livre'`; na saída com `depois-da-saida` ela ainda não está na mesa); com grupo, as do grupo da equipe; no castigo, só a bola final; partida encerrada, nenhuma. `aplicarTacada` decide essas faltas pela mesma lista (sem tocar alvo: "fora de hora" se só a bola final foi tocada, senão direta), então o web destaca as bolas e avisa "bola errada" sem reimplementar regra.

## Mata-mata (L15, pedido do usuário de 2026-10-14)

"Free for all": 2 a 4 pessoas, cada uma por si, as 15 bolas (1–15), sem grupos, bola final nem castigo. Respostas dele: ganha quem matar mais bolas; falta sem pena. Preset `presets/mata-mata.json` (nada provisório). Código: `src/mata-mata.ts` (`aplicarMataMata`, `passarVezMataMata`, internos, chamados por `aplicarTacada`/`passarVez`), `src/fatos.ts` (fatos da tacada e `faltaDoToque`, divididos com o par ou ímpar), `src/modalidades.ts` (catálogo), frase em `textoDoMataMata` (`src/texto.ts`).

- **Equipes:** cada jogador é a sua equipe (`Jogador.equipe` = 0..N−1, uma por jogador, na ordem de entrada na primeira partida). `grupos` tem uma entrada `null` por equipe, para sempre; `fase` é `saida`, `aberta` e `fim`. `novaPartida` embaralha as 15 no triângulo (sem bola no centro).
- **Vez:** depois de cada tacada a vez anda um na roda (`(vez + 1) % n`), mate ou não, pulando quem perde a vez (abaixo); sem `vezDaRoda` nem `proximoDaRoda`. `passarVez` faz o mesmo sem tacada.
- **Suicídio e cegar perdem a próxima vez (L19 e L21, pedidos do usuário de 2026-10-16):** a pena do suicídio é a L19 e a de cegar é a L21, a mesma mecânica; cada falta tem a sua opção (`suicidioNoMataMata` e `cegarNoMataMata`, abaixo) e as duas na mesma tacada dão uma entrada só na lista.
- **Suicídio (L19):** `ConfigRegras.suicidioNoMataMata` (`sem-pena` | `perde-proxima-vez`; o preset do mata-mata liga, o Boteco fica em `sem-pena`; `validarPreset` recusa `perde-proxima-vez` no par ou ímpar, em vez de aceitar uma escolha que não faria nada). Vale para a branca na caçapa e para a fora da mesa (os dois casos de `brancaVolta`), não para `bola-fora` (cegar tem a opção própria, L21, abaixo). Estado: `EstadoPartida.perdemAProximaVez?` = índices de `jogadores` crescentes e sem repetição; **ausente = ninguém** e as regras só escrevem o campo quando há alguém (par ou ímpar e partida sem suicídio têm a forma de sempre). Quem cometeu entra na lista e a vez passa como sempre; `andarARoda` (interno de `mata-mata.ts`) dá a vez a quem vem depois: se esse está na lista, sai dela e é pulado, e repete até achar alguém fora; cada pulo gasta uma entrada, então não há laço (todos na lista = a roda consome tudo e para em quem vem logo depois de quem tacou; no 1×1 o outro joga duas seguidas). `passarVez` (tempo esgotado, queda) usa a mesma roda e não pune quem teve a vez passada. Partida que acaba (`proximo` = 1) não consulta a lista e o estado final não a leva; `novaPartida` começa sem ela. `consequencias.proximo` e `partida.vez` já saem com o pulo; a frase diz "Suicídio! Ana perde a próxima vez. Branca na marca." e, no pulo, "Ana perdeu a vez: joga Beto" ("Ana e Beto perderam a vez: joga Caio"). Com `sem-pena` a frase é a de antes.
- **Cegar (L21):** `ConfigRegras.cegarNoMataMata` (`sem-pena` | `perde-proxima-vez`), em `OPCOES_REGRAS`, com a mesma validação (`validarPreset` recusa `perde-proxima-vez` no par ou ímpar, num laço sobre as duas chaves em `incoerenciasDaConfig`); `mata-mata.json` liga e `boteco.json` fica em `sem-pena`. Cegar é `f.primeiro.length === 0` (a branca não tocou bola) e põe quem tacou na mesma lista, pela mesma `andarARoda`; a branca não se mexe por causa disso (só o suicídio ou a branca fora a recolocam). `perde = !terminou && (suicídio punido || cegar punido)`: as duas faltas juntas (cegar e a branca na caçapa ou fora, o caso comum de uma tacada que não toca nada e cai) dão **uma entrada só**, e `passarVez` não pune. Partida que acaba não pune. Frase: "Cegou! Ana perde a próxima vez. Vez de Beto." (sem "Branca na marca", que só aparece se a branca voltou) e "Cegou e suicídio! Ana perde a próxima vez. Branca na marca." com as duas; com a opção `sem-pena` a frase é a de antes ("Cegou! Falta sem pena."). As opções são independentes: a casa pode punir só uma das faltas.
- **Pontos:** 1 por bola encaçapada, para quem tacou, inclusive na saída e na tacada com falta (`pontosPorEquipe(partida)` em `leitura.ts`, índice = equipe, conta `encacapadas`). A bola que só bate na caçapa e volta não conta; a numerada que pula da mesa fica na mesa e volta em `bolaDevolvidaLugar`.
- **Faltas sem pena de bola:** `cegar`, `suicidio`, `branca-fora` e, só com `bolaForaDaMesa: 'falta'`, `bola-fora` são reconhecidas (com `cegarNoMataMata: 'sem-pena'`, "Cegou! Falta sem pena."; com `suicidioNoMataMata: 'sem-pena'`, "Suicídio! Falta sem pena: branca na marca."), mas `retirar` é sempre `[]` e nada sai da mesa; a única pena é a vez do suicídio e de cegar (acima), e `bola-fora` nunca custa a vez. Não existem `direta` nem `castigo-fora-de-hora`: qualquer bola é alvo. A branca que cai ou sai volta a `brancaAposSuicidio` (`marca-saida`) pelo `recolocar`, por último.
- **Fim:** quando `naMesa` esvazia. Ganha quem tem mais pontos; empate: entre os empatados, quem encaçapou bola por último (`encacapadas` em ordem de queda, a da própria tacada final incluída). `consequencias.proximo` e `partida.vez` no fim = 1 (o seguinte a quem saiu, `jogadores[0]`). Bola que pula na última tacada não acaba a partida (continua na mesa).
- **Próxima partida:** `jogadoresDaProxima` gira a roda para começar por `jogadores[vez]` (= o seguinte); ninguém é renumerado (a equipe segue a pessoa), por isso `novaPartida` aceita as equipes 0..N−1 em qualquer ordem, uma por jogador.
- **Leitura:** `objetivo` = `qualquer` sempre; `bolasAlvo` = todas as bolas da mesa; `grupoDaBola` dá `null` para toda bola por causa da modalidade (a paridade não vale), e `bolaDeCastigo` e `nomeDaBolaFinal` dão `null` porque `bolaFinal` é `ultima-do-grupo`; quem passa só um pedaço da config sem `modalidade` (como `{ bolas, bolaFinal }`) lê como par ou ímpar.
- **Coerência:** `validarPreset` e `novaPartida` exigem, no mata-mata, `bolas: '1-15'` e `bolaFinal: 'ultima-do-grupo'` (`incoerenciasDaConfig`); não cobram grupos iguais (8 ímpares × 7 pares). Ao contrário, `validarPreset` do par ou ímpar recusa `suicidioNoMataMata` e `cegarNoMataMata` em `'perde-proxima-vez'` (as opções só existem no mata-mata); `novaPartida` do par ou ímpar não confere isso.
- **Catálogo de modos:** `formacoesAceitas(config)` devolve os tamanhos das equipes da modalidade: par ou ímpar `[1,1] [2,1] [1,2] [2,2]`, mata-mata `[1,1] [1,1,1] [1,1,1,1]`. A sala e o lobby montam a escolha de modo por ela (com `ROTULO_MODALIDADE`, `rotuloDaFormacao`, `PRESETS_DE_FABRICA`), e `novaPartida` recusa com "o Mata-mata não aceita ...; aceita 1×1, 1×1×1, 1×1×1×1" o que estiver fora. Modalidade nova = preset + um valor em `Modalidade`/`OPCOES_REGRAS.modalidade` + uma linha em `FORMACOES` + um ramo em cada `switch (modalidade)` (o TypeScript lista o que falta) + uma linha em `CENARIOS` de `partida.test.ts` (a tabela cobra um cenário por valor de opção).

## Treino (L39, pedido do usuário de 2026-10-26: modo treino sozinho)

Uma pessoa sozinha, as 15 bolas, sem grupo nem pontos que valham. Dado: `presets/treino.json` (`PRESET_TREINO`, mata-mata com as duas penas em `sem-pena` e `"treino": true`); código: `src/treino.ts` (`aplicarTreino`, interno, chamado por `aplicarTacada`; `sincronizarMesa`, exportada), `textoDoTreino` em `src/texto.ts`, `ehTreino(config)` e a formação `[[1]]` em `src/modalidades.ts`.

- **Por que uma chave e não um valor de `Modalidade`:** `MODOS_POR_MODALIDADE` (protocolo) é um `Record<Modalidade, …>` e a sala confere `MODALIDADES_DE_SALA` contra `OPCOES_REGRAS.modalidade`; um valor novo quebraria os dois e levaria o treino ao catálogo da sala. `treino?: true` é opcional, fica **fora de `OPCOES_REGRAS`** e de `PRESETS_DE_FABRICA`, e `validarPreset(dado)` o recusa ("só local"): a sala valida com essa chamada, então um cliente não abre sala de treino. `PRESET_TREINO` usa `validarPreset(treino, { aceitaTreino: true })`. `incoerenciasDaConfig` do treino: modalidade `mata-mata`, as 15 bolas, sem bola final, `suicidioNoMataMata` e `cegarNoMataMata` em `sem-pena`.
- **Vez fixa:** `vez` e `consequencias.proximo` ficam em quem treina (0); `passarVez` devolve a partida como está; nunca `perdemAProximaVez`. `novaPartida` só aceita uma pessoa na equipe 0 (`formacoesAceitas` = `[[1]]`).
- **Falta sem pena:** `cegar`, `suicidio`, `branca-fora` (e `bola-fora` só com `bolaForaDaMesa: 'falta'`) vêm em `consequencias.faltas`; `retirar` é sempre `[]`, nada de castigo nem de bola devolvida por pena. A numerada que pula volta a `bolaDevolvidaLugar` (mantém a mesa; não é pena). A frase diz "Cegou! Falta sem pena."
- **Branca na mão:** branca caída ou fora da mesa traz `Consequencias.brancaNaMao: true` (opcional; ausente nas outras tacadas e modalidades), e `recolocar` leva a branca à marca de saída como lugar de partida. A mão a qualquer hora é do web.
- **Fim da mesa:** a tacada que encaçapa a última bola dá `fase: 'fim'`, `vencedor: 0` (a pessoa), "Mesa limpa!". Mesa esvaziada à mão e tacada sem bola não acabam nada.
- **`sincronizarMesa(partida, naMesa)`:** depois de o jogador arrumar a mesa, alinha a partida às numeradas que ficaram nela (o bolão na lista é ignorado). Quem saiu da lista sem ter caído vai para `retiradas` (não vira ponto); quem estava em `retiradas` ou `encacapadas` e voltou, sai de lá e volta a `naMesa` (ordenada); partida em `fim` com bola na mesa reabre (`aberta`, sem vencedor); esvaziar à mão nunca encerra. Lança para bola de fora de 1–15, repetida e partida que não é de treino. Mover bola não muda a lista de ids, então não pede chamada.
- **Testes:** `src/treino.test.ts` (novaPartida, vez fixa, falta sem pena, branca na mão, fim da mesa, `sincronizarMesa`, preset e `validarPreset`, partidas ao acaso com arrumação; `SOLO`, `configTreino`, `treinoCom` de `para-testes.ts`). Mutações: `.outros/lote-39/mutar-dev.py` (28).

## Preset "Boteco" (de fábrica — estudo §1, último parágrafo, com as respostas do usuário de 2026-10-09)

| Chave (nome sugerido; o contrato real é `packages/regras/src/tipos.ts`) | Valor |
| --- | --- |
| `bolas` | `2-14`: sem a 1 e a 15, 13 bolas, ímpares 3–13 × pares 2, 4, 6, 10, 12, 14 (resposta do usuário; opções `1-15`, `2-15`) |
| `bolaFinal` | 8: "a 8 deve ser sempre a última", mesma mecânica do castigo (opções 1, `ultima-do-grupo`) |
| `castigoInicio` | `centro-triangulo`: a 8 no meio da 3ª fileira (opção `depois-da-saida`, a 1 entrando na tabela do lado da saída) |
| `castigoLugar` | `marca-pe`: para onde a 8 volta (**provisório**; opção `tabela-lado-saida`) |
| `castigoNaSaida` | `volta`: a 8 na saída volta à marca do pé, sem falta (**provisório**; opções `antes-da-hora`, `vence`) |
| `castigoQuando` / `castigoAntesDaHora` | só em tacada separada, depois do grupo; antes da hora = derrota |
| `definicaoGrupo` | primeira bola encaçapada |
| `saidaComDoisGrupos` | vale a primeira que caiu, e o jogador perde a vez |
| `pena` | paga a menor do adversário; direta = 1 (opção: 2); sem pena dupla |
| `brancaAposSuicidio` | volta à marca da saída (encostada na bola que estiver lá) |
| `bolaVoltouDaCacapa` | não encaçapada |
| `castigoComFalta` | o castigo volta e vale a falta (**provisório**) |
| `bolaDevolvidaLugar` | centro da mesa, para bola que pulou ou que a pena invertida devolve (**provisório**; §1 também cita "perto de onde saiu") |
| `bolaForaDaMesa` | `sem-falta` (**provisório**; opção `falta`, que paga como as outras: falta `bola-fora`) |
| `ultimaPorPenaOuAdversario` | só em `2-15`: `vence` (**provisório**; opção `volta`: a última só sai pela mão do dono) |
| `penaInvertidaBola` | `menor` das encaçapadas do faltoso (**provisório**; opções `maior` e `ultima`, a que caiu por último) |
| `ordemDaVez` | `alternada`: A1 → B1 → A2 → B2; no 2×1, A1 → B1 → A2 → B1 (**provisório**; proposta do estudo, nenhuma fonte define; o 2×1 é pedido do usuário) |
| `quemContinua` | `mesmo-jogador` (**provisório**; opção `parceiro`: o taco passa ao parceiro enquanto a dupla encaçapar) |
| `suicidioNoMataMata` | `sem-pena`: a chave só vale no mata-mata (lá o preset liga `perde-proxima-vez`); aqui a falta já paga com bolas |
| `cegarNoMataMata` | `sem-pena`: idem, para cegar (L21) |

As demais variantes da tabela "Regras da casa" de §1 viram opções com o mesmo nome em todo lugar (config, tela, testes).

## Casos que o estudo não fecha (perguntar via Brainstormer, nunca decidir no código)

- Pena antes de os grupos estarem definidos (de quem é "a menor do adversário"?).
- Tocar primeiro o castigo com a mesa aberta.
- Branca e castigo caindo na mesma tacada.
- Ordem dos parceiros nas duplas (`ordemDaVez`, proposta do estudo: A1 → B1 → A2 → B2; no 2×1, A1 → B1 → A2 → B1, pedido do usuário) e quem taca depois de encaçapar (`quemContinua`).
- Castigo (em `2-15`, a última bola) caindo na hora certa numa tacada com direta ou bolão fora da mesa.
- Bola numerada que pula da mesa: é falta (`bolaForaDaMesa`)? Volta perto de onde saiu ou no centro (`bolaDevolvidaLugar`)?
- Em `2-15`, perder a última bola por pena ou pela mão do adversário dá a vitória (`ultimaPorPenaOuAdversario`)?
- Pena invertida: qual bola volta (`penaInvertidaBola`, hoje a menor) e onde (`bolaDevolvidaLugar`).
- A 8 caindo na saída (`castigoNaSaida`) e para onde a 8 volta no meio da partida (`castigoLugar`).

Enquanto não houver resposta: o preset usa um valor provisório conservador, lista a chave em `"provisorio": [...]` no próprio JSON, e a pergunta vai para `.outros/perguntas.md`. O jogo nunca trava por falta de decisão.

## Invariantes (testar todas)

- Função pura: mesma entrada, mesma saída; não muta a entrada.
- Conservação: bolas na mesa + encaçapadas + retiradas = conjunto da config.
- Sempre exatamente um jogador (ou dupla) com a vez; a partida termina uma vez só.
- Roda: perder a mesa passa a vez à outra equipe a partir de `vezDaRoda ?? vez` (equipes iguais: anda um em `jogadores`, sem `proximoDaRoda`); continuar não move a roda nem `proximoDaRoda`; cada equipe reveza quem começa a vez dela, na ordem em que entrou, e a de 2 alterna quem sai na próxima.
- Pena nunca tira bola do grupo do faltoso (exceto a opção "pena invertida", que devolve uma dele à mesa).
- Nenhum `if` de regra de casa fora da leitura da config.

## Testes

Tabela de cenários: `estado inicial + eventos sintéticos + config → estado esperado + consequências`. Cada linha do preset Boteco e cada opção da casa tem pelo menos um caso; os cenários não dependem da física (eventos escritos à mão).

- `src/para-testes.ts`: `partidaCom` (mesa no meio do jogo), `eventos` (tacada escrita à mão), `rngDeTeste`, `congelar`; `CASTIGO_1` e `SEM_FINAL` são as casas de antes do L8 (1-15 com castigo 1 na tabela; 2-15 sem bola final), que seguem testadas como opção.
- `src/partida.test.ts`: os cenários; um teste cobra que cada falta e cada valor de opção fora do Boteco tem cenário.
- `src/invariantes.test.ts`: partidas ao acaso conferindo as invariantes a cada tacada (1×1 e duplas, com `passarVez` ao acaso e sequências de partidas pela `jogadoresDaProxima`), a propriedade de `bolasAlvo` (em cada estado e para cada jogador, tocar primeiro uma bola alvo não dá falta de toque e qualquer outra bola em jogo dá; toque simultâneo vale se uma for alvo; 8 casas × 1×1, 2×2 e 2×2 parceiro, passando por todas as fases) e uma partida inteira escrita à mão.
- `src/mata-mata.test.ts` (L15): `novaPartida` com 2, 3 e 4 e o que ela recusa, rodízio por várias tacadas (com e sem bola), pontos, falta sem pena com a branca voltando, fim com vencedor, empate desfeito (dois de três, três, quatro), `passarVez`, próxima partida, leitura (`TRIO`, `QUARTETO`, `mataMataCom`, `matou` e `configMataMata` de `para-testes.ts`). `src/modalidades.test.ts`: o catálogo, o preset e `validarPreset` com o mata-mata, e a concordância entre `formacoesAceitas` e `novaPartida`. `src/invariantes-mata-mata.test.ts`: partidas ao acaso com 2, 3 e 4 (conservação das 15, sem pena de bola, pontos, vez e lista de quem perde a vez por um modelo de contadores, vencedor por um modelo independente, pureza, sequências de partidas pela `jogadoresDaProxima`, as casas com e sem a pena do suicídio). `src/suicidio-mata-mata.test.ts` (L19): 1×1, 3 e 4 jogadores, dois suicídios de pessoas diferentes, todos na lista, branca fora, fim da partida, `passarVez` com alguém na lista e o par ou ímpar sem mudança de forma. `src/cegar-mata-mata.test.ts` (L21): o mesmo para cegar (1×1, 3 e 4, fim, `passarVez`, Boteco sem mudança), mais cegar e suicídio na mesma tacada (uma entrada, uma frase), cada pena ligada sozinha e as duas desligadas (`SEM_PENA_NO_CEGAR`, `SEM_PENA_NO_SUICIDIO` e `SEM_PENA_NAS_FALTAS` de `para-testes.ts`; `SEM_PENA_NAS_FALTAS` é o mata-mata de antes do L19). O modelo de `invariantes-mata-mata.test.ts` pune por cegar e por suicídio com contadores separados e as cinco casas.
- `src/duplas.test.ts`: cenários de 2×2 (rodízio, parceiro, grupo da equipe, pena para a equipe certa, vitória da equipe, nova partida, `passarVez`).
- `src/equipes.test.ts` (L13): 2×1 e 1×2 (`DOIS_CONTRA_UM`, `UM_CONTRA_DOIS` em `para-testes.ts`): o que `novaPartida` aceita e recusa, rodízio por várias tacadas (mesmo-jogador, parceiro, `passarVez`), quando `proximoDaRoda` aparece, falta e pena para a equipe certa, vitória da equipe de 1 e da de 2, nova partida pelas três `proximaSaida`. As invariantes de equipes (`invariantes.test.ts`) rodam também começando no 2×1 e no 1×2, e conferem quem recebe a vez com um modelo próprio (cada equipe reveza na ordem em que entrou).
- Prova de que os testes pegam: `.outros/lote-2/mutar-dev.py` (38 mutações, `mutacoes-dev.txt`); `.outros/lote-2b/mutar.py` (física e leitura do L2b); `.outros/lote-3b/mutar-dev.py` (26, chaves do L3b); `.outros/lote-5/mutar-dev.py` (34, duplas); `.outros/lote-8/mutar-dev.py` (bola final e caçapas, roda numa cópia do repositório para não atrapalhar quem testa em paralelo); `.outros/lote-11/mutar-dev.py` (24, `bolasAlvo` e a falta de toque, também numa cópia); `.outros/lote-13/mutar-dev.py` (28, a roda com equipes de 1 ou 2, numa cópia); `.outros/lote-15/mutar-dev.py` (o mata-mata, numa cópia); `.outros/lote-19/mutar-dev.py` (37, a pena do suicídio, numa cópia); `.outros/lote-21/mutar-dev.py` (a pena de cegar, numa cópia).
