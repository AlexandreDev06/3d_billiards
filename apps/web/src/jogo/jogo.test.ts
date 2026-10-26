import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, criarRng, gravacaoDeTeste, medidasDaBola, mesaInicial, simularTacada, type EventoTacada, type ParametrosTacada, type Rng } from '@sinuca/fisica';
import { PRESET_BOTECO, PRESET_MATA_MATA, jogadoresDaProxima, type ConfigRegras, type Consequencias, type EstadoPartida, type Jogador, type ResultadoRegras } from '@sinuca/regras';
import { jogadoresDoHotSeat } from '../config';
import { Jogo, jogadoresDaNovaPartida } from './jogo';
import { REGRAS_DO_PACOTE, type MotorDeRegras } from './regras';

const JOGADORES: Jogador[] = [
  { id: 'a', nome: 'Ana', equipe: 0 },
  { id: 'b', nome: 'Beto', equipe: 1 },
];

const ARRUMACAO = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const TACADA_FORTE: ParametrosTacada = { angulo: 0, velocidadeTaco: 6, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };
const TACADA_FRACA: ParametrosTacada = { ...TACADA_FORTE, velocidadeTaco: 0.5, angulo: Math.PI / 2 };

const semConsequencias = (proximo: number): Consequencias => ({ faltas: [], retirar: [], recolocar: [], proximo, vencedor: null, texto: '' });

/** Regras de teste: o castigo (1) fica fora do triângulo; cada tacada segue o roteiro. */
function regrasDeRoteiro(roteiro: (partida: EstadoPartida, eventos: readonly EventoTacada[]) => Partial<Consequencias> & { partida?: Partial<EstadoPartida> }): MotorDeRegras & { chamadas: EventoTacada[][] } {
  const chamadas: EventoTacada[][] = [];
  return {
    chamadas,
    novaPartida(config, jogadores) {
      const partida: EstadoPartida = {
        config,
        jogadores,
        vez: 0,
        grupos: [null, null],
        fase: 'saida',
        naMesa: [1, ...ARRUMACAO],
        encacapadas: [],
        retiradas: [],
        vencedor: null,
      };
      return { partida, arrumacao: ARRUMACAO };
    },
    aplicarTacada(partida, eventos): ResultadoRegras {
      chamadas.push([...eventos]);
      const { partida: mudancas, ...cons } = roteiro(partida, eventos);
      const consequencias = { ...semConsequencias((partida.vez + 1) % partida.jogadores.length), ...cons };
      return { partida: { ...partida, ...mudancas, vez: consequencias.proximo }, consequencias };
    },
  };
}

const novoJogo = (regras: MotorDeRegras, semente = 1) =>
  new Jogo({ regras, simular: simularTacada }, PRESET_BOTECO.regras, JOGADORES, criarRng(semente));

describe('Jogo — começo da partida', () => {
  it('monta a mesa só com a arrumação das regras, com o bolão na saída', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    expect(jogo.mesa.bolas.filter((b) => b.naMesa)).toHaveLength(15);
    expect(jogo.mesa.bolas[0]!.id).toBe(ID_BOLAO);
    expect(jogo.fase).toBe('jogando');
  });

  it('o castigo não está na mesa antes da saída: ele entra pelo recolocar dela', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    expect(jogo.partida.naMesa).toContain(1);
    expect(jogo.mesa.bolas.some((b) => b.id === 1)).toBe(false);
  });

  it('o jogador da vez é o primeiro', () => {
    expect(novoJogo(regrasDeRoteiro(() => ({}))).jogadorDaVez.nome).toBe('Ana');
  });
});

