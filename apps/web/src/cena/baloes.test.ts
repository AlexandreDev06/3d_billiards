import { quadroVazio } from '@sinuca/personagens';
import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { describe, expect, it } from 'vitest';
import { CARAS_DO_BALAO } from '../baloes/rosto';
import { CONFIG_WEB } from '../config';
import { balaoDoArtista } from '../maos/para-testes';
import { estadoVazioDoBalao, type EstadoDoBalao } from './balao';
import { BaloesDaCena } from './baloes';

const BASE = await balaoDoArtista();
const atlas = () => new DataTexture(new Uint8Array(4 * CARAS_DO_BALAO.length), CARAS_DO_BALAO.length, 1, RGBAFormat, UnsignedByteType);
const estado = (mudancas: Partial<EstadoDoBalao> = {}): EstadoDoBalao => ({ ...estadoVazioDoBalao(), escala: 1, cor: 0x3aa0ff, ...mudancas });
const nova = () => new BaloesDaCena(CONFIG_WEB.baloes, 13, atlas());

describe('BaloesDaCena (o balão do artista, com o procedural de reserva)', () => {
  it('antes do arquivo chegar desenha o balão de hoje, procedural', () => {
    const b = nova();
    expect(b.comArquivo).toBe(false);
    b.mostrar(0, estado());
    expect(b.visivel(0)).toBe(true);
    expect(b.grupo.getObjectByName('balao-corpo')?.parent?.visible).toBe(true);
    b.descartar();
  });

  it('quando o arquivo chega, passa a desenhar o do artista e esconde o procedural', () => {
    const b = nova();
    b.mostrar(0, estado());
    b.usar(BASE, 'alto', () => 0.5);
    expect(b.comArquivo).toBe(true);
    b.mostrar(0, estado());
    expect(b.visivel(0)).toBe(true);
    expect(b.grupo.getObjectByName('balao-corpo')?.parent?.visible).toBe(false);
    expect(b.diagnostico(0)).not.toBeNull();
    b.descartar();
  });

  it('diagnóstico e âncora de um balão que não existe dão null e false, sem lançar', () => {
    const b = nova();
    expect(b.diagnostico(0)).toBeNull();
    b.usar(BASE, 'alto', () => 0.5);
    const saida = quadroVazio();
    expect(b.diagnostico(9)).toBeNull();
    expect(b.diagnostico(-1)).toBeNull();
    expect(b.ancora(9, 'mao_esq', saida)).toBe(false);
    expect(b.ancora(0, 'mao_esq', saida)).toBe(true);
    b.descartar();
  });

  it('esconder, esconderTodos e visivel valem para o balão que está em cena', () => {
    const b = nova();
    b.usar(BASE, 'alto', () => 0.5);
    b.mostrar(1, estado());
    b.mostrar(2, estado());
    expect(b.visivel(1)).toBe(true);
    b.esconder(1);
    expect(b.visivel(1)).toBe(false);
    expect(b.visivel(2)).toBe(true);
    b.esconderTodos();
    expect(b.visivel(2)).toBe(false);
    b.descartar();
  });

  it('o nível de detalhe vai para o balão do artista; os lados, para o procedural', () => {
    const b = nova();
    b.usar(BASE, 'alto', () => 0.5);
    b.definirNivel('baixo');
    b.mostrar(0, estado());
    let baixa = 0;
    let alta = 0;
    b.grupo.traverse((o) => {
      if (!(o as { isSkinnedMesh?: boolean }).isSkinnedMesh || !o.visible) return;
      if (o.name.startsWith('balao_baixa')) baixa++;
      else if (o.name.startsWith('balao_alta')) alta++;
    });
    // cinco malhas por balão (uma por material), em cada um dos quatro
    expect(baixa).toBe(20);
    expect(alta).toBe(0);
    expect(() => b.definirLados(8)).not.toThrow();
    b.descartar();
  });

  it('lista os materiais do que está em cena (as variantes de qualidade os conhecem)', () => {
    const b = nova();
    const antes = b.materiais().length;
    b.usar(BASE, 'alto', () => 0.5);
    expect(b.materiais().length).toBeGreaterThan(antes);
    b.descartar();
  });
});
