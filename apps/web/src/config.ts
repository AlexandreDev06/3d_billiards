import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { FORMATO_DO_MODO, type ModoSala } from '@sinuca/protocolo';
import type { Jogador } from '@sinuca/regras';
import type { ConfigDoMovimento } from './cena/transicao';
import { REGRAS_GIZ_PADRAO, type RegrasGiz } from './controles/regras-giz';
import type { ConfigDaTransicao } from './jogo/transicao-modelo';
import type { TempoDaTacadaS } from './relogio/modelo';
import type { NomeDaPonte } from './maos/pontes';
import type { AcaoDoBalao } from './baloes/acao-do-balao';

const grausParaRad = Math.PI / 180;
/** A inclinação de repouso do taco, só visual (a física segue com elevação 0). */
const ELEVACAO_DE_REPOUSO = 5 * grausParaRad;

export interface ConfigMira {
  /** rad por pixel de movimento horizontal do mouse. */
  readonly radianosPorPixel: number;
  /** Multiplicador com Shift. */
  readonly fatorFino: number;
}

export interface ConfigTacada {
  readonly metrosPorPixel: number;
  /** Folga ponta-bola ao mirar (m). */
  readonly recuoInicial: number;
  readonly recuoMaximo: number;
  readonly janelaVelocidadeMs: number;
  /** Velocidade do mouse (m/s, já em metros do taco) que dá a força máxima. */
  readonly velocidadeEntradaMax: number;
  /** > 1: tacada leve pede movimento proporcionalmente mais lento que a forte. */
  readonly expoenteForca: number;
  readonly velocidadeMin: number;
  /** Velocidade do taco (m/s) na puxada mais forte; nunca passa de `velocidadeMaxTaco` da física. */
  readonly velocidadeMax: number;
  /** Inclinação só visual do taco (rad); `ParametrosTacada.elevacao` segue em 0 até a Fase 3. */
  readonly elevacaoVisual: number;
  /**
   * A força "pela linha": a barra cheia é a puxada de `recuoMaximo − recuoInicial` (a sensibilidade de força do jogador muda quanto
   * mouse isso pede), a velocidade vem de `velocidadeDaLinha`, e soltar com menos de `fracaoMinima` da barra cancela a tacada.
   */
  readonly linha: {
    /** > 1 achata o alto da curva; 1 = reta de 0 a `velocidadeMax`. Ajustado na física real (forca-linha.test.ts). */
    readonly expoente: number;
    readonly fracaoMinima: number;
    /** Marcas da barra no HUD (fração da barra cheia). */
    readonly marcas: readonly number[];
    /**
     * Soltar o botão: o taco corre da puxada até a bola (distância ÷ metade da velocidade do impacto, entre estes dois tempos, em
     * s) e só então as bolas começam a andar.
     */
    readonly batidaMinS: number;
    readonly batidaMaxS: number;
  };
  /** Quanto o taco avança além do impacto (m) e em quanto tempo (s). */
  readonly seguimento: number;
  readonly duracaoSeguimentoS: number;
  /** Quanto o taco fica visível parado no fim do seguimento antes de sumir (s). */
  readonly permanenciaS: number;
}

/** A elevação visual do taco que o põe por cima da tabela, da moldura e das outras bolas (`ElevacaoDoTaco`). */
export interface ConfigElevacaoDoTaco {
  /** Elevação de repouso (rad): a de sempre, 5°. */
  readonly minima: number;
  /** Até onde o taco sobe para passar por cima (rad); a bola colada na tabela atrás dela pede quase isto. */
  readonly maxima: number;
  /** Folga entre o taco e o que ele passa por cima (m). */
  readonly folga: number;
  /** Quão depressa a elevação sobe e desce até o alvo (1/s): sobe depressa para não atravessar, desce devagar para não tremer. */
  readonly taxaSubida: number;
  readonly taxaDescida: number;
}

export interface ConfigEfeito {
  /** Fração do raio por segundo com a tecla pressionada. */
  readonly velocidade: number;
  /** Maior distância do centro (fração do raio). */
  readonly raioMaximo: number;
}

export interface ConfigCamera {
  readonly campoDeVisaoGraus: number;
  /**
   * Câmera de tacada: `distancia` atrás da bola e `altura` sobre o pano (com zoom 1), olhando `olharAdiante` à frente da bola. O
   * taco que sobe (bola perto da tabela) leva a câmera junto (`poseDaCameraDeTacada`): ela fica `margemDoTaco` acima da linha do
   * taco, vista da bola, e nunca passa de `elevacaoMaxima` (ângulo da câmera sobre o pano, em rad).
   */
  readonly tacada: {
    readonly distancia: number;
    readonly altura: number;
    readonly olharAdiante: number;
    readonly margemDoTaco: number;
    readonly elevacaoMaxima: number;
  };
  /**
   * Vista de cima: folga em volta da mesa (moldura incluída; 1 = encosta nas bordas da faixa livre) e
   * largura (px) que o HUD cobre em cada lado, para o placar e o painel de efeito não taparem a mesa.
   */
  readonly cima: { readonly margem: number; readonly reservaEsquerdaPx: number; readonly reservaDireitaPx: number };
  readonly orbital: {
    readonly radiosPorPixel: number;
    readonly elevacaoMinGraus: number;
    readonly elevacaoMaxGraus: number;
    /** A órbita começa da posição atual da câmera, mas nunca mais perto do centro que isto (m). */
    readonly raioInicialMin: number;
  };
  readonly zoomMin: number;
  readonly zoomMax: number;
  /** Quanto a roda muda o zoom por "clique" (fração). */
  readonly passoZoom: number;
  /** Taxa (1/s) do amortecimento exponencial da câmera. */
  readonly taxaSuavizacao: number;
}

export interface ConfigCena {
  /** Quanto a bola encaçapada leva afundando antes de sumir (s). */
  readonly duracaoQuedaS: number;
}

