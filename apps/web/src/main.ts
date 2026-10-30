import * as THREE from 'three';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, TACO, criarRng, medidasDaBola, simularTacada, type ConfigFisica, type Gravacao, type ParametrosTacada, type Ponto2 } from '@sinuca/fisica';
import { CHAVES_DA_FISICA_DA_SALA, SKIN_PADRAO, ehSemente, ehSkinDeTaco, type MissoesDoDia, type PlacarSala, type SkinTaco } from '@sinuca/protocolo';
import { PRESETS_DE_FABRICA, PRESET_BOTECO, PRESET_TREINO, bolasDaCasa, sincronizarMesa, type ConfigRegras, type Consequencias, type EstadoPartida, type Jogador } from '@sinuca/regras';
import { armazenamentoDaAba, armazenamentoLocal } from './armazenamento';
import { abrirSessaoReal } from './audio/contexto';
import { MotorDeAudio } from './audio/motor-audio';
import { criarSonsDoJogo, dependenciasDoNavegador } from './audio/pacote';
import { jogadorEhDoLugar, somDoTempoEsgotado, somsDaTroca, type MotivoDaTroca } from './audio/som-da-vez';
import { AneisDeBolas } from './cena/aneis-de-bolas';
import { fichaDaBola, type FichaDaBola } from './cena/bola-estilo';
import { criarBolas } from './cena/bola';
import { DestaqueDaVez } from './cena/destaque-modelo';
import { criarLinhaDePrevisao } from './cena/linha-previsao';
import { descartar } from './cena/descartar';
import { criarAmbiente } from './cena/ambiente';
import { BotecoEmCena } from './cena/boteco';
import { AplicadorDeQualidade } from './cena/aplicador-qualidade';
import { VariantesDeMateriais } from './cena/variantes-materiais';
import { criarMesa, semiMesa } from './cena/mesa';
import { quadroVazio } from '@sinuca/personagens';
import { carregarAcessorios, carregarPersonagemDeRosto, type BaseDoRosto } from '@sinuca/personagens/three';
import { projetarParaTela } from './cena/projecao';
import { pontoNaMesa } from './cena/ponto-na-mesa';
import { sincronizarBolas } from './cena/sincronizar';
import { TransicaoDaTacada } from './cena/transicao';
import { COR_DA_EQUIPE, corDaEquipe } from './cena/cores-da-equipe';
import { CarregadorDeChapeus } from './cena/chapeus';
import { criarPreviaDoBalao } from './cena/previa-do-balao';
import { aparenciaDaEquipe, aparenciaDoLugar, lugarDoJogador, precisaDeChapeus } from './online/balao-na-mesa';
import { APARENCIA_PADRAO, type AparenciaDoBalao } from '@sinuca/protocolo';
import { MaosEmCena } from './cena/maos';
import { MaosDoFim } from './cena/maos-do-fim';
import { criarAtlasDeCaras } from './cena/atlas-de-caras';
import { estadoVazioDoBalao } from './cena/balao';
import { BaloesDaCena } from './cena/baloes';
import { PosicionadorDoBalao, bocasDaMesa, lugarVazioDoBalao } from './baloes/lugar-do-balao';
import { ProvocacaoDoBalao } from './baloes/provocacao';
import { RostoDoBalao, momentosDaGravacao, type CaraDoBalao, type MomentoDoRosto, type QuemTacou } from './baloes/rosto';
import { SubidasDeEmojis } from './baloes/subida-de-emojis';
import { SeguidorDoOlhar } from './baloes/seguidor-do-olhar';
import { CacapasDaGravacao, INTERESSE, interessesDoBalao, type SituacaoDoOlhar } from './baloes/atencao-do-balao';
import { FimDaPartida, lugaresDoFim, quadroDoFim, quadroVazioDoFim, type LugarDoFim } from './baloes/fim-da-partida';
import { criarCamadaDeEmojisDoBalao } from './hud/emoji-do-balao';
import { ProjetorDaCamera } from './cena/projetor-da-camera';
import { definirTempoDoTaco } from './cena/animacao-do-taco';
import { bolasDoTaco, criarTaco, definirDetalheDoTaco, definirGizDoTaco, definirHaloDoTaco, definirSegmentosDoTaco, definirSkinDoTaco, gizDoTaco, marcarTacoErrado, posicionarTaco, sementeDoTaco, skinDoTaco } from './cena/taco';
import { CONFIG_WEB, JOGADORES_HOT_SEAT, jogadoresDoHotSeat } from './config';
import { EmojisEscolhidos } from './configuracoes/emojis-escolhidos';
import { GerenteDeConfiguracoes } from './configuracoes/gerente';
import { cameraDoJogador, miraDoJogador, tacadaDoJogador } from './configuracoes/modelo';
import { perfilAtivo } from './configuracoes/perfil-ativo';
import { AnimacaoTaco } from './controles/animacao-taco';
import { CameraRig } from './controles/camera';
import { poseDoMenu, poseDoMenuVazia } from './controles/camera-do-menu';
import { poseDaCameraDoFim, poseVaziaDoFim } from './controles/camera-do-fim';
import { ouvirPuloDoFim } from './controles/pulo-do-fim';
import { PontoDeContato, limiteSeguro } from './controles/efeito';
import { ElevacaoDoTaco, obstaculosDaMesa } from './controles/elevacao-do-taco';
import { primeiraBolaNaLinha } from './controles/primeira-bola';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos/maos-do-jogador';
import { MOMENTO_DO_ROSTO, type MomentoDaJogada } from './maos/reacoes';
import { AnimacaoDoGiz, poseDoCubo } from './maos/giz-animado';
import { GizNaMao } from './maos/giz-na-mao';
import { CuboNaBorda } from './maos/lugar-do-giz';
import { PoeiraDeGiz } from './maos/poeira-de-giz';
import { poseVaziaDeMao } from './maos/pose-das-maos';
import { GizDaCena } from './cena/giz-cubo';
import { ehEspirro, textoDoEspirro } from './controles/espirro';
import { teclaEmCampoDeTexto } from './controles/campo';
import { ligarEntrada } from './controles/entrada';
import { CONTROLE_DE_FORCA_PADRAO, controleDaUrl, controleEfetivo, type ControleForca } from './controles/forca-linha';
import { GizDosJogadores } from './controles/giz-jogadores';
import { sanearRegrasGiz, type RegrasGiz } from './controles/regras-giz';
import { Mira } from './controles/mira';
import { ligarTeclaSegurada } from './controles/tecla-segurada';
import { SEM_SINAL, VigiaDaMira } from './controles/sinal-da-mira';
import { Tacada } from './controles/tacada';
import { criarPainelDiagnostico } from './diag/painel';
import { EstatisticasDeQuadros } from './diag/quadros';
import { EmissorDeDiagnostico, memoriaDoJsMb, mensagemDeDiagnostico, type ResumoDeDesempenho } from './diag/resumo';
import { devAtivo } from './dev/ativo';
import { criarPainelDev, type PainelDev } from './dev/painel';
import { EstadoDoPainel, avisoDosSalvos, controleDoPainel, esquecerValores, fisicaDoPainel, lerValoresSalvos, salvarValores, tacadaDoPainel, valoresPadrao } from './dev/parametros';
import { criarAnuncios } from './anuncios/anuncios';
import { criarFaixa } from './anuncios/faixa';
import { instalarGancho } from './gancho';
import { AnunciadorDoCastigo } from './hud/anuncio-modelo';
import { criarPainelDeConfiguracoes } from './hud/configuracoes';
import { criarPainelDeCreditos } from './hud/creditos';
import { lerCreditos } from './hud/creditos-modelo';
import { criarLoja } from './hud/loja';
import { criarMeuBalao } from './hud/meu-balao';
import { criarPerfil } from './hud/perfil';
import { criarPerguntaDeCarteira } from './hud/pergunta-de-carteira';
import creditosMd from '../../../docs/creditos.md?raw';
import { criarHud } from './hud/hud';
import { hudDoTreino } from './hud/treino-modelo';
import { classificacaoDaPartida } from './hud/classificacao-modelo';
import { criarMenu } from './hud/menu';
import { SEM_PLACAR, formacaoDaPartida, placarDaTela, placarParaMostrar, type PlacarParaMostrar } from './hud/confronto-modelo';
import { modeloDoPlacar, type Presenca } from './hud/placar-modelo';
import { criarTelaSemWebgl } from './hud/sem-webgl';
import { abrirRendererOuAvisar } from './hud/sem-webgl-modelo';
import { Jogo, jogadoresDaNovaPartida } from './jogo/jogo';
import { encurtarPlano, planoDaTransicao, type PlanoDaTransicao } from './jogo/transicao-modelo';
import { decidirJogarLocal, disponibilidadeDosModos } from './jogo/modos';
import { PlacarLocal } from './jogo/placar-local';
import { CATALOGO, presetDaModalidade } from './lobby/catalogo';
import { lembrarRegras, lerRegrasLembradas, regrasPadrao, type MudancaDeRegras, type OndeSeLembra, type RegrasDaSala } from './lobby/regras-da-sala';
import { REGRAS_DO_PACOTE, type MotorDeRegras } from './jogo/regras';
import { avisoDoPulo, vezPerdida } from './jogo/vez-perdida';
import { ArmazemDeSessao, idDaAba } from './online/armazem';
import { avisoDeFisicaAlterada, configDeFisica, modoDoPainelDeFisica } from './online/fisica-da-sala-modelo';
import { apostaNaTela, type ApostaNaTela } from './online/aposta-modelo';
import { CarteiraDoAparelho, pedirPeloNavegador } from './online/carteira';
import { ContaDoAparelho, pedirContaPeloNavegador } from './online/conta';
import { AVISO_LINK_COM_CONTA, MENSAGEM_VOCE_SAIU } from './online/mensagens-da-conta';
import { criarDialogosDaConta } from './hud/conta-dialogos';
import { mudarParaOEnderecoNovo } from './online/endereco-do-jogo';
import { AVISO_LINK_EM_SALA, baseDoLink, lerFragmentoDaCarteira, receberCarteiraDoLink } from './online/levar-carteira';
import { avisosDeMissao, missoesNaAjuda, missoesNaTela, type AvisoDeMissao } from './online/missoes-modelo';
import type { PedidoDeEntrada } from './online/cliente-sala';
import { codigoDaUrl, comSalaNaUrl, linkDoConvite, semSalaNaUrl, urlDoSocket } from './online/convite';
import { manterViva, type AbaViva } from './online/manter-viva';
import type { TacadaParaAnimar } from './online/partida-online';
import { avisoDeTempoEsgotado, faixaDeVez, modeloDaSala, type FaixaDeVez } from './online/sala-modelo';
import { SessaoOnline } from './online/sessao';
import { bolasDoLugar, lugarDoTaco, sementeDoLugar, skinDoLugar } from './online/skin-na-mesa';
import { criarSocketReal } from './online/socket-real';
import { PlayerGravacao } from './player/player';
import { PrevisaoDeTacada, type EntradaDaPrevisao } from './previsao/previsao';
import { LINHA_DESLIGADA, configDaPrevisao, linhaDaUrl, linhaDe, linhaEditavel, linhaEfetiva, linhaParaSala, type LinhaDaPartida } from './previsao/regra-da-linha';
import { ControladorDeQualidade, type MotivoDaMudanca } from './qualidade/controlador';
import { comRenderizadorDaUrl, detectarGpu } from './qualidade/gpu';
import { detalheDoTacoNoNivel, haloDoTacoNoNivel, ladosDosPersonagens, particulasDoGiz, pedeRecarregar, perfilDoNivel, segmentosDoTaco, detalheDasMaos, type NivelDeQualidade } from './qualidade/perfis';
import { gravarQualidade, lerQualidade, qualidadeDaUrl } from './qualidade/preferencia';
import { RelogioLocal } from './relogio/modelo';
import { ligarArraste } from './treino/arraste';
import { CENARIOS_DE_TREINO, cenarioDeTreino, mesaDoCenario, type CenarioDeTreino } from './treino/cenarios';
import { EditorDaMesa } from './treino/editor-da-mesa';
import { numeradasNaMesa } from './treino/mesa-de-treino';
import { SessaoDeTreino } from './treino/sessao-de-treino';
import { acaoDaTecla } from './treino/teclas';
import './estilo.css';
import './estilo-menu.css';

const MAX_DT = 0.1;

/** `?semente=N` repete a mesma partida (arrumação e miscue); sem ela, uma nova a cada carga. */
function sementeInicial(): number {
  const pedida = Number(new URLSearchParams(window.location.search).get('semente'));
  return Number.isInteger(pedida) && pedida > 0 ? pedida : Date.now() % 2 ** 31;
}

type Modo = 'menu' | 'local' | 'online';

/** Quem treina: um jogador só, na equipe 0. */
const JOGADOR_DO_TREINO: Jogador = { id: 'j1', nome: 'Treino', equipe: 0 };

/** `?semente=N` (repetir uma partida) e `?local=1` vão direto ao hot-seat, sem a tela inicial. */
function pularMenu(busca: string): boolean {
  const parametros = new URLSearchParams(busca);
  return parametros.has('semente') || parametros.has('local');
}

