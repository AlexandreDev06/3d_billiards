import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, mesaInicial, simularTacada } from '@sinuca/fisica';
import type { MensagemDaSala, MotivoRetrato } from '@sinuca/protocolo';
import { PRESET_MATA_MATA, novaPartida, passarVez, type EstadoPartida } from '@sinuca/regras';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { avisoDoPulo, vezPerdida } from '../jogo/vez-perdida';
import { PartidaOnline } from './partida-online';

const RODA = [
  { id: 'lugar-0', nome: 'Ana', equipe: 0 },
  { id: 'lugar-1', nome: 'Beto', equipe: 1 },
  { id: 'lugar-2', nome: 'Caio', equipe: 2 },
];

/** O adaptador sozinho: o teste entrega os retratos da sala à mão e vê o que o ouvinte recebe. */
function direto() {
  const retratos: { motivo: MotivoRetrato; antes: EstadoPartida | null; depois: EstadoPartida }[] = [];
  const partida = new PartidaOnline({
    conexao: { enviar: () => true },
    jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
    fisica: () => CONFIG_FISICA_PADRAO,
    rng: criarRng(1),
    agora: () => 0,
    ouvintes: { aoRetrato: (motivo, jogo, antes) => retratos.push({ motivo, antes, depois: jogo.partida }) },
  });
  const { partida: inicial, arrumacao } = novaPartida(PRESET_MATA_MATA.regras, RODA, criarRng(3));
  const retrato = (motivo: MotivoRetrato, p: EstadoPartida, seq: number): MensagemDaSala => ({ tipo: 'retrato', motivo, seq, partida: p, arrumacao, semente: 5, mesa: mesaInicial(arrumacao, CONFIG_FISICA_PADRAO, criarRng(5)), ultima: null });
  return { partida, retratos, inicial, retrato };
}

describe('PartidaOnline: o retrato leva a partida de antes', () => {
  it('o primeiro retrato não tem antes; o seguinte traz a partida que o Jogo tinha um instante atrás (o Jogo é o mesmo)', () => {
    const t = direto();
    t.partida.receber(t.retrato('inicio', t.inicial, 0));
    t.partida.receber(t.retrato('vez-passou', { ...t.inicial, vez: 1 }, 0));
    expect(t.retratos.map((r) => [r.motivo, r.antes === null])).toEqual([
      ['inicio', true],
      ['vez-passou', false],
    ]);
    expect(t.retratos[1]!.antes!.vez).toBe(0);
    expect(t.retratos[1]!.depois.vez).toBe(1);
  });

  it('com isso o tempo esgotado que a sala resolve com um pulo vira o aviso "Beto pula a vez (falta)"', () => {
    const t = direto();
    const comPena: EstadoPartida = { ...t.inicial, fase: 'aberta', vez: 0, perdemAProximaVez: [1] };
    t.partida.receber(t.retrato('inicio', comPena, 0));
    t.partida.receber(t.retrato('vez-passou', passarVez(comPena), 0));
    const { antes, depois } = t.retratos[1]!;
    expect(depois.vez).toBe(2);
    const { pulados } = vezPerdida(antes!, depois);
    expect(pulados).toEqual([1]);
    expect(avisoDoPulo(depois, pulados)).toBe('Beto pula a vez (falta)');
  });

  it('um tempo esgotado sem ninguém na lista não avisa nada', () => {
    const t = direto();
    const aberta: EstadoPartida = { ...t.inicial, fase: 'aberta', vez: 0 };
    t.partida.receber(t.retrato('inicio', aberta, 0));
    t.partida.receber(t.retrato('vez-passou', passarVez(aberta), 0));
    const { antes, depois } = t.retratos[1]!;
    expect(avisoDoPulo(depois, vezPerdida(antes!, depois).pulados)).toBe('');
  });
});
