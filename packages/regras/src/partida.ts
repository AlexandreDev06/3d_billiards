import type { EventoTacada, IdBola, Rng } from '@sinuca/fisica';
import { BOLAO, faltaDoToque, fatos } from './fatos';
import { bolaDeCastigo, bolasAlvo, bolasDaCasa, grupoDaBola, objetivo, type Objetivo } from './leitura';
import { aplicarMataMata, passarVezMataMata } from './mata-mata';
import { formacaoDosJogadores, formacoesAceitas, ROTULO_MODALIDADE, rotuloDaFormacao } from './modalidades';
import { incoerenciasDaConfig } from './presets';
import { intercalar } from './roda';
import { textoDaTacada, type Desfecho, type Pena } from './texto';
import type {
  ConfigRegras,
  Encacapada,
  EstadoPartida,
  FasePartida,
  Grupo,
  Jogador,
  NomeFalta,
  NovaPartida,
  Recolocacao,
  ResultadoRegras,
} from './tipos';

/** Vaga do centro do triângulo (meio da 3ª fileira) na ordem de `mesaInicial` da física, com 13 ou 15 bolas. */
const CENTRO_DO_TRIANGULO = 4;

const FASE_DO_OBJETIVO: Readonly<Record<Objetivo, FasePartida>> = { qualquer: 'aberta', grupo: 'grupos', castigo: 'castigo' };

/**
 * Começa uma partida: estado inicial e a arrumação do triângulo, sorteada com `rng`
 * (a bola final, se começa no triângulo, fica no centro).
 * `jogadores` vem na ordem da roda (`config.ordemDaVez`) e tem de formar uma das
 * `formacoesAceitas(config)`; senão lança com a lista do que a modalidade aceita.
 * No par ou ímpar são 2 equipes (0 e 1) de 1 ou 2 jogadores: 2 no 1×1, 3 no 2×1
 * (A1, B1, A2 ou B1, A1, A2) ou 4 nas duplas (A1, B1, A2, B2). No mata-mata são 2 a 4
 * jogadores, cada um na sua equipe (0 a N−1). Quem sai é `jogadores[0]`; para a
 * próxima partida, use `jogadoresDaProxima`.
 */
export function novaPartida(config: ConfigRegras, jogadores: readonly Jogador[], rng: Rng): NovaPartida {
  validarJogadores(jogadores, config);
  const bolas = bolasDaCasa(config);
  const castigo = bolaDeCastigo(config);
  const arrumacao = embaralhar(
    bolas.filter((b) => b !== castigo),
    rng,
  );
  if (castigo !== null && config.castigoInicio === 'centro-triangulo') arrumacao.splice(CENTRO_DO_TRIANGULO, 0, castigo);
  return {
    partida: {
      config,
      jogadores,
      vez: 0,
      grupos: semGrupos(jogadores),
      fase: 'saida',
      naMesa: bolas,
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    },
    arrumacao,
  };
}

/**
 * Aplica as regras de `partida.config` aos eventos de uma tacada de quem tem a
 * vez. Pura: não muta a entrada. Ordem: fatos → faltas → pena → grupos → vez → fim.
 */