describe('Jogo — a tacada', () => {
  it('tacar simula com a física real e devolve a gravação; a partida só muda ao concluir', () => {
    const regras = regrasDeRoteiro(() => ({ texto: 'oi' }));
    const jogo = novoJogo(regras);
    const antes = jogo.partida;
    const mesaAntes = jogo.mesa;
    const gravacao = jogo.tacar(TACADA_FORTE);
    expect(gravacao.eventos[0]).toMatchObject({ tipo: 'taco-bola' });
    expect(gravacao.eventos.at(-1)).toMatchObject({ tipo: 'parou' });
    expect(jogo.fase).toBe('tocando');
    expect(jogo.partida).toBe(antes);
    expect(jogo.mesa).toBe(mesaAntes);
    expect(jogo.ultimasConsequencias).toBeNull();

    const consequencias = jogo.concluir();
    expect(consequencias.texto).toBe('oi');
    expect(jogo.partida.vez).toBe(1);
    expect(jogo.jogadorDaVez.nome).toBe('Beto');
    expect(jogo.fase).toBe('jogando');
    expect(jogo.ultimasConsequencias).toBe(consequencias);
  });

  it('entrega às regras os eventos da própria gravação', () => {
    const regras = regrasDeRoteiro(() => ({}));
    const jogo = novoJogo(regras);
    const gravacao = jogo.tacar(TACADA_FORTE);
    expect(regras.chamadas[0]).toEqual(gravacao.eventos);
  });

  it('a próxima tacada parte do estado em que as bolas pararam (o bolão andou)', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const saida = jogo.mesa.bolas.find((b) => b.id === ID_BOLAO)!.posicao;
    jogo.tacar(TACADA_FORTE);
    jogo.concluir();
    const depois = jogo.mesa.bolas.find((b) => b.id === ID_BOLAO)!;
    expect(Math.hypot(depois.posicao.x - saida.x, depois.posicao.z - saida.z)).toBeGreaterThan(0.1);
    expect(depois.movimento).toBe('parada');
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
  });

  it('retirar tira a bola da mesa e recolocar devolve o bolão que caiu', () => {
    const jogo = novoJogo(
      regrasDeRoteiro((_, eventos) => ({
        retirar: [15],
        recolocar: [{ bola: ID_BOLAO, lugar: 'marca-saida' }],
        texto: `${eventos.length} eventos`,
      })),
    );
    jogo.tacar(TACADA_FORTE);
    jogo.concluir();
    expect(jogo.mesa.bolas.find((b) => b.id === 15)!.naMesa).toBe(false);
    expect(jogo.mesa.bolas.find((b) => b.id === ID_BOLAO)!.naMesa).toBe(true);
  });

  it('bola que a física encaçapa fica fora da mesa depois de concluir', () => {
    // Varre sementes (triângulo), ângulos e forças até a física encaçapar uma numerada: o resultado depende do ajuste do motor.
    for (let semente = 1; semente <= 8; semente++) {
      for (let angulo = -0.2; angulo <= 0.201; angulo += 0.02) {
        const jogo = novoJogo(regrasDeRoteiro(() => ({})), semente);
        const gravacao = jogo.tacar({ ...TACADA_FORTE, velocidadeTaco: 8, angulo });
        const caidas = gravacao.eventos.flatMap((e) => (e.tipo === 'cacapa' && e.bola !== ID_BOLAO ? [e.bola] : []));
        jogo.concluir();
        if (caidas.length === 0) continue;
        for (const id of caidas) expect(jogo.mesa.bolas.find((b) => b.id === id)!.naMesa).toBe(false);
        return;
      }
    }
    throw new Error('nenhuma quebra encaçapou bola numerada: o teste não prova nada');
  });

  it('não deixa tacar duas vezes antes de concluir, nem concluir sem tacar', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    expect(() => jogo.concluir()).toThrow(/não há tacada/);
    jogo.tacar(TACADA_FRACA);
    expect(() => jogo.tacar(TACADA_FRACA)).toThrow(/tocando/);
  });

  it('se a física lançar, a partida continua jogável', () => {
    let falhar = true;
    const jogo = new Jogo(
      {
        regras: regrasDeRoteiro(() => ({})),
        simular(mesa, parametros, rng) {
          if (falhar) throw new Error('quebrou');
          return simularTacada(mesa, parametros, rng);
        },
      },
      PRESET_BOTECO.regras,
      JOGADORES,
      criarRng(1),
    );
    expect(() => jogo.tacar(TACADA_FRACA)).toThrow('quebrou');
    expect(jogo.fase).toBe('jogando');
    falhar = false;
    jogo.tacar(TACADA_FRACA);
    expect(jogo.fase).toBe('tocando');
  });
});

