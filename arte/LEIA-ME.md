# arte/

Personagens do jogo feitos no Blender e exportados em glTF (`.glb`). Dono: o Artista (terminal "Pincel").

```text
arte/
  referencias/maos-cartoon-usuario.png   a referência de estilo que o usuário mandou (luva de desenho clássico)
  ferramentas/                           abrir o Blender com janela e o servidor MCP
  personagens/
    mao.blend, balao.blend               as cenas do Blender (fonte)
    scripts/                             tudo que gera a mão (.blend e .glb), na ordem dos números
    scripts/balao/                       idem para o balão (dados, geometria, texturas, materiais, esqueleto, ações, acessórios e bigodes, exportação, provas)
    scripts/chapeus/                     os 8 chapéus do P8 (malha, modelos, texturas, exportação, provas)
    texturas/                            as texturas do balão (esclera e íris de cada estilo de olho, olheira, bochecha, pelos dos bigodes) e texturas/chapeus/ (as dos chapéus); autorais, geradas por script
    scripts/p1/                          os scripts e os dados do P1 (metabolas + Quadriflow), só para a história
    exportados/mao.glb, mao-taco.json, mao-meta.json  o que o jogo carrega da mão (as ações, o taco e o apoio de cada ponte, os contatos dos gestos)
    exportados/balao.glb, balao-meta.json  o que o jogo carrega do balão (e o contrato v3: nomes, eixos, pontos das mãos, âncora do chapéu, bigodes, estilos e cores de olho)
    exportados/chapeus.glb, chapeus-meta.json  os 8 chapéus (P8), cada um em dois níveis, presos à `ancora_chapeu` do balão
    exportados/icones/<id>.png           os 25 ícones da loja (P8): 8 chapéus, 5 bigodes, 4 estilos de olho e 8 cores de olho, 256x256 com fundo transparente
  ferramentas/folha_p1.py                a folha de comparação do P1 (Pillow)
  ferramentas/folha_p1b.py               a folha L27 × P1 × P1b (ponte, punho e pinça, de cima e na câmera do jogo)
  ferramentas/folha_balao.py             a folha do balão v1 (caras, ações, câmera do jogo, visor)
  ferramentas/folha_balao_v2.py          a folha do balão v2 (antes e depois: caras, olho, ações, nível baixo, câmera do jogo), filmando o visor
  ferramentas/filmar_visor.mjs           filma o visor quadro a quadro pelo protocolo DevTools (folhas e vídeo; com `fundo=transparente` na query sai com alfa)
  ferramentas/icones_p8.py               os 25 ícones da loja do P8 (visor com luz de estúdio e fundo transparente, 512 reduzido a 256; estilos e cores em recorte redondo)
  ferramentas/folhas_p8.py               as 4 folhas do P8 (chapéus, bigodes, estilos de olho, combinações na câmera do jogo), balão azul e laranja
  ferramentas/grade.py                   grade de imagens com legenda (Pillow)
  ferramentas/folha_l29.py               a folha do L29 (5 pontes na câmera do jogo + tira dos gestos no quadro de pico, do visor)
  ferramentas/tira.py                    tira de quadros legendados (Pillow)
  ferramentas/captura_visor.sh           quadro do visor com o Chrome sem janela
  visor/                                 visores three.js que provam os .glb (porta livre, nunca a 8001): index.html (mão), balao.html (balão), boteco.html (boteco, P4 a P6)
  boteco/                                o boteco em volta da mesa (P4 a P6): scripts/ (00_tudo.sh refaz tudo), fotos/ (CC0), texturas/<nivel>/, exportados/boteco-{alto,medio,baixo}.glb + boteco-meta.json, boteco-*.blend; ver "O boteco (P4 a P6)" abaixo
  marca/                                 o letreiro do jogo (P4): letreiro, sinuca e par-ou-impar, cada um aceso e apagado, em SVG e PNG transparente de 2048 px
  skins/                                 as skins de taco (P2: Coral, Bicho Solto, Corujão, Dragão das Quinze; P3: Dragon Lore e Howl), PNGs pintados no Blender; ver "Skins de taco" abaixo
```

## Etapa 0: ferramentas (para outro chat refazer)

Máquina: Linux, RTX 4070 SUPER, sem sudo. Tudo em `~/.local`.

1. **Blender 5.2.3 LTS** (a estável mais recente em 2026-10-22). Tarball oficial, conferido pelo sha256 do site:

   ```bash
   cd /tmp && curl -LO https://download.blender.org/release/Blender5.2/blender-5.2.3-linux-x64.tar.xz
   curl -s https://download.blender.org/release/Blender5.2/blender-5.2.3.sha256 | grep linux-x64   # compare com sha256sum
   mkdir -p ~/.local/opt/blender-5.2.3 && tar -xJf blender-5.2.3-linux-x64.tar.xz -C ~/.local/opt/blender-5.2.3 --strip-components=1
   ln -sfn ~/.local/opt/blender-5.2.3 ~/.local/opt/blender && ln -sf ~/.local/opt/blender/blender ~/.local/bin/blender
   ```

   O Python do Blender já traz `numpy` e `requests`; não precisa instalar nada nele.

2. **MCP do Blender.** O servidor desta sessão é o `mcp-for-blender` (`uvx mcp-for-blender`, mantido pelo mesmo autor do
   `ahujasid/blender-mcp`; o `addon.py` vem dentro do pacote). Instale só o complemento, sem o `setup` (que mexe nas
   configurações dos clientes MCP):

   ```bash
   mkdir -p ~/.config/blender/5.2/scripts/addons
   uvx mcp-for-blender install-addon --addons-dir ~/.config/blender/5.2/scripts/addons
   ```

3. **Abrir o Blender com janela e o MCP ligado** (o usuário acompanha na tela dele):

   ```bash
   bash arte/ferramentas/abrir-blender.sh [arte/personagens/mao.blend]
   ```

   O script usa `DISPLAY=:1`, habilita o complemento `blender_mcp` e sobe o servidor em `localhost:9876`; o MCP `blender`
   da sessão fala com ele (`get_addon_status` confirma). **Telemetria e coleta de dados ficam desligadas**
   (`telemetry_consent: false`): nunca ligue, nunca chame `record_trajectory_feedback` e deixe `user_prompt` vazio.

4. **Render e exportação sem janela** (`blender -b arte/personagens/mao.blend --python <script>`) ficam para as provas
   finais. O EEVEE do Blender precisa do X aberto (`DISPLAY=:1`) mesmo em `--background`.

## Como o personagem é feito (a mão)

Estilo: luva de desenho (dedos roliços e da mesma grossura do começo ao fim, pontas em domo, vão claro entre eles, nós só
como uma dobra suave, palma cheia, polegar gordo, punho enrolado como boca de balão), com acabamento
**realista**: látex liso e brilhante, sem contorno e sem sombreamento toon. Só a forma é cartum. Mão direita, palma para
baixo, dedos em +Y, polegar em -X, 18,2 cm da base do punho à ponta do médio; a esquerda é o espelho (escala X = -1 no jogo).
Os números da mão estão todos em `mao_dados.py`, em centímetros.

Scripts de `arte/personagens/scripts/`, na ordem. `00_tudo.py` refaz 01, 03 e 04 do zero (cerca de 1 s) (na janela do Blender pelo MCP, ou
`blender -b --factory-startup --python .../00_tudo.py -- --salvar arte/personagens/mao.blend`):

