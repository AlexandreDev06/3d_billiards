import { diaDaMissao, fimDoDia, missoesDoDia, type MissoesDoDia } from '@sinuca/protocolo';
import { describe, expect, it, vi } from 'vitest';
import { missoesNaAjuda, type MissoesNaTela, type OndeSeJoga } from '../online/missoes-modelo';
import { INTERVALO_DA_SECAO_MS, SecaoDeMissoes } from './ajuda-missoes-modelo';

const AGORA = Date.parse('2026-10-26T15:00:00Z');
const DIA = diaDaMissao(AGORA);
const FIM = fimDoDia(DIA);
const itens = missoesDoDia(DIA);

const quadro = (progressos: readonly [number, number, number]): MissoesDoDia => ({
  dia: DIA,
  fimMs: FIM,
  itens: itens.map((m, i) => ({ id: m.id, progresso: progressos[i]!, meta: m.meta, cumprida: progressos[i]! >= m.meta })),
});

/** Uma seção ligada a um "mundo" de mentira: o quadro da carteira, onde se joga e se uma tacada toca podem mudar à vontade. */
function montar(inicial: MissoesDoDia | null = quadro([0, 0, 0])) {
  const mundo = { quadro: inicial, onde: 'sala' as OndeSeJoga, tocando: false };
  const desenhados: MissoesNaTela[] = [];
  const aoPrecisarDeMissoes = vi.fn();
  const secao = new SecaoDeMissoes({
    missoes: (agoraMs) => missoesNaAjuda(mundo.quadro, agoraMs, mundo.onde),
    desenhar: (m) => void desenhados.push(m),
    aoPrecisarDeMissoes,
    segurar: () => mundo.tocando,
  });
  return { mundo, secao, desenhados, aoPrecisarDeMissoes };
}