export function aplicarTacada(partida: EstadoPartida, eventos: readonly EventoTacada[]): ResultadoRegras {
  if (partida.vencedor !== null || partida.fase === 'fim') throw new Error('aplicarTacada: a partida já terminou');
  if (partida.config.modalidade === 'mata-mata') return aplicarMataMata(partida, eventos);
  const c = partida.config;
  const castigo = bolaDeCastigo(c);
  const saida = partida.fase === 'saida';
  const quem = partida.vez;
  const equipe = equipeDe(partida.jogadores, quem);
  const adversaria = 1 - equipe;
  const grupoAntes = partida.grupos[equipe] ?? null;
  const alvo = objetivo(partida, quem);

  // 1. Fatos. Começando fora do triângulo, a bola final só entra depois da saída: na saída ela não está em jogo.
  const castigoForaNaSaida = saida && castigo !== null && c.castigoInicio === 'depois-da-saida';
  const emJogo = new Set(partida.naMesa);
  if (castigoForaNaSaida) emJogo.delete(castigo);
  const f = fatos(eventos, emJogo, partida.naMesa);

  // 2. Faltas.
  const faltas: NomeFalta[] = [];
  const doToque = faltaDoToque(f.primeiro, bolasAlvo(partida), castigo);
  if (doToque) faltas.push(doToque);
  if (f.brancaCaiu) faltas.push('suicidio');
  if (f.brancaFora) faltas.push('branca-fora');
  if (f.pularam.length > 0 && c.bolaForaDaMesa === 'falta') faltas.push('bola-fora');

  // A bola da vitória (a bola final; sem ela, a última do grupo) decide o fim antes da pena.
  // Caindo na saída (começou no triângulo), conforme `castigoNaSaida`: volta, antes da hora ou como na hora dela.
  const grupoDefinido = grupoAntes === null ? definirGrupo(c, f.caidas.filter((b) => b !== castigo)) : null;
  const meuGrupo = grupoAntes ?? grupoDefinido;
  const daVitoria = bolaDaVitoria(f.caidas, partida.naMesa, meuGrupo, castigo, c);
  let desfecho: Desfecho | null = null;
  const volta: IdBola[] = [];
  const naSaida = saida && castigo !== null ? c.castigoNaSaida : null;
  if (daVitoria !== null && naSaida === 'volta') {
    volta.push(daVitoria);
  } else if (daVitoria !== null) {
    if (castigo !== null && alvo !== 'castigo' && naSaida !== 'vence') {
      switch (c.castigoAntesDaHora) {
        case 'derrota':
          desfecho = 'castigo-antes';
      }
    } else if (faltas.includes('suicidio')) {
      switch (c.castigoEBrancaJuntos) {
        case 'derrota':
          desfecho = 'castigo-e-branca';
          break;
        case 'castigo-volta':
          volta.push(daVitoria);
      }
    } else if (faltas.length > 0) {
      switch (c.castigoComFalta) {
        case 'castigo-volta':
          volta.push(daVitoria);
      }
    } else {
      desfecho = castigo !== null ? 'vitoria-castigo' : 'vitoria-ultima';
    }
  }
  // Sem bola final, a última do adversário, se quem taca a encaçapou.
  const ultimaDeles =
    desfecho === null && castigo === null && meuGrupo !== null ? bolaDaVitoria(f.caidas, partida.naMesa, outro(meuGrupo), null, c) : null;
  const voltaDeles: IdBola[] = [];
  if (ultimaDeles !== null && c.ultimaPorPenaOuAdversario === 'volta') voltaDeles.push(ultimaDeles);

  const contam = f.caidas.filter((b) => !volta.includes(b) && !voltaDeles.includes(b));
  let naMesa = partida.naMesa.filter((b) => !contam.includes(b));
  let encacapadas: readonly Encacapada[] = [...partida.encacapadas, ...contam.map((bola) => ({ bola, jogador: quem }))];
  let retiradas = partida.retiradas;

  // 3. Pena: só com a partida seguindo; sem grupo definido, conforme `penaSemGrupo`.
  let pena: Pena | null = null;
  const devolver: IdBola[] = [];
  const retirar: IdBola[] = [];
  if (desfecho === null && faltas.length > 0) {
    if (grupoAntes === null) {
      switch (c.penaSemGrupo) {
        case 'so-perde-vez':
          pena = { tipo: 'mesa-aberta' };
      }
    } else if (c.penaInvertida) {
      const encacapadasDele = encacapadas.map((e) => e.bola).filter((b) => grupoDaBola(b, c) === grupoAntes);
      devolver.push(...aDevolver(encacapadasDele, quantas(faltas, c), c.penaInvertidaBola));
      naMesa = [...naMesa, ...devolver];
      encacapadas = encacapadas.filter((e) => !devolver.includes(e.bola));
      pena = { tipo: 'devolver', bolas: devolver };
    } else {
      // Sem bola final, com `ultimaPorPenaOuAdversario: 'volta'`, a pena não tira a última do adversário.
      const grupoDele = partida.grupos[adversaria] ?? null;
      const doAdversario = naMesa.filter((b) => grupoDaBola(b, c) === grupoDele);
      const poupar = castigo === null && c.ultimaPorPenaOuAdversario === 'volta' && doAdversario.length > 0 ? 1 : 0;
      const q = quantas(faltas, c);
      switch (c.penaBola) {
        case 'menor-do-adversario':
          retirar.push(...menores(doAdversario, Math.min(q, doAdversario.length - poupar)));
      }
      const poupada = poupar > 0 && q >= doAdversario.length ? Math.max(...doAdversario) : null;
      naMesa = naMesa.filter((b) => !retirar.includes(b));
      retiradas = [...retiradas, ...retirar];
      pena = { tipo: 'retirar', bolas: retirar, poupada };
    }
  }

  // 4. Grupos. `saidaComDoisGrupos: 'vale-primeira-perde-vez'` é a regra geral: a primeira
  // define o grupo e as do outro grupo contam para o adversário e passam a vez (passo 5).
  const grupos =
    grupoDefinido === null
      ? partida.grupos
      : equipe === 0
        ? [grupoDefinido, outro(grupoDefinido)]
        : [outro(grupoDefinido), grupoDefinido];

  // 5. Vez: continua só quem encaçapou bola sua, sem falta e sem bola do adversário (nem a que volta).
  const minhas = contam.filter((b) => b !== castigo && grupoDaBola(b, c) === grupos[equipe]);
  const deles = contam.filter((b) => b !== castigo && grupoDaBola(b, c) !== grupos[equipe]);
  const continua = desfecho === null && faltas.length === 0 && minhas.length > 0 && deles.length === 0 && voltaDeles.length === 0;

  // 6. Fim. Sem bola final, quem fica sem bolas do grupo vence. Pela pena ou pela mão do adversário,
  // só com `ultimaPorPenaOuAdversario: 'vence'`: com 'volta', os passos 1 e 3 não deixam o grupo vazio.
  if (desfecho === null && castigo === null && grupos[adversaria] !== null) {
    if (!naMesa.some((b) => grupoDaBola(b, c) === grupos[adversaria])) desfecho = 'adversario-sem-bolas';
  }
  const vencedor =
    desfecho === 'vitoria-castigo' || desfecho === 'vitoria-ultima' ? equipe : desfecho === null ? null : adversaria;
  const roda = partida.vezDaRoda ?? quem;
  naMesa = [...naMesa].sort((a, b) => a - b);
  const comAVez =
    vencedor !== null
      ? comVez(partida, quemSai(partida, vencedor), null)
      : continua
        ? comVez(partida, quemContinua(partida, quem), roda, partida.proximoDaRoda ?? null)
        : perderAMesa(partida, roda);
  const proximo = comAVez.vez;
  const depois = { ...comAVez, grupos, naMesa, encacapadas, retiradas, vencedor };
  const fase: FasePartida = vencedor !== null ? 'fim' : FASE_DO_OBJETIVO[objetivo(depois, proximo)];

  const recolocar: Recolocacao[] = [];
  if (castigoForaNaSaida) recolocar.push({ bola: castigo, lugar: c.castigoLugar });
  for (const bola of [...volta, ...voltaDeles]) recolocar.push({ bola, lugar: c.castigoLugar });
  for (const bola of f.pularam) {
    if (!retirar.includes(bola)) recolocar.push({ bola, lugar: bola === castigo ? c.castigoLugar : c.bolaDevolvidaLugar });
  }
  for (const bola of devolver) recolocar.push({ bola, lugar: c.bolaDevolvidaLugar });
  if (f.brancaCaiu || f.brancaFora) recolocar.push({ bola: BOLAO, lugar: c.brancaAposSuicidio });

  const texto = textoDaTacada({
    antes: partida,
    castigo,
    lugarDaVolta: c.castigoLugar,
    faltas,
    desfecho,
    volta,
    pena,
    grupoDefinido,
    minhas,
    deles,
    voltaDeles,
    pularam: f.pularam,
    continua,
    vaiParaCastigo: continua && fase === 'castigo',
    proximo,
  });

  return {
    partida: { ...depois, fase },
    consequencias: { faltas: faltas.map((nome) => ({ nome })), retirar, recolocar, proximo, vencedor, texto },
  };
}

