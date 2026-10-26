import { Group, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG_WEB } from '../config';
import { MaoCalibrada } from '../maos/mao-calibrada';
import { PONTES, poseDaPonteNomeada, type NomeDaPonte } from '../maos/pontes';
import { TrocaDePonte } from '../maos/troca-de-ponte';
import { tapinhaVazio } from '../maos/gestos-com-contato';
import type { ReacaoEmCurso } from '../maos/reacoes';
import { maoDoArtista } from '../maos/para-testes';
import { poseVaziaDeMao } from '../maos/pose-das-maos';
import { MaosEmCena, type ModeloDasMaos } from './maos';

const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const CALIBRADAS = Object.fromEntries(
  PONTES.map((n) => [n, new MaoCalibrada(BASE.modelo, poseDaPonteNomeada(n), cfg.escala, true, (cfg.ponte.giro * Math.PI) / 180)]),
) as Record<NomeDaPonte, MaoCalibrada>;
const PONTE = CALIBRADAS.v;
const PUNHO = new MaoCalibrada(BASE.modelo, 'punho', cfg.escala, false);

function modelo(visivel = true, escala = 1, mudancas: Partial<{ -readonly [K in keyof ModeloDasMaos]: ModeloDasMaos[K] }> = {}): ModeloDasMaos {
  const ponte = poseVaziaDeMao();
  ponte.x = 0.1;
  const punho = poseVaziaDeMao();
  punho.y = 0.2;
  const base: ModeloDasMaos = {
    ponte,
    punho,
    dobrasDaPonte: new Float32Array(4),
    pinca: 0,
    escala,
    ponteVisivel: visivel,
    punhoVisivel: visivel,
    ponteCalibrada: PONTE,
    punhoCalibrado: PUNHO,
    ponteAtual: 'v',
    troca: new TrocaDePonte(),
    calibradaAtual: PONTE,
    calibradaDa: (n) => CALIBRADAS[n],
    pulso: 0,
    aperto: 0,
    tamborilando: false,
    reacao: null,
    tapinha: tapinhaVazio(),
  };
  return Object.assign(base, mudancas);
}

const reacao = (gesto: ReacaoEmCurso['gesto'], ambas = false): ReacaoEmCurso => ({ gesto, inicioS: 1, duracaoS: 1.2, picoS: undefined, ambas });

function emCena(nivel: 'alto' | 'medio' | 'baixo' = 'baixo'): MaosEmCena {
  const maos = new MaosEmCena(0x2f78c8, nivel, cfg);
  maos.usar(BASE);
  return maos;
}

function malhasVisiveis(maos: MaosEmCena, nome: string): SkinnedMesh[] {
  const achadas: SkinnedMesh[] = [];
  maos.grupo.getObjectByName(nome)!.traverse((o) => {
    if (o instanceof SkinnedMesh && o.visible) achadas.push(o);
  });
  return achadas;
}

describe('MaosEmCena: as duas mãos do artista', () => {
  it('o grupo nasce vazio e, com o arquivo, ganha duas mãos escondidas até a primeira pose', () => {
    const maos = new MaosEmCena(0x2f78c8, 'baixo', cfg);
    expect(maos.grupo).toBeInstanceOf(Group);
    expect(maos.pronta).toBe(false);
    expect(maos.grupo.children).toHaveLength(0);
    maos.usar(BASE);
    expect(maos.pronta).toBe(true);
    expect(maos.grupo.getObjectByName('mao-ponte')!.visible).toBe(false);
    expect(maos.grupo.getObjectByName('mao-punho')!.visible).toBe(false);
  });

  it('as duas dividem a geometria e o látex, e cada uma tem os seus ossos', () => {
    const maos = emCena();
    const [a] = malhasVisiveis(maos, 'mao-ponte');
    const [b] = malhasVisiveis(maos, 'mao-punho');
    expect(a!.geometry).toBe(b!.geometry);
    expect(a!.skeleton).not.toBe(b!.skeleton);
  });

  it('sem o arquivo o jogo segue sem mãos: nada lança, o grupo fica vazio e a falha vai para o console', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const maos = new MaosEmCena(0x2f78c8, 'baixo', cfg);
    await expect(maos.carregar({ glb: 'http://127.0.0.1:1/nao-existe.glb', contatos: 'http://127.0.0.1:1/nao-existe.json', meta: 'http://127.0.0.1:1/nao-existe-meta.json' })).resolves.toBeNull();
    expect(maos.pronta).toBe(false);
    expect(maos.grupo.children).toHaveLength(0);
    expect(aviso).toHaveBeenCalled();
    expect(() => maos.posicionar(modelo(), 0.016)).not.toThrow();
    aviso.mockRestore();
  });

  it('a cor das duas mãos muda sem trocar de material', () => {
    const maos = emCena();
    const material = malhasVisiveis(maos, 'mao-ponte')[0]!.material;
    expect(maos.corDasMaos()).toBe(0x2f78c8);
    maos.definirCor(0xe07a1f);
    expect(maos.corDasMaos()).toBe(0xe07a1f);
    expect(malhasVisiveis(maos, 'mao-punho')[0]!.material).toBe(material);
  });

  it('o nível de detalhe troca a malha das duas mãos: a baixa tem bem menos triângulos que a alta', () => {
    const maos = emCena('alto');
    const alta = malhasVisiveis(maos, 'mao-ponte')[0]!.geometry;
    maos.definirNivel('baixo');
    const baixa = malhasVisiveis(maos, 'mao-ponte')[0]!.geometry;
    expect(baixa).not.toBe(alta);
    expect(baixa.index!.count / 3).toBeLessThan(alta.index!.count / 3 / 2);
    expect(maos.triangulos('baixa')).toBeLessThan(maos.triangulos('alta'));
  });
});