| Script | O que faz |
| --- | --- |
| `01_gaiola.py` | a malha direto em quadriláteros (bmesh), sem escultura: palma em loft de caixa elíptica (seções superelípticas, linha dos nós), cada dedo um tubo de raio constante com cintura de 2,5% nas juntas e ponta em domo, polegar extrudado de um bloco 2×2 da parede esquerda, punho enrolado em anéis. A alta (`mao_alta`, ~4,5 mil tris) leva subdivisão Catmull-Clark nível 1 (com `engorda` para compensar o encolhimento); a baixa (`mao_baixa`, ~0,8 mil) é a gaiola rala sem subdivisão |
| `03_esqueleto.py` | 17 ossos (pulso, palma, 3 por dedo) à mão e pesos por distância à cápsula do osso |
| `04_poses.py` | uma ação por pose e uma faixa NLA para cada (o exportador leva todas), a partir de `mao_poses.py` e `mao_gestos.py`; o gesto usa Bézier. Nos gestos com contato (`gesto_tapinha`, `gesto_palmas`) `encostar` mede a malha e ajusta o `loc` do pulso para o ponto extremo cair no plano; grava `gestos_medidos.json`. `-- --salvar arte/personagens/mao.blend` regrava o .blend |
| `05b_resolver_pontes.py` | as cinco pontes do L29 (`pose_ponte_laco`, `_elevada`, `_tabela`, `_colada`, `_canto`): mesmo solver, uma `Cena2` com grupos de vértices e `loc:x/y/z`; cada ponte é um problema (`problema_laco`...) com setores de contato do taco, pontas pousadas no plano de apoio e preferências de ângulo; multi-start (`-- ponte_laco SEMENTE PARTIDAS`). Grava a pose, o taco e o apoio (`apoio_ponto_cm`, `apoio_normal`, `apoio_tipo`, folgas) em `poses_resolvidas.json`. `-- completar_ponte_v` acrescenta o apoio da `pose_ponte_v` |
| `05_resolver_poses.py` | achar ponte V, punho e pinça: mínimos quadrados (`mao_solver.py`) medindo a malha deformada (`mao_provas.py`: distância assinada, `folgas_radiais` com raios do eixo do taco, taco cônico 1,45 m, cubo de 2,2 cm). A pinça mede o contato na pele (centro da face do polegar a 0 mm), com o cubo livre. Grava `poses_resolvidas.json`, que o `mao_poses.py` lê. Só rode de novo se mudar a forma; o solver cai em mínimo local se partir de dedos esticados (o punho precisa partir de uma mão já enrolada, a pinça se resolve em duas etapas: cubo, depois cubo + polegar) |
| `mao_anim.py` / `mao_gestos.py` | os gestos do L29, escritos pelo que se vê: chaves por osso (graus) em quadros a 30/s, e `mao_anim.construir` faz as curvas (cúbica monótona que freia nas chaves travadas), o atraso por osso (sobreposição), a mola de 2ª ordem (follow-through) e a `vida` (micro-oscilação que cresce no fim, para não terminar estátua). `META` leva pico, picos, ciclo e aditivo |
| `06_renders.py` | renders EEVEE sem janela (luz quente por cima, fundo escuro): `DISPLAY=:1 blender -b arte/personagens/mao.blend --python arte/personagens/scripts/06_renders.py -- --saida DIR --poses a,b --angulos cima,tres_quartos,lado,jogo_ponte45,jogo_punho [--lod baixa] [--quadro N \| --quadros 0,6,12] [--silhueta] [--sem-apoio] [--props json\|blend]`. `jogo_ponte` (28°) e `jogo_ponte45` (45°, a que mostra a ponte elevada sem o taco tampar a lente) e `jogo_punho` são a câmera do jogo (atrás e acima do taco, olhando ao longo dele). Taco, cubo e plano de apoio (pano ou madeira) saem de `poses_resolvidas.json` (ou do próprio .blend com `--props blend`, para o backup do P1). `--silhueta` é preto sobre branco (Workbench) |
| `07_exportar.py` | `exportados/mao.glb` (cor base branca, verniz `KHR_materials_clearcoat`, 19 animações nomeadas a 30 quadros/s), `exportados/mao-taco.json` (onde fica o taco ou o cubo de cada pose, o apoio das pontes e os contatos dos gestos, no referencial da mão, em metros) e `exportados/mao-meta.json` (ações, quadros, picos, ciclos, aditivo) |

**Boca do punho (P1c).** A boca da luva é fechada por uma tampa côncava (`malha_do_punho` em `mao_lib.py`: parede interna curta, anéis que
descem 0,9 cm em parábola e um leque no centro), no segundo material `latex_fundo` (o mesmo látex, base cinza 0,42, para parecer o fundo de uma
luva de borracha). No `.glb` o par é `latex_glb` (índice 0) e `latex_fundo_glb` (índice 1); cada malha tem duas primitivas e o GLTFLoader cria
dois filhos (`mao_alta`, `mao_alta_1`): tinja só o `latex_glb` (cor base branca) e deixe o fundo cinza. A alta tem 3880 triângulos.

Ações do `.glb` (19; `mao-meta.json` tem quadros, picos e ciclos):

- Poses (3 quadros iguais, 0 a 2; toque com `LoopOnce` e `clampWhenFinished`, entre uma e outra `crossFadeFrom`): `pose_repouso`, `pose_aberta`, `pose_apontar`, `pose_punho`, `pose_pinca` e as seis pontes `pose_ponte_v`, `pose_ponte_laco`, `pose_ponte_elevada`, `pose_ponte_tabela`, `pose_ponte_colada`, `pose_ponte_canto`.
- Gestos (30 quadros/s, começam e terminam na `pose_repouso`; o fade de entrada é do jogo): `gesto_joinha`, `gesto_soco_ar`, `gesto_tapinha`, `gesto_quase`, `gesto_palmas`, `gesto_tamborilar` (ciclo 0–24), `gesto_mole`, `gesto_respirar` (aditivo).
- Aditivo (`gesto_respirar`): o glTF não tem mistura aditiva. No three.js: `clip = THREE.AnimationUtils.makeClipAdditive(clip.clone(), 0)` (o quadro 0 é a referência), `action.blendMode = THREE.AdditiveAnimationBlendMode`, `LoopRepeat`, e toca por cima de qualquer pose ou gesto (o visor tem o botão `respirar (aditivo)`).
- Apoio das pontes (`mao-taco.json`, no formato do taco da `pose_ponte_v`, mais `apoio`: `tipo` pano|madeira, `ponto_m` e `normal` do plano, `toca`, `pontas_m`, `folgas_ao_plano_mm`, e `elevacao_do_taco_graus`, `altura_do_taco_ao_plano_mm`). O plano é horizontal no referencial da mão; o jogo o alinha ao tampo da mesa e põe a ponta do taco a `ponta_a_ponto_m` do `ponto_m`.
- Contatos (`mao-taco.json`, `tipo: contato`): `gesto_tapinha` (quadros 11 e 20, ponto e plano de contato) e `gesto_palmas` (quadros 8, 16 e 24, plano vertical `x` e `normal_da_palma`).
- O taco, o cubo e o plano de apoio do `.blend` são só prova e não vão no arquivo.

Cuidados que pegam: no Blender 5 a ação é em camadas (`ação.layers[].strips[].channelbags[].fcurves`, não `ação.fcurves`);
`loc` do `pulso` é no referencial do osso (z positivo desce, o lado da palma); `use_nla=False` no esqueleto ao aplicar
uma pose à mão (a pilha NLA vence a pose manual).

## O balão (P1c; contrato v2 no P7, v3 no P8; pedido de 2026-10-28)

Estilo igual ao da mão: forma de desenho bem feito, acabamento realista de látex brilhante. O balão é a gota de festa do jogo (metade da altura 6,6 cm, raio 4,5 cm,
a mesma silhueta de `apps/web/src/baloes/silhueta.ts`) com o nó de pregas e a cordinha de 7,2 cm, em branco para o jogo tingir. É a base de vários jogos: **nada nele fala de sinuca**.
O rosto é 3D e vive na mesma malha com pele. O rosto olha para +Z no glTF (o `yaw = 0` do jogo); +X é a esquerda do balão. Todos os números em cm estão em `scripts/balao/dados.py` (`CM = 0.01`).

O que o P7 refez: **olhos** (globo com esclera, íris, pupila grande e dois reflexos, um grande e um pequeno, presos à `espinha_2` e não ao osso do olho; pálpebras que abraçam o globo em
todo o olhar até 34° e em toda cara, provado por script), **corpo** (malha lisa, nó com pregas e pescoço franzido, cordinha em fita que gira, cor de vértice com o sombreado do pescoço e do nó), **rosto** (boca com interior, dentes e língua;
bochechas e sobrancelhas que andam com a cara; 12 caras, assimétricas onde precisa), **nível baixo** (o mesmo personagem simplificado, olhos e boca nítidos) e **13 ações** feitas pelos princípios de animação (antecipação, exagero,
arcos, sobreposição e seguimento, curvas com ease, esticar e achatar conservando o volume; as molas de segunda ordem dos ossos de cima fazem o resto). Sem textura de foto: as duas texturas (`olho.png` 512², `bochecha.png` 64²) saem de `scripts/balao/textura.py` a cada montagem.

