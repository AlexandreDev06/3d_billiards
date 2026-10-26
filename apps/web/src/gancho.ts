import type { ConfigFisica, EstadoMesa, EventoTacada, Gravacao, ParametrosTacada } from '@sinuca/fisica';
import type { LinhaSala, PlacarSala } from '@sinuca/protocolo';
import type { Consequencias, EstadoPartida } from '@sinuca/regras';
import type { EstatisticasDeAudio } from './audio/motor-audio';
import type { ConfigCamera, ConfigMira, ConfigTacada, NivelDeQualidade, PerfilDeQualidade } from './config';
import type { ChaveDeConfiguracao, ConfiguracoesDoJogador } from './configuracoes/modelo';
import type { ControleForca } from './controles/forca-linha';
import type { RegrasGiz } from './controles/regras-giz';
import type { FaseTacada } from './controles/tacada';
import type { ResumoDeDesempenho } from './diag/resumo';
import type { PlacarParaMostrar } from './hud/confronto-modelo';
import type { TempoDaTacadaS } from './relogio/modelo';
import type { PoseDeMao } from './maos/pose-das-maos';
import type { PreferenciaDeQualidade } from './qualidade/perfis';
import type { MotorDeRegras } from './jogo/regras';
import type { PlanoDaTransicao } from './jogo/transicao-modelo';