describe('Jogo — com as regras do pacote', () => {
  const real = (semente = 1) => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, JOGADORES, criarRng(semente));

  it('no Boteco a bola final (a 8) já está no triângulo, no centro, e a saída não manda nenhuma bola para a tabela', () => {
    const jogo = real();
    const final = PRESET_BOTECO.regras.bolaFinal as number;
    expect(final).toBe(8);
    expect(jogo.partida.fase).toBe('saida');
    const oito = jogo.mesa.bolas.find((b) => b.id === final)!;
    expect(oito.naMesa).toBe(true);
    // no centro do triângulo: no eixo da mesa e cercada por seis bolas encostadas
    expect(Math.abs(oito.posicao.z)).toBeLessThan(0.001);
    const vizinhas = jogo.mesa.bolas.filter((b) => b.id !== final && b.id !== ID_BOLAO && Math.hypot(b.posicao.x - oito.posicao.x, b.posicao.z - oito.posicao.z) < 0.06);
    expect(vizinhas).toHaveLength(6);
    jogo.tacar(TACADA_FORTE);
    const consequencias = jogo.concluir();
    expect(consequencias.recolocar.some((r) => r.lugar === 'tabela-lado-saida')).toBe(false);
    expect(jogo.partida.fase).not.toBe('saida');
  });

  it('na casa 1–15 (a 1 é o castigo) a saída põe a 1 encostada na tabela do lado da saída, com o bolão de volta ou onde parou', () => {
    const casa1a15: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '1-15', bolaFinal: 1, castigoInicio: 'depois-da-saida', castigoLugar: 'tabela-lado-saida' };
    const jogo = new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, casa1a15, JOGADORES, criarRng(1));
    expect(jogo.partida.fase).toBe('saida');
    expect(jogo.mesa.bolas.some((b) => b.id === 1)).toBe(false);
    jogo.tacar(TACADA_FORTE);
    expect(jogo.mesa.bolas.some((b) => b.id === 1)).toBe(false);
    const consequencias = jogo.concluir();
    expect(consequencias.recolocar[0]).toEqual({ bola: 1, lugar: 'tabela-lado-saida' });
    const castigo = jogo.mesa.bolas.find((b) => b.id === 1)!;
    expect(castigo.naMesa).toBe(true);
    expect(castigo.posicao.x).toBeLessThan(-CONFIG_FISICA_PADRAO.mesa.comprimento / 2 + 0.06);
    expect(castigo.posicao.z).toBeCloseTo(0, 3);
    expect(jogo.partida.fase).not.toBe('saida');
  });

  it('a partida segue a mesma com a mesma semente', () => {
    const rodar = () => {
      const jogo = real(7);
      jogo.tacar(TACADA_FORTE);
      jogo.concluir();
      return { partida: jogo.partida, mesa: jogo.mesa };
    };
    expect(rodar()).toEqual(rodar());
  });

  it('o triângulo sai imperfeito: o rng da partida sorteia a folga das bolas', () => {
    const jogo = real();
    const perfeito = mesaInicial(
      jogo.mesa.bolas.filter((b) => b.id !== ID_BOLAO).map((b) => b.id),
      CONFIG_FISICA_PADRAO,
    );
    const deslocamentos = jogo.mesa.bolas.map((b) => {
      const p = perfeito.bolas.find((x) => x.id === b.id)!.posicao;
      return Math.hypot(b.posicao.x - p.x, b.posicao.z - p.z);
    });
    expect(Math.max(...deslocamentos)).toBeGreaterThan(0);
    expect(Math.max(...deslocamentos)).toBeLessThan(0.001);
  });

  it('depois de um vencedor a nova partida sai por quem as regras mandam; sem vencedor a roda não gira', () => {
    const jogo = real();
    expect(jogadoresDaNovaPartida(jogo.partida)).toBe(jogo.partida.jogadores);
    const acabou = { ...jogo.partida, vencedor: 0, fase: 'fim' as const, vez: 1 };
    expect(jogadoresDaProxima(acabou).map((j) => j.nome)).toEqual(['Beto', 'Ana']);
    expect(jogadoresDaNovaPartida(acabou).map((j) => j.nome)).toEqual(['Beto', 'Ana']);
    const proxima = new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, jogadoresDaNovaPartida(acabou), criarRng(2));
    expect(proxima.jogadorDaVez.nome).toBe('Beto');
    expect(proxima.partida.jogadores.map((j) => j.equipe)).toEqual([1, 0]);
  });
});

describe('Jogo — hot-seat 2×1 (três jogadores, regras do pacote)', () => {
  const trio = (semente = 1) => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, jogadoresDoHotSeat('2x1'), criarRng(semente));
  const fraca: ParametrosTacada = { ...TACADA_FORTE, velocidadeTaco: 0.12, angulo: Math.PI };

  it('a roda é A1, B1, A2: o Jogador 1 e o 3 são a equipe de 2 e o Jogador 2 joga sozinho; o 1×1 segue com dois', () => {
    expect(jogadoresDoHotSeat('2x1').map((j) => [j.id, j.nome, j.equipe])).toEqual([
      ['j1', 'Jogador 1', 0],
      ['j2', 'Jogador 2', 1],
      ['j3', 'Jogador 3', 0],
    ]);
    expect(jogadoresDoHotSeat('1x1').map((j) => j.id)).toEqual(['j1', 'j2']);
    expect(trio().partida.jogadores).toHaveLength(3);
  });

  it('seis tacadas sem acertar nada: a vez roda Jogador 1, 2, 3, 2, 1, 2, e a sétima é do 3', () => {
    const jogo = trio();
    const vezes: string[] = [];
    for (let i = 0; i < 6; i++) {
      vezes.push(jogo.jogadorDaVez.nome);
      jogo.tacar(fraca);
      jogo.concluir();
    }
    expect(vezes).toEqual(['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 2', 'Jogador 1', 'Jogador 2']);
    expect(jogo.jogadorDaVez.nome).toBe('Jogador 3');
  });

  it('o tempo que acaba também gira a roda do mesmo jeito (1, 2, 3, 2, 1)', () => {
    const jogo = trio();
    const vezes: string[] = [];
    for (let i = 0; i < 5; i++) {
      vezes.push(jogo.jogadorDaVez.nome);
      jogo.passarAVez();
    }
    expect(vezes).toEqual(['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 2', 'Jogador 1']);
  });

  it('a equipe vencedora tem os seus jogadores (a de 2 ou a de 1) e a nova partida segue `jogadoresDaProxima` com os mesmos três', () => {
    const jogo = trio();
    const acabou = (equipe: number) => ({ ...jogo.partida, vencedor: equipe, fase: 'fim' as const });
    jogo.adotar(acabou(0), jogo.mesa);
    expect(jogo.fase).toBe('fim');
    expect(jogo.vencedores.map((j) => j.nome)).toEqual(['Jogador 1', 'Jogador 3']);
    jogo.adotar(acabou(1), jogo.mesa);
    expect(jogo.vencedores.map((j) => j.nome)).toEqual(['Jogador 2']);
    for (const equipe of [0, 1]) {
      const proxima = jogadoresDaNovaPartida(acabou(equipe));
      expect(proxima).toEqual(jogadoresDaProxima(acabou(equipe)));
      expect([...proxima.map((j) => j.id)].sort()).toEqual(['j1', 'j2', 'j3']);
      const novo = new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, proxima, criarRng(5));
      expect(novo.partida.jogadores.map((j) => j.equipe).filter((e) => e === 0)).toHaveLength(2);
      expect(novo.jogadorDaVez.id).toBe(proxima[0]!.id);
    }
  });
});

