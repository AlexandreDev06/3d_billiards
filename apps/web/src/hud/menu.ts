import type { ModoSala } from '@sinuca/protocolo';
import { LIMITES_PROTOCOLO, TAMANHO_CODIGO } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { jogadoresDoHotSeat } from '../config';
import { CATALOGO, fraseDeQuemJoga, montarCatalogo } from '../lobby/catalogo';
import type { MudancaDeRegras, OndeSeLembra, RegrasDaSala } from '../lobby/regras-da-sala';
import { codigoValido, limparCodigo } from '../online/convite';
import { textoDeMoedas } from '../online/moedas';
import type { MissoesNaTela } from '../online/missoes-modelo';
import type { AssentoModelo, SalaModelo } from '../online/sala-modelo';
import { criarConfronto } from './confronto';
import { criarPainelDeMissoes, type PainelDeMissoes } from './missoes';
import type { ConfrontoNaTela, PlacarParaMostrar } from './confronto-modelo';
import { criarRegrasDaSala } from './regras-da-sala';
import { ICONE_ENGRENAGEM } from './icones';

/** Quanto tempo o "Expulsar?" fica esperando o sim antes de voltar ao botão (ms). */
const CONFIRMAR_EXPULSAO_MS = 5000;
/** De quanto em quanto tempo o painel de missões confere o relógio (ms): o texto "faltam N min" muda de minuto em minuto. */
const INTERVALO_DO_PAINEL_MS = 15_000;

export interface OpcoesMenu {
  /** O que as regras sabem jogar: um formato de uma modalidade só vem habilitado se `novaPartida` o aceita. */
  readonly disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean;
  readonly apelidoInicial: string;
  /** A última escolha de regras de cada tela (o navegador lembra; sem nada lembrado, o padrão): modalidade, formato, tempo, linha, giz e força. */
  readonly regrasLembradas: (onde: OndeSeLembra) => RegrasDaSala;
  /** Uma escolha foi feita: lembra para a próxima vez. */
  readonly aoLembrar: (onde: OndeSeLembra, regras: RegrasDaSala) => void;
  /** "Jogar" no mesmo PC com as regras escolhidas. */
  readonly aoJogarLocal: (regras: RegrasDaSala) => void;
  readonly aoCriar: (dados: { readonly nome: string; readonly regras: RegrasDaSala }) => void;
  /** "Loja" (L24): abre a loja de tacos sobre a tela de agora. */
  readonly aoAbrirLoja: () => void;
  /** O recado pendente da carteira (a do aparelho foi trocada por uma nova); `mostrarInicio` o mostra uma vez. */
  readonly avisoDaCarteira: () => string | null;
  /** O painel "Missões do dia" (L32) como está em `agoraMs`: o progresso da carteira, ou as missões do dia sem progresso. */
  readonly missoes: (agoraMs: number) => MissoesNaTela;
  /** O painel foi à tela, ou o dia virou com ele aberto: quem chama põe a carteira em dia (o painel se redesenha quando ela mudar). */
  readonly aoPrecisarDeMissoes: () => void;
  /** Anfitrião, na sala de espera: mudou alguma regra da sala (só o que mudou vem). */
  readonly aoConfigurarSala: (mudanca: MudancaDeRegras) => void;
  readonly aoEntrar: (dados: { readonly nome: string; readonly codigo: string }) => void;
  readonly aoEscolherLugar: (lugar: number | null) => void;
  /** Anfitrião, na sala de espera, já confirmado: tira a pessoa do `lugar`. */
  readonly aoExpulsar: (lugar: number) => void;
  readonly aoIniciar: () => void;
  readonly aoSair: () => void;
  /** A engrenagem do canto: abre as configurações (também servem antes de entrar numa sala). */
  readonly aoConfiguracoes: () => void;
  /** O placar do mesmo PC como está agora (`null` = nenhuma partida contada): "Jogar no mesmo PC" o mostra com o botão de zerar. */
  readonly placarDoMesmoPc: () => ConfrontoNaTela | null;
  /** "Zerar placar" do mesmo PC. */
  readonly aoZerarPlacarDoMesmoPc: () => void;
}

