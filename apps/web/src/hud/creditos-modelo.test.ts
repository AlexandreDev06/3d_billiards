import { describe, expect, it } from 'vitest';
import creditosMd from '../../../../docs/creditos.md?raw';
import { enderecoCurto, lerCreditos } from './creditos-modelo';

const TABELA = `# Créditos

| Asset | Autor | Fonte (URL) | Licença | Onde é usado |
| --- | --- | --- | --- | --- |
| \`a-1.ogg\` / \`a-1.mp3\` | Ana | https://exemplo.org/a/1 | CC0 1.0 | usado aqui |
| \`a-2.ogg\` / \`a-2.mp3\` | Ana | https://exemplo.org/a/1 | CC0 1.0 | usado ali |
| \`b-1.ogg\` | Beto | https://exemplo.org/b/7 | CC-BY 4.0 | outro |
`;

describe('lerCreditos', () => {
  it('lê a tabela, ignora cabeçalho e separador, e junta as linhas do mesmo autor e fonte', () => {
    expect(lerCreditos(TABELA)).toEqual([
      { autor: 'Ana', fonte: 'https://exemplo.org/a/1', licenca: 'CC0 1.0', arquivos: ['a-1', 'a-2'] },
      { autor: 'Beto', fonte: 'https://exemplo.org/b/7', licenca: 'CC-BY 4.0', arquivos: ['b-1'] },
    ]);
  });

  it('o mesmo autor em fontes diferentes são créditos diferentes', () => {
    const md = '| `x.ogg` | Ana | https://a.org/1 | CC0 | . |\n| `y.ogg` | Ana | https://a.org/2 | CC0 | . |';
    expect(lerCreditos(md).map((c) => c.fonte)).toEqual(['https://a.org/1', 'https://a.org/2']);
  });

  it('fonte que não é link https nunca vira endereço clicável', () => {
    for (const fonte of ['javascript:alert(1)', 'http://inseguro.org', 'sem link', 'https://com espaço.org']) {
      expect(lerCreditos(`| \`x.ogg\` | Ana | ${fonte} | CC0 | . |`)[0]!.fonte).toBeNull();
    }
  });

  it('linhas incompletas ou sem arquivo entre crases são ignoradas', () => {
    expect(lerCreditos('| `x.ogg` | Ana |\n| sem crases | Ana | https://a.org | CC0 | . |\ntexto solto')).toEqual([]);
  });

  it('o mesmo arquivo citado duas vezes (dois formatos em linhas separadas) aparece uma vez só', () => {
    const md = '| `x.ogg` | Ana | https://a.org/1 | CC0 | . |\n| `x.mp3` | Ana | https://a.org/1 | CC0 | . |';
    expect(lerCreditos(md)[0]!.arquivos).toEqual(['x']);
  });

  it('só linha de tabela conta: texto solto com barras e crases não vira crédito', () => {
    expect(lerCreditos('veja `x.ogg` | Ana | https://a.org/1 | CC0 | assim')).toEqual([]);
  });

  it('texto vazio dá lista vazia', () => {
    expect(lerCreditos('')).toEqual([]);
  });
});

describe('docs/creditos.md de verdade', () => {
  const creditos = lerCreditos(creditosMd);

  it('tem os 13 arquivos de som, todos CC0, com autor e link', () => {
    const arquivos = creditos.flatMap((c) => c.arquivos);
    expect(arquivos).toHaveLength(13);
    expect(new Set(arquivos).size).toBe(13);
    for (const c of creditos) {
      expect(c.autor).not.toBe('');
      expect(c.fonte, c.autor).not.toBeNull();
      expect(c.licenca).toMatch(/CC0/);
    }
  });

  it('cita cada autor uma vez por gravação (JNi2 e craigsmith reaproveitam a mesma)', () => {
    const jni2 = creditos.find((c) => c.autor === 'JNi2')!;
    expect(jni2.arquivos).toEqual(['bola-bola-1', 'bola-bola-3']);
    const craig = creditos.find((c) => c.autor === 'craigsmith')!;
    expect(craig.arquivos).toEqual(['taco-bola-2', 'bola-tabela-1', 'bola-tabela-2']);
  });
});

describe('enderecoCurto', () => {
  it('tira o protocolo, o www e a barra final', () => {
    expect(enderecoCurto('https://freesound.org/people/JNi2/sounds/404519/')).toBe('freesound.org/people/JNi2/sounds/404519');
    expect(enderecoCurto('https://www.exemplo.org/')).toBe('exemplo.org');
  });
});