describe('MaosEmCena.posicionar', () => {
  it('põe cada mão no quadro da conta, na escala do arquivo e da conta', () => {
    const maos = emCena();
    maos.posicionar(modelo(true, 0.8), 0.016);
    const ponte = maos.grupo.getObjectByName('mao-ponte')!;
    const punho = maos.grupo.getObjectByName('mao-punho')!;
    expect(ponte.visible && punho.visible).toBe(true);
    expect(ponte.scale.x).toBeCloseTo(cfg.escala * 0.8, 9);
    expect(punho.scale.x).toBeCloseTo(cfg.escala * 0.8, 9);
  });

  it('some quando a conta diz que não aparece ou a escala é quase zero', () => {
    const maos = emCena();
    maos.posicionar(modelo(false), 0.016);
    expect(maos.grupo.getObjectByName('mao-ponte')!.visible).toBe(false);
    expect(maos.grupo.getObjectByName('mao-punho')!.visible).toBe(false);
    maos.posicionar(modelo(true, 0.005), 0.016);
    expect(maos.grupo.getObjectByName('mao-ponte')!.visible).toBe(false);
  });

  it('não aloca: os mesmos ossos, posições e giros a cada quadro, com a pinça, as dobras, a vida e as reações', () => {
    const maos = emCena();
    const malha = malhasVisiveis(maos, 'mao-ponte')[0]!;
    maos.posicionar(modelo(), 0.016);
    const ossos = [...malha.skeleton.bones];
    const quats = ossos.map((o) => o.quaternion);
    const posicoes = ossos.map((o) => o.position);
    const m = modelo();
    for (let i = 0; i < 40; i++) {
      (m as { pinca: number }).pinca = i / 39;
      (m as { pulso: number }).pulso = 0.01 * i;
      (m as { aperto: number }).aperto = i / 39;
      (m as { tamborilando: boolean }).tamborilando = i > 20;
      (m as { ponteAtual: NomeDaPonte }).ponteAtual = PONTES[i % 6]!;
      (m as { reacao: ReacaoEmCurso | null }).reacao = i > 5 && i < 30 ? { ...reacao(['joinha', 'soco_ar', 'tapinha', 'quase'][i % 4] as ReacaoEmCurso['gesto']), inicioS: i } : null;
      m.dobrasDaPonte[i % 4] = 0.1 * i;
      maos.posicionar(m, 0.016);
    }
    expect(malha.skeleton.bones).toEqual(ossos);
    ossos.forEach((o, i) => {
      expect(o.quaternion).toBe(quats[i]);
      expect(o.position).toBe(posicoes[i]);
    });
  });
});