/** Desenho da mesa: tudo que não vem das medidas da física (m, salvo onde disser). */
export interface ConfigMesa {
  /**
   * Madeira que sobra entre o buraco mais fundo (o do meio: o círculo de queda vai `fundoMeio + 2 · raio` além do nariz) e a
   * borda de fora da moldura. Se a moldura das medidas não dá essa parede, o desenho a alarga (`larguraDaMoldura`).
   */
  readonly paredeDaCacapa: number;
  /** Quanto a face do nariz recua no pano além do mínimo que deixa a bola encostada fora da borracha. */
  readonly folgaRebaixo: number;
  /** Arredondado do topo da tabela atrás do nariz (raio do quarto de círculo). */
  readonly chanfroTopo: number;
  /** Verniz da madeira: reflexo discreto, para o brilho da luminária não virar uma faixa clara. */
  readonly madeira: { readonly rugosidade: number; readonly verniz: number; readonly rugosidadeDoVerniz: number; readonly especular: number };
  /** Raio dos cantos externos da moldura. */
  readonly raioCantoMoldura: number;
  /** Lados de um círculo inteiro; os arcos usam a fração que ocupam. */
  readonly segmentosPorVolta: number;
  /** Lado (m) do quadrado de pano que a textura cobre ao se repetir. */
  readonly ladoTexturaPano: number;
  /** Espessura da camada de pano (a cama), abaixo do pano. */
  readonly espessuraPano: number;
  /** Quanto o topo da moldura passa do nariz da tabela. */
  readonly sobraMoldura: number;
  /** Arredondado das arestas de cima da moldura. */
  readonly chanfroMoldura: number;
  /** Quanto o buraco da caçapa desce abaixo do pano, até o escuro. */
  readonly profundidadeTubo: number;
  /** Do pano ao piso. */
  readonly alturaDoPiso: number;
  readonly saia: { readonly altura: number; readonly recuo: number; readonly espessura: number };
  readonly pe: { readonly lado: number; readonly sapata: number };
  readonly diamante: { readonly raio: number; readonly espessura: number };
  /** Lábio de alumínio no topo do entalhe: raio do fio, quanto passa do topo da moldura e quanto fica para fora do furo. */
  readonly labio: { readonly raio: number; readonly sobra: number; readonly afastamento: number };
  /** Forro escuro (couro) da parede do entalhe: espessura. */
  readonly couro: { readonly espessura: number };
  readonly cores: {
    readonly pano: number;
    readonly tabela: number;
    readonly aluminio: number;
    readonly perola: number;
    readonly piso: number;
    readonly marca: number;
  };
}

/** Luz da cena: toda quente, de luminária de bar (as cores vêm de temperaturas em K). */
export interface ConfigLuz {
  /** Exposição do tonemapping (ACES). */
  readonly exposicao: number;
  /** Quanto o ambiente (RoomEnvironment, tingido de quente) reflete e ilumina. */
  readonly intensidadeAmbiente: number;
  /** Reflexo do ambiente nos metais (alumínio): eles só têm reflexo, então pedem mais. */
  readonly intensidadeMetal: number;
  /** Temperatura (K) da sala que o alumínio reflete: mais clara que a da luz, senão ele parece latão. */
  readonly temperaturaMetalK: number;
  /** Cor do fundo da cena: marrom quase preto. */
  readonly fundo: number;
  /** Intensidade da direcional que faz as vezes do foco nos níveis de `focoBarato` (sem queda: tem de bater com o centro do foco). */
  readonly intensidadeDirecional: number;
  /** Quanto o preenchimento em hemisfério cresce quando o nível não tem o reflexo de sala (ele dava parte da luz). */
  readonly compensacaoSemAmbiente: number;
  /** Preenchimento em hemisfério: de cima na temperatura dada, de baixo no tom do piso. */
  readonly preenchimento: { readonly temperaturaK: number; readonly intensidade: number; readonly chao: number };
  readonly luminaria: {
    /** Altura da luminária acima do pano (m): perto, como num bar. */
    readonly altura: number;
    readonly largura: number;
    readonly profundidade: number;
    /** Temperatura de cor da lâmpada (2700–3000 K: incandescente de bar). */
    readonly temperaturaK: number;
    /** Intensidade da luz retangular (reflexo nas bolas e no verniz). */
    readonly intensidade: number;
  };
  /** O foco que faz as sombras, no centro da luminária. */
  readonly foco: { readonly intensidade: number; readonly penumbra: number; readonly vies: number; readonly viesNormal: number };
}

/** A transição depois de uma falta (ou de uma recolocação): quanto dura cada passo. */
export interface ConfigTransicao extends ConfigDaTransicao {
  readonly movimento: ConfigDoMovimento;
}

/** O destaque das bolas que valem, no começo da vez (e enquanto se segura B). */
export interface ConfigDestaque {
  /** Quanto dura desde o começo da vez (s). */
  readonly duracaoS: number;
  readonly aparecerS: number;
  readonly sumirS: number;
  /** Na tacada de saída todas as bolas valem: não acende. */
  readonly naSaida: boolean;
  readonly cor: number;
  /** Opacidade do anel com tudo aceso. */
  readonly opacidadeMax: number;
  /** Pulsação suave: quantas vezes por segundo e quanto da opacidade ela varia (0–1). */
  readonly pulsosPorSegundo: number;
  readonly pulsoOpacidade: number;
}

export interface ConfigHud {
  /** Quanto tempo a frase da última falta ou consequência fica na tela (s). */
  readonly textoSegundos: number;
  /** Quanto tempo o aviso curto "Ana pula a vez (falta)" (a roda pulou quem perdia a próxima vez) fica na tela (s). */
  readonly vezPerdidaSegundos: number;
  /** Quanto tempo o aviso grande "Agora é só a N!" fica na tela no começo da vez de quem está no castigo (s). */
  readonly anuncioSegundos: number;
  /** Abaixo deste nível o giz do jogador da vez fica em alerta (0–1). */
  readonly gizBaixo: number;
  /** Com o giz neste nível ou acima, o taco que espirra espirrou por efeito demais, não por falta de giz (0–1). */
  readonly gizAlto: number;
  /** Quanto tempo o alerta "Espirrou!" fica na tela (s). */
  readonly espirroSegundos: number;
  /** Tempo por tacada que o seletor da sala e do hot-seat traz marcado (s); `null` = sem limite. */
  readonly relogioPadraoS: TempoDaTacadaS;
  /** Nos últimos tantos segundos o contador da vez fica vermelho. */
  readonly relogioAlertaS: number;
  /** As missões do dia (L32): quanto cada aviso fica na tela (s), quantos cabem de uma vez e o intervalo mínimo entre duas leituras da carteira que o lobby pede (s). */
  readonly missoes: { readonly progressoSegundos: number; readonly cumpridaSegundos: number; readonly maximo: number; readonly leituraMinimaS: number };
}

export interface ConfigAudio {
  /** Volume geral de quem nunca mexeu nele (0–1). */
  readonly volumeGeral: number;
  /** Vozes simultâneas; passou disso, a mais fraca cede (a quebra não pode estourar). */
  readonly maxVozes: number;
  /** Velocidade do impacto (m/s) abaixo da qual não há som. */
  readonly velocidadeMudo: number;
  /** Velocidade do impacto (m/s) que dá o volume cheio. */
  readonly velocidadeCheia: number;
  /** Volume do impacto mais fraco que ainda soa (fração do cheio). */
  readonly volumeMin: number;
  /** Abaixo de 1 abre os impactos fracos: o ouvido não mede volume em linha reta. */
  readonly expoenteVolume: number;
  /** Multiplicador de frequência dos geradores no impacto mais fraco e no mais forte. */
  readonly tomMin: number;
  readonly tomMax: number;
  /** O evento da caçapa não traz velocidade: volume fixo. */
  readonly volumeCacapa: number;
  readonly amostras: ConfigAmostras;
  readonly avisos: ConfigAvisosDeSom;
}

