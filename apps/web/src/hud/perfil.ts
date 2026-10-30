import { aparenciaDoTaco } from '../cena/aparencia-do-taco';
import type { CarteiraDoAparelho, ResultadoDaCarteira } from '../online/carteira';
import type { ContaDoAparelho, FalhaDaConta } from '../online/conta';
import { textoDaEspera } from '../online/conta-modelo';
import { AVISO_DO_LINK } from '../online/levar-carteira';
import { AVISO_PERFIL_FORA_DO_AR, SEM_PARTIDAS_NO_PERFIL, perfilNaTela, type PerfilNaTela } from '../online/perfil-modelo';
import { CATEGORIAS_DO_BALAO, textoDoCampoDoBalao } from '../online/balao-modelo';
import { copiarTexto } from './copiar-texto';
import { ICONES_DO_MENU } from './icones';
import { criarCanvasDaMiniatura } from './miniatura-do-taco';

export interface OpcoesDoPerfil {
  /** O apelido que o jogador digitou no menu (o mesmo da barra de cima). */
  readonly apelido: () => string;
  /** O endereço da página sem busca nem fragmento: a base do link da carteira. */
  readonly base: () => string;
  /** O jogador quer personalizar o balão (L48): o jogo fecha o perfil e abre o editor "Meu balão". Sem isto o bloco do balão não aparece. */
  readonly aoAbrirMeuBalao?: () => void;
  /** A conta da Beco Games (L62): sem isto o bloco "Conta" não aparece. */
  readonly conta?: ContaDoAparelho;
  /** Falso dentro de uma sala: criar, entrar, sair e excluir ficam desligados (a identidade da mesa não troca no meio dela). */
  readonly podeMudarDeConta?: () => boolean;
  readonly aoCriarConta?: () => void;
  readonly aoEntrarNaConta?: () => void;
  /** "Sair": o jogo apaga a sessão e o código, cria a carteira nova e volta ao menu. `null` = deu certo; senão a falha para mostrar. */
  readonly aoSair?: () => Promise<FalhaDaConta | null>;
  /** "Excluir minha conta", já com a senha e confirmado no segundo botão. `null` = deu certo. */
  readonly aoExcluir?: (senha: string) => Promise<FalhaDaConta | null>;
}

export interface Perfil {
  readonly aberto: boolean;
  abrir(): void;
  fechar(): void;
  /**
   * O que o perfil mostra agora, em texto, para o gancho de teste. NUNCA leva o link nem o código da carteira: só diz se o link
   * está à mostra.
   */
  texto(): string;
  /** O bloco do link da carteira está aberto? */
  readonly linkAberto: boolean;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** A miniatura do taco em uso, em pixels CSS; o canvas leva o `devicePixelRatio`. */
const MINIATURA = { largura: 260, altura: 34 } as const;
/** Quanto tempo o "Link copiado!" fica no botão. */
const COPIADO_MS = 2200;

/**
 * O perfil do jogador (L43): o apelido, o taco em uso, quantas skins tem e as estatísticas da carteira (partidas, vitórias e
 * aproveitamento, bolas, maior sequência, tabeladas, missões e moedas ganhas), no total e por modalidade. Abre sobre qualquer tela do
 * menu, como a loja, e ali também se leva a carteira para outro aparelho ("Levar minha carteira": um link com o código no fragmento).
 * Só DOM: os textos vêm de `perfilNaTela`. O código da carteira só passa por `linkParaLevar`, direto para o campo do link.
 */
export function criarPerfil(pai: HTMLElement, carteira: CarteiraDoAparelho, opcoes: OpcoesDoPerfil): Perfil {
  const raiz = el('div', 'perfil');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'perfil-titulo');
  const caixa = el('div', 'perfil-caixa');

  const topo = el('div', 'perfil-topo');
  const titulo = el('h2', 'perfil-titulo', 'Perfil');
  titulo.id = 'perfil-titulo';
  const fechar = el('button', 'perfil-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar o perfil');
  topo.append(titulo, fechar);