O que o **P7b** corrigiu depois da revisão (o v2 tinha perdido o carisma do v1; nomes e ordem do contrato não mudaram): o **neutro** voltou a ter o olho redondo aberto (pálpebra de cima a 24° do alto, a de baixo a 3°: branco acima da íris) e um sorriso leve;
a pálpebra só cobre o olho em tédio, concentrado, desconfiado, convencido (e no canto de cima do bravo e do triste); os **olhos** (raio 1,13 cm, o v1 tinha 1,05) ficaram do tamanho do v1 ou maiores (branco visível / largura do corpo: 0,258 de largura e 0,264 de altura
contra 0,237 e 0,250 do v1, medido por `medir_geo` no neutro de frente), com esclera branca limpa, íris de mel a laranja (centro mais claro), pupila grande (25° de abertura) e contorno fino; a pálpebra ficou fina (casca a 1,115 do raio) e só a de cima leva delineador;
o **olho fechado** (`rindo`, `comemorando`, `piscar`, `piscar_esq`, `piscar_dir`) deixou de ser pálpebra inchada: o globo, os reflexos e as pálpebras **afundam 1,65 cm na pele** (`dados.SINK_FECHADO`, ao longo da normal) e uma **fita escura** sobe à pele no lugar
(`geometria._fita`: o arco "^ ^" com um cílio que cai na ponta de fora; com o olho aberto ela fica 0,5 cm por baixo da pele). Efeito colateral bom: com o olho escondido a soma das formas não deixa fresta, então a piscadinha de um olho só aguenta a cara inteira (peso 1 em todas as caras);
as **bochechas** voltaram (disco em anéis, porque um leque grande de triângulos afundava na pele curva; rosa claro, **emissivo**: continua rosa sob qualquer luz e sobre azul, laranja, verde e violeta; mais fortes no sorriso, no rindo e no comemorando);
a **boca** do sorriso, do rindo e do comemorando ficou maior e mais larga (0,433 da largura do corpo no sorriso contra 0,353 do v1) e o neutro tem a curva de um sorriso leve; o **concentrado** é foco, não raiva (sobrancelhas quase retas, a de -X um pouco mais baixa, olhos semicerrados por igual, boca apertada de lado, ponta da língua).

`scripts/balao/` (`00_tudo.py` refaz 01 a 03, ~2 s: `blender -b --factory-startup --python arte/personagens/scripts/balao/00_tudo.py -- --salvar arte/personagens/balao.blend`; depois `VALIDADOR=<validar.mjs> blender -b arte/personagens/balao.blend --python arte/personagens/scripts/balao/05_exportar.py`):

| Script | O que faz |
| --- | --- |
| `dados.py` | todos os números: corpo, nó, cordinha, olhos, as 12 caras (`CARAS`), as formas (`FORMAS`), esqueleto, mãos, ação ↔ cara (`PAR_DE_CARA`), trechos de repetição (`TRECHOS`), o que cada ação conta (`DESCRICAO_DAS_ACOES`), `VERSAO` |
| `geometria.py` | a geometria pura (numpy): `gerar(lod, estado)` devolve vértices, pesos, UV, cor de vértice, faces e materiais; a ordem dos vértices é a mesma em toda expressão, por isso a forma sai por diferença. O numpy é do Blender: `blender -b --factory-startup --python geometria.py` imprime a contagem |
| `textura.py` | as texturas em numpy, gravadas pelo Blender em `arte/personagens/texturas/` (regravadas a cada montagem; antes o arquivo velho ficava no disco e o balão saía com a textura antiga): `esclera_<estilo>.png` e `iris_<estilo>.png` (256², a íris em tons de cinza), `olheira.png`, `bochecha.png` e `cabelo_<cor>.png` (fios dos bigodes). O `olho.png` de 512² do P7 saiu (nada o usava desde o P8) |
| `materiais.py` | os materiais (látex de prévia e `latex_glb`, olho, preto, língua, cordinha, brilho, bochecha, dente, boca; no P8 mais `olheira`, `bigode_<cor>` e, por estilo, `olho_<estilo>` e `iris_<estilo>`); o látex é desenhado do jeito que o exportador do glTF reconhece como `COLOR_0` (cor de vértice x cor da equipe) |
| `01_malha.py` | `balao_alta` (16,6 mil tris) e `balao_baixa` (3,0 mil), UV, cor de vértice, grupos de vértices e as 17 formas (shape keys) |
| `02_esqueleto.py` | `balao_esqueleto`: `raiz`, `espinha_1..3`, `no`, `cordinha_1..4`, `olho_esq`/`olho_dir` e o `olhar` (alvo da prévia, fora do .glb); empties `mao_esq`/`mao_dir` filhos da `espinha_2` |
| `03_acoes.py` | as 13 ações a 30 quadros/s, uma faixa NLA por ação, só nos ossos `raiz`, `espinha_1..3` e `no`. Cada ação é escrita como poucos canais mestres (subida, inclinação, giro, achatamento, inflar) com chaves de extremo e curva cúbica monótona; molas de segunda ordem dão a sobreposição de cada osso; o trecho que repete sai do regime permanente das molas e fecha sem emenda (conferido: diferença 0,0000). Confere `dados.TRECHOS` |
| `04_renders.py` | renders EEVEE sem janela (v1; para a folha de agora use o visor e `arte/ferramentas/folha_balao_v2.py`) |
| `05_exportar.py` | `exportados/balao.glb` e `balao-meta.json` (v3) pela pasta temporária `exportados/../.exportando` + `os.replace` (atômico); tira dos clipes os canais dos olhos e da cordinha; valida com o `gltf-validator` se `VALIDADOR` apontar o `.mjs`. `SAIDA_BALAO=<pasta>` exporta para outro lugar (ensaio: o jogo e os testes leem de `exportados/`) |
| `02b_acessorios.py`, `bigodes.py` | P8: a `ancora_chapeu`, os 5 bigodes em dois níveis (fitas coladas na pele que acompanham o contorno do lábio da cara; as mesmas 20 formas do rosto) e a vitrine dos materiais dos estilos de olho; `00_tudo.py` roda o `02b` depois do esqueleto |
| `raster.py`, `provas_olhos.py` | provas sem abrir imagem: rasterizador de materiais em numpy e as medidas das pálpebras (fresta, afundar, cantos, manchas de látex, íris visível) em toda cara x piscar x olhar e, no olho fechado, que o globo e as pálpebras ficam sob a pele até o olhar de 34° e que a fita está sobre ela. `blender -b --factory-startup --python provas_olhos.py -- saida.txt` (no P8, também cada `estilo_*` somado a toda cara, ao piscar, às pálpebras do olhar e ao olho fechado) |
| `provas_bigodes.py` | P8: por bigode, nível e cara, a folga sobre o lábio (e da corda da malha baixa), a folga do olho e a elevação sobre a pele; e, rasterizado com e sem o bigode, o quanto do olho, da boca, da olheira e da bochecha fica à vista. `blender -b --factory-startup --python provas_bigodes.py -- saida.txt [--rapido] [--so-contas]` |

Contrato v2 com o jogo (o resto está em `balao-meta.json`, `"versao": 2`; **nada do v1 sumiu**: mesmas malhas, ossos, nós das mãos, as 6 formas e 6 ações com os mesmos nomes, as chaves antigas do meta, látex branco, tamanhos de repouso):

