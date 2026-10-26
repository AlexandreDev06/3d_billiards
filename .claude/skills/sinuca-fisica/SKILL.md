---
name: sinuca-fisica
description: Use ao criar, alterar, testar ou revisar o motor de física da sinuca (packages/fisica) — estados da bola, deslizar/rolar, colisões bola-bola e bola-tabela, caçapas, taco, efeito, squirt, miscue, passo de tempo, gravação — ou ao ajustar a "sensação" (parâmetros de atrito e restituição).
---

# Física da sinuca (`packages/fisica`)

Motor próprio em TS puro. Fonte de modelo: estudo §3 (`sed -n '/^### 3\./,/^### 4\./p' docs/estudo-viabilidade.md`). Gabarito de implementação: **pooltool** (github.com/ekiefl/pooltool e a série em ekiefl.github.io; confira a licença antes de portar qualquer trecho) e o tailuge só para comparar comportamento (GPL: nunca copiar).

## Modelo

**Estados da bola:** `parada` → `girando` (só ω vertical) → `deslizando` (ponto de contato escorrega) → `rolando` (sem escorregar). Cada estado tem equações próprias; a transição acontece quando a velocidade do ponto de contato zera (deslizando→rolando) ou a velocidade some (rolando→parada/girando).

- **Deslizando:** atrito de deslizamento μs·m·g contra a velocidade do ponto de contato `u = v + ω × r_contato`. Resultado clássico: `u` cai linearmente a (7/2)·μs·g mantendo a direção; duração `t = 2|u₀| / (7·μs·g)`.
- **Rolando:** desaceleração μr·g ao longo de v; ω amarrado a v pela condição de rolamento.
- **Giro vertical (ωz):** decai a taxa constante (parâmetro próprio), independente do rolamento.
- Han 2005 tem erros que o Kiefl corrigiu: **implemente pela versão do pooltool**, nunca do artigo puro.

**Colisões**
- **Bola-bola:** impulso normal com restituição `e_bb` + impulso tangencial limitado por atrito (throw, Alciatore). O atrito bola-bola cai com a velocidade de escorregamento; Alciatore (TP A-14) ajusta `μ(v) = a + b·e^(−c·v)`, com `a = 0,00995`, `b = 0,108`, `c = 1,088 s/m` (os mesmos do pooltool); `v` = escorregamento tangencial no contato. No config: `atritoBolaBolaRapido = a`, `atritoBolaBolaLento = a + b`, `atritoBolaBolaQueda = c`. Massas diferentes (bolão 160 g) entram no impulso: a tacada seca não para o bolão de verdade.
- **Bola-tabela:** Mathavan 2010 ou simplificado. O contato fica **acima do centro**: `sin θ = h/R − 1`, com `h` = altura do nariz da tabela. O `sin θ = 2/5` do artigo é o caso `h = 0,7·D`; a mesa de bar (61–64% de D) dá `sin θ ≈ 0,22–0,28`. Derive θ da altura configurada, não fixe 2/5. **L1 usa Han 2005 como no pooltool** (impulso único: normal `(1+e)·m·c` na direção do contato, tangencial contra o escorregamento, limitado por `μ_tabela·Pn` ou pela aderência `2·m·s/7`; a parte vertical vai para o pano). Nesse modelo a bola sem giro volta com `v·[(1+e)·cos²θ + (2/7)·sen²θ − 1]` (com e = 0,85: bolão ≈ 0,78, bola ≈ 0,74): o `e` do config não é a razão de retorno medida. A bola encosta a `R·cos θ` do nariz (`distanciaContatoTabela`). Mathavan fica para a Fase 1.
- **Taco-bola:** entrada = velocidade do taco, ponto de contato (a, b) no mini-bolão, elevação. Saída = v e ω iniciais + squirt (desvio quase linear com o deslocamento lateral) + miscue além do limite seguro (giz, estudo §6). Use a formulação do pooltool: impulso ao longo do eixo do taco `J = (1+e)·V / (1/m + 1/M + d²/I)`, com `d` = deslocamento no contato (plano perpendicular ao taco); o pooltool usa e = 1, aqui `restituicaoTacoBola`. O lateral do mini-bolão chega ao contato × `fatorEfeitoLateral` (giro em Y, impulso e squirt); o vertical chega inteiro, e o miscue segue o mini-bolão, o limite seguro que o jogador vê (L11b). Bolão a 2/5·R acima do centro já sai rolando.
- **Caçapas (L8, funda no L15):** cada tabela é o nariz reto até o começo do arredondado, a ponta arredondada (círculo de `raioQuinaCanto`/`raioQuinaMeio`, tangente ao nariz e à face; a bola encosta a `R·cos θ + raio` do centro) e a face da quina, que entra na caçapa a 45° no canto (paralela à diagonal) e perpendicular ao nariz no meio: `pontasTabela()` em `medidas.ts`, a mesma geometria do desenho. Face e ponta contam como a tabela delas no evento. **A caçapa é funda (pedido do usuário, 2026-10-14):** a bola só cai quando o centro passa `fundoCanto` (0,054 m, 1 diâmetro) ou `fundoMeio` (0,0405 m, ¾) da linha da boca, a reta entre as duas quinas (`MedidasMesa`). O círculo de queda (`Cacapa.queda`) tem raio de meia boca (inscrito entre as faces) e centro em `boca + eixo · (fundo + raio)`; as faces vão da quina até o ponto de tangência com ele (`fimDaFace`, `fundo + raio` para dentro), então a garganta guia a bola até a linha de queda. Bola mirada dentro da boca entra, bate nas faces se vier torta e cai; rasante bate na ponta e volta; bola que para na garganta (centro além da linha da boca, antes do círculo) fica na mesa, parada ou como obstáculo, e pode ser empurrada para dentro. `Cacapa` também traz `boca`, `eixo` e `fundo`; `centro`/`raio` continuam sendo o círculo tangente à boca (o desenho dos furos do `apps/web` ainda o usa até o L17 passar a seguir `queda`; a bola não cai nele). `posicaoLivre` nunca põe bola a menos de meia boca + o raio dela do meio da linha das quinas (a garganta e as quinas).