  // Os avisos da carteira, como os da loja: a carteira nova (com "Entendi") e a sala fora do ar (com "Tentar de novo").
  const aviso = el('div', 'perfil-aviso');
  aviso.hidden = true;
  const avisoTexto = el('span', 'perfil-aviso-texto');
  const entendi = el('button', 'menu-botao perfil-botao pequeno', 'Entendi');
  entendi.type = 'button';
  entendi.addEventListener('click', () => carteira.dispensarAviso());
  aviso.append(avisoTexto, entendi);

  const fora = el('div', 'perfil-fora');
  fora.hidden = true;
  fora.setAttribute('role', 'alert');
  const foraTexto = el('span', 'perfil-fora-texto');
  const tentar = el('button', 'menu-botao perfil-botao pequeno', 'Tentar de novo');
  tentar.type = 'button';
  fora.append(foraTexto, tentar);

  const rolagem = el('div', 'perfil-rolagem');

  // Quem é: o apelido, o taco em uso (com a miniatura) e quantas skins tem.
  const identidade = el('section', 'perfil-identidade');
  identidade.setAttribute('aria-label', 'Quem é você na mesa');
  const fichaApelido = el('div', 'perfil-ficha apelido');
  const apelidoIcone = el('span', 'perfil-ficha-icone');
  apelidoIcone.innerHTML = ICONES_DO_MENU.jogador;
  const apelidoValor = el('span', 'perfil-apelido');
  fichaApelido.append(apelidoIcone, el('span', 'perfil-ficha-rotulo', 'Apelido'), apelidoValor);
  const fichaTaco = el('div', 'perfil-ficha taco');
  const tacoCaixa = el('span', 'perfil-miniatura-caixa');
  const tacoNome = el('span', 'perfil-taco-nome');
  fichaTaco.append(el('span', 'perfil-ficha-rotulo', 'Taco em uso'), tacoCaixa, tacoNome);
  const fichaSkins = el('div', 'perfil-ficha skins');
  const skinsValor = el('span', 'perfil-skins');
  fichaSkins.append(el('span', 'perfil-ficha-rotulo', 'Tacos que você tem'), skinsValor);
  identidade.append(fichaApelido, fichaTaco, fichaSkins);

  // O balão que a sala guarda para mim (L48), com o botão que abre o editor "Meu balão".
  const balao = el('section', 'perfil-balao');
  balao.setAttribute('aria-labelledby', 'perfil-balao-titulo');
  balao.hidden = opcoes.aoAbrirMeuBalao === undefined;
  const balaoTitulo = el('h3', 'perfil-secao-titulo', 'Meu balão');
  balaoTitulo.id = 'perfil-balao-titulo';
  const balaoResumo = el('p', 'perfil-balao-resumo');
  const balaoBotao = el('button', 'menu-botao perfil-botao', 'Personalizar o balão');
  balaoBotao.type = 'button';
  balaoBotao.addEventListener('click', () => opcoes.aoAbrirMeuBalao?.());
  balao.append(balaoTitulo, balaoResumo, balaoBotao);

  // As estatísticas.
  const estatisticas = el('section', 'perfil-estatisticas');
  estatisticas.setAttribute('aria-labelledby', 'perfil-estatisticas-titulo');
  const estatisticasTitulo = el('h3', 'perfil-secao-titulo', 'Estatísticas');
  estatisticasTitulo.id = 'perfil-estatisticas-titulo';
  const estatisticasCorpo = el('div', 'perfil-estatisticas-corpo');
  const nota = el('p', 'perfil-nota');
  estatisticas.append(estatisticasTitulo, estatisticasCorpo, nota);

