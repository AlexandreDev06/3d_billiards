# Skins de taco (estilo CS, com cara de boteco)

Problema: hoje são 8 skins de cor e trama, 0 a 500 moedas. O usuário (2026-10-26) quer skins que o jogador deseje e mostre na mesa, como as do CS (Dragon Lore, Howl, Blue Gem, Emerald). Fase 0 (sala online já tem carteira e loja); a criação vem em lotes seguintes, depois da aprovação.

## O que o CS ensina (e o que a sinuca aproveita)

| Mecânica do CS | O que faz ser desejada | Adaptação aqui |
| --- | --- | --- |
| Raridade em 6 degraus por cor (branco, azul, roxo, rosa, vermelho; dourado para faca/luva) | Dá para ler o valor de longe | 6 faixas com cor: Balcão, Mesa, Salão, Camarote, Lenda, Relíquia |
| Desgaste (float 0–1: FN 0–0,07 … BS 0,45–1) | Mesma arte, valor diferente | Não copiar: ver "Desgaste" |
| Padrão por semente (Case Hardened #661 "blue gem"; fases e fade%) | Cada item é único; a sorte vira história | Semente por item: ver mecânicas |
| StatTrak / Souvenir | Item com história própria | Contador de bolas; troféu de torneio |
| Caixas e coleções | Expectativa e raridade | Decisão do usuário (e tem lei no Brasil) |
| Itens tirados de circulação (Howl, retirada por plágio, ficou "Contraband") | Oferta fixa para sempre | Edição aposentada (opcional) |

O que faz uma skin icônica: (1) **silhueta de cor reconhecível** (o Doppler pelo rosa e azul, o Fade pelo degradê), (2) **escassez real** (Dragon Lore saiu da coleção; Howl foi retirada), (3) **história** (jogada de campeonato, plágio, um milhão de dólares pela semente 661). Nossa versão: cor inconfundível, preço que dói e uma história de mesa ("o Dragão do Beto").

## Regra de ouro: nada copiado

Nomes, arte e paleta-assinatura são da Valve e dos artistas; nenhuma skin nossa repete o motivo central da original (dragão verde e dourado, lobo em chamas, teia vermelha radial, painéis branco e laranja). Só pegamos a **sensação** que a original passa. Cada linha da tabela abaixo diz como a nossa se afasta. Nomes de gema (esmeralda, rubi) são palavras comuns; evitamos as traduções literais de nomes de fase (por isso "Obsidiana", e não "Pérola Negra"). Texturas só pintadas pelo Pincel, ou geradas por código; nada de IA de terceiros, nada de arte de fora sem entrada em `docs/creditos.md`.

## Catálogo proposto (13 skins novas)

Faixas e preços ao lado das 8 de hoje (preço de hoje fica, só ganham faixa). Partes: **H** haste, **J** junta (anel de metal), **A** antebraço, **P** punho, **N** anel entre punho e base, **B** base/cabo, **V** virola. A ponteira (couro + giz) fica igual em todas: o giz azul é do jogo.

| Faixa | Skin | Evoca (sensação) | Conceito | Pinta | Técnica |
| --- | --- | --- | --- | --- | --- |
| Mesa | *Xadrez de Toalha* (70) | – (humor de boteco) | Toalha vermelha e branca de mesa de bar | H, A, B | procedural: trama `xadrez`, 2 cores |
| Mesa | *Long Neck* (120) | – | Garrafa verde translúcida com anel de rótulo | H, B, V | procedural: degradê verde, verniz alto, faixa de rótulo |
| Salão | *Placar* (180) | Asiimov (sci-fi limpo, painéis) | Painéis brancos com dígitos de placar em LED verde e âmbar | H, A, N | procedural: trama `paineis` + emissivo que acende; sem branco e laranja, para não copiar |
| Salão | *Resina Marmorizada* (280) | Marble Fade (redemoinho) | Resina de bola de sinuca, 2–3 cores girando | H, A, B | procedural: ruído com semente (fixa na v1) sobre a paleta das bolas |
| Salão | *Fim de Tarde* (250) | Fade, Tiger Tooth (degradê) | Azul-noite no cabo subindo a laranja e rosa, com o sol num anel | H, A | procedural: degradê ao longo da peça, sol na `faixa` brilhante |
| Camarote | *Coral* (350) | Fire Serpent (cobra, cor quente) | Anéis de cobra-coral (vermelho, amarelo, preto) com escamas no antebraço | H, A | faixas já existem + escamas pintadas (Pincel) no antebraço |
| Camarote | *Rede de Caçapa* (400) | Crimson Web (vermelho sobre preto) | Malha de rede de couro, fios vermelhos sobre preto | H, A | procedural: trama `rede` (losangos), especular neutro do preto |
| Camarote | *Bicho Solto* (450) | Hyper Beast (arte exagerada, cor pop) | Mosaico de bichos de desenho animado em cores berrantes | H, A | pintura do Pincel, PNG assado |
| Lenda | *Esmeralda do Pano* (800) | Gamma Doppler Emerald (gema verde) | Gema lapidada: facetas verdes, brilho que passeia | H, A, J | procedural: facetas + `iridescencia` + brilho animado |
| Lenda | *Obsidiana* (1000) | Black Pearl (preto com reflexo irisado), bola 8 | Preto vidrado com reflexo roxo e azul que muda com o ângulo | H, A, B | procedural: iridescência (`MeshPhysicalMaterial` já tem) + verniz máximo |
| Lenda | *Têmpera* (1200) | Case Hardened Blue Gem (padrão por semente, azul raro) | Aço temperado em azul-cobalto, com manchas douradas e roxas (cores reais da têmpera do aço) | H, A, J | procedural: ruído com semente + paleta de têmpera; versão fixa "perfeita" na v1 |
| Relíquia | *Corujão* (2000) | Howl (a "contrabando": rara, lenda de mesa) | Coruja da madrugada num fundo escuro, olhos âmbar acesos; sem lobo nem fogo | H, A, P | pintura do Pincel + emissivo nos olhos |
| Relíquia | *Dragão das Quinze* (3000) | Dragon Lore (o sonho de todo mundo) | Dragão enroscado cujas escamas têm as 15 cores das bolas, soprando fumaça de giz | H, A, B | pintura do Pincel, o mais caprichado; não pode ser verde e dourado |

Faixas das 8 de hoje: Balcão: Clássico (0). Mesa: Ébano 50, Boteco 80, Marfim 100. Salão: Carbono 150, Chamas 200, Neon 300. Camarote: Ouro 500.

**O que o taco desenha hoje (`aparencia-do-taco.ts`):** cor lisa por peça, tramas `veio`, `carbono`, `lisa`, `neon`, `chamas`, anéis (`faixas`, com brilho), antebraço com bicos, chamas ou linhas, punho de linho, couro ou borracha, emissivo estático, halo de neon, verniz e especular. **Não basta.** Cobre *Coral* e *Long Neck* quase de graça (anéis e verniz). Faltam, em ordem do que mais destrava:

1. **Trama gerada com semente** (ruído, marmorizado, degradê ao longo da peça): *Resina*, *Fim de Tarde*, *Têmpera*, *Esmeralda*, *Obsidiana*.
2. **Padrões repetidos** (`xadrez`, `rede`, `paineis`, `escamas`): *Xadrez*, *Rede*, *Placar*, *Coral*.
3. **Textura pintada** (`imagem`: PNG no UV da peça): *Bicho*, *Corujão*, *Dragão*, escamas da *Coral*.
4. **Iridescência** (`iridescencia` na `Superficie`) e **brilho animado** (varredura de brilho no tempo): gemas.

As três primeiras abrem 11 das 13 skins; a quarta é pequena.

## Mecânicas adaptadas à sinuca (custo por dono)

| Mecânica | Sala (Backend) | Feltro (Frontend) | Pincel (Artista) |
| --- | --- | --- | --- |
| **Catálogo novo** (só as skins fixas) | Médio: ids no protocolo e preços (contrato: passa pelo Principal) | Grande: 4 tipos de trama novos + `imagem` | Médio: 4 pinturas (Bicho, Corujão, Dragão, escamas) em PNG por peça |
| **Faixa de raridade** (cor e nome na loja) | Pequeno: campo `faixa` no catálogo | Pequeno: etiqueta e borda coloridas | – |
| **Vitrine do dia** (3 skins com 20% de desconto, sorteio pelo dia como as missões) | Pequeno: reaproveita o sorteio das missões | Pequeno: faixa na loja | – |
| **Semente por item** (cada taco é único; `skins: SkinTaco[]` vira itens `{id, skin, semente}`) | Grande: migrar `carteiras.json`, sala sorteia a semente na compra, `estado-sala` leva a semente | Médio: geradores já aceitam a semente (nascem preparados) | Pequeno: define os intervalos "raros" |
| **Contador de bolas** (StatTrak: bolas matadas com aquele taco) | Médio: soma por item no mesmo ponto que conta "bola matada" das missões | Médio: dígitos no cabo e no lobby | Pequeno: um espaço no cabo |
| **Desgaste** | Médio: guardar uso | Médio: arranhões e giz no shader | Médio: máscaras de desgaste |
| **Caixas** | Grande: sorteio com chance publicada, repetidas, auditoria | Grande: animação de abrir | Pequeno |
| **Troféu** (Souvenir: placa com sala e data para quem ganha um mata-mata) | Médio: metadado por item | Pequeno: placa no cabo | Pequeno |

**Semente.** A semente é cosmética pura: não mexe na física, então respeita o pilar 2. Exige guardar item por carteira. Dois jeitos: **às cegas** (sorteia na compra, vira jogo de azar, gera comprar de novo para "rolar") ou **vitrine de sementes** (a loja mostra 3 tacos prontos do dia, cada um com a sua semente e um selo de padrão raro; o preço sobe com o selo). Recomendo a vitrine: sem azar, fácil de entender e é a versão boteco do mercado do CS.

**Desgaste.** Não copiar o float: na sinuca o taco não "nasce gasto". Se vier, é **patina que cresce com bolas matadas** e o "Lustrar" custa moedas (ralo de moeda). Recomendo não fazer agora.

**Caixas e a lei.** O Brasil restringiu caixas de recompensa para menores na Lei 15.211/2025 (ECA Digital, em vigor desde 17/03/2026; o texto exato do art. 20 e a ADI 7.999 não consegui confirmar). Como o usuário pensa em tornar o jogo público um dia, caixa aumenta risco e custo. Compra direta evita isso; moeda não compra com dinheiro de verdade, o que já ajuda.

## Economia

Entrada de moeda: só as missões, no máximo **220 por dia** (fácil 50, média 70, difícil 100); as apostas (10 a 100) só trocam moeda entre jogadores. Quem começa tem 100. Ralo de moeda: só as skins. Conta de dias: *cheio* = 220/dia (as 3 missões), *normal* = 120/dia (uma fácil e uma média; é o que espero de um jogador casual).

| Faixa | Preços | Dias cheio | Dias normal |
| --- | --- | --- | --- |
| Balcão | 0 | – | – |
| Mesa | 50 a 120 | menos de 1 | 1 |
| Salão | 150 a 300 | 0,7 a 1,4 | 1,3 a 2,5 |
| Camarote | 350 a 500 | 1,6 a 2,3 | 3 a 4,2 |
| Lenda | 800 a 1200 | 3,6 a 5,5 | 6,7 a 10 |
| Relíquia | 2000 e 3000 | 9 e 14 | 17 e 25 |

Todo o catálogo (21 skins, 11.480 moedas) custa uns 52 dias cheios ou 96 normais: dá meses de meta. O Dragão a 3000 é a meta de um mês; se virar ouro rápido demais com apostas, o teto sobe sem refazer nada, porque o preço é dado. Cuidado: comprar gasta o saldo que serve de aposta, e perder aposta pode deixar o saldo negativo (decisão de 2026-10-21), o que adia a compra; a compra em si nunca deixa o saldo negativo.

## Ordem sugerida

1. **Lote A (sem pintura):** Faixas de raridade + vitrine do dia + os procedurais: *Xadrez*, *Long Neck*, *Placar*, *Fim de Tarde*, *Resina*, *Rede*. Dono principal: Feltro; Sala só o catálogo.
2. **Lote B (gemas):** iridescência e brilho animado: *Esmeralda*, *Obsidiana*, *Têmpera*.
3. **Lote C (pintura):** Pincel faz *Coral*, *Bicho*, *Corujão*, *Dragão*; Feltro liga o `imagem`.
4. **Depois:** semente, contador e troféu, num lote de itens por carteira.

## Decisões para o usuário

1. **Caixa com sorteio ou só compra direta?** (a) **Compra direta + vitrine do dia (recomendada)**; (b) caixa com chance publicada, sem compra direta das Lenda e Relíquia; (c) as duas.
2. **As 8 skins de hoje continuam?** (a) **Ficam, com os mesmos preços, só ganham faixa de raridade (recomendada)**; (b) saem da loja os que forem fracos (quem já comprou fica).
3. **Semente (cada taco único) fica para depois?** (a) **Depois, e os geradores já nascem aceitando a semente (recomendada)**; (b) já no primeiro lote (exige migrar as carteiras).
4. **Se a semente vier, às cegas ou vitrine de sementes?** (a) **Vitrine de sementes (recomendada)**; (b) às cegas, sorteada na compra.
5. **Contador de bolas (StatTrak)?** (a) **Sim, junto com a semente (recomendada)**; (b) já; (c) não.
6. **Desgaste?** (a) **Não (recomendada)**; (b) patina que se paga para lustrar.
7. **Corujão e Dragão: sempre à venda ou edição limitada (some da loja)?** (a) **Sempre à venda (recomendada, gente nova também alcança)**; (b) edição limitada por temporada.
8. **Preços e nomes:** o usuário pode trocar qualquer um, já que o catálogo é dado. Aprova a tabela como está? (a) **Sim (recomendada)**; (b) ajusto o que apontar.

## Fontes

- [CS2 skin rarity guide, Pricempire](https://pricempire.com/guides/cs2-skin-rarity-guide) e [ProSettings](https://prosettings.net/blog/cs2-skin-rarity-explained/): degraus de raridade e cores, Contraband.
- [Everything about CS2 rarity and float, CS.MONEY](https://cs.money/blog/cs-go-skins/everything-about-cs2-skin-rarity-and-float/) e [glossário case.oki.gg](https://case.oki.gg/glossary): faixas de float; Souvenir não aceita StatTrak.
- [Case Hardened guide, CSDB](https://csdb.gg/de/guides/case-hardened-guide/) e [SteamDB: blue gem](https://steamdb.com/en/skins/cs2/cs2-blue-gem-skins): semente 661 e cobertura de azul.
- [SteamDB: Doppler](https://steamdb.com/en/skins/cs2/cs2-doppler-skins): fases 1 a 4, Ruby, Sapphire, Black Pearl, Emerald; Marble Fade é uma paleta com sementes.
- [PC Gamer: Howl](https://pcgamer.com/csgo-howl-skin), [ggrecon](https://www.ggrecon.com/guides/csgo-most-expensive-skin-ever/), [cs2.ad: Dragon Lore](https://blog.cs2.ad/why-is-awp-dragon-lore-so-expensive/): Howl retirada, única Contraband; Dragon Lore saiu da coleção.
- [Factsheet ECA Digital, Machado Meyer](https://www.machadomeyer.com.br/images/ebooks/Factsheet_ECA_Digital.pdf) e [Confidata](https://confidata.com.br/blog/eca-digital-o-que-muda-empresas): caixas de recompensa e menores.
- Sem fonte achada (conhecimento geral, conferir se for citar): Fire Serpent, Crimson Web, Hyper Beast, Asiimov, Tiger Tooth e a faixa do Fade. Uso só a ideia de cada uma.