describe('Jogo — hot-seat 2×2 (quatro jogadores, regras do pacote)', () => {
  const quarteto = (semente = 1) => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, jogadoresDoHotSeat('2x2'), criarRng(semente));

  it('a roda é A1, B1, A2, B2: o Jogador 1 e o 3 contra o 2 e o 4, cada um com o seu id (e o seu perfil)', () => {
    expect(jogadoresDoHotSeat('2x2').map((j) => [j.id, j.nome, j.equipe])).toEqual([
      ['j1', 'Jogador 1', 0],
      ['j2', 'Jogador 2', 1],
      ['j3', 'Jogador 3', 0],
      ['j4', 'Jogador 4', 1],
    ]);
    expect(quarteto().partida.jogadores).toHaveLength(4);
  });

  it('o tempo que acaba gira a roda: 1, 2, 3, 4, 1', () => {
    const jogo = quarteto();
    const vezes: string[] = [];
    for (let i = 0; i < 5; i++) {
      vezes.push(jogo.jogadorDaVez.nome);
      jogo.passarAVez();
    }
    expect(vezes).toEqual(['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Jogador 1']);
  });

  it('a dupla vencedora são os seus dois jogadores e a próxima partida segue `jogadoresDaProxima` com os mesmos quatro', () => {
    const jogo = quarteto();
    const acabou = (equipe: number) => ({ ...jogo.partida, vencedor: equipe, fase: 'fim' as const });
    jogo.adotar(acabou(1), jogo.mesa);
    expect(jogo.vencedores.map((j) => j.nome)).toEqual(['Jogador 2', 'Jogador 4']);
    const proxima = jogadoresDaNovaPartida(acabou(1));
    expect([...proxima.map((j) => j.id)].sort()).toEqual(['j1', 'j2', 'j3', 'j4']);
  });
});

describe('Jogo — fim de partida', () => {
  it('vencedor nas regras encerra a partida e lista os jogadores da equipe', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({ vencedor: 1, partida: { vencedor: 1, fase: 'fim' } })));
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
    expect(jogo.fase).toBe('fim');
    expect(jogo.vencedores.map((j) => j.nome)).toEqual(['Beto']);
    expect(() => jogo.tacar(TACADA_FRACA)).toThrow(/fim/);
  });

  it('sem vencedor, vencedores é vazio', () => {
    expect(novoJogo(regrasDeRoteiro(() => ({}))).vencedores).toEqual([]);
  });
});

describe('Jogo — bolão que as regras esquecem', () => {
  it('o bolão encaçapado e não devolvido volta à marca da saída, para não travar a próxima tacada', () => {
    const aviso = console.warn;
    console.warn = () => {};
    try {
      const jogo = new Jogo(
        {
          regras: regrasDeRoteiro(() => ({})),
          simular(mesa) {
            const gravacao = gravacaoDeTeste();
            return {
              eventos: gravacao.eventos,
              gravacao,
              estadoFinal: { bolas: mesa.bolas.map((b) => (b.id === ID_BOLAO ? { ...b, naMesa: false } : b)) },
            };
          },
        },
        PRESET_BOTECO.regras,
        JOGADORES,
        criarRng(1),
      );
      jogo.tacar(TACADA_FRACA);
      jogo.concluir();
      expect(jogo.mesa.bolas.find((b) => b.id === ID_BOLAO)!.naMesa).toBe(true);
    } finally {
      console.warn = aviso;
    }
  });
});