export interface Menu {
  readonly visivel: boolean;
  /** As três opções da tela inicial; `aviso` mostra o que aconteceu (sala encerrada, recusa...). */
  mostrarInicio(aviso?: string): void;
  /** Redesenha o painel de missões da tela inicial, se ela está aberta (a carteira mudou, o dia virou). */
  atualizarMissoes(): void;
  /** O texto do painel de missões da tela inicial, `null` com outra tela aberta (gancho de teste). */
  textoDasMissoes(): string | null;
  /** Formulário de criar sala: apelido e as regras da sala (modalidade, formato, tempo, linha, giz e força). */
  mostrarCriar(): void;
  /** Hot-seat: as mesmas regras e o botão de jogar; reabre com o que foi escolhido da última vez. */
  mostrarLocal(): void;
  /**
   * O anfitrião tirou esta pessoa da sala: "Voltar ao menu" ou "Entrar de novo" (pelo mesmo código e apelido, como entrada
   * nova). Quem chama já fechou a sessão.
   */
  mostrarExpulso(codigo: string, nome: string): void;
  /** Versão do jogo diferente da sala: só recarregar a página resolve (o texto é o da sala). */
  mostrarRecarregar(texto: string): void;
  /** Formulário de entrar com código (`codigo` já preenchido quando veio do link). */
  mostrarEntrar(codigo?: string, aviso?: string): void;
  mostrarConectando(texto: string): void;
  /** A sala de espera: lugares, link, as regras da sala (o anfitrião as muda; os outros veem o resumo) e o botão de iniciar (do anfitrião). */
  mostrarEspera(modelo: SalaModelo, link: string): void;
  /** Um aviso numa tela que já está aberta (erro de lugar ocupado, p.ex.). */
  mostrarAviso(texto: string): void;
  esconder(): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(texto: string, classe: string, aoClicar: () => void): HTMLButtonElement {
  const b = el('button', classe, texto);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

function campo(rotulo: string, entrada: HTMLElement): HTMLElement {
  const grupo = el('label', 'menu-campo');
  grupo.append(el('span', 'menu-campo-rotulo', rotulo), entrada);
  return grupo;
}

async function copiar(texto: string, campoDoLink?: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // sem permissão ou sem contexto seguro: seleciona o texto para o Ctrl+C
    if (campoDoLink) {
      campoDoLink.select();
      return document.execCommand('copy');
    }
    return false;
  }
}

/**
 * A tela inicial do jogo e a sala de espera, sobre a mesa. Só DOM: as decisões (o que a sala permite,
 * quem pode iniciar) vêm do modelo; cada botão chama um callback.
 */
export function criarMenu(pai: HTMLElement, opcoes: OpcoesMenu): Menu {
  const raiz = el('div', 'menu');
  raiz.hidden = true;
  const caixa = el('div', 'menu-caixa');
  const engrenagem = el('button', 'menu-engrenagem');
  engrenagem.type = 'button';
  engrenagem.title = 'Configurações (C)';
  engrenagem.setAttribute('aria-label', 'Configurações');
  engrenagem.innerHTML = ICONE_ENGRENAGEM;
  const aoClicarEngrenagem = (): void => {
    engrenagem.blur();
    opcoes.aoConfiguracoes();
  };
  engrenagem.addEventListener('click', aoClicarEngrenagem);
  raiz.append(caixa, engrenagem);
  pai.append(raiz);

  let apelido = opcoes.apelidoInicial;
  const catalogo = montarCatalogo(CATALOGO, opcoes.disponivel);
  /** O que cada tela escolheu da última vez (criar sala e mesmo PC lembram cada uma a sua; o navegador também). */
  const escolhidas: Record<OndeSeLembra, RegrasDaSala> = { sala: opcoes.regrasLembradas('sala'), local: opcoes.regrasLembradas('local') };
  let visivel = false;
  let avisoEl: HTMLElement | null = null;
  /** O histórico do placar na sala de espera abre e fecha sem fechar de novo a cada `estado-sala` que redesenha a tela. */
  let historicoAberto = false;
  /** O painel de missões da tela inicial (L32); `null` em qualquer outra tela. */
  let painelDeMissoes: PainelDeMissoes | null = null;
  /** Até quando vale o dia que o painel mostra: passou disso, o dia virou e a carteira precisa ser lida de novo. */
  let fimDoDiaMostrado = 0;
  const desenharMissoes = (): void => {
    if (painelDeMissoes === null) return;
    const agora = Date.now();
    const virou = fimDoDiaMostrado !== 0 && agora >= fimDoDiaMostrado;
    const modelo = opcoes.missoes(agora);
    fimDoDiaMostrado = modelo.fimMs;
    painelDeMissoes.atualizar(modelo);
    if (virou) opcoes.aoPrecisarDeMissoes();
  };
  /** O "faltam 3 h 20 min" anda de minuto em minuto; o dia vira com o lobby aberto. */
  const relogioDasMissoes = window.setInterval(() => {
    if (visivel && painelDeMissoes !== null && painelDeMissoes.raiz.isConnected) desenharMissoes();
  }, INTERVALO_DO_PAINEL_MS);

  /** Troca o conteúdo da caixa. O controle que estava em foco (`data-foco`) volta a ficar, para o teclado seguir de onde estava; devolve se voltou. */
  const mostrar = (...filhos: HTMLElement[]): boolean => {
    const foco = caixa.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.foco : undefined;
    painelDeMissoes = null;
    caixa.className = 'menu-caixa';
    caixa.replaceChildren(...filhos);
    raiz.hidden = false;
    visivel = true;
    document.body.classList.add('menu-aberto');
    const volta = foco === undefined ? null : caixa.querySelector<HTMLElement>(`[data-foco="${foco}"]`);
    volta?.focus();
    return volta !== null;
  };
  const cabecalho = (subtitulo: string): HTMLElement => {
    const c = el('div', 'menu-cabecalho');
    c.append(el('div', 'menu-titulo', 'Sinuca Par ou Ímpar'), el('div', 'menu-subtitulo', subtitulo));
    return c;
  };
  const aviso = (texto: string | undefined, alerta = true): HTMLElement => {
    const a = el('div', alerta ? 'menu-aviso' : 'menu-aviso neutro', texto ?? '');
    a.hidden = !texto;
    a.setAttribute('role', 'status');
    avisoEl = a;
    return a;
  };
  const campoDoApelido = (): HTMLInputElement => {
    const entrada = el('input', 'menu-entrada');
    entrada.type = 'text';
    entrada.maxLength = LIMITES_PROTOCOLO.nome;
    entrada.placeholder = 'Como te chamam na mesa';
    entrada.name = 'apelido';
    entrada.autocomplete = 'off';
    entrada.value = apelido;
    entrada.addEventListener('input', () => (apelido = entrada.value));
    return entrada;
  };
  const nomeValido = (entrada: HTMLInputElement): string | null => {
    const nome = entrada.value.trim();
    if (nome === '') {
      entrada.focus();
      menu.mostrarAviso('Diga seu apelido para os outros saberem quem é.');
      return null;
    }
    return nome;
  };
  const aoEnter = (entrada: HTMLInputElement, acao: () => void): void => {
    entrada.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        acao();
      }
    });
  };

  /** O bloco das regras da sala (modalidade, formato, tempo, linha, giz e força) das telas de criar sala e do mesmo PC: a escolha aparece na hora e fica lembrada. */
  const regrasDe = (onde: OndeSeLembra): HTMLElement => {
    const painel = criarRegrasDaSala({
      regras: escolhidas[onde],
      catalogo,
      naSala: onde === 'sala',
      otimista: true,
      editavel: true,
      disponivel: opcoes.disponivel,
      comAposta: onde === 'sala',
      dicaDoFormato: onde === 'local' ? (r) => `${fraseDeQuemJoga(jogadoresDoHotSeat(r.modo))}${jogadoresDoHotSeat(r.modo).length > 2 ? ' Cada um tem as suas configurações (⚙).' : ''}` : undefined,
      aoMudar: (_mudanca, regras) => {
        escolhidas[onde] = regras;
        opcoes.aoLembrar(onde, regras);
      },
    });
    painel.raiz.dataset.onde = onde;
    return painel.raiz;
  };

  /** O botão "Expulsar" do anfitrião; um clique pede a confirmação ("Expulsar? Sim / Não") e ela some sozinha depois de um tempo. */
  const controleDeExpulsao = (a: AssentoModelo): HTMLElement => {
    const caixaDoControle = el('span', 'menu-lugar-expulsar');
    const mostrarBotao = (): void => {
      const expulsar = botao('Expulsar', 'menu-lugar-expulsar-botao', () => pedirConfirmacao());
      expulsar.setAttribute('aria-label', `Expulsar ${a.nome ?? 'jogador'} da sala`);
      caixaDoControle.replaceChildren(expulsar);
    };
    let desistir: ReturnType<typeof setTimeout> | undefined;
    const pedirConfirmacao = (): void => {
      const sim = botao('Sim', 'menu-lugar-expulsar-sim', () => {
        clearTimeout(desistir);
        opcoes.aoExpulsar(a.lugar);
      });
      sim.setAttribute('aria-label', `Sim, expulsar ${a.nome ?? 'jogador'}`);
      const nao = botao('Não', 'menu-lugar-expulsar-nao', () => {
        clearTimeout(desistir);
        mostrarBotao();
      });
      caixaDoControle.replaceChildren(el('span', 'menu-lugar-expulsar-pergunta', 'Expulsar?'), sim, nao);
      sim.focus();
      desistir = setTimeout(mostrarBotao, CONFIRMAR_EXPULSAO_MS);
    };
    mostrarBotao();
    return caixaDoControle;
  };

  /** O cartão de um lugar da sala de espera: o nome, a presença, "Sentar aqui" (vago) e "Expulsar" (do anfitrião). */
  const cartaoDoLugar = (a: AssentoModelo): HTMLElement => {
    const cartao = el('div', `menu-lugar equipe-${a.equipe}`);
    cartao.dataset.lugar = String(a.lugar);
    cartao.classList.toggle('vago', a.nome === null);
    cartao.classList.toggle('meu', a.meu);
    const topo = el('div', 'menu-lugar-topo');
    if (a.anfitriao) topo.append(el('span', 'menu-lugar-selo', 'anfitrião'));
    if (a.podeExpulsar) topo.append(controleDeExpulsao(a));
    cartao.append(topo);
    if (a.nome === null) {
      cartao.append(el('div', 'menu-lugar-nome', 'Vago'));
      if (a.podeSentar) cartao.append(botao('Sentar aqui', 'menu-botao pequeno', () => opcoes.aoEscolherLugar(a.lugar)));
    } else {
      const nome = el('div', 'menu-lugar-nome');
      const presenca = el('span', 'placar-presenca');
      presenca.dataset.estado = a.conectado ? 'online' : 'caiu';
      nome.append(presenca, a.nome);
      if (a.meu) nome.append(el('span', 'placar-voce', 'você'));
      nome.append(el('span', `menu-lugar-saldo${a.saldo !== null && a.saldo < 0 ? ' negativo' : ''}`, a.saldo === null ? 'sem carteira' : textoDeMoedas(a.saldo)));
      cartao.append(nome);
      if (!a.conectado) cartao.append(el('div', 'menu-lugar-detalhe', 'desconectado'));
    }
    return cartao;
  };

  /** O placar da sala na espera: o confronto de quem está sentado em destaque e, recolhível, o histórico. `null` antes da primeira partida. */
  const blocoDoPlacarDaSala = (placar: PlacarParaMostrar): HTMLElement | null => {
    if (!placar.contou || placar.atual === null) return null;
    const bloco = el('div', 'menu-placar');
    const topo = el('div', 'menu-placar-topo');
    topo.append(el('span', 'menu-campo-rotulo', `Placar da sala · ${placar.atual.rotuloDaModalidade}`));
    if (placar.novo) topo.append(el('span', 'menu-placar-novo', 'confronto novo'));
    bloco.append(topo, criarConfronto(placar.atual, 'grande'));
    if (placar.historico.length === 0) return bloco;
    const lista = el('ul', 'menu-historico');
    lista.hidden = !historicoAberto;
    for (const confronto of placar.historico) {
      const item = el('li', 'menu-historico-item');
      item.append(criarConfronto(confronto, 'linha'));
      lista.append(item);
    }
    const alternar = el('button', 'menu-historico-botao');
    alternar.type = 'button';
    const desenharBotao = (): void => {
      alternar.textContent = `Histórico (${placar.historico.length}) ${historicoAberto ? '▴' : '▾'}`;
      alternar.setAttribute('aria-expanded', String(historicoAberto));
    };
    desenharBotao();
    alternar.addEventListener('click', () => {
      historicoAberto = !historicoAberto;
      lista.hidden = !historicoAberto;
      desenharBotao();
    });
    topo.append(alternar);
    bloco.append(lista);
    return bloco;
  };

  /** O placar do mesmo PC em "Jogar no mesmo PC", com "Zerar placar". `null` sem partida contada. */
  const blocoDoPlacarLocal = (): HTMLElement | null => {
    const placar = opcoes.placarDoMesmoPc();
    if (placar === null) return null;
    const bloco = el('div', 'menu-placar');
    const topo = el('div', 'menu-placar-topo');
    topo.append(el('span', 'menu-campo-rotulo', `Placar do mesmo PC · ${placar.rotuloDaModalidade}`), botao('Zerar placar', 'menu-historico-botao', () => {
      opcoes.aoZerarPlacarDoMesmoPc();
      menu.mostrarLocal();
    }));
    bloco.append(topo, criarConfronto(placar, 'grande'));
    return bloco;
  };

  const menu: Menu = {
    get visivel() {
      return visivel;
    },

    mostrarInicio(texto) {
      const jogarLocal = botao('Jogar no mesmo PC', 'menu-botao principal', () => menu.mostrarLocal());
      const criar = botao('Criar sala', 'menu-botao', () => menu.mostrarCriar());
      const entrar = botao('Entrar com código', 'menu-botao', () => menu.mostrarEntrar());
      const loja = botao('Loja de tacos', 'menu-botao', opcoes.aoAbrirLoja);
      loja.dataset.foco = 'loja';
      const lista = el('div', 'menu-opcoes');
      lista.append(jogarLocal, criar, entrar, loja);
      const missoes = criarPainelDeMissoes();
      mostrar(cabecalho('Escolha como jogar'), aviso(texto ?? opcoes.avisoDaCarteira() ?? undefined), lista, missoes.raiz);
      painelDeMissoes = missoes;
      fimDoDiaMostrado = 0;
      desenharMissoes();
      // Voltar ao lobby é hora de pôr a carteira em dia: o progresso das missões mudou na última partida.
      opcoes.aoPrecisarDeMissoes();
      jogarLocal.focus();
    },

    atualizarMissoes: desenharMissoes,
    textoDasMissoes: () => (painelDeMissoes === null ? null : painelDeMissoes.texto()),

    mostrarEntrar(codigo = '', texto) {
      const nome = campoDoApelido();
      const entradaCodigo = el('input', 'menu-entrada codigo');
      entradaCodigo.type = 'text';
      entradaCodigo.maxLength = TAMANHO_CODIGO + 2;
      entradaCodigo.placeholder = 'K7M2P';
      entradaCodigo.autocomplete = 'off';
      entradaCodigo.name = 'codigo';
      entradaCodigo.spellcheck = false;
      entradaCodigo.value = codigo;
      const enviar = (): void => {
        const nomeLimpo = nomeValido(nome);
        if (nomeLimpo === null) return;
        if (!codigoValido(entradaCodigo.value)) {
          entradaCodigo.focus();
          menu.mostrarAviso(`O código tem ${TAMANHO_CODIGO} letras e números (sem 0, 1, I, L e O).`);
          return;
        }
        opcoes.aoEntrar({ nome: nomeLimpo, codigo: limparCodigo(entradaCodigo.value) });
      };
      aoEnter(nome, enviar);
      aoEnter(entradaCodigo, enviar);
      const acoes = el('div', 'menu-acoes');
      acoes.append(
        botao('Voltar', 'menu-botao', () => menu.mostrarInicio()),
        botao('Entrar', 'menu-botao principal', enviar),
      );
      mostrar(cabecalho('Entrar numa sala'), aviso(texto), campo('Apelido', nome), campo('Código da sala', entradaCodigo), acoes);
      (codigo === '' ? entradaCodigo : nome.value === '' ? nome : entradaCodigo).focus();
    },

    mostrarCriar() {
      const nome = campoDoApelido();
      const enviar = (): void => {
        const nomeLimpo = nomeValido(nome);
        if (nomeLimpo !== null) opcoes.aoCriar({ nome: nomeLimpo, regras: escolhidas.sala });
      };
      aoEnter(nome, enviar);
      const acoes = el('div', 'menu-acoes');
      acoes.append(
        botao('Voltar', 'menu-botao', () => menu.mostrarInicio()),
        botao('Criar sala', 'menu-botao principal', enviar),
      );
      mostrar(cabecalho('Criar uma sala'), aviso(undefined), campo('Apelido', nome), regrasDe('sala'), acoes);
      caixa.classList.add('com-regras');
      nome.focus();
    },

    mostrarLocal() {
      const jogar = botao('Jogar', 'menu-botao principal', () => opcoes.aoJogarLocal(escolhidas.local));
      const acoes = el('div', 'menu-acoes');
      acoes.append(botao('Voltar', 'menu-botao', () => menu.mostrarInicio()), jogar);
      const placarLocal = blocoDoPlacarLocal();
      mostrar(cabecalho('Jogar no mesmo PC'), aviso(undefined), ...(placarLocal === null ? [] : [placarLocal]), regrasDe('local'), acoes);
      caixa.classList.add('com-regras');
      jogar.focus();
    },

    mostrarExpulso(codigo, nome) {
      const voltar = botao('Voltar ao menu', 'menu-botao', () => menu.mostrarInicio());
      const entrarDeNovo = botao('Entrar de novo', 'menu-botao principal', () => opcoes.aoEntrar({ nome, codigo }));
      const acoes = el('div', 'menu-acoes');
      acoes.append(voltar, entrarDeNovo);
      mostrar(
        cabecalho('Você foi removido da sala'),
        aviso(`O anfitrião tirou você da sala ${codigo}. Se foi engano, dá para entrar de novo pelo mesmo link.`, false),
        acoes,
      );
      voltar.focus();
    },

    mostrarRecarregar(texto) {
      const recarregar = botao('Recarregar a página', 'menu-botao principal', () => window.location.reload());
      const acoes = el('div', 'menu-acoes');
      acoes.append(recarregar);
      mostrar(cabecalho('O jogo mudou de versão'), aviso(texto), acoes);
      recarregar.focus();
    },

    mostrarConectando(texto) {
      mostrar(cabecalho(texto), aviso(undefined), el('div', 'menu-carregando'));
    },

    mostrarEspera(modelo, link) {
      const codigo = el('div', 'menu-codigo');
      codigo.append(el('span', 'menu-codigo-rotulo', 'Código da sala'), el('span', 'menu-codigo-valor', modelo.codigo));

      const campoDoLink = el('input', 'menu-entrada link');
      campoDoLink.type = 'text';
      campoDoLink.readOnly = true;
      campoDoLink.name = 'link';
      campoDoLink.value = link;
      campoDoLink.addEventListener('focus', () => campoDoLink.select());
      const copiarBotao = botao('Copiar link', 'menu-botao', () => {
        void copiar(link, campoDoLink).then((ok) => {
          copiarBotao.textContent = ok ? 'Link copiado!' : 'Selecione e copie (Ctrl+C)';
          setTimeout(() => (copiarBotao.textContent = 'Copiar link'), 2200);
        });
      });
      campoDoLink.title = 'Mande este link para os amigos';
      campoDoLink.setAttribute('aria-label', 'Link da sala: mande para os amigos');
      // O código e o link na mesma linha: a sala de espera de quatro tem de caber em 720 px.
      const convite = el('div', 'menu-convite');
      convite.append(codigo, campoDoLink, copiarBotao);

      const lugares = el('div', `menu-lugares modo-${modelo.modo}`);
      if (modelo.equipes.length === 0) {
        for (const a of modelo.assentos) lugares.append(cartaoDoLugar(a));
      } else {
        // 2x1 e 2x2: uma coluna por equipe (a de 2 e a de 1 lado a lado).
        lugares.classList.add('por-equipe');
        for (const equipe of modelo.equipes) {
          const coluna = el('div', `menu-equipe equipe-${equipe.equipe}`);
          coluna.dataset.equipe = String(equipe.equipe);
          const titulo = el('div', 'menu-equipe-titulo');
          titulo.append(el('span', 'menu-equipe-nome', equipe.rotulo), el('span', 'menu-equipe-tamanho', equipe.assentos.length === 1 ? 'sozinho' : 'dupla'));
          coluna.append(titulo, ...equipe.assentos.map(cartaoDoLugar));
          lugares.append(coluna);
        }
      }

      // As regras da sala: o anfitrião muda (e a sala avisa todos, que redesenham); os outros só veem o que está valendo.
      const regras = criarRegrasDaSala({
        regras: modelo.regras,
        catalogo,
        naSala: true,
        otimista: false,
        editavel: modelo.podeConfigurar,
        disponivel: opcoes.disponivel,
        aoMudar: (mudanca, novas) => {
          opcoes.aoConfigurarSala(mudanca);
          opcoes.aoLembrar('sala', novas);
        },
      });
      regras.raiz.dataset.onde = 'espera';

      const acoes = el('div', 'menu-acoes');
      acoes.append(botao('Sair da sala', 'menu-botao', opcoes.aoSair));
      const loja = botao('Loja', 'menu-botao', opcoes.aoAbrirLoja);
      loja.dataset.foco = 'loja';
      acoes.append(loja);
      const iniciar = botao('Iniciar partida', 'menu-botao principal', opcoes.aoIniciar);
      if (modelo.podeIniciar) acoes.append(iniciar);
      const situacao = el('div', 'menu-situacao', modelo.aviso);
      if (modelo.souEspectador) situacao.textContent = 'Você está assistindo. Sente num lugar vago se houver.';
      else if (modelo.espectadores > 0) situacao.textContent += ` · ${modelo.espectadores} assistindo`;
      // O aviso e os botões na mesma linha: a sala de espera de quatro tem de caber em 720 px.
      const rodape = el('div', 'menu-rodape');
      rodape.append(situacao, acoes);

      const placar = blocoDoPlacarDaSala(modelo.placar);
      const manteveFoco = mostrar(cabecalho(modelo.titulo), aviso(undefined), convite, lugares, ...(placar === null ? [] : [placar]), regras.raiz, rodape);
      caixa.classList.add('espera', 'com-regras');
      if (modelo.podeIniciar && !manteveFoco) iniciar.focus();
    },

    mostrarAviso(texto) {
      if (!avisoEl) return;
      avisoEl.textContent = texto;
      avisoEl.hidden = texto === '';
    },

    esconder() {
      raiz.hidden = true;
      visivel = false;
      document.body.classList.remove('menu-aberto');
    },

    dispose() {
      window.clearInterval(relogioDasMissoes);
      engrenagem.removeEventListener('click', aoClicarEngrenagem);
      document.body.classList.remove('menu-aberto');
      raiz.remove();
    },
  };

  return menu;
}
