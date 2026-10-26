import type { EventoTacada } from '@sinuca/fisica';
import { BOLAO, fatos } from './fatos';
import { pontosPorEquipe } from './leitura';
import { textoDoMataMata } from './texto';
import type { EstadoPartida, NomeFalta, Recolocacao, ResultadoRegras } from './tipos';

/**
 * A tacada no mata-mata: cada bola encaçapada vale 1 ponto para quem tacou (na saída e em
 * tacada com falta também) e a vez passa sempre ao próximo da roda, mate ou não. As faltas
 * não tiram bola: nada é retirado. A branca que cai ou sai volta à marca de saída, e a numerada
 * que pula da mesa volta onde a config manda. Com `suicidioNoMataMata` (a branca fora do jogo) ou
 * `cegarNoMataMata` (a branca sem tocar bola) em `'perde-proxima-vez'`, quem cometeu a falta entra em
 * `perdemAProximaVez`, uma vez só mesmo que cometa as duas; a roda pula (e tira da lista) quem estiver
 * nela, e `consequencias.proximo` já sai com o pulo. A partida acaba quando não sobra bola na
 * mesa: ganha quem tem mais pontos e, no empate, entre os empatados, quem encaçapou bola por
 * último; a lista não importa mais e sai do estado. Pura, como `aplicarTacada`, que a chama.
 */
export function aplicarMataMata(partida: EstadoPartida, eventos: readonly EventoTacada[]): ResultadoRegras {
  const c = partida.config;
  const quem = partida.vez;
  const f = fatos(eventos, new Set(partida.naMesa), partida.naMesa);

  const faltas: NomeFalta[] = [];
  const cegou = f.primeiro.length === 0;
  if (cegou) faltas.push('cegar');
  if (f.brancaCaiu) faltas.push('suicidio');
  if (f.brancaFora) faltas.push('branca-fora');
  if (f.pularam.length > 0 && c.bolaForaDaMesa === 'falta') faltas.push('bola-fora');

  const naMesa = partida.naMesa.filter((b) => !f.caidas.includes(b));
  const encacapadas = [...partida.encacapadas, ...f.caidas.map((bola) => ({ bola, jogador: quem }))];
  const terminou = naMesa.length === 0;
  const fim = terminou ? desempate({ ...partida, encacapadas }) : null;

  const recolocar: Recolocacao[] = f.pularam.map((bola) => ({ bola, lugar: c.bolaDevolvidaLugar }));
  const brancaVolta = f.brancaCaiu || f.brancaFora;
  if (brancaVolta) recolocar.push({ bola: BOLAO, lugar: c.brancaAposSuicidio });

  // Cada falta tem a sua opção; as duas na mesma tacada continuam sendo uma pena só (`andarARoda` recebe `quem` uma vez).
  const punePeloSuicidio = brancaVolta && c.suicidioNoMataMata === 'perde-proxima-vez';
  const punePorCegar = cegou && c.cegarNoMataMata === 'perde-proxima-vez';
  const perde = !terminou && (punePeloSuicidio || punePorCegar);
  const roda = terminou ? null : andarARoda(partida, quem, perde ? [quem] : []);
  // Depois da saída a mesa está aberta até esvaziar. Quem sai na próxima partida: o seguinte a quem saiu nesta, o jogador 1.
  const proximo = roda?.vez ?? 1;
  const vencedor = fim?.vencedor ?? null;

  const texto = textoDoMataMata({ antes: partida, faltas, matou: f.caidas, pularam: f.pularam, brancaVolta, perde, pulados: roda?.pulados ?? [], proximo, fim });
  return {
    partida: comPerdemAProximaVez({ ...partida, vez: proximo, fase: terminou ? 'fim' : 'aberta', naMesa, encacapadas, vencedor }, roda?.perdem ?? []),
    consequencias: { faltas: faltas.map((nome) => ({ nome })), retirar: [], recolocar, proximo, vencedor, texto },
  };
}

/**
 * Passa a vez de quem tem a vez (ex.: o tempo esgotou ou caiu da sala): a roda anda um e pula quem
 * perdia a vez. Quem teve a vez passada não ganha pena.
 */
export function passarVezMataMata(partida: EstadoPartida): EstadoPartida {
  const roda = andarARoda(partida, partida.vez, []);
  return comPerdemAProximaVez({ ...partida, vez: roda.vez }, roda.perdem);
}

/**
 * A roda andando de `de` para o próximo que não perde a vez. Quem estava em `perdemAProximaVez` (mais
 * `novos`) e a roda alcança sai da lista e é pulado. Cada pulo consome uma entrada, então não há laço:
 * se todos estavam, a roda gasta todas e para em quem vem logo depois de `de`.
 */
function andarARoda(partida: EstadoPartida, de: number, novos: readonly number[]): { vez: number; pulados: number[]; perdem: number[] } {
  const n = partida.jogadores.length;
  const perdem = new Set([...(partida.perdemAProximaVez ?? []), ...novos]);
  const pulados: number[] = [];
  let vez = (de + 1) % n;
  while (perdem.delete(vez)) {
    pulados.push(vez);
    vez = (vez + 1) % n;
  }
  return { vez, pulados, perdem: [...perdem].sort((a, b) => a - b) };
}

/** A partida com `perdemAProximaVez` = `perdem`, ou sem o campo se ninguém perde (a forma de sempre). */
function comPerdemAProximaVez(partida: EstadoPartida, perdem: readonly number[]): EstadoPartida {
  const depois: { -readonly [K in keyof EstadoPartida]: EstadoPartida[K] } = { ...partida };
  delete depois.perdemAProximaVez;
  if (perdem.length > 0) depois.perdemAProximaVez = perdem;
  return depois;
}

/** O fim do mata-mata: quem tem mais pontos; no empate, entre os empatados, quem encaçapou bola por último. */
function desempate(partida: EstadoPartida): { vencedor: number; pontos: number; empatados: number[] } {
  const pontos = pontosPorEquipe(partida);
  const melhor = Math.max(...pontos);
  const empatados = pontos.flatMap((p, equipe) => (p === melhor ? [equipe] : []));
  const ultima = partida.encacapadas.findLast((e) => pontos[partida.jogadores[e.jogador]!.equipe] === melhor)!;
  return { vencedor: partida.jogadores[ultima.jogador]!.equipe, pontos: melhor, empatados };
}