describe('Jogo — física configurável (painel dev)', () => {
  const nova = () => novoJogo(regrasDeRoteiro(() => ({})));

  it('a tacada usa a config padrão até alguém trocar', () => {
    const recebidas: unknown[] = [];
    const jogo = new Jogo(
      {
        regras: regrasDeRoteiro(() => ({})),
        simular: (mesa, parametros, rng, config) => {
          recebidas.push(config);
          return simularTacada(mesa, parametros, rng, config);
        },
      },
      PRESET_BOTECO.regras,
      JOGADORES,
      criarRng(1),
    );
    jogo.tacar(TACADA_FRACA);
    expect(recebidas).toEqual([CONFIG_FISICA_PADRAO]);
  });

  it('usarFisica vale já na próxima tacada: com mais atrito de rolamento a bola para antes', () => {
    const base = nova();
    const duracaoPadrao = base.tacar(TACADA_FRACA).duracao;

    const editado = nova();
    editado.usarFisica({ ...CONFIG_FISICA_PADRAO, atritoRolamento: CONFIG_FISICA_PADRAO.atritoRolamento * 3, atritoDeslizamento: 0.5 });
    const duracaoEditada = editado.tacar(TACADA_FRACA).duracao;

    expect(duracaoEditada).toBeLessThan(duracaoPadrao * 0.7);
  });

  it('a config trocada fica para as tacadas seguintes, até restaurar', () => {
    const recebidas: unknown[] = [];
    const jogo = new Jogo(
      {
        regras: regrasDeRoteiro(() => ({})),
        simular: (mesa, parametros, rng, config) => {
          recebidas.push(config);
          return simularTacada(mesa, parametros, rng, config);
        },
      },
      PRESET_BOTECO.regras,
      JOGADORES,
      criarRng(1),
    );
    const editada = { ...CONFIG_FISICA_PADRAO, restituicaoBolaTabela: 0.6 };
    jogo.usarFisica(editada);
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
    jogo.usarFisica(CONFIG_FISICA_PADRAO);
    jogo.tacar(TACADA_FRACA);
    expect(recebidas).toEqual([editada, editada, CONFIG_FISICA_PADRAO]);
  });
});


describe('Jogo — a mesa concorda com a partida (física e regras reais)', () => {
  const CASAS: readonly (readonly [string, Partial<ConfigRegras>])[] = [
    ['boteco', {}],
    ['2-15', { bolas: '2-15' }],
    ['pena invertida', { penaInvertida: true }],
  ];
  const SEMENTES = [1, 2, 3, 4];
  const TACADAS_POR_PARTIDA = 150;
  const FOLGA_SOBREPOSICAO = 1e-5;

  /** Mira numa bola ao acaso, com um pouco de erro e força variada; a primeira é a quebra. */
  function tacadaAoAcaso(jogo: Jogo, rng: Rng, quebra: boolean): ParametrosTacada {
    const bolao = jogo.mesa.bolas.find((b) => b.id === ID_BOLAO && b.naMesa)!;
    const alvos = jogo.mesa.bolas.filter((b) => b.id !== ID_BOLAO && b.naMesa);
    const alvo = alvos[Math.floor(rng.proximo() * alvos.length)]!;
    const angulo = Math.atan2(alvo.posicao.z - bolao.posicao.z, alvo.posicao.x - bolao.posicao.x) + (rng.proximo() - 0.5) * 0.06;
    return {
      angulo,
      velocidadeTaco: quebra ? 7 : 0.8 + rng.proximo() * 5,
      efeito: { lateral: (rng.proximo() - 0.5) * 0.4, vertical: (rng.proximo() - 0.5) * 0.4 },
      elevacao: 0,
      giz: 1,
    };
  }

  function conferirCoerencia(jogo: Jogo, onde: string): void {
    const naMesa = jogo.mesa.bolas.filter((b) => b.naMesa);
    expect(naMesa.some((b) => b.id === ID_BOLAO), `${onde}: o bolão está na mesa`).toBe(true);
    const fisicas = naMesa.filter((b) => b.id !== ID_BOLAO).map((b) => b.id).sort((a, b) => a - b);
    const dasRegras = [...jogo.partida.naMesa].sort((a, b) => a - b);
    expect(fisicas, `${onde}: bolas numeradas na mesa física × partida.naMesa`).toEqual(dasRegras);
    const sobrepostas: string[] = [];
    for (let i = 0; i < naMesa.length; i++) {
      for (let j = i + 1; j < naMesa.length; j++) {
        const a = naMesa[i]!;
        const b = naMesa[j]!;
        const folga = Math.hypot(a.posicao.x - b.posicao.x, a.posicao.z - b.posicao.z) - medidasDaBola(a.id, CONFIG_FISICA_PADRAO).raio - medidasDaBola(b.id, CONFIG_FISICA_PADRAO).raio;
        if (folga < -FOLGA_SOBREPOSICAO) sobrepostas.push(`${a.id}-${b.id} (${(-folga * 1000).toFixed(3)} mm)`);
      }
    }
    expect(sobrepostas, `${onde}: bolas sobrepostas`).toEqual([]);
  }

  it.each(CASAS)('casa %s: depois de cada tacada ao acaso, a mesa e a partida concordam e tacar nunca lança', (_nome, casa) => {
    const config = { ...PRESET_BOTECO.regras, ...casa };
    let tacadas = 0;
    let comRecolocar = 0;
    let comFalta = 0;
    for (const semente of SEMENTES) {
      const rng = criarRng(1000 + semente);
      const jogo = new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, config, JOGADORES, criarRng(semente));
      for (let n = 0; n < TACADAS_POR_PARTIDA && jogo.fase !== 'fim'; n++) {
        const parametros = tacadaAoAcaso(jogo, rng, n === 0);
        expect(() => jogo.tacar(parametros), `semente ${semente}, tacada ${n}: tacar lançou`).not.toThrow();
        const consequencias = jogo.concluir();
        tacadas++;
        if (consequencias.recolocar.length > 0) comRecolocar++;
        if (consequencias.faltas.length > 0) comFalta++;
        conferirCoerencia(jogo, `semente ${semente}, tacada ${n}`);
      }
    }
    // Sem isto o teste passaria vazio: a mesa precisa ter sido mexida pelas regras de verdade.
    expect(tacadas).toBeGreaterThan(50);
    expect(comRecolocar).toBeGreaterThan(0);
    expect(comFalta).toBeGreaterThan(0);
  }, 60_000);
});