## Passo de tempo

- Fixo de **1/512 s**, sem relação com o quadro de tela. A tacada inteira roda de uma vez e só depois é animada.
- A 10 m/s (quebra forte) a bola anda ~20 mm por passo, quase o raio: detectar só por sobreposição dá ângulo errado e tunelamento. Em cada passo, calcule o **instante de contato** (raiz da quadrática da distância) de cada par e tabela, avance até o primeiro, resolva, continue o resto do passo.
- Colisões simultâneas (quebra): choques bola-bola que começam até `janelaChoqueSimultaneo` (0,1 ms) depois de outro, com uma bola em comum **e já se aproximando**, são resolvidos juntos (Poisson: impulsos normais acumulados ≥ 0 por Gauss-Seidel projetado até nenhum par se aproximar, depois mais `e`·λ em cada par, e o throw de cada par limitado pelo impulso total). Fora da janela, em série, em ordem de instante. Bola encostada parada não entra no grupo, então combinação em linha segue como pêndulo de Newton. Com janela 0 tudo volta à série. Os eventos do grupo saem com o mesmo `t`, em ordem de contato (as regras os veem como toque simultâneo). Separação mínima depois do impulso para não colidir de novo no mesmo instante.
- Passo que esgota o limite de eventos (laço de choques) conta em `Motor.passosEsgotados` e avisa no console uma vez.
- **Contato lento e de repouso (L2c):** depois de um choque a bola lenta **não** é zerada por `velocidadeParada` (`classificar(b, false)`): zerar o que o choque acabou de dar deixava a outra bola batendo de novo no mesmo instante, cada vez 40× mais devagar, até o laço esgotar. Ela para sozinha pelo atrito. O previsor só conta aproximação acima de `TOL_APROXIMACAO` (1e-9 m/s) para nunca marcar um choque que o choque recusa no arredondamento (bola tangente a outra encostada). Choque com velocidade normal abaixo de `velocidadeMinimaChoque` (1 mm/s) é resolvido mas não vira evento.
- Parada: abaixo de um limiar (ex.: |v| < 1 mm/s e |ω| pequeno) zera tudo. Limiares no objeto de config.

## Medidas e parâmetros iniciais (tudo num objeto de config exportado; o painel dev lê dele)