/** Tira `#carteira=...` do endereço (L43): o código da carteira não fica na barra de endereço nem no histórico. Deixa o resto do fragmento. */
function limparEnderecoDaCarteira(resto: string): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${resto}`);
}

function iniciar(): () => void {
  // L43: o link "Levar minha carteira" abre o jogo com `#carteira=`. O fragmento sai do endereço antes de qualquer outra coisa; a conferência e
  // a pergunta vêm depois (`receberCarteira`), quando a carteira e a tela existem.
  const hashDaAbertura = window.location.hash;
  const leituraDaAbertura = lerFragmentoDaCarteira(hashDaAbertura);
  if (leituraDaAbertura.tipo !== 'nenhum') limparEnderecoDaCarteira(leituraDaAbertura.resto);
  /** Enquanto o link da abertura não foi resolvido, a leitura do lobby não cria uma carteira à toa (a do link pode ser a deste aparelho). */
  let aguardandoOLink = leituraDaAbertura.tipo !== 'nenhum';
  /** L62: `conta.eu()` vem antes da carteira; até ele responder o lobby não lê as missões. */
  let aguardandoAConta = true;
  const { mesa, bolao: medidasBolao } = CONFIG_FISICA_PADRAO;
  let ensaio: MotorDeRegras | null = null;
  const regrasAtuais: MotorDeRegras = {
    novaPartida: (config, jogadores, rng) => (ensaio ?? REGRAS_DO_PACOTE).novaPartida(config, jogadores, rng),
    aplicarTacada: (partida, eventos) => (ensaio ?? REGRAS_DO_PACOTE).aplicarTacada(partida, eventos),
  };
  let semente = sementeInicial();
  /** A física local: a padrão, ou a mexida no painel F1 (mesmo PC e treino). Online vale por cima dela a da sala. */
  let fisicaLocal: ConfigFisica = CONFIG_FISICA_PADRAO;
  /** A config de física da próxima tacada e da previsão: a local, ou, numa sala, a dela (`sincronizarFisica`). */
  let configFisica: ConfigFisica = CONFIG_FISICA_PADRAO;
  /** A curva de força do painel dev (ou a de fábrica); sobre ela entram as sensibilidades do jogador da vez. */
  let configTacadaBase = CONFIG_WEB.tacada;
  let configTacada = CONFIG_WEB.tacada;
  const comecarJogo = (jogadores: readonly Jogador[], config: ConfigRegras = PRESET_BOTECO.regras): Jogo =>
    new Jogo(
      { regras: regrasAtuais, simular: simularTacada, fisica: configFisica },
      config,
      jogadores,
      criarRng(semente++),
    );
  let jogo = comecarJogo(JOGADORES_HOT_SEAT);
  const busca = window.location.search;
  // L52: anúncios só no host de produção; a faixa de baixo tira a altura dela da cena (canvas, câmera, projeções) e do HUD.
  const anuncios = criarAnuncios({ hostname: window.location.hostname, busca });
  let faixaDeAnuncio: ReturnType<typeof criarFaixa> | null = null;
  /** A altura da janela que sobra para a cena (sem a faixa de anúncio). */
  const alturaDaCena = (): number => Math.max(1, window.innerHeight - (faixaDeAnuncio?.altura() ?? 0));
  let modo: Modo = pularMenu(busca) ? 'local' : 'menu';
  let sessao: SessaoOnline | null = null;
  /** O modo treino (L42): a sessão (tacadas, fotos para refazer, o que a mão faz); `null` fora dele. O `jogo` é o do treino enquanto isto existe. */
  let treino: SessaoDeTreino | null = null;
  /** A mesa em edição (bola na mão e arrumar): o `jogo` só a recebe ao sair do modo. */
  let editor: EditorDaMesa | null = null;
  /** A vista da câmera de antes de a mão entrar na mesa (a mão pede a de cima). */
  let vistaAntesDaMao: 'tacada' | 'cima' | null = null;
  /** Online: o Web Lock que impede o Chrome de congelar esta aba (e fechar o WebSocket dela com 1001 ao descongelar). */
  let abaViva: AbaViva | null = null;
  let ultimoPedido: PedidoDeEntrada | null = null;
  const armazem = new ArmazemDeSessao(armazenamentoLocal(), idDaAba(armazenamentoDaAba()));
  /** A carteira deste navegador (L24): o código secreto fica no `localStorage` e só sai pelo `criar-sala`/`entrar` e pelo cabeçalho do HTTP. */
  const carteira = new CarteiraDoAparelho({
    armazenamento: armazenamentoLocal(),
    pedir: pedirPeloNavegador,
    agendar: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
    // L62: um código que o servidor não conhece, num navegador que já teve conta, é de uma conta com a sessão vencida
    sessaoPerdida: (): boolean => conta.teveConta(),
    aoPerderASessao: () => dialogosDaConta.abrirSessaoAcabou(),
  });
  /** A conta da Beco Games (L62): o cookie da sessão é `HttpOnly`, então o jogo só pergunta quem é (`eu()`); a senha nunca é guardada. */
  const conta = new ContaDoAparelho({
    armazenamento: armazenamentoLocal(),
    pedir: pedirContaPeloNavegador,
    agendar: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
    codigoDoConvidado: (): string | undefined => carteira.codigo(),
  });
  /** Dá para mirar e tacar agora: no hot-seat sempre; online só na minha vez; no menu, nunca. */
  const podeJogar = (): boolean => (modo === 'local' && (treino === null || (treino.modo === 'mirar' && jogo.fase !== 'fim'))) || (modo === 'online' && sessao !== null && sessao.partida.minhaVez);
  /** O relógio da tacada do hot-seat (online vale o da sala): mesmo tempo por tacada, esgotou = perde a vez. */
  const relogioLocal = new RelogioLocal(CONFIG_WEB.hud.relogioPadraoS);

  // Qualidade gráfica: o nível de abertura sai da escolha lembrada, do renderizador (software → baixa) e de até onde o
  // modo automático já teve de descer neste computador. Antialias e tamanho das texturas nascem com ele; o resto troca na hora.
  const gpu = comRenderizadorDaUrl(detectarGpu(), busca);
  const qualidadeLembrada = lerQualidade(armazenamentoLocal());
  const qualidadeDaVisita = qualidadeDaUrl(busca);
  const ouvintesDaQualidade = new Set<() => void>();
  const controlador = new ControladorDeQualidade({
    preferencia: qualidadeDaVisita ?? qualidadeLembrada.preferencia,
    software: gpu.software,
    rebaixada: qualidadeDaVisita === null ? qualidadeLembrada.rebaixada : null,
    fpsMinimo: CONFIG_WEB.qualidade.auto.fpsMinimo,
    janelaMs: CONFIG_WEB.qualidade.auto.janelaS * 1000,
    aquecimentoMs: CONFIG_WEB.qualidade.auto.aquecimentoS * 1000,
    aoMudar: (nivel, motivo, fps) => aplicarNivel(nivel, motivo, fps),
    // `?qualidade=` vale só nesta visita: não grava por cima do que o jogador escolheu.
    salvar: (salva) => void (qualidadeDaVisita === null && gravarQualidade(salva, armazenamentoLocal())),
  });
  const nivelDeAbertura = controlador.nivel;
  const perfilDeAbertura = perfilDoNivel(nivelDeAbertura);
  // O CSS do menu (L40) lê o nível: na baixa não há `backdrop-filter` nem animação contínua.
  document.body.dataset.qualidade = nivelDeAbertura;

  // Sem WebGL não há mesa: em vez da página em branco, uma tela clara diz o que fazer (e nada mais do jogo é montado).
  const renderer = abrirRendererOuAvisar(
    () => new THREE.WebGLRenderer({ antialias: perfilDeAbertura.antialias, powerPreference: 'high-performance' }),
    (erro) => console.error('Não foi possível criar o contexto WebGL:', erro),
  );
  if (renderer === null) {
    const tela = criarTelaSemWebgl(document.body, () => window.location.reload());
    return () => tela.dispose();
  }
  document.body.append(renderer.domElement);

  // Os sons são amostras CC0 (public/sons/), carregadas em segundo plano quando o contexto abre (primeiro gesto); até lá, ou se um
  // arquivo não vier, toca o sintetizado.
  const sonsDoJogo = criarSonsDoJogo(CONFIG_WEB.audio, dependenciasDoNavegador());
  const audio = new MotorDeAudio({
    cfg: CONFIG_WEB.audio,
    geradores: sonsDoJogo.geradores,
    abrir: abrirSessaoReal,
    aoAbrir: sonsDoJogo.aoAbrir,
    armazenamento: armazenamentoLocal(),
  });
  /** Avisos de som com atraso (o sino que vem depois do "tempo esgotado" no hot-seat), cancelados ao desmontar. */
  const timersDeSom = new Set<number>();
  function tocarAviso(som: Parameters<MotorDeAudio['avisar']>[0], atrasoMs: number): void {
    if (atrasoMs <= 0) return audio.avisar(som);
    const id = window.setTimeout(() => {
      timersDeSom.delete(id);
      audio.avisar(som);
    }, atrasoMs);
    timersDeSom.add(id);
  }
  /** Por que a vez que `mostrarPartida` vai ver mudar mudou: a tacada (padrão) ou o tempo do hot-seat. */
  let motivoDaTroca: MotivoDaTroca = 'tacada';
  // O navegador só deixa o áudio tocar depois de um gesto: o primeiro clique ou tecla (o do Pointer Lock serve).
  const destravarAudio = (): void => {
    audio.destravar();
    if (audio.pronto) {
      window.removeEventListener('pointerdown', destravarAudio, true);
      window.removeEventListener('keydown', destravarAudio, true);
    }
  };
  window.addEventListener('pointerdown', destravarAudio, true);
  window.addEventListener('keydown', destravarAudio, true);


  const cena = new THREE.Scene();
  cena.background = new THREE.Color(CONFIG_WEB.luz.fundo);
  const anisotropia = renderer.capabilities.getMaxAnisotropy();
  const grupoDaMesa = criarMesa(mesa, { raioBola: CONFIG_FISICA_PADRAO.bola.raio, anisotropia, escalaTextura: perfilDeAbertura.escalaTextura });
  cena.add(grupoDaMesa);
  // O boteco em volta da mesa (L44): carrega em segundo plano, no nível da qualidade; até chegar a cena é a de antes.
  const boteco = new BotecoEmCena({
    cfg: CONFIG_WEB.boteco,
    anisotropia: (q) => Math.min(perfilDoNivel(q).anisotropiaMax, anisotropia),
  });
  cena.add(boteco.grupo);

  const bolas = criarBolas(PRESET_BOTECO.regras, CONFIG_FISICA_PADRAO, anisotropia, { escalaTextura: perfilDeAbertura.escalaTextura, segmentos: perfilDeAbertura.segmentosEsfera });
  cena.add(bolas.grupo);
  const bolao = bolas.porId[ID_BOLAO]!;
  const taco = criarTaco(TACO, {
    segmentos: segmentosDoTaco(perfilDeAbertura),
    escalaTextura: perfilDeAbertura.escalaTextura,
    anisotropia,
    halo: haloDoTacoNoNivel(perfilDeAbertura),
    detalhe: detalheDoTacoNoNivel(perfilDeAbertura),
    // Uma imagem pintada que chega depois troca o material da peça: as variantes do nível se refazem sobre o novo.
    aoTrocarMateriais: () => renovarMateriaisDoTaco(),
  });
  cena.add(taco);
  // Os que seguram o taco: as minhas mãos (L23) e, na vez dos outros, o balão de cada um.
  const personagens = new THREE.Group();
  personagens.name = 'personagens';
  cena.add(personagens);
  const maos = new MaosEmCena(corDaEquipe(0), detalheDasMaos(perfilDeAbertura), CONFIG_WEB.maos);
  personagens.add(maos.grupo);
  // As mãos do fim da partida (palmas e mão mole, ao lado dos balões), da mesma mão do artista.
  const maosDoFim = new MaosDoFim(CONFIG_WEB.maos, detalheDasMaos(perfilDeAbertura));
  personagens.add(maosDoFim.grupo);
  const atlasDeCaras = criarAtlasDeCaras(anisotropia);
  const gizNaCena = new GizDaCena(CONFIG_WEB.maos.giz, ladosDosPersonagens(perfilDeAbertura));
  personagens.add(gizNaCena.grupo);
  let poeiraDoGiz = new PoeiraDeGiz(CONFIG_WEB.maos.giz.poeira, particulasDoGiz(perfilDeAbertura), Math.random);
  const baloes = new BaloesDaCena(CONFIG_WEB.baloes, ladosDosPersonagens(perfilDeAbertura), atlasDeCaras);
  personagens.add(baloes.grupo);
  // Destaque das bolas que valem no começo da vez: anéis dourados no pano, só enquanto a mesa está liberada.
  const aneisDoDestaque = new AneisDeBolas({ raioBola: CONFIG_FISICA_PADRAO.bola.raio, cor: CONFIG_WEB.destaque.cor, opacidadeMax: CONFIG_WEB.destaque.opacidadeMax });
  cena.add(aneisDoDestaque.grupo);
  const destaque = new DestaqueDaVez(CONFIG_WEB.destaque);
  const teclaB = ligarTeclaSegurada(window, 'KeyB');
  let destaqueNaCena = false;
  const ambiente = criarAmbiente(renderer, cena, mesa, CONFIG_WEB.luz, [bolas.grupo, taco, personagens], perfilDeAbertura);
  // Só as bolas e os personagens (mãos e balões, de látex brilhante) são "detalhe" (nunca Lambert): o taco, com o brilho da madeira verniz, vira Lambert no nível baixo, onde a tela está cheia dele.
  const variantes = new VariantesDeMateriais([grupoDaMesa, bolas.grupo, taco, personagens, boteco.grupo], [bolas.grupo, personagens]);
  const aplicador = new AplicadorDeQualidade({
    renderer,
    ambiente,
    bolas,
    variantes,
    taco: {
      definirSegmentos: (segmentos) => definirSegmentosDoTaco(taco, segmentos),
      definirHalo: (ligado) => definirHaloDoTaco(taco, ligado),
      definirDetalhe: (detalhe) => {
        if (definirDetalheDoTaco(taco, detalhe).length > 0) variantes.renovar(taco);
      },
    },
    raizes: [grupoDaMesa, bolas.grupo, taco, personagens],
    personagens: {
      definirLados: (lados) => {
        baloes.definirLados(lados);
        gizNaCena.definirLados(lados);
      },
      definirDetalheDasMaos: (nivel) => {
        maos.definirNivel(nivel);
        maosDoFim.definirNivel(nivel);
        baloes.definirNivel(nivel);
      },
    },
    janela: () => ({ largura: window.innerWidth, altura: alturaDaCena(), pixelRatio: window.devicePixelRatio }),
  });
  /** Leva o nível ao desenho; na queda automática avisa o jogador sem atrapalhar. */
  function aplicarNivel(nivel: NivelDeQualidade, motivo: MotivoDaMudanca, fps?: number): void {
    document.body.dataset.qualidade = nivel;
    aplicador.aplicar(perfilDoNivel(nivel));
    void boteco.definirNivel(nivel);
    if (poeiraDoGiz.capacidade !== particulasDoGiz(perfilDoNivel(nivel))) poeiraDoGiz = new PoeiraDeGiz(CONFIG_WEB.maos.giz.poeira, particulasDoGiz(perfilDoNivel(nivel)), Math.random);
    if (motivo === 'queda') {
      const rotulo = perfilDoNivel(nivel).rotulo;
      hud.aviso.mostrar(
        `Gráficos reduzidos para ${rotulo} (${Math.round(fps ?? 0)} fps). Dá para mudar em ⚙ Configurações.`,
        performance.now(),
        8000,
      );
    }
    for (const ouvinte of [...ouvintesDaQualidade]) ouvinte();
  }
  controlador.iniciar();

  const camera = new THREE.PerspectiveCamera(CONFIG_WEB.camera.campoDeVisaoGraus, window.innerWidth / alturaDaCena(), 0.01, 50);
  const semi = semiMesa(mesa);
  const rig = new CameraRig(camera, CONFIG_WEB.camera, semi.x, semi.z);
  rig.definirLarguraDaTela(window.innerWidth);
  // Quando um nível do boteco entra: o piso do jogo some (o do arquivo está no mesmo plano), as variantes de material e o reflexo dos
  // metais se refazem sobre ele e a câmera passa a ficar dentro da sala. O nível de antes sai com as variantes dele.
  boteco.aoSoltar((raiz) => variantes.esquecer(raiz));
  boteco.aoCarregar(() => {
    const pisoDoJogo = grupoDaMesa.getObjectByName('piso');
    if (pisoDoJogo) pisoDoJogo.visible = false;
    aplicador.reaplicar();
    ambiente.atualizarMetais();
    rig.definirLimites(CONFIG_WEB.boteco.sala);
    document.body.dataset.boteco = 'sim';
  });
  /** A câmera do menu: o tempo conta só com o menu aberto (cada vez ele começa na primeira posição `camera-menu-1`). */
  let tempoDoMenuS = 0;
  const poseDoMenuAgora = poseDoMenuVazia();

  // Como a força se dá (empurrar ou pela linha): a escolha local é `?forca=` (ou o interruptor do painel dev); sem nada, a linha.
  let controleLocal: ControleForca = controleDaUrl(busca) ?? CONTROLE_DE_FORCA_PADRAO;
  /** O que a sala mandou como regra da mesa (L17); enquanto ela não manda nada, vale o local. */
  let controleDaSala: ControleForca | null = null;
  const mira = new Mira(CONFIG_WEB.mira);
  const tacada = new Tacada(CONFIG_WEB.tacada, controleEfetivo(false, null, controleLocal));
  const ponto = new PontoDeContato(CONFIG_WEB.efeito);
  // O giz gasta um tanto sorteado por tacada. A semente segue a da partida (`?semente=N` repete também o desgaste); é por aparelho:
  // o giz só entra na conta de quem tacou (a gravação que ele manda é a verdade).
  const rngDoGiz = criarRng(Math.imul(semente, 2654435761) >>> 0);
  const giz = new GizDosJogadores(4, CONFIG_WEB.giz, () => rngDoGiz.proximo());
  const seguimento = new AnimacaoTaco(CONFIG_WEB.tacada);
  // O taco desenhado nunca atravessa a tabela, a moldura nem outra bola: sobe o mínimo para passar por cima (só visual).
  const obstaculos = obstaculosDaMesa(mesa, CONFIG_WEB.mesa);
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, medidasBolao.raio, CONFIG_FISICA_PADRAO.bola.raio, CONFIG_WEB.elevacaoDoTaco);
  // As mãos de quem taca: a conta (`MaosDoJogador`, pura) escolhe os lugares pelo taco desenhado, a câmera e as bolas; `posicionarMaos` as desenha.
  // O gesto do giz (L23, G): a mão da ponte pega o cubo na borda, o gira na ponta durante a passada e o devolve; só no meu taco.
  const animacaoDoGiz = new AnimacaoDoGiz(CONFIG_WEB.maos.giz);
  const cuboDaBorda = new CuboNaBorda(CONFIG_WEB.maos.giz.borda, obstaculos, CONFIG_WEB.maos.giz.cubo.lado);
  const poseDaPonteSemGiz = poseVaziaDeMao();
  const poseNoCubo = poseVaziaDeMao();
  const gizNaMao = new GizNaMao(CONFIG_WEB.maos.giz.pegada.rolo);
  const modeloDasMaos = new MaosDoJogador(CONFIG_WEB.maos, obstaculos, medidasBolao.raio, CONFIG_WEB.tacada.recuoInicial, CONFIG_WEB.tacada.recuoMaximo, Math.random);
  // O arquivo da mão vem por fora do começo da partida: até chegar, a partida corre sem mãos; se falhar, segue sem elas.
  const inicioDaCargaDasMaos = performance.now();
  void maos.carregar(CONFIG_WEB.maos.arquivos).then((base) => {
    if (base === null) return;
    modeloDasMaos.calibrar(base.modelo, base.meta);
    maosDoFim.usar(base);
    aplicador.reaplicar();
    tempoDeCargaDasMaosMs = performance.now() - inicioDaCargaDasMaos;
  });
  // O balão do artista (L30) também vem por fora do começo da partida: até chegar valem os balões procedurais de antes; se o arquivo
  // falhar, eles ficam e o aviso vai só para o console.
  const inicioDaCargaDoBalao = performance.now();
  // Os chapéus (L48) são outro arquivo, de ~0,7 MB: só baixam quando alguém da sala, ou o editor "Meu balão", usa um chapéu.
  const chapeus = new CarregadorDeChapeus(() => carregarAcessorios(CONFIG_WEB.baloes.arquivo.chapeus.glb, CONFIG_WEB.baloes.arquivo.chapeus.meta), CONFIG_WEB.baloes.arquivo.chapeus.tentarDeNovoAposMs);
  let baseDoBalao: BaseDoRosto | null = null;
  /** Gancho de teste (L48): todos os balões vestem esta aparência em vez da que a sala manda (medir o custo e fotografar). */
  let aparenciaForcadaDoBalao: AparenciaDoBalao | null = null;
  void carregarPersonagemDeRosto(CONFIG_WEB.baloes.arquivo.glb, CONFIG_WEB.baloes.arquivo.meta, { nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado' })
    .then((base) => {
      baseDoBalao = base;
      baloes.usar(base, detalheDasMaos(perfilDoNivel(controlador.nivel)), Math.random, chapeus, () => aplicador.reaplicar());
      aplicador.reaplicar();
      tempoDeCargaDoBalaoMs = performance.now() - inicioDaCargaDoBalao;
    })
    .catch((erro: unknown) => console.warn(`Balão: o arquivo não carregou, ficam os balões de antes (${erro instanceof Error ? erro.message : String(erro)})`));
  const projetorDaCamera = new ProjetorDaCamera(camera);
  const entradaDasMaos: { -readonly [K in keyof EntradaDasMaos]: EntradaDasMaos[K] } = { x: 0, y: 0, z: 0, angulo: 0, elevacao: 0, recuo: 0, lateral: 0, vertical: 0, ativas: false, soAPonte: false };
  const brancaProtegida: EsferaMutavel = { x: 0, y: 0, z: 0, r: medidasBolao.raio };
  const miradaProtegida: EsferaMutavel = { x: 0, y: 0, z: 0, r: CONFIG_FISICA_PADRAO.bola.raio };
  const soABranca: readonly EsferaMutavel[] = [brancaProtegida];
  const brancaEMirada: readonly EsferaMutavel[] = [brancaProtegida, miradaProtegida];
  // O balão de quem joga na outra tela (L23): ao lado da mão dele, com a cara que a tacada provoca; os emojis dele sobem dele.
  const posicionadorDoBalao = new PosicionadorDoBalao(CONFIG_WEB.baloes, bocasDaMesa(mesa));
  const rostoDoBalao = new RostoDoBalao(CONFIG_WEB.baloes.rosto);
  const lugarDoBalao = lugarVazioDoBalao();
  const estadoDoBalao = estadoVazioDoBalao();
  const emojisDoBalao = new SubidasDeEmojis();
  const camadaDeEmojisDoBalao = criarCamadaDeEmojisDoBalao(document.body);
  const balaoSuave = { x: 0, y: 0, z: 0 };
  const balaoNaTela = { x: 0, y: 0, altura: 0 };
  const topoNaTela = { x: 0, y: 0, profundidade: 0 };
  const peNaTela = { x: 0, y: 0, profundidade: 0 };
  /** De quem é o balão em cena: quem jogava quando ele apareceu; só muda com a tacada e a transição acabadas. */
  let donoDoBalao: Jogador | null = null;
  let escalaDoBalao = 0;
  /** Só o gancho de teste muda: a cara que o balão faz, no lugar da que a tacada provoca. */
  let caraForcadaDoBalao: CaraDoBalao | null = null;
  /** Só o gancho de teste muda: os olhos só olham isto, no lugar do que o jogo escolhe. */
  let olharForcadoDoBalao: 'branca' | 'camera' | null = null;
  let momentosDoRosto: readonly MomentoDoRosto[] = [];
  /** Quantos momentos do rosto já passaram na gravação que toca: cada um é também um momento para as mãos reagirem. */
  let momentosVistos = 0;
  let tempoDeCargaDasMaosMs: number | null = null;
  let tempoDeCargaDoBalaoMs: number | null = null;
  // Para onde os olhos do balão do artista olham (L30): a branca e, depois da tacada, a bola que corre mais.
  const seguidorDoOlhar = new SeguidorDoOlhar({ ...CONFIG_WEB.baloes.arquivo.olhar, altura: CONFIG_FISICA_PADRAO.bola.raio }, ID_BOLAO);
  const bolasX = new Float64Array(bolas.porId.length);
  const bolasZ = new Float64Array(bolas.porId.length);
  const bolasNaMesa = new Uint8Array(bolas.porId.length);
  // No que o balão presta atenção (L46): a branca, a bola que anda, a caçapa onde uma bola vai cair, o ponto da mira e a câmera.
  const cacapasDaGravacao = new CacapasDaGravacao();
  const pontoDaBranca = { x: 0, y: CONFIG_FISICA_PADRAO.bola.raio, z: 0 };
  const pontoDaBolaQueAnda = { x: 0, y: CONFIG_FISICA_PADRAO.bola.raio, z: 0 };
  const pontoDaCacapa = { x: 0, y: CONFIG_FISICA_PADRAO.bola.raio, z: 0 };
  const situacaoDoOlhar: { -readonly [K in keyof SituacaoDoOlhar]: SituacaoDoOlhar[K] } = {
    mirando: false,
    fim: false,
    branca: pontoDaBranca,
    brancaNaMesa: true,
    bolaQueAnda: null,
    cacapa: null,
    mira: null,
    camera: camera.position,
  };
  /** Desde quando (relógio da página, ms) o outro mira sem tacar: passado `impacienciaAposS`, o balão perde a paciência. */
  let mirandoDesdeMs: number | null = null;
  /** Quem joga contra o dono do balão perdeu a vez: o balão ri dele quando entrar em cena (a falta sempre; o erro simples, de vez em quando). */
  const provocacaoDoBalao = new ProvocacaoDoBalao(CONFIG_WEB.baloes.rosto);
  let equipeForcadaDoBalao: number | null = null;
  let balaoComAncora = false;
  let balaoDesenhado = false;
  let semLugarDoBalao = 0;
  // O fim da partida (L23): ~2 s de balões de todas as equipes em volta da mesa antes da tela de fim; clique ou tecla pula.
  const fimDaPartida = new FimDaPartida();
  const quadroDoFimDoBalao = quadroVazioDoFim();
  const estadoDoFimDoBalao = estadoVazioDoBalao();
  const poseDoFim = poseVaziaDoFim();
  let lugaresDoFimDosBaloes: readonly LugarDoFim[] = [];
  /** O que falta fazer quando o roteiro acaba ou é pulado: a tela de fim e liberar quem espera a tacada. */
  let aoAcabarOFim: (() => void) | null = null;
  const dev = devAtivo(import.meta.env.DEV, window.location.search);

  /**
   * Ponto único de entrada das regras de mesa que a sala escolhe (o L17 liga aqui o `estado-sala`): o controle de força e as
   * quatro regras do giz. Quem não vem fica como estava; `null` no controle volta ao local. Hoje ninguém chama com o que a sala
   * manda, e valem o padrão, `?forca=` e o interruptor do painel dev.
   */
  function aplicarRegrasDaMesa(regras: { readonly forca?: ControleForca | null; readonly giz?: RegrasGiz }): void {
    if (regras.forca !== undefined) controleDaSala = regras.forca;
    if (regras.giz !== undefined) giz.definirRegras(regras.giz);
    tacada.definirControle(controleEfetivo(sessao !== null, controleDaSala, controleLocal));
  }
  let controleNaAjuda: ControleForca = 'linha';
  /** Só o gancho de teste desliga: o taco volta a ficar sempre a 5°, como antes de existir a elevação que o desvia. */
  let elevacaoLivreLigada = true;
  /** O que a câmera de tacada sabe do taco desenhado neste quadro: ela sobe quando o taco sobe (bola perto da tabela). */
  const tacoParaACamera = { elevacao: 0, recuo: 0 };
  /** Só o gancho de teste: o giz que a ponta do taco mostra, no lugar do do jogador (capturas da ponta cheia e gasta). */
  let gizForcadoDoTaco: number | null = null;
  /** A skin (com a semente e o contador) que o gancho de teste fixou no taco (as capturas); `null` = a da sala (online) ou a clássica (mesmo PC). */
  let skinForcadaDoTaco: { readonly skin: SkinTaco; readonly semente: number | null; readonly bolas: number | null } | null = null;
  /** Os materiais do taco foram trocados (skin, ou uma imagem pintada que chegou): as variantes de qualidade se refazem sobre os novos. */
  function renovarMateriaisDoTaco(): void {
    variantes.renovar(taco);
    ambiente.atualizarMetais();
    aplicador.reaplicar();
  }
  /** Troca a skin, a semente e o contador do taco desenhado; os materiais que saem são soltos das variantes e a qualidade vale para os novos. */
  function trocarSkinDoTaco(skin: SkinTaco, semente: number | null, bolas: number | null): void {
    if (definirSkinDoTaco(taco, skin, semente, bolas).length === 0) return;
    renovarMateriaisDoTaco();
  }
  /** A tacada já foi dada pela linha de força, mas o taco ainda corre até a bola: as bolas só começam a andar no impacto. */
  let gravacaoNaBatida: Gravacao | null = null;
  /** Os parâmetros da tacada que toca (a minha ou a de quem joga na outra tela): dizem por que o taco espirrou. */
  let parametrosTocando: ParametrosTacada | null = null;

  // Configurações por jogador: cada um tem as suas (hot-seat: troca na vez; online: as do jogador deste aparelho).
  const gerenteConfig = new GerenteDeConfiguracoes(armazenamentoLocal());
  /** Os oito emojis das teclas 1 a 8: do aparelho, os mesmos em qualquer sala. */
  const emojisEscolhidos = new EmojisEscolhidos(armazenamentoLocal());
  let configMira = CONFIG_WEB.mira;
  let configCamera = CONFIG_WEB.camera;
  function aplicarConfiguracoes(): void {
    const c = gerenteConfig.valores;
    configMira = miraDoJogador(CONFIG_WEB.mira, c);
    mira.configurar(configMira);
    configTacada = tacadaDoJogador(configTacadaBase, c);
    tacada.configurar(configTacada);
    configCamera = cameraDoJogador(CONFIG_WEB.camera, c);
    rig.configurar(configCamera);
  }
  gerenteConfig.aoMudar(aplicarConfiguracoes);
  let perfilModo: Modo | null = null;
  let perfilJogador = '';
  let perfilNome = '';
  /** Troca o perfil das configurações quando muda o modo, o jogador da vez ou o meu nome (sem alocar se nada mudou). */
  function sincronizarPerfil(): void {
    const meuIndice = sessao?.partida.meuIndice ?? null;
    const meuNome = modo === 'online' && meuIndice !== null ? (jogo.partida.jogadores[meuIndice]?.nome ?? '') : '';
    const jogador = modo === 'local' ? jogo.jogadorDaVez : null;
    const id = jogador?.id ?? '';
    if (modo === perfilModo && id === perfilJogador && meuNome === perfilNome) return;
    perfilModo = modo;
    perfilJogador = id;
    perfilNome = meuNome;
    gerenteConfig.usar(perfilAtivo({ modo, jogadorDaVez: jogador, meuNome: meuNome === '' ? null : meuNome }));
  }

  const painelConfig = criarPainelDeConfiguracoes(document.body, {
    gerente: gerenteConfig,
    emojis: emojisEscolhidos,
    aoAbrir: () => entrada.soltarMouse(),
    qualidade: {
      estado: () => ({
        nivel: controlador.nivel,
        rotuloDoNivel: perfilDoNivel(controlador.nivel).rotulo,
        preferencia: controlador.preferencia,
        software: gpu.software,
        pedeRecarregar: pedeRecarregar(perfilDeAbertura, perfilDoNivel(controlador.nivel)),
      }),
      escolher: (preferencia) => controlador.definirPreferencia(preferencia),
      aoMudar(ouvinte) {
        ouvintesDaQualidade.add(ouvinte);
        return () => void ouvintesDaQualidade.delete(ouvinte);
      },
      recarregar: () => window.location.reload(),
    },
  });
  // Créditos dos sons: saem de docs/creditos.md (a mesma tabela que o repositório mantém).
  const painelCreditos = criarPainelDeCreditos(document.body, { creditos: lerCreditos(creditosMd), aoAbrir: () => entrada.soltarMouse() });
  const hud = criarHud(document.body, {
    espacoDeAnuncioNoFim: () => anuncios.espaco('fim'),
    aoConfiguracoes: () => painelConfig.alternar(),
    aoCreditos: () => painelCreditos.alternar(),
    aoVoltar: () => (sessao ? sessao.partida.voltarAoLobby() : voltarDoFimLocal()),
    audio,
    sala: {
      aoEnviarChat: (texto) => void sessao?.partida.enviarChat(texto),
      aoCopiarLink: copiarConvite,
      aoSair: () => sairDaSala(),
      aoAbrirChat: () => entrada.soltarMouse(),
      aoReconectar: () => sessao?.cliente.tentarAgora(),
    },
    emojis: { escolha: emojisEscolhidos, aoSoltar: (emoji) => sessao?.partida.enviarEmoji(emoji) ?? false },
    aoMenu: irParaMenu,
    // A seção "Missões do dia" do H (L37): o mesmo painel do lobby; no mesmo PC diz que ali nada conta, e o progresso novo espera as bolas.
    missoes: {
      missoes: (agoraMs) => missoesNaAjuda(quadroDeMissoes(), agoraMs, modo === 'online' ? 'sala' : 'local'),
      aoPrecisarDeMissoes: lerMissoesDoLobby,
      segurar: () => tacadaEmCurso(),
    },
    ajudaExtra: dev
      ? [
          { teclas: ['F1', '`'], texto: 'Painel de física (dev)' },
          { teclas: ['L'], texto: 'Linha de previsão (dev, só no mesmo PC)' },
        ]
      : [{ teclas: ['F1'], texto: 'Física da partida (online, só o anfitrião muda a da sala)' }],
    // O modo treino (L42): o que cada botão do HUD dele faz (as teclas chamam as mesmas funções).
    treino: {
      casa: PRESET_TREINO.regras,
      cenarios: CENARIOS_DE_TREINO,
      aoBolaNaMao: () => entrarNaMao('branca'),
      aoArrumar: () => entrarNaMao('arrumar'),
      aoRefazer: refazerTacada,
      aoNovoTriangulo: novoTriangulo,
      aoEscolherCenario: (id) => armarCenario(cenarioDeTreino(id)),
      aoDevolver: devolverBolaDaBandeja,
      aoAbrirCenarios: () => entrada.soltarMouse(),
    },
  });

  // Transição da falta: anel vermelho na bola paga, ela voando até a ficha do placar e as recolocações deslizando.
  const aneisDaFalta = new AneisDeBolas({ raioBola: CONFIG_FISICA_PADRAO.bola.raio, cor: 0xff3b30, opacidadeMax: 0.95, dentro: 1.1, fora: 1.75 });
  cena.add(aneisDaFalta.grupo);
  const transicao = new TransicaoDaTacada({
    bolas: bolas.porId,
    aneis: aneisDaFalta,
    projetar: (x, y, z, raio, saida) => {
      camera.updateMatrixWorld();
      return projetarParaTela(camera, x, y, z, raio, window.innerWidth, alturaDaCena(), saida);
    },
    placar: hud.placar,
    voos: hud.voos,
    raioDaBola: (id) => medidasDaBola(id, CONFIG_FISICA_PADRAO).raio,
    cfg: CONFIG_WEB.transicao.movimento,
  });
  let ultimoPlano: PlanoDaTransicao | null = null;

  // Linha de previsão: regra da partida (a tela inicial a escolhe; online vale a da sala, igual para todos). É a tacada simulada
  // de verdade, recalculada a cada mudança da mira, e existe sem `?dev=1`: o custo cai com o nível de qualidade.
  const linhaPrevisao = criarLinhaDePrevisao(CONFIG_WEB.previsao.linha);
  cena.add(linhaPrevisao.grupo);
  const previsao = new PrevisaoDeTacada({
    prever: (parametros, ajuste) => jogo.preverTacada(parametros, ajuste),
    saida: linhaPrevisao,
    // Efeito além do círculo seguro do giz de agora: risco de miscue, a linha muda de cor.
    emRisco: (e) => Math.hypot(e.lateral, e.vertical) > limiteSeguro(e.giz, configFisica),
  });
  /** A linha do hot-seat: a da tela inicial (ou `?linha=`), que L e o painel dev ainda mudam. Online ela não vale: manda a sala. */
  let linhaLocal: LinhaDaPartida = linhaDaUrl(busca) ?? LINHA_DESLIGADA;
  /** A força da tacada prevista que o painel dev escolheu (sem painel, a de fábrica). */
  let forcaDaPrevisao: number | null = null;
  const aplicadoNaPrevisao = { linha: null as LinhaDaPartida | null, nivel: null as NivelDeQualidade | null, forca: Number.NaN };
  const linhaDeAgora = (): LinhaDaPartida => linhaEfetiva(sessao !== null, sessao?.partida.estadoSala?.linha, linhaLocal);
  /** Leva a previsão ao que vale agora (linha da partida, nível de qualidade, força do painel); só mexe quando algo mudou. */
  function sincronizarLinha(): void {
    const linha = linhaDeAgora();
    const nivel = controlador.nivel;
    const forca = forcaDaPrevisao ?? CONFIG_WEB.previsao.velocidadeTaco;
    const a = aplicadoNaPrevisao;
    if (linha === a.linha && nivel === a.nivel && forca === a.forca) return;
    a.linha = linha;
    a.nivel = nivel;
    a.forca = forca;
    previsao.configurar(configDaPrevisao(CONFIG_WEB.previsao, { linha, perfil: perfilDoNivel(nivel), velocidadeTaco: forca }));
  }
  /** O painel dev (se há) acompanha a escolha da tela inicial: o que se escolheu antes de jogar é o que ele mostra. */
  let estadoDoPainel: EstadoDoPainel | null = null;
  /** O painel F1 (física); criado mais abaixo, depois do gancho. */
  let painelDev: PainelDev | null = null;
  function definirLinhaLocal(linha: LinhaDaPartida): void {
    linhaLocal = linha;
    estadoDoPainel?.definir('previsaoLigada', linha.previsao ? 1 : 0);
    estadoDoPainel?.definir('previsaoBolaAtingida', linha.bolaAtingida ? 1 : 0);
  }
  /** O controle de força local (`?forca=`); o interruptor do painel dev, se há, acompanha. */
  function definirControleLocal(controle: ControleForca): void {
    controleLocal = controle;
    estadoDoPainel?.definir('forcaPorLinha', controle === 'linha' ? 1 : 0);
  }
  const entradaPrevisao: EntradaDaPrevisao = { angulo: 0, lateral: 0, vertical: 0, giz: 0 };
  let erroDaPrevisao: string | null = null;

  // Aviso grande "Agora é só a N!" (a bola vem das regras) no começo da vez de quem só precisa da bola final.
  const anunciante = new AnunciadorDoCastigo();

  // Bola errada: enquanto o jogador da vez mira, a primeira bola na reta (varredura simples, sem linha nem caminho) é
  // conferida com `bolasAlvo` das regras; se não vale, o taco fica vermelho e o aviso diz por quê.
  const vigiaDaMira = new VigiaDaMira();
  let sinalMostrado = SEM_SINAL;

  // Desempenho: quadros (FPS e pior quadro), painel F3 e, online, o resumo que vai à sala a cada minuto.
  const quadros = new EstatisticasDeQuadros();
  let ultimoResumo: ResumoDeDesempenho | null = null;
  /** Uma sala mais antiga que o protocolo do `diagnostico` responde "mensagem inválida": o cliente para de mandá-lo e não assusta ninguém. */
  let salaSemDiagnostico = false;
  let enviouDiagnosticoEm = -Infinity;
  const diag = criarPainelDiagnostico(document.body, {
    atualizacaoMs: CONFIG_WEB.qualidade.diagnostico.atualizacaoMs,
    aberto: new URLSearchParams(busca).get('diag') === '1',
    ler: (agoraMs) => {
      const janelaFps = CONFIG_WEB.qualidade.diagnostico.janelaS;
      return {
        fps: quadros.fps(janelaFps * 1000, agoraMs),
        piorQuadroMs: quadros.piorQuadroMs(5000, agoraMs),
        janelaFpsS: janelaFps,
        janelaPiorS: 5,
        chamadas: renderer.info.render.calls,
        triangulos: renderer.info.render.triangles,
        geometrias: renderer.info.memory.geometries,
        texturas: renderer.info.memory.textures,
        memoriaMb: memoriaDoJsMb(),
        renderizador: gpu.renderizador,
        software: gpu.software,
        nivel: controlador.nivel,
        rotuloDoNivel: perfilDoNivel(controlador.nivel).rotulo,
        preferencia: controlador.preferencia,
        razaoDePixels: aplicador.razaoDePixels,
        largura: window.innerWidth,
        altura: alturaDaCena(),
      };
    },
  });
  const emissorDeDiagnostico = new EmissorDeDiagnostico(
    { quadros, qualidade: () => controlador.nivel, renderizador: gpu.renderizador, memoriaMb: memoriaDoJsMb },
    CONFIG_WEB.qualidade.diagnostico.resumoOnlineS * 1000,
    () => modo === 'online' && sessao !== null && sessao.partida.conectado && !salaSemDiagnostico,
    (resumo) => {
      ultimoResumo = resumo;
      if (sessao?.cliente.enviar(mensagemDeDiagnostico(resumo))) enviouDiagnosticoEm = performance.now();
    },
  );
  const aoApertarDiag = (e: KeyboardEvent): void => {
    if (e.code !== 'F3' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    if (!e.repeat) diag.alternar();
  };
  window.addEventListener('keydown', aoApertarDiag);
  const desligarPuloDoFim = ouvirPuloDoFim(window, () => fimDaPartida.ativo(performance.now(), CONFIG_WEB.baloes.fim.duracaoS), pularFimDaPartida);
  // Aba escondida e de volta: o que vem a seguir não é FPS de jogo.
  const aoMudarVisibilidade = (): void => {
    controlador.reiniciarMedida();
    quadros.interromper();
  };
  document.addEventListener('visibilitychange', aoMudarVisibilidade);

  let vezMostrada = -1;
  /** O placar do mesmo PC: as partidas seguidas do hot-seat, contadas com a mesma conta da sala. */
  const placarLocal = new PlacarLocal();
  /**
   * O placar da sala como a tela o mostra. Online fica o de antes enquanto a tacada que decide a partida ainda toca: o número
   * novo (que chega na frente da animação) estragaria o suspense.
   */
  let placarBruto: PlacarSala | null = null;
  let placarMostrado: PlacarParaMostrar = SEM_PLACAR;
  /** Online: cada jogador da roda está na sala? (o id do jogador é `lugar-N`) */
  function presencaDoJogador(id: string): Presenca | null {
    const lugar = /^lugar-(\d)$/.exec(id)?.[1];
    const dono = sessao?.partida.estadoSala?.lugares[Number(lugar)];
    return lugar === undefined || !dono || !sessao ? null : { conectado: dono.conectado, voce: Number(lugar) === sessao.partida.meuLugar };
  }
  /** O placar da sala (online) ou do mesmo PC (hot-seat) no HUD e na tela de fim. */
  function mostrarPlacarDaSala(): void {
    placarBruto = placarDaTela({ online: sessao !== null, tocando: jogo.fase === 'tocando', mostrado: placarBruto, sala: sessao?.partida.estadoSala?.placar, local: placarLocal.noFio() });
    placarMostrado = placarParaMostrar(placarBruto, formacaoDaPartida(jogo.partida), jogo.partida.config.modalidade);
    hud.placarDaSala.mostrar(placarMostrado.atual);
    hud.telas.definirPlacar(placarMostrado.atual);
  }

  /** Painel, objetivo, giz e efeito conforme a partida; o efeito só volta ao centro quando a vez muda. */
  function mostrarPartida(): void {
    // Durante a transição da falta o placar ainda mostra a ficha da bola que voa: quem mostra a partida é o fim dela.
    if (transicao.ativa) return;
    const { partida } = jogo;
    bolas.definirCasa(partida.config);
    hud.placar.mostrar(modeloDoPlacar(partida, sessao ? presencaDoJogador : undefined));
    // O treino não tem placar de sala nem de mesmo PC: o cartão "Treino" é o HUD dele.
    if (treino === null) mostrarPlacarDaSala();
    // Online o giz mostrado é sempre o meu; no hot-seat, o de quem tem a vez.
    const dono = sessao ? (partida.jogadores[sessao.partida.meuIndice ?? -1] ?? jogo.jogadorDaVez) : jogo.jogadorDaVez;
    hud.giz.definirDono(dono.nome);
    hud.placar.mostrarProvisorio(ensaio ? ['regras de ensaio'] : []);
    const anuncio = treino === null ? anunciante.atualizar(partida) : null;
    if (anuncio) {
      hud.avisoFalta.esconder();
      hud.anuncio.mostrar(anuncio, performance.now(), CONFIG_WEB.hud.anuncioSegundos * 1000);
    }
    else if (partida.fase === 'fim') hud.anuncio.esconder();
    if (partida.vez !== vezMostrada) {
      const haviaVez = vezMostrada >= 0;
      vezMostrada = partida.vez;
      if (!sessao) giz.definirVez(partida.vez);
      ponto.centralizar();
      modeloDasMaos.reiniciar();
      // A vez passou (não é o começo da partida nem um retrato da sala: esses reiniciam `vezMostrada`) e a partida segue.
      if (haviaVez && partida.fase !== 'fim') {
        const donoDaVez = partida.jogadores[partida.vez]?.id ?? '';
        const trocas = somsDaTroca(
          { hotSeat: !sessao, euRecebo: sessao !== null && jogadorEhDoLugar(donoDaVez, sessao.partida.meuLugar), motivo: motivoDaTroca },
          CONFIG_WEB.audio.avisos,
        );
        for (const t of trocas) tocarAviso(t.som, t.atrasoMs);
      }
    }
    motivoDaTroca = 'tacada';
  }

  /** Volta a cena ao estado do `jogo` de agora: para a animação, põe as bolas na mesa e limpa avisos. */
  function reiniciarCena(): void {
    cancelarFimDaPartida();
    animacaoDoGiz.reiniciar();
    cuboDaBorda.reiniciar();
    poeiraDoGiz.limpar();
    transicao.cancelar();
    hud.avisoFalta.esconder();
    entrada.cancelarTacada();
    player.parar();
    gravacaoNaBatida = null;
    seguimento.parar();
    tacada.concluir();
    hud.avisoEspirro.esconder();
    elevacaoDoTaco.reiniciar();
    previsao.invalidar();
    vezMostrada = -1;
    ponto.centralizar();
    sincronizarBolas(bolas.porId, jogo.mesa);
    anunciante.reiniciar();
    destaque.reiniciar();
    hud.anuncio.esconder();
    mostrarPartida();
    hud.placar.mostrarTexto('', 0, 0);
    hud.telas.esconderFim();
  }

  /** O dinheiro que a sala pagou ao fim desta partida, como a tela de fim o mostra; `null` sem sala ou sem aposta paga. */
  function apostaDoFim(): ApostaNaTela | null {
    const s = sessao?.partida;
    return s ? apostaNaTela(s.apostaPaga, s.estadoSala?.modo ?? '1x1', s.meuLugar) : null;
  }

  function mostrarFim(frase: string): void {
    // Online a sala já pode ter voltado à espera (o anfitrião foi mais rápido que a minha animação): a sala de espera está na tela.
    if (sessao?.partida.estadoSala?.fase === 'espera') return;
    const esperaPor =
      sessao && !sessao.partida.souAnfitriao
        ? `Esperando ${sessao.partida.estadoSala?.lugares.find((l) => l.anfitriao)?.nome ?? 'o anfitrião'} voltar à sala`
        : undefined;
    hud.telas.mostrarFim({
      vencedores: jogo.vencedores.map((j) => j.nome),
      detalhe: frase,
      sai: jogadoresDaNovaPartida(jogo.partida)[0]?.nome,
      esperaPor,
      rotuloDoBotao: sessao ? 'Voltar à sala' : 'Voltar',
      placar: placarMostrado.atual,
      classificacao: classificacaoDaPartida(jogo.partida),
      aposta: apostaDoFim(),
    });
  }

  /** A tacada que acabou de tocar passou a valer: se houve falta, bola paga ou recolocação, mostra isso com calma antes de liberar a mira. */
  function aposConclusao(consequencias: Consequencias): void {
    seguimento.parar();
    // No treino nada custa nada: sem transição da falta (a bola paga, o voo até a ficha do placar), o texto das regras basta.
    if (treino !== null) {
      ultimoPlano = null;
      return concluirTacada(consequencias);
    }
    const antes = jogo.antesDaUltimaTacada;
    let plano = antes
      ? planoDaTransicao({ consequencias, antes: antes.partida, depois: jogo.partida, quemTacou: antes.partida.vez }, CONFIG_WEB.transicao)
      : null;
    // Online a sala só começa o relógio da vez `margemOnlineS` depois da animação: a transição não come o tempo de ninguém.
    if (plano && sessao) plano = encurtarPlano(plano, CONFIG_WEB.transicao.margemOnlineS);
    ultimoPlano = plano;
    // Online, a tacada que acabou de tocar pode ser minha (o balão é do outro): a falta é minha, não dele.
    const foiMinha = sessao !== null && eraMeuTaco;
    if (consequencias.faltas.length > 0) {
      if (!foiMinha) rostoDoBalao.faltou(performance.now() / 1000);
      modeloDasMaos.reagir('falta');
    }
    // A tacada foi minha e a vez passou para o outro (falta ou bola que não caiu): o balão dele ri quando entrar em cena.
    if (sessao && foiMinha) {
      const eu = jogo.partida.jogadores[sessao.partida.meuIndice ?? -1];
      if (eu !== undefined && jogo.jogadorDaVez.equipe !== eu.equipe) provocacaoDoBalao.armar(consequencias.faltas.length > 0 ? 'falta' : 'erro', jogo.jogadorDaVez.equipe, performance.now() / 1000);
    }
    if (plano?.aviso) hud.avisoFalta.mostrar(plano.aviso, performance.now());
    if (!plano || !antes || plano.fases.length === 0) return concluirTacada(consequencias);
    const fichas = new Map<number, FichaDaBola>();
    for (const fase of plano.fases) {
      if (fase.tipo === 'voo') for (const item of fase.itens) fichas.set(item.bola, fichaDaBola(item.bola, jogo.partida.config));
    }
    const mesaAntes = antes.mesa;
    transicao.iniciar(
      {
        plano,
        fichas,
        destino: (bola) => {
          const alvo = jogo.mesa.bolas.find((b) => b.id === bola);
          return { x: alvo?.posicao.x ?? 0, z: alvo?.posicao.z ?? 0 };
        },
        existiaAntes: (bola) => mesaAntes.bolas.some((b) => b.id === bola && b.naMesa),
        aoFim: () => concluirTacada(consequencias),
      },
      performance.now(),
    );
  }

  /** A roda pulou quem perdia a vez (`antes` e `depois` são as partidas de cada lado da passagem da vez): o aviso curto diz quem. */
  function avisarVezPerdida(antes: EstadoPartida, depois: EstadoPartida): void {
    const frase = avisoDoPulo(depois, vezPerdida(antes, depois).pulados);
    if (frase !== '') hud.aviso.mostrar(frase, performance.now(), CONFIG_WEB.hud.vezPerdidaSegundos * 1000);
  }

  /** Fim da transição (ou tacada sem nada a mostrar): a cena e o placar passam a ser os de depois da tacada. */
  function concluirTacada(consequencias: Consequencias): void {
    sincronizarBolas(bolas.porId, jogo.mesa);
    if (treino !== null) return concluirTacadaDoTreino(consequencias);
    // Hot-seat: a partida que acabou entra no placar do mesmo PC antes de a tela mostrá-lo (online quem conta é a sala).
    if (!sessao && jogo.fase === 'fim') placarLocal.registrar(jogo.partida);
    mostrarPartida();
    hud.placar.mostrarTexto(consequencias.texto, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000, consequencias.faltas.length > 0);
    const antes = jogo.antesDaUltimaTacada;
    if (antes) avisarVezPerdida(antes.partida, jogo.partida);
    if (jogo.fase === 'fim') {
      entrada.soltarMouse();
      tacada.concluir();
      // Os balões entram antes da tela de fim; quem espera a tacada acabar só é liberado quando ela aparece.
      iniciarFimDaPartida(() => {
        mostrarFim(consequencias.texto);
        for (const resolver of aguardando.splice(0)) resolver();
      });
      return;
    }
    tacada.concluir();
    for (const resolver of aguardando.splice(0)) resolver();
  }

  /** As equipes da partida e se cada uma ganhou: o roteiro do fim, com os balões de todas. */
  function iniciarFimDaPartida(depois: () => void): void {
    const jogadores = jogo.partida.jogadores;
    const equipes = Math.min(Math.max(...jogadores.map((j) => j.equipe)) + 1, baloes.quantos);
    const ganhou = Array.from({ length: equipes }, (_, i) => jogo.partida.vencedor === i);
    aoAcabarOFim = depois;
    // Durante o roteiro o HUD de avisos fica quieto: o balão da ponta toca a pílula e o "Clique para jogar" não faz sentido.
    document.body.classList.add('fim-roteiro');
    trocarDonoDoBalao(null);
    lugaresDoFimDosBaloes = lugaresDoFim(equipes, semi.x, semi.z, CONFIG_WEB.baloes.fim.folgaDaMesa);
    fimDaPartida.iniciar(performance.now(), ganhou);
  }

  /** Para o fim da partida (partida nova, sala voltou à espera): balões somem, a câmera volta à de tacada e quem esperava é liberado. */
  function cancelarFimDaPartida(): void {
    const tinha = fimDaPartida.existe;
    fimDaPartida.cancelar();
    aoAcabarOFim = null;
    document.body.classList.remove('fim-roteiro');
    if (!tinha) return;
    rig.sairDoFim();
    baloes.reiniciar();
    baloes.esconderTodos();
    for (const resolver of aguardando.splice(0)) resolver();
  }

  /** Acaba o roteiro já e mostra a tela de fim. */
  function pularFimDaPartida(): void {
    if (!fimDaPartida.ativo(performance.now(), CONFIG_WEB.baloes.fim.duracaoS)) return;
    fimDaPartida.pular();
  }

  let ultimaGravacao: Gravacao | null = null;
  const aguardando: (() => void)[] = [];
  const player = new PlayerGravacao(
    new Map(bolas.porId.map((mesh, id) => [id, mesh])),
    {
      aoEvento(evento) {
        audio.aoEvento(evento);
        // O taco espirrou (miscue): o alerta sai do evento da gravação, então quem assiste online também o vê.
        if (ehEspirro(evento) && parametrosTocando) {
          hud.avisoEspirro.mostrar(textoDoEspirro(parametrosTocando, configFisica, CONFIG_WEB.hud.gizAlto), performance.now(), CONFIG_WEB.hud.espirroSegundos * 1000);
        }
      },
      aoFim() {
        if (sessao) sessao.partida.animacaoTerminou();
        else aposConclusao(jogo.concluir());
      },
    },
    { duracaoQuedaS: CONFIG_WEB.cena.duracaoQuedaS },
  );

  /** Toca a gravação e deixa o rosto do balão lê-la: o sorriso, o susto e o bravo vêm dos eventos dela. */
  function tocarGravacao(gravacao: Gravacao): void {
    // O balão só aparece na vez do outro, então a tacada que é minha é a de quem joga contra o dono dele; a do outro, a do dono.
    const quemTacou: QuemTacou = sessao !== null && eraMeuTaco ? 'contra' : 'dono';
    momentosDoRosto = momentosDaGravacao(gravacao, configFisica.mesa, CONFIG_WEB.baloes.rosto, quemTacou);
    momentosVistos = 0;
    modeloDasMaos.comecarJogada();
    rostoDoBalao.comecar(momentosDoRosto);
    cacapasDaGravacao.comecar(gravacao, configFisica.mesa, CONFIG_FISICA_PADRAO.bola.raio);
    player.tocar(gravacao);
  }

  /**
   * Partida nova no hot-seat: por padrão com a roda que as regras mandam depois da anterior e a mesma casa; `jogadores` e
   * `config` trocam (outro modo, outra modalidade).
   */
  function novaPartida(jogadores: readonly Jogador[] = jogadoresDaNovaPartida(jogo.partida), config: ConfigRegras = jogo.partida.config): void {
    jogo = comecarJogo(jogadores, config);
    provocacaoDoBalao.reiniciar();
    giz.reiniciar();
    mira.definir(0);
    reiniciarCena();
    relogioLocal.reiniciar(performance.now());
  }

  /** Hot-seat: o tempo da tacada acabou. A vez passa sem pena e a tacada armada, se havia, não vale. */
  function perderAVezLocal(): void {
    const quem = jogo.jogadorDaVez.nome;
    const partidaAntes = jogo.partida;
    entrada.cancelarTacada();
    jogo.passarAVez();
    relogioLocal.reiniciar(performance.now());
    previsao.invalidar();
    motivoDaTroca = 'tempo';
    mostrarPartida();
    hud.placar.mostrarTexto(`${quem} perdeu a vez`, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000);
    avisarVezPerdida(partidaAntes, jogo.partida);
  }

  /** `recuoDaBatida`: onde o taco estava ao soltar (força pela linha); 0 = a ponta já estava na bola. */
  function executarTacada(parametros: ParametrosTacada, recuoDaBatida = 0): void {
    if (!podeJogar()) {
      // A vez passou (ou a conexão caiu) com o taco armado: a tacada não vale.
      tacada.concluir();
      return;
    }
    let gravacao;
    try {
      gravacao = sessao ? sessao.partida.tacar(parametros) : jogo.tacar(parametros);
    } catch (erro) {
      tacada.concluir();
      const motivo = erro instanceof Error ? erro.message : String(erro);
      hud.placar.mostrarTexto(`Erro na tacada (a vez não mudou): ${motivo}`, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000, true);
      throw erro;
    }
    ultimaGravacao = gravacao;
    // Treino: a mesa de antes da tacada fica guardada para o "Refazer" (a partida e a mesa só mudam quando a tacada acaba de tocar).
    if (treino !== null) {
      treino.aoTacar(jogo.partida, jogo.mesa);
      atualizarTreino();
    }
    // Hot-seat: durante a animação o contador espera no tempo cheio (como o da sala) e só desce depois dela.
    if (!sessao) relogioLocal.reiniciar(performance.now());
    giz.consumir();
    hud.placar.mostrarTexto('', 0, 0);
    parametrosTocando = parametros;
    seguimento.iniciar(recuoDaBatida, parametros.velocidadeTaco);
    // Pela linha o taco ainda corre até a bola (a batida); as bolas só andam no impacto.
    if (seguimento.emBatida) gravacaoNaBatida = gravacao;
    else tocarGravacao(gravacao);
  }

  const entrada = ligarEntrada({
    canvas: renderer.domElement,
    mira,
    tacada,
    ponto,
    giz,
    camera: rig,
    podeJogar,
    aoTacar: (velocidadeTaco) =>
      executarTacada(
        {
          angulo: mira.angulo,
          velocidadeTaco,
          efeito: { lateral: ponto.lateral, vertical: ponto.vertical },
          elevacao: 0,
          giz: giz.nivel,
        },
        tacada.recuoDaBatida,
      ),
    aoMudarTravamento: (travado) => hud.telas.definirTravado(travado),
  });

  // ---------------------------------------------------------------- tela inicial e online

  // As regras da sala (lobby) e o que as regras do pacote sabem jogar: cada modalidade com o seu preset de fábrica.
  const disponivel = disponibilidadeDosModos(REGRAS_DO_PACOTE, PRESETS_DE_FABRICA);
  /** O giz do hot-seat: o que o lobby do mesmo PC escolheu (volta a valer ao sair de uma sala, que manda o dela). */
  let gizLocal: RegrasGiz = CONFIG_WEB.giz;
  /**
   * A última escolha de cada tela, do navegador. No mesmo PC, `?forca=` e `?linha=` valem por cima nesta visita (teste), sem
   * serem gravados.
   */
  function regrasLembradas(onde: OndeSeLembra): RegrasDaSala {
    const padrao = regrasPadrao(CONFIG_WEB.hud.relogioPadraoS);
    const lidas = lerRegrasLembradas(onde, padrao, armazenamentoLocal(), CATALOGO, disponivel);
    if (onde !== 'local') return lidas;
    return { ...lidas, linha: linhaDaUrl(busca) ?? lidas.linha, forca: controleDaUrl(busca) ?? lidas.forca };
  }
  // ---------------------------------------------------------------- missões do dia (L32)

  /** O último quadro de missões que o aparelho sabe: o da carteira (HTTP ou `missoes` da sala); `null` sem carteira lida. */
  function quadroDeMissoes(): MissoesDoDia | null {
    return carteira.estado()?.missoes ?? null;
  }
  /** A última vez que o lobby pediu a carteira por causa das missões (o HTTP da carteira tem balde por IP e por carteira). */
  let ultimaLeituraDeMissoes = Number.NEGATIVE_INFINITY;
  /** Voltou ao lobby ou o dia virou com ele aberto: põe a carteira em dia; o painel se redesenha quando ela mudar. */
  function lerMissoesDoLobby(): void {
    if (aguardandoOLink || aguardandoAConta) return;
    const agora = performance.now();
    if (agora - ultimaLeituraDeMissoes < CONFIG_WEB.hud.missoes.leituraMinimaS * 1000) return;
    ultimaLeituraDeMissoes = agora;
    void carteira.garantir();
  }
  /** Os avisos que chegaram com a tacada ainda tocando: entram quando as bolas param, nunca por cima do lance. */
  let avisosDeMissaoPendentes: AvisoDeMissao[] = [];
  const tacadaEmCurso = (): boolean =>
    tacada.fase === 'animando' || player.tocando || transicao.ativa || gravacaoNaBatida !== null || aoAcabarOFim !== null || (sessao?.partida.euTaco ?? false);
  function soltarAvisosDeMissao(agoraMs: number): void {
    if (avisosDeMissaoPendentes.length === 0 || tacadaEmCurso()) return;
    const avisos = avisosDeMissaoPendentes;
    avisosDeMissaoPendentes = [];
    hud.avisosDeMissao.mostrar(avisos, agoraMs);
    if (avisos.some((a) => a.tipo === 'cumprida')) audio.avisar('moedas');
  }
  /** A sala mandou o quadro novo: o painel e o aparelho ficam em dia (o saldo não: o `estado-sala` já o traz com o prêmio) e os avisos esperam as bolas. */
  function chegouMissoes(depois: MissoesDoDia, cumpridas: Parameters<typeof avisosDeMissao>[2]): void {
    const antes = quadroDeMissoes();
    carteira.adotarMissoes(depois);
    avisosDeMissaoPendentes.push(...avisosDeMissao(antes, depois, cumpridas));
    soltarAvisosDeMissao(performance.now());
  }

  const menu = criarMenu(document.body, {
    espacoDeAnuncio: () => anuncios.espaco('menu'),
    disponivel,
    apelidoInicial: armazem.apelido(),
    regrasLembradas,
    aoLembrar: (onde, regras) => lembrarRegras(onde, regras, armazenamentoLocal()),
    aoJogarLocal(regras) {
      const preset = presetDaModalidade(regras.modalidade);
      if (preset === null) return;
      // Outra modalidade ou outro número de jogadores, ou voltou do fim de uma partida: a escolha vale para uma partida nova. No
      // meio de uma (pelo botão Menu), com a mesma modalidade e o mesmo modo, ela continua. Vindo do treino, sempre uma nova.
      const vinhaDoTreino = treino !== null;
      encerrarTreino();
      const decisao = vinhaDoTreino ? 'do-modo' : decidirJogarLocal({ jogadores: jogo.partida.jogadores.length, modalidade: jogo.partida.config.modalidade, acabou: jogo.fase === 'fim' }, regras);
      if (decisao === 'do-modo') novaPartida(jogadoresDoHotSeat(regras.modo), preset.regras);
      else if (decisao === 'proxima') novaPartida();
      modo = 'local';
      hud.ajudaMissoes.atualizar();
      definirLinhaLocal(regras.linha);
      definirControleLocal(regras.forca);
      gizLocal = sanearRegrasGiz(regras.giz);
      aplicarRegrasDaMesa({ forca: null, giz: gizLocal });
      relogioLocal.definirTempo(regras.tempoS, performance.now());
      menu.esconder();
      hud.mostrarBotaoMenu(true);
      hud.telas.definirVez(null);
    },
    aoCriar({ nome, regras }) {
      const preset = presetDaModalidade(regras.modalidade);
      if (preset === null) return;
      abrirSala({
        tipo: 'criar',
        nome,
        modo: regras.modo,
        modalidade: regras.modalidade,
        preset: preset.nome,
        regras: preset.regras,
        relogio: { tempoS: regras.tempoS },
        linha: linhaParaSala(regras.linha),
        giz: regras.giz,
        forca: regras.forca,
        aposta: regras.aposta,
      });
    },
    aoEntrar: ({ nome, codigo }) => abrirSala({ tipo: 'entrar', nome, codigo }),
    aoTreino: iniciarTreino,
    aoPerfil: () => perfil.abrir(),
    aoEntrarNaConta: () => dialogosDaConta.abrirEntrar(),
    aoAbrirLoja: () => loja.abrir(),
    carteira: () => carteira.estado(),
    aoAbrirCreditos: () => painelCreditos.alternar(),
    tocarSom: (som) => audio.tocarDoMenu(som),
    missoes: (agoraMs) => missoesNaTela(quadroDeMissoes(), agoraMs),
    aoPrecisarDeMissoes: lerMissoesDoLobby,
    avisoDaCarteira: () => {
      const aviso = carteira.aviso();
      carteira.dispensarAviso();
      return aviso;
    },
    aoEscolherLugar: (lugar) => sessao?.partida.escolherLugar(lugar),
    aoExpulsar: (lugar) => sessao?.partida.expulsar(lugar),
    aoConfigurarSala: (mudanca) => sessao?.partida.configurarSala(mudancaParaASala(mudanca)),
    aoIniciar: () => sessao?.partida.iniciar(),
    aoSair: () => sairDaSala(),
    aoConfiguracoes: () => painelConfig.alternar(),
    placarDoMesmoPc: () => placarParaMostrar(placarLocal.noFio(), null).atual,
    aoZerarPlacarDoMesmoPc: () => {
      placarLocal.zerar();
      mostrarPlacarDaSala();
    },
  });

  /** O que o anfitrião mudou na espera, no formato do `configurar-sala`: só os campos que mudaram. */
  function mudancaParaASala(mudanca: MudancaDeRegras): Parameters<NonNullable<typeof sessao>['partida']['configurarSala']>[0] {
    return {
      ...(mudanca.modalidade === undefined ? {} : { modalidade: mudanca.modalidade }),
      ...(mudanca.modo === undefined ? {} : { modo: mudanca.modo }),
      ...(mudanca.tempoS === undefined ? {} : { relogio: { tempoS: mudanca.tempoS } }),
      ...(mudanca.linha === undefined ? {} : { linha: linhaParaSala(mudanca.linha) }),
      ...(mudanca.giz === undefined ? {} : { giz: mudanca.giz }),
      ...(mudanca.forca === undefined ? {} : { forca: mudanca.forca }),
      ...(mudanca.aposta === undefined ? {} : { aposta: mudanca.aposta }),
    };
  }

  const loja = criarLoja(document.body, carteira);
  // L43: o perfil (apelido, taco, skins, estatísticas e "Levar minha carteira") e a pergunta de trocar de carteira pelo link.
  const perfil = criarPerfil(document.body, carteira, {
    apelido: () => menu.apelidoAtual(),
    base: () => baseDoLink(window.location),
    conta,
    podeMudarDeConta: () => sessao === null,
    aoCriarConta: () => dialogosDaConta.abrirCriar(),
    aoEntrarNaConta: () => dialogosDaConta.abrirEntrar(),
    aoSair: async () => {
      const r = await conta.sair();
      if (!r.ok) return r;
      perfil.fechar();
      menu.mostrarInicio(MENSAGEM_VOCE_SAIU);
      return null;
    },
    aoExcluir: async (senha) => {
      const r = await conta.excluir(senha);
      if (!r.ok) return r;
      perfil.fechar();
      menu.mostrarInicio('Sua conta foi excluída.');
      return null;
    },
    aoAbrirMeuBalao: () => {
      perfil.fechar();
      meuBalao.abrir();
    },
  });
  // L48: o editor "Meu balão" (prévia 3D num renderizador à parte, com o mesmo balão do artista e os chapéus sob demanda).
  const meuBalao = criarMeuBalao(document.body, carteira, {
    previa: () =>
      baseDoBalao === null
        ? null
        : criarPreviaDoBalao({ cfg: CONFIG_WEB.baloes, base: baseDoBalao, nivel: 'alto', chapeus, cor: COR_DA_EQUIPE[0]!, largura: 300, altura: 360 }),
    cores: COR_DA_EQUIPE,
    aoVerNaLoja: (item) => loja.abrir(item),
    aoVoltar: () => perfil.abrir(),
  });
  const dialogosDaConta = criarDialogosDaConta(document.body, conta, carteira, {
    podeMudar: () => sessao === null,
    aoJogarComoConvidado: () => void carteira.comecarDoZero(),
  });
  // L62: a conta manda no nome da mesa e na carteira. Entrou ou criou: a carteira passa a ser a da conta (sessão no cookie). Virou convidado
  // (sair, excluir, sessão vencida no meio do uso): carteira nova e vazia; o código velho não abre mais nada.
  conta.aoMudar((estado) => {
    if (estado.tipo === 'conta') {
      const entrou = !carteira.modoConta();
      armazem.definirContaAtiva(true);
      menu.definirNomeDaConta(estado.nome);
      carteira.definirModoConta(true);
      if (entrou) void carteira.garantir();
    } else {
      armazem.definirContaAtiva(false);
      menu.definirNomeDaConta(null);
      if (carteira.modoConta()) void carteira.comecarDoZero();
    }
    menu.atualizarBarra();
  });
  const perguntaDeCarteira = criarPerguntaDeCarteira(document.body);
  /** Um link com `#carteira=`: confere na sala, pergunta e só troca se a pessoa confirmar. Em sala aberta não troca (o lugar e a aposta são da carteira de agora). */
  function receberCarteira(hash: string): Promise<unknown> {
    const leitura = lerFragmentoDaCarteira(hash);
    if (carteira.modoConta() && leitura.tipo !== 'nenhum') {
      limparEnderecoDaCarteira(leitura.resto);
      return perguntaDeCarteira.avisar(AVISO_LINK_COM_CONTA);
    }
    if (sessao !== null && leitura.tipo !== 'nenhum') {
      limparEnderecoDaCarteira(leitura.resto);
      return perguntaDeCarteira.avisar(AVISO_LINK_EM_SALA);
    }
    return receberCarteiraDoLink({ hash, limparEndereco: limparEnderecoDaCarteira, carteira, tela: perguntaDeCarteira });
  }
  /** Colar o link na aba que já está aberta só muda o fragmento (a página não recarrega). */
  const aoMudarOHash = (): void => void receberCarteira(window.location.hash);
  window.addEventListener('hashchange', aoMudarOHash);
  // A carteira se põe em dia já na abertura: quando a criação (ou a troca por uma nova) acabar, o recado aparece na tela de agora.
  carteira.aoMudar(() => {
    menu.atualizarMissoes();
    menu.atualizarBarra();
    hud.ajudaMissoes.atualizar();
    const aviso = carteira.aviso();
    if (aviso !== null && menu.visivel && !loja.aberta && !perfil.aberto && !meuBalao.aberto) {
      menu.mostrarAviso(aviso);
      carteira.dispensarAviso();
    }
  });
  // L62: quem sou eu vem antes da carteira (com conta a carteira é a dela); sem resposta o jogo segue como convidado.
  void conta.eu().then(async (r) => {
    aguardandoAConta = false;
    if (aguardandoOLink) {
      await receberCarteira(hashDaAbertura).finally(() => {
        aguardandoOLink = false;
      });
      lerMissoesDoLobby();
      return;
    }
    const lida = await carteira.garantir();
    // convidado de verdade com a carteira em dia: o código ainda vale, então não há sessão vencida a lembrar
    if (r.ok && lida.ok && conta.estado().tipo === 'convidado') conta.esquecerSinal();
  });

  function irParaMenu(): void {
    // Do treino sai-se com a mesa arrumada como está; o botão Treino do menu continua dali.
    sairDoModoDaMao();
    hud.definirTreino(false);
    modo = 'menu';
    cancelarFimDaPartida();
    entrada.soltarMouse();
    hud.mostrarBotaoMenu(false);
    menu.mostrarInicio();
  }

  /** Hot-seat, fim da partida: o botão leva à tela de escolha, com o tempo e a linha de antes marcados (jogar começa a partida nova). */
  function voltarDoFimLocal(): void {
    cancelarFimDaPartida();
    entrada.soltarMouse();
    modo = 'menu';
    hud.mostrarBotaoMenu(false);
    hud.telas.esconderFim();
    menu.mostrarLocal();
  }

  async function copiarConvite(): Promise<boolean> {
    const codigo = sessao?.cliente.codigo;
    if (!codigo) return false;
    try {
      await navigator.clipboard.writeText(linkDoConvite(window.location.origin, codigo));
      return true;
    } catch {
      return false;
    }
  }

  /** Sem carteira ainda (a primeira visita), espera ela nascer: o código vai junto no `criar-sala`/`entrar`; passado o prazo, entra sem. */
  function abrirSala(pedido: PedidoDeEntrada): void {
    if (carteira.codigo() !== undefined) return abrirSalaAgora(pedido);
    menu.mostrarConectando('Preparando sua carteira…');
    void carteira.garantir().then(() => abrirSalaAgora(pedido));
  }

  function abrirSalaAgora(pedido: PedidoDeEntrada): void {
    encerrarTreino();
    sessao?.sair();
    abaViva?.liberar();
    abaViva = manterViva(typeof navigator === 'undefined' ? undefined : navigator.locks);
    ultimoPedido = pedido;
    modo = 'online';
    hud.ajudaMissoes.atualizar();
    hud.mostrarBotaoMenu(false);
    hud.telas.definirVez(null);
    menu.mostrarConectando(pedido.tipo === 'criar' ? 'Criando a sala…' : 'Entrando na sala…');
    sessao = criarSessao();
    sincronizarFisica();
    faixaDe.estado = null;
    sessao.abrir(pedido);
  }

  /**
   * Volta ao menu e ao hot-seat limpo; `aviso` diz por que a sala acabou (recusa, sala fechada...). `expulso`: o anfitrião
   * tirou esta pessoa; a tela é a da remoção, com "Entrar de novo" pelo mesmo código.
   */
  function sairDaSala(aviso?: string, expulso?: { readonly codigo: string; readonly nome: string }): void {
    const antiga = sessao;
    sessao = null;
    // Fora da sala volta a física local (a padrão, ou a do painel F1 no mesmo PC).
    sincronizarFisica();
    avisosDeMissaoPendentes = [];
    hud.avisosDeMissao.limpar();
    abaViva?.liberar();
    abaViva = null;
    antiga?.sair();
    window.history.replaceState(null, '', `${window.location.pathname}${semSalaNaUrl(window.location.search)}${window.location.hash}`);
    hud.sala.mostrar(null);
    hud.emojis.mostrar(false);
    hud.telas.definirVez(null);
    hud.mostrarBotaoMenu(false);
    jogo = comecarJogo(JOGADORES_HOT_SEAT);
    provocacaoDoBalao.reiniciar();
    trocarDonoDoBalao(null);
    giz.reiniciar();
    // Fora da sala valem de novo o controle e o giz do mesmo PC.
    aplicarRegrasDaMesa({ forca: null, giz: gizLocal });
    mira.definir(0);
    reiniciarCena();
    entrada.soltarMouse();
    modo = 'menu';
    const pedido = ultimoPedido;
    if (expulso) menu.mostrarExpulso(expulso.codigo, expulso.nome);
    else if (aviso && pedido?.tipo === 'entrar') menu.mostrarEntrar(pedido.codigo, aviso);
    else menu.mostrarInicio(aviso);
  }

  /**
   * A sala é de outra versão do protocolo: só recarregar a página resolve. A sessão já está fechada e fica sem `sair()`
   * (ele apagaria o token) e o `?sala=` fica na URL: depois de recarregar o navegador volta ao mesmo lugar.
   */
  function pedirRecarregar(texto: string): void {
    sessao = null;
    sincronizarFisica();
    abaViva?.liberar();
    abaViva = null;
    hud.sala.mostrar(null);
    hud.emojis.mostrar(false);
    hud.telas.definirVez(null);
    hud.mostrarBotaoMenu(false);
    entrada.soltarMouse();
    modo = 'menu';
    menu.mostrarRecarregar(texto);
  }

  function tocarTacadaDeOutro(t: TacadaParaAnimar): void {
    // A transição da tacada anterior ainda rodava (cliente mais lento): pula para a próxima tacada não esperar.
    transicao.pular();
    const { miraRemota } = sessao!;
    // Pela linha de força o taco de quem tacou corre até a bola antes das bolas andarem, como na tela dele.
    const recuoVisto = tacada.controle === 'linha' && miraRemota.recuo > CONFIG_WEB.tacada.recuoInicial ? miraRemota.recuo : 0;
    miraRemota.saltarPara({ angulo: t.parametros.angulo, lateral: t.parametros.efeito.lateral, vertical: t.parametros.efeito.vertical, recuo: 0 });
    tacada.iniciarAnimacao();
    ultimaGravacao = t.gravacao;
    hud.placar.mostrarTexto('', 0, 0);
    parametrosTocando = t.parametros;
    seguimento.iniciar(recuoVisto, t.parametros.velocidadeTaco);
    if (seguimento.emBatida) gravacaoNaBatida = t.gravacao;
    else tocarGravacao(t.gravacao);
  }

  let mirasRecebidas = 0;
  /** "Fulano perdeu a vez", até o retrato da vez nova: o retrato limpa a frase da jogada, então ela é mostrada de novo depois dele. */
  let avisoDaVezPerdida = '';
  const mostrarAvisoDaVez = (): void => hud.placar.mostrarTexto(avisoDaVezPerdida, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000);
  /** O que o aviso da vez mostra agora: só se redesenha (e aloca) quando uma destas entradas muda. */
  const faixaDe = { estado: null as unknown, lugar: null as number | null, aguardando: false, minhaVez: false, conectado: false };
  let proximoChatMs = 0;

  /** O aviso de quem joga agora: na minha vez só vale se já dá para tacar (a animação anterior acabou). */
  function faixaDeAgora(): FaixaDeVez {
    const s = sessao!.partida;
    // Sem conexão quem avisa é o banner de cima (com o "Tentar agora"); o aviso da vez fica quieto.
    if (!s.conectado) return { texto: '', tipo: 'nenhuma' };
    const faixa = faixaDeVez(s.estadoSala, s.meuLugar, s.aguardandoSala);
    return faixa.tipo === 'minha' && !s.minhaVez ? { texto: 'Aguarde a tacada acabar', tipo: 'outro' } : faixa;
  }

  function criarSessao(): SessaoOnline {
    return new SessaoOnline({
      url: urlDoSocket(window.location),
      criarSocket: criarSocketReal,
      armazem,
      agendar: (fn, ms) => {
        const id = window.setTimeout(fn, ms);
        return () => window.clearTimeout(id);
      },
      agora: () => Date.now(),
      sortear: () => Math.random(),
      jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada, fisica: configFisica },
      fisica: () => configFisica,
      rng: criarRng(semente++),
      carteira: () => carteira.codigo(),
      ouvintes: {
        aoConexao(estado) {
          hud.sala.definirConexao(estado);
          if (estado.fase === 'encerrada') {
            const codigoDaSala = sessao?.cliente.codigo ?? (ultimoPedido?.tipo === 'entrar' ? ultimoPedido.codigo : null);
            if (estado.recarregar) pedirRecarregar(estado.motivo);
            else if (estado.expulso && codigoDaSala !== null) sairDaSala(undefined, { codigo: codigoDaSala, nome: ultimoPedido?.nome ?? '' });
            else sairDaSala(estado.motivo);
          } else if (menu.visivel && estado.fase === 'reconectando') {
            menu.mostrarAviso('Sem conexão com a sala. Tentando voltar…');
          }
        },
        aoBoasVindas(m) {
          window.history.replaceState(null, '', `${window.location.pathname}${comSalaNaUrl(window.location.search, m.codigo)}${window.location.hash}`);
          hud.sala.mostrar(m.codigo);
          hud.emojis.mostrar(true);
        },
        aoEstadoSala(estado) {
          const { partida } = sessao!;
          // A física da sala vale para a próxima tacada e para a previsão (sem `seq`: a que o `estado-sala` traz na hora); o F1 se redesenha.
          sincronizarFisica();
          painelDev?.atualizar();
          // A sala manda o controle de força e o giz, iguais para todos (um `estado-sala` sem eles, só de teste, deixa o local).
          aplicarRegrasDaMesa({ forca: estado.forca ?? null, ...(estado.giz === undefined ? {} : { giz: sanearRegrasGiz(estado.giz) }) });
          if (estado.fase === 'espera') {
            // Vindo do fim de uma partida (o anfitrião mandou voltar à sala): some a tela de fim e o que sobrou da última jogada.
            cancelarFimDaPartida();
            transicao.cancelar();
            hud.avisoFalta.esconder();
            hud.anuncio.esconder();
            hud.telas.esconderFim();
            entrada.soltarMouse();
            menu.mostrarEspera(modeloDaSala(estado, partida.meuLugar, partida.souAnfitriao), linkDoConvite(window.location.origin, estado.codigo));
          }
          mostrarPartida();
        },
        aoRetrato(motivo, jogoDaSala, partidaAntes) {
          jogo = jogoDaSala;
          menu.esconder();
          const { partida } = sessao!;
          if (motivo === 'inicio' || motivo === 'nova-partida') {
            giz.reiniciar();
            provocacaoDoBalao.reiniciar();
          }
          giz.definirVez(partida.meuIndice ?? 0);
          reiniciarCena();
          if (jogo.fase === 'fim') mostrarFim(jogo.ultimasConsequencias?.texto ?? '');
          // O retrato apaga a frase da jogada; a da vez que passou tem de ficar (ela veio antes dele).
          if (motivo === 'vez-passou' && avisoDaVezPerdida !== '') mostrarAvisoDaVez();
          // O tempo (ou a queda) de alguém passou a vez; a sala pode ter pulado quem perdia a próxima.
          if (motivo === 'vez-passou' && partidaAntes) avisarVezPerdida(partidaAntes, jogoDaSala.partida);
          avisoDaVezPerdida = '';
        },
        aoTempoEsgotado(aviso) {
          const { partida } = sessao!;
          avisoDaVezPerdida = avisoDeTempoEsgotado(aviso, partida.estadoSala, partida.meuLugar);
          mostrarAvisoDaVez();
          // Quem perdeu ouve a batida do tempo, quem recebe a vez o sino, os outros o tique (o retrato que vem depois não repete o som).
          audio.avisar(somDoTempoEsgotado(aviso, partida.meuLugar));
          // A vez já não é minha: a tacada que eu estava armando não vale.
          if (aviso.lugar === partida.meuLugar) entrada.cancelarTacada();
        },
        // A aposta chega antes do `estado-sala` do fim: se o roteiro ainda toca, a tela a lê ao abrir; se já abriu, ganha o dinheiro na hora.
        aoApostaPaga: () => {
          if (jogo.fase === 'fim' && aoAcabarOFim === null) hud.telas.definirAposta(apostaDoFim());
        },
        // O prêmio já está no saldo do `estado-sala`: aqui só andam o painel e os avisos, que esperam as bolas pararem.
        aoMissoes: (m) => chegouMissoes(m.missoes, m.cumpridas),
        // O anfitrião mexeu na física no meio da partida (ou voltou ao padrão): vale da próxima tacada, e todos ficam sabendo sem alarde.
        aoFisicaAlterada: (m) => {
          sincronizarFisica();
          painelDev?.atualizar();
          if (!menu.visivel) hud.aviso.mostrar(avisoDeFisicaAlterada(m), performance.now(), CONFIG_WEB.hud.fisicaAlteradaSegundos * 1000);
        },
        aoAnimar: tocarTacadaDeOutro,
        aoConcluir: (consequencias) => aposConclusao(consequencias),
        aoMira: () => void mirasRecebidas++,
        // O emoji já está na pilha da sessão: desenha na hora, para a animação começar quando ele chega.
        aoEmoji: (m) => {
          hud.emojis.atualizar(sessao!.emojis, Date.now(), sessao!.partida.estadoSala?.modo ?? '1x1');
          // O emoji de quem joga, com o balão dele na tela, também sobe do balão.
          if (donoDoBalao && escalaDoBalao > 0.01 && jogadorEhDoLugar(donoDoBalao.id, m.lugar)) emojisDoBalao.chegar(m.emoji, m.lugar, performance.now());
        },
        aoErro(erro) {
          if (erro.codigo === 'mensagem-invalida' && performance.now() - enviouDiagnosticoEm < 5000) {
            salaSemDiagnostico = true;
            return;
          }
          // A sala recusou a física que o anfitrião pediu (aposta valendo, tacada no ar): o texto dela vai para o painel F1, com o que ele tinha.
          if (erro.codigo === 'fase-errada' && performance.now() - pedidoDeFisicaEm < CONFIG_WEB.hud.respostaDaFisicaS * 1000) {
            painelDev?.atualizar();
            painelDev?.dizer(erro.mensagem);
          }
          if (menu.visivel) menu.mostrarAviso(erro.mensagem);
          else hud.placar.mostrarTexto(erro.mensagem, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000, true);
        },
      },
    });
  }

  // ---------------------------------------------------------------- física pelo anfitrião (L42)

  /** O pedido de física à sala mais recente (ms): uma recusa que chega logo depois dele é a resposta a ele. */
  let pedidoDeFisicaEm = Number.NEGATIVE_INFINITY;

  /**
   * Leva a física que vale agora ao jogo e à previsão: a local (a padrão, ou a do painel F1 no mesmo PC e no treino) e, numa sala, os
   * 8 valores dela por cima. Quem simula a própria tacada e a previsão usa os da hora, sem `seq`; ao sair da sala volta a local.
   * Só mexe quando algum dos 8 valores mudou.
   */
  function sincronizarFisica(): void {
    const proxima = configDeFisica(fisicaLocal, sessao?.partida.fisicaDaSala ?? null);
    if (proxima === configFisica || CHAVES_DA_FISICA_DA_SALA.every((chave) => proxima[chave] === configFisica[chave])) return;
    configFisica = proxima;
    jogo.usarFisica(proxima);
    previsao.invalidar();
  }

  // ---------------------------------------------------------------- modo treino (L42)

  const canvas = renderer.domElement;
  const raioDaBolaNoPano = CONFIG_FISICA_PADRAO.bola.raio;
  const pontoDoMouse = { x: 0, z: 0 };
  /** O treino guarda o anel vermelho do "aí não cabe" na bola que a mão segura. */
  const aneisDoArraste = new AneisDeBolas({ raioBola: raioDaBolaNoPano, cor: 0xff3b30, opacidadeMax: 0.95, dentro: 1.1, fora: 1.75 });
  cena.add(aneisDoArraste.grupo);
  let aneisDoArrasteNaCena = false;

  /** Dá para mexer na mesa do treino agora: no treino, sem menu, e sem tacada nas bolas. */
  const podeMexerNaMesa = (): boolean => treino !== null && modo === 'local' && !menu.visivel && !tacadaEmCurso() && jogo.fase !== 'tocando';

  const avisoDoTreino = (texto: string): void => hud.aviso.mostrar(texto, performance.now(), CONFIG_WEB.hud.treinoAvisoSegundos * 1000);

  /** Redesenha o cartão, os botões e a bandeja do HUD do treino com o que vale agora (só quando algo muda, nunca por quadro). */
  function atualizarTreino(): void {
    const t = treino;
    if (t === null) return;
    const mesaVista = editor?.mesa ?? jogo.mesa;
    const cenario = CENARIOS_DE_TREINO.find((c) => c.id === t.cenario) ?? null;
    const mesaLimpa = jogo.fase === 'fim' && editor === null;
    hud.treino.atualizar(
      hudDoTreino({
        bolasNaMesa: numeradasNaMesa(mesaVista).length,
        tacadas: t.tacadas,
        modo: t.modo,
        cenario: cenario === null ? null : { nome: cenario.nome, descricao: cenario.descricao },
        mesaLimpa,
        podeRefazer: t.podeRefazer,
        bandeja: editor?.bandeja ?? [],
      }),
    );
    // Com a mão na mesa, ou a mesa limpa, não há tacada a dar: o "Clique para jogar" sairia errado.
    document.body.classList.toggle('treino-sem-tacada', t.modo !== 'mirar' || mesaLimpa);
  }

  /** A câmera volta à vista de antes de a mão entrar na mesa, e o cursor ao de sempre. */
  function restaurarVistaDaMao(): void {
    if (vistaAntesDaMao !== null && rig.vista !== 'fim') rig.vista = vistaAntesDaMao;
    vistaAntesDaMao = null;
    canvas.style.cursor = '';
  }

  /**
   * Mesa nova do treino: o triângulo (`cenario` nulo) ou um cenário pronto (as bolas dele, e só elas, nas regras e na mesa). Zera as
   * tacadas e as fotos do "Refazer". O treino não confere missão nenhuma: o cenário só arma a mesa.
   */
  function armarTreino(cenario: CenarioDeTreino | null): void {
    editor?.cancelar();
    editor = null;
    restaurarVistaDaMao();
    const sessaoDoTreino = treino ?? new SessaoDeTreino();
    treino = sessaoDoTreino;
    jogo = comecarJogo([JOGADOR_DO_TREINO], PRESET_TREINO.regras);
    if (cenario !== null) {
      jogo.adotar(
        sincronizarMesa(
          jogo.partida,
          cenario.bolas.map((b) => b.id),
        ),
        mesaDoCenario(cenario, configFisica),
      );
    }
    sessaoDoTreino.recomecar(cenario?.id ?? null);
    giz.reiniciar();
    mira.definir(0);
    reiniciarCena();
    atualizarTreino();
  }

  /** O botão Treino do menu: continua o treino de antes (se há) ou começa um com o triângulo. */
  function iniciarTreino(): void {
    if (treino === null) armarTreino(null);
    modo = 'local';
    sincronizarFisica();
    definirLinhaLocal(linhaDaUrl(busca) ?? LINHA_DESLIGADA);
    aplicarRegrasDaMesa({ forca: null, giz: gizLocal });
    relogioLocal.definirTempo(null, performance.now());
    hud.ajudaMissoes.atualizar();
    menu.esconder();
    hud.mostrarBotaoMenu(true);
    hud.telas.definirVez(null);
    hud.definirTreino(true);
    atualizarTreino();
  }

  /** Sai do treino de vez (outro modo vai começar): a mão larga a mesa e o HUD volta ao de sempre. */
  function encerrarTreino(): void {
    if (treino === null) return;
    editor?.cancelar();
    editor = null;
    restaurarVistaDaMao();
    treino = null;
    document.body.classList.remove('treino-sem-tacada');
    hud.definirTreino(false);
  }

  /** A mão entra na mesa: `branca` arrasta só a bola branca (bola na mão); `arrumar` arrasta qualquer bola, tira e devolve. */
  function entrarNaMao(quem: 'branca' | 'arrumar', depoisDaTacada = false): void {
    const t = treino;
    if (t === null || t.modo === quem) return;
    if (!depoisDaTacada && !podeMexerNaMesa()) return;
    if (t.modo !== 'mirar') sairDoModoDaMao();
    entrada.cancelarTacada();
    entrada.soltarMouse();
    hud.treino.definirCenarios(false);
    editor = new EditorDaMesa(jogo.mesa, bolasDaCasa(jogo.partida.config), configFisica);
    t.definirModo(quem);
    // A vista de cima mostra a mesa inteira; ao sair a câmera volta à que estava.
    if (vistaAntesDaMao === null && rig.vista !== 'fim' && rig.vista !== 'menu') vistaAntesDaMao = rig.vista;
    rig.vista = 'cima';
    canvas.style.cursor = 'grab';
    previsao.invalidar();
    sincronizarBolas(bolas.porId, editor.mesaDesenhada());
    atualizarTreino();
  }

  /**
   * A mão sai da mesa: o que foi arrumado vale. A bola na mão só move a branca (`jogo.adotar`); arrumar também diz às regras quais
   * numeradas ficaram na mesa (`sincronizarMesa`).
   */
  function sairDoModoDaMao(): void {
    const t = treino;
    if (t === null || t.modo === 'mirar') return;
    const ed = editor;
    editor = null;
    if (ed !== null) {
      ed.cancelar();
      if (ed.mesa !== jogo.mesa) {
        let partida = jogo.partida;
        if (t.modo === 'arrumar') {
          partida = sincronizarMesa(partida, numeradasNaMesa(ed.mesa));
          t.arrumouAMao();
        }
        jogo.adotar(partida, ed.mesa);
      }
    }
    t.definirModo('mirar');
    restaurarVistaDaMao();
    reiniciarCena();
    atualizarTreino();
  }

  /** Volta à mesa de antes da última tacada. */
  function refazerTacada(): void {
    const t = treino;
    if (t === null || !podeMexerNaMesa()) return;
    sairDoModoDaMao();
    const foto = t.refazer();
    if (foto === null) return avisoDoTreino('Nenhuma tacada para refazer.');
    jogo.adotar(foto.partida, foto.mesa);
    reiniciarCena();
    atualizarTreino();
  }

  function novoTriangulo(): void {
    if (podeMexerNaMesa()) armarTreino(null);
  }

  function armarCenario(cenario: CenarioDeTreino): void {
    if (podeMexerNaMesa()) armarTreino(cenario);
  }

  /** Clicou numa ficha da bandeja: a bola volta à mesa, no ponto livre mais perto do meio. */
  function devolverBolaDaBandeja(bola: number): void {
    if (editor === null || !editor.devolver(bola)) return;
    sincronizarBolas(bolas.porId, editor.mesaDesenhada());
    atualizarTreino();
  }

  /** Soltou o botão: a bola da mão fica onde cabe; onde não cabe, volta de onde saiu. A bola na mão que coube acaba o modo. */
  function soltarBolaDaMao(): void {
    const t = treino;
    const ed = editor;
    if (t === null || ed === null) return;
    canvas.style.cursor = 'grab';
    const resultado = ed.soltar();
    if (resultado === null) return;
    if (!resultado.colocada) avisoDoTreino('Aí não cabe: a bola encostaria em outra, na tabela ou na caçapa.');
    else if (t.modo === 'branca') return sairDoModoDaMao();
    atualizarTreino();
  }

  const arraste = ligarArraste({
    canvas,
    ativo: () => treino !== null && editor !== null && treino.modo !== 'mirar' && modo === 'local' && !menu.visivel,
    pontoNaMesa: (px, py) =>
      pontoNaMesa(camera, px, py, canvas.clientWidth, canvas.clientHeight, raioDaBolaNoPano, pontoDoMouse) ? { x: pontoDoMouse.x, z: pontoDoMouse.z } : null,
    aoPegar: (ponto: Ponto2) => {
      if (treino === null || editor === null) return;
      if (editor.pegar(ponto, treino.modo === 'branca' ? 'branca' : 'todas') !== null) canvas.style.cursor = 'grabbing';
    },
    aoMover: (ponto: Ponto2, segurando: boolean) => {
      if (segurando) editor?.mover(ponto);
    },
    aoSoltar: soltarBolaDaMao,
  });

  /** As teclas do treino (P bola na mão, E arrumar, R refazer, N novo triângulo, T cenários, X tira a bola sob o mouse, Esc sai do modo). */
  const aoTeclaDoTreino = (e: KeyboardEvent): void => {
    const t = treino;
    if (t === null || modo !== 'local' || menu.visivel || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (teclaEmCampoDeTexto(e.target) || painelConfig.aberto || painelCreditos.aberto || loja.aberta || painelDev?.aberto === true) return;
    if (e.code === 'Escape' && hud.treino.cenariosAbertos) {
      hud.treino.definirCenarios(false);
      return;
    }
    const acao = acaoDaTecla(e.code, t.modo);
    if (acao === null) return;
    e.preventDefault();
    switch (acao) {
      case 'bola-na-mao':
        return entrarNaMao('branca');
      case 'arrumar':
        return entrarNaMao('arrumar');
      case 'refazer':
        return refazerTacada();
      case 'novo-triangulo':
        return novoTriangulo();
      case 'cenarios':
        if (podeMexerNaMesa()) hud.treino.definirCenarios(!hud.treino.cenariosAbertos);
        return;
      case 'sair-do-modo':
        return sairDoModoDaMao();
      case 'tirar-bola': {
        const ponto = arraste.ultimoPonto;
        const tirada = ponto === null || editor === null ? null : editor.tirarSob(ponto);
        if (tirada === null) return avisoDoTreino('Ponha o mouse sobre a bola e aperte X para tirá-la.');
        sincronizarBolas(bolas.porId, editor!.mesaDesenhada());
        return atualizarTreino();
      }
    }
  };
  window.addEventListener('keydown', aoTeclaDoTreino);

  /** Treino, a tacada acabou de valer: sem placar nem transição; o texto das regras, e a branca que caiu volta à mão. */
  function concluirTacadaDoTreino(consequencias: Consequencias): void {
    mostrarPartida();
    hud.placar.mostrarTexto(consequencias.texto, performance.now(), CONFIG_WEB.hud.textoSegundos * 1000);
    tacada.concluir();
    if (jogo.fase === 'fim') entrada.soltarMouse();
    for (const resolver of aguardando.splice(0)) resolver();
    atualizarTreino();
    if (consequencias.brancaNaMao === true && jogo.fase !== 'fim') entrarNaMao('branca', true);
  }

  /** Quadro a quadro com a mão na mesa: a mesa que se vê é a do editor (com a bola da mão no cursor); o anel vermelho diz "aí não cabe". */
  function desenharEditor(agoraMs: number): void {
    if (editor === null) {
      if (aneisDoArrasteNaCena) {
        aneisDoArraste.esconder();
        aneisDoArrasteNaCena = false;
      }
      return;
    }
    sincronizarBolas(bolas.porId, editor.mesaDesenhada());
    const emMao = editor.arraste;
    if (emMao !== null && !emMao.valido) {
      const pulso = Math.sin((agoraMs / 1000) * 2 * Math.PI * 2.5);
      aneisDoArraste.mostrar([emMao.id], bolas.porId, 1, 1 + 0.08 * pulso);
      aneisDoArrasteNaCena = true;
    } else if (aneisDoArrasteNaCena) {
      aneisDoArraste.esconder();
      aneisDoArrasteNaCena = false;
    }
  }

  // Um clique em qualquer lugar pula a transição da falta; o clique na mesa só pula (não arma a tacada).
  const pularTransicao = (e: PointerEvent): void => {
    if (!transicao.ativa) return;
    transicao.pular();
    if (e.target === renderer.domElement) e.stopPropagation();
  };
  window.addEventListener('pointerdown', pularTransicao, true);

  // A rede voltou, a aba voltou a aparecer ou descongelou (`resume`/`pageshow`): reconecta já, sem esperar o próximo ping.
  const aoVoltarARede = (): void => sessao?.cliente.retomar();
  const aoVoltarAAba = (): void => {
    if (!document.hidden) aoVoltarARede();
  };
  window.addEventListener('online', aoVoltarARede);
  window.addEventListener('pageshow', aoVoltarARede);
  document.addEventListener('resume', aoVoltarARede);
  document.addEventListener('visibilitychange', aoVoltarAAba);

  sincronizarBolas(bolas.porId, jogo.mesa);
  mostrarPartida();

  let vistaLivre: { readonly posicao: readonly [number, number, number]; readonly alvo: readonly [number, number, number] } | null = null;
  /** Câmera livre com as mãos em cena: elas ficam onde a câmera do jogo as poria e só o desenho vem da câmera livre (capturas). */
  let vistaComMaos = false;
  const removerGancho = dev
    ? instalarGancho({
        parametros: () => ({
          angulo: mira.angulo,
          velocidadeTaco: 0,
          efeito: { lateral: ponto.lateral, vertical: ponto.vertical },
          elevacao: 0,
          giz: giz.nivel,
        }),
        mirar(angulo, efeito) {
          mira.definir(angulo);
          if (efeito) {
            ponto.lateral = efeito.lateral;
            ponto.vertical = efeito.vertical;
          }
        },
        tacar(parametros) {
          entrada.cancelarTacada();
          if (!podeJogar()) throw new Error('não é a sua vez de tacar');
          if (giz.passando) throw new Error('passando o giz: espere a passada acabar');
          if (!tacada.iniciarAnimacao()) throw new Error('já há uma tacada animando');
          mira.definir(parametros.angulo);
          executarTacada(parametros);
        },
        preverEventos: (parametros) => jogo.preverTacada(parametros).eventos,
        preverMomentos: (parametros) => momentosDaGravacao(jogo.preverTacada(parametros).gravacao, configFisica.mesa, CONFIG_WEB.baloes.rosto),
        animando: () => tacada.fase === 'animando',
        aguardarFim: () => (tacada.fase === 'animando' ? new Promise<void>((resolver) => aguardando.push(resolver)) : Promise.resolve()),
        partida: () => jogo.partida,
        mesa: () => jogo.mesa,
        consequencias: () => jogo.ultimasConsequencias,
        mostrarFimDeProva: () => mostrarFim('Fim de prova do anúncio'),
        anunciosDeProva(ligado) {
          anuncios.definirProvaVisual(ligado);
          faixaDeAnuncio?.atualizar();
        },
        velocidadeAnimacao(fator) {
          player.velocidade = fator;
        },
        usarRegras(motor) {
          if (tacada.fase === 'animando') throw new Error('há uma tacada animando');
          ensaio = motor;
          novaPartida();
        },
        ultimaGravacao: () => ultimaGravacao,
        audio: () => ({
          ...audio.estatisticas(),
          pronto: audio.pronto,
          amostras: { estado: sonsDoJogo.banco.estado, prontas: sonsDoJogo.banco.quantasProntas, falhas: sonsDoJogo.banco.arquivosComFalha },
        }),
        zerarAudio: () => audio.zerarEstatisticas(),
        tocarAviso: (som) => audio.avisar(som),
        forca: () => ({
          efetivo: tacada.controle,
          local: controleLocal,
          sala: controleDaSala,
          fase: tacada.fase,
          fracao: tacada.fracaoDaForca,
          recuo: tacada.recuo,
          naBatida: gravacaoNaBatida !== null,
          barra: hud.forca.estado(),
        }),
        definirControleDeForca: (controle) => definirControleLocal(controle),
        regrasDaMesa: aplicarRegrasDaMesa,
        giz: () => ({ nivel: giz.nivel, passando: giz.passando, regras: giz.regrasAtuais, niveis: [0, 1, 2, 3].map((i) => giz.nivelDe(i)) }),
        passarGiz() {
          if (tacada.fase !== 'ociosa' || !podeJogar()) return false;
          return giz.passar();
        },
        gastarGiz() {
          giz.consumir();
          return giz.nivel;
        },
        elevacaoDoTaco: () => ({
          atual: elevacaoDoTaco.atual,
          alvo: elevacaoDoTaco.alvo,
          minima: CONFIG_WEB.elevacaoDoTaco.minima,
          maxima: CONFIG_WEB.elevacaoDoTaco.maxima,
          calculos: elevacaoDoTaco.calculos,
        }),
        elevacaoLivre(ligada) {
          elevacaoLivreLigada = ligada;
        },
        skinDoTaco(id, semente, bolas) {
          if (id !== undefined) {
            skinForcadaDoTaco = id === null ? null : { skin: ehSkinDeTaco(id) ? id : SKIN_PADRAO, semente: ehSemente(semente) ? semente : null, bolas: Number.isInteger(bolas) && (bolas as number) >= 0 ? (bolas as number) : null };
            trocarSkinDoTaco(skinForcadaDoTaco?.skin ?? SKIN_PADRAO, skinForcadaDoTaco?.semente ?? null, skinForcadaDoTaco?.bolas ?? null);
          }
          return skinDoTaco(taco) ?? SKIN_PADRAO;
        },
        desenhoDoTaco: () => ({ skin: skinDoTaco(taco) ?? SKIN_PADRAO, semente: sementeDoTaco(taco), bolas: bolasDoTaco(taco) }),
        gizDoTaco(nivel) {
          if (nivel !== undefined) {
            gizForcadoDoTaco = nivel;
            definirGizDoTaco(taco, nivel ?? giz.nivel);
          }
          return gizDoTaco(taco);
        },
        camera() {
          const pose = rig.ultimaPoseDaTacada;
          return {
            posicao: [camera.position.x, camera.position.y, camera.position.z],
            alvo: [pose.x, pose.y, pose.z],
            zoom: rig.zoomDaTacada,
            elevacao: pose.elevacao,
            folga: pose.folga,
            subiu: pose.subiu,
          };
        },
        maos: () => ({
          escala: modeloDasMaos.escala,
          cor: maos.corDasMaos(),
          ponte: { visivel: modeloDasMaos.ponteVisivel, apoio: modeloDasMaos.apoioDaPonte, distancia: modeloDasMaos.distanciaDaPonte, pose: { ...modeloDasMaos.ponte } },
          punho: { visivel: modeloDasMaos.punhoVisivel, agarre: modeloDasMaos.agarre, pose: { ...modeloDasMaos.punho } },
          desenho: { ...maos.diagnostico(), cargaMs: tempoDeCargaDasMaosMs },
          joinha: () => modeloDasMaos.reagir('caiu'),
          reagir: (momento: MomentoDaJogada) => modeloDasMaos.reagir(momento),
          vida: { ponteAtual: modeloDasMaos.ponteAtual, troca: modeloDasMaos.troca.ativa, pulso: modeloDasMaos.pulso, aperto: modeloDasMaos.aperto, tamborilando: modeloDasMaos.tamborilando, reacao: modeloDasMaos.reacao === null ? null : { ...modeloDasMaos.reacao } },
          fimDasMaos: maosDoFim.diagnostico(),
        }),
        balao: () => ({
          visivel: escalaDoBalao > 0.01,
          escala: escalaDoBalao,
          dono: donoDoBalao?.nome ?? null,
          donoId: donoDoBalao?.id ?? null,
          equipe: donoDoBalao?.equipe ?? null,
          cara: estadoDoBalao.cara,
          posicao: { x: estadoDoBalao.x, y: estadoDoBalao.y, z: estadoDoBalao.z },
          lugarOk: lugarDoBalao.ok,
          lado: lugarDoBalao.lado,
          emojis: camadaDeEmojisDoBalao.estado(),
          momentos: momentosDoRosto.map((m) => ({ ...m })),
          comArquivo: baloes.comArquivo,
          acao: baloes.diagnostico(equipeForcadaDoBalao ?? donoDoBalao?.equipe ?? 0)?.acao ?? null,
          bolaOlhada: baloes.comArquivo ? seguidorDoOlhar.bolaSeguida : null,
          tempoDeCargaMs: tempoDeCargaDoBalaoMs,
          ...diagnosticoDoBalao(),
          impaciente: estadoDoBalao.impaciente,
          interesses: estadoDoBalao.interesses.map((i) => i.prioridade),
          tela: telaDoBalao(),
        }),
        gizAnimado: () => ({
          fase: animacaoDoGiz.fase,
          progresso: animacaoDoGiz.progresso,
          cuboNaMao: animacaoDoGiz.cuboNaMao,
          afasta: animacaoDoGiz.afasta,
          giro: animacaoDoGiz.giro,
          cubo: { tem: cuboDaBorda.tem, visivel: gizNaCena.cuboVisivel, escala: cuboDaBorda.escala, x: cuboDaBorda.x, y: cuboDaBorda.y, z: cuboDaBorda.z },
          poeira: { capacidade: poeiraDoGiz.capacidade, vivas: poeiraDoGiz.vivas, desenhadas: gizNaCena.particulasVisiveis },
          mao: { ...modeloDasMaos.ponte },
        }),
        fim: () => ({
          existe: fimDaPartida.existe,
          tocando: fimDaPartida.ativo(performance.now(), CONFIG_WEB.baloes.fim.duracaoS),
          tempoS: fimDaPartida.tempoS(performance.now(), CONFIG_WEB.baloes.fim.duracaoS),
          duracaoS: CONFIG_WEB.baloes.fim.duracaoS,
          camera: rig.vista,
          baloes: Array.from({ length: fimDaPartida.equipes }, (_, i) => {
            const q = quadroDoFim(fimDaPartida.ganhou(i), i % 2 === 0 ? 1 : -1, fimDaPartida.tempoS(performance.now(), CONFIG_WEB.baloes.fim.duracaoS), CONFIG_WEB.baloes.fim);
            return { equipe: i, ganhou: fimDaPartida.ganhou(i), visivel: baloes.visivel(i), cara: q.cara, largura: q.largura, altura: q.altura, caida: q.caida, cor: corDaEquipe(i) };
          }),
        }),
        pularFim: pularFimDaPartida,
        fixarTempoDoFim(segundos) {
          fimDaPartida.fixar(segundos);
        },
        forcarCaraDoBalao(cara) {
          caraForcadaDoBalao = cara;
        },
        forcarOlharDoBalao(alvo) {
          olharForcadoDoBalao = alvo;
        },
        forcarEquipeDoBalao(equipe) {
          equipeForcadaDoBalao = equipe;
        },
        espirro: () => hud.avisoEspirro.estado(),
        avisoDiscreto: () => hud.aviso.estado(),
        configFisica: () => configFisica,
        configTacada: () => configTacada,
        previsao() {
          const c = previsao.caminho;
          return {
            visivel: linhaPrevisao.grupo.visible,
            calculos: previsao.calculos,
            custoMs: previsao.ultimoCustoMs,
            erro: previsao.erro,
            fim: c.fim,
            comprimento: c.comprimento,
            pontos: Array.from({ length: c.quantidade }, (_, i): [number, number] => [c.pontos[2 * i]!, c.pontos[2 * i + 1]!]),
            atingida: { ...c.atingida },
            gravacao: previsao.gravacao,
          };
        },
        linha: () => ({
          efetiva: linhaDeAgora(),
          local: linhaLocal,
          sala: sessao?.partida.estadoSala?.linha ?? null,
          online: sessao !== null,
          editavel: linhaEditavel(sessao !== null),
          visivel: linhaPrevisao.grupo.visible,
        }),
        vista(pose, opcoes) {
          vistaLivre = pose;
          vistaComMaos = opcoes?.maos === true;
        },
        boteco: () => ({
          carregado: boteco.carregado,
          falhou: boteco.falhouAoCarregar,
          nivel: boteco.nivelCarregado,
          luzes: boteco.luzesLigadas,
          camerasDoMenu: boteco.camerasDoMenu.length,
          menu3D: menu.visivel && boteco.carregado,
          pausado3D,
          pisoDoJogoVisivel: grupoDaMesa.getObjectByName('piso')?.visible ?? null,
          tetoVisivel: boteco.tetoVisivelAgora,
        }),
        grupoDoBoteco: () => boteco.grupo,
        cameraDeAgora: () => ({
          vista: rig.vista,
          orbitando: rig.orbitando,
          posicao: [camera.position.x, camera.position.y, camera.position.z] as const,
          zoom: rig.zoomDaTacada,
        }),
        orbitar(pixelsX, pixelsY, zoom = 0) {
          if (!rig.orbitando) rig.iniciarOrbita();
          rig.orbitar(pixelsX, pixelsY);
          for (let i = 0; i < Math.abs(zoom); i++) rig.zoomar(Math.sign(zoom));
        },
        encerrarOrbita: () => rig.encerrarOrbita(),
        alternarVista: () => rig.alternarVista(),
        projetar(x, y, z) {
          const retangulo = renderer.domElement.getBoundingClientRect();
          camera.updateMatrixWorld();
          const p = new THREE.Vector3(x, y, z).project(camera);
          return { x: ((p.x + 1) / 2) * retangulo.width, y: ((1 - p.y) / 2) * retangulo.height, profundidade: p.z, naTela: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z >= -1 && p.z <= 1 };
        },
        online() {
          if (!sessao) return null;
          const { partida, miraRemota, chat, cliente } = sessao;
          return {
            codigo: cliente.codigo,
            lugar: partida.meuLugar,
            anfitriao: partida.souAnfitriao,
            conexao: cliente.estado.fase,
            minhaVez: partida.minhaVez,
            aguardandoSala: partida.aguardandoSala,
            seqNaMesa: partida.seqNaMesa,
            estadoSala: partida.estadoSala,
            miraRemota: { angulo: miraRemota.angulo, lateral: miraRemota.lateral, vertical: miraRemota.vertical, recuo: miraRemota.recuo },
            mirasRecebidas,
            abaViva: abaViva?.ativa ?? false,
            chat: chat.visiveis(Date.now(), true, 50).map((l) => (l.aviso ? l.texto : `${l.nome}: ${l.texto}`)),
          };
        },
        emojis: () => hud.emojis.estado().bolhas.map(({ nome, emoji, lugar, equipe }) => ({ nome, emoji, lugar, equipe })),
        mandarEmoji: (numero) => hud.emojis.soltar(numero),
        emojisEscolhidos: () => [...emojisEscolhidos.emojis],
        escolherEmoji: (slot, emoji) => emojisEscolhidos.escolher(slot, emoji),
        derrubarConexao() {
          sessao?.cliente.derrubar();
        },
        posicaoBola(id) {
          const bola = bolas.porId[id];
          if (!bola) throw new RangeError(`bola ${id} não existe`);
          return { x: bola.position.x, y: bola.position.y, z: bola.position.z, escala: bola.scale.x, visivel: bola.visible };
        },
        qualidade: () => ({
          nivel: controlador.nivel,
          nivelDeAbertura,
          preferencia: controlador.preferencia,
          rebaixada: controlador.rebaixada,
          software: gpu.software,
          renderizador: gpu.renderizador,
          razaoDePixels: aplicador.razaoDePixels,
          perfil: aplicador.perfil ?? perfilDeAbertura,
        }),
        definirQualidade: (preferencia) => controlador.definirPreferencia(preferencia),
        aplicarPerfil: (parcial) => aplicador.aplicar({ ...(aplicador.perfil ?? perfilDeAbertura), ...parcial }),
        diagnostico() {
          const agora = performance.now();
          return {
            fps: quadros.fps(CONFIG_WEB.qualidade.diagnostico.janelaS * 1000, agora),
            piorQuadroMs: quadros.piorQuadroMs(5000, agora),
            chamadas: renderer.info.render.calls,
            triangulos: renderer.info.render.triangles,
            geometrias: renderer.info.memory.geometries,
            texturas: renderer.info.memory.textures,
            programas: renderer.info.programs?.length ?? 0,
            memoriaMb: memoriaDoJsMb(),
            painelAberto: diag.aberto,
            ultimoResumo,
          };
        },
        configuracoes: () => ({ perfil: gerenteConfig.perfil, valores: gerenteConfig.valores, painelAberto: painelConfig.aberto, aplicadas: { mira: configMira, tacada: configTacada, camera: configCamera } }),
        definirConfiguracao: (chave, valor) => gerenteConfig.definir(chave, valor),
        anuncio: () => hud.anuncio.estado(),
        placar: () => ({
          hud: hud.placarDaSala.texto(),
          fim: hud.telas.textoDoPlacar(),
          classificacao: hud.telas.textoDaClassificacao(),
          aposta: hud.telas.textoDaAposta(),
          mostrado: placarMostrado,
          local: placarLocal.noFio(),
          sala: sessao?.partida.estadoSala?.placar ?? null,
        }),
        zerarPlacarLocal() {
          placarLocal.zerar();
          mostrarPlacarDaSala();
        },
        carteira: () => ({
          guardada: carteira.guardada(),
          saldo: carteira.estado()?.saldo ?? null,
          skins: carteira.estado()?.skins ?? [],
          skin: carteira.estado()?.skin ?? null,
          balao: carteira.estado()?.balao ?? null,
          aviso: carteira.aviso(),
          loja: { aberta: loja.aberta, texto: loja.texto() },
        }),
        forcarAparenciaDoBalao(a) {
          aparenciaForcadaDoBalao = a;
        },
        meuBalao: () => ({ aberto: meuBalao.aberto, texto: meuBalao.texto(), rascunho: meuBalao.rascunho(), previa: meuBalao.previa()?.diagnostico() ?? null, chapeus: chapeus.estado }),
        abrirMeuBalao(aberto) {
          if (aberto) {
            perfil.fechar();
            meuBalao.abrir();
          } else meuBalao.fechar();
        },
        escolherNoMeuBalao: (categoria, id) => meuBalao.escolher(categoria, id),
        perfil: () => ({ aberto: perfil.aberto, linkAberto: perfil.linkAberto, texto: perfil.texto(), pergunta: { aberta: perguntaDeCarteira.aberta, texto: perguntaDeCarteira.texto() } }),
        abrirPerfil(aberto) {
          if (aberto) perfil.abrir();
          else perfil.fechar();
        },
        conta: () => {
          const e = conta.estado();
          return {
            tipo: e.tipo,
            nome: e.tipo === 'conta' ? e.nome : null,
            modoConta: carteira.modoConta(),
            teveConta: conta.teveConta(),
            dialogo: { aberto: dialogosDaConta.aberto, texto: dialogosDaConta.texto() },
          };
        },
        abrirConta(qual) {
          if (qual === null) dialogosDaConta.fechar();
          else if (qual === 'criar') dialogosDaConta.abrirCriar();
          else if (qual === 'entrar') dialogosDaConta.abrirEntrar();
          else if (qual === 'esqueci') dialogosDaConta.abrirEsqueci();
          else dialogosDaConta.abrirSessaoAcabou();
        },
        missoes: () => ({
          quadro: quadroDeMissoes(),
          painel: menu.textoDasMissoes(),
          modelo: missoesNaTela(quadroDeMissoes(), Date.now()),
          avisos: hud.avisosDeMissao.estado(),
          pendentes: avisosDeMissaoPendentes.map((a) => a.texto),
          ajuda: hud.ajudaMissoes.estado(),
        }),
        menu: () => ({ tela: menu.tela, barra: menu.textoDaBarra() }),
        abrirLoja(aberta) {
          if (aberta) loja.abrir();
          else loja.fechar();
        },
        apostaDaSala() {
          const e = sessao?.partida.estadoSala;
          if (!e) return null;
          return { aposta: e.aposta ?? 0, saldos: e.lugares.map((l) => l.saldo ?? null), skins: e.lugares.map((l) => l.skin ?? 'classico'), paga: sessao?.partida.apostaPaga ?? null };
        },
        transicao: () => ({ ativa: transicao.ativa, plano: ultimoPlano, aviso: hud.avisoFalta.estado() }),
        pularTransicao: () => transicao.pular(),
        velocidadeTransicao(fator) {
          transicao.velocidade = fator;
        },
        destaque: () => ({
          visivel: destaqueNaCena,
          intensidade: destaque.estadoAtual.intensidade,
          bolas: [...destaque.estadoAtual.bolas],
          aneisNaCena: aneisDoDestaque.grupo.children.filter((c) => c.visible).length,
        }),
        sinalDaMira: () => ({ ...sinalMostrado, tacoVermelho: taco.getObjectByName('taco-alerta')?.visible === true, aviso: hud.avisoMira.estado() }),
        estiloDasBolas: () => [...bolas.estilos],
        desenharCasa: (casa) => bolas.definirCasa(casa),
        relogio() {
          const e = sessao?.partida.estadoSala ?? null;
          return {
            contador: hud.contador.estado(),
            local: { tempoS: relogioLocal.tempoS, restanteMs: relogioLocal.restanteMs() },
            sala: sessao && e ? { tempoS: e.relogio?.tempoS ?? null, prazoMs: e.prazoMs ?? null, restanteMs: sessao.partida.restanteDaVezMs(Date.now()) } : null,
          };
        },
        definirTempoLocal(tempoS) {
          relogioLocal.definirTempo(tempoS, performance.now());
        },
        treino() {
          if (treino === null) return null;
          const visivel = editor?.mesaDesenhada() ?? jogo.mesa;
          const ponto = new THREE.Vector3();
          const retangulo = renderer.domElement.getBoundingClientRect();
          camera.updateMatrixWorld();
          return {
            modo: treino.modo,
            tacadas: treino.tacadas,
            cenario: treino.cenario,
            podeRefazer: treino.podeRefazer,
            fase: jogo.fase,
            naMesa: numeradasNaMesa(visivel),
            bandeja: editor?.bandeja ?? [],
            naMao: editor?.arraste ? { id: editor.arraste.id, valido: editor.arraste.valido } : null,
            vista: rig.vista,
            posicoes: visivel.bolas.filter((b) => b.naMesa).map((b) => ({ id: b.id, x: b.posicao.x, z: b.posicao.z })),
            bolasNaTela: visivel.bolas
              .filter((b) => b.naMesa)
              .map((b) => {
                ponto.set(b.posicao.x, b.posicao.y, b.posicao.z).project(camera);
                return { id: b.id, x: retangulo.left + (ponto.x * 0.5 + 0.5) * retangulo.width, y: retangulo.top + (0.5 - ponto.y * 0.5) * retangulo.height };
              }),
            hud: hud.treino.estado(),
          };
        },
        colocarBola(id, x, y, z, escala = 1) {
          const bola = bolas.porId[id];
          if (!bola) throw new RangeError(`bola ${id} não existe`);
          bola.position.set(x, y, z);
          bola.scale.setScalar(escala);
          bola.visible = true;
        },
      })
    : () => {};

  // O painel de física (F1): sempre existe. Com `?dev=1` (ou no Vite dev) traz também força e previsão e lembra valores; sem ele é o dos
  // jogadores, só com a física: no mesmo PC e no treino muda a física local, online o anfitrião muda a da sala e os outros só a leem.
  const padraoDoPainel = valoresPadrao(CONFIG_FISICA_PADRAO, CONFIG_WEB.tacada, CONFIG_WEB.previsao);
  const armazenamentoDoPainel = armazenamentoLocal();
  const salvos = dev ? lerValoresSalvos(padraoDoPainel, armazenamentoDoPainel) : null;
  const estadoPainel = new EstadoDoPainel(padraoDoPainel, salvos?.valores ?? padraoDoPainel);
  estadoDoPainel = estadoPainel;
  // O padrão mudou desde que se lembrou: o salvo antigo não vale por cima. O que ficou é gravado de novo com os
  // padrões de agora, para o aviso aparecer uma vez só.
  if (salvos?.antigo) esquecerValores(armazenamentoDoPainel);
  else if (salvos && salvos.descartados.length > 0) salvarValores(salvos.valores, padraoDoPainel, armazenamentoDoPainel);
  const aplicarPainel = (): void => {
    fisicaLocal = fisicaDoPainel(CONFIG_FISICA_PADRAO, estadoPainel.valores);
    sincronizarFisica();
    if (!dev) return;
    configTacadaBase = tacadaDoPainel(CONFIG_WEB.tacada, estadoPainel.valores);
    aplicarConfiguracoes();
    controleLocal = controleDoPainel(estadoPainel.valores);
    // No hot-seat o painel e a tecla L ainda mexem na linha; online ela é da sala e `linhaEfetiva` ignora isto.
    linhaLocal = linhaDe(estadoPainel.valores.previsaoLigada === 1, estadoPainel.valores.previsaoBolaAtingida === 1);
    forcaDaPrevisao = estadoPainel.valores.forcaPrevisao;
  };
  aplicarPainel();
  if (dev) {
    // `?linha=1|2` (hot-seat que pula a tela inicial) vale por cima do que o painel lembrou.
    const daUrl = linhaDaUrl(busca);
    if (daUrl) definirLinhaLocal(daUrl);
    // `?forca=empurrar|linha` também vale por cima do que o painel lembrou.
    const forcaDaUrl = controleDaUrl(busca);
    if (forcaDaUrl) definirControleLocal(forcaDaUrl);
  }
  estadoPainel.aoMudar(aplicarPainel);
  painelDev = criarPainelDev(document.body, {
    dev,
    estado: estadoPainel,
    armazenamento: armazenamentoDoPainel,
    carregadoDoArmazenamento: salvos !== null && !salvos.antigo,
    avisoDosSalvos: avisoDosSalvos(salvos),
    aoAbrir: () => entrada.soltarMouse(),
    linhaEditavel: () => linhaEditavel(sessao !== null),
    fisica: () => modoDoPainelDeFisica(sessao ? { estado: sessao.partida.estadoSala, souAnfitriao: sessao.partida.souAnfitriao } : null),
    aoPedirFisicaDaSala: (pedido) => {
      pedidoDeFisicaEm = performance.now();
      sessao?.partida.configurarSala({ fisica: pedido });
    },
  });

  const aoRedimensionar = (): void => {
    faixaDeAnuncio?.atualizar();
    camera.aspect = window.innerWidth / alturaDaCena();
    camera.updateProjectionMatrix();
    aplicador.redimensionar();
    rig.definirLarguraDaTela(window.innerWidth);
  };
  window.addEventListener('resize', aoRedimensionar);
  faixaDeAnuncio = criarFaixa(anuncios, aoRedimensionar);

  /** O contador da vez: hot-seat conta aqui; online o prazo vem da sala (todos veem o mesmo). */
  /** O balão passa a ser de `jogador`: some o que era do anterior e o novo entra quando a mão dele aparecer. */
  function trocarDonoDoBalao(jogador: Jogador | null): void {
    donoDoBalao = jogador;
    // Sem dono (o fim da partida, a sala vazia) ninguém espera ser provocado; com dono novo o pedido segue valendo para a equipe dele.
    if (jogador === null) provocacaoDoBalao.cancelar();
    baloes.reiniciar();
    seguidorDoOlhar.reiniciar();
    rostoDoBalao.reiniciar();
    cacapasDaGravacao.limpar();
    mirandoDesdeMs = null;
    posicionadorDoBalao.reiniciar();
    emojisDoBalao.limpar();
    balaoComAncora = false;
    balaoDesenhado = false;
    semLugarDoBalao = 0;
    escalaDoBalao = 0;
    baloes.esconderTodos();
  }

  /**
   * O balão de quem joga na outra tela, junto da mão que segura o taco (L23). Só entra depois de as mãos aparecerem, fica à
   * vista enquanto a vez for dele (também com as bolas andando) e some suave quando a vez passa. `protegidas` (a branca e a
   * bola mirada) é o que ele nunca pode tapar; a conta é do `PosicionadorDoBalao`.
   */
  function atualizarBalao(dt: number, agoraMs: number, ativo: boolean, protegidas: readonly EsferaMutavel[], angulo: number): void {
    const dono = donoDoBalao;
    if (dono === null) return;
    if (ativo && !balaoComAncora && modeloDasMaos.escala > 0.3) balaoComAncora = true;
    const quer = ativo && balaoComAncora;
    if (quer) posicionadorDoBalao.escolher(modeloDasMaos.punho, angulo, projetorDaCamera, protegidas, lugarDoBalao);
    const { presenca, posicao } = CONFIG_WEB.baloes;
    // Sem lugar por um instante (a câmera ainda alcançando uma mira que girou): fica onde estava; só some se durar.
    semLugarDoBalao = quer && !lugarDoBalao.ok ? semLugarDoBalao + dt : 0;
    const alvo = quer && (lugarDoBalao.ok || (balaoDesenhado && semLugarDoBalao < presenca.gracaS)) ? 1 : 0;
    escalaDoBalao += (alvo - escalaDoBalao) * (1 - Math.exp((-3 / (alvo === 1 ? presenca.entraS : presenca.saiS)) * dt));
    if (Math.abs(alvo - escalaDoBalao) < 0.002) escalaDoBalao = alvo;
    if (escalaDoBalao === 0) {
      if (!ativo) balaoComAncora = false;
      balaoDesenhado = false;
      mirandoDesdeMs = null;
      baloes.esconderTodos();
      camadaDeEmojisDoBalao.atualizar(emojisDoBalao, agoraMs, null);
      return;
    }
    // A vez passou do jogador de cá para o balão: quando ele já está à vista, ri (e depois fica convencido).
    if (provocacaoDoBalao.disparar(dono.equipe, agoraMs / 1000, escalaDoBalao)) rostoDoBalao.provocou(agoraMs / 1000);
    if (quer && lugarDoBalao.ok) {
      if (!balaoDesenhado) {
        balaoSuave.x = lugarDoBalao.x;
        balaoSuave.y = lugarDoBalao.y;
        balaoSuave.z = lugarDoBalao.z;
        balaoDesenhado = true;
      } else {
        const k = 1 - Math.exp(-posicao.taxa * dt);
        balaoSuave.x += (lugarDoBalao.x - balaoSuave.x) * k;
        balaoSuave.y += (lugarDoBalao.y - balaoSuave.y) * k;
        balaoSuave.z += (lugarDoBalao.z - balaoSuave.z) * k;
      }
    }
    const e = estadoDoBalao;
    const atencao = CONFIG_WEB.baloes.arquivo.olhar.atencao;
    e.x = balaoSuave.x;
    e.y = balaoSuave.y;
    e.z = balaoSuave.z;
    // O rosto olha para a câmera (só em torno do vertical).
    e.yaw = Math.atan2(camera.position.x - e.x, camera.position.z - e.z);
    e.escala = escalaDoBalao;
    const equipe = equipeForcadaDoBalao ?? dono.equipe;
    e.cor = corDaEquipe(equipe);
    e.cara = caraForcadaDoBalao ?? rostoDoBalao.rosto(player.tempoS, agoraMs / 1000, player.velocidade);
    e.tempoS = agoraMs / 1000;
    // O balão do artista: concentra-se enquanto o outro mira (e perde a paciência se a vez demora) e os olhos escolhem o que olhar.
    e.mirando = !player.tocando && !transicao.ativa && tacada.fase !== 'animando';
    if (!e.mirando) mirandoDesdeMs = null;
    else mirandoDesdeMs ??= agoraMs;
    e.impaciente = mirandoDesdeMs !== null && (agoraMs - mirandoDesdeMs) / 1000 > CONFIG_WEB.baloes.arquivo.olhar.impacienciaAposS;
    if (baloes.comArquivo) {
      for (let i = 0; i < bolas.porId.length; i++) {
        const m = bolas.porId[i]!;
        bolasX[i] = m.position.x;
        bolasZ[i] = m.position.z;
        bolasNaMesa[i] = m.visible ? 1 : 0;
      }
      seguidorDoOlhar.atualizar(dt, bolasX, bolasZ, bolasNaMesa);
      // A branca que caiu não é seguida pelo olhar: o ponto fica onde ela esteve na mesa e a atenção vai para o que vem a seguir.
      situacaoDoOlhar.brancaNaMesa = bolasNaMesa[ID_BOLAO] === 1;
      if (situacaoDoOlhar.brancaNaMesa) {
        pontoDaBranca.x = bolasX[ID_BOLAO]!;
        pontoDaBranca.z = bolasZ[ID_BOLAO]!;
      }
      pontoDaBolaQueAnda.x = seguidorDoOlhar.bolaX;
      pontoDaBolaQueAnda.z = seguidorDoOlhar.bolaZ;
      situacaoDoOlhar.mirando = e.mirando;
      situacaoDoOlhar.fim = false;
      situacaoDoOlhar.bolaQueAnda = seguidorDoOlhar.andando ? pontoDaBolaQueAnda : null;
      situacaoDoOlhar.cacapa = cacapasDaGravacao.naVista(player.tocando ? player.tempoS : null, atencao.previsaoDaCacapaS, atencao.seguraACacapaS, pontoDaCacapa) ? pontoDaCacapa : null;
      situacaoDoOlhar.mira = protegidas.length > 1 ? miradaProtegida : null;
      interessesDoBalao(situacaoDoOlhar, atencao, e.interesses);
      if (olharForcadoDoBalao !== null) {
        for (let k = 0; k < e.interesses.length; k++) e.interesses[k]!.prioridade = 0;
        const vaga = e.interesses[olharForcadoDoBalao === 'camera' ? INTERESSE.camera : INTERESSE.branca]!;
        vaga.x = olharForcadoDoBalao === 'camera' ? camera.position.x : pontoDaBranca.x;
        vaga.y = olharForcadoDoBalao === 'camera' ? camera.position.y : pontoDaBranca.y;
        vaga.z = olharForcadoDoBalao === 'camera' ? camera.position.z : pontoDaBranca.z;
        vaga.prioridade = 5;
      }
    }
    baloes.esconderTodos();
    const iDoBalao = ((equipe % baloes.quantos) + baloes.quantos) % baloes.quantos;
    // O balão veste o que a sala mandou para quem o joga (online); no mesmo PC todos usam o padrão.
    baloes.definirAparencia(iDoBalao, aparenciaForcadaDoBalao ?? (sessao ? aparenciaDoLugar(sessao.partida.estadoSala, lugarDoJogador(dono.id)) : APARENCIA_PADRAO));
    baloes.mostrar(iDoBalao, e);

    // Onde o topo do balão está na tela: dali sobem os emojis dele.
    if (emojisDoBalao.quantidade > 0) {
      const corpo = CONFIG_WEB.baloes.corpo;
      if (projetorDaCamera.projetar(e.x, e.y + corpo.altura * escalaDoBalao, e.z, topoNaTela) && projetorDaCamera.projetar(e.x, e.y - corpo.altura * escalaDoBalao, e.z, peNaTela)) {
        balaoNaTela.x = (topoNaTela.x * 0.5 + 0.5) * window.innerWidth;
        balaoNaTela.y = (0.5 - topoNaTela.y * 0.5) * alturaDaCena();
        balaoNaTela.altura = Math.abs(topoNaTela.y - peNaTela.y) * 0.5 * alturaDaCena();
        camadaDeEmojisDoBalao.atualizar(emojisDoBalao, agoraMs, balaoNaTela);
        return;
      }
    }
    camadaDeEmojisDoBalao.atualizar(emojisDoBalao, agoraMs, null);
  }

  /** O que o balão do artista faz agora, para o gancho de teste. */
  function diagnosticoDoBalao(): {
    momento: string | null;
    olhando: boolean;
    recursos: { readonly [recurso: string]: boolean } | null;
    tempoDaAcao: number;
    caraDoArquivo: string | null;
    rosto: { readonly formas: Readonly<Record<string, number>>; readonly pitchDoOlhoGraus: number } | null;
    aparencia: { readonly acessorio: string | null; readonly bigode: string | null; readonly estiloDeOlho: string | null; readonly corDosOlhos: string | null } | null;
  } {
    const d = baloes.diagnostico(equipeForcadaDoBalao ?? donoDoBalao?.equipe ?? 0);
    return {
      momento: d?.momento ?? null,
      olhando: d?.olhando ?? false,
      recursos: { ...(d?.recursos ?? {}) },
      tempoDaAcao: d?.tempoDaAcao ?? 0,
      caraDoArquivo: d?.cara ?? null,
      rosto: d?.rosto ?? null,
      aparencia: d?.aparencia ?? null,
    };
  }

  /** Onde o balão está na tela (px), para o gancho de teste recortar capturas; `null` sem balão à vista. */
  function telaDoBalao(): { x: number; y: number; altura: number } | null {
    if (!(escalaDoBalao > 0.01)) return null;
    const e = estadoDoBalao;
    const corpo = CONFIG_WEB.baloes.corpo;
    projetorDaCamera.atualizar();
    if (!projetorDaCamera.projetar(e.x, e.y + corpo.altura * escalaDoBalao, e.z, topoNaTela) || !projetorDaCamera.projetar(e.x, e.y - corpo.altura * escalaDoBalao, e.z, peNaTela)) return null;
    const px = (v: number): number => (v * 0.5 + 0.5) * window.innerWidth;
    const py = (v: number): number => (0.5 - v * 0.5) * alturaDaCena();
    return { x: px((topoNaTela.x + peNaTela.x) / 2), y: py((topoNaTela.y + peNaTela.y) / 2), altura: Math.abs(py(topoNaTela.y) - py(peNaTela.y)) };
  }

  const ancoraEsqDoFim = quadroVazio();
  const ancoraDirDoFim = quadroVazio();
  const ancorasDoFim = { esquerda: ancoraEsqDoFim, direita: ancoraDirDoFim, escalaDoCorpo: 1 };

  /**
   * O fim da partida: o balão de cada equipe no seu lugar em volta da mesa, estufando (quem ganhou) ou murchando (quem perdeu),
   * virado para a câmera. Quando o roteiro acaba, ou é pulado, os balões ficam como estão (atrás da tela de fim) e a tela entra.
   */
  function atualizarBaloesDoFim(agoraMs: number, dt: number): void {
    const { fim, corpo } = CONFIG_WEB.baloes;
    const tempoS = fimDaPartida.tempoS(agoraMs, fim.duracaoS);
    const e = estadoDoFimDoBalao;
    const alturaCheia = corpo.altura * 2 * fim.tamanho;
    baloes.esconderTodos();
    for (let i = 0; i < fimDaPartida.equipes; i++) {
      const lugar = lugaresDoFimDosBaloes[i];
      if (!lugar) continue;
      const q = quadroDoFim(fimDaPartida.ganhou(i), i % 2 === 0 ? 1 : -1, tempoS, fim, quadroDoFimDoBalao);
      e.x = lugar.x;
      // O balão do artista faz o estufar e o murchar na própria ação (tamanho, queda e descida); só o procedural precisa da conta.
      const doArtista = baloes.comArquivo;
      e.y = fim.altura - (doArtista ? 0 : q.descida) * alturaCheia;
      e.z = lugar.z;
      e.yaw = Math.atan2(camera.position.x - e.x, camera.position.z - e.z);
      e.escala = q.escala;
      e.largura = (doArtista ? 1 : q.largura) * fim.tamanho;
      e.altura = (doArtista ? 1 : q.altura) * fim.tamanho;
      e.caida = doArtista ? 0 : q.caida;
      e.cor = corDaEquipe(i);
      e.cara = q.cara;
      e.tempoS = agoraMs / 1000;
      e.mirando = false;
      e.fim = doArtista ? (fimDaPartida.ganhou(i) ? 'ganhou' : 'perdeu') : null;
      // No fim os balões olham para a câmera.
      e.impaciente = false;
      if (doArtista) {
        situacaoDoOlhar.fim = true;
        interessesDoBalao(situacaoDoOlhar, CONFIG_WEB.baloes.arquivo.olhar.atencao, e.interesses);
      }
      baloes.definirAparencia(i, aparenciaForcadaDoBalao ?? (sessao ? aparenciaDaEquipe(sessao.partida.estadoSala, i) : APARENCIA_PADRAO));
      baloes.mostrar(i, e);
      // As mãos da equipe, logo abaixo do balão: palmas para quem ganhou, mão mole para quem perdeu.
      // Com o balão do artista as mãos prendem nos pontos dele (mao_esq e mao_dir) e fecham com o tamanho do corpo.
      const presas = doArtista && baloes.ancora(i, 'mao_esq', ancoraEsqDoFim) && baloes.ancora(i, 'mao_dir', ancoraDirDoFim);
      ancorasDoFim.escalaDoCorpo = e.largura * e.escala;
      maosDoFim.mostrar(i, { x: e.x, y: e.y - corpo.altura * e.altura, z: e.z, yaw: e.yaw, escala: q.escala, ganhou: fimDaPartida.ganhou(i), cor: corDaEquipe(i) }, dt, presas ? ancorasDoFim : null);
    }
    camadaDeEmojisDoBalao.atualizar(emojisDoBalao, agoraMs, null);
    if (aoAcabarOFim && !fimDaPartida.ativo(agoraMs, fim.duracaoS)) {
      const depois = aoAcabarOFim;
      aoAcabarOFim = null;
      document.body.classList.remove('fim-roteiro');
      depois();
    }
  }

  /**
   * O giz passado na ponta (L23, G): o cubo de giz parado na moldura; quando o giz começa a passar, a mão da ponte vai pegá-lo, o
   * leva à ponta do taco, o gira nela (soltando pó azul) enquanto a passada dura e o devolve. Serve à minha vez e à do outro
   * (L24: a mira dele diz `giz: true`): `passando`/`encadeando` = quem tem a vez está passando giz; `ativo` = a mira está parada
   * e a mão aparece; `cuboVisivel` = o cubo aparece mesmo que a mão esteja ocupada (as mãos em cena).
   */
  function atualizarGiz(dt: number, agoraMs: number, passando: boolean, encadeando: boolean, ativo: boolean, cuboVisivel: boolean, alturaPx: number): void {
    const cfg = CONFIG_WEB.maos.giz;
    // Sem a mão do arquivo (ainda não veio, ou falhou) não há quem pegue o cubo: o gesto fica parado.
    const calibrada = modeloDasMaos.ponteCalibrada;
    const pinca = calibrada?.modelo.contatos.pincas.get('pinca');
    // O giz é todo medido na mão do V: com outra ponte na mão, ela troca para o V (`pedirGiz`) e só então o gesto começa.
    const emCurso = animacaoDoGiz.fase !== 'parado';
    modeloDasMaos.pedirGiz(passando || encadeando || emCurso);
    const temMao = calibrada !== null && pinca !== undefined && (modeloDasMaos.podeGiz || emCurso);
    animacaoDoGiz.atualizar(dt, { passando: temMao && passando, encadeando: temMao && encadeando, ativo: temMao && ativo, passadaS: giz.regrasAtuais.passadaS });
    const gesto = temMao && animacaoDoGiz.fase !== 'parado';
    modeloDasMaos.definirPinca(animacaoDoGiz.pinca);
    // O cubo na moldura: só muda de lugar com o gesto parado; some quando as mãos somem.
    projetorDaCamera.atualizar();
    cuboDaBorda.atualizar(dt, { bolaX: ancora.x, bolaZ: ancora.z, angulo: anguloVisual, ativo: cuboVisivel || gesto, livre: !gesto }, projetorDaCamera);
    if (cuboDaBorda.tem) poseDoCubo(cuboDaBorda.x, cuboDaBorda.y, cuboDaBorda.z, anguloVisual, poseNoCubo);
    if (gesto) {
      Object.assign(poseDaPonteSemGiz, modeloDasMaos.ponte);
      gizNaMao.moverMao(animacaoDoGiz, calibrada, pinca, modeloDasMaos.eixoDoTaco, poseNoCubo, poseDaPonteSemGiz, cfg.cubo.lado, modeloDasMaos.ponte);
      modeloDasMaos.ponteVisivel = true;
    }
    if (cuboDaBorda.tem && cuboDaBorda.escala > 0.01) {
      // Na mão o cubo anda com ela (preso nos dedos: quem gira é ele); na moldura fica como a mão o deixou: de covinha para cima.
      const poseDoCuboDeGiz = gesto && animacaoDoGiz.cuboNaMao ? gizNaMao.cuboNaMao(calibrada, pinca, modeloDasMaos.ponte) : gizNaMao.cuboNaBorda(poseNoCubo);
      gizNaCena.mostrarCubo(poseDoCuboDeGiz, animacaoDoGiz.cuboNaMao ? 1 : cuboDaBorda.escala * modeloDasMaos.escala);
    } else gizNaCena.esconderCubo();
    // O pó sai da ponta, onde o cubo gira.
    if (animacaoDoGiz.girando) {
      const e = modeloDasMaos.eixoDoTaco;
      poeiraDoGiz.emitir(dt, e.px + e.dx * 0.003, e.py + e.dy * 0.003, e.pz + e.dz * 0.003, e.dx, e.dy, e.dz);
    }
    poeiraDoGiz.atualizar(dt);
    gizNaCena.desenharPoeira(poeiraDoGiz, alturaPx);
  }

  function atualizarRelogio(agoraMs: number): void {
    if (modo === 'local' && treino !== null) {
      // No treino não há relógio da tacada.
      hud.contador.atualizar(null);
    } else if (modo === 'local') {
      relogioLocal.avancar(agoraMs, jogo.fase === 'jogando' && !painelConfig.aberto && !transicao.ativa);
      if (relogioLocal.esgotou() && jogo.fase === 'jogando') perderAVezLocal();
      hud.contador.atualizar(jogo.fase === 'fim' ? null : relogioLocal.restanteMs());
    } else {
      hud.contador.atualizar(modo === 'online' && sessao !== null ? sessao.partida.restanteDaVezMs(Date.now()) : null);
    }
  }

  const ancora = new THREE.Vector3().copy(bolao.position);
  let anteriorMs = 0;
  let anguloVisual = 0;
  let eraMeuTaco = true;
  let pausado3D = false;
  renderer.setAnimationLoop((agoraMs: number) => {
    const dt = anteriorMs === 0 ? 0 : Math.min((agoraMs - anteriorMs) / 1000, MAX_DT);
    anteriorMs = agoraMs;
    // O menu fica por cima do boteco em 3D (a câmera passeia pelo arquivo); sem o boteco a cena é a de antes, atrás do menu opaco.
    const menu3D = menu.visivel && boteco.carregado;

    quadros.registrar(agoraMs);
    controlador.aoQuadro(agoraMs);
    emissorDeDiagnostico.atualizar(agoraMs);
    sincronizarPerfil();
    // O controle de força que vale agora (a sala manda online, quando mandar; senão a escolha local): trocar cancela a mira em curso.
    tacada.definirControle(controleEfetivo(sessao !== null, controleDaSala, controleLocal));
    if (tacada.controle !== controleNaAjuda) {
      controleNaAjuda = tacada.controle;
      hud.definirControleDeForca(controleNaAjuda);
    }
    entrada.atualizar(dt);
    player.atualizar(agoraMs);
    seguimento.atualizar(dt);
    if (gravacaoNaBatida !== null && !seguimento.emBatida) {
      const gravacao = gravacaoNaBatida;
      gravacaoNaBatida = null;
      tocarGravacao(gravacao);
    }
    hud.placar.atualizar(agoraMs);
    hud.avisoEspirro.atualizar(agoraMs);
    hud.anuncio.atualizar(agoraMs);
    hud.avisoFalta.atualizar(agoraMs);
    transicao.atualizar(agoraMs);
    hud.aviso.atualizar(agoraMs);
    soltarAvisosDeMissao(agoraMs);
    hud.ajudaMissoes.tic();
    hud.avisosDeMissao.atualizar(agoraMs);
    atualizarRelogio(agoraMs);

    // Online: o taco que se vê é o meu na minha vez (e enquanto minha tacada toca); nas outras, o do jogador da vez.
    const online = sessao;
    const meuTaco = online === null || online.partida.minhaVez || online.partida.euTaco;
    if (online) {
      if (!meuTaco) online.miraRemota.atualizar(dt);
      else if (!eraMeuTaco) mira.definir(anguloVisual);
      online.emissor.atualizar(agoraMs, online.partida.minhaVez, mira.angulo, ponto.lateral, ponto.vertical, tacada.recuo, giz.passando || entrada.encadeandoGiz);
      const p = online.partida;
      if (p.estadoSala !== faixaDe.estado || p.meuLugar !== faixaDe.lugar || p.aguardandoSala !== faixaDe.aguardando || p.minhaVez !== faixaDe.minhaVez || p.conectado !== faixaDe.conectado) {
        faixaDe.estado = p.estadoSala;
        faixaDe.lugar = p.meuLugar;
        faixaDe.aguardando = p.aguardandoSala;
        faixaDe.minhaVez = p.minhaVez;
        faixaDe.conectado = p.conectado;
        hud.telas.definirVez(faixaDeAgora());
      }
      // O chat lê o relógio e monta listas: a ~4 Hz basta (uma linha que expira some com até 0,25 s de atraso).
      if (agoraMs >= proximoChatMs) {
        proximoChatMs = agoraMs + 250;
        hud.sala.atualizarChat(online.chat, Date.now(), p.estadoSala?.modo ?? '1x1');
        hud.emojis.atualizar(online.emojis, Date.now(), p.estadoSala?.modo ?? '1x1');
      }
    }
    eraMeuTaco = meuTaco;
    const remota = online && !meuTaco ? online.miraRemota : null;
    const efeitoVisual = remota ?? ponto;
    anguloVisual = remota ? remota.angulo : mira.angulo;

    const animando = tacada.fase === 'animando';
    // O taco que se vê usa a skin de quem o segura (a da sala, por lugar); no meio de uma tacada não troca. Mesmo PC: a clássica.
    if (!animando) {
      if (skinForcadaDoTaco !== null) trocarSkinDoTaco(skinForcadaDoTaco.skin, skinForcadaDoTaco.semente, skinForcadaDoTaco.bolas);
      else if (online) {
        const estadoDaSala = online.partida.estadoSala;
        const lugarDoSegurador = lugarDoTaco({ meuTaco, meuLugar: online.partida.meuLugar, lugarDaVez: online.partida.lugarDaVez });
        trocarSkinDoTaco(skinDoLugar(estadoDaSala, lugarDoSegurador), sementeDoLugar(estadoDaSala, lugarDoSegurador), bolasDoLugar(estadoDaSala, lugarDoSegurador));
      } else trocarSkinDoTaco(SKIN_PADRAO, null, null);
    }
    // L48: alguém da sala usa chapéu: o arquivo dos chapéus começa a baixar já, para o chapéu estar lá quando o balão aparecer.
    if (chapeus.estado === 'parado' && online && precisaDeChapeus(online.partida.estadoSala)) chapeus.pedir();
    // A luz que corre pelas gemas anda no relógio da página (um uniforme só, para todas as peças).
    definirTempoDoTaco(agoraMs / 1000);
    if (!animando) ancora.copy(bolao.position);
    // Treino: com a mão na mesa, ou a mesa limpa, não há taco (nem as mãos, que dependem dele).
    const semTacoNoTreino = treino !== null && (treino.modo !== 'mirar' || jogo.fase === 'fim');
    taco.visible = fimDaPartida.existe || semTacoNoTreino || menu3D ? false : animando ? seguimento.visivel : true;
    // Mirando, o taco sobe o mínimo para passar por cima da tabela, da moldura e das outras bolas (a ponta recua com o recuo);
    // tacando, fica na elevação que tinha. É só desenho: a física segue com `elevacao: 0`.
    // Passando o giz (o meu ou o do outro, pela mira dele) o taco recua da bola para a mão chegar na ponta.
    const recuoDoGiz = animacaoDoGiz.afasta * CONFIG_WEB.maos.giz.recuoDoTaco;
    const recuoMirando = (remota ? remota.recuo : tacada.recuo) + recuoDoGiz;
    if (!animando) {
      elevacaoDoTaco.definirBolas(jogo.mesa);
      elevacaoDoTaco.atualizar(dt, anguloVisual, efeitoVisual.lateral, efeitoVisual.vertical, recuoMirando, ancora.x, ancora.z);
    }
    const elevacaoDesenhada = elevacaoLivreLigada ? elevacaoDoTaco.atual : CONFIG_WEB.elevacaoDoTaco.minima;
    const recuoDesenhado = animando ? seguimento.recuo : (remota ? remota.recuo : tacada.recuo) + recuoDoGiz;
    posicionarTaco(taco, ancora, medidasBolao.raio, anguloVisual, elevacaoDesenhada, recuoDesenhado, efeitoVisual);
    // A ponta do taco mostra o giz de quem taca (o de quem assiste, de outra tela, não se sabe: cheio).
    definirGizDoTaco(taco, gizForcadoDoTaco ?? (remota ? 1 : giz.nivel));
    tacoParaACamera.elevacao = elevacaoDesenhada;
    tacoParaACamera.recuo = Math.max(recuoDesenhado, 0);

    if (fimDaPartida.existe) {
      const { fim, corpo } = CONFIG_WEB.baloes;
      poseDaCameraDoFim(
        {
          semiX: semi.x,
          semiZ: semi.z,
          folga: fim.folgaDaMesa,
          meiaLarguraDoBalao: corpo.raio * fim.tamanho * fim.estufa.largura,
          alturaDoBalao: fim.altura,
          meiaAlturaDoBalao: corpo.altura * fim.tamanho * fim.estufa.altura,
          campoDeVisaoGraus: camera.fov,
          aspecto: camera.aspect,
          elevacao: (fim.camera.elevacaoGraus * Math.PI) / 180,
          margem: fim.camera.margem,
        },
        poseDoFim,
      );
      rig.entrarNoFim(poseDoFim);
    }
    if (menu3D) {
      tempoDoMenuS += dt;
      // No nível baixo a câmera fica parada na primeira posição: nada anima de forma contínua.
      poseDoMenu(boteco.camerasDoMenu, tempoDoMenuS, CONFIG_WEB.boteco.menu.trechoS, controlador.nivel === 'baixa', poseDoMenuAgora);
      rig.entrarNoMenu(poseDoMenuAgora);
    } else {
      tempoDoMenuS = 0;
      rig.sairDoMenu();
    }
    if (vistaLivre && !vistaComMaos) {
      camera.position.set(...vistaLivre.posicao);
      camera.up.set(0, 1, 0);
      camera.lookAt(...vistaLivre.alvo);
    } else {
      rig.atualizar(dt, ancora, anguloVisual, tacoParaACamera);
    }
    // As mãos que seguram o taco, a minha na minha vez e a do outro na dele (L23), só enquanto o taco aparece (na batida e no
    // seguimento elas ficam e vão com ele; com as bolas andando somem e voltam na próxima mira). A câmera já está na pose deste quadro.
    const maosAtivas = taco.visible && jogo.fase !== 'fim' && (!vistaLivre || vistaComMaos) && !menu.visivel;
    // O balão fica à vista a vez inteira do outro, também com as bolas andando (a cara reage ao que acontece).
    const balaoAtivo = online !== null && !meuTaco && jogo.fase !== 'fim' && !vistaLivre && !menu.visivel;
    if (balaoAtivo) {
      const parado = !player.tocando && !transicao.ativa && tacada.fase !== 'animando';
      if (donoDoBalao === null || (parado && donoDoBalao.id !== jogo.jogadorDaVez.id)) trocarDonoDoBalao(jogo.jogadorDaVez);
    }
    // As reações: cada momento da gravação que toca (a minha ou a do outro) faz as mãos reagirem: bola numerada que cai (joinha ou
    // soco no ar), a branca que cai (a falta: tapinha) e a raspada na caçapa (as duas mãos abrem). As mãos aparecem para fazê-lo mesmo
    // com o taco já fora de cena e as bolas andando, e somem quando o gesto acaba ou a próxima mira começa.
    while (momentosVistos < momentosDoRosto.length && player.tocando && momentosDoRosto[momentosVistos]!.t <= (player.tempoS ?? 0)) {
      // Só o sorriso, o bravo e o susto da mesa são momentos das mãos; a comemoração e o alívio são só do rosto.
      const rostoDoMomento = momentosDoRosto[momentosVistos]!.rosto;
      if (jogo.fase !== 'fim' && !vistaLivre && !menu.visivel && rostoDoMomento in MOMENTO_DO_ROSTO) modeloDasMaos.reagir(MOMENTO_DO_ROSTO[rostoDoMomento as keyof typeof MOMENTO_DO_ROSTO]);
      momentosVistos++;
    }
    if (maosAtivas && !player.tocando && !transicao.ativa && tacada.fase !== 'animando') modeloDasMaos.cancelarReacao();
    const reacaoNoAr = modeloDasMaos.reacaoNoAr && jogo.fase !== 'fim' && !menu.visivel;
    let protegidas: readonly EsferaMutavel[] = soABranca;
    if (maosAtivas || reacaoNoAr || modeloDasMaos.escala > 0 || balaoAtivo || escalaDoBalao > 0) {
      projetorDaCamera.atualizar();
      modeloDasMaos.definirBolas(jogo.mesa, CONFIG_FISICA_PADRAO.bola.raio);
      brancaProtegida.x = ancora.x;
      brancaProtegida.y = ancora.y;
      brancaProtegida.z = ancora.z;
      const idMirada = primeiraBolaNaLinha(jogo.mesa, anguloVisual, configFisica);
      const mirada = idMirada === null ? undefined : jogo.mesa.bolas.find((b) => b.id === idMirada);
      if (mirada) {
        miradaProtegida.x = mirada.posicao.x;
        miradaProtegida.y = CONFIG_FISICA_PADRAO.bola.raio;
        miradaProtegida.z = mirada.posicao.z;
      }
      protegidas = mirada ? brancaEMirada : soABranca;
    }
    if (maosAtivas || reacaoNoAr || modeloDasMaos.escala > 0) {
      entradaDasMaos.x = ancora.x;
      entradaDasMaos.y = ancora.y;
      entradaDasMaos.z = ancora.z;
      entradaDasMaos.angulo = anguloVisual;
      entradaDasMaos.elevacao = elevacaoDesenhada;
      entradaDasMaos.recuo = recuoDesenhado;
      entradaDasMaos.lateral = efeitoVisual.lateral;
      entradaDasMaos.vertical = efeitoVisual.vertical;
      entradaDasMaos.ativas = maosAtivas || reacaoNoAr;
      entradaDasMaos.soAPonte = !maosAtivas && reacaoNoAr && modeloDasMaos.reacao?.ambas !== true;
      modeloDasMaos.atualizar(dt, entradaDasMaos, projetorDaCamera, protegidas);
      // As mãos do outro têm a cor da equipe dele (o dono do balão); as minhas, a de quem tem a vez.
      maos.definirCor(corDaEquipe(equipeForcadaDoBalao ?? (balaoAtivo && donoDoBalao ? donoDoBalao : jogo.jogadorDaVez).equipe));
    }
    // O giz é o de quem tem a vez: o meu (G) na minha, o que a mira do outro diz na dele.
    if (meuTaco) atualizarGiz(dt, agoraMs, giz.passando, entrada.encadeandoGiz, maosAtivas && !animando && tacada.fase === 'ociosa' && modeloDasMaos.escala > 0.3, maosAtivas, renderer.domElement.height);
    else atualizarGiz(dt, agoraMs, remota?.giz === true, false, maosAtivas && !animando && modeloDasMaos.escala > 0.3, maosAtivas, renderer.domElement.height);
    maos.posicionar(modeloDasMaos, dt);
    if (fimDaPartida.existe) atualizarBaloesDoFim(agoraMs, dt);
    else {
      maosDoFim.esconderTodas();
      atualizarBalao(dt, agoraMs, balaoAtivo, protegidas, anguloVisual);
    }
    const sinal = vigiaDaMira.atualizar(jogo.partida, jogo.mesa, mira.angulo, podeJogar() && jogo.fase === 'jogando' && !animando);
    if (sinal !== sinalMostrado) {
      sinalMostrado = sinal;
      marcarTacoErrado(taco, sinal.tipo === 'errada');
      hud.avisoMira.mostrar(sinal.tipo === 'errada' ? sinal.texto : '');
    }
    const liberado = modo !== 'menu' && !menu.visivel && jogo.fase === 'jogando' && !animando && treino === null;
    const realce = destaque.atualizar(jogo.partida, agoraMs, liberado, teclaB.segurando);
    if (realce.visivel) {
      const pulso = Math.sin((agoraMs / 1000) * 2 * Math.PI * CONFIG_WEB.destaque.pulsosPorSegundo);
      aneisDoDestaque.mostrar(realce.bolas, bolas.porId, realce.intensidade * (1 - CONFIG_WEB.destaque.pulsoOpacidade * (0.5 - 0.5 * pulso)), 1 + 0.04 * pulso);
      destaqueNaCena = true;
    } else if (destaqueNaCena) {
      aneisDoDestaque.esconder();
      destaqueNaCena = false;
    }
    desenharEditor(agoraMs);
    sincronizarLinha();
    entradaPrevisao.angulo = mira.angulo;
    entradaPrevisao.lateral = ponto.lateral;
    entradaPrevisao.vertical = ponto.vertical;
    entradaPrevisao.giz = giz.nivel;
    previsao.atualizar(agoraMs, jogo.fase === 'jogando' && !animando && podeJogar(), entradaPrevisao);
    if (previsao.erro !== erroDaPrevisao) {
      erroDaPrevisao = previsao.erro;
      if (erroDaPrevisao) console.warn(`Linha de previsão: ${erroDaPrevisao}`);
    }
    // Com as mãos em cena numa câmera livre, só agora a câmera sai do jogo: as contas acima usaram a câmera do jogo.
    if (vistaLivre && vistaComMaos) {
      camera.position.set(...vistaLivre.posicao);
      camera.up.set(0, 1, 0);
      camera.lookAt(...vistaLivre.alvo);
      camera.updateMatrixWorld(true);
    }
    ambiente.atualizar(camera);
    boteco.atualizar(camera, agoraMs);
    hud.miniBolao.atualizar(efeitoVisual.lateral, efeitoVisual.vertical, limiteSeguro(remota ? 1 : giz.nivel, configFisica));
    hud.giz.atualizar(giz.nivel, giz.passando);
    hud.forca.atualizar(tacada.fracaoDaForca, tacada.controle === 'linha' && tacada.fase === 'armada');
    // A loja e o perfil cobrem a tela inteira por cima do menu: o 3D por baixo pausa (o quadro de antes fica na tela).
    pausado3D = menu.visivel && (loja.aberta || perfil.aberto || meuBalao.aberto);
    if (!pausado3D) renderer.render(cena, camera);
    diag.atualizar(agoraMs);
  });

  // Tela inicial: o link de convite (?sala=) leva direto à sala, voltando ao mesmo lugar se este navegador já esteve nela.
  if (modo === 'local') {
    relogioLocal.reiniciar(performance.now());
    hud.mostrarBotaoMenu(true);
  } else {
    const convite = codigoDaUrl(busca);
    const guardado = convite === null ? null : armazem.ler(convite);
    if (convite !== null && guardado !== null) abrirSala({ tipo: 'entrar', nome: guardado.nome, codigo: convite });
    else if (convite !== null) menu.mostrarEntrar(convite);
    else menu.mostrarInicio();
  }

  return () => {
    renderer.setAnimationLoop(null);
    removerGancho();
    faixaDeAnuncio?.dispose();
    painelDev?.dispose();
    window.removeEventListener('keydown', aoTeclaDoTreino);
    arraste.dispose();
    aneisDoArraste.dispose();
    document.body.classList.remove('treino-sem-tacada');
    painelConfig.dispose();
    painelCreditos.dispose();
    window.removeEventListener('hashchange', aoMudarOHash);
    perfil.dispose();
    meuBalao.dispose();
    perguntaDeCarteira.dispose();
    diag.dispose();
    window.removeEventListener('keydown', aoApertarDiag);
    desligarPuloDoFim();
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    teclaB.dispose();
    transicao.cancelar();
    window.removeEventListener('pointerdown', pularTransicao, true);
    variantes.dispose();
    linhaPrevisao.dispose();
    window.removeEventListener('pointerdown', destravarAudio, true);
    window.removeEventListener('keydown', destravarAudio, true);
    for (const id of timersDeSom) window.clearTimeout(id);
    timersDeSom.clear();
    window.removeEventListener('online', aoVoltarARede);
    window.removeEventListener('pageshow', aoVoltarARede);
    document.removeEventListener('resume', aoVoltarARede);
    document.removeEventListener('visibilitychange', aoVoltarAAba);
    abaViva?.liberar();
    sessao?.cliente.sair();
    audio.dispose();
    boteco.dispose();
    window.removeEventListener('resize', aoRedimensionar);
    entrada.dispose();
    menu.dispose();
    hud.dispose();
    camadaDeEmojisDoBalao.dispose();
    descartar(cena);
    atlasDeCaras.dispose();
    ambiente.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// L49: o jogo mudou de endereço. No `*.workers.dev` a página só leva a carteira (no fragmento) ao endereço novo; nada do jogo sobe aqui, então
// nenhuma carteira nova nasce na origem antiga.
const desmontar = mudarParaOEnderecoNovo(window.location, armazenamentoLocal()) ? () => {} : iniciar();
import.meta.hot?.dispose(desmontar);
import.meta.hot?.accept();
