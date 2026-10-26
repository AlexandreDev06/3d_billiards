import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { LIMITES_PROTOCOLO, LUGARES_POR_MODO, validarMensagemDaSala, type ModoSala, type PlacarSala } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, criarAmbiente, type Ambiente } from './para-testes';
import type { MotorDeRegras } from './regras';

const MM = PRESET_MATA_MATA.regras;

interface Controle {
  /** Equipe (não a posição na roda) que vence a partida que a próxima tacada encerra. */
  vencedor: number;
}

/** Fim de partida do mata-mata como as regras o devolvem: `vez` 1 (quem sai na próxima), a mesa sem mudança, a equipe `vencedor` ganha. */
const fim = (p: EstadoPartida, vencedor: number): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vez: 1, vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor, texto: 'fim' },
});

/** As regras reais para começar (`novaPartida`) e uma tacada que acaba a partida para `controle.vencedor`. */
const motorDe = (controle: Controle): MotorDeRegras => ({ novaPartida, aplicarTacada: (p) => fim(p, controle.vencedor) });

interface Mesa {
  readonly amb: Ambiente;
  readonly controle: Controle;
  readonly clientes: ClienteDeTeste[];
  readonly ana: ClienteDeTeste;
}

const NOMES = ['Ana', 'Beto', 'Cida', 'Davi'];

/** Sala de mata-mata iniciada (a anfitriã Ana no lugar 0). */
function salaDeMataMata(modo: ModoSala = '1x1x1'): Mesa {
  const controle: Controle = { vencedor: 0 };
  const amb = criarAmbiente({}, { regras: motorDe(controle) });
  const clientes = NOMES.slice(0, LUGARES_POR_MODO[modo]).map((n) => new ClienteDeTeste(amb, n));
  clientes[0]!.criar(modo, MM);
  for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
  clientes[0]!.enviar({ tipo: 'iniciar' });
  return { amb, controle, clientes, ana: clientes[0]! };
}

const lugarDe = (c: ClienteDeTeste): number | null => c.estado.lugares.find((l) => l.nome === c.nome)?.lugar ?? null;

/** Quem tem a vez taca e a partida acaba, para a equipe `vencedor`. */
function acabar(s: Mesa, vencedor: number): void {
  s.controle.vencedor = vencedor;
  const vez = s.ana.estado.vez;
  const quem = s.clientes.find((c) => lugarDe(c) === vez)!;
  const v = quem.visao!;
  const erros = quem.erros.length;
  quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, vencedor).partida, mesa: v.mesa });
  expect(quem.erros.length, 'a tacada final foi aceita').toBe(erros);
  expect(s.ana.estado.vez).toBeNull();
}

const outraPartida = (s: Mesa): void => {
  s.ana.enviar({ tipo: 'voltar-ao-lobby' });
  s.ana.enviar({ tipo: 'iniciar' });
  expect(s.ana.estado.fase).toBe('jogando');
};

/** "Ana 2 | Beto 0 | Cida 1": todos os lados do confronto, na ordem em que ele abriu. */
const texto = (c: NonNullable<PlacarSala['atual']>): string => c.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' | ');
const placarVisto = (c: ClienteDeTeste): { atual: string | null; historico: string[] } => ({
  atual: c.estado.placar?.atual ? texto(c.estado.placar.atual) : null,
  historico: (c.estado.placar?.historico ?? []).map(texto),
});