| Item | Valor inicial | Origem |
| --- | --- | --- |
| Bola / bolão | Ø 54 mm / Ø 56 mm | estudo §3 (Maxxi Tacos) |
| Massa bola / bolão | ~143 g / ~160 g | estimada pela densidade de uma bola de pool (170 g, Ø 57,2 mm); medir se puder |
| Mesa | 2,10 × 1,20 m interna (opção 2,54 × 1,27) | estudo §3 |
| Bocas | canto 8,5 cm, meio 9,5 cm | resposta do usuário (2026-10-09: "as quinas estão muito fechadas e a bola está voltando"); eram 6,5 e 8 (estudo §3, Noel Snooker) |
| Ponta da tabela na boca (`raioQuinaCanto`/`raioQuinaMeio`) | 10 mm / 4,8 mm | o desenho do L4; física e desenho usam o mesmo número |
| Altura da tabela | 61–64% de D (33–34,5 mm) | estudo §3 (Sinuca Verso) |
| μ deslizamento bola-pano | 0,2 (faixa 0,15–0,4) | Dr. Dave, "typical physical properties" |
| μ rolamento | 0,02: o dobro do 0,01 do Dr. Dave (faixa 0,005–0,015), pano de bar mais lento | pedido do usuário, 2026-10-09 ("a bola está indo muito rápido"); o web cortou junto a força do taco pela metade (4 m/s) |
| Desaceleração do giro vertical | 20 rad/s², acima da faixa 5–15 do Dr. Dave (o pooltool dá ~10,9) | pedido do usuário, 2026-10-09 ("quando dá efeito, a bola branca roda muito rápido"): 10 → 15 (L11) → 20 (L11b, junto com `fatorEfeitoLateral`). Medida em `.outros/lote-11/giro-dev.txt`: a 4 m/s com 0,5R, depois de uma tacada seca, girando no lugar 8,7 s → 6,8 s → 3,2 s |
| Efeito lateral útil (`fatorEfeitoLateral`) | 0,6: o 0,5R do mini-bolão vira 0,3R no contato (giro em Y 160 → 121 rad/s a 4 m/s) | pedido do usuário, 2026-10-09 (L11b). Custo: na tabela, a 1,5 m/s com 0,5R, o a favor abre +7,1° em vez de +14,5° (o contra fecha ~1,4° nos dois) |
| Restituição bola-bola | 0,95 (0,92–0,98) | idem |
| Limiar de evento de choque (`velocidadeMinimaChoque`) | 1 mm/s: abaixo, contato de repouso sem evento (som nem regra) | L2c; a bola a 1 mm/s para em ~5 µm |
| Janela de choque simultâneo | 0,1 ms | estimativa de Hertz: ~0,7 mm de compressão a 10 m/s, ε ≈ δ/v; cobre as folgas do triângulo (até 0,3 mm a ~9 m/s) |
| Atrito bola-bola | μ(v) de Alciatore: 0,118 parado → 0,01 rápido (≈ 0,06 a 0,6 m/s) | Alciatore TP A-14 / pooltool |
| Restituição bola-tabela | 0,85 (0,6–0,9), no sentido do Han 2005 | pooltool; dentro da faixa do Dr. Dave (decisão do L2) |
| Atrito bola-tabela | 0,2 | pooltool (f_c) |
| Taco | 0,5 kg, restituição 0,75 (bolão a ~1,33×V) | estimado; Dr. Dave: 1,2–1,4×V |
| Miscue | chance de 0 a 1 em 0,2R além do limite; bola com 30% da força, ±0,05 rad, 20% do efeito | estudo §6, valores de design |
| Limite seguro de efeito | 0,5R com giz fresco → ~0,3R sem giz | estudo §6 (Alciatore) |
| Alcance do taco (`efeitoMaximo`) | 0,95R: além disso o contato é puxado para dentro | valor de jogo |
| Triângulo | folga de 0,1 mm entre vizinhas; com `rng`, cada bola até 0,1 mm do lugar em qualquer direção, sem sobrepor; com 14 bolas o centro (meio da 3ª fileira) fica vazio; com 13 (Boteco) o centro fica com a `arrumacao[4]` e as pontas da base vazias | decisões do L2; L8 |

Confira os valores de Dr. Dave na fonte antes de tratar como definitivos. Pano de bar costuma ser mais lento: a sensação final é do usuário jogando.

