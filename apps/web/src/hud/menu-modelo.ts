import { FAIXAS, SKIN_PADRAO, SKINS_DE_TACO, type EstadoCarteira, type SkinTaco } from '@sinuca/protocolo';
import { sinalDoSaldo, textoDeMoedas } from '../online/moedas';

/**
 * O modelo puro do menu com cara de jogo (L40): o que a tela inicial oferece, a barra de cima e a ordem das transições. Sem DOM:
 * `menu.ts` só desenha o que sai daqui.
 */

// ---------------------------------------------------------------- o que a tela inicial oferece

/** Os botões que ainda não existem. O lote que os cria liga o seu aqui (e passa o `aoTreino`/`aoPerfil` em `OpcoesMenu`). */
export interface RecursosDoMenu {
  /** L42: o modo treino. */
  readonly treino: boolean;
  /** L43: o perfil com estatísticas. */
  readonly perfil: boolean;
}

/** O interruptor: `false` = o botão não aparece, mas o lugar dele no layout já está reservado (a grade dos atalhos reparte o espaço). */
export const RECURSOS_DO_MENU: RecursosDoMenu = { treino: true, perfil: true };

export type IdDoAtalho = 'treino' | 'loja' | 'perfil' | 'configuracoes' | 'creditos';

/** Um atalho da fileira de baixo da tela inicial: o que vem depois de "Jogar online" e "Jogar no mesmo PC". */
export interface AtalhoDoMenu {
  readonly id: IdDoAtalho;
  readonly rotulo: string;
  /** A frase curta de baixo do rótulo e da dica do botão. */
  readonly dica: string;
}

const ATALHOS: Readonly<Record<IdDoAtalho, AtalhoDoMenu>> = {
  treino: { id: 'treino', rotulo: 'Treino', dica: 'Sozinho, sem pressa' },
  loja: { id: 'loja', rotulo: 'Loja', dica: 'Gaste suas moedas' },
  perfil: { id: 'perfil', rotulo: 'Perfil', dica: 'Suas estatísticas' },
  configuracoes: { id: 'configuracoes', rotulo: 'Configurações', dica: 'Mouse, som e gráficos' },
  creditos: { id: 'creditos', rotulo: 'Créditos', dica: 'Quem fez os sons' },
};

/** A ordem da fileira: o que se joga (treino), o que se compra, quem sou, os ajustes. Os que ainda não existem só entram com o interruptor. */
const ORDEM_DOS_ATALHOS: readonly IdDoAtalho[] = ['treino', 'loja', 'perfil', 'configuracoes', 'creditos'];

export function atalhosDaTelaInicial(recursos: RecursosDoMenu): readonly AtalhoDoMenu[] {
  return ORDEM_DOS_ATALHOS.filter((id) => (id === 'treino' ? recursos.treino : id === 'perfil' ? recursos.perfil : true)).map((id) => ATALHOS[id]);
}

/** O quadro das missões começa aberto onde cabe ao lado dos botões (a tela de 1280x720 cabe); em tela menor começa recolhido. */
export function quadroComecaAberto(largura: number, altura: number): boolean {
  return largura >= 1000 && altura >= 640;
}

/**
 * Quanto o menu cresce numa tela maior que a de projeto (1280x720): a mesma tela, na mesma proporção, até 1,6x. Menor que a de projeto
 * continua em 1 (a tela rola, como sempre rolou).
 */
export function escalaDoMenu(largura: number, altura: number): number {
  if (!(largura > 0) || !(altura > 0)) return 1;
  const escala = Math.min(largura / 1280, altura / 720);
  return Math.round(Math.min(Math.max(escala, 1), 1.6) * 100) / 100;
}

/**
 * O arquivo do letreiro do Pincel (`public/marca/`, copiado de `arte/marca/` por `scripts/copiar-boteco.mjs`): as duas linhas juntas
 * na tela inicial (`grande`), só "SINUCA" nas outras, que têm pouca altura sobrando. `raiz` é o `BASE_URL` do site.
 */
