import type { IdBola } from '@sinuca/fisica';
import { nomeDaBolaFinal, ROTULO_GRUPO, rotuloDaFalta } from './leitura';
import type { ConfigRegras, EstadoPartida, Grupo, Jogador, NomeFalta } from './tipos';

export type Desfecho = 'vitoria-castigo' | 'vitoria-ultima' | 'adversario-sem-bolas' | 'castigo-antes' | 'castigo-e-branca';

export type Pena =
  | { readonly tipo: 'mesa-aberta' }
  | { readonly tipo: 'retirar'; readonly bolas: readonly IdBola[]; /** A última do adversário, que a pena não tirou. */ readonly poupada: IdBola | null }
  | { readonly tipo: 'devolver'; readonly bolas: readonly IdBola[] };

/** O que aconteceu na tacada, já decidido pelas regras; só vira frase aqui. */
export interface Relato {
  readonly antes: EstadoPartida;
  readonly castigo: IdBola | null;
  /** Para onde volta a bola da vitória (`castigoLugar`). */
  readonly lugarDaVolta: ConfigRegras['castigoLugar'];
  readonly faltas: readonly NomeFalta[];
  readonly desfecho: Desfecho | null;
  /** Bola da vitória que voltou para a tabela. */
  readonly volta: readonly IdBola[];
  readonly pena: Pena | null;
  readonly grupoDefinido: Grupo | null;
  readonly minhas: readonly IdBola[];
  readonly deles: readonly IdBola[];
  /** A última do adversário, encaçapada por quem tacou, que volta para a tabela. */
  readonly voltaDeles: readonly IdBola[];
  readonly pularam: readonly IdBola[];
  readonly continua: boolean;
  readonly vaiParaCastigo: boolean;
  readonly proximo: number;
}