- Formas (`morphTargetDictionary`, 17, esparsas e com normais): as do v1 (`cara_neutro`, `cara_sorriso`, `cara_susto`, `cara_bravo`, `cara_triste`, `piscar`) mais `cara_rindo`, `cara_convencido`, `cara_concentrado`, `cara_desconfiado`, `cara_ufa`, `cara_tedio`,
  `cara_comemorando`, `piscar_esq`, `piscar_dir`, `palpebra_cima`, `palpebra_baixo`. `meta.caras` lista as caras. O GLTFLoader cria um filho por material (9 por versão): aplique o peso em `morphTargetInfluences` de **todos** os filhos de `balao_alta` ou `balao_baixa`. Mostre só uma versão.
  Piscar com uma cara ligada: a cara vezes `1 - piscar`. Uma cara por vez.
- **Piscadinha** (`piscar_esq`/`piscar_dir`): some a forma (peso 1) por cima da cara. No P7b o olho que fecha afunda na pele, então a soma das formas não deixa fresta nem pálpebra inchada e `meta.piscar.peso_da_cara_na_piscadinha` vale 1 em todas as caras
  (o campo continua no contrato e o jogo já o lê; no P7 era 1 só no neutro e 0,15 ou menos nas outras). `meta.olho_fechado` descreve o afundar e a fita.
- **Pálpebras que seguem o olhar** (`palpebra_cima`, `palpebra_baixo`): peso = olhar vertical / `palpebras.*.olhar_graus_para_peso_1` (34°), limitado a 1, vezes `meta.abertura_da_cara[cara]` (o teto que a cara aguenta sem a pálpebra afundar ou abrir fresta; rindo e comemorando valem quase 0: olho fechado). Um dos dois por vez; com o olho fechado, zero.
- Olhar: gire `olho_esq` e `olho_dir` no referencial do pai (`espinha_2`), no máximo `olhar.limite_graus` (**34°**, era 30°: a íris continua visível, 84% ou mais da área). A receita está em `meta.olhar.como`; o visor tem a conta pronta (`olharPara`), que também devolve o olhar vertical para as pálpebras. Com o olho fechado o osso do olho pode girar: o globo está sob a pele e continua escondido (provado até 34°).
- **Cordinha**: nenhuma ação tem chave nos ossos `cordinha_*` (nem nos olhos). O jogo simula a corrente; `meta.cordinha` tem os ossos em ordem, o comprimento de cada junta (m), a massa sugerida e `simulada: true`.
- Ações (`balao-meta.json` tem os quadros, `entrada_quadros`, `ciclo_quadros`, `cara_par` e `o_que_e`): `balao_parado` (6 s, repete o clipe inteiro), `balao_inclinar` (repita 24–96), `balao_pulinho`, `balao_susto`, `balao_estufar` (repita 27–75), `balao_murchar` (repita 48–96),
  e as novas `balao_comemorar`, `balao_rir` (repita 15–51), `balao_bravo`, `balao_concentrar` (repita 30–114), `balao_impaciente` (repita 18–78), `balao_ufa`, `balao_desanimar`. O que não tem ciclo toca uma vez e segura o último quadro.
- Material do látex (proposta, em `meta.latex_proposta`): `roughness 0,2`, `clearcoat 1`, `clearcoatRoughness 0,05`, `sheen 0,25` (rugosidade 0,45), `vertexColors: true` para ligar o sombreado do pescoço e do nó (`COLOR_0`, 0,48 a 1,0). O jogo troca o material do látex pelo dele: nada disto é obrigatório.
- Mãos: nós `mao_esq` e `mao_dir` (filhos da `espinha_2`, em ±9,5 cm do centro). Ancore a origem da `mao.glb` neles e escale; use só posição e orientação do nó, a escala do pai muda ao estufar. A `mao.glb` **não foi tocada no P7** (o jogo troca o material do látex e o punho é geometria: ficou como estava).

### Contrato v3 (P8, pedido de 2026-10-28): chapéu, bigode, estilo e cor de olho

O v3 **amplia** o v2 (`"versao": 3` no meta): nada do v2 mudou, as 17 primeiras formas continuam na mesma ordem e `arte/ferramentas/comparar_contrato.py` dá "nenhum nó sumiu" (`.outros/lote-p8/comparacao-contrato-v2-v3.txt`).
Os ids são os de `.outros/prompts/contrato-aparencia.md` (fechados). O balão sem nada equipado é o de antes: padrão `olho_normal` e `castanho`.

- **`ancora_chapeu`** (nó vazio no `balao.glb`): filho do osso `espinha_3` (o que acompanha o topo no estica e amassa), no alto do balão (`[0, 0,066, 0]` m no repouso; `[0, 0,04, 0]` medido do pai), sem giro, +Y para fora. O chapéu é filho dele.
  O nó herda a escala do osso (de 0,94 a 1,42 na largura e de 0,69 a 1,48 na altura nas 13 ações; inclina até 19°), então o chapéu amassaria junto: a regra do meta (`ancora_chapeu.escala_do_chapeu`) é
  `escala_final = clamp(1 + segue * (escala_do_no - 1), piso, teto)` por eixo, e a escala local do chapéu é `escala_final / escala_do_no`: **largura** (média de x e z) segue 0,65, piso 0,88, teto 1,32; **altura** (y) segue 0,30, piso 0,88, teto 1,14.
  Medida em `scripts/chapeus/provas_chapeus.py --pose` (os 8 chapéus presos à âncora nos 13 clipes, em grade de regras): no pior quadro o chapéu entra 0,45 cm na pele (a aba do de palha) e o aro de baixo se afasta até 1,26 cm; no repouso o aro encosta a 0,05 cm.
- **Bigodes** (5): nós `<id>_alta` e `<id>_baixa` no próprio `balao.glb` (o id do contrato mais o nível, sem prefixo a mais: `bigode_fino_alta`, `bigodao_baixa`), malhas comuns (sem pele) filhas da `espinha_2`, que é o osso do rosto inteiro: o bigode anda exatamente como a boca.
  **Ocultos por padrão** com escala 0 e `extras.oculto_por_padrao` (o three 0.186 não lê `KHR_node_visibility`): para equipar, `no.scale.set(1, 1, 1)` no nó do nível em uso e deixe os outros em 0.
  Têm as **mesmas 20 formas** do rosto, na mesma ordem (só a posição vai no morph, sem normais, para o arquivo caber): aplique em cada bigode visível os mesmos pesos de `balao_alta`/`balao_baixa`. A fita fica colada sobre o lábio de cima em toda cara (sobe com o sorriso, estreita com o susto, anda de lado com a boca torta),
  nunca desce à boca nem ao queixo (sem barba) e nunca entra no olho (`provas_bigodes.py`). Cor fixa por item, textura de fios, sem tinta da equipe: `bigode_fino` preto, `bigodao` castanho, `bigode_guidao` grisalho, `bigode_dali` preto, `bigode_chevron` castanho.
  Triângulos (alta/baixa): fino 188/52, bigodão 456/184, guidão 562/150, Dalí 580/236, chevron 376/104.
- **Estilos de olho** (`meta.estilos_de_olho`): `olho_normal` é o de hoje. Os outros trazem, cada um, o material de esclera (`olho_<estilo>`) e o da íris (`iris_<estilo>`, **em tons de cinza**) e, se precisa, a forma `estilo_<id>`:
  `olho_kawaii` (íris 1,30x e pupila 1,22x maiores, quatro reflexos, sobrancelha mais alta; forma `estilo_kawaii`), `olho_bravo` (pálpebra de cima inclinada para dentro e sobrancelha franzida; `estilo_bravo`),
  `olho_cansado` (esclera avermelhada com veinhas, olheira, pálpebra caída, sobrancelha baixa; `estilo_cansado`). **Como ligar:** peso 1 na forma do estilo (0 nas outras `estilo_*`), somada a qualquer cara, ao piscar e às pálpebras do olhar,
  e troque os materiais `olho` e `iris` dos dois níveis pelos do estilo (clone-os; os materiais dos estilos que o corpo não usa estão na malha oculta `estilos_de_olho`, uma vitrine de triângulos minúsculos dentro do corpo). A pálpebra do estilo é uma casca à parte
  que gira com o olhar como as outras e que o olho fechado esconde sob a pele. Medido como no P7b, estilo por estilo, contra as 12 caras, o piscar, a piscadinha e o olhar até 34° (`.outros/lote-p8/provas-olhos.txt`): fresta máxima 0,069 cm (limite 0,07), pálpebra afundada no máximo 0,063 cm (limite 0,08), olho fechado 0,053 cm sob a pele,
  0 pixel de látex cercado de olho em 144 cenas por estilo e nível, íris visível a 34°: 84% ou mais.
