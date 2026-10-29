import type { EventoTacada, IdBola } from '@sinuca/fisica';
import { BOLAO, fatos } from './fatos';
import { bolasDaCasa } from './leitura';
import { ehTreino } from './modalidades';
import { textoDoTreino } from './texto';
import type { EstadoPartida, NomeFalta, Recolocacao, ResultadoRegras } from './tipos';

/**
 * A tacada no treino (L39): uma pessoa sozinha, as 15 bolas, sem grupo nem pontos. A vez nunca passa (`vez` e
 * `consequencias.proximo` ficam em quem treina). As faltas (`cegar`, `suicidio`, `branca-fora` e, só com
 * `bolaForaDaMesa: 'falta'`, `bola-fora`) são informadas em `consequencias.faltas` mas não custam nada: não tiram bola
 * nem vez. A branca que cai ou sai volta à mão (`brancaNaMao`, com a marca de saída em `recolocar` como lugar de
 * partida), e a numerada que pula da mesa volta onde a config manda: não é pena, só mantém a mesa e `naMesa` iguais.
 * A partida acaba (`fim`, `vencedor` 0) quando esta tacada encaçapa a última bola da mesa; mesa que já estava vazia
 * porque o jogador a esvaziou à mão (`sincronizarMesa`) não acaba nada. Pura, como `aplicarTacada`, que a chama.
 */
export function aplicarTreino(partida: EstadoPartida, eventos: readonly EventoTacada[]): ResultadoRegras {
  const c = partida.config;
  const f = fatos(eventos, new Set(partida.naMesa), partida.naMesa);

  const faltas: NomeFalta[] = [];
  if (f.primeiro.length === 0) faltas.push('cegar');
  if (f.brancaCaiu) faltas.push('suicidio');
  if (f.brancaFora) faltas.push('branca-fora');
  if (f.pularam.length > 0 && c.bolaForaDaMesa === 'falta') faltas.push('bola-fora');

  const naMesa = partida.naMesa.filter((b) => !f.caidas.includes(b));
  const encacapadas = [...partida.encacapadas, ...f.caidas.map((bola) => ({ bola, jogador: partida.vez }))];
  const mesaLimpa = f.caidas.length > 0 && naMesa.length === 0;
  const vencedor = mesaLimpa ? partida.jogadores[partida.vez]!.equipe : null;

  const recolocar: Recolocacao[] = f.pularam.map((bola) => ({ bola, lugar: c.bolaDevolvidaLugar }));
  const brancaNaMao = f.brancaCaiu || f.brancaFora;
  if (brancaNaMao) recolocar.push({ bola: BOLAO, lugar: c.brancaAposSuicidio });

  const texto = textoDoTreino({ antes: partida, faltas, matou: f.caidas, pularam: f.pularam, brancaNaMao, mesaLimpa });
  return {
    partida: { ...partida, fase: mesaLimpa ? 'fim' : 'aberta', naMesa, encacapadas, vencedor },
    consequencias: {
      faltas: faltas.map((nome) => ({ nome })),
      retirar: [],
      recolocar,
      proximo: partida.vez,
      vencedor,
      ...(brancaNaMao ? { brancaNaMao: true as const } : {}),
      texto,
    },
  };
}

/**
 * Treino: alinha a partida às bolas que estão na mesa depois de o jogador arrumá-la à mão (tirar, mover ou devolver bola).
 * `naMesa` são as numeradas que ficaram na mesa, em qualquer ordem; o bolão, se vier na lista, é ignorado (a branca está
 * sempre em jogo). Cada bola fica em um lugar só: a que saiu da lista sem ter sido encaçapada passa a `retiradas`; a que
 * estava em `retiradas` ou `encacapadas` e voltou à lista deixa essas listas e volta a `naMesa` (ordenada); o resto
 * não muda. Se a partida tinha acabado e há bola na mesa, ela reabre (`aberta`, sem vencedor); esvaziar a mesa à mão
 * nunca encerra nada. Lança para bola que a partida não usa, bola repetida e partida que não é de treino. Pura.
 */
export function sincronizarMesa(partida: EstadoPartida, naMesa: readonly IdBola[]): EstadoPartida {
  if (!ehTreino(partida.config)) throw new Error('sincronizarMesa: só o treino deixa arrumar a mesa');
  const validas = new Set(bolasDaCasa(partida.config));
  const lista = new Set<IdBola>();
  for (const bola of naMesa) {
    if (bola === BOLAO) continue;
    if (!validas.has(bola)) throw new Error(`sincronizarMesa: a bola ${bola} não é desta partida`);
    if (lista.has(bola)) throw new Error(`sincronizarMesa: a bola ${bola} aparece duas vezes`);
    lista.add(bola);
  }
  const agora = [...lista].sort((a, b) => a - b);
  const tiradas = partida.naMesa.filter((b) => !lista.has(b));
  const reabre = partida.fase === 'fim' && agora.length > 0;
  return {
    ...partida,
    fase: reabre ? 'aberta' : partida.fase,
    naMesa: agora,
    encacapadas: partida.encacapadas.filter((e) => !lista.has(e.bola)),
    retiradas: [...partida.retiradas.filter((b) => !lista.has(b)), ...tiradas],
    vencedor: reabre ? null : partida.vencedor,
  };
}
