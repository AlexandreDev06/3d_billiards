/** As pontes que o artista fez (`pose_ponte_*` no `mao.glb`): o V do pano, o laço, a elevada, a da tabela, a colada e a do canto. */
export const PONTES = ['v', 'laco', 'elevada', 'tabela', 'colada', 'canto'] as const;

export type NomeDaPonte = (typeof PONTES)[number];

/** O nome da pose (e do contato do taco) da ponte no arquivo da mão, sem o prefixo `pose_`. */
export function poseDaPonteNomeada(ponte: NomeDaPonte): string {
  return `ponte_${ponte}`;
}