describe('SecaoDeMissoes: aberta e fechada', () => {
  it('fechada nunca desenha, aconteça o que acontecer', () => {
    const { mundo, secao, desenhados } = montar();
    mundo.quadro = quadro([1, 0, 0]);
    secao.mudou(AGORA);
    for (let i = 1; i <= 100; i++) secao.tic(AGORA + i * 1000);
    expect(desenhados).toHaveLength(0);
    expect(secao.desenhos).toBe(0);
    expect(secao.aberta).toBe(false);
  });

  it('abrir desenha na hora, com o que vale agora, e fechar não desenha', () => {
    const { mundo, secao, desenhados } = montar();
    mundo.quadro = quadro([1, 0, 0]);
    secao.definirAberta(true, AGORA);
    expect(desenhados).toHaveLength(1);
    expect(desenhados[0]!.cartoes[0]!.progresso).toBe(1);
    secao.definirAberta(false, AGORA + 1000);
    expect(desenhados).toHaveLength(1);
    expect(secao.aberta).toBe(false);
  });

  it('abrir de novo mostra o estado de agora, não o de quando fechou', () => {
    const { mundo, secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    secao.definirAberta(false, AGORA + 1000);
    mundo.quadro = quadro([0, 1, 0]);
    secao.mudou(AGORA + 2000);
    expect(desenhados).toHaveLength(1);
    secao.definirAberta(true, AGORA + 3000);
    expect(desenhados).toHaveLength(2);
    expect(desenhados[1]!.cartoes[1]!.progresso).toBe(1);
  });

  it('abrir uma seção já aberta não desenha de novo', () => {
    const { secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    secao.definirAberta(true, AGORA + 10);
    expect(desenhados).toHaveLength(1);
  });
});

describe('SecaoDeMissoes: o progresso anda com ela aberta', () => {
  it('chegou o quadro novo (a mensagem `missoes` da sala): o progresso muda na hora', () => {
    const { mundo, secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    mundo.quadro = quadro([1, 0, 0]);
    secao.mudou(AGORA + 500);
    expect(desenhados).toHaveLength(2);
    expect(desenhados[1]!.cartoes[0]!.textoDoProgresso).toBe(`1 de ${itens[0]!.meta}`);
    mundo.quadro = quadro([itens[0]!.meta, 0, 0]);
    secao.mudou(AGORA + 900);
    expect(desenhados[2]!.cartoes[0]!.cumprida).toBe(true);
    expect(desenhados[2]!.textoDoGanho).toBe('50 de 220 moedas hoje');
  });

  it('com a tacada tocando espera: o quadro novo só aparece quando as bolas param (nada de adiantar o lance)', () => {
    const { mundo, secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    mundo.tocando = true;
    mundo.quadro = quadro([1, 0, 0]);
    secao.mudou(AGORA + 500);
    secao.tic(AGORA + 600);
    secao.tic(AGORA + 700);
    expect(desenhados).toHaveLength(1);
    mundo.tocando = false;
    secao.tic(AGORA + 800);
    expect(desenhados).toHaveLength(2);
    expect(desenhados[1]!.cartoes[0]!.progresso).toBe(1);
    secao.tic(AGORA + 900);
    expect(desenhados).toHaveLength(2);
  });

  it('mudar de lugar (da sala para o mesmo PC) redesenha com o aviso de que ali nada conta', () => {
    const { mundo, secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    expect(desenhados[0]!.aviso).toBeNull();
    mundo.onde = 'local';
    secao.mudou(AGORA + 100);
    expect(desenhados[1]!.aviso).toMatch(/online/);
  });
});

describe('SecaoDeMissoes: o relógio', () => {
  it('o "faltam" anda sozinho a cada 15 s e só então', () => {
    const { secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    secao.tic(AGORA + INTERVALO_DA_SECAO_MS - 1);
    expect(desenhados).toHaveLength(1);
    secao.tic(AGORA + INTERVALO_DA_SECAO_MS);
    expect(desenhados).toHaveLength(2);
    secao.tic(AGORA + INTERVALO_DA_SECAO_MS + 5000);
    expect(desenhados).toHaveLength(2);
    secao.tic(AGORA + 2 * INTERVALO_DA_SECAO_MS);
    expect(desenhados).toHaveLength(3);
  });

  it('o texto do "faltam" muda quando o minuto vira', () => {
    const { secao, desenhados } = montar();
    secao.definirAberta(true, FIM - 90_000);
    secao.tic(FIM - 90_000 + INTERVALO_DA_SECAO_MS);
    secao.tic(FIM - 90_000 + 2 * INTERVALO_DA_SECAO_MS);
    expect(desenhados.map((d) => d.restante)).toEqual(['Faltam 2 min para virar o dia', 'Faltam 2 min para virar o dia', 'Faltam 1 min para virar o dia']);
  });

  it('a conferência do relógio também espera a tacada que toca', () => {
    const { mundo, secao, desenhados } = montar();
    secao.definirAberta(true, AGORA);
    mundo.tocando = true;
    mundo.quadro = quadro([1, 0, 0]);
    secao.mudou(AGORA + 100);
    secao.tic(AGORA + 3 * INTERVALO_DA_SECAO_MS);
    expect(desenhados).toHaveLength(1);
  });

  it('o dia virou com a seção aberta: mostra o dia novo zerado e pede a leitura da carteira uma vez', () => {
    const { secao, desenhados, aoPrecisarDeMissoes } = montar(quadro([itens[0]!.meta, 0, 0]));
    secao.definirAberta(true, FIM - 20_000);
    secao.tic(FIM - 20_000 + INTERVALO_DA_SECAO_MS);
    expect(aoPrecisarDeMissoes).not.toHaveBeenCalled();
    expect(desenhados.at(-1)!.ganhoHoje).toBe(50);
    secao.tic(FIM + INTERVALO_DA_SECAO_MS);
    expect(aoPrecisarDeMissoes).toHaveBeenCalledTimes(1);
    expect(desenhados.at(-1)!.ganhoHoje).toBe(0);
    expect(desenhados.at(-1)!.cartoes.every((c) => c.progresso === 0)).toBe(true);
    // o desenho do dia novo já guarda o fim do dia novo: não pede de novo a cada 15 s
    secao.tic(FIM + 2 * INTERVALO_DA_SECAO_MS);
    expect(aoPrecisarDeMissoes).toHaveBeenCalledTimes(1);
  });

  it('o dia virou com a seção fechada: ao abrir já mostra o dia novo e pede a leitura', () => {
    const { secao, desenhados, aoPrecisarDeMissoes } = montar(quadro([itens[0]!.meta, 0, 0]));
    secao.definirAberta(true, FIM - 10_000);
    secao.definirAberta(false, FIM - 5000);
    secao.definirAberta(true, FIM + 60_000);
    expect(desenhados.at(-1)!.ganhoHoje).toBe(0);
    expect(aoPrecisarDeMissoes).toHaveBeenCalledTimes(1);
  });
});