  // Levar a carteira para outro aparelho.
  const levar = el('section', 'perfil-levar');
  levar.setAttribute('aria-labelledby', 'perfil-levar-titulo');
  const levarTitulo = el('h3', 'perfil-secao-titulo', 'Outro aparelho');
  levarTitulo.id = 'perfil-levar-titulo';
  const levarBotao = el('button', 'menu-botao perfil-botao', 'Levar minha carteira');
  levarBotao.type = 'button';
  levarBotao.setAttribute('aria-expanded', 'false');
  levarBotao.setAttribute('aria-controls', 'perfil-levar-aberto');
  const levarDica = el('p', 'perfil-levar-dica', 'Gere um link para usar as suas moedas e os seus tacos em outro aparelho, ou depois de a sala mudar de endereço.');
  const levarAberto = el('div', 'perfil-levar-aberto');
  levarAberto.id = 'perfil-levar-aberto';
  levarAberto.hidden = true;
  const levarAlerta = el('p', 'perfil-levar-alerta', `${AVISO_DO_LINK}.`);
  levarAlerta.setAttribute('role', 'alert');
  const linhaDoLink = el('div', 'perfil-levar-linha');
  const campoDoLink = el('input', 'menu-entrada perfil-levar-campo');
  campoDoLink.type = 'text';
  campoDoLink.readOnly = true;
  campoDoLink.name = 'link-da-carteira';
  campoDoLink.autocomplete = 'off';
  campoDoLink.spellcheck = false;
  campoDoLink.setAttribute('aria-label', 'Link da sua carteira: quem o tiver usa as suas moedas e os seus tacos');
  campoDoLink.addEventListener('focus', () => campoDoLink.select());
  const copiarBotao = el('button', 'menu-botao perfil-botao principal', 'Copiar link');
  copiarBotao.type = 'button';
  const esconderBotao = el('button', 'menu-botao perfil-botao', 'Esconder');
  esconderBotao.type = 'button';
  linhaDoLink.append(campoDoLink, copiarBotao, esconderBotao);
  const levarPasso = el('p', 'perfil-levar-dica', 'Abra o link no outro aparelho: ele pergunta antes de trocar a carteira de lá.');
  levarAberto.append(levarAlerta, linhaDoLink, levarPasso);
  levar.append(levarTitulo, levarDica, levarBotao, levarAberto);

  // A conta da Beco Games (L62): criar e entrar para o convidado; nome, e-mail, sair e excluir para quem tem conta.
  const contaSecao = el('section', 'perfil-conta');
  contaSecao.setAttribute('aria-labelledby', 'perfil-conta-titulo');
  contaSecao.hidden = opcoes.conta === undefined;
  const contaTitulo = el('h3', 'perfil-secao-titulo', 'Conta Beco Games');
  contaTitulo.id = 'perfil-conta-titulo';
  const contaConvidado = el('div', 'perfil-conta-convidado');
  const contaConvidadoTexto = el('p', 'perfil-levar-dica', 'Você joga como convidado: as suas moedas e os seus tacos ficam só neste navegador. Com uma conta eles valem em qualquer aparelho.');
  const contaConvidadoBotoes = el('div', 'perfil-conta-linha');
  const criarContaBotao = el('button', 'menu-botao perfil-botao principal', 'Criar conta');
  criarContaBotao.type = 'button';
  const entrarContaBotao = el('button', 'menu-botao perfil-botao', 'Entrar');
  entrarContaBotao.type = 'button';
  contaConvidadoBotoes.append(criarContaBotao, entrarContaBotao);
  contaConvidado.append(contaConvidadoTexto, contaConvidadoBotoes);