describe('Jogo — previsão da tacada', () => {
  const PARAMETROS: ParametrosTacada = { angulo: 0, velocidadeTaco: 2, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };

  it('simula a tacada a partir da mesa de agora, sem mudar mesa, partida, fase nem o sorteio do jogo', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const mesa = jogo.mesa;
    const partida = jogo.partida;
    const previsao = jogo.preverTacada(PARAMETROS);
    expect(previsao.gravacao.eventos[0]).toMatchObject({ tipo: 'taco-bola' });
    expect(jogo.mesa).toBe(mesa);
    expect(jogo.partida).toBe(partida);
    expect(jogo.fase).toBe('jogando');
  });

  it('a tacada real logo depois sai igual à prevista (mesma mesa, mesma config, mesmo golpe)', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const previsao = jogo.preverTacada(PARAMETROS);
    const real = jogo.tacar(PARAMETROS);
    expect(Array.from(real.posicoes)).toEqual(Array.from(previsao.gravacao.posicoes));
    expect(real.eventos).toEqual(previsao.gravacao.eventos);
  });

  it('não gasta o sorteio do jogo: o miscue da tacada real é o mesmo com ou sem previsão antes', () => {
    const miscue = { ...PARAMETROS, efeito: { lateral: 0.99, vertical: 0 }, giz: 0 };
    const semPrever = novoJogo(regrasDeRoteiro(() => ({})), 5).tacar(miscue);
    const jogo = novoJogo(regrasDeRoteiro(() => ({})), 5);
    for (let i = 0; i < 5; i++) jogo.preverTacada(miscue);
    const comPrever = jogo.tacar(miscue);
    expect(Array.from(comPrever.posicoes)).toEqual(Array.from(semPrever.posicoes));
  });

  it('a previsão nunca sorteia miscue: com efeito além do limite e sem giz mostra a tacada que dá certo', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const previsao = jogo.preverTacada({ ...PARAMETROS, efeito: { lateral: 0.99, vertical: 0 }, giz: 0 });
    expect(previsao.gravacao.eventos[0]).toMatchObject({ tipo: 'taco-bola', miscue: false });
  });

  it('usa a config de física do jogo e aceita ajustes só desta previsão', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    jogo.usarFisica({ ...CONFIG_FISICA_PADRAO, atritoRolamento: 0.03 });
    const lenta = jogo.preverTacada(PARAMETROS);
    jogo.usarFisica(CONFIG_FISICA_PADRAO);
    const normal = jogo.preverTacada(PARAMETROS);
    expect(lenta.gravacao.duracao).toBeLessThan(normal.gravacao.duracao);
    const cortada = jogo.preverTacada(PARAMETROS, { duracaoMaxima: 0.5 });
    expect(cortada.gravacao.duracao).toBe(0.5);
    expect(jogo.preverTacada(PARAMETROS).gravacao.duracao).toBe(normal.gravacao.duracao);
  });

  it('o corte de duração não muda nada do que veio antes dele', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const inteira = jogo.preverTacada(PARAMETROS).gravacao;
    const cortada = jogo.preverTacada(PARAMETROS, { duracaoMaxima: 1 }).gravacao;
    const n = cortada.ids.length;
    const quadrosCortados = Math.floor(1 * cortada.frequencia);
    for (let q = 0; q < quadrosCortados; q++) {
      for (let i = 0; i < n * 3; i++) expect(cortada.posicoes[q * n * 3 + i]).toBe(inteira.posicoes[q * n * 3 + i]);
    }
  });

  it('fora da vez de tacar (animando ou fim) não prevê', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    jogo.tacar(PARAMETROS);
    expect(() => jogo.preverTacada(PARAMETROS)).toThrow(/tocando/);
  });
});

