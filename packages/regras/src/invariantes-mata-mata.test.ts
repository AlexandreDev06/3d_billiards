import type { Rng } from '@sinuca/fisica';
import { describe, expect, it } from 'vitest';
import { bolasAlvo, bolasDaCasa, grupoDaBola, jogadoresDaProxima, objetivo, pontosPorEquipe } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import { JOGADORES, QUARTETO, SEM_PENA_NAS_FALTAS, SEM_PENA_NO_CEGAR, SEM_PENA_NO_SUICIDIO, TRIO, configMataMata, congelar, eventos, rngDeTeste, type Tacada } from './para-testes';
import type { ConfigRegras, EstadoPartida, Jogador, NomeFalta } from './tipos';

const sorteio = (rng: Rng, p: number) => rng.proximo() < p;

function embaralhar<T>(lista: readonly T[], rng: Rng): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng.proximo() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Tacada qualquer, mas fisicamente possível: só bolas da mesa; sem toque, nada cai. */
function tacadaAoAcaso(partida: EstadoPartida, rng: Rng): Tacada {
  const mesa = partida.naMesa;
  if (sorteio(rng, 0.12)) return { branca: sorteio(rng, 0.3) ? 'cai' : undefined };
  const ordem = embaralhar(mesa, rng);
  const toca = sorteio(rng, 0.1) ? ordem.slice(0, 2) : ordem.slice(0, 1);
  const caem = embaralhar(mesa, rng).filter(() => sorteio(rng, 0.15));
  const pulam = mesa.filter((b) => !caem.includes(b) && sorteio(rng, 0.03));
  const branca = sorteio(rng, 0.1) ? 'cai' : sorteio(rng, 0.03) ? 'fora' : undefined;
  return { toca, caem, pulam, branca };
}

const ordenado = (l: readonly number[]) => [...l].sort((a, b) => a - b);
const equipeDe = (p: EstadoPartida, i: number) => p.jogadores[i]!.equipe;

/** O vencedor por outro caminho: o placar num Map e a última bola de quem tem o melhor placar, de trás para a frente. */
function vencedorDoModelo(p: EstadoPartida): number {
  const placar = new Map<number, number>();
  for (const e of p.encacapadas) placar.set(equipeDe(p, e.jogador), (placar.get(equipeDe(p, e.jogador)) ?? 0) + 1);
  const melhor = Math.max(...placar.values());
  for (let k = p.encacapadas.length - 1; k >= 0; k--) {
    const equipe = equipeDe(p, p.encacapadas[k]!.jogador);
    if (placar.get(equipe) === melhor) return equipe;
  }
  throw new Error('partida sem bola encaçapada');
}

/**
 * Quem joga depois de `de`, por outro caminho que o das regras: um contador de penas por jogador, que a roda gasta
 * uma a uma conforme passa por quem as deve. `novo` é quem acabou de ganhar uma pena (ou ninguém).
 */
function rodaDoModelo(n: number, de: number, pendentes: readonly number[], novo: number | null) {
  const devendo = Array.from({ length: n }, (_, i) => pendentes.filter((x) => x === i).length + (novo === i ? 1 : 0));
  const pulados: number[] = [];
  let alvo = de + 1;
  while (devendo[alvo % n]! > 0) {
    devendo[alvo % n]!--;
    pulados.push(alvo % n);
    alvo++;
  }
  return { vez: alvo % n, pulados, restantes: devendo.flatMap((d, i) => (d > 0 ? [i] : [])) };
}

/**
 * Quantas vezes a roda pulou alguém e de que falta veio cada pena, para o teste provar que cada caso acontece nas
 * partidas ao acaso. `juntas` = cegar e tirar a branca na mesma tacada, com as duas penas ligadas (uma entrada só).
 */
const contagem = { pulos: 0, penasSuicidio: 0, penasCegar: 0, juntas: 0 };