  const contaLogada = el('div', 'perfil-conta-logada');
  const nomeRotulo = el('label', 'perfil-conta-rotulo', 'Nome na mesa');
  const nomeLinha = el('div', 'perfil-conta-linha');
  const nomeCampo = el('input', 'menu-entrada perfil-conta-campo');
  nomeCampo.type = 'text';
  nomeCampo.name = 'nome';
  nomeCampo.maxLength = 20;
  nomeCampo.setAttribute('autocomplete', 'nickname');
  nomeCampo.spellcheck = false;
  nomeCampo.id = 'perfil-conta-nome';
  nomeRotulo.htmlFor = nomeCampo.id;
  const nomeBotao = el('button', 'menu-botao perfil-botao', 'Salvar nome');
  nomeBotao.type = 'button';
  nomeLinha.append(nomeCampo, nomeBotao);
  const emailLinha = el('p', 'perfil-conta-email');
  const contaAcoes = el('div', 'perfil-conta-linha');
  const sairBotao = el('button', 'menu-botao perfil-botao', 'Sair');
  sairBotao.type = 'button';
  const excluirBotao = el('button', 'menu-botao perfil-botao perigo', 'Excluir minha conta');
  excluirBotao.type = 'button';
  contaAcoes.append(sairBotao, excluirBotao);
  const excluirAberto = el('div', 'perfil-conta-excluir');
  excluirAberto.hidden = true;
  const excluirAlerta = el('p', 'perfil-levar-alerta', 'Isto apaga a sua conta, o seu e-mail e as suas moedas e itens. Não tem volta.');
  excluirAlerta.setAttribute('role', 'alert');
  const senhaRotulo = el('label', 'perfil-conta-rotulo', 'Digite a sua senha para confirmar');
  const senhaCampo = el('input', 'menu-entrada perfil-conta-campo');
  senhaCampo.type = 'password';
  senhaCampo.name = 'senha';
  senhaCampo.autocomplete = 'current-password';
  senhaCampo.maxLength = 128;
  senhaCampo.id = 'perfil-conta-senha';
  senhaRotulo.htmlFor = senhaCampo.id;
  const excluirLinha = el('div', 'perfil-conta-linha');
  const excluirConfirmar = el('button', 'menu-botao perfil-botao perigo', 'Excluir de vez');
  excluirConfirmar.type = 'button';
  const excluirCancelar = el('button', 'menu-botao perfil-botao', 'Cancelar');
  excluirCancelar.type = 'button';
  excluirLinha.append(excluirConfirmar, excluirCancelar);
  excluirAberto.append(excluirAlerta, senhaRotulo, senhaCampo, excluirLinha);
  contaLogada.append(nomeRotulo, nomeLinha, emailLinha, contaAcoes, excluirAberto);
  const contaMsg = el('p', 'perfil-conta-msg');
  contaMsg.setAttribute('role', 'status');
  contaMsg.hidden = true;
  contaSecao.append(contaTitulo, contaConvidado, contaLogada, contaMsg);

  rolagem.append(identidade, contaSecao, balao, estatisticas, levar);
  caixa.append(topo, aviso, fora, rolagem);
  raiz.append(caixa);
  pai.append(raiz);

  let aberto = false;
  let lendo = false;
  let linkAberto = false;
  let focoAnterior: HTMLElement | null = null;
  let desassinar: (() => void) | null = null;
  let temporizadorDoCopiado: number | null = null;
  let chaveDaMiniatura = '';
  let excluindo = false;
  let contaOcupada = false;
  let ultimo: PerfilNaTela = perfilNaTela(null, '');

  const desenharEstatisticas = (p: PerfilNaTela): void => {
    if (!p.temCarteira) {
      estatisticasCorpo.replaceChildren(el('p', 'perfil-vazio', lendo ? 'Lendo a sua carteira…' : 'Sem carteira lida: as estatísticas moram nela.'));
      return;
    }
    const e = p.estatisticas;
    if (e.vazio) {
      const texto = e.semDadosDaSala ? 'Esta sala ainda não manda as estatísticas.' : SEM_PARTIDAS_NO_PERFIL;
      estatisticasCorpo.replaceChildren(el('p', 'perfil-vazio', texto));
      return;
    }
    const tabela = el('table', 'perfil-tabela');
    const legenda = el('caption', 'perfil-tabela-legenda', 'Estatísticas das partidas online, no total e por modalidade');
    const cabeca = el('thead', '');
    const linhaDaCabeca = el('tr', '');
    linhaDaCabeca.append(el('td', 'perfil-canto'));
    for (const c of e.colunas) {
      const th = el('th', `perfil-coluna${c.id === 'total' ? ' total' : ''}`, c.rotulo);
      th.scope = 'col';
      th.dataset.coluna = c.id;
      linhaDaCabeca.append(th);
    }
    cabeca.append(linhaDaCabeca);
    const corpo = el('tbody', '');
    for (const l of e.linhas) {
      const tr = el('tr', `perfil-linha linha-${l.chave}`);
      const th = el('th', 'perfil-rotulo', l.rotulo);
      th.scope = 'row';
      th.title = l.dica;
      tr.append(th);
      l.valores.forEach((v, i) => {
        const td = el('td', `perfil-valor${e.colunas[i]!.id === 'total' ? ' total' : ''}${e.colunas[i]!.temDados ? '' : ' sem-dados'}`, v);
        td.dataset.coluna = e.colunas[i]!.id;
        tr.append(td);
      });
      corpo.append(tr);
    }
    tabela.append(legenda, cabeca, corpo);
    estatisticasCorpo.replaceChildren(tabela);
  };