/** Como as amostras (`public/sons/`) viram sons: variação, tom, ganho. */
export interface ConfigAmostras {
  /** Onde fica o manifesto, a partir da raiz do site. */
  readonly manifesto: string;
  /**
   * Até que distância (em intensidade, 0 a 1) da faixa de uma variação ela ainda pode ser sorteada. Dentro da faixa pesa
   * 1; na borda da folga pesa 0. É isso que faz dois choques seguidos de mesma força não soarem iguais.
   */
  readonly folgaDaFaixa: number;
  /** Quanto do tom do pedido (0,9 a 1,15) vira mudança de velocidade da amostra: 0 = nada, 1 = tudo. Gravação não aguenta ±15%. */
  readonly fatorTom: number;
  /** Sorteio da velocidade de cada toque: ± isto (fração; 0,03 = ±3%) para choques iguais não somarem em fase. */
  readonly variacaoDeTaxa: number;
  /** Cada toque entra com um atraso sorteado de 0 a isto (ms): a quebra soma vários choques no mesmo instante. */
  readonly atrasoMaxMs: number;
  /** Ganho de todas as amostras, antes do volume geral. */
  readonly ganho: number;
}

export interface ConfigAvisosDeSom {
  /** No hot-seat, o tempo que acabou toca e só depois o sino da vez do próximo: espera isto (ms). */
  readonly sinoDepoisDoEsgotadoMs: number;
}

/**
 * Linha de previsão do painel dev: o caminho do bolão e a saída da primeira bola, calculados pela
 * própria `simularTacada` (pedido do usuário, `docs/decisoes.md`). Liga, desliga e força vêm do painel.
 */
export interface ConfigPrevisao {
  readonly ligada: boolean;
  /** Mostra também a linha curta da primeira bola atingida. */
  readonly bolaAtingida: boolean;
  /** Velocidade do taco (m/s) da tacada prevista: uma tacada média. */
  readonly velocidadeTaco: number;
  /** Teto do comprimento do caminho do bolão (m), somando os trechos depois das tabelas. */
  readonly comprimentoMaximo: number;
  /** Comprimento da linha da primeira bola atingida (m). */
  readonly comprimentoBolaAtingida: number;
  /** Distância mínima entre pontos do caminho (m). */
  readonly passoMinimo: number;
  /** A simulação da previsão para aqui (s); o que vem antes sai igual ao da tacada real. */
  readonly duracaoMaximaS: number;
  /** Menor intervalo entre dois cálculos (ms) e quantas vezes o custo do último o intervalo cresce. */
  readonly espacoMinimoMs: number;
  readonly fatorCusto: number;
  readonly linha: {
    /** Largura da faixa no pano (m). */
    readonly largura: number;
    /** Altura acima do pano (m). */
    readonly altura: number;
    readonly corBolao: number;
    readonly corBolaAtingida: number;
    /** As duas faixas, quando o efeito passa do círculo seguro (risco de miscue). */
    readonly corRisco: number;
    readonly opacidade: number;
  };
}

export type NivelDeQualidade = 'baixa' | 'media' | 'alta';

/**
 * O que cada nível de qualidade liga. Tudo vale na hora ao trocar de nível, menos `antialias` (o contexto do
 * WebGL é criado uma vez) e `escalaTextura` (as texturas nascem no tamanho do nível de abertura): esses dois
 * valem a partir da próxima vez que a página abrir.
 */
export interface PerfilDeQualidade {
  readonly nivel: NivelDeQualidade;
  readonly rotulo: string;
  /** Teto do pixelRatio do navegador. */
  readonly pixelRatioMax: number;
  /** Teto de pixels desenhados por quadro: telas grandes em máquina fraca desenham menor e o navegador estica. */
  readonly orcamentoDePixels: number;
  readonly antialias: boolean;
  readonly sombras: boolean;
  /** Lado (px) do mapa de sombra. */
  readonly tamanhoMapaSombra: number;
  /** A luz retangular da luminária (reflexo nas bolas e no verniz); é a mais cara depois da sombra. */
  readonly luzRetangular: boolean;
  /** O reflexo de sala (RoomEnvironment pelo PMREM) e o alumínio refletindo-o. */
  readonly ambiente: boolean;
  /**
   * `fisicos`: `MeshPhysicalMaterial` (verniz, feltro com sheen). `standard`: `MeshStandardMaterial`. `leves`: standard
   * só nas bolas e no taco e `MeshLambertMaterial` (só luz difusa) no resto, que é onde estão quase todos os pixels.
   */
  readonly materiais: 'fisicos' | 'standard' | 'leves';
  /** A luz do foco (cone e queda com a distância, uma conta por pixel) vira uma direcional barata. */
  readonly focoBarato: boolean;
  /** Teto da anisotropia das texturas (o pano em ângulo rasante é o que mais pesa). */
  readonly anisotropiaMax: number;
  /** Multiplica o lado das texturas de canvas (1 = tamanho cheio). */
  readonly escalaTextura: number;
  /** Segmentos (em volta, de polo a polo) da esfera das bolas. */
  readonly segmentosEsfera: readonly [number, number];
  /**
   * O custo da linha de previsão (cada cálculo é uma tacada simulada inteira): quanto mais fraco o computador, mais espaçados
   * os cálculos e mais curta a simulação. Entram por cima de `CONFIG_WEB.previsao`.
   */
  readonly previsao: { readonly espacoMinimoMs: number; readonly fatorCusto: number; readonly duracaoMaximaS: number };
}

export interface ConfigQualidade {
  readonly perfis: Readonly<Record<NivelDeQualidade, PerfilDeQualidade>>;
  readonly auto: {
    /** O modo automático desce um nível se o FPS médio de uma janela ficar abaixo disto. */
    readonly fpsMinimo: number;
    /** Duração da janela de medida (s). */
    readonly janelaS: number;
    /** Depois de abrir ou de trocar de nível, este tempo (s) não conta: os shaders compilam e o FPS oscila. */
    readonly aquecimentoS: number;
  };
  readonly diagnostico: {
    /** De quanto em quanto tempo o painel F3 se redesenha (ms). */
    readonly atualizacaoMs: number;
    /** Janela (s) do FPS e do pior quadro mostrados. */
    readonly janelaS: number;
    /** Online: de quanto em quanto tempo o resumo vai à sala (s). */
    readonly resumoOnlineS: number;
  };
}

/**
 * As mãos que seguram o taco (L23): uma faz a ponte no pano, no caminho do taco, e a outra o segura. Medidas em m a partir do
 * taco desenhado; as contas estão em `maos/`.
 */