## Testes que provam a física (golden)

- Tacada no centro: desliza até `v = 5/7·v₀`, percorre `12·v₀² / (49·μs·g)` deslizando; depois rola `v² / (2·μr·g)`.
- Bola parada atingida de frente, sem efeito, `e = 1`: a branca para (tacada "seca"), a outra sai com v.
- Regra dos 90°: branca sem giro (stun) num corte qualquer sai a 90° da bola objeto.
- Regra dos 30°: branca rolando num corte de meia bola desvia ~30°.
- Energia cinética nunca cresce sem taco; nenhuma bola atravessa bola, tabela ou quina nem sai da mesa na quebra (conferido a cada passo pelo `Motor`, não pelas amostras: a 10 m/s a bola anda 167 mm por amostra); mesma entrada → mesma saída no mesmo build.
- Throw: no limite da aderência `atan(tan φ / (3,5·(1+e)))` (4,84° a 30°); rápido, limitado pelo atrito, `atan(μ(v))` com `v` = escorregamento no contato. Taco fora do centro: `v = (1+e)·V/(1 + m/M + 5d²/(2R²))`, `|ω| = 5·v·d/(2R²)`, com o lateral de `d` já × `fatorEfeitoLateral`.
- Choque em grupo: bola contra duas a ±30° na janela dá `(1+e)·cos30°/(1+2·cos²30°)·v` a cada uma.
- Tempo da quebra: medido em `.outros/lote-2b/desempenho.test.ts` (fora da suíte: oscila em máquina carregada). Distribuição da quebra em 50 sementes: `.outros/lote-2b/quebra.test.ts`.
- Com o bolão mais pesado, o 90° vira `atan2(sen φ, k·cos φ)`, `k = (M − e·m)/(M + m)`, M = bolão; o throw fecha mais um pouco. Teste o livro-texto com bolas iguais e e = 1.
- Puxada: com μs = 0,2 o giro para trás morre a ~175 rad/s² no pano; precisa de força e pouca distância.
- Caçapas (L8): bola mirada dentro da boca (`|d| ≤ boca·cos φ/2 − R`, 0 a 45°, 1 a 4 m/s) cai; de frente na ponta, encosta a `R·cos θ + raio` do centro do arco; no fim do nariz reto, o arredondado puxa para a boca; a face segura a bola sobre a boca; a 10 m/s contra todas as bocas, nada entra na tabela (a invasão só conta a bola perto do trecho: com a garganta funda a bola na boca do canto "projeta" na reta da face do meio). Janela de aceitação antes/depois: `.outros/lote-8/aceitacao-dev.txt` (roteiro `aceitacao.test.ts`).
- Caçapa funda (L15, `cacapa-funda.test.ts`): bola reta no canto e no meio cai a 0,25, 1, 2,5 e 6 m/s com o centro a `fundo` ou mais da linha da boca; parada na garganta, ou rolando devagar até parar nela (v² = 2·μr·g·fundo/2), fica na mesa; um fio acima do necessário para chegar ao círculo, cai; bate na face dentro da garganta; rasante na quina bate; mesmas sementes, mesma gravação. Varredura de ângulo × velocidade (taxa de queda antes e depois): `.outros/lote-15/varredura-fisica.txt` (roteiro `varredura.test.ts`; "antes" = `fundoCanto = fundoMeio = 0`, a geometria antiga). A quebra do Boteco passou de 1,49 para 1,31 bolas encaçapadas, com 0,135 bolas paradas na garganta por quebra.
- Prova de que o teste pega: mutar a física de propósito (`.outros/lote-1/mutacoes.txt` tem o roteiro do L1; `.outros/lote-2b/mutar.py` confere que cai o teste-alvo de cada mutação; `.outros/lote-8/mutar-dev.py` as caçapas; `.outros/lote-15/mutar-fisica.py` a caçapa funda, numa cópia do repositório).

## Armadilhas

- `dt` de quadro na física; número mágico fora do config; `Math.random` direto (use o RNG injetado: miscue e arrumação).
- Vetores novos a cada passo (alocação no laço quente): reuse.
- Determinismo entre máquinas **não** é meta (a rede transmite a gravação); determinismo no mesmo build é, para os testes.