describe('Jogo — a sala é a verdade (online)', () => {
  const real = (semente = 1) => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, JOGADORES, criarRng(semente));

  it('restaurar põe o jogo no ponto que a sala mandou, pronto para a próxima tacada', () => {
    const origem = real(3);
    origem.tacar(TACADA_FORTE);
    origem.concluir();
    const copia = Jogo.restaurar({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, origem.partida, origem.mesa, criarRng(9));
    expect(copia.partida).toBe(origem.partida);
    expect(copia.mesa).toBe(origem.mesa);
    expect(copia.fase).toBe('jogando');
    expect(copia.jogadorDaVez).toEqual(origem.jogadorDaVez);
    copia.tacar(TACADA_FRACA);
    expect(copia.fase).toBe('tocando');
  });

  it('restaurar uma partida terminada fica em "fim"', () => {
    const origem = real();
    const acabou = { ...origem.partida, vencedor: 0, fase: 'fim' as const };
    expect(Jogo.restaurar({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, acabou, origem.mesa, criarRng(1)).fase).toBe('fim');
  });

  it('adotar troca partida e mesa e cancela a tacada que estava tocando', () => {
    const jogo = real(2);
    const antes = { partida: jogo.partida, mesa: jogo.mesa };
    jogo.tacar(TACADA_FORTE);
    expect(jogo.fase).toBe('tocando');
    jogo.adotar(antes.partida, antes.mesa);
    expect(jogo.fase).toBe('jogando');
    expect(jogo.mesa).toBe(antes.mesa);
    expect(jogo.desfechoPendente).toBeNull();
    expect(() => jogo.concluir()).toThrow('não há tacada');
  });

  it('receberTacada toca o desfecho da sala e concluir o adota, com as consequências dela', () => {
    const jogo = real(4);
    const emissor = real(4);
    emissor.tacar(TACADA_FORTE);
    const desfecho = emissor.desfechoPendente!;
    jogo.receberTacada(desfecho);
    expect(jogo.fase).toBe('tocando');
    expect(jogo.partida.fase).toBe('saida');
    expect(jogo.concluir()).toBe(desfecho.consequencias);
    expect(jogo.partida).toBe(desfecho.partida);
    expect(jogo.mesa).toBe(desfecho.mesa);
    expect(jogo.fase).toBe('jogando');
  });

  it('receberTacada fora da vez de tacar lança; confirmarDesfecho só enquanto toca', () => {
    const jogo = real();
    const outro = real();
    outro.tacar(TACADA_FORTE);
    const desfecho = outro.desfechoPendente!;
    expect(() => jogo.confirmarDesfecho(desfecho)).toThrow('jogando');
    jogo.receberTacada(desfecho);
    expect(() => jogo.receberTacada(desfecho)).toThrow('tocando');
  });

  it('a sala corrige o meu desfecho: vale o dela', () => {
    const jogo = real(5);
    jogo.tacar(TACADA_FORTE);
    const meu = jogo.desfechoPendente!;
    const dela = { ...meu, consequencias: { ...meu.consequencias, texto: 'da sala' } };
    jogo.confirmarDesfecho(dela);
    expect(jogo.concluir().texto).toBe('da sala');
  });
});

describe('Jogo — a vez passa quando o tempo acaba (hot-seat)', () => {
  const comRegrasDoPacote = () => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, JOGADORES, criarRng(1));

  it('passarAVez dá a vez ao outro jogador, sem tacada e sem mexer na mesa', () => {
    const jogo = comRegrasDoPacote();
    const mesa = jogo.mesa;
    expect(jogo.jogadorDaVez.id).toBe('a');
    jogo.passarAVez();
    expect(jogo.jogadorDaVez.id).toBe('b');
    expect(jogo.mesa).toBe(mesa);
    expect(jogo.fase).toBe('jogando');
    jogo.passarAVez();
    expect(jogo.jogadorDaVez.id).toBe('a');
  });

  it('a saída continua a mesma para quem recebe a vez', () => {
    const jogo = comRegrasDoPacote();
    expect(jogo.partida.fase).toBe('saida');
    jogo.passarAVez();
    expect(jogo.partida.fase).toBe('saida');
  });

  it('não passa a vez com a tacada tocando nem depois do fim', () => {
    const jogo = comRegrasDoPacote();
    jogo.tacar(TACADA_FRACA);
    expect(() => jogo.passarAVez()).toThrow(/tocando/);
    jogo.concluir();
    jogo.adotar({ ...jogo.partida, vencedor: 0, fase: 'fim' }, jogo.mesa);
    expect(() => jogo.passarAVez()).toThrow(/fim/);
  });
});

