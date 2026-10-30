import type { CarteiraDoAparelho } from '../online/carteira';
import type { ContaDoAparelho, FalhaDaConta } from '../online/conta';
import { campoFaltando, carteiraDoConvidadoTemAlgo, textoDaEspera } from '../online/conta-modelo';
import { AVISO_DE_ENTRAR, FRASE_DE_CRIAR, MENSAGEM_SESSAO_ACABOU } from '../online/mensagens-da-conta';

export interface DialogosDaConta {
  readonly aberto: boolean;
  abrirCriar(): void;
  abrirEntrar(): void;
  abrirEsqueci(): void;
  /** O cookie venceu e o código deste navegador era de uma conta: "Entrar" ou "Jogar como convidado". */
  abrirSessaoAcabou(): void;
  fechar(): void;
  /** O que está na tela, `''` fechado (gancho de teste). Nunca leva senha: ela só existe dentro do campo. */
  texto(): string;
  dispose(): void;
}

export interface OpcoesDosDialogos {
  /** Falso dentro de uma sala: trocar de conta no meio dela trocaria a identidade da mesa. */
  readonly podeMudar: () => boolean;
  /** A pessoa escolheu "Jogar como convidado" depois de a sessão acabar: o jogo cria a carteira nova. */
  readonly aoJogarComoConvidado: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const MENSAGEM_EM_SALA = 'Saia da sala para mexer na conta.';

/**
 * As telas de criar conta, entrar, esqueci a senha e sessão acabada (L62), diálogos por cima de tudo no estilo do perfil: foco preso, Esc
 * fecha, `autocomplete` certo para o gerenciador de senhas e o erro com a `mensagem` da API. A senha só existe dentro do campo e do pedido.
 */
export function criarDialogosDaConta(pai: HTMLElement, conta: ContaDoAparelho, carteira: CarteiraDoAparelho, opcoes: OpcoesDosDialogos): DialogosDaConta {
  const raiz = el('div', 'carteira-pergunta conta-dialogo');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'conta-dialogo-titulo');
  const caixa = el('form', 'carteira-pergunta-caixa');
  caixa.noValidate = true;
  const titulo = el('h2', 'carteira-pergunta-titulo');
  titulo.id = 'conta-dialogo-titulo';
  const corpo = el('div', 'carteira-pergunta-corpo');
  const erro = el('p', 'carteira-pergunta-aviso conta-erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;
  const acoes = el('div', 'carteira-pergunta-acoes conta-acoes');
  caixa.append(titulo, corpo, erro, acoes);
  raiz.append(caixa);
  pai.append(raiz);

  let aberto = false;
  let ocupado = false;
  let focoAnterior: HTMLElement | null = null;
  let aoEnviar: (() => void) | null = null;

  const botao = (texto: string, classe: string, aoClicar: () => void, tipo: 'button' | 'submit' = 'button'): HTMLButtonElement => {
    const b = el('button', `menu-botao carteira-pergunta-botao ${classe}`.trim(), texto);
    b.type = tipo;
    if (tipo === 'button') b.addEventListener('click', aoClicar);
    return b;
  };
  const campo = (rotulo: string, nome: string, tipo: 'text' | 'email' | 'password', autocompletar: string, maximo: number): { linha: HTMLElement; entrada: HTMLInputElement } => {
    const linha = el('label', 'conta-campo');
    linha.append(el('span', 'conta-campo-rotulo', rotulo));
    const entrada = el('input', 'menu-entrada conta-campo-entrada');
    entrada.type = tipo;
    entrada.name = nome;
    entrada.setAttribute('autocomplete', autocompletar);
    entrada.maxLength = maximo;
    entrada.spellcheck = false;
    if (tipo === 'email') entrada.inputMode = 'email';
    linha.append(entrada);
    return { linha, entrada };
  };
  const nota = (texto: string, classe = ''): HTMLElement => el('p', `carteira-pergunta-aviso neutro ${classe}`.trim(), texto);

  const mostrarErro = (texto: string): void => {
    erro.textContent = texto;
    erro.hidden = texto === '';
  };
  const mensagemDe = (f: FalhaDaConta): string => `${f.mensagem}${textoDaEspera(f.tenteEmS)}`;
  const trancar = (sim: boolean): void => {
    ocupado = sim;
    for (const b of caixa.querySelectorAll<HTMLButtonElement>('button')) b.disabled = sim;
    caixa.setAttribute('aria-busy', String(sim));
  };

  const prender = (e: KeyboardEvent): void => {
    const alvos = [...raiz.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter((a) => a.offsetParent !== null);
    if (alvos.length === 0) return;
    const primeiro = alvos[0]!;
    const ultimo = alvos.at(-1)!;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };
  const aoTeclar = (e: KeyboardEvent): void => {
    if (!aberto) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!ocupado) dialogos.fechar();
    } else if (e.key === 'Tab') prender(e);
  };
  caixa.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ocupado) aoEnviar?.();
  });
  raiz.addEventListener('mousedown', (e) => {
    if (e.target === raiz && !ocupado) dialogos.fechar();
  });

  /** Põe uma tela no diálogo; o foco vai para `focar`. */
  const montar = (tituloDoDialogo: string, filhos: HTMLElement[], botoes: HTMLElement[], enviar: (() => void) | null, focar: () => void): void => {
    titulo.textContent = tituloDoDialogo;
    corpo.replaceChildren(...filhos);
    acoes.replaceChildren(...botoes);
    aoEnviar = enviar;
    mostrarErro('');
    trancar(false);
    if (!aberto) {
      aberto = true;
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      raiz.hidden = false;
      document.addEventListener('keydown', aoTeclar, true);
    }
    focar();
  };

  /** Quem está numa sala não troca de conta: um recado no lugar do formulário. */
  const recusarEmSala = (): boolean => {
    if (opcoes.podeMudar()) return false;
    montar('Conta', [nota(MENSAGEM_EM_SALA)], [botao('Entendi', 'principal', () => dialogos.fechar())], null, () => acoes.querySelector('button')?.focus());
    return true;
  };

  const dialogos: DialogosDaConta = {
    get aberto() {
      return aberto;
    },

    abrirCriar() {
      if (recusarEmSala()) return;
      const email = campo('E-mail', 'email', 'email', 'email', 254);
      const nome = campo('Nome na mesa', 'nome', 'text', 'nickname', 20);
      const senha = campo('Senha', 'senha', 'password', 'new-password', 128);
      const entrarEmVez = botao('Já tenho conta', '', () => dialogos.abrirEntrar());
      const cancelar = botao('Cancelar', '', () => dialogos.fechar());
      const criar = botao('Criar conta', 'principal', () => {}, 'submit');
      montar(
        'Criar conta',
        [nota(FRASE_DE_CRIAR), email.linha, nome.linha, senha.linha],
        [entrarEmVez, cancelar, criar],
        () => {
          const falta = campoFaltando({ email: email.entrada.value, nome: nome.entrada.value, senha: senha.entrada.value });
          if (falta !== null) {
            mostrarErro(falta.mensagem);
            ({ email: email.entrada, nome: nome.entrada, senha: senha.entrada })[falta.campo].focus();
            return;
          }
          mostrarErro('');
          trancar(true);
          void conta.criar({ email: email.entrada.value.trim(), nome: nome.entrada.value.trim(), senha: senha.entrada.value }).then((r) => {
            if (!aberto) return;
            senha.entrada.value = '';
            if (r.ok) return dialogos.fechar();
            trancar(false);
            mostrarErro(mensagemDe(r));
            senha.entrada.focus();
          });
        },
        () => email.entrada.focus(),
      );
    },

    abrirEntrar() {
      if (recusarEmSala()) return;
      const email = campo('E-mail', 'email', 'email', 'username', 254);
      const senha = campo('Senha', 'senha', 'password', 'current-password', 128);
      const guardada = carteiraDoConvidadoTemAlgo(carteira.modoConta() ? null : carteira.estado());
      const esqueci = botao('Esqueci a senha', '', () => dialogos.abrirEsqueci());
      const criarEmVez = botao('Criar conta', '', () => dialogos.abrirCriar());
      const cancelar = botao('Cancelar', '', () => dialogos.fechar());
      const entrar = botao('Entrar', 'principal', () => {}, 'submit');
      montar(
        'Entrar',
        [...(guardada ? [nota(AVISO_DE_ENTRAR, 'conta-aviso-entrar')] : []), email.linha, senha.linha],
        [esqueci, criarEmVez, cancelar, entrar],
        () => {
          const falta = campoFaltando({ email: email.entrada.value, senha: senha.entrada.value });
          if (falta !== null) {
            mostrarErro(falta.mensagem);
            (falta.campo === 'email' ? email.entrada : senha.entrada).focus();
            return;
          }
          mostrarErro('');
          trancar(true);
          void conta.entrar({ email: email.entrada.value.trim(), senha: senha.entrada.value }).then((r) => {
            if (!aberto) return;
            senha.entrada.value = '';
            if (r.ok) return dialogos.fechar();
            trancar(false);
            mostrarErro(mensagemDe(r));
            senha.entrada.focus();
          });
        },
        () => email.entrada.focus(),
      );
    },

    abrirEsqueci() {
      if (recusarEmSala()) return;
      const email = campo('E-mail da conta', 'email', 'email', 'email', 254);
      const voltar = botao('Voltar', '', () => dialogos.abrirEntrar());
      const enviar = botao('Enviar link', 'principal', () => {}, 'submit');
      montar(
        'Esqueci a senha',
        [nota('Enviamos um link para criar uma senha nova. Ele abre becogames.app/nova-senha.'), email.linha],
        [voltar, enviar],
        () => {
          const falta = campoFaltando({ email: email.entrada.value });
          if (falta !== null) {
            mostrarErro(falta.mensagem);
            email.entrada.focus();
            return;
          }
          mostrarErro('');
          trancar(true);
          void conta.esqueci(email.entrada.value.trim()).then((r) => {
            if (!aberto) return;
            if (!r.ok) {
              trancar(false);
              mostrarErro(mensagemDe(r));
              return;
            }
            const fechar = botao('Fechar', 'principal', () => dialogos.fechar());
            montar('Esqueci a senha', [nota(r.mensagem)], [fechar], null, () => fechar.focus());
          });
        },
        () => email.entrada.focus(),
      );
    },

    abrirSessaoAcabou() {
      const entrar = botao('Entrar', 'principal', () => dialogos.abrirEntrar());
      const convidado = botao('Jogar como convidado', '', () => {
        conta.esquecerSinal();
        dialogos.fechar();
        opcoes.aoJogarComoConvidado();
      });
      montar('Sessão encerrada', [nota(MENSAGEM_SESSAO_ACABOU)], [convidado, entrar], null, () => entrar.focus());
    },

    fechar() {
      if (!aberto) return;
      aberto = false;
      aoEnviar = null;
      raiz.hidden = true;
      document.removeEventListener('keydown', aoTeclar, true);
      titulo.textContent = '';
      corpo.replaceChildren();
      acoes.replaceChildren();
      mostrarErro('');
      focoAnterior?.focus();
      focoAnterior = null;
    },

    texto() {
      if (!aberto) return '';
      const limpo = (e: Element): string => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
      return [limpo(titulo), ...[...corpo.children].map(limpo), erro.hidden ? '' : limpo(erro), ...[...acoes.children].map(limpo)].filter(Boolean).join(' | ');
    },

    dispose() {
      dialogos.fechar();
      raiz.remove();
    },
  };
  return dialogos;
}