export function arquivoDoLetreiro(raiz: string, grande: boolean, estado: 'acesa' | 'apagada'): string {
  const base = raiz.endsWith('/') ? raiz : `${raiz}/`;
  return `${base}marca/${grande ? 'letreiro' : 'sinuca'}-${estado}.png`;
}

// ---------------------------------------------------------------- a barra de cima

export interface TacoDaBarra {
  readonly skin: SkinTaco;
  readonly nome: string;
  /** A semente do meu taco (0 a 999); `null` quando a carteira não a trouxe (o desenho é o de fábrica). */
  readonly semente: number | null;
  /** A cor da faixa de raridade (`#rrggbb`): o filete da miniatura. */
  readonly corDaFaixa: string;
}

/** A barra de cima do menu: o apelido, o saldo e o taco em uso. */
export interface BarraNaTela {
  readonly apelido: string;
  readonly temApelido: boolean;
  /** "100 moedas", ou "—" sem carteira. */
  readonly textoSaldo: string;
  readonly saldoNegativo: boolean;
  readonly semCarteira: boolean;
  readonly taco: TacoDaBarra;
  /** Muda quando o desenho da miniatura muda (skin ou semente): quem desenha só refaz o canvas nesse caso. */
  readonly chaveDoTaco: string;
}

export const APELIDO_VAZIO = 'Sem apelido';

/** A barra a partir da carteira do aparelho (`null` = ainda não lida ou servidor fora do ar) e do apelido que o jogador digitou. */
export function barraDoMenu(carteira: EstadoCarteira | null, apelido: string): BarraNaTela {
  const limpo = apelido.trim();
  const skin = carteira?.skin ?? SKIN_PADRAO;
  const definicao = SKINS_DE_TACO.find((s) => s.id === skin) ?? SKINS_DE_TACO.find((s) => s.id === SKIN_PADRAO)!;
  const faixa = FAIXAS.find((f) => f.id === definicao.faixa);
  const semente = carteira?.itens?.find((i) => i.skin === skin)?.semente ?? null;
  return {
    apelido: limpo === '' ? APELIDO_VAZIO : limpo,
    temApelido: limpo !== '',
    textoSaldo: carteira === null ? '—' : textoDeMoedas(carteira.saldo),
    saldoNegativo: carteira !== null && sinalDoSaldo(carteira.saldo) === 'negativo',
    semCarteira: carteira === null,
    taco: { skin: definicao.id, nome: definicao.nome, semente, corDaFaixa: faixa?.cor ?? '#b0c3d9' },
    chaveDoTaco: `${definicao.id}|${semente ?? ''}`,
  };
}

// ---------------------------------------------------------------- as transições entre telas

export type TelaDoMenu = 'inicio' | 'entrar' | 'criar' | 'local' | 'conectando' | 'espera' | 'expulso' | 'recarregar';

/** Quão fundo a tela está a partir da inicial: 0 é a inicial, 1 as que saem dela, 2 a sala de espera. */
const PROFUNDIDADE: Readonly<Record<TelaDoMenu, number>> = {
  inicio: 0,
  entrar: 1,
  criar: 1,
  local: 1,
  expulso: 1,
  recarregar: 1,
  conectando: 2,
  espera: 2,
};

export type DirecaoDaTransicao = 'avanca' | 'volta';

/**
 * Como a tela nova entra, ou `null` quando ela não deve animar: o menu já mostrava esta mesma tela (a sala de espera se redesenha a cada
 * `estado-sala`, e uma animação a cada um piscaria a tela). `de` é `null` quando o menu estava fechado: abre avançando.
 */
export function transicaoDoMenu(de: TelaDoMenu | null, para: TelaDoMenu): DirecaoDaTransicao | null {
  if (de === para) return null;
  if (de === null) return 'avanca';
  return PROFUNDIDADE[para] < PROFUNDIDADE[de] ? 'volta' : 'avanca';
}