  const desenharLink = (): void => {
    levarBotao.setAttribute('aria-expanded', String(linkAberto));
    levarBotao.hidden = linkAberto;
    levarDica.hidden = linkAberto;
    levarAberto.hidden = !linkAberto;
    // O código só chega aqui para o campo do link, e só enquanto o bloco está aberto.
    campoDoLink.value = linkAberto ? (carteira.linkParaLevar(opcoes.base()) ?? '') : '';
  };

  const mostrarMsgDaConta = (texto: string, erro: boolean): void => {
    contaMsg.textContent = texto;
    contaMsg.hidden = texto === '';
    contaMsg.classList.toggle('erro', erro);
    contaMsg.setAttribute('role', erro ? 'alert' : 'status');
  };
  const falhaDaConta = (f: FalhaDaConta): string => `${f.mensagem}${textoDaEspera(f.tenteEmS)}`;

  const desenharConta = (): void => {
    const c = opcoes.conta;
    if (c === undefined) return;
    const estado = c.estado();
    const podeMudar = opcoes.podeMudarDeConta?.() ?? true;
    const dica = podeMudar ? '' : 'Saia da sala para mexer na conta.';
    contaConvidado.hidden = estado.tipo !== 'convidado';
    contaLogada.hidden = estado.tipo !== 'conta';
    for (const b of [criarContaBotao, entrarContaBotao, sairBotao, excluirBotao]) {
      b.disabled = !podeMudar || contaOcupada;
      b.title = dica;
    }
    if (estado.tipo === 'conta') {
      if (document.activeElement !== nomeCampo) nomeCampo.value = estado.nome;
      emailLinha.textContent = `E-mail: ${estado.email}`;
      nomeBotao.disabled = contaOcupada;
      excluirAberto.hidden = !excluindo;
      excluirBotao.hidden = excluindo;
      excluirConfirmar.disabled = contaOcupada;
      excluirCancelar.disabled = contaOcupada;
    }
  };

  const desenhar = (): void => {
    const p = perfilNaTela(carteira.estado(), opcoes.apelido());
    ultimo = p;
    apelidoValor.textContent = p.apelido;
    fichaApelido.classList.toggle('vazio', !p.temApelido);
    tacoNome.textContent = p.temCarteira ? p.taco.nome + (p.taco.semente === null ? '' : ` #${p.taco.semente}`) : `${p.taco.nome} (de fábrica)`;
    fichaTaco.style.setProperty('--faixa', p.taco.corDaFaixa);
    const chave = `${p.taco.skin}|${p.taco.semente ?? ''}`;
    if (chave !== chaveDaMiniatura) {
      chaveDaMiniatura = chave;
      tacoCaixa.replaceChildren(criarCanvasDaMiniatura(aparenciaDoTaco(p.taco.skin, p.taco.semente ?? undefined), MINIATURA.largura, MINIATURA.altura, 'perfil-miniatura'));
    }
    skinsValor.textContent = p.textoDasSkins;
    const aparencia = carteira.estado()?.balao?.aparencia;
    // A sala que ainda não manda o balão (a v9) não tem o que personalizar: o bloco some.
    balao.hidden = opcoes.aoAbrirMeuBalao === undefined || aparencia === undefined;
    balaoResumo.textContent = aparencia === undefined ? '' : CATEGORIAS_DO_BALAO.map((c) => `${c.titulo}: ${textoDoCampoDoBalao(aparencia, c.id)}`).join(' · ');
    const avisoDaCarteira = carteira.aviso();
    aviso.hidden = avisoDaCarteira === null;
    avisoTexto.textContent = avisoDaCarteira ?? '';
    fora.hidden = foraTexto.textContent === '';
    caixa.classList.toggle('sem-carteira', !p.temCarteira);
    desenharEstatisticas(p);
    nota.textContent = p.nota;
    // Com conta ela já vale em qualquer aparelho: não há o que levar.
    levar.hidden = opcoes.conta?.estado().tipo === 'conta';
    desenharConta();
    levarBotao.disabled = !carteira.tem();
    levarBotao.title = levarBotao.disabled ? 'Ainda não há carteira neste aparelho' : '';
    desenharLink();
    tentar.disabled = lendo;
  };