export interface ConfigMaos {
  /**
   * A mão do artista (`arte/personagens/exportados/mao.glb`, copiada para `public/personagens/` pelo `dev` e pelo `build`) e o arquivo
   * de contatos dela. `escala`: o tamanho dela no jogo (1 = o do arquivo, 18,2 cm da base do punho à ponta do médio): menor, porque a
   * mão cheia tapa as bolas na câmera da tacada e o V da ponte fica mais baixo que o taco a 5° de elevação.
   */
  readonly arquivos: { readonly glb: string; readonly contatos: string; readonly meta: string };
  readonly escala: number;
  readonly ponte: {
    /** Onde a mão da ponte fica, atrás do ponto onde a ponta toca o bolão, medido pelo taco. */
    readonly distancia: number;
    /** A mais perto que ela pode ficar (a ponta dos dedos não encosta no bolão) e a mais longe (o taco muito alto). */
    readonly distanciaMinima: number;
    readonly distanciaMaxima: number;
    /** Passo da busca por um lugar onde ela caiba (m). */
    readonly passo: number;
    /** Quanto a palma pode afundar no pano, na borracha ou na moldura antes de a ponte mudar de lugar (m); acima disso sobe junto. */
    readonly tolerancia: number;
    /**
     * Quanto a mão da ponte gira no pano, em torno da normal dele e com o V fixo no taco (graus): os dedos apontam para a frente e um
     * pouco para a direita de quem joga e o pulso vai para a esquerda e para trás, como o antebraço esquerdo de quem joga com a
     * direita. Na câmera de mira se vê o dorso e o lado do punho, não a boca dele.
     */
    readonly giro: number;
    /** O quanto a mão ocupa no pano em volta do eixo: para a frente, para trás e de cada lado. */
    readonly pegada: { readonly frente: number; readonly tras: number; readonly lado: number };
    /** Quão depressa o desenho alcança o lugar escolhido (1/s): ao mudar de lugar a mão desliza pelo taco, não pula. */
    readonly taxa: number;
  };
  readonly punho: {
    /** O quanto a mão rola em torno do taco (graus; 0 = o dorso para cima). */
    readonly rolo: number;
    /** Onde a mão de trás segura o taco de verdade (m da ponta, no punho de linho) e o mais perto da ponta que ela aceita. */
    readonly agarre: number;
    readonly agarreMinimo: number;
    /**
     * Onde a mão de trás fica na tela (L27b, `maos/lugar-da-mao-de-tras.ts`), cada fração sobre o que a mão ocupa na tela: no fundo,
     * cortada pela borda de baixo, com `visivelAlvo` à mostra; a pelo menos `folgaDaPonte` (fração da altura da tela) de pano livre
     * abaixo da mão da ponte; com o taco puxado, ela recua com ele e para em `visivelPuxada`. Onde a ponte está tão em baixo da tela que
     * a folga só cabe com menos de `visivelMinima` da mão à mostra, a mão fica em `visivelMinima` e a folga cede até `folgaMinima`;
     * abaixo disso (a câmera colada na ponte) a mão fica fora do quadro.
     */
    readonly visivelAlvo: number;
    readonly visivelMinima: number;
    readonly visivelPuxada: number;
    readonly folgaDaPonte: number;
    readonly folgaMinima: number;
    /** A mais perto que a mão fica da câmera (m). */
    readonly distanciaMinimaDaCamera: number;
    readonly taxa: number;
  };
  /**
   * Os dedos da ponte pousam no que há embaixo (L27): cada um dos quatro dedos longos dobra a mais (ou a menos) até `alcance` graus,
   * em partes iguais nas três juntas, sobre a pose `ponte_v` do arquivo, para a ponta tocar o pano, a borracha ou a moldura. `taxa` é
   * quão depressa a mão acompanha o apoio ao mudar de lugar (1/s). Se nem o dedo mais esticado alcança o apoio (a tabela ao lado do
   * dedo), a mão inteira sobe o que falta, até `subidaMaxima` (m).
   */
  readonly plantio: { readonly alcance: number; readonly taxa: number; readonly subidaMaxima: number };
  /**
   * Qual das pontes do artista a mão mostra (L29, `maos/ponte-por-lugar.ts`). O laço entra com a força puxada em `laco.entra` (fração
   * da barra) e só sai abaixo de `laco.sai`. A elevada pede outra bola até `elevada.alcance` m atrás da branca e a menos de
   * `elevada.lado` m do eixo do taco, com o taco subindo a `elevada.elevacaoMinimaGraus` ou mais. A colada vale quando o taco corre a
   * menos de `colada.anguloMaximoGraus` da tabela sobre a qual a mão pousa. A do canto, quando o lugar fica a menos de `canto.raio` m da
   * boca ou do círculo de queda de uma caçapa. Trocar de ponte leva `troca.duracaoS`: a mão levanta `troca.arco` m, passa para o lugar
   * novo e pousa, com os dedos misturando no ar; uma ponte nova só vale depois de `troca.permanenciaS` com a anterior (para a mão não
   * tremer onde dois lugares se encontram). `giro` ajusta o giro de `ponte.giro` por ponte (graus), se a captura pedir.
   */
  readonly escolha: {
    readonly laco: { readonly entra: number; readonly sai: number };
    readonly elevada: { readonly alcance: number; readonly lado: number; readonly elevacaoMinimaGraus: number };
    readonly colada: { readonly anguloMaximoGraus: number };
    readonly canto: { readonly raio: number };
    readonly troca: { readonly duracaoS: number; readonly arco: number; readonly permanenciaS: number };
    readonly giro: Readonly<Partial<Record<NomeDaPonte, number>>>;
  };
  /**
   * O joinha (gesto `joinha` do arquivo) na mão da ponte: entra em `entradaS` e sai em `saiS`; durante o gesto a mão sobe `subida` m do
   * pano, vai `lado` m para a esquerda de quem joga (para não tapar a branca) e gira `giro` graus em torno da normal do pano, para a
   * câmera ver o perfil: o polegar para cima e o punho fechado de lado. Tudo vai e volta com o peso do gesto.
   */
  readonly joinha: { readonly entradaS: number; readonly saiS: number; readonly subida: number; readonly lado: number; readonly giro: number };
  /**
   * A mão de trás vive (L29, `maos/punho-vivo.ts`, `maos/ociosidade.ts`). O pulso balança como um pêndulo com o recuo do taco: gira
   * `pulso.ganho` rad por m/s de velocidade (no máximo `pulso.maximo`) em torno do eixo `pulso.eixo` do osso, numa mola de frequência
   * `pulso.frequencia` (rad/s) e amortecimento `pulso.amortecimento` (1 = sem balanço). Na batida (o taco indo à bola mais rápido que
   * `aperto.velocidadeMinima` m/s) a mão aperta o taco `aperto.rad` a mais nos dedos em `aperto.subidaS`, segue o taco e relaxa em
   * `aperto.soltaS`. O gesto `respirar` (aditivo) fica ligado nas duas mãos com os pesos `respirar`. Sem tacada por `ocio.aposS`, a
   * mão de trás tamborila (`gesto_tamborilar` em ciclo, entra em `ocio.entraS` e sai em `ocio.saiS`) até a mira mexer.
   */
  readonly vida: {
    readonly pulso: { readonly eixo: readonly [number, number, number]; readonly ganho: number; readonly maximo: number; readonly frequencia: number; readonly amortecimento: number };
    readonly aperto: { readonly rad: number; readonly velocidadeMinima: number; readonly subidaS: number; readonly seguirS: number; readonly soltaS: number };
    readonly respirar: { readonly ponte: number; readonly punho: number };
    readonly ocio: { readonly aposS: number; readonly entraS: number; readonly saiS: number };
  };
  /**
   * As reações às jogadas (L29, `maos/reacoes.ts`), nas mãos de quem tem a vez (a minha e a do outro): bola numerada caiu = joinha ou
   * soco no ar (sorteados, nunca o mesmo duas vezes seguidas); falta = tapinha na moldura mais perto (a mão procura até `tapinha.alcance`
   * m); bola que passou raspando na caçapa = as duas mãos abrem (`quase`). Cada uma dura no máximo `duracaoMaximaS`, não segura a vez e
   * some quando a próxima mira começa. Quem ganhou a partida bate palmas e quem perdeu fica com a mão mole, ao lado do balão do fim:
   * `fim.escala` é o tamanho da mão (vezes o do jogo), `fim.escalaNoBalao` o da mão presa ao balão do artista (vezes a escala do corpo: a mão de 22 cm contra o corpo de 13 cm), `fim.afastamento` a que distância do balão ela fica (m, para a câmera) e
   * `fim.descida` quanto abaixo da base do balão; `palmasEntradaS` e `moleEntradaS` são o quanto leva cada gesto a entrar.
   */
  readonly reacoes: {
    readonly duracaoMaximaS: number;
    readonly socoAr: { readonly entradaS: number; readonly saiS: number; readonly subida: number; readonly lado: number; readonly giro: number };
    readonly tapinha: { readonly entradaS: number; readonly saiS: number; readonly alcance: number; readonly subida: number };
    readonly quase: { readonly entradaS: number; readonly saiS: number };
    readonly fim: { readonly palmasEntradaS: number; readonly moleEntradaS: number; readonly escala: number; readonly escalaNoBalao: number; readonly afastamento: number; readonly descida: number };
  };
  /** Folga (fração do tamanho na tela) entre a mão e a bola que ela nunca pode tapar, e o passo (m) com que a ponte recua para livrá-la. */
  readonly protecao: { readonly folga: number; readonly passo: number };
  /** Quanto leva a mão a aparecer e a sumir (s). */
  readonly presenca: { readonly entraS: number; readonly saiS: number };
  /** O giz que a mão da ponte passa na ponta do taco (L23, tecla G). */
  readonly giz: {
    /** Cada fase do gesto, com a passada na duração de referência: a mão pega o cubo na borda, leva à ponta, gira, traz de volta e volta à ponte. */
    readonly pegarS: number;
    readonly levarS: number;
    readonly trazerS: number;
    readonly voltarS: number;
    /** A duração da passada em que as fases valem como acima; numa passada mais curta tudo encolhe junto, até `escalaMinima` (fração). */
    readonly referenciaS: number;
    readonly escalaMinima: number;
    /** O menos que o giz gira na ponta, mesmo que a passada tenha acabado (s, na escala cheia). */
    readonly giroMinimoS: number;
    /** O taco recua isto do bolão enquanto o giz passa (m) e quão depressa (1/s): a ponta sai da frente da bola para a mão chegar nela. */
    readonly recuoDoTaco: number;
    readonly taxaDoTaco: number;
    /** Como a mão segura o cubo na ponta: `rolo` (rad) é o quanto ela gira em torno do eixo do taco em relação ao cubo (`MaoCalibrada.poseQuePinca`). */
    readonly pegada: { readonly rolo: number };
    /** O giro na ponta: voltas do cubo por segundo, balanço do cubo (rad, de cada lado) e raio do círculo que o centro dele faz (m). */
    readonly giro: { readonly voltasPorS: number; readonly balancoRad: number; readonly raioM: number };
    /** O cubo de giz: lado, arredondamento das quinas e cor (azul de giz). */
    readonly cubo: { readonly lado: number; readonly quina: number; readonly cor: number; readonly corDoMiolo: number };
    /** Onde o cubo fica na moldura: o alcance da busca ao longo da borda (m), o passo (m), a faixa da tela onde ele tem de aparecer e a distância mínima da câmera (m). */
    readonly borda: { readonly alcance: number; readonly passo: number; readonly margemDaTela: number; readonly distanciaMinimaDaCamera: number; readonly aparecerS: number };
    /** O pó que sai do giz na ponta: quantos por segundo (com a reserva cheia do nível), quanto dura (s), o tamanho (m, início e fim), a velocidade (m/s), a subida (m/s) e a cor. */
    readonly poeira: {
      readonly porSegundo: number;
      readonly vidaS: readonly [number, number];
      readonly tamanhoM: readonly [number, number];
      readonly velocidade: number;
      readonly subida: number;
      readonly cor: number;
    };
  };
}