/**
 * Pula a vez de quem tem a vez (ex.: caiu da sala), como numa tacada sem falta
 * que não encaçapou nada: a roda anda um. Pura; o resto da partida não muda.
 */
export function passarVez(partida: EstadoPartida): EstadoPartida {
  if (partida.vencedor !== null || partida.fase === 'fim') throw new Error('passarVez: a partida já terminou');
  if (partida.config.modalidade === 'mata-mata') return passarVezMataMata(partida);
  const depois = perderAMesa(partida, partida.vezDaRoda ?? partida.vez);
  return { ...depois, fase: partida.fase === 'saida' ? 'saida' : FASE_DO_OBJETIVO[objetivo(depois, depois.vez)] };
}

/**
 * A partida com a `vez` de um, a roda (`vezDaRoda`) em outro, só se forem diferentes,
 * e `proximoDaRoda` só se não for o primeiro da outra equipe depois da roda.
 * Sem `roda` (fim da partida), nenhum dos dois.
 */
function comVez(partida: EstadoPartida, vez: number, roda: number | null, proximo: number | null = null): EstadoPartida {
  const depois: { -readonly [K in keyof EstadoPartida]: EstadoPartida[K] } = { ...partida, vez };
  delete depois.vezDaRoda;
  delete depois.proximoDaRoda;
  if (roda === null) return depois;
  if (roda !== vez) depois.vezDaRoda = roda;
  if (proximo !== null && proximo !== primeiroDaOutra(partida.jogadores, roda)) depois.proximoDaRoda = proximo;
  return depois;
}