- **Cores de olho** (`meta.cores_de_olho`): `castanho` (padrão), `mel`, `verde`, `azul`, `cinza`, `violeta`, `vermelho`, `dourado`, cada uma com `cor` (o tom que tinge a íris cinza), `centro` (mais claro) e `borda` (mais escura) para quem quiser gradiente.
  Regra do visor e do jogo: `material.color.set(cor)` e `material.emissive.set(cor).multiplyScalar(0,30)` na íris do estilo em uso. Vale para qualquer estilo.
- **Meta v3**: `versao`, `ancora_chapeu`, `bigodes` (ids, itens, como ligar), `estilos_de_olho` (ids, itens, vitrine, limites provados), `cores_de_olho` e as 3 formas `estilo_*` em `formas.nomes` (20 no total). O leitor estrito de `packages/personagens` aceita o v3;
  o único teste que não passa é o que fixa `meta.versao` em 2 (`meta-do-rosto.test.ts:94`): é para o dono do pacote trocar por 3.
- **Tamanho:** `balao.glb` 4.092.128 bytes (3,90 MiB; o do P7b tinha 2,5 MiB: os 10 bigodes com 20 formas e as texturas dos estilos e dos pelos somam 1,4 MiB). Validador: 0 erros (2 avisos de nó de malha com pele que não é raiz, os mesmos do P7b).

### Os chapéus (`chapeus.glb`, P8)

`exportados/chapeus.glb` e `chapeus-meta.json`: 8 chapéus, cada um num nó raiz por nível (`<id>_alta`, `<id>_baixa`: `cartola_alta`, `chapeu_palha_baixa`; sem prefixo a mais). **A origem de cada nó é o alto da cabeça do balão**, o ponto que encosta na `ancora_chapeu`;
+Y sobe e a frente do rosto é +Z; metros. Clone o nó do nível em uso, ponha-o como filho da `ancora_chapeu` (posição e giro zero) e aplique a regra de escala acima. A borda de baixo de cada um assenta na curva do topo do balão (altura em que o corpo tem o raio de dentro do chapéu)
e nenhum desce abaixo da sobrancelha mais alta. Material PBR com textura pequena (`texturas/chapeus/`, 64² e 128², geradas por script em `scripts/chapeus/texturas_chapeus.py`).

| Id | Jeito | Materiais | Triângulos (alta/baixa) |
| --- | --- | --- | --- |
| `chapeu_panama` | de malandro de boteco: palha, copa com o vinco apertado, faixa preta e uma peninha | palha, faixa_preta | 2872/592 |
| `bone_aba_reta` | boné vermelho de aba reta e levantada, bolinha 8 no painel | tecido_bone, aba_bone, emblema_8 | 2120/320 |
| `cartola` | alta, de feltro preto, faixa de cetim vermelho e fivela de ouro | feltro_preto, cetim_vermelho, ouro | 2432/560 |
| `gorro_pompom` | gorro de lã listrado, barra dobrada e pompom | la_listrada, la_barra, la_pompom | 1788/320 |
| `chapeu_palha` | de festa junina: palha trançada, fita xadrez e laço vermelho | palha, xadrez, fita_vermelha | 2952/560 |
| `boina` | de pintor: feltro vinho, caída para um lado, rabinho no topo | feltro_vinho, faixa_boina | 1420/356 |
| `chapeu_festa` | cone de aniversário listrado, elástico e pompom | listras_festa, elastico, pompom_festa | 1600/332 |
| `coroa` | de rei da sinuca: ouro com cinco pontas e gemas | ouro, gema_vermelha, gema_azul, gema_verde | 1620/580 |

Prova de que nenhum cobre sobrancelha nem olho (`provas_chapeus.py --oclusao`: os 8 chapéus contra 24 caras, 12 caras com e sem o `estilo_kawaii`, que sobe a sobrancelha ao máximo, e câmeras a 0, 21 e 35 graus de elevação, de frente e a 30 graus):
com as câmeras do jogo (0 e 21 graus) a razão de pixels de sobrancelha e de olho à vista com e sem o chapéu é 1,000 nos 8; de cima (35 graus) é 1,000 em 6 e 0,943 (boné) e 0,962 (palha) só na cara mais extrema (susto + kawaii).
Exportação: `VALIDADOR=<validar.mjs> blender -b --factory-startup --python arte/personagens/scripts/chapeus/exportar_chapeus.py` (atômica; `SAIDA_CHAPEUS=<pasta>` exporta para outro lugar); 0 erros no validador, 736.680 bytes.
**O que o jogo ainda não faz:** `apps/web/scripts/copiar-personagens.mjs` copia `balao.glb` e `balao-meta.json`, não `chapeus.glb`, `chapeus-meta.json` nem os ícones: o Feltro integra (a sala e o catálogo usam os mesmos ids).

### Os ícones da loja (P8)

`exportados/icones/<id>.png`, 256x256, fundo transparente, o id do contrato como nome (`cartola.png`, `bigodao.png`, `olho_kawaii.png`, `azul.png`): os 8 chapéus e os 5 bigodes no balão neutro em cinza claro (a cabeça e o rosto de perto, luz de estúdio); os 4 estilos, o olho de perto;
as 8 cores, uma íris de perto (os doze últimos, estilos e cores, em recorte redondo). Refazer: servidor estático na 8731 e `python3 arte/ferramentas/icones_p8.py`. As folhas: `python3 arte/ferramentas/folhas_p8.py` (as quatro em `.outros/lote-p8/`).

Visor: `http://127.0.0.1:8731/arte/visor/balao.html` (botões: 13 ações, 12 caras, piscar dos dois olhos e de um; o olhar segue o ponteiro e as pálpebras acompanham; pisca sozinho). Quadro fixo: `?captura&cam=rosto|rosto34|olho|corpo|lado|jogo|cabeca|cabeca34|icone&acao=balao_pulinho&t=0.4&cara=cara_sorriso&piscar=0.5&esq=1&olhar=0.3,0.1,0.5&lod=baixa&yaw=25&dist=0.8&alvoy=0.02&glb=/.outros/lote-p7/antes/balao.glb`.
No P8 o visor equipa os itens: `&chapeu=cartola&bigode=bigodao&olhos=olho_kawaii&cor_olho=azul` (o `chapeus.glb` é o `?chapeus=caminho`; chapéu e bigode `nenhum` tiram), com a regra de escala do chapéu do meta, `&fundo=transparente` e `&luz=estudio` (para os ícones); ele continua abrindo um `balao.glb` v2 (sem os itens).
Para filmar: `window.passo({acao, t, cara, piscar, esq, dir, olhar:[x,y,z], cam, dist, alvoy, lod, rotulo, chapeu, bigode, olhos, cor_olho, cor, fundo, luz})` (determinístico, sem relógio) e `node arte/ferramentas/filmar_visor.mjs trabalhos.json PASTA 480x480 "query"` (um Chrome sem janela pelo protocolo DevTools, ~0,5 s por quadro);
`python3 arte/ferramentas/folha_balao_v2.py` monta a folha de antes e depois do P7 e `python3 arte/ferramentas/folha_balao_p7b.py [--glb=/caminho/balao.glb] [--saida=...]` a do P7b (v1 e v2b lado a lado, corpo azul e laranja); `arte/ferramentas/medir_olho.py` mede o branco do olho numa captura;
`python3 arte/ferramentas/comparar_contrato.py [novo.glb] [antigo.glb]` confere que o v2 só acrescentou ao v1; `arte/ferramentas/grade.py` monta grades. Sem janela, um quadro só: `bash arte/ferramentas/captura_visor.sh balao SAIDA.png "cam=rosto&cara=cara_sorriso" 520 520`.
O vídeo das 13 ações (`acoes.webm`): `python3 arte/ferramentas/video_balao.py [--glb=...] [--saida=...] [--paralelo=3]` (os quadros saem do `filmar_visor.mjs` com `acao` e `t = quadro/30`, o olhar passeia e o balão pisca; o `ffmpeg` junta em VP9).

