import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, criarRng, lugares, simularTacada, type EventoTacada } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { causaDoEspirro, ehEspirro, textoDoEspirro, TEXTO_DO_ESPIRRO } from './espirro';

const fisica = CONFIG_FISICA_PADRAO;
const alto = CONFIG_WEB.hud.gizAlto;
const tacada = (lateral: number, vertical: number, giz: number) => ({ efeito: { lateral, vertical }, giz });

describe('alerta de espirro', () => {
  it('as duas frases são as pedidas', () => {
    expect(TEXTO_DO_ESPIRRO.giz).toBe('Espirrou! Faltou giz');
    expect(TEXTO_DO_ESPIRRO.efeito).toBe('Espirrou! Efeito demais');
  });

  it('só o evento de taco que espirrou dispara o alerta', () => {
    const e = (miscue: boolean): EventoTacada => ({ tipo: 'taco-bola', t: 0, bola: 0, velocidade: 2, miscue });
    expect(ehEspirro(e(true))).toBe(true);
    expect(ehEspirro(e(false))).toBe(false);
    expect(ehEspirro({ tipo: 'parou', t: 3 })).toBe(false);
    expect(ehEspirro({ tipo: 'bola-bola', t: 1, a: 0, b: 1, velocidade: 1 })).toBe(false);
  });

  it('giz baixo e efeito que um giz bom aguentaria: faltou giz', () => {
    expect(causaDoEspirro(tacada(0.4, 0, 0.1), fisica, alto)).toBe('giz');
    expect(textoDoEspirro(tacada(0, -0.45, 0.3), fisica, alto)).toBe('Espirrou! Faltou giz');
  });

  it('giz alto: o efeito é que passou do limite', () => {
    expect(causaDoEspirro(tacada(0.55, 0, 0.9), fisica, alto)).toBe('efeito');
    expect(causaDoEspirro(tacada(0.4, 0, alto), fisica, alto)).toBe('efeito');
    expect(textoDoEspirro(tacada(0.4, 0, 1), fisica, alto)).toBe('Espirrou! Efeito demais');
  });

  it('efeito além do que nem o giz inteiro segura é efeito demais, mesmo com o giz no fim', () => {
    expect(causaDoEspirro(tacada(0.7, 0, 0), fisica, alto)).toBe('efeito');
    expect(causaDoEspirro(tacada(0.4, 0.4, 0.2), fisica, alto)).toBe('efeito');
    expect(causaDoEspirro(tacada(0.5, 0, 0), fisica, alto)).toBe('giz');
  });

  it('o efeito conta como a física o mede: o corte é efeitoMaximo', () => {
    expect(causaDoEspirro(tacada(1, 1, 0), fisica, alto)).toBe('efeito');
  });

  it('com a física real: cada espirro de uma varredura de efeito e giz tem a causa que o limite diz', () => {
    const estado = { bolas: [bolaParada(ID_BOLAO, lugares(fisica.mesa).marcaSaida)] };
    let espirros = 0;
    let porGiz = 0;
    let porEfeito = 0;
    for (let semente = 1; semente <= 40; semente++) {
      for (const giz of [0, 0.25, 0.5, 0.75, 1]) {
        for (const lateral of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const p = { angulo: 0, velocidadeTaco: 1, efeito: { lateral, vertical: 0 }, elevacao: 0, giz };
          const r = simularTacada(estado, p, criarRng(semente), fisica);
          const evento = r.eventos.find((x) => x.tipo === 'taco-bola')!;
          if (!ehEspirro(evento)) continue;
          espirros++;
          const limite = fisica.limiteEfeitoSemGiz + (fisica.limiteEfeitoComGiz - fisica.limiteEfeitoSemGiz) * giz;
          // só espirra além do círculo seguro daquele giz...
          expect(lateral).toBeGreaterThan(limite);
          // ...e o alerta diz "faltou giz" só quando um giz inteiro aguentaria aquele efeito
          const causa = causaDoEspirro(p, fisica, alto);
          if (lateral <= fisica.limiteEfeitoComGiz && giz < alto) {
            expect(causa).toBe('giz');
            porGiz++;
          } else {
            expect(causa).toBe('efeito');
            porEfeito++;
          }
        }
      }
    }
    expect(espirros).toBeGreaterThan(50);
    expect(porGiz).toBeGreaterThan(0);
    expect(porEfeito).toBeGreaterThan(0);
  });
});