/** A lista de quem perde a vez está na forma que as regras prometem: ausente se vazia, crescente, sem repetição, no intervalo, sem quem tem a vez. */
function conferirLista(p: EstadoPartida) {
  if (!Object.hasOwn(p, 'perdemAProximaVez')) return;
  const lista = p.perdemAProximaVez!;
  expect(lista.length, 'o campo só existe quando há alguém').toBeGreaterThan(0);
  expect(lista, 'crescente e sem repetição').toEqual([...new Set(lista)].sort((a, b) => a - b));
  for (const i of lista) expect(Number.isInteger(i) && i >= 0 && i < p.jogadores.length).toBe(true);
  expect(lista, 'quem tem a vez não perde a vez').not.toContain(p.vez);
}

/** Uma tacada: confere as invariantes do mata-mata contra o que a tacada pedia. */
function jogarETestar(antes: EstadoPartida, tacada: Tacada): EstadoPartida {
  const evs = congelar(eventos(tacada));
  const r = aplicarTacada(antes, evs);
  expect(aplicarTacada(antes, evs), 'pura: mesma entrada, mesma saída').toEqual(r);
  const { partida: p, consequencias: c } = r;
  const n = antes.jogadores.length;
  const caem = tacada.caem ?? [];
  const pulam = tacada.pulam ?? [];

  // Bolas: a conservação das 15, e nada de pena.
  expect(ordenado([...p.naMesa, ...p.encacapadas.map((e) => e.bola)]), 'conservação: mesa + encaçapadas = as 15').toEqual(bolasDaCasa(p.config));
  expect(p.naMesa).toEqual(ordenado(p.naMesa));
  expect(p.retiradas, 'nada é retirado').toEqual([]);
  expect(c.retirar).toEqual([]);
  expect(p.naMesa).toEqual(antes.naMesa.filter((b) => !caem.includes(b)));

  // Pontos: 1 por bola, para quem tacou, e a soma fecha.
  const quem = antes.vez;
  expect(p.encacapadas.slice(antes.encacapadas.length)).toEqual(caem.map((bola) => ({ bola, jogador: quem })));
  const antesDe = pontosPorEquipe(antes);
  const depois = pontosPorEquipe(p);
  expect(depois).toHaveLength(n);
  depois.forEach((pts, equipe) => expect(pts, `equipe ${equipe}`).toBe(antesDe[equipe]! + (equipe === equipeDe(antes, quem) ? caem.length : 0)));
  expect(depois.reduce((a, b) => a + b, 0)).toBe(p.encacapadas.length);

  // Faltas reconhecidas, sem pena; a branca volta à marca.
  const cegou = (tacada.toca === undefined ? [] : [tacada.toca].flat()).length === 0;
  const esperadas: NomeFalta[] = [];
  if (cegou) esperadas.push('cegar');
  if (tacada.branca === 'cai') esperadas.push('suicidio');
  if (tacada.branca === 'fora') esperadas.push('branca-fora');
  if (pulam.length > 0 && p.config.bolaForaDaMesa === 'falta') esperadas.push('bola-fora');
  expect(c.faltas.map((f) => f.nome)).toEqual(esperadas);
  const volta = [...pulam.map((bola) => ({ bola, lugar: p.config.bolaDevolvidaLugar })), ...(tacada.branca ? [{ bola: 0, lugar: 'marca-saida' }] : [])];
  expect(c.recolocar).toEqual(volta);
  for (const rec of c.recolocar) if (rec.bola !== 0) expect(p.naMesa).toContain(rec.bola);

  // Vez, fase e fim. A vez anda um na roda, pulando (e gastando) quem perdia a vez; cegar e a branca fora do jogo entram na lista, cada um se a casa pune, os dois juntos numa entrada só.
  const acabou = p.naMesa.length === 0;
  const punidoPeloSuicidio = !acabou && tacada.branca !== undefined && p.config.suicidioNoMataMata === 'perde-proxima-vez';
  const punidoPorCegar = !acabou && cegou && p.config.cegarNoMataMata === 'perde-proxima-vez';
  const penaliza = punidoPeloSuicidio || punidoPorCegar;
  const roda = rodaDoModelo(n, antes.vez, antes.perdemAProximaVez ?? [], penaliza ? quem : null);
  if (!acabou) {
    contagem.pulos += roda.pulados.length;
    if (punidoPeloSuicidio) contagem.penasSuicidio++;
    if (punidoPorCegar) contagem.penasCegar++;
    if (punidoPeloSuicidio && punidoPorCegar) contagem.juntas++;
  }
  expect(p.vez).toBe(c.proximo);
  expect(p.vez).toBe(acabou ? 1 : roda.vez);
  expect(p.perdemAProximaVez ?? [], 'o que sobra da lista').toEqual(acabou ? [] : roda.restantes);
  conferirLista(p);
  expect(p.vencedor).toBe(c.vencedor);
  expect(p.fase).toBe(acabou ? 'fim' : 'aberta');
  expect(p.vencedor).toBe(acabou ? vencedorDoModelo(p) : null);
  expect(p).not.toHaveProperty('vezDaRoda');
  expect(p).not.toHaveProperty('proximoDaRoda');

  // Sem grupos, a mesma gente, a frase certa.
  expect(p.jogadores).toBe(antes.jogadores);
  expect(p.config).toBe(antes.config);
  expect(p.grupos).toEqual(antes.jogadores.map(() => null));
  expect(c.texto.length).toBeGreaterThan(0);
  expect(c.texto.includes('Falta sem pena')).toBe(esperadas.length > 0 && !penaliza);
  expect(c.texto.includes('perde a próxima vez'), 'a frase da pena').toBe(penaliza);
  if (penaliza) expect(c.texto.match(/perde a próxima vez/g), 'a pena aparece uma vez só, mesmo com duas faltas').toHaveLength(1);
  expect(c.texto.includes('Branca na marca'), 'a branca só volta se saiu do jogo').toBe(penaliza && tacada.branca !== undefined);
  if (acabou) expect(c.texto).toContain('venceu');
  else if (roda.pulados.length === 0) expect(c.texto.endsWith(`Vez de ${p.jogadores[p.vez]!.nome}.`)).toBe(true);
  else {
    const nomes = roda.pulados.map((i) => p.jogadores[i]!.nome);
    expect(c.texto.endsWith(`${nomes.length > 1 ? 'perderam' : 'perdeu'} a vez: joga ${p.jogadores[p.vez]!.nome}.`)).toBe(true);
    for (const nome of nomes) expect(c.texto).toContain(nome);
  }
  if (acabou) expect(bolasAlvo(p)).toEqual([]);
  else {
    expect(bolasAlvo(p), 'qualquer bola da mesa').toEqual(p.naMesa);
    for (let i = 0; i < n; i++) expect(objetivo(p, i)).toBe('qualquer');
  }
  for (const bola of p.config.bolas === '1-15' ? [0, ...bolasDaCasa(p.config)] : []) expect(grupoDaBola(bola, p.config)).toBeNull();
  return congelar(p);
}