## Visor da mão (prova do .glb no three.js)

Na raiz do repositório, servidor estático numa porta livre (nunca a 8001) e abrir o visor; o `three` vem do store do pnpm:

```bash
python3 -m http.server 8731 --bind 127.0.0.1
# http://127.0.0.1:8731/arte/visor/index.html     botões: uma pose por clique, com fade entre elas
# ?captura&pose=pose_punho&cam=cima&t=0.05&lod=baixa&tam=560x420   quadro fixo (cam: cima, tres_quartos, lado, baixo, frente, joinha, jogo_ponte, jogo_punho)
# ?de=pose_repouso&pose=pose_apontar&t=0.15&fade=0.35               a meio do fade (o `t` soma 0,2 s)
# ?captura&de=pose_repouso&pose=gesto_soco_ar&fade=0.2&quadro=13&cam=tres_quartos&seguir=1   o quadro 13 do gesto, depois do fade a partir do repouso (30/s)
# &raio=0.2&alvo=0,0.05,0.05   troca o enquadramento (referencial da mão, m); &seguir=1 centra a câmera na mão naquele instante; &sem-adereco esconde taco e planos
# &respirar=1                  soma o gesto_respirar (aditivo) por cima
```

Capturar sem janela: `google-chrome --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=6000 --window-size=560,420 --screenshot=SAIDA.png "URL"`.

## Skins de taco (P2 e P3)

Seis skins pintadas com geometria e nós do Blender (Cycles ortográfico, emissão pura), sem nenhum asset de fora (nada a creditar):
Coral, Bicho Solto, Corujão e Dragão das Quinze (P2), e Dragon Lore e Howl (P3). Refaz tudo com `python3 arte/skins/scripts/00_tudo.py [skin ...]`
(Blender 5 no PATH; as duas do P3 levam ~1 min, mais ~2 min da folha). O Corujão e o Dragão das Quinze ficam em `exportados/`, mas saem da
venda (`fora_do_catalogo: true` no `skins-meta.json`; `SKINS_FORA` em `especificacoes.py`).

```text
arte/skins/
  exportados/<skin>-<peca>.png            o que o jogo carrega (cor); -emissivo.png onde algo brilha; -metal.png (P3) onde há metal; -raro.png / -raro-emissivo.png / -raro-metal.png
  skins-meta.json                         por PNG: tamanho físico, px, emissivo, raro, rugosidade/metal/verniz sugeridos, peças lisas sugeridas
  skins.blend                             as skins em pistas (as raras do P3 também), no taco torneado como o do jogo, com a luz da mesa
  scripts/                                tela.py (a "câmera" da pintura), desenho/pintura/cor/medidas, um script por skin, previa.py + folha.py;
                                          P3: dragon_lore.py (+ dl_cabeca, dl_chama, dl_nos, dl_asas, dl_patas, dl_ornatos, gravura) e howl.py;
                                          plano_previa.py (prévia plana pequena, sem Blender) e montar_folha_p3.py
```

Convenções (valem para o Frontend):

- Cada PNG é uma peça aberta numa folha: x dá a volta (fecha na emenda), a linha de baixo é a ponta do taco (v = 0, como o `flipY` do three.js).
- O UV de `torneado.ts` corre u para a esquerda: use `texture.repeat.x = -1` (e `offset.x = 1`) para a arte sair como no PNG.
- O alto da figura aponta para a ponta do taco (na câmera do jogo a ponta fica no alto da tela), então o PNG sai de cabeça para baixo, de propósito.
- Tamanho = circunferência × comprimento da peça, até 8 px/mm e 2048 px no maior lado (a haste fica em 2,95 px/mm).
- Emissivo: preto = apagado; multiplique por `emissiveIntensity` (1 a 3). Espaço de cor sRGB nos dois mapas.
- Raro: variante de paleta da mesma arte; o rolo por taco é só o `offset.x`.

Manutenção: `medidas.py` replica as medidas do taco do jogo (`perfil-do-taco.ts`); se elas mudarem, refaça os PNGs. `tela.py` fixa o mundo do
Cycles em preto (o padrão do Blender é cinza 0,05, que acenderia o mapa emissivo todo).

### Dragon Lore e Howl (P3, pedido de 2026-10-26: cara de CS, desenho nosso)

Só se olhou a referência em palavras (paleta, traço, clima); nenhuma figura, composição ou arquivo do jogo entra no desenho nem na folha.

- **Dragon Lore** (haste, antebraço e cabo; punho liso marrom com anéis de ouro): pergaminho bege-oliva com ornamentos celtas bem apagados (nós em anel,
  triskeles e espirais em tinta fraca). Dragão europeu de nós celtas entrelaçados em marrom e ouro; cabeça e garras vermelho-alaranjadas, chifres claros,
  dentes e olho que acende. A cabeça fica no alto do antebraço, olhando para a ponta, com as asas recolhidas e o pescoço em trança logo atrás; a chama de
  vitral (faixas do vermelho ao amarelo, contorno claro, espirais finas, aura suave) sai da boca e corre pela haste até a ponta; no cabo, as patas e a
  cauda em trança que se enrola num nó de ouro. Emissivo: olho, boca e chama (suave). Metal: o ouro (`-metal.png`, só antebraço e cabo). Rara: Esmeralda
  (pergaminho de sálvia, corpo verde e ouro, cabeça esmeralda, chama do verde ao amarelo-claro).
- **Howl** (haste, antebraço e punho): lobo uivando, chapado em vermelho, laranja e preto, fundo escuro com detalhes vermelhos. Antebraço: cabeça de perfil, boca
  aberta, focinho para a ponta, lua vinho atrás e pelo em lascas pontudas descendo; haste: o uivo como chevrons que saem do focinho até a ponta, com eco e
  estrelas de quatro pontas; punho: o pelame com três pares de olhos acesos. Emissivo: olhos e boca. Rara: Lobo da Geada (azul-gelo e branco, olhos ciano).
- **Metal**: `-metal.png` em cinza (branco = ouro batido). Para o jogo: `metalnessMap`; sem `envMap` o metal escurece (use metalness 0,6 a 0,7 se não houver ambiente).
- **Conferência**: `verificar.py` agora também barra mapa emissivo/metal inteiro preto e mostra os matizes de cada pintura; folha do P3 em `.outros/lote-p3/folha.png`.

## O boteco (P4 a P6, pedidos de 2026-10-26 e 2026-10-27)

Um boteco brasileiro à noite em volta da mesa, em três níveis de detalhe, todos no **mesmo eixo, escala e origem** (metros, os do jogo): origem no centro do pano, X ao longo da mesa,
Y para cima, Z na largura. **A mesa não está no `.glb`** (o jogo a põe na origem). O piso fica em `y = -0,8` (`alturaDoPiso` do jogo), o teto em `y = 2,6`; a sala vai de x -5 a 5 e de z -3,2 a 3,2.
Tudo foi feito por script (`bash arte/boteco/scripts/00_tudo.sh`, ~8 min com GPU: fotos, texturas, letreiro, os três níveis e o `boteco-meta.json`). Nenhum logotipo, marca, time ou arte de terceiros (marcas e brasão inventados);
as únicas fotos são as 9 do ambientCG (CC0) em `arte/boteco/fotos/` (créditos em `docs/creditos.md`).

**Como é feito (P5).** A luz é **assada** no Cycles (Blender 5.2, GPU OptiX): cor, oclusão, luz direta+indireta (as lâmpadas, o néon, a janela e a sombra da mesa) e as marcas acesas viram um atlas JPEG por grupo, e o `.glb` leva as superfícies
assadas com `KHR_materials_unlit` (o three lê como `MeshBasicMaterial`). Ficam em PBR só o que precisa brilhar ou ser transparente: garrafas e vidros, metais, o letreiro, a janela e a luminária.
Os atlas têm UV própria, com densidade de texel por material: `casco` (`piso`, `forro`, `paredes`) e `objetos` (`assado`, `decoracao`), mais, no médio e no alto (P6), `sinais` (cartazes, quadro de giz, porta da geladeira e logos de cadeira e mesa, ~1250 px/m no alto, para o texto
ficar nítido de perto), que sai no material PBR emissivo `cartazes` (cor-base preta, o atlas na emissão): os cinco nomes sem luz não mudam. A imagem é gravada para que o tone mapping ACESFilmic do jogo (exposição 1) a devolva no tom
certo (`compor.py` inverte o ACES do three). Fotos CC0 de azulejo, reboco, madeira, formica e aço entram no assado, com sujeira e desgaste desenhados por cima.