describe('MaosEmCena: a ponte que o jogo escolheu', () => {
  it('a pose do arquivo acompanha a ponte da conta (a primeira vez, de uma vez)', () => {
    const maos = emCena();
    maos.posicionar(modelo(true, 1, { ponteAtual: 'elevada', calibradaAtual: CALIBRADAS.elevada }), 0.016);
    expect(maos.diagnostico().poseDaPonte).toBe('ponte_elevada');
  });

  it('trocar de ponte mistura as poses dos dedos no tempo da troca', () => {
    const maos = emCena();
    const m = modelo();
    maos.posicionar(m, 0.016);
    expect(maos.diagnostico().poseDaPonte).toBe('ponte_v');
    (m as { ponteAtual: NomeDaPonte }).ponteAtual = 'laco';
    (m as { calibradaAtual: MaoCalibrada }).calibradaAtual = CALIBRADAS.laco;
    m.troca.iniciar('v', m.ponte, cfg.escolha.troca.duracaoS);
    maos.posicionar(m, 0.016);
    expect(maos.diagnostico().poseDaPonte).toBe('ponte_laco');
    expect(maos.diagnostico().pesoDaPoseDaPonte).toBeLessThan(0.5);
    for (let t = 0; t < cfg.escolha.troca.duracaoS + 0.1; t += 0.02) {
      m.troca.atualizar(0.02);
      maos.posicionar(m, 0.02);
    }
    expect(maos.diagnostico().pesoDaPoseDaPonte).toBeGreaterThan(0.99);
  });

  it('na troca a mão levanta, faz um arco e pousa: no meio do caminho está acima das duas pontas e passa a meio caminho entre elas', () => {
    const maos = emCena();
    const raiz = maos.grupo.getObjectByName('mao-ponte')!;
    const m = modelo();
    maos.posicionar(m, 0.016);
    const saida = raiz.position.clone();
    (m as { ponteAtual: NomeDaPonte }).ponteAtual = 'laco';
    (m as { calibradaAtual: MaoCalibrada }).calibradaAtual = CALIBRADAS.laco;
    m.ponte.x += 0.2;
    m.troca.iniciar('v', { ...modelo().ponte }, 0.25);
    m.troca.atualizar(0.125);
    maos.posicionar(m, 0.001);
    const meio = raiz.position.clone();
    m.troca.atualizar(1);
    maos.posicionar(m, 0.001);
    const chegada = raiz.position.clone();
    expect(meio.y).toBeGreaterThan((saida.y + chegada.y) / 2 + 0.9 * cfg.escolha.troca.arco);
    expect(meio.x).toBeGreaterThan(Math.min(saida.x, chegada.x));
    expect(meio.x).toBeLessThan(Math.max(saida.x, chegada.x));
    expect(chegada.x).toBeGreaterThan(saida.x + 0.1);
  });
});

describe('MaosEmCena: a mão de trás vive', () => {
  /** O ângulo (rad) que o osso `nome` gira entre dois momentos. */
  const osso = (maos: MaosEmCena, mao: string, nome: string): Quaternion => {
    const malha = malhasVisiveis(maos, mao)[0]!;
    return malha.skeleton.bones.find((b) => b.name === nome)!.quaternion.clone();
  };

  it('as duas mãos respiram: com o tempo os ossos mudam sem ninguém pedir', () => {
    const maos = emCena();
    const m = modelo();
    maos.posicionar(m, 0.016);
    const antes = osso(maos, 'mao-punho', 'palma');
    const antesPonte = osso(maos, 'mao-ponte', 'palma');
    for (let t = 0; t < 1.5; t += 0.05) maos.posicionar(m, 0.05);
    expect(osso(maos, 'mao-punho', 'palma').angleTo(antes)).toBeGreaterThan(1e-4);
    expect(osso(maos, 'mao-ponte', 'palma').angleTo(antesPonte)).toBeGreaterThan(1e-4);
  });

  it('o pulso gira com o balanço da conta e volta quando ele zera', () => {
    const maos = emCena();
    const m = modelo();
    maos.posicionar(m, 0.016);
    const parado = osso(maos, 'mao-punho', 'pulso');
    (m as { pulso: number }).pulso = 0.2;
    maos.posicionar(m, 0);
    expect(osso(maos, 'mao-punho', 'pulso').angleTo(parado)).toBeCloseTo(0.2, 2);
    (m as { pulso: number }).pulso = 0;
    maos.posicionar(m, 0);
    expect(osso(maos, 'mao-punho', 'pulso').angleTo(parado)).toBeLessThan(2e-3);
  });

  it('o aperto fecha os dedos da mão de trás a mais, até `aperto.rad`', () => {
    const maos = emCena();
    const m = modelo();
    maos.posicionar(m, 0);
    const solto = osso(maos, 'mao-punho', 'indicador_2');
    (m as { aperto: number }).aperto = 1;
    maos.posicionar(m, 0);
    const a = osso(maos, 'mao-punho', 'indicador_2').angleTo(solto);
    expect(a).toBeGreaterThan(0.05);
    (m as { aperto: number }).aperto = 0;
    maos.posicionar(m, 0);
    expect(osso(maos, 'mao-punho', 'indicador_2').angleTo(solto)).toBeLessThan(2e-3);
  });

  it('tamborilar: entra o gesto em ciclo na mão de trás enquanto a conta pedir e sai quando ela parar', () => {
    const maos = emCena();
    const m = modelo();
    maos.posicionar(m, 0.016);
    expect(maos.diagnostico().gestoDoPunho).toBeNull();
    (m as { tamborilando: boolean }).tamborilando = true;
    for (let t = 0; t < 3; t += 0.05) maos.posicionar(m, 0.05);
    expect(maos.diagnostico().gestoDoPunho).toBe('tamborilar');
    (m as { tamborilando: boolean }).tamborilando = false;
    for (let t = 0; t < 1; t += 0.05) maos.posicionar(m, 0.05);
    expect(maos.diagnostico().gestoDoPunho).toBeNull();
  });
});