/** Gancho de teste para o QA dirigir o jogo sem mouse; só existe em `import.meta.env.DEV` ou com `?dev=1`. */
export interface GanchoSinuca {
  /** Mira, efeito e giz atuais; `velocidadeTaco` vem 0 (quem dá a tacada escolhe). */
  parametros(): ParametrosTacada;
  /** Aponta o taco (e põe o efeito, se vier) sem tacar: como o mouse e o W A S D, mas sem Pointer Lock. */
  mirar(angulo: number, efeito?: { readonly lateral: number; readonly vertical: number }): void;
  /** Dá a tacada como se o mouse tivesse batido; lança se já houver uma animando. */
  tacar(parametros: ParametrosTacada): void;
  /** `true` do impacto até o fim da gravação. */
  animando(): boolean;
  /** Resolve quando a animação termina e as regras já foram aplicadas (já resolvida se não houver). */
  aguardarFim(): Promise<void>;
  /** Estado da partida (vez, grupos, bolas na mesa...) como estava antes da tacada em andamento. */
  partida(): EstadoPartida;
  /** Estado das bolas na mesa, também de antes da tacada em andamento. */
  mesa(): EstadoMesa;
  /** O que a última tacada concluída causou (faltas, bolas retiradas e recolocadas, frase); `null` antes da primeira. */
  consequencias(): Consequencias | null;
  /** Velocidade de reprodução da gravação (1 = tempo real; 8 acelera os testes, 0,05 deixa captar a queda). */
  velocidadeAnimacao(fator: number): void;
  /** Troca as regras (ensaio de cenário) e começa uma partida nova com elas; `null` volta às do pacote. */
  usarRegras(motor: MotorDeRegras | null): void;
  /** Gravação da última tacada (eventos, duração, quadros); `null` antes da primeira. */
  ultimaGravacao(): Gravacao | null;
  /**
   * Contadores do áudio (eventos, avisos, sons tocados, recusados, pico de vozes, quantas vezes cada variação tocou) desde o
   * início ou desde `zerarAudio`; `amostras` diz como vai o carregamento dos arquivos (`ocioso` até o primeiro gesto).
   */
  audio(): EstatisticasDeAudio & {
    readonly pronto: boolean;
    readonly amostras: { readonly estado: 'ocioso' | 'carregando' | 'pronto' | 'falhou'; readonly prontas: number; readonly falhas: number };
  };
  zerarAudio(): void;
  /** Toca um aviso de interface como se a vez tivesse passado (passa pelo mudo e pelo volume): para conferir os três sons. */
  tocarAviso(som: 'vez-outro' | 'vez-sua' | 'tempo-esgotado'): void;
  /**
   * O controle de força: o que vale agora (`efetivo`), a escolha deste aparelho (`local`: `?forca=` e o interruptor do painel dev),
   * o que a sala mandou (`sala`, `null` enquanto ninguém manda: a regra entra por `regrasDaMesa`), e a mira em curso (fase, quanto da
   * barra está puxado, o recuo do taco, se o taco corre até a bola depois de soltar) com o que a barra do HUD mostra.
   */
  forca(): {
    readonly efetivo: ControleForca;
    readonly local: ControleForca;
    readonly sala: ControleForca | null;
    readonly fase: FaseTacada;
    readonly fracao: number;
    readonly recuo: number;
    readonly naBatida: boolean;
    readonly barra: { readonly visivel: boolean; readonly percentual: number; readonly cancela: boolean; readonly dica: string };
  };
  /** Escolhe o controle de força deste aparelho, como `?forca=` e o painel dev. */
  definirControleDeForca(controle: ControleForca): void;
  /**
   * O ponto único das regras de mesa que a sala escolhe (L17): o controle de força (`null` volta ao local) e as regras do giz.
   * O que não vier fica como estava.
   */
  regrasDaMesa(regras: { readonly forca?: ControleForca | null; readonly giz?: RegrasGiz }): void;
  /** O giz de quem tem a vez (no online, o meu): nível de 0 a 1, se está passando, as regras que valem e o nível de cada jogador. */
  giz(): { readonly nivel: number; readonly passando: boolean; readonly regras: RegrasGiz; readonly niveis: readonly number[] };
  /** Aperta G uma vez, como o teclado: começa uma passada se dá (vez de quem pode jogar, giz não cheio, sem tacada armada). */
  passarGiz(): boolean;
  /** Gasta o giz de quem tem a vez como uma tacada gasta (para as capturas: cheio, a G não passa nada). Devolve o nível de agora. */
  gastarGiz(): number;
  /**
   * A elevação visual do taco: a desenhada agora (`atual`) e a mínima que o põe por cima da tabela, da moldura e das outras
   * bolas (`alvo`), com os limites e quantas vezes a conta rodou. É só desenho: os parâmetros da tacada seguem com `elevacao: 0`.
   */
  elevacaoDoTaco(): { readonly atual: number; readonly alvo: number; readonly minima: number; readonly maxima: number; readonly calculos: number };
  /**
   * A skin do taco desenhado (o id do catálogo; `undefined` só lê). Com um id fixa a skin, para capturas (id que o web não desenha
   * cai na clássica); `null` solta e volta à da sala (a de quem segura o taco) ou à clássica no mesmo PC.
   */
  skinDoTaco(id?: string | null): string;
  /**
   * O giz que a ponta do taco mostra, de 0 (couro) a 1 (azul cheio): com um número (ou `null` para voltar ao do jogador) fixa o
   * valor, para capturas; devolve o que a ponta mostra.
   */
  gizDoTaco(nivel?: number | null): number;
  /**
   * A câmera de tacada: onde está, a pose que ela pede (antes do amortecimento), o zoom, o ângulo dela sobre o pano, a menor
   * distância dela ao taco (m) e se subiu por causa do taco.
   */
  camera(): {
    readonly posicao: readonly [number, number, number];
    readonly alvo: readonly [number, number, number];
    readonly zoom: number;
    readonly elevacao: number;
    readonly folga: number;
    readonly subiu: boolean;
  };
  /**
   * As mãos que seguram o taco (L23): a escala de agora (0 = sumidas, 1 = inteiras), a cor, a ponte (se aparece, o que a sustenta, a
   * distância pelo taco do contato a ela e a pose) e a mão de trás (se aparece, onde segura, a m da ponta, e a pose).
   */
  maos(): {
    readonly escala: number;
    readonly cor: number;
    readonly ponte: { readonly visivel: boolean; readonly apoio: string; readonly distancia: number; readonly pose: Readonly<PoseDeMao> };
    readonly punho: { readonly visivel: boolean; readonly agarre: number; readonly pose: Readonly<PoseDeMao> };
    /**
     * L28: a mão do artista em cena: se o arquivo chegou (`pronta`), quantos ms levou a carga (`cargaMs`, nulo enquanto não chegou
     * ou se falhou), onde cada mão está desenhada e o gesto em curso (o joinha).
     */
    readonly desenho: {
      readonly pronta: boolean;
      readonly cargaMs: number | null;
      readonly ponte: { readonly visivel: boolean; readonly x: number; readonly y: number; readonly z: number; readonly escala: number; readonly malhas: number } | null;
      readonly punho: { readonly visivel: boolean; readonly x: number; readonly y: number; readonly z: number; readonly escala: number; readonly malhas: number } | null;
      readonly gesto: string | null;
      readonly pesoDoGesto: number;
      readonly tempoDoGesto: number;
    };
    /** Faz o joinha na mão da ponte (como quando uma bola cai); falso se o arquivo da mão ainda não chegou. */
    joinha(): boolean;
  };
  /**
   * L23, o balão de quem joga na outra tela: se está à vista, de quem é (nome e equipe), a cara de agora, onde está (mundo e
   * tela), se a conta achou lugar para ele e de que lado da tela ficou, e os emojis que sobem dele.
   */
  balao(): {
    readonly visivel: boolean;
    readonly escala: number;
    readonly dono: string | null;
    /** O `id` do jogador dono do balão (no online, `lugar-N`). */
    readonly donoId: string | null;
    readonly equipe: number | null;
    readonly cara: string;
    readonly posicao: { readonly x: number; readonly y: number; readonly z: number };
    readonly lugarOk: boolean;
    readonly lado: number;
    readonly emojis: readonly { readonly emoji: string; readonly x: number; readonly y: number; readonly opacidade: number }[];
    /** Os momentos de rosto lidos da última gravação que tocou: instante, cara e duração. */
    readonly momentos: readonly { readonly t: number; readonly rosto: string; readonly duracao: number }[];
    /** (L30) O balão do artista chegou (e não os procedurais de reserva), a ação do corpo dele, a bola que os olhos seguem e quanto levou a carga. */
    readonly comArquivo: boolean;
    readonly acao: string | null;
    readonly bolaOlhada: number | null;
    readonly tempoDeCargaMs: number | null;
  };
  /**
   * L23, o giz passado na ponta (G): a fase do gesto (parado, pegar, levar, girar, trazer, voltar) e quanto dela passou, se o cubo
   * está na mão, quanto o taco recuou (0 a 1), onde está o cubo na moldura (e se aparece), as partículas de pó (vivas e
   * desenhadas) e a pose da mão da ponte de agora.
   */
  gizAnimado(): {
    readonly fase: string;
    readonly progresso: number;
    readonly cuboNaMao: boolean;
    readonly afasta: number;
    readonly giro: number;
    readonly cubo: { readonly tem: boolean; readonly visivel: boolean; readonly escala: number; readonly x: number; readonly y: number; readonly z: number };
    readonly poeira: { readonly capacidade: number; readonly vivas: number; readonly desenhadas: number };
    readonly mao: Readonly<PoseDeMao>;
  };
  /**
   * L23, o fim da partida: se o roteiro existe (os balões estão em cena, também depois dele, atrás da tela de fim) e se ainda
   * toca, o tempo dele e, por equipe, a cara e o tamanho do balão.
   */
  fim(): {
    readonly existe: boolean;
    readonly tocando: boolean;
    readonly tempoS: number;
    readonly duracaoS: number;
    readonly camera: string;
    readonly baloes: readonly {
      readonly equipe: number;
      readonly ganhou: boolean;
      readonly visivel: boolean;
      readonly cara: string;
      readonly largura: number;
      readonly altura: number;
      readonly caida: number;
      readonly cor: number;
    }[];
  };
  /** L23: acaba o roteiro do fim já (o mesmo que um clique ou uma tecla). */
  pularFim(): void;
  /** L23: para o relógio do roteiro do fim em `segundos` (capturas); `null` solta. */
  fixarTempoDoFim(segundos: number | null): void;
  /** L23: pinta o balão (e as mãos) com a cor desta equipe (0 a 3) em vez da do jogador, para capturas das quatro cores; `null` solta. */
  forcarEquipeDoBalao(equipe: number | null): void;
  /** L23: faz o balão mostrar esta cara em vez da que a tacada provoca (`null` solta), para capturas. */
  forcarCaraDoBalao(cara: 'neutro' | 'sorriso' | 'susto' | 'bravo' | 'triste' | null): void;
  /** Liga ou desliga a elevação que desvia o taco do que ele atravessaria (desligada, o taco fica sempre a 5°): para comparar antes e depois. */
  elevacaoLivre(ligada: boolean): void;
  /** O alerta de espirro (miscue) como está na tela: "Espirrou! Faltou giz" ou "Espirrou! Efeito demais". */
  espirro(): { readonly visivel: boolean; readonly texto: string };
  /** O aviso discreto (embaixo no meio) como está na tela: "Ana pula a vez (falta)" quando a roda pula quem perdia a próxima vez. */
  avisoDiscreto(): { readonly visivel: boolean; readonly texto: string };
  /** Config de física que a próxima tacada vai usar (a padrão, ou a do painel dev). */
  configFisica(): ConfigFisica;
  /** Curva de força que a próxima tacada do mouse vai usar (a padrão, ou a do painel dev). */
  configTacada(): ConfigTacada;
  /**
   * Simula a tacada sem tacar (a simulação da linha de previsão, sem o espaçador, sem miscue, sem mexer em nada) e devolve
   * só os eventos: para um teste achar uma tacada que faça o que ele quer (encaçapar a 8, por exemplo).
   */
  preverEventos(parametros: ParametrosTacada): readonly EventoTacada[];
  /**
   * A linha de previsão: o último cálculo (quantos já rodaram, quanto custou, o caminho do bolão em pontos (x, z), a bola
   * atingida, a gravação prevista); `visivel` diz se a linha está na cena.
   */
  previsao(): {
    readonly visivel: boolean;
    readonly calculos: number;
    readonly custoMs: number;
    readonly erro: string | null;
    readonly fim: string;
    readonly comprimento: number;
    readonly pontos: readonly (readonly [number, number])[];
    readonly atingida: { readonly id: number; readonly x: number; readonly z: number; readonly dx: number; readonly dz: number; readonly comprimento: number };
    readonly gravacao: Gravacao | null;
  };
  /**
   * A linha de previsão como regra da partida: o que vale agora (`efetiva`), a escolha do hot-seat (`local`, que a tela
   * inicial, `?linha=`, a tecla L e o painel mudam), o que a sala manda (`sala`, `null` no hot-seat ou sem estado ainda) e se
   * L e o painel podem mudá-la (`editavel`: só no hot-seat; online ela é da sala).
   */
  linha(): {
    readonly efetiva: { readonly previsao: boolean; readonly bolaAtingida: boolean };
    readonly local: { readonly previsao: boolean; readonly bolaAtingida: boolean };
    readonly sala: LinhaSala | null;
    readonly online: boolean;
    readonly editavel: boolean;
    readonly visivel: boolean;
  };
  /**
   * Câmera livre para capturas: posição e alvo em metros; `null` devolve a câmera ao jogo. Com `maos: true` as mãos seguem em cena
   * (L27) e ficam onde a câmera do jogo as poria: só o desenho vem da câmera livre.
   */
  vista(pose: { readonly posicao: readonly [number, number, number]; readonly alvo: readonly [number, number, number] } | null, opcoes?: { readonly maos?: boolean }): void;
  /** Onde a bola está na cena agora (inclusive durante a queda: `escala` encolhe e `y` afunda). */
  posicaoBola(id: number): { readonly x: number; readonly y: number; readonly z: number; readonly escala: number; readonly visivel: boolean };
  /** Estado do cliente online (sala, lugar, vez, conexão, mira do outro, chat); `null` fora de uma sala. */
  online(): {
    readonly codigo: string | null;
    readonly lugar: number | null;
    readonly anfitriao: boolean;
    readonly conexao: string;
    readonly minhaVez: boolean;
    readonly aguardandoSala: boolean;
    readonly seqNaMesa: number;
    readonly estadoSala: unknown;
    readonly miraRemota: { readonly angulo: number; readonly lateral: number; readonly vertical: number; readonly recuo: number };
    readonly mirasRecebidas: number;
    /** O Web Lock que impede o Chrome de congelar a aba está de pé. */
    readonly abaViva: boolean;
    readonly chat: readonly string[];
  } | null;
  /**
   * Os emojis que estão no alto da tela agora, do mais velho ao mais novo: nome, emoji e lugar (`null` = espectador), com a
   * equipe de que vem a cor do nome (`null` = cinza). Vazio fora de uma sala.
   */
  emojis(): readonly { readonly nome: string; readonly emoji: string; readonly lugar: number | null; readonly equipe: number | null }[];
  /** Solta o emoji de número 1 a 8 como a tecla faria (balde e conexão valem); falso se não mandou. */
  mandarEmoji(numero: number): boolean;
  /** Os oito emojis que as teclas 1 a 8 mandam neste aparelho (a escolha guardada em `sinuca.emojis`, ou os padrões). */
  emojisEscolhidos(): readonly string[];
  /** Escolhe `emoji` para a tecla `slot` (1 a 8), como a tela de escolha: quem já estava noutro slot troca de lugar. Falso se nada mudou (slot fora de 1 a 8, emoji fora do catálogo da sala, ou já era esse). */
  escolherEmoji(slot: number, emoji: string): boolean;
  /** Simula a queda da rede: o socket cai e o cliente reconecta sozinho. */
  derrubarConexao(): void;
  /** Qualidade gráfica: o nível de agora e de abertura, a escolha, o renderizador e o perfil que está valendo. */
  qualidade(): {
    readonly nivel: NivelDeQualidade;
    readonly nivelDeAbertura: NivelDeQualidade;
    readonly preferencia: PreferenciaDeQualidade;
    readonly rebaixada: NivelDeQualidade | null;
    readonly software: boolean;
    readonly renderizador: string | null;
    readonly razaoDePixels: number;
    readonly perfil: PerfilDeQualidade;
  };
  /** Escolhe a qualidade como na tela de configurações (grava, salvo com `?qualidade=` na URL). */
  definirQualidade(preferencia: PreferenciaDeQualidade): void;
  /** Experimento: aplica um perfil com alguns campos trocados, sem mexer na escolha nem na queda automática. */
  aplicarPerfil(parcial: Partial<PerfilDeQualidade>): void;
  /** O que o painel F3 mostra, mais os totais do renderizador e o último resumo que iria à sala. */
  diagnostico(): {
    readonly fps: number;
    readonly piorQuadroMs: number;
    readonly chamadas: number;
    readonly triangulos: number;
    readonly geometrias: number;
    readonly texturas: number;
    readonly programas: number;
    readonly memoriaMb: number | null;
    readonly painelAberto: boolean;
    readonly ultimoResumo: ResumoDeDesempenho | null;
  };
  /** As configurações do jogador em uso: de quem são e os valores (multiplicadores do padrão). */
  configuracoes(): {
    readonly perfil: { readonly chave: string; readonly rotulo: string } | null;
    readonly valores: ConfiguracoesDoJogador;
    readonly painelAberto: boolean;
    /** O que a mira, a tacada e a câmera estão usando de fato (fábrica × painel dev × jogador). */
    readonly aplicadas: { readonly mira: ConfigMira; readonly tacada: ConfigTacada; readonly camera: ConfigCamera };
  };
  definirConfiguracao(chave: ChaveDeConfiguracao, valor: number): void;
  /** O aviso grande da bola final como está na tela. */
  anuncio(): { readonly visivel: boolean; readonly titulo: string; readonly detalhe: string };
  /**
   * O placar da sala (online) ou do mesmo PC (hot-seat): o texto da pílula do HUD e o da tela de fim ("" = escondidos), o que a
   * tela decidiu mostrar (confronto de agora, histórico, se é novo), o que o hot-seat contou e o que a sala mandou (`null` fora
   * da sala), e a classificação do fim do mata-mata.
   */
  placar(): {
    readonly hud: string;
    readonly fim: string;
    /** A classificação da tela de fim ("1º Ana 8 · 2º Beto 5"); "" fora do mata-mata ou com a tela escondida. */
    readonly classificacao: string;
    /** O dinheiro da tela de fim ("Ana +20 (120 moedas) · Beto −20 (80 moedas)", ou a frase da aposta anulada); "" sem aposta paga ou com a tela escondida. */
    readonly aposta: string;
    readonly mostrado: PlacarParaMostrar;
    readonly local: PlacarSala;
    readonly sala: PlacarSala | null;
  };
  /** Zera o placar do mesmo PC, como o botão "Zerar placar". */
  zerarPlacarLocal(): void;
  /**
   * A carteira deste navegador (L24), sem o código secreto, que nunca sai do módulo da carteira: se está guardada no
   * aparelho, o saldo e as skins que o servidor deu (`null` antes de ler), o recado pendente e a loja (aberta, o que mostra).
   */
  carteira(): {
    readonly guardada: boolean;
    readonly saldo: number | null;
    readonly skins: readonly string[];
    readonly skin: string | null;
    readonly aviso: string | null;
    readonly loja: { readonly aberta: boolean; readonly texto: string };
  };
  /** Abre ou fecha a loja de tacos, como o botão "Loja". */
  abrirLoja(aberta: boolean): void;
  /** A aposta e os saldos da sala como o cliente os sabe: `null` fora da sala. */
  apostaDaSala(): {
    readonly aposta: number;
    readonly saldos: readonly (number | null)[];
    readonly skins: readonly string[];
    /** A `aposta-paga` da última partida, como a sala mandou (sem código nenhum), ou `null`. */
    readonly paga: unknown;
  } | null;
  /** A transição da falta: ativa agora, o plano da última tacada (fases, aviso, duração) e o aviso grande na tela. */
  transicao(): {
    readonly ativa: boolean;
    readonly plano: PlanoDaTransicao | null;
    readonly aviso: { readonly visivel: boolean; readonly titulo: string; readonly detalhes: readonly string[]; readonly falta: boolean };
  };
  /** Pula a transição da falta, como um clique. */
  pularTransicao(): void;
  /** Fator do tempo da transição (1 = normal, 0,25 = quatro vezes mais devagar): para capturas. */
  velocidadeTransicao(fator: number): void;
  /** O destaque das bolas que valem (começo da vez / tecla B): em curso, opacidade de 0 a 1, as bolas e quantos anéis estão na cena. */
  destaque(): { readonly visivel: boolean; readonly intensidade: number; readonly bolas: readonly number[]; readonly aneisNaCena: number };
  /** O que a mira diz da primeira bola na reta: `tipo` (nenhum/certa/errada), a bola, a frase, se o taco está vermelho e o aviso na tela. */
  sinalDaMira(): {
    readonly tipo: 'nenhum' | 'certa' | 'errada';
    readonly bola: number | null;
    readonly texto: string;
    readonly tacoVermelho: boolean;
    readonly aviso: { readonly visivel: boolean; readonly texto: string };
  };
  /** O contador da vez como está na tela e o relógio do hot-seat (`tempoS` null = sem limite; `restanteMs` null = sem contador). */
  relogio(): {
    readonly contador: { readonly visivel: boolean; readonly texto: string; readonly urgente: boolean };
    readonly local: { readonly tempoS: number | null; readonly restanteMs: number | null };
    /** Online: o que a sala mandou (`relogio` e `prazoMs` do último `estado-sala`) e o que o cliente calcula agora. */
    readonly sala: { readonly tempoS: number | null; readonly prazoMs: number | null; readonly restanteMs: number | null } | null;
  };
  /** Muda o tempo por tacada do hot-seat (null = sem limite) e recomeça o contador: as capturas não podem perder a vez sozinhas. */
  definirTempoLocal(tempoS: TempoDaTacadaS): void;
  /** O desenho de cada bola na mesa (por `IdBola`; `null` no bolão): lisa ou listrada, como a casa da partida manda. */
  estiloDasBolas(): readonly (string | null)[];
  /** Só visual: redesenha as bolas como outra casa as desenharia (a próxima atualização da partida volta à casa dela). */
  desenharCasa(casa: { readonly bolas: '1-15' | '2-15' | '2-14'; readonly bolaFinal: 1 | 8 | 'ultima-do-grupo' }): void;
  /** Põe uma bola da cena num lugar (só visual: a física e as regras não sabem); `escala` < 1 imita a queda. */
  colocarBola(id: number, x: number, y: number, z: number, escala?: number): void;
}

declare global {
  interface Window {
    __sinuca?: GanchoSinuca;
  }
}

export function instalarGancho(gancho: GanchoSinuca): () => void {
  window.__sinuca = gancho;
  return () => {
    if (window.__sinuca === gancho) delete window.__sinuca;
  };
}