/**
 * A equipe de quem a roda escolheu (`roda`) perde a mesa: a vez vai para a outra
 * equipe, e a equipe que perdeu começa a próxima vez dela pelo seguinte de `roda`
 * entre os seus (o próprio, se está sozinho).
 */
function perderAMesa(partida: EstadoPartida, roda: number): EstadoPartida {
  switch (partida.config.ordemDaVez) {
    case 'alternada': {
      const vez = partida.proximoDaRoda ?? primeiroDaOutra(partida.jogadores, roda);
      return comVez(partida, vez, vez, proximoDaEquipe(partida.jogadores, roda, equipeDe(partida.jogadores, roda)));
    }
  }
}

/** O primeiro da outra equipe depois de `i` na ordem de `jogadores`. */
function primeiroDaOutra(jogadores: readonly Jogador[], i: number): number {
  return proximoDaEquipe(jogadores, i, 1 - equipeDe(jogadores, i));
}

/** Quem taca depois que `quem` encaçapou bola sua sem falta. */
function quemContinua(partida: EstadoPartida, quem: number): number {
  switch (partida.config.quemContinua) {
    case 'mesmo-jogador':
      return quem;
    case 'parceiro':
      return proximoDaEquipe(partida.jogadores, quem, partida.jogadores[quem]!.equipe);
  }
}

/** O primeiro da `equipe` na roda depois de `i` (o próprio `i`, se só ele for dela). */
function proximoDaEquipe(jogadores: readonly Jogador[], i: number, equipe: number): number {
  for (let k = 1; k <= jogadores.length; k++) {
    const j = (i + k) % jogadores.length;
    if (jogadores[j]!.equipe === equipe) return j;
  }
  throw new Error(`equipe ${equipe} sem jogadores`);
}

/** A bola final, se caiu; sem ela, a última bola do grupo de quem tacou, se ela caiu nesta tacada. */
function bolaDaVitoria(
  caidas: readonly IdBola[],
  naMesa: readonly IdBola[],
  grupo: Grupo | null,
  castigo: IdBola | null,
  c: ConfigRegras,
): IdBola | null {
  if (castigo !== null) return caidas.includes(castigo) ? castigo : null;
  if (grupo === null) return null;
  const minhas = caidas.filter((b) => grupoDaBola(b, c) === grupo);
  const restam = naMesa.some((b) => grupoDaBola(b, c) === grupo && !caidas.includes(b));
  return minhas.length > 0 && !restam ? minhas.at(-1)! : null;
}

function definirGrupo(c: ConfigRegras, caidas: readonly IdBola[]): Grupo | null {
  switch (c.definicaoGrupo) {
    case 'primeira-encacapada':
      return caidas.length > 0 ? grupoDaBola(caidas[0]!, c) : null;
  }
}

/** Quantas bolas as faltas pagam: a maior pena, ou a soma com `penaDupla`. */
function quantas(faltas: readonly NomeFalta[], c: ConfigRegras): number {
  const penas = faltas.map((f) => (f === 'direta' ? c.penaDireta : 1));
  return c.penaDupla ? penas.reduce((a, b) => a + b, 0) : Math.max(...penas);
}

/**
 * Quem dá a saída na próxima partida: o primeiro da equipe que sai, na roda,
 * depois de quem saiu nesta (o jogador 0, `novaPartida`). Na equipe de 2, se a
 * mesma equipe sai de novo, sai o parceiro.
 */
function quemSai(partida: EstadoPartida, vencedor: number): number {
  const { jogadores } = partida;
  switch (partida.config.proximaSaida) {
    case 'perdedor':
      return proximoDaEquipe(jogadores, 0, 1 - vencedor);
    case 'alternado':
      return proximoDaEquipe(jogadores, 0, 1 - jogadores[0]!.equipe);
    case 'ranca-saia':
      return proximoDaEquipe(jogadores, 0, vencedor);
  }
}