/**
 * Os balões (L23): o balão de quem joga na outra tela e os de todos no fim da partida. Medidas em m, tempos em s. As contas estão
 * em `baloes/`.
 */
export interface ConfigBaloes {
  /** Quanto o rosto dura depois do acontecimento que o provocou. */
  readonly rosto: {
    readonly sorrisoS: number;
    readonly sustoS: number;
    readonly bravoS: number;
    /** Susto: a bola passou a menos que isto, fora do círculo de queda da caçapa, e não caiu (m). */
    readonly margemDoSusto: number;
    /** Susto: o quanto o choque na quina (ponta arredondada ou face) pode estar fora da conta exata, pelo erro de ler a posição da gravação (m). */
    readonly folgaDaQuina: number;
    /** Susto: a bola bateu na quina com a componente normal da velocidade acima disto (m/s); batida de leve não assusta. */
    readonly velocidadeMinimaDoSusto: number;
    /** Dois sustos mais perto que isto no tempo contam como um só. */
    readonly juntarSustosS: number;
  };
  /** O corpo do balão (m): meia altura do oval, raio no meio, raio do nó e comprimento da cordinha. */
  readonly corpo: { readonly altura: number; readonly raio: number; readonly no: number; readonly cordinha: number };
  /**
   * Onde o balão de quem joga fica em relação à mão de trás: para o lado, para cima e adiante (para a ponta do taco). Procura do
   * mais perto da mão para o mais longe, no primeiro que cabe na tela, longe da câmera e sem tapar a branca nem a bola mirada.
   */
  readonly posicao: {
    readonly lado: number;
    readonly ladoMaximo: number;
    readonly passoDoLado: number;
    readonly altura: number;
    readonly alturaMaxima: number;
    readonly passoDaAltura: number;
    readonly passoAdiante: number;
    readonly adianteMaximo: number;
    /** O ponto mais baixo do balão (a ponta da cordinha) fica pelo menos isto acima do pano (m). */
    readonly folgaDoPano: number;
    /** Mais perto que isto da câmera (m, do centro) o balão não fica. */
    readonly distanciaMinimaDaCamera: number;
    /** A faixa da tela (NDC) onde o balão inteiro tem de caber. */
    readonly margemDaTela: number;
    /** Quão depressa o desenho alcança o lugar escolhido (1/s). */
    readonly taxa: number;
  };
  /** Balanço leve: amplitude do sobe e desce (m), da inclinação (rad) e o período (s). */
  readonly balanco: { readonly alturaM: number; readonly inclinacaoRad: number; readonly periodoS: number };
  /** Quanto leva o balão a aparecer e a sumir (s); `gracaS` é quanto ele espera, onde está, quando não acha lugar, antes de sumir. */
  readonly presenca: { readonly entraS: number; readonly saiS: number; readonly gracaS: number };
  /** O fim da partida: os balões de todas as equipes em volta da mesa, um estufando e os outros murchando, antes da tela de fim. */
  readonly fim: {
    /** Do primeiro quadro até a tela de fim (s). */
    readonly duracaoS: number;
    /** Quanto leva cada balão a aparecer (s). */
    readonly entraS: number;
    /** Quanto leva o estufar e o murchar, depois de aparecerem (s). */
    readonly viraS: number;
    /** Quantas vezes o balão cheio é maior que o da vez do outro (a câmera está longe). */
    readonly tamanho: number;
    /** Quanto o círculo dos balões passa da moldura da mesa (m). */
    readonly folgaDaMesa: number;
    /** Altura do centro do balão cheio sobre o pano (m). */
    readonly altura: number;
    /** Quem ganhou: largura e altura relativas ao balão cheio, e o pulso depois de estufar (amplitude relativa, período em s). */
    readonly estufa: { readonly largura: number; readonly altura: number; readonly pulso: number; readonly pulsoS: number };
    /** Quem perdeu: largura e altura relativas, quanto pende para o lado (rad) e quanto desce (fração da altura do balão cheio). */
    readonly murcha: { readonly largura: number; readonly altura: number; readonly caida: number; readonly descida: number };
    /** A câmera do fim: elevação sobre o pano (graus) e a folga lateral dos balões na tela (fração da metade da largura). */
    readonly camera: { readonly elevacaoGraus: number; readonly margem: number };
  };
  /**
   * O balão do artista (L30, `arte/personagens/exportados/balao.glb`, copiado para `public/personagens/` pelo `dev` e pelo `build`):
   * os arquivos, quanto leva cada ação a entrar e a sair (s) e o olhar. Se o arquivo falhar, fica o balão procedural de antes.
   */
  readonly arquivo: {
    readonly glb: string;
    readonly meta: string;
    readonly acoes: Readonly<Record<AcaoDoBalao, { readonly entradaS: number; readonly saidaS: number }>>;
    readonly olhar: {
      /** Abaixo disto (m/s) nenhuma bola conta como andando; a branca é a olhada. */
      readonly velocidadeMinima: number;
      /** A bola que se segue fica enquanto andar pelo menos esta fração da mais rápida. */
      readonly histerese: number;
      /** Quão depressa o ponto olhado alcança a bola (1/s). */
      readonly taxa: number;
      /** Quão depressa o olho alcança o ponto (1/s). */
      readonly taxaDoOlho: number;
    };
  };
}