const PARA_O_LUGAR: Readonly<Record<ConfigRegras['castigoLugar'], string>> = {
  'tabela-lado-saida': 'para a tabela',
  'marca-pe': 'para a marca do pé',
};

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "a 3", "a 3 e a 5", "a 3, a 5 e a 7". */
function lista(bolas: readonly IdBola[]): string {
  const itens = bolas.map((b) => `a ${b}`);
  return itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/** Os nomes de uma equipe: "Ana" no 1×1, "Ana e Caio" nas duplas (verbo no plural). */
interface Equipe {
  readonly nomes: string;
  readonly varios: boolean;
}

function equipe(jogadores: readonly Jogador[], numero: number): Equipe {
  const nomes = jogadores.filter((j) => j.equipe === numero).map((j) => j.nome);
  return { nomes: nomes.join(' e '), varios: nomes.length > 1 };
}

const conjugar = (e: Equipe, singular: string, plural: string) => (e.varios ? plural : singular);

/** Frase curta para o HUD, em PT-BR. */
export function textoDaTacada(r: Relato): string {
  const { antes } = r;
  const quem = antes.jogadores[antes.vez]!;
  const minha = equipe(antes.jogadores, quem.equipe);
  const adversaria = equipe(antes.jogadores, 1 - quem.equipe);
  const final = nomeDaBolaFinal(antes.config);
  const daUltima = final ?? 'a última';
  const para = PARA_O_LUGAR[r.lugarDaVolta];
  const perdeEVence = `${minha.nomes} ${conjugar(minha, 'perde', 'perdem')} e ${adversaria.nomes} ${conjugar(adversaria, 'vence', 'vencem')}.`;
  const venceu = conjugar(minha, ' e venceu!', `! ${minha.nomes} venceram.`);

  switch (r.desfecho) {
    case 'castigo-antes':
      return `${final === 'o castigo' ? 'Castigo' : maiuscula(daUltima)} antes da hora! ${perdeEVence}`;
    case 'castigo-e-branca':
      return `Suicídio com ${daUltima}! ${perdeEVence}`;
    case 'vitoria-castigo':
      return `${quem.nome} matou ${daUltima}${venceu}`;
    case 'vitoria-ultima':
      return `${quem.nome} encaçapou a última${venceu}`;
  }

  const partes: string[] = [];
  if (r.faltas.length > 0) {
    const rotulos = r.faltas.map((f) => rotuloDaFalta(f, antes.config));
    partes.push(`${rotulos.map((f, i) => (i === 0 ? f : minuscula(f))).join(' e ')}!`);
  }
  for (const b of r.volta) partes.push(`${maiuscula(b === r.castigo ? daUltima : lista([b]))} volta ${para}.`);
  if (r.pena?.tipo === 'mesa-aberta') partes.push('Mesa aberta: ninguém paga.');
  if (r.pena?.tipo === 'retirar') {
    const { bolas, poupada } = r.pena;
    if (bolas.length > 0) partes.push(`${adversaria.nomes} ${conjugar(adversaria, 'recebe', 'recebem')} ${lista(bolas)}.`);
    if (poupada === null) {
      if (bolas.length === 0) partes.push(`${adversaria.nomes} não ${conjugar(adversaria, 'tem', 'têm')} bola para receber.`);
    } else if (!r.voltaDeles.includes(poupada)) {
      partes.push(`${maiuscula(lista([poupada]))} é a última de ${adversaria.nomes} e fica na mesa.`);
    }
  }
  if (r.pena?.tipo === 'devolver') {
    partes.push(r.pena.bolas.length > 0 ? `${quem.nome} devolve ${lista(r.pena.bolas)}.` : `${quem.nome} não tem bola para devolver.`);
  }

  // "e continua" quando quem segue é o sujeito da frase; senão, com o nome (o parceiro, ou quem segue depois do grupo da dupla).
  const seguir = r.vaiParaCastigo ? `vai para ${daUltima}` : 'continua';
  const proximo = antes.jogadores[r.proximo]!.nome;
  const eSegue = (sujeito: number | null) => (!r.continua ? '' : sujeito === r.proximo ? ` e ${seguir}` : ` e ${proximo} ${seguir}`);
  if (r.grupoDefinido !== null) {
    const grupo = minuscula(ROTULO_GRUPO[r.grupoDefinido]);
    partes.push(`${minha.nomes} ${conjugar(minha, 'fica', 'ficam')} com as ${grupo}${eSegue(minha.varios ? null : antes.vez)}.`);
  } else if (r.faltas.length === 0 && r.minhas.length === 0 && r.deles.length === 0 && r.volta.length === 0 && r.voltaDeles.length === 0) {
    partes.push('Nenhuma bola caiu.');
  } else if (r.faltas.length === 0 && r.minhas.length > 0) {
    partes.push(`${quem.nome} encaçapou ${lista(r.minhas)}${eSegue(antes.vez)}.`);
  }
  if (r.deles.length > 0) partes.push(`${maiuscula(lista(r.deles))} ${r.deles.length > 1 ? 'contam' : 'conta'} para ${adversaria.nomes}.`);
  for (const b of r.voltaDeles) partes.push(`${maiuscula(lista([b]))} é a última de ${adversaria.nomes} e volta ${para}.`);
  if (r.pularam.length > 0) partes.push(`${maiuscula(lista(r.pularam))} ${r.pularam.length > 1 ? 'pularam' : 'pulou'} da mesa.`);

  if (r.desfecho === 'adversario-sem-bolas') {
    partes.push(`${adversaria.nomes} ${conjugar(adversaria, 'ficou sem bolas e venceu!', 'ficaram sem bolas e venceram!')}`);
  }
  else if (r.faltas.length === 0 && !r.continua) partes.push(`Vez de ${antes.jogadores[r.proximo]!.nome}.`);
  return partes.join(' ');
}

/** O que aconteceu na tacada do mata-mata, já decidido; só vira frase aqui. */
export interface RelatoMataMata {
  readonly antes: EstadoPartida;
  readonly faltas: readonly NomeFalta[];
  /** Bolas que quem tacou encaçapou, em ordem de queda. */
  readonly matou: readonly IdBola[];
  readonly pularam: readonly IdBola[];
  readonly brancaVolta: boolean;
  /** Quem tacou perde a próxima vez (cegou ou tirou a branca do jogo e a casa pune; nunca no fim da partida). */
  readonly perde: boolean;
  /** Índices em `jogadores` de quem a roda pulou nesta passagem, na ordem em que a roda os alcançou. */
  readonly pulados: readonly number[];
  readonly proximo: number;
  /** O fim da partida: quem venceu, com quantos pontos, e as equipes empatadas nesse número (uma só, se não houve empate). */
  readonly fim: { readonly vencedor: number; readonly pontos: number; readonly empatados: readonly number[] } | null;
}

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
const enumerar = (nomes: readonly string[]) => (nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);

const pontosEscritos = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;

/** Frase curta para o HUD no mata-mata, em PT-BR: "Ana matou a 5 (+1). Vez de Beto." */
export function textoDoMataMata(r: RelatoMataMata): string {
  const { antes } = r;
  const quem = antes.jogadores[antes.vez]!;
  const partes: string[] = [];
  if (r.faltas.length > 0) {
    const rotulos = r.faltas.map((f) => rotuloDaFalta(f, antes.config));
    const falta = `${rotulos.map((f, i) => (i === 0 ? f : minuscula(f))).join(' e ')}!`;
    partes.push(
      r.perde
        ? `${falta} ${quem.nome} perde a próxima vez.${r.brancaVolta ? ' Branca na marca.' : ''}`
        : `${falta} Falta sem pena${r.brancaVolta ? ': branca na marca' : ''}.`,
    );
  }
  if (r.matou.length > 0) partes.push(`${quem.nome} matou ${lista(r.matou)} (+${r.matou.length}).`);
  else if (r.faltas.length === 0) partes.push(`${quem.nome} não matou nenhuma.`);
  if (r.pularam.length > 0) partes.push(`${maiuscula(lista(r.pularam))} ${r.pularam.length > 1 ? 'pularam' : 'pulou'} da mesa.`);
  if (r.fim === null) {
    const proximo = antes.jogadores[r.proximo]!.nome;
    if (r.pulados.length === 0) partes.push(`Vez de ${proximo}.`);
    else partes.push(`${enumerar(r.pulados.map((i) => antes.jogadores[i]!.nome))} ${r.pulados.length > 1 ? 'perderam' : 'perdeu'} a vez: joga ${proximo}.`);
  } else {
    const { vencedor, pontos, empatados } = r.fim;
    const nome = (e: number) => equipe(antes.jogadores, e).nomes;
    const nomes = empatados.map(nome);
    partes.push(
      empatados.length > 1
        ? `Acabaram as bolas. ${enumerar(nomes)} empataram com ${pontosEscritos(pontos)}; ${nome(vencedor)} matou por último e venceu!`
        : `Acabaram as bolas. ${nome(vencedor)} venceu com ${pontosEscritos(pontos)}!`,
    );
  }
  return partes.join(' ');
}