const outro = (g: Grupo): Grupo => (g === 'par' ? 'impar' : 'par');

const menores = (bolas: readonly IdBola[], n: number) => [...bolas].sort((a, b) => a - b).slice(0, n);

/** As `n` bolas que a pena invertida devolve, de `encacapadas` (em ordem de queda). */
function aDevolver(encacapadas: readonly IdBola[], n: number, qual: ConfigRegras['penaInvertidaBola']): IdBola[] {
  switch (qual) {
    case 'menor':
      return menores(encacapadas, n);
    case 'maior':
      return [...encacapadas].sort((a, b) => b - a).slice(0, n);
    case 'ultima':
      return [...encacapadas].reverse().slice(0, n);
  }
}

function embaralhar<T>(lista: readonly T[], rng: Rng): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng.proximo() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

function equipeDe(jogadores: readonly Jogador[], indice: number): number {
  const j = jogadores[indice];
  if (!j) throw new Error(`jogador ${indice} não existe`);
  return j.equipe;
}

/** Um `null` por equipe: nenhuma tem grupo ainda. */
function semGrupos(jogadores: readonly Jogador[]): null[] {
  return Array.from({ length: Math.max(...jogadores.map((j) => j.equipe)) + 1 }, () => null);
}

function validarJogadores(jogadores: readonly Jogador[], c: ConfigRegras): void {
  switch (c.modalidade) {
    case 'par-ou-impar':
      validarParOuImpar(jogadores, c);
      break;
    case 'mata-mata':
      validarMataMata(jogadores, c);
  }
  const formacao = formacaoDosJogadores(jogadores);
  const aceitas = formacoesAceitas(c);
  if (formacao === null || !aceitas.some((f) => f.join() === formacao.join())) {
    const n = jogadores.length;
    const em = formacao !== null && formacao.length > 1 ? ` em ${rotuloDaFormacao(formacao)}` : '';
    throw new Error(`novaPartida: o ${ROTULO_MODALIDADE[c.modalidade]} não aceita ${n} jogador${n === 1 ? '' : 'es'}${em}; aceita ${aceitas.map(rotuloDaFormacao).join(', ')}`);
  }
}

function validarMataMata(jogadores: readonly Jogador[], c: ConfigRegras): void {
  const erros = incoerenciasDaConfig(c);
  if (erros.length > 0) throw new Error(`novaPartida: o mata-mata precisa das 15 bolas e de nenhuma bola final:\n- ${erros.join('\n- ')}`);
  const n = jogadores.length;
  if (new Set(jogadores.map((j) => j.id)).size !== n) throw new Error('novaPartida: id de jogador repetido');
  if (new Set(jogadores.map((j) => j.equipe)).size !== n || jogadores.some((j) => !Number.isInteger(j.equipe) || j.equipe < 0 || j.equipe >= n)) {
    throw new Error(`novaPartida: no mata-mata cada jogador fica na sua equipe, de 0 a ${n - 1}`);
  }
}

function validarParOuImpar(jogadores: readonly Jogador[], c: ConfigRegras): void {
  const n = jogadores.length;
  if (n < 2 || n > 4) throw new Error('novaPartida: são 2 jogadores (1×1), 3 (2×1) ou 4 (2×2)');
  if (new Set(jogadores.map((j) => j.id)).size !== n) throw new Error('novaPartida: id de jogador repetido');
  const tamanhos = [0, 1].map((e) => jogadores.filter((j) => j.equipe === e).length);
  if (!jogadores.every((j) => j.equipe === 0 || j.equipe === 1) || tamanhos.some((t) => t < 1 || t > 2)) {
    throw new Error('novaPartida: as equipes são 0 e 1, cada uma com 1 ou 2 jogadores');
  }
  switch (c.ordemDaVez) {
    case 'alternada': {
      const equipe = jogadores[0]!.equipe;
      const roda = intercalar(
        jogadores.filter((j) => j.equipe === equipe),
        jogadores.filter((j) => j.equipe !== equipe),
      );
      if (roda.some((j, i) => j !== jogadores[i])) {
        throw new Error('novaPartida: a roda precisa alternar as equipes (A1, B1, A2, B2; no 2×1, A1, B1, A2 ou B1, A1, A2)');
      }
    }
  }
}