**P6 (refino dos objetos, pedido de 2026-10-27).** Paredes, piso, forro e azulejo ficaram como estavam; os objetos saíram das caixas do P5 para modelos de verdade, todos por script e sem nenhum asset novo de terceiros:
cadeiras e mesinhas de plástico com borda filetada, assento fundo, encosto curvo com o logo "Rainha do Sul" nítido nos dois lados e pernas de tubo afunilado (`mobilia.py`); garrafas, latas e copos de torno suave com gargalo, ombro, tampinha ou rolha,
vidro âmbar, verde e claro em alfa com o líquido opaco por dentro, rótulos de papel com borda e desgaste (um atlas `rotulos` de marcas inventadas) e a prateleira conferida contra garrafa flutuando ou atravessando (`garrafas.py`); cartazes curvos com tachinha,
papel envelhecido e desbotado, quadro de giz com moldura, bandeja, giz e apagador (`aderecos.py`, `sinais_p6.py`); a janela com caixilho de madeira, grade de ferro, vidro sujo em alfa e a rua em camadas (céu, fachadas, chão, poste, luminoso de hotel e de pastelaria),
com paralaxe de verdade; e geladeira, cervejeira, freezer, TV de tubo, estufa, filtro de barro, porta de aço (lâminas de seção abaulada e o vale entre elas pintado na receita), engradados vazados, luminária e ventilador (`aparelhos.py`, `cena.py`).
Regra aprendida: tubo ou aresta com menos de ~1 cm sai preto no atlas assado (a ilha tem poucos pixels), e decalque sobre uma laje entortada precisa ficar mais de ~1,5 mm à frente da superfície (a malha entre os vértices é uma corda da curva).

**P6b (três defeitos achados jogando o P6, 2026-10-27).** (1) A tomada do alto da parede -z: um benjamim de três saídas (carregador branco à esquerda, dois plugues pretos com capa de borracha) e três cabos de 3,5 a 4,5 mm que dobram com raio de 3 cm, caem rente à parede, pousam no piso e correm pelo rodapé, em três faixas lado a lado, até sumirem no rodapé de ferro do balcão (`_tomada_com_benjamim` e `_cabo_pendurado`, `aderecos.py`); o fio de força da TV também virou curva (`aparelhos.py`). Os outros fios finos foram conferidos: os que sobram são hastes de verdade (antena, palito, argola) ou cabos pendurados na vertical (pendentes, luminária). (2) Engradados: 12 garrafas de 600 ml (3 × 4) em todos os do alto e do médio, grade interna e (no alto) réguas no fundo; as paredes baixaram para 0,23 m e os quatro pilares de empilhar sobem a 0,287 m (o passo da pilha), para a garrafa (o perfil `litrao` a 86%: 24,7 cm de altura, 6,3 cm de diâmetro) pousar no fundo com o gargalo e a tampinha passando do aro sem tocar o engradado de cima (`_engradado`, `aparelhos.py`; `garrafa_de_engradado`, `garrafas.py`, que substituiu a `gola_de_garrafa`). No alto, o do topo de cada pilha leva pescoço de vidro e rótulo; o resto é um torno só. (3) O escudo do E.C. Beco: tudo o que é de dentro (listras, faixa dourada, bola, estrelas, nome e ano) é desenhado numa folha à parte e colado pela máscara da forma (`escudo_cru`, `sinais.py`).
Regra aprendida: desenho cuja forma não é o retângulo da textura se desenha em duas folhas (o conteúdo e a máscara da forma) e se cola pela máscara, e o texto se recorta pela forma encolhida da grossura do contorno; fio é spline com dobras de raio de uns 3 cm, nunca duas varetas retas.

| Nível | Triângulos | .glb | Atlas (px) | Para quê |
| --- | --- | --- | --- | --- |
| `alto` | 140 842 | 13,7 MB | casco 4096² + objetos 4096² + sinais 3072² | menu em 3D e partida em qualidade alta (textura na placa: ~277 MB, eram ~207) |
| `medio` | 56 870 | 4,8 MB | 2048² x 3 | qualidade média (~80 MB, eram ~51) |
| `baixo` | 1 416 | 1,0 MB | 2048² + 1024² | casco, balcão e o essencial; a prateleira de garrafas é um quadro desenhado (~33 MB, igual) |

O que tem: parede de azulejo até 1,35 m com barrado de flor azul e reboco verde descascado, piso de ladrilho hidráulico sujo, balcão de formica vermelha com prateleira de garrafas (rótulos de marcas inventadas), chopeira, caixa registradora, estufa
de salgados, vitrine e copos, banquetas, mesinhas de plástico com cadeiras, ventilador de teto, quadro de giz com preços, letreiro de néon, janela com grade para a rua à noite, TV, geladeira e freezer, engradados, bandeirinhas, relógio, vigas e forro, a luminária
da mesa e os cantinhos (extintor, botijão, ar-condicionado split, caixa de som, lixeira, planta, material de limpeza). O médio e o baixo são os mesmos lugares com menos: no baixo as garrafas, os vidros e os metais também são assados.

**Contrato com o jogo** (o resto está em `exportados/boteco-meta.json`, versão 3, que só acrescenta material PBR e atlas: nós, marcadores, nomes sem luz, piso e folga não mudaram):

- Nós de malha: `boteco` (tudo que é fixo, um material por primitiva), `luminaria` (origem em `(0, 0,9, 0)`; o jogo já tem a sua em `ambiente.ts`), `ventilador-helice` (origem no cubo: gire em Y; o baixo não tem),
  `letreiro-neon` (alto: tubos + brilho; médio e baixo: placa com a textura acesa) e `janela-rua`.
- **Sem luz** (`KHR_materials_unlit`): `piso`, `forro`, `paredes`, `assado`, `decoracao` (e `prateleira-garrafas` no baixo). Não ligam às luzes do jogo nem recebem a sombra da mesa (a sombra do pano e da luminária já está assada no piso).
  O material `madeira` não existe mais (as vigas estão em `forro`, a madeira em `assado`). **PBR**: `vidro-*` (alfa, uma face), `liquido-*`, `capsula`, `tampa*`, `rolha`, `espuma`, `cromado`, `inox`, `rotulos`, `madeira-pa`, `luminaria-casco`, `ferro`, `poste`, `vidro-janela` (alfa por textura). **Emissivos**: `neon-*`, `letreiro`, `luminaria-luz`, `lampada`, `luz-estufa`, `vitrine`, `tv-tela`, `cartazes` (P6), `rua-fundo`, `rua-fachada`, `rua-chao`, `rua-placa`, `poste-halo` (a lista exata sai do próprio .glb em `boteco-meta.json`).
  `letreiro-halo` é alfa: use blending **aditivo** e `depthWrite = false` (o visor faz). `decoracao` e `letreiro-halo` são de duas faces.
- Luzes são **marcadores** (nós vazios com `extras`: `tipo`, `cor`, `intensidade` relativa, `alcance`; o `GLTFLoader` os deixa em `userData`): `luz-luminaria`, `luz-neon`, `luz-balcao`, `luz-janela`, `luz-salao`. Como o casco e os móveis já vêm iluminados,
  essas luzes agora só valem para o PBR (garrafas, vidros, metais, luminária, ventilador, néon): `luz-salao` deixou de ser necessária para as paredes. No visor, `ponto` = intensidade × 8.
