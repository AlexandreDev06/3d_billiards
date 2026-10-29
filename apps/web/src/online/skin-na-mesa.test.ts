import { SKIN_PADRAO, type SkinTaco } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { bolasDoLugar, lugarDoTaco, sementeDoLugar, skinDoLugar } from './skin-na-mesa';

const sala = (...skins: (SkinTaco | undefined)[]) => ({ lugares: skins.map((skin) => ({ skin })) });

describe('skinDoLugar', () => {
  it('cada lugar mostra a skin que a sala disse ser dele', () => {
    const estado = sala('ebano', 'neon', undefined);
    expect(skinDoLugar(estado, 0)).toBe('ebano');
    expect(skinDoLugar(estado, 1)).toBe('neon');
  });

  it('sem sala, sem lugar, lugar fora da sala ou skin ausente: a clássica', () => {
    expect(skinDoLugar(null, 0)).toBe(SKIN_PADRAO);
    expect(skinDoLugar(sala('ouro'), null)).toBe(SKIN_PADRAO);
    expect(skinDoLugar(sala('ouro'), 5)).toBe(SKIN_PADRAO);
    expect(skinDoLugar(sala(undefined), 0)).toBe(SKIN_PADRAO);
  });

  it('uma skin que o catálogo não tem (sala mais nova) cai na clássica em vez de quebrar', () => {
    const estado = { lugares: [{ skin: 'platina' as unknown as SkinTaco }] };
    expect(skinDoLugar(estado, 0)).toBe(SKIN_PADRAO);
  });
});

const com = (...lugares: { semente?: number | null; bolas?: number | null }[]) => ({ lugares });

describe('sementeDoLugar', () => {
  it('a semente que a sala mandou para o lugar, de 0 a 999', () => {
    expect(sementeDoLugar(com({ semente: 347 }, { semente: 0 }, { semente: 999 }), 0)).toBe(347);
    expect(sementeDoLugar(com({ semente: 347 }, { semente: 0 }, { semente: 999 }), 1)).toBe(0);
    expect(sementeDoLugar(com({ semente: 347 }, { semente: 0 }, { semente: 999 }), 2)).toBe(999);
  });

  it('sem sala, sem lugar, vago, sem carteira ou com número que não vale: nenhuma (o desenho de fábrica)', () => {
    expect(sementeDoLugar(null, 0)).toBeNull();
    expect(sementeDoLugar(com({ semente: 5 }), null)).toBeNull();
    expect(sementeDoLugar(com({ semente: 5 }), 3)).toBeNull();
    expect(sementeDoLugar(com({ semente: null }, {}), 0)).toBeNull();
    expect(sementeDoLugar(com({}), 0)).toBeNull();
    for (const ruim of [-1, 1000, 3.5, Number.NaN]) expect(sementeDoLugar(com({ semente: ruim }), 0), String(ruim)).toBeNull();
  });
});

describe('bolasDoLugar', () => {
  it('o contador de bolas do taco de quem está no lugar, de 0 para cima', () => {
    expect(bolasDoLugar(com({ bolas: 0 }, { bolas: 42 }), 0)).toBe(0);
    expect(bolasDoLugar(com({ bolas: 0 }, { bolas: 42 }), 1)).toBe(42);
  });

  it('sem número válido, o taco não mostra a placa', () => {
    expect(bolasDoLugar(null, 0)).toBeNull();
    expect(bolasDoLugar(com({ bolas: 5 }), null)).toBeNull();
    expect(bolasDoLugar(com({ bolas: 5 }), 2)).toBeNull();
    expect(bolasDoLugar(com({}, { bolas: null }), 0)).toBeNull();
    for (const ruim of [-1, 2.5, Number.NaN]) expect(bolasDoLugar(com({ bolas: ruim }), 0), String(ruim)).toBeNull();
  });
});

describe('lugarDoTaco', () => {
  it('na minha vez (ou enquanto minha tacada toca) o taco é o meu', () => {
    expect(lugarDoTaco({ meuTaco: true, meuLugar: 2, lugarDaVez: 0 })).toBe(2);
  });

  it('nas outras o taco é o de quem tem a vez', () => {
    expect(lugarDoTaco({ meuTaco: false, meuLugar: 2, lugarDaVez: 0 })).toBe(0);
  });

  it('espectador (sem lugar) vê o de quem joga; sem vez, não há de quem', () => {
    expect(lugarDoTaco({ meuTaco: false, meuLugar: null, lugarDaVez: 1 })).toBe(1);
    expect(lugarDoTaco({ meuTaco: false, meuLugar: 0, lugarDaVez: null })).toBeNull();
  });
});