describe('Jogo — o antes da última tacada (para a transição mostrar o que mudou)', () => {
  it('antes de qualquer tacada concluída não há "antes"', () => {
    expect(novoJogo(regrasDeRoteiro(() => ({}))).antesDaUltimaTacada).toBeNull();
  });

  it('concluir guarda a partida e a mesa de antes da tacada, mesmo com a partida e a mesa já trocadas', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({ partida: { naMesa: [2, 3] } })));
    const partidaAntes = jogo.partida;
    const mesaAntes = jogo.mesa;
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
    expect(jogo.partida.naMesa).toEqual([2, 3]);
    expect(jogo.antesDaUltimaTacada?.partida).toBe(partidaAntes);
    expect(jogo.antesDaUltimaTacada?.mesa).toBe(mesaAntes);
  });

  it('ao receber a tacada de outro jogador (online) também vale: o antes é o que a mesa tinha', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    const partidaAntes = jogo.partida;
    const mesaAntes = jogo.mesa;
    jogo.receberTacada({ partida: { ...partidaAntes, vez: 1 }, mesa: mesaAntes, consequencias: semConsequencias(1) });
    jogo.concluir();
    expect(jogo.antesDaUltimaTacada?.partida).toBe(partidaAntes);
  });

  it('adotar o retrato da sala (início, volta, nova partida) esquece o antes', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    jogo.tacar(TACADA_FRACA);
    jogo.concluir();
    jogo.adotar(jogo.partida, jogo.mesa);
    expect(jogo.antesDaUltimaTacada).toBeNull();
  });

  it('a vez que passa por tempo esgotado não é tacada: não mexe no antes', () => {
    const jogo = novoJogo(regrasDeRoteiro(() => ({})));
    jogo.passarAVez();
    expect(jogo.antesDaUltimaTacada).toBeNull();
  });
});

describe('Jogo — hot-seat mata-mata (3 e 4 jogadores, regras do pacote)', () => {
  const jogoDe = (modo: '1x1' | '1x1x1' | '1x1x1x1', semente = 1) => new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_MATA_MATA.regras, jogadoresDoHotSeat(modo), criarRng(semente));
  const fraca: ParametrosTacada = { ...TACADA_FORTE, velocidadeTaco: 0.12, angulo: Math.PI };

  it('começa com as 15 bolas na mesa, uma equipe por jogador (0 a N−1), sem grupos', () => {
    for (const [modo, n] of [['1x1', 2], ['1x1x1', 3], ['1x1x1x1', 4]] as const) {
      const jogo = jogoDe(modo);
      expect(jogo.partida.config.modalidade).toBe('mata-mata');
      expect(jogo.partida.jogadores.map((j) => j.equipe)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(jogo.partida.grupos).toEqual(Array.from({ length: n }, () => null));
      expect(jogo.partida.naMesa).toHaveLength(15);
    }
  });

  it('a vez gira 1, 2, 3, 1 a cada tacada, mate ou não (a fraca não acerta nada: passa a vez sem pena)', () => {
    const jogo = jogoDe('1x1x1');
    const vezes: string[] = [];
    for (let i = 0; i < 5; i++) {
      vezes.push(jogo.jogadorDaVez.nome);
      jogo.tacar(fraca);
      jogo.concluir();
    }
    expect(vezes).toEqual(['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 1', 'Jogador 2']);
    expect(jogo.jogadorDaVez.nome).toBe('Jogador 3');
  });

  it('o tempo que acaba gira a roda do mesmo jeito', () => {
    const jogo = jogoDe('1x1x1x1');
    const vezes: string[] = [];
    for (let i = 0; i < 5; i++) {
      vezes.push(jogo.jogadorDaVez.nome);
      jogo.passarAVez();
    }
    expect(vezes).toEqual(['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Jogador 1']);
  });

  it('a pessoa que vence é a da equipe vencedora, e a nova partida gira a roda sem mudar a equipe de ninguém', () => {
    const jogo = jogoDe('1x1x1');
    const acabou = { ...jogo.partida, vencedor: 2, fase: 'fim' as const, vez: 1 };
    jogo.adotar(acabou, jogo.mesa);
    expect(jogo.vencedores.map((j) => j.nome)).toEqual(['Jogador 3']);
    const proxima = jogadoresDaNovaPartida(acabou);
    expect(proxima.map((j) => j.id)).toEqual(['j2', 'j3', 'j1']);
    expect(proxima.map((j) => j.equipe)).toEqual([1, 2, 0]);
  });
});