  /** Mostra o que a carteira respondeu: a sala fora do ar no aviso de cima, qualquer outra falha com a frase do protocolo. */
  const tratar = (r: ResultadoDaCarteira): void => {
    lendo = false;
    foraTexto.textContent = r.ok ? '' : r.erro === 'fora-do-ar' ? AVISO_PERFIL_FORA_DO_AR : r.mensagem;
    desenhar();
  };

  const ler = (): void => {
    lendo = true;
    desenhar();
    void carteira.garantir().then((r) => aberto && tratar(r));
  };

  tentar.addEventListener('click', ler);

  const trabalhando = async (fazer: () => Promise<FalhaDaConta | null>, aoDarCerto: () => void): Promise<void> => {
    contaOcupada = true;
    mostrarMsgDaConta('', false);
    desenharConta();
    const f = await fazer();
    contaOcupada = false;
    if (!aberto && f === null) return;
    if (f === null) aoDarCerto();
    else mostrarMsgDaConta(falhaDaConta(f), true);
    if (aberto) desenhar();
  };
  const fecharExcluir = (): void => {
    excluindo = false;
    senhaCampo.value = '';
  };
  criarContaBotao.addEventListener('click', () => opcoes.aoCriarConta?.());
  entrarContaBotao.addEventListener('click', () => opcoes.aoEntrarNaConta?.());
  nomeBotao.addEventListener('click', () => {
    const nome = nomeCampo.value.trim();
    if (nome === '') {
      mostrarMsgDaConta('Digite o nome da mesa.', true);
      nomeCampo.focus();
      return;
    }
    void trabalhando(
      async () => {
        const r = await opcoes.conta!.nome(nome);
        return r.ok ? null : r;
      },
      () => mostrarMsgDaConta('Nome salvo.', false),
    );
  });
  nomeCampo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nomeBotao.click();
    }
  });
  sairBotao.addEventListener('click', () => {
    if (opcoes.aoSair === undefined) return;
    void trabalhando(opcoes.aoSair, () => {});
  });
  excluirBotao.addEventListener('click', () => {
    excluindo = true;
    mostrarMsgDaConta('', false);
    desenhar();
    senhaCampo.focus();
  });
  excluirCancelar.addEventListener('click', () => {
    fecharExcluir();
    mostrarMsgDaConta('', false);
    desenhar();
    excluirBotao.focus();
  });
  excluirConfirmar.addEventListener('click', () => {
    if (opcoes.aoExcluir === undefined) return;
    if (senhaCampo.value === '') {
      mostrarMsgDaConta('Digite a sua senha.', true);
      senhaCampo.focus();
      return;
    }
    const senha = senhaCampo.value;
    void trabalhando(
      () => opcoes.aoExcluir!(senha),
      () => {},
    ).finally(() => {
      senhaCampo.value = '';
    });
  });
  senhaCampo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      excluirConfirmar.click();
    }
  });

  levarBotao.addEventListener('click', () => {
    if (levarBotao.disabled) return;
    linkAberto = true;
    desenhar();
    campoDoLink.focus();
  });
  esconderBotao.addEventListener('click', () => {
    linkAberto = false;
    desenhar();
    levarBotao.focus();
  });
  copiarBotao.addEventListener('click', () => {
    void copiarTexto(campoDoLink.value, campoDoLink).then((ok) => {
      copiarBotao.textContent = ok ? 'Link copiado!' : 'Selecione e copie (Ctrl+C)';
      if (temporizadorDoCopiado !== null) window.clearTimeout(temporizadorDoCopiado);
      temporizadorDoCopiado = window.setTimeout(() => {
        temporizadorDoCopiado = null;
        copiarBotao.textContent = 'Copiar link';
      }, COPIADO_MS);
    });
  });

  /** Esc fecha; as outras teclas não chegam ao jogo (os dígitos mandariam emojis por trás do perfil). */
  const aoTeclar = (e: KeyboardEvent): void => {
    if (!aberto) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      perfil.fechar();
    } else if (e.key === 'Tab') prenderFoco(e);
  };
  const prenderFoco = (e: KeyboardEvent): void => {
    const alvos = [...raiz.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), input:not([hidden])')].filter((a) => a.offsetParent !== null);
    if (alvos.length === 0) return;
    const primeiro = alvos[0]!;
    const ultimoAlvo = alvos.at(-1)!;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimoAlvo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimoAlvo) {
      e.preventDefault();
      primeiro.focus();
    }
  };
  fechar.addEventListener('click', () => perfil.fechar());
  raiz.addEventListener('mousedown', (e) => {
    if (e.target === raiz) perfil.fechar();
  });

  const perfil: Perfil = {
    get aberto() {
      return aberto;
    },
    get linkAberto() {
      return linkAberto;
    },

    abrir() {
      if (aberto) return;
      aberto = true;
      linkAberto = false;
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      foraTexto.textContent = '';
      raiz.hidden = false;
      document.addEventListener('keydown', aoTeclar, true);
      const desassinarCarteira = carteira.aoMudar(() => aberto && desenhar());
      const desassinarConta = opcoes.conta?.aoMudar(() => aberto && desenhar());
      desassinar = () => {
        desassinarCarteira();
        desassinarConta?.();
      };
      fecharExcluir();
      mostrarMsgDaConta('', false);
      fechar.focus();
      // Põe a carteira em dia: o saldo, as skins e as estatísticas mudam a cada partida.
      ler();
    },

    fechar() {
      if (!aberto) return;
      aberto = false;
      linkAberto = false;
      fecharExcluir();
      campoDoLink.value = '';
      raiz.hidden = true;
      document.removeEventListener('keydown', aoTeclar, true);
      desassinar?.();
      desassinar = null;
      if (temporizadorDoCopiado !== null) window.clearTimeout(temporizadorDoCopiado);
      temporizadorDoCopiado = null;
      copiarBotao.textContent = 'Copiar link';
      focoAnterior?.focus();
      focoAnterior = null;
    },

    texto() {
      if (!aberto) return '';
      const limpo = (e: Element | null): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const linhas = [...estatisticasCorpo.querySelectorAll('tr')].map((tr) => [...tr.children].map(limpo).join(' '));
      const quando = ultimo.temCarteira ? [] : ['sem carteira lida'];
      return [
        `Apelido: ${limpo(apelidoValor)}`,
        `Taco em uso: ${limpo(tacoNome)}`,
        `Skins: ${limpo(skinsValor)}`,
        ...(balao.hidden ? [] : [`Balão: ${limpo(balaoResumo)}`]),
        ...quando,
        limpo(avisoTexto),
        limpo(foraTexto),
        ...(linhas.length > 0 ? linhas : [limpo(estatisticasCorpo)]),
        limpo(nota),
        ...(opcoes.conta === undefined ? [] : [`Conta: ${opcoes.conta.estado().tipo === 'conta' ? `${nomeCampo.value} · ${limpo(emailLinha)}` : 'convidado'}${limpo(contaMsg) === '' ? '' : ` (${limpo(contaMsg)})`}`]),
        linkAberto ? 'link da carteira à mostra' : 'link da carteira escondido',
      ]
        .filter(Boolean)
        .join(' | ');
    },

    dispose() {
      perfil.fechar();
      raiz.remove();
    },
  };
  return perfil;
}
