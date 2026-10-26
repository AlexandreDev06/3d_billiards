import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, medidasDaBola, type EstadoMesa, type IdBola } from '@sinuca/fisica';
import { primeiraBolaNaLinha } from './primeira-bola';

const raioBolao = medidasDaBola(ID_BOLAO, CONFIG_FISICA_PADRAO).raio;
const raioNumerada = medidasDaBola(5, CONFIG_FISICA_PADRAO).raio;
/** Distância entre centros em que o bolão encosta numa numerada. */
const CONTATO = raioBolao + raioNumerada;

function mesaCom(bolao: { x: number; z: number } | null, ...outras: { id: IdBola; x: number; z: number; naMesa?: boolean }[]): EstadoMesa {
  const bolas = outras.map((o) => ({ ...bolaParada(o.id, { x: o.x, z: o.z }), naMesa: o.naMesa ?? true }));
  return { bolas: bolao ? [bolaParada(ID_BOLAO, bolao), ...bolas] : bolas };
}

describe('primeiraBolaNaLinha: a primeira numerada na reta da mira', () => {
  it('uma bola em cheio na linha é a primeira', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.4, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(5);
  });

  it('o ângulo segue a convenção da tacada: 0 = +X, π/2 = +Z, π = −X, −π/2 = −Z', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 2, x: 0.5, z: 0 }, { id: 3, x: 0, z: 0.5 }, { id: 4, x: -0.5, z: 0 }, { id: 6, x: 0, z: -0.5 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(2);
    expect(primeiraBolaNaLinha(mesa, Math.PI / 2)).toBe(3);
    expect(primeiraBolaNaLinha(mesa, Math.PI)).toBe(4);
    expect(primeiraBolaNaLinha(mesa, -Math.PI / 2)).toBe(6);
  });

  it('com duas bolas na linha, vale a mais perto, qualquer que seja a ordem na mesa', () => {
    const longe = { id: 9, x: 0.8, z: 0 };
    const perto = { id: 3, x: 0.3, z: 0 };
    expect(primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, longe, perto), 0)).toBe(3);
    expect(primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, perto, longe), 0)).toBe(3);
  });

  it('a bola de trás, escondida pela da frente, não conta', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 4, x: 0.5, z: 0 }, { id: 7, x: 0.5 + 2 * raioNumerada, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(4);
  });

  it('bola atrás do bolão (a mira aponta para o outro lado) não conta', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 5, x: -0.4, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBeNull();
  });

  it('a bola de raspão conta: o centro dela a menos que a soma dos raios da reta', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z: CONTATO - 0.0005 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(5);
  });

  it('a bola que a esfera varrida nem encosta não conta (centro um pouco além da soma dos raios)', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z: CONTATO + 0.0005 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBeNull();
  });

  it('a raspão de um lado ou do outro vale igual', () => {
    const lado = (z: number) => primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z }), 0);
    expect(lado(CONTATO - 0.001)).toBe(5);
    expect(lado(-(CONTATO - 0.001))).toBe(5);
    expect(lado(CONTATO + 0.001)).toBeNull();
    expect(lado(-(CONTATO + 0.001))).toBeNull();
  });

  it('o raspão também vale na diagonal', () => {
    const angulo = Math.PI / 5;
    const dx = Math.cos(angulo);
    const dz = Math.sin(angulo);
    const origem = { x: -0.3, z: -0.2 };
    // Centro a 0,4 m ao longo da reta e deslocado de lado por pouco menos que o contato.
    const lateral = CONTATO - 0.001;
    const mesa = mesaCom(origem, { id: 6, x: origem.x + 0.4 * dx - lateral * dz, z: origem.z + 0.4 * dz + lateral * dx });
    expect(primeiraBolaNaLinha(mesa, angulo)).toBe(6);
    const fora = mesaCom(origem, { id: 6, x: origem.x + 0.4 * dx - (CONTATO + 0.001) * dz, z: origem.z + 0.4 * dz + (CONTATO + 0.001) * dx });
    expect(primeiraBolaNaLinha(fora, angulo)).toBeNull();
  });

  it('nenhuma bola na linha: nada', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0, z: 0.3 }, { id: 8, x: 0.2, z: -0.4 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBeNull();
  });

  it('mesa só com o bolão: nada', () => {
    expect(primeiraBolaNaLinha(mesaCom({ x: 0, z: 0 }), 0.3)).toBeNull();
  });

  it('bola que já saiu da mesa (caiu na caçapa) é ignorada', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.2, z: 0, naMesa: false }, { id: 9, x: 0.6, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(9);
  });

  it('sem bolão na mesa não há de onde varrer', () => {
    expect(primeiraBolaNaLinha(mesaCom(null, { id: 5, x: 0.4, z: 0 }), 0)).toBeNull();
  });

  it('bolão encostado numa bola: acerta se aponta para ela e não se aponta para o outro lado', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 5, x: CONTATO, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(5);
    expect(primeiraBolaNaLinha(mesa, Math.PI)).toBeNull();
  });

  it('sem tabela: a bola além da borda da mesa, na linha, ainda é a primeira (a varredura é reta e ignora o resto)', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 5, x: 3, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(5);
  });

  it('empate exato de distância fica com o menor número (resultado estável)', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 9, x: 0.3, z: 0.02 }, { id: 3, x: 0.3, z: -0.02 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(3);
  });

  it('o ângulo pode vir fora de [−π, π] (a mira normaliza, mas a conta não depende disso)', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 2, x: 0.5, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 2 * Math.PI)).toBe(2);
    expect(primeiraBolaNaLinha(mesa, -2 * Math.PI)).toBe(2);
  });

  it('não muda a mesa nem o ângulo recebidos', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.4, z: 0 });
    const copia = JSON.stringify(mesa);
    primeiraBolaNaLinha(mesa, 0);
    expect(JSON.stringify(mesa)).toBe(copia);
  });

  it('a bola só tangente (encosta sem entrar, até 1 pm de folga) não conta; um pouco mais para dentro já conta', () => {
    expect(primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z: CONTATO }), 0)).toBeNull();
    expect(primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z: CONTATO - 1e-12 }), 0)).toBeNull();
    expect(primeiraBolaNaLinha(mesaCom({ x: -0.5, z: 0 }, { id: 5, x: 0.3, z: CONTATO - 1e-6 }), 0)).toBe(5);
  });

  it('com o centro à mesma distância, a mais de frente é a primeira (a de lado só encosta mais tarde)', () => {
    const mesa = mesaCom({ x: -0.5, z: 0 }, { id: 3, x: 0.5, z: 0.04 }, { id: 5, x: 0.5, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(5);
  });

  it('bolas já sobrepostas ao bolão, na direção da mira, empatam em zero: vale a de menor número, e não a mais enterrada', () => {
    const mesa = mesaCom({ x: 0, z: 0 }, { id: 9, x: CONTATO - 0.004, z: 0 }, { id: 3, x: CONTATO - 0.001, z: 0 });
    expect(primeiraBolaNaLinha(mesa, 0)).toBe(3);
  });

  it('bolão que já caiu (fora da mesa) não tem de onde varrer', () => {
    const mesa: EstadoMesa = { bolas: [{ ...bolaParada(ID_BOLAO, { x: -0.5, z: 0 }), naMesa: false }, bolaParada(5, { x: 0.4, z: 0 })] };
    expect(primeiraBolaNaLinha(mesa, 0)).toBeNull();
  });
});