describe('MaosEmCena: as reações', () => {
  it('o joinha e o soco no ar tocam o gesto certo na mão da ponte; o gesto não recomeça a cada quadro', () => {
    for (const gesto of ['joinha', 'soco_ar'] as const) {
      const maos = emCena();
      const m = modelo(true, 1, { reacao: reacao(gesto) });
      maos.posicionar(m, 0.016);
      expect(maos.diagnostico().gesto).toBe(gesto);
      expect(maos.diagnostico().gestoDoPunho).toBeNull();
      maos.posicionar(m, 0.3);
      const t1 = maos.diagnostico().tempoDoGesto;
      maos.posicionar(m, 0.1);
      expect(maos.diagnostico().tempoDoGesto).toBeGreaterThan(t1);
    }
  });

  it('o gesto acaba com a duração do arquivo, e a mão volta ao lugar da ponte', () => {
    const maos = emCena();
    const raiz = maos.grupo.getObjectByName('mao-ponte')!;
    const m = modelo();
    maos.posicionar(m, 0.016);
    const antes = raiz.position.clone();
    (m as { reacao: ReacaoEmCurso | null }).reacao = reacao('soco_ar');
    for (let t = 0; t < 0.6; t += 0.05) maos.posicionar(m, 0.05);
    expect(raiz.position.y - antes.y).toBeCloseTo(cfg.reacoes.socoAr.subida, 6);
    (m as { reacao: ReacaoEmCurso | null }).reacao = null;
    for (let t = 0; t < 2; t += 0.05) maos.posicionar(m, 0.05);
    expect(maos.diagnostico().gesto).toBeNull();
    expect(raiz.position.distanceTo(antes)).toBeLessThan(1e-9);
  });

  it('a raspada abre as duas mãos', () => {
    const maos = emCena();
    maos.posicionar(modelo(true, 1, { reacao: reacao('quase', true) }), 0.016);
    expect(maos.diagnostico().gesto).toBe('quase');
    expect(maos.diagnostico().gestoDoPunho).toBe('quase');
  });

  it('o tapinha leva o ponto de contato do punho ao lugar da moldura no instante do contato', () => {
    const maos = emCena();
    const lugar = tapinhaVazio();
    lugar.x = 0.5;
    lugar.y = 0.042;
    lugar.z = 0.7;
    lugar.naMoldura = true;
    const m = modelo(true, 1, { reacao: reacao('tapinha'), tapinha: lugar });
    const contato = BASE.modelo.contatos.gestos.get('tapinha')!;
    const picoS = contato.quadros[0]! / 30;
    let t = 0;
    while (t < picoS + 0.005) {
      maos.posicionar(m, 0.005);
      t += 0.005;
    }
    // A mão da ponte é o espelho do arquivo: o ponto do arquivo, espelhado em x, no referencial da raiz.
    const raiz = maos.grupo.getObjectByName('mao-ponte')!;
    const p = raiz.localToWorld(new Vector3(-contato.ponto[0], contato.ponto[1], contato.ponto[2]));
    expect(Math.hypot(p.x - 0.5, p.z - 0.7)).toBeLessThan(0.001);
    expect(Math.abs(p.y - 0.042)).toBeLessThan(0.001);
  });

  it('com a reação cancelada a mão sai do gesto em pouco tempo, sem esperar o fim do arquivo', () => {
    const maos = emCena();
    const m = modelo(true, 1, { reacao: reacao('joinha') });
    maos.posicionar(m, 0.016);
    maos.posicionar(m, 0.3);
    (m as { reacao: ReacaoEmCurso | null }).reacao = null;
    for (let t = 0; t < 0.3; t += 0.02) maos.posicionar(m, 0.02);
    expect(maos.diagnostico().gesto).toBeNull();
  });
});