describe('mata-mata: invariantes em partidas ao acaso', () => {
  const casas: readonly Partial<ConfigRegras>[] = [{}, { bolaForaDaMesa: 'falta' }, SEM_PENA_NO_SUICIDIO, SEM_PENA_NO_CEGAR, SEM_PENA_NAS_FALTAS];

  it.each([JOGADORES, TRIO, QUARTETO].flatMap((j) => casas.map((c) => [j.length, JSON.stringify(c), j, c] as const)))(
    '%i jogadores, casa %s: 60 partidas',
    (_, __, jogadores, casa) => {
      let terminadas = 0;
      contagem.pulos = 0;
      contagem.penasSuicidio = 0;
      contagem.penasCegar = 0;
      contagem.juntas = 0;
      for (let semente = 1; semente <= 60; semente++) {
        const rng = rngDeTeste(semente);
        let partida = congelar(novaPartida(configMataMata(casa), jogadores, rng).partida);
        for (let tacada = 0; tacada < 400 && partida.vencedor === null; tacada++) {
          if (sorteio(rng, 0.04)) {
            const depois = passarVez(partida);
            expect(passarVez(partida), 'pura').toEqual(depois);
            const roda = rodaDoModelo(jogadores.length, partida.vez, partida.perdemAProximaVez ?? [], null);
            expect({ ...depois, vez: 0, perdemAProximaVez: undefined }, 'só a vez e a lista mudam').toEqual({ ...partida, vez: 0, perdemAProximaVez: undefined });
            expect(depois.vez).toBe(roda.vez);
            expect(depois.perdemAProximaVez ?? [], 'quem tem a vez passada não ganha pena').toEqual(roda.restantes);
            conferirLista(depois);
            partida = congelar(depois);
          } else {
            partida = jogarETestar(partida, tacadaAoAcaso(partida, rng));
          }
        }
        if (partida.vencedor !== null) {
          terminadas++;
          expect(partida, 'partida acabada não leva a lista').not.toHaveProperty('perdemAProximaVez');
          expect(() => aplicarTacada(partida, eventos({ toca: 1 }))).toThrow(/terminou/);
          expect(() => passarVez(partida)).toThrow(/terminou/);
        }
      }
      expect(terminadas).toBeGreaterThan(50);
      const suicidioPune = casa.suicidioNoMataMata !== 'sem-pena';
      const cegarPune = casa.cegarNoMataMata !== 'sem-pena';
      if (!suicidioPune) expect(contagem.penasSuicidio, 'sem a pena, o suicídio não é punido').toBe(0);
      else expect(contagem.penasSuicidio, 'o suicídio punido acontece').toBeGreaterThan(20);
      if (!cegarPune) expect(contagem.penasCegar, 'sem a pena, cegar não é punido').toBe(0);
      else expect(contagem.penasCegar, 'cegar punido acontece').toBeGreaterThan(20);
      if (!suicidioPune && !cegarPune) expect(contagem).toEqual({ pulos: 0, penasSuicidio: 0, penasCegar: 0, juntas: 0 });
      else expect(contagem.pulos, 'e a roda pula alguém').toBeGreaterThan(10);
      if (suicidioPune && cegarPune) expect(contagem.juntas, 'cegar e suicídio juntos acontecem, e valem uma entrada só').toBeGreaterThan(3);
      else expect(contagem.juntas).toBe(0);
    },
  );

  it.each([JOGADORES, TRIO, QUARTETO].map((j) => [j.length, j] as const))('%i jogadores: partidas em sequência, a roda gira uma casa por partida e as equipes ficam', (n, inicio) => {
    let terminadas = 0;
    for (let semente = 1; semente <= 30; semente++) {
      const rng = rngDeTeste(semente);
      let roda: readonly Jogador[] = inicio;
      const equipes = new Map(inicio.map((j) => [j.id, j.equipe]));
      for (let partidaN = 0; partidaN < 2 * n + 1; partidaN++) {
        let partida = congelar(novaPartida(configMataMata(), roda, rng).partida);
        expect(partida.jogadores[partida.vez]!.id, 'quem sai é o primeiro da roda').toBe(roda[0]!.id);
        for (let tacada = 0; tacada < 400 && partida.vencedor === null; tacada++) partida = jogarETestar(partida, tacadaAoAcaso(partida, rng));
        if (partida.vencedor === null) break;
        terminadas++;
        const proxima = jogadoresDaProxima(partida);
        expect(proxima.map((j) => j.id)).toEqual([...roda.slice(1), roda[0]!].map((j) => j.id));
        for (const j of proxima) expect(j.equipe, 'ninguém é renumerado').toBe(equipes.get(j.id));
        roda = proxima;
      }
    }
    expect(terminadas, 'quase todas as partidas da sequência terminam').toBeGreaterThan(30 * (2 * n + 1) * 0.9);
  });
});
