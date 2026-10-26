**`packages/personagens`** (`@sinuca/personagens`) — a camada genérica dos personagens do jogo (hoje a mão), para vários jogos: **nada de sinuca aqui**. Dono: Frontend. Mapa raiz: `CLAUDE.md`.

## Fronteiras

- Nunca importa `@sinuca/*` (nem `fisica`, nem `regras`, nem `protocolo`): o lint (`eslint.config.js`) barra. Os termos são genéricos: *segurar cilindro*, *apoiar palma num plano*, *pinçar cubo*, *fazer gesto*; "taco", "ponte" e "giz" são de `apps/web`.
- `src/` é puro: sem three, sem DOM, sem rede (o lint barra `three` aqui). `src/three/` é a camada que desenha; `three` é dependência de par. Subcaminhos: `@sinuca/personagens` (puro) e `@sinuca/personagens/three`.
- A fonte do personagem é um `.glb` do Artista (`arte/personagens/exportados/`, nunca editado aqui) e dois arquivos de notas: os contatos (`mao-taco.json`) e a meta dos gestos (`mao-meta.json`: duração, pico, ciclo, aditivo, onde o gesto começa e termina). `apps/web/scripts/copiar-personagens.mjs` copia os três para `apps/web/public/personagens/` no `dev` e no `build`.

## Mapa

```text
src/tipos.ts, quaternios.ts   Ponto/Quarteto/Trio e a conta de quaternions em Float64Array (nada aloca)
src/ficha.ts                  Ficha (ossos, poses, gestos), validarFicha, indiceDoOsso, poseDeRepouso
src/cinematica.ts             Cinematica: correntes de ossos (dedos), dobra extra por eixo, pontas
src/contatos.ts               lerContatos (mao-taco.json): cilindros (`ponte_v`, `punho` e as outras pontes: `ponte_laco`, `_elevada`, `_tabela`, `_colada`, `_canto`), pinça (cubo), `Contatos.gestos` (L29: `ContatoDeGesto` = o ponto da palma do `tapinha` e das `palmas`, no referencial do arquivo), raioNoPonto
src/meta.ts                   lerMeta (mao-meta.json): `GestoDaMeta` por nome de gesto sem o prefixo (`duracaoS`, `picoS`/`picosS`, `cicloS` [de, até], `aditivo`, `comecaEm`, `terminaPendurado`); quadros viram segundos pelo `fps` da ação, e a duração é (quadros − 1)/fps
src/alinhar.ts                segurarCilindro, apoiarPalma (L29: também leva a palma do tapinha e das palmas até o plano/ponto), pincarCubo e as voltas (baseDoCilindro, cilindroDoQuadro, cuboDoQuadro): o Quadro (posição, giro, escala) que leva o personagem ao contato; `misturarQuadros(a, b, t, saida)` (L29) mistura dois quadros sem alocar (a troca de ponte e o tapinha); `pontoNoMundo`/`vetorNoMundo` levam um ponto/vetor do arquivo ao mundo por um quadro
src/mistura.ts                MisturaDePoses: a pose A mistura B por t, uma segunda pose por cima (`sobrepor`, a pinça do giz), o gesto com entrada e saída (`repetir` no ciclo da meta, `segurar` no último quadro, `duracaoMaxima`) e os aditivos sempre ligados (a respiração, `ligarAditivo`)
src/malha.ts                  pelarMalha, esferasDosOssos, pontosDeApoio: a pele pelos pesos dos ossos, as esferas de colisão
src/modelo.ts                 construirModelo: a ficha + correntes + contatos numa estrutura só; esferasNaPose
src/para-testes.ts            auxiliares dos testes
src/three/ficha-do-gltf.ts    lê a Ficha do .glb (ossos, poses = última amostra do clipe, gestos = clipes com prefixo gesto_)
src/three/latex.ts            materialDeLatex(cor) (MeshPhysicalMaterial, clearcoat), tingirMaterial, NivelDeDetalhe
src/three/carregar.ts         carregarPersonagem(url, urlContatos, { urlDaMeta }) / carregarPersonagemDeBytes(glb, contatos, { meta }) → BaseDoPersonagem (malhas alta/baixa, látex, tingir, instanciar(espelho); `meta` é `null` sem o arquivo; se `urlDaMeta` vem e falha, a carga falha)
src/rosto.ts                  L30: `MisturaDeCaras` (formas do rosto por nome, mistura suave entre caras, pesos já × (1 − piscar)) e `Piscador` (piscar sozinho com o sorteio injetado, nunca `Math.random`)
src/olhar.ts                  L30: `girarOlho`: gira o olho do repouso até a direção, cortada no limite do meta (30°), em Float64Array
src/acoes.ts                  L30: `MisturaDeAcoes`: ações de corpo em camadas com crossfade, a base em ciclo, `fazer(nome, { entradaS, saidaS, repetir })` repete o trecho do meta enquanto o jogo pedir; as que não repetem saem sozinhas
src/ancora.ts                 L30: `ancoraDaMatriz`: posição e giro de um ponto de ancoragem, sem a escala do pai
src/meta-do-rosto.ts          L30: `lerMetaDoRosto` (`balao-meta.json`): formas, caras `cara_*`, ações (`duracaoS`, `cicloS`, `caraPar`), olhos, limite do olhar, âncoras (`pontos_das_maos`)
src/three/rosto-em-cena.ts    L30: `PersonagemDeRosto` (o personagem do balão: morph targets em todos os filhos da versão, ações, caras, piscar, `olharPara(ponto)` depois do mixer, `ancora(nome, quadro)`, `tingir(cor)` e `corDoLatex`)
src/three/carregar-rosto.ts   L30: `carregarPersonagemDeRosto(urlGlb, urlMeta, opcoes)` → `BaseDoRosto` (`instanciar`, `triangulos`, `duracaoDoClipe`)
src/three/personagem.ts       PersonagemEmCena: raiz, definirNivel, ir/misturar (poses), sobrepor (pose por cima), fazerGesto/soltarGesto (trocar de gesto no meio de outro larga o primeiro de verdade), picoDoGesto, ligarAditivo, girarOsso (L29: gira um osso por cima da pose, o pêndulo do pulso), pesoDoGesto/tempoDoGesto/gestoEmCurso, dobrar (dedo), colocar(Quadro, escala), atualizar(dt) com AnimationMixer; nada aloca por quadro
```