export interface ConfigWeb {
  readonly mira: ConfigMira;
  readonly tacada: ConfigTacada;
  readonly efeito: ConfigEfeito;
  readonly elevacaoDoTaco: ConfigElevacaoDoTaco;
  /** As regras do giz da mesa (desgaste e passada): hoje as padrão; a sala as escolhe a partir do L17. */
  readonly giz: RegrasGiz;
  readonly camera: ConfigCamera;
  readonly cena: ConfigCena;
  readonly maos: ConfigMaos;
  readonly baloes: ConfigBaloes;
  readonly mesa: ConfigMesa;
  readonly luz: ConfigLuz;
  readonly hud: ConfigHud;
  readonly destaque: ConfigDestaque;
  readonly transicao: ConfigTransicao;
  readonly audio: ConfigAudio;
  readonly previsao: ConfigPrevisao;
  readonly qualidade: ConfigQualidade;
}

/**
 * Os modos do "Jogar no mesmo PC": os mesmos da sala (`ModoSala`, do catálogo do protocolo). No par ou ímpar, 1×1, 2×1
 * (o Jogador 1 e o 3 contra o 2) e 2×2 (o 1 e o 3 contra o 2 e o 4); no mata-mata, 2, 3 ou 4 jogadores, cada um por si.
 */
export type ModoLocal = ModoSala;

/**
 * Quem joga no mesmo PC em cada modo, na ordem da roda das regras (o Jogador N é o lugar N-1 do modo): a equipe de cada
 * um vem de `FORMATO_DO_MODO` do protocolo, então 2×1 é A1, B1, A2 (Jogador 1 e 3 contra o 2) e no mata-mata cada um é uma
 * equipe. Cada um tem o seu perfil de configurações (`hotseat.j1` a `j4`). Só a primeira partida usa esta roda; as seguintes
 * seguem `jogadoresDaProxima`.
 */
export const jogadoresDoHotSeat = (modo: ModoLocal): readonly Jogador[] =>
  FORMATO_DO_MODO[modo].equipes.map((equipe, i) => ({ id: `j${i + 1}`, nome: `Jogador ${i + 1}`, equipe }));

/** Os dois jogadores do hot-seat 1×1, na ordem em que saem; um por equipe. */
export const JOGADORES_HOT_SEAT: readonly Jogador[] = jogadoresDoHotSeat('1x1');

