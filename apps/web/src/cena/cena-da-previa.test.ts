import { APARENCIA_PADRAO, type AparenciaDoBalao } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { balaoDoArtista, chapeusDoArtista } from '../maos/para-testes';
import { CenaDaPrevia } from './cena-da-previa';
import { CarregadorDeChapeus } from './chapeus';

const BASE = await balaoDoArtista();
const CHAPEUS = await chapeusDoArtista();
const ana: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_kawaii', corDosOlhos: 'verde' };

const montar = () => {
  const chapeus = new CarregadorDeChapeus(async () => CHAPEUS, 15_000);
  const c = new CenaDaPrevia(CONFIG_WEB.baloes, BASE, 'alto', chapeus, 320 / 360, 0x3aa0ff);
  return { c, chapeus };
};
const quadros = (c: CenaDaPrevia, n: number): void => {
  for (let i = 0; i < n; i++) c.atualizar(1 / 30);
};

describe('CenaDaPrevia (o balão do Meu balão, sem o renderizador)', () => {
  it('nasce com o balão padrão, visível, de frente para a câmera e nada baixou dos chapéus', () => {
    const { c, chapeus } = montar();
    quadros(c, 5);
    expect(c.diagnostico().aparencia).toEqual({ acessorio: null, bigode: null, estiloDeOlho: 'olho_normal', corDosOlhos: 'castanho' });
    expect(chapeus.estado).toBe('parado');
    expect(c.cena.getObjectByName('balao-0')!.visible).toBe(true);
    c.dispose();
  });

  it('veste a aparência do rascunho: o chapéu entra quando o arquivo chega, o resto na hora', async () => {
    const { c, chapeus } = montar();
    c.definirAparencia(ana);
    expect(c.diagnostico().aparencia).toEqual({ acessorio: null, bigode: 'bigode_dali', estiloDeOlho: 'olho_kawaii', corDosOlhos: 'verde' });
    expect(chapeus.estado).toBe('carregando');
    await Promise.resolve();
    await Promise.resolve();
    quadros(c, 3);
    expect(c.diagnostico().aparencia.acessorio).toBe('coroa');
    c.definirAparencia(APARENCIA_PADRAO);
    expect(c.diagnostico().aparencia).toEqual({ acessorio: null, bigode: null, estiloDeOlho: 'olho_normal', corDosOlhos: 'castanho' });
    c.dispose();
  });

  it('as reações trocam a cara e a ação da tabela do jogo; reação que não existe é recusada', () => {
    const { c } = montar();
    expect(c.definirReacao('nao-existe')).toBe(false);
    expect(c.reacaoAtual).toBe('neutro');
    expect(c.definirReacao('rindo')).toBe(true);
    quadros(c, 40);
    expect(c.diagnostico().cara).toBe('cara_rindo');
    expect(c.diagnostico().acao).toBe('balao_rir');
    c.definirReacao('impaciente');
    quadros(c, 40);
    expect(c.diagnostico().momento).toBe('impaciente');
    c.definirReacao('ganhou');
    quadros(c, 40);
    expect(c.diagnostico().momento).toBe('ganhou');
    c.dispose();
  });

  it('arrastar gira o balão e a cor da equipe tinge o látex', () => {
    const { c } = montar();
    quadros(c, 2);
    const antes = c.diagnostico().yaw;
    c.girar(100);
    c.girar(-40);
    expect(c.diagnostico().yaw).toBeCloseTo(antes + 60 * 0.012, 6);
    c.definirCor(0xffb347);
    quadros(c, 2);
    const g = c.cena.getObjectByName('balao-0')!;
    expect(g.rotation.y).toBeCloseTo(antes + 60 * 0.012, 6);
    c.dispose();
  });

  it('o olhar segue o ponteiro e volta a andar sozinho quando ele sai; 120 quadros vestido não lançam', async () => {
    const { c } = montar();
    c.definirAparencia(ana);
    await Promise.resolve();
    await Promise.resolve();
    c.olharPara(0.8, 0.2);
    quadros(c, 60);
    expect(c.diagnostico().olhando).toBe(true);
    c.olharPara(null, null);
    quadros(c, 60);
    c.dispose();
  });
});