- Câmeras do menu: `camera-menu-1`, `-2`, `-3` (câmeras glTF, yfov 50°, olhando para a mesa; o alvo está em `extras.alvo`). A `camera-menu-1` mudou para `(4,6, 1,6, 2,0)`.
- Metais (`cromado`, `tampa`, `inox`) só ficam claros com `envMap` (o jogo usa o reflexo de sala por nível).
- **Folga do taco:** nenhum adereço abaixo de 2,1 m do piso entra a menos de 1,6 m da borda de fora da moldura da mesa (1,17 × 0,72 m), exceto a luminária. A menor folga é 1,635 m (a banqueta mais perto), conferida por `cena.py` em cada nível.
- Validação: `gltf-validator` sem erros nem avisos nos três níveis (`.outros/lote-p6/validacao.txt`; prova no servidor de verdade, com CSP, em `.outros/lote-p6/prova-servidor.txt`: 0 violações e 0 "Couldn't load texture"); orçamento: alto ≤ ~150 mil triângulos e ~20 MB, médio ≤ ~60 mil e ~8 MB, baixo ≤ ~8 mil e ~2 MB (JPEG, sem KTX2).

Scripts (`arte/boteco/scripts/`; rodam com `uv run --with numpy --with pillow --with scipy python3 ...`, o Blender só em `construir.py`):

| Script | O que faz |
| --- | --- |
| `00_tudo.sh` | refaz tudo: `bash arte/boteco/scripts/00_tudo.sh [baixo medio alto]` (precisa de Blender 5 no PATH, `uv`, ~3 GB de RAM livres; a validação usa `node` com `npm i gltf-validator`) |
| `fotos.py` | baixa as 9 fotos CC0 do ambientCG (só as que faltam) e escreve `fotos/LICENCAS.md` |
| `letras.py` | a fonte de traço única (A a Z, 0 a 9, `R$`, vírgula, hífen, Í Ó Ã Ç...), desenhada à mão: serve ao letreiro, ao néon do boteco e ao quadro de giz |
| `marca.py` | o letreiro do jogo: SVG e PNG aceso e apagado (veja abaixo); `elementos()` também alimenta os tubos do néon e a textura do boteco |
| `texturas.py` | as texturas de PBR que sobram (rótulos, letreiro, rua, quadro, cartazes, decoração, vitrine, TV) em `texturas/<nivel>/` |
| `sinais.py` | desenhos à mão: ladrilho hidráulico do piso, rótulos, cartazes, escudo (recortado pela máscara da forma), prateleira de garrafas do nível baixo (`texturas/sinais/`) |
| `sinais_p6.py` | P6: rótulos de papel e logos nítidos, cartazes e quadro de giz por nível, sujeira do vidro e as camadas da rua à noite |
| `geom.py` | kit de geometria (caixa, caixa chanfrada e arredondada, laje de borda filetada, sólido de revolução com perfil suave, tubo afunilado, remendo paramétrico `superficie`/`orientada`, spline) com normais e UV |
| `const.py` | medidas fixas da sala e da mesa (as do jogo) |
| `cena.py` | o boteco em geometria pura, por nível (`construir(lod)`), com os materiais, os marcadores e a conferência da folga (`python3 cena.py` imprime triângulos e folga) |
| `aderecos.py` | os adereços (balcão, cartazes, quadro de giz, fiação, a tomada com benjamim e seus cabos, bandeirinhas, cantinhos...) em geometria pura |
| `aparelhos.py` | P6: geladeira, cervejeira, freezer, TV de tubo, estufa, filtro de barro, porta de aço e os engradados com as 12 garrafas de 600 ml cada |
| `garrafas.py` | P6: garrafas, latas, copos, a prateleira e a conferência de que nenhuma garrafa flutua ou atravessa; P6b: `garrafa_de_engradado` |
| `mobilia.py` | P6: cadeira, mesinha e banqueta |
| `blender_mat.py` | receitas dos materiais no Blender (fotos CC0 + sujeira e desgaste, normais amortecidas na luz, `KHR_materials_unlit`) |
| `construir.py` | o Blender: `--fase montar` (UV própria, passes do Cycles: cor, oclusão, luz, marcas) e `--fase exportar` (atlas JPEG, materiais sem luz, `.glb`; `--publicar` grava em `exportados/` e salva o `.blend` empacotado) |
| `compor.py` | junta cor × luz × oclusão no atlas JPEG do nível, com a exposição achada pelo percentil 99 e o tom invertido contra o ACES do three |
| `contar.py` | lê um `.glb` só com a biblioteca padrão: triângulos por nó, imagens, caixa, marcadores (`python3 contar.py arquivo.glb`) |
| `glb_info.py` | lista materiais (sem luz, PBR, emissivo) e imagens de um `.glb` |
| `validar.mjs` | roda o `gltf-validator` (Khronos) em um ou mais `.glb` |
| `meta.py` | grava `exportados/boteco-meta.json` (contrato versão 3, níveis, luzes, câmeras, materiais sem luz, PBR e emissivos lidos do próprio .glb, adereços e a folga) |
| `folha.py` | a folha de prova de 1600×900 (antes e depois nos três níveis, câmera de menu e dois detalhes): precisa do servidor estático e do Chrome |

`arte/boteco/trabalho/` (passes do Cycles, atlas intermediários, ~900 MB enquanto o nível monta) está no `.gitignore`; `00_tudo.sh` apaga as passes brutas (`.npy`) no fim de cada nível.

Visor: `arte/visor/boteco.html` (botões de nível e de câmera; mesa de referência com as medidas da física, que não vai no `.glb`). Quadro fixo:
`VIRTUAL_TIME=60000 bash arte/ferramentas/captura_visor.sh boteco SAIDA.png "nivel=alto&cam=jogo" 1280 720` (o nível alto é pesado para o Chrome sem GPU: dê tempo; o script usa perfil temporário e repete até 3 vezes).
Parâmetros: `cam` (`jogo` atrás da mesa a 1,5 m do piso, `menu1` a `menu3`, `cima`, `canto`, `fundo`, `planta`, `livre` com `pos=x,y,z&alvo=x,y,z&fov=graus`), `glb=/caminho.glb` (outro arquivo), `casco=leve` (o casco em cor lisa, como o jogo faz no nível baixo),
`zona` (folga de 1,6 m), `semluzes`, `sombras=0`, `exp=`.

Cuidados que pegam: o `.glb` repete as coordenadas do jogo (a conversão Z-para-cima do Blender é `(x, y, z) -> (x, -z, y)` em `construir.py`); a rua da janela é um quadro plano 0,8 m atrás da parede;
`bpy.context.preferences.filepaths.save_version = 0` evita os `.blend1`; o Blender 5 avisa que `Material.use_nodes` sai no 6.0 (só aviso). Se uma exportação recria o material com sufixo `.001`, o `KHR_materials_unlit` some: as fontes têm o prefixo `f:` por isso.
Na luz assada, o mapa de normais é amortecido (detalhe fino em resolução menor vira serrilhado), e `Emission Strength` tem de ser 0 nos materiais que não acendem, senão o exportador grava `emissiveFactor` branco.

## O letreiro do jogo (P4)

"SINUCA" e "PAR OU ÍMPAR" em néon de boteco (rosa, ciano e âmbar), com uma linha âmbar de bolas nas pontas (o taco) e estrelas entre as duas linhas. Em `arte/marca/`, 2048 px de largura, PNG com fundo transparente e SVG (com filtros de brilho):

| Arquivos | O que é |
| --- | --- |
| `letreiro-acesa.{svg,png}` / `letreiro-apagada.{svg,png}` | as duas linhas juntas (2048×1034) |
| `sinuca-acesa` / `sinuca-apagada` | só "SINUCA" com o taco (2048×882) |
| `par-ou-impar-acesa` / `par-ou-impar-apagada` | só "PAR OU ÍMPAR" (2048×635) |

Acesa: o alfa é o maior canal da luz somada (soma de luz sobre transparente): em fundo escuro dá o brilho do néon, em fundo claro fica lavada, então use sobre escuro. Apagada: tubo de vidro fosco com as tampas pretas nas pontas, sem brilho.
As letras são desenhadas por nós (`letras.py`), sem fonte de terceiros. Refaz com `uv run --with numpy --with pillow python3 arte/boteco/scripts/marca.py arte/marca`.

