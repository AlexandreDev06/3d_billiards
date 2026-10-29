import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO as C, bolaParada, lugares, medidasDaBola, type EstadoMesa } from '@sinuca/fisica';
import { diaDaMissao, vitrineDoDia } from '@sinuca/protocolo';
import { ClienteDeTeste, INSTANTE_SEM_VITRINE, SKINS_QUE_OS_TESTES_COMPRAM, criarAmbiente, mesaDepoisDasConsequencias, relogioSemVitrine, sortearDeTeste } from './para-testes';
import { AmbienteDeRede } from './para-testes-ws';

describe('apoio dos testes — o mapa dos lugares que o cliente web também aplica', () => {
  const raio = medidasDaBola(8, C).raio;
  const pontos = lugares(C.mesa, raio);
  const mesa: EstadoMesa = { bolas: [bolaParada(0, { x: -0.6, z: 0.3 }, C), bolaParada(8, { x: 0.2, z: -0.3 }, C)] };

  it.each([
    ['marca-pe', pontos.marcaPe],
    ['marca-saida', pontos.marcaSaida],
    ['tabela-lado-saida', pontos.tabelaLadoSaida],
    ['centro-mesa', { x: 0, z: 0 }],
  ] as const)('%s: a bola recolocada fica no ponto que a física dá para o lugar', (lugar, ponto) => {
    const depois = mesaDepoisDasConsequencias(mesa, { retirar: [8], recolocar: [{ bola: 8, lugar }] });
    const oito = depois.bolas.find((b) => b.id === 8)!;
    expect(oito.naMesa).toBe(true);
    expect(oito.posicao.x).toBeCloseTo(ponto.x, 6);
    expect(oito.posicao.z).toBeCloseTo(ponto.z, 6);
  });

  it('os lugares são pontos diferentes (o teste acima distingue um do outro)', () => {
    const pontosDistintos = new Set([pontos.marcaPe, pontos.marcaSaida, pontos.tabelaLadoSaida].map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`));
    expect(pontosDistintos.size).toBe(3);
  });
});

describe('apoio dos testes — sorteio semeado', () => {
  it('a mesma semente dá a mesma sequência, e sementes diferentes dão sequências diferentes', () => {
    const a = sortearDeTeste(7);
    const b = sortearDeTeste(7);
    const c = sortearDeTeste(8);
    const seq = (f: (max: number) => number) => Array.from({ length: 6 }, () => f(1000));
    expect(seq(a)).toEqual(seq(b));
    expect(seq(sortearDeTeste(7))).not.toEqual(seq(c));
  });

  it('devolve inteiros em [0, max), inclusive para max de 32 bits', () => {
    const f = sortearDeTeste(3);
    for (let i = 0; i < 200; i++) {
      const v = f(2 ** 32);
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
      expect(f(31)).toBeLessThan(31);
    }
  });
});

describe('apoio dos testes — a quebra não depende de sorte', () => {
  const quebra = (amb: ReturnType<typeof criarAmbiente>) => {
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    const r = ana.conn.ultima('retrato')!;
    return { codigo: ana.codigo, semente: r.semente, arrumacao: r.arrumacao };
  };

  it('criarAmbiente: duas salas iniciadas em ambientes separados têm o mesmo código, a mesma semente e a mesma arrumação', () => {
    expect(quebra(criarAmbiente())).toEqual(quebra(criarAmbiente()));
  });

  it('criarAmbiente: o sorteio ainda pode ser trocado pelo teste', () => {
    const fixo = quebra(criarAmbiente({}, { sortear: () => 3 }));
    expect(fixo.semente).toBe(3);
    expect(fixo).not.toEqual(quebra(criarAmbiente()));
  });

  it('servidor de rede dos testes: dois servidores sorteiam a mesma semente', async () => {
    const rede = new AmbienteDeRede();
    try {
      const semente = async () => {
        const s = await rede.subir();
        const ana = await rede.conectar(s, 'Ana');
        ana.criar();
        const { codigo } = await ana.esperarTipo('boas-vindas');
        const beto = await rede.conectar(s, 'Beto');
        beto.entrar(codigo);
        await beto.esperarTipo('boas-vindas');
        ana.enviar({ tipo: 'iniciar' });
        const r = await ana.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio');
        return r.tipo === 'retrato' ? { codigo, semente: r.semente, arrumacao: r.arrumacao } : null;
      };
      expect(await semente()).toEqual(await semente());
    } finally {
      await rede.encerrar();
    }
  });
});

describe('apoio dos testes — o dia do servidor de teste não tem as skins dos testes na vitrine', () => {
  it('nenhuma das skins que os testes compram está na vitrine de INSTANTE_SEM_VITRINE (o preço cheio vale)', () => {
    const vitrine = vitrineDoDia(diaDaMissao(INSTANTE_SEM_VITRINE)).itens.map((i) => i.skin);
    for (const skin of SKINS_QUE_OS_TESTES_COMPRAM) expect(vitrine, skin).not.toContain(skin);
  });

  it('o relógio corre em tempo real a partir dele', async () => {
    const r = relogioSemVitrine();
    const a = r();
    expect(a - INSTANTE_SEM_VITRINE).toBeLessThan(1000);
    await new Promise((f) => setTimeout(f, 20));
    expect(r() - a).toBeGreaterThanOrEqual(15);
  });
});