describe('placar do mata-mata — cada pessoa é um lado', () => {
  it('a primeira partida de três abre o confronto com 3 lados, 1 vitória para quem ganhou, igual para jogadores e espectador', () => {
    const s = salaDeMataMata('1x1x1');
    const esp = new ClienteDeTeste(s.amb, 'Esp').entrar(s.ana.codigo);
    acabar(s, 1);
    for (const c of [...s.clientes, esp]) expect(placarVisto(c), c.nome).toEqual({ atual: 'Ana 0 | Beto 1 | Cida 0', historico: [] });
    expect(s.ana.estado.placar!.atual!.lados).toHaveLength(3);
  });

  it('o estado-sala com o placar de 3 e de 4 lados passa pela validação do fio', () => {
    const s3 = salaDeMataMata('1x1x1');
    acabar(s3, 2);
    expect(validarMensagemDaSala(s3.ana.estado).ok).toBe(true);
    const s4 = salaDeMataMata('1x1x1x1');
    acabar(s4, 3);
    const r = validarMensagemDaSala(s4.ana.estado);
    expect(r.ok, r.ok ? '' : r.erro).toBe(true);
    expect(placarVisto(s4.ana)).toEqual({ atual: 'Ana 0 | Beto 0 | Cida 0 | Davi 1', historico: [] });
  });

  it('os mesmos três lados somam, mesmo com a roda girando: a vitória vai para a PESSOA da equipe que venceu', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 1); // Beto
    outraPartida(s); // a roda gira: Beto, Cida, Ana (cada um mantém a equipe)
    const roda = s.ana.conn.todas('retrato').at(-1)!.partida.jogadores;
    expect(roda.map((j) => [j.id, j.equipe])).toEqual([['lugar-1', 1], ['lugar-2', 2], ['lugar-0', 0]]);
    acabar(s, 0); // a equipe 0 é a Ana (a última da roda), não quem abriu a partida
    outraPartida(s);
    acabar(s, 0);
    outraPartida(s);
    acabar(s, 2); // Cida
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 | Beto 1 | Cida 1', historico: [] });
    for (const c of s.clientes) expect(placarVisto(c), c.nome).toEqual(placarVisto(s.ana));
  });

  it('voltar ao lobby, configurar a sala e a volta de quem caiu não zeram o placar de 3 lados', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 15 }, forca: 'empurrar', giz: { passadaS: 2 } });
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 | Beto 0 | Cida 0', historico: [] });
    s.clientes[2]!.reconectar();
    expect(placarVisto(s.clientes[2]!)).toEqual({ atual: 'Ana 1 | Beto 0 | Cida 0', historico: [] });
  });

  it('uma quarta pessoa abre confronto novo de 4 lados e o de 3 vai para o histórico; sair de novo abre outro (não retoma o velho)', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modo: '1x1x1x1' });
    const davi = new ClienteDeTeste(s.amb, 'Davi').entrar(s.ana.codigo);
    expect(davi.lugar).toBe(3);
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes.push(davi);
    acabar(s, 3);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 | Beto 0 | Cida 0 | Davi 1', historico: ['Ana 1 | Beto 0 | Cida 0'] });
    expect(placarVisto(davi)).toEqual(placarVisto(s.ana));

    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modo: '1x1x1' });
    expect(davi.lugar, 'sem lugar no modo menor').toBeNull();
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes.pop();
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 | Beto 1 | Cida 0', historico: ['Ana 0 | Beto 0 | Cida 0 | Davi 1', 'Ana 1 | Beto 0 | Cida 0'] });
  });

  it('uma pessoa trocada por outra abre confronto novo; a que volta com o token segue o confronto', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 0);
    // Cida cai no fim da partida e volta com o token antes de o anfitrião voltar à sala: segue o confronto
    s.clientes[2]!.sair();
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.clientes[2]!.reconectar();
    expect(s.clientes[2]!.lugar).toBe(2);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 2);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 | Beto 0 | Cida 1', historico: [] });
    // Beto é expulso e entra outro Beto: outra pessoa, confronto novo
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const outroBeto = new ClienteDeTeste(s.amb, 'Beto').entrar(s.ana.codigo);
    expect(outroBeto.lugar).toBe(1);
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = outroBeto;
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 | Beto 0 | Cida 0', historico: ['Ana 1 | Beto 0 | Cida 1'] });
  });

  it('o mesmo 1x1 de par ou ímpar e de mata-mata entre as mesmas duas pessoas são confrontos diferentes, cada um com a sua modalidade no fio', () => {
    const controle: Controle = { vencedor: 0 };
    const amb = criarAmbiente({}, { regras: motorDe(controle) });
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const s: Mesa = { amb, controle, clientes: [ana, beto], ana };
    const modalidades = (c: ClienteDeTeste) => [c.estado.placar!.atual?.modalidade, ...c.estado.placar!.historico.map((h) => h.modalidade)];
    ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(modalidades(beto)).toEqual(['par-ou-impar']);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(ana.estado.modo).toBe('1x1');
    expect(placarVisto(ana), 'a espera ainda mostra o confronto de antes').toEqual({ atual: 'Ana 1 | Beto 0', historico: [] });
    ana.enviar({ tipo: 'iniciar' });
    acabar(s, 1);
    expect(placarVisto(ana)).toEqual({ atual: 'Ana 0 | Beto 1', historico: ['Ana 1 | Beto 0'] });
    expect(modalidades(ana)).toEqual(['mata-mata', 'par-ou-impar']);
    expect(modalidades(beto)).toEqual(['mata-mata', 'par-ou-impar']);
    // mais uma de mata-mata soma no confronto de mata-mata; voltar ao par ou ímpar abre outro
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    acabar(s, 1);
    expect(placarVisto(ana)).toEqual({ atual: 'Ana 0 | Beto 2', historico: ['Ana 1 | Beto 0'] });
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(ana)).toEqual({ atual: 'Ana 1 | Beto 0', historico: ['Ana 0 | Beto 2', 'Ana 1 | Beto 0'] });
    expect(modalidades(ana)).toEqual(['par-ou-impar', 'mata-mata', 'par-ou-impar']);
    expect(validarMensagemDaSala(ana.estado).ok).toBe(true);
  });

  it('do 2x1 do par ou ímpar (Ana e Cida contra Beto) ao mata-mata das mesmas três pessoas: confronto novo de 3 lados', () => {
    const controle: Controle = { vencedor: 0 };
    const amb = criarAmbiente({}, { regras: motorDe(controle) });
    const clientes = ['Ana', 'Beto', 'Cida'].map((n) => new ClienteDeTeste(amb, n));
    clientes[0]!.criar('2x1', PRESET_BOTECO.regras, SEM_LIMITE);
    clientes[1]!.entrar(clientes[0]!.codigo);
    clientes[2]!.entrar(clientes[0]!.codigo);
    const s: Mesa = { amb, controle, clientes, ana: clientes[0]! };
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 | Beto 0', historico: [] });
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '1x1x1' });
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 2);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 | Beto 0 | Cida 1', historico: ['Ana e Cida 1 | Beto 0'] });
    expect([s.ana.estado.placar!.atual!.modalidade, s.ana.estado.placar!.historico[0]!.modalidade]).toEqual(['mata-mata', 'par-ou-impar']);
  });

  it('trocar de modalidade na espera descarta a ordem da próxima partida (ela era das regras de antes); configurar outra coisa a mantém', () => {
    /** Sala de par ou ímpar 1x1 com a primeira partida acabada (o fim deixa `vez` 1: quem sai na próxima é o Beto) e de volta à espera. */
    const naEsperaDepoisDeAcabar = () => {
      const controle: Controle = { vencedor: 0 };
      const amb = criarAmbiente({}, { regras: motorDe(controle) });
      const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
      const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
      ana.enviar({ tipo: 'iniciar' });
      acabar({ amb, controle, clientes: [ana, beto], ana }, 0);
      ana.enviar({ tipo: 'voltar-ao-lobby' });
      return ana;
    };
    const quemAbre = (ana: ClienteDeTeste) => ana.conn.todas('retrato').at(-1)!.partida.jogadores.map((j) => j.id);

    const mantem = naEsperaDepoisDeAcabar();
    mantem.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 }, giz: { passada: 0.2 }, forca: 'empurrar' });
    mantem.enviar({ tipo: 'iniciar' });
    expect(quemAbre(mantem), 'configurar outra coisa não perde a ordem').toEqual(['lugar-1', 'lugar-0']);

    const descarta = naEsperaDepoisDeAcabar();
    descarta.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(descarta.estado.modo).toBe('1x1'); // o modo ficou; só a modalidade mudou
    descarta.enviar({ tipo: 'iniciar' });
    expect(quemAbre(descarta), 'trocar de modalidade volta à ordem dos lugares').toEqual(['lugar-0', 'lugar-1']);
  });

  it('o log do placar diz quem venceu e traz os lados além dos dois primeiros, sem id nem IP', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 2);
    const linha = s.amb.logs.find((l) => l.startsWith('placar '))!;
    expect(JSON.parse(linha.slice('placar '.length))).toMatchObject({
      modalidade: 'mata-mata',
      venceu: 'Cida',
      ladoA: 'Ana',
      ladoB: 'Beto',
      vitoriasA: 0,
      vitoriasB: 0,
      outros: 'Cida 1',
      novoConfronto: true,
      confrontos: 1,
    });
    expect(linha).not.toMatch(/entrada-\d|198\.51\.100/);
  });

  it('o histórico respeita o teto de confrontos também com 3 lados', () => {
    const s = salaDeMataMata('1x1x1');
    acabar(s, 0);
    // cada rodada troca uma pessoa (expulsa e entra de novo como nova): 1 confronto novo por partida
    for (let i = 0; i < LIMITES_PROTOCOLO.confrontosNoPlacar + 2; i++) {
      s.ana.enviar({ tipo: 'voltar-ao-lobby' });
      s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
      const novo = new ClienteDeTeste(s.amb, `Novo${i}`).entrar(s.ana.codigo);
      s.ana.enviar({ tipo: 'iniciar' });
      s.clientes[1] = novo;
      acabar(s, 1);
    }
    const placar = s.ana.estado.placar!;
    expect(placar.historico).toHaveLength(LIMITES_PROTOCOLO.confrontosNoPlacar - 1);
    expect(placarVisto(s.ana).atual).toBe(`Ana 0 | Novo${LIMITES_PROTOCOLO.confrontosNoPlacar + 1} 1 | Cida 0`);
    expect(validarMensagemDaSala(s.ana.estado).ok).toBe(true);
  });
});