## Regras que a prática ensinou

- **Pose = última amostra do clipe.** A primeira amostra de cada clipe de pose é um artefato (a mão começa de um estado intermediário); o gesto `gesto_joinha` (1,233 s) também começa de um estado intermediário, então a entrada precisa de alguns centésimos para a mão chegar nele.
- **Mão esquerda = espelho em x** da direita (referencial do arquivo: +Y dedos, +X mínimo, +Z dorso); `instanciar(true)` espelha geometria e ossos, sem escala negativa.
- **Dobra extra dos dedos** (`dobrar`): eixo de dobra por corrente, positivo fecha o dedo. O mixer só reescreve um osso quando o valor da animação muda, então a dobra do quadro anterior é desfeita antes de `mixer.update(0)` (senão ela se soma a cada quadro; há teste).
- **`Material.copy` serializa `userData.corBase`** (cor vira número hex); `tingirMaterial` aceita as duas formas. As variantes de material por nível de qualidade de `apps/web` (`VariantesDeMateriais`) refazem-se com `aplicador.reaplicar()` depois da carga assíncrona.
- Os testes de `three/personagem.test.ts` leem o `.glb` real da pasta do Artista; se ele mudar de nomes (ossos, poses, malhas), é lá que o contrato quebra primeiro.
- **Gesto = clipe `gesto_*` + nota na meta (L29).** A meta diz o que o clipe não diz: onde fica o pico (o instante do som e do contato), qual trecho repete (`palmas`, `tamborilar`), se é aditivo (a respiração soma por cima de qualquer pose) e se termina pendurado (`mole`: o jogo o segura até pedir outra coisa). Os gestos saem da `pose_repouso`, menos o `tamborilar`, que sai da `pose_punho`. Trocar de gesto no meio de outro desliga o anterior de verdade (antes ele ficava ligado com o último peso e sujava o seguinte; há teste).
- **Rosto por formas, não por textura (L30).** O balão do artista (`balao.glb`) tem cada versão (alta e baixa) em cinco primitivas, e **todas** levam as mesmas formas: aplicar o peso numa só deixa o resto de cara fechada. O piscar multiplica a cara por `1 − piscar` (a pálpebra nunca briga com o sorriso). A cara-alvo não decai quadro a quadro: o peso dela sobe até o alvo e só as outras descem (houve um bug em que oscilava entre 1 e 0,81; há teste).
- **Tingir em variantes de qualidade.** `VariantesDeMateriais` troca os materiais das malhas por cópias feitas com a cor de quando nasceram (branca). Tingir só o látex original deixa o balão branco nos níveis médio e baixo: `tingir` pinta também o material que a malha usa agora, e `corDoLatex` lê esse.
- **Âncoras.** `ancora(nome, quadro)` devolve só posição e giro (Gram-Schmidt), nunca a escala do corpo: quem prende a mão põe o tamanho dele. A duração de um clipe do balão é quadros/fps (a da mão é (n − 1)/fps).
- **Olhos depois do mixer, sem alocar.** O olhar roda em `atualizar` depois de `mixer.update(0)` e das formas, porque o mixer reescreve a rotação dos olhos; o osso fica `quaternion = giro × repouso`.