export const CONFIG_WEB: ConfigWeb = {
  mira: { radianosPorPixel: 0.0025, fatorFino: 1 / 5 },
  tacada: {
    metrosPorPixel: 0.001,
    recuoInicial: 0.03,
    recuoMaximo: 0.25,
    janelaVelocidadeMs: 50,
    velocidadeEntradaMax: 4,
    expoenteForca: 1.6,
    velocidadeMin: 0.05,
    // Metade do teto da física (pedido do usuário: as bolas iam rápido demais). O teto da física segue valendo na sala.
    velocidadeMax: CONFIG_FISICA_PADRAO.velocidadeMaxTaco / 2,
    elevacaoVisual: ELEVACAO_DE_REPOUSO,
    linha: { expoente: 1.15, fracaoMinima: 0.03, marcas: [0.25, 0.5, 0.75, 1], batidaMinS: 0.07, batidaMaxS: 0.2 },
    seguimento: 0.04,
    duracaoSeguimentoS: 0.12,
    permanenciaS: 0.2,
  },
  efeito: { velocidade: 0.9, raioMaximo: 0.95 },
  elevacaoDoTaco: { minima: ELEVACAO_DE_REPOUSO, maxima: 75 * grausParaRad, folga: 0.0025, taxaSubida: 40, taxaDescida: 12 },
  giz: REGRAS_GIZ_PADRAO,
  camera: {
    campoDeVisaoGraus: 50,
    tacada: { distancia: 1, altura: 0.42, olharAdiante: 0.5, margemDoTaco: 14 * grausParaRad, elevacaoMaxima: 82 * grausParaRad },
    cima: { margem: 1.06, reservaEsquerdaPx: 320, reservaDireitaPx: 170 },
    orbital: { radiosPorPixel: 0.005, elevacaoMinGraus: 6, elevacaoMaxGraus: 88, raioInicialMin: 1.4 },
    zoomMin: 0.4,
    zoomMax: 2.5,
    passoZoom: 0.1,
    taxaSuavizacao: 9,
  },
  cena: { duracaoQuedaS: 0.18 },
  maos: {
    arquivos: { glb: '/personagens/mao.glb', contatos: '/personagens/mao-taco.json', meta: '/personagens/mao-meta.json' },
    escala: 0.85,
    ponte: {
      distancia: 0.27,
      distanciaMinima: 0.11,
      distanciaMaxima: 0.8,
      passo: 0.01,
      tolerancia: 0.003,
      giro: 45,
      pegada: { frente: 0.05, tras: 0.065, lado: 0.045 },
      taxa: 22,
    },
    punho: { rolo: 0, agarre: 1.3, agarreMinimo: 0.2, visivelAlvo: 0.4, visivelMinima: 0.12, visivelPuxada: 0.12, folgaDaPonte: 0.04, folgaMinima: 0, distanciaMinimaDaCamera: 0.2, taxa: 16 },
    plantio: { alcance: 40, taxa: 22, subidaMaxima: 0.03 },
    escolha: {
      laco: { entra: 0.6, sai: 0.5 },
      elevada: { alcance: 0.3, lado: 0.045, elevacaoMinimaGraus: 9 },
      colada: { anguloMaximoGraus: 35 },
      canto: { raio: 0.14 },
      troca: { duracaoS: 0.25, arco: 0.04, permanenciaS: 0.3 },
      giro: {},
    },
    joinha: { entradaS: 0.25, saiS: 0.3, subida: 0.08, lado: 0.12, giro: 55 },
    vida: {
      pulso: { eixo: [1, 0, 0], ganho: 0.35, maximo: 0.25, frequencia: 16, amortecimento: 0.35 },
      aperto: { rad: 0.28, velocidadeMinima: 0.6, subidaS: 0.05, seguirS: 0.18, soltaS: 0.3 },
      respirar: { ponte: 1, punho: 1 },
      ocio: { aposS: 8, entraS: 0.35, saiS: 0.25 },
    },
    reacoes: {
      duracaoMaximaS: 1.2,
      socoAr: { entradaS: 0.2, saiS: 0.3, subida: 0.14, lado: 0.12, giro: 40 },
      tapinha: { entradaS: 0.2, saiS: 0.3, alcance: 0.45, subida: 0.0 },
      quase: { entradaS: 0.12, saiS: 0.3 },
      fim: { palmasEntradaS: 0.3, moleEntradaS: 0.3, escala: 1.6, escalaNoBalao: 0.4, afastamento: 0.12, descida: 0.04 },
    },
    protecao: { folga: 0.15, passo: 0.02 },
    presenca: { entraS: 0.22, saiS: 0.16 },
    giz: {
      pegarS: 0.4,
      levarS: 0.36,
      trazerS: 0.36,
      voltarS: 0.36,
      referenciaS: 3,
      escalaMinima: 0.3,
      giroMinimoS: 0.5,
      recuoDoTaco: 0.16,
      taxaDoTaco: 9,
      pegada: { rolo: -90 * grausParaRad },
      giro: { voltasPorS: 1.6, balancoRad: 0.5, raioM: 0.004 },
      cubo: { lado: 0.0187, quina: 0.0025, cor: 0x2f78c8, corDoMiolo: 0x1c4a86 },
      borda: { alcance: 0.7, passo: 0.05, margemDaTela: 0.9, distanciaMinimaDaCamera: 0.45, aparecerS: 0.18 },
      poeira: { porSegundo: 38, vidaS: [0.6, 1.1], tamanhoM: [0.01, 0.036], velocidade: 0.11, subida: 0.07, cor: 0x6db4ff },
    },
  },
  baloes: {
    rosto: { sorrisoS: 1.4, sustoS: 1.0, bravoS: 2.2, margemDoSusto: 0.03, folgaDaQuina: 0.008, velocidadeMinimaDoSusto: 1.2, juntarSustosS: 0.8 },
    // 60% do que era (ajuste da revisão do L23: o balão de 200 × 300 px cobria a caçapa); `fim.tamanho` cresceu junto para os balões do fim seguirem iguais.
    corpo: { altura: 0.066, raio: 0.045, no: 0.0066, cordinha: 0.072 },
    posicao: { lado: 0.2, ladoMaximo: 0.7, passoDoLado: 0.1, altura: 0.1, alturaMaxima: 0.5, passoDaAltura: 0.1, passoAdiante: 0.1, adianteMaximo: 1, folgaDoPano: 0.01, distanciaMinimaDaCamera: 0.55, margemDaTela: 0.88, taxa: 6 },
    balanco: { alturaM: 0.012, inclinacaoRad: 0.05, periodoS: 2.6 },
    presenca: { entraS: 0.3, saiS: 0.25, gracaS: 0.35 },
    fim: {
      duracaoS: 2.4,
      entraS: 0.4,
      viraS: 0.9,
      tamanho: 4.34,
      folgaDaMesa: 0.3,
      altura: 0.5,
      estufa: { largura: 1.35, altura: 1.4, pulso: 0.035, pulsoS: 0.8 },
      murcha: { largura: 0.88, altura: 0.5, caida: 0.55, descida: 0.45 },
      camera: { elevacaoGraus: 30, margem: 0.2 },
    },
    arquivo: {
      glb: '/personagens/balao.glb',
      meta: '/personagens/balao-meta.json',
      acoes: {
        parado: { entradaS: 0.3, saidaS: 0.3 },
        inclinar: { entradaS: 0.35, saidaS: 0.35 },
        pulinho: { entradaS: 0.08, saidaS: 0.25 },
        susto: { entradaS: 0.05, saidaS: 0.25 },
        estufar: { entradaS: 0.15, saidaS: 0.4 },
        murchar: { entradaS: 0.15, saidaS: 0.4 },
      },
      olhar: { velocidadeMinima: 0.15, histerese: 0.6, taxa: 12, taxaDoOlho: 18 },
    },
  },
  mesa: {
    paredeDaCacapa: 0.02,
    madeira: { rugosidade: 0.55, verniz: 0.3, rugosidadeDoVerniz: 0.35, especular: 0.5 },
    folgaRebaixo: 0.003,
    chanfroTopo: 0.004,
    raioCantoMoldura: 0.03,
    segmentosPorVolta: 96,
    ladoTexturaPano: 0.15,
    espessuraPano: 0.02,
    sobraMoldura: 0.008,
    chanfroMoldura: 0.003,
    profundidadeTubo: 0.15,
    alturaDoPiso: 0.8,
    saia: { altura: 0.16, recuo: 0.006, espessura: 0.008 },
    pe: { lado: 0.13, sapata: 0.03 },
    diamante: { raio: 0.0065, espessura: 0.0015 },
    labio: { raio: 0.0022, sobra: 0.0015, afastamento: 0.0015 },
    couro: { espessura: 0.0015 },
    cores: { pano: 0x0a8a50, tabela: 0x087544, aluminio: 0xdfe3e8, perola: 0xf3efe4, piso: 0x3b2b1f, marca: 0xdfe8e0 },
  },
  luz: {
    exposicao: 1,
    intensidadeAmbiente: 0.35,
    intensidadeMetal: 1.6,
    temperaturaMetalK: 4500,
    fundo: 0x1a110b,
    intensidadeDirecional: 3.4,
    compensacaoSemAmbiente: 2.4,
    preenchimento: { temperaturaK: 3000, intensidade: 0.5, chao: 0x2a160a },
    luminaria: { altura: 0.9, largura: 1.5, profundidade: 0.32, temperaturaK: 3000, intensidade: 2.4 },
    foco: { intensidade: 6.5, penumbra: 0.7, vies: -0.0004, viesNormal: 0.004 },
  },
  transicao: {
    anelS: 1.5,
    vooS: 0.9,
    deslizeS: 0.7,
    avisoS: 4.5,
    // A sala só começa o relógio da vez 3,2 s depois da animação (`margemAnimacaoMs` dela, `apps/sala`): a transição da falta (3,1 s)
    // cabe inteira, igual para todos, sem comer o tempo de ninguém. Se a margem da sala mudar, esta muda junto.
    margemOnlineS: 3.2,
    movimento: { levantarM: 0.12, subidaDoVoo: 0.3, arcoPx: 90, acenderMs: 1500, pulsosPorSegundo: 2.5, pulsoEscala: 0.12 },
  },
  destaque: { duracaoS: 2.5, aparecerS: 0.25, sumirS: 0.7, naSaida: false, cor: 0xffd25a, opacidadeMax: 0.85, pulsosPorSegundo: 1.6, pulsoOpacidade: 0.2 },
  hud: {
    textoSegundos: 6,
    vezPerdidaSegundos: 4,
    anuncioSegundos: 5,
    gizBaixo: 0.25,
    gizAlto: 0.75,
    espirroSegundos: 2.4,
    relogioPadraoS: 30,
    relogioAlertaS: 10,
    missoes: { progressoSegundos: 3, cumpridaSegundos: 5, maximo: 3, leituraMinimaS: 10 },
  },
  audio: {
    volumeGeral: 0.7,
    maxVozes: 10,
    velocidadeMudo: 0.03,
    // Com a força pela metade o impacto mais forte da quebra passa de 4 m/s (o bolão sai a ~4,9): 3 m/s dá o volume cheio
    // aos fortes e deixa a escala para as tacadas fracas (antes, 6, e nada soava cheio).
    velocidadeCheia: 3,
    volumeMin: 0.06,
    expoenteVolume: 0.7,
    tomMin: 0.9,
    tomMax: 1.15,
    volumeCacapa: 0.7,
    amostras: { manifesto: 'sons/manifesto.json', folgaDaFaixa: 0.15, fatorTom: 0.4, variacaoDeTaxa: 0.03, atrasoMaxMs: 6, ganho: 1 },
    avisos: { sinoDepoisDoEsgotadoMs: 650 },
  },
  previsao: {
    // Desligada de fábrica: ligar é regra da partida (criar sala, "Jogar no mesmo PC"); no hot-seat o painel dev ainda muda.
    ligada: false,
    bolaAtingida: false,
    velocidadeTaco: 3,
    comprimentoMaximo: 3.5,
    comprimentoBolaAtingida: 0.15,
    passoMinimo: 0.01,
    duracaoMaximaS: 3,
    espacoMinimoMs: 40,
    fatorCusto: 6,
    linha: { largura: 0.0025, altura: 0.0012, corBolao: 0xfff0cc, corBolaAtingida: 0xffa940, corRisco: 0xff3b30, opacidade: 0.9 },
  },
  qualidade: {
    perfis: {
      alta: {
        nivel: 'alta',
        rotulo: 'Alta',
        pixelRatioMax: 2,
        orcamentoDePixels: Number.POSITIVE_INFINITY,
        antialias: true,
        sombras: true,
        tamanhoMapaSombra: 2048,
        luzRetangular: true,
        ambiente: true,
        materiais: 'fisicos',
        focoBarato: false,
        anisotropiaMax: 16,
        escalaTextura: 1,
        segmentosEsfera: [48, 32],
        previsao: { espacoMinimoMs: 40, fatorCusto: 6, duracaoMaximaS: 3 },
      },
      media: {
        nivel: 'media',
        rotulo: 'Média',
        pixelRatioMax: 1.5,
        orcamentoDePixels: 1_600_000,
        antialias: true,
        sombras: true,
        tamanhoMapaSombra: 1024,
        luzRetangular: false,
        ambiente: true,
        materiais: 'standard',
        focoBarato: false,
        anisotropiaMax: 4,
        escalaTextura: 0.75,
        segmentosEsfera: [32, 24],
        previsao: { espacoMinimoMs: 60, fatorCusto: 8, duracaoMaximaS: 3 },
      },
      baixa: {
        nivel: 'baixa',
        rotulo: 'Baixa',
        pixelRatioMax: 1,
        orcamentoDePixels: 520_000,
        antialias: false,
        sombras: false,
        tamanhoMapaSombra: 0,
        luzRetangular: false,
        ambiente: false,
        materiais: 'leves',
        focoBarato: true,
        anisotropiaMax: 1,
        escalaTextura: 0.5,
        segmentosEsfera: [20, 14],
        previsao: { espacoMinimoMs: 120, fatorCusto: 14, duracaoMaximaS: 2 },
      },
    },
    auto: { fpsMinimo: 40, janelaS: 5, aquecimentoS: 3 },
    diagnostico: { atualizacaoMs: 500, janelaS: 1, resumoOnlineS: 60 },
  },
};
