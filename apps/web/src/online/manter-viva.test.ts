import { describe, expect, it } from 'vitest';
import { NOME_DO_TRAVAMENTO, manterViva, type TravasMinimas } from './manter-viva';

/** `navigator.locks` à mão: guarda os pedidos e diz se o travamento está de pé (callback ainda não resolveu). */
class TravasFalsas implements TravasMinimas {
  readonly pedidos: { nome: string; modo: string }[] = [];
  seguras = 0;
  falhar: 'nao' | 'sincrono' | 'promessa' | 'concede-e-rejeita' = 'nao';
  /** O navegador só concede o travamento quando mandarem (`conceder`). */
  diferir = false;
  private pendente: (() => Promise<void>) | null = null;

  conceder(): Promise<void> {
    const ao = this.pendente!;
    this.pendente = null;
    this.seguras++;
    return ao().finally(() => void this.seguras--);
  }

  request(nome: string, opcoes: { mode: 'shared' }, ao: () => Promise<void>): Promise<void> {
    if (this.falhar === 'sincrono') throw new Error('sem permissão');
    if (this.falhar === 'promessa') return Promise.reject(new Error('recusado'));
    this.pedidos.push({ nome, modo: opcoes.mode });
    if (this.falhar === 'concede-e-rejeita') {
      void ao();
      return Promise.reject(new Error('revogado'));
    }
    if (this.diferir) {
      this.pendente = ao;
      return Promise.resolve();
    }
    this.seguras++;
    return ao().finally(() => void this.seguras--);
  }
}

const aguardar = (): Promise<void> => new Promise((resolver) => setTimeout(resolver, 0));

describe('manterViva: a aba que tem a sala aberta não pode ser congelada', () => {
  it('pede um travamento compartilhado com o nome da sala e o mantém de pé', async () => {
    const travas = new TravasFalsas();
    const viva = manterViva(travas);
    await aguardar();
    expect(travas.pedidos).toEqual([{ nome: NOME_DO_TRAVAMENTO, modo: 'shared' }]);
    expect(travas.seguras).toBe(1);
    expect(viva.ativa).toBe(true);
  });

  it('liberar solta o travamento (e liberar de novo não faz nada)', async () => {
    const travas = new TravasFalsas();
    const viva = manterViva(travas);
    await aguardar();
    viva.liberar();
    await aguardar();
    expect(travas.seguras).toBe(0);
    expect(viva.ativa).toBe(false);
    expect(() => viva.liberar()).not.toThrow();
  });

  it('liberar antes do navegador conceder o travamento também funciona', async () => {
    const travas = new TravasFalsas();
    const viva = manterViva(travas);
    viva.liberar();
    await aguardar();
    expect(travas.seguras).toBe(0);
    expect(viva.ativa).toBe(false);
  });

  it('liberar antes de o navegador conceder: quando conceder, o travamento já nasce solto', async () => {
    const travas = new TravasFalsas();
    travas.diferir = true;
    const viva = manterViva(travas);
    viva.liberar();
    void travas.conceder();
    await aguardar();
    expect(travas.seguras).toBe(0);
    expect(viva.ativa).toBe(false);
  });

  it('o navegador concede e depois a promessa é rejeitada (revogado): deixa de contar como viva', async () => {
    const travas = new TravasFalsas();
    travas.falhar = 'concede-e-rejeita';
    const viva = manterViva(travas);
    await aguardar();
    expect(viva.ativa).toBe(false);
  });

  it('um pedido por chamada: duas sessões seguidas não se misturam', async () => {
    const travas = new TravasFalsas();
    const a = manterViva(travas);
    await aguardar();
    a.liberar();
    const b = manterViva(travas);
    await aguardar();
    expect(travas.pedidos).toHaveLength(2);
    expect(travas.seguras).toBe(1);
    expect(b.ativa).toBe(true);
    expect(a.ativa).toBe(false);
  });

  it('sem `navigator.locks` (contexto sem HTTPS, navegador antigo): segue sem travar e sem erro', () => {
    const viva = manterViva(undefined);
    expect(viva.ativa).toBe(false);
    expect(() => viva.liberar()).not.toThrow();
  });

  it('pedido que o navegador recusa (erro na hora ou promessa rejeitada) não derruba o jogo', async () => {
    const sincrono = new TravasFalsas();
    sincrono.falhar = 'sincrono';
    expect(manterViva(sincrono).ativa).toBe(false);
    const promessa = new TravasFalsas();
    promessa.falhar = 'promessa';
    const viva = manterViva(promessa);
    await aguardar();
    expect(viva.ativa).toBe(false);
  });
});
