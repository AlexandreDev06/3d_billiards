import { SKIN_PADRAO, type SkinTaco } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { lugarDoTaco, skinDoLugar } from './skin-na-mesa';

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
