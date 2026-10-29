import type { Quadro } from '@sinuca/personagens';
import type { BaseDoRosto, NivelDeDetalhe } from '@sinuca/personagens/three';
import { Group, type Material, type Texture } from 'three';
import type { AparenciaDoBalao } from '@sinuca/protocolo';
import type { ConfigBaloes } from '../config';
import { BaloesProcedurais, type BaloesEmCena, type EstadoDoBalao } from './balao';
import { BaloesDoArtista } from './balao-do-artista';
import type { CarregadorDeChapeus } from './chapeus';

/**
 * Os balões da cena. Nascem procedurais (`BaloesProcedurais`, na hora, sem esperar arquivo); quando o `.glb` do artista chega
 * (`usar`) passam a ser os dele (`BaloesDoArtista`) e o procedural fica escondido. Se o arquivo não chegar, o jogo segue com o procedural.
 */
export class BaloesDaCena implements BaloesEmCena {
  readonly grupo = new Group();
  private readonly procedurais: BaloesProcedurais;
  private artista: BaloesDoArtista | null = null;

  constructor(
    private readonly cfg: ConfigBaloes,
    lados: number,
    atlas: Texture,
    quantos = 4,
  ) {
    this.procedurais = new BaloesProcedurais(cfg, lados, atlas, quantos);
    this.grupo.name = 'baloes';
    this.grupo.add(this.procedurais.grupo);
  }

  /**
   * O arquivo do artista chegou: daqui em diante os balões são os dele. `chapeus` é o carregador do arquivo dos chapéus (só baixa se
   * alguém usa chapéu) e `aoGanharMalha` avisa que um balão ganhou um chapéu (o jogo refaz as variantes de qualidade).
   */
  usar(base: BaseDoRosto, nivel: NivelDeDetalhe, sorteio: () => number, chapeus: CarregadorDeChapeus | null = null, aoGanharMalha: () => void = () => undefined): void {
    this.artista?.descartar();
    this.artista?.grupo.removeFromParent();
    this.artista = new BaloesDoArtista(this.cfg, base, nivel, sorteio, this.procedurais.quantos, chapeus, aoGanharMalha);
    this.grupo.add(this.artista.grupo);
    this.procedurais.esconderTodos();
  }

  /** Os balões de agora são os do arquivo do artista (e não os procedurais de reserva). */
  get comArquivo(): boolean {
    return this.artista !== null;
  }

  private get atual(): BaloesEmCena {
    return this.artista ?? this.procedurais;
  }

  get quantos(): number {
    return this.procedurais.quantos;
  }

  /** O balão `i` veste a aparência pedida (só os balões do artista se vestem; o procedural ignora). */
  definirAparencia(i: number, aparencia: AparenciaDoBalao): void {
    this.artista?.definirAparencia(i, aparencia);
  }

  /** O nível de detalhe do balão do artista (malha alta ou baixa). */
  definirNivel(nivel: NivelDeDetalhe): void {
    this.artista?.definirNivel(nivel);
  }

  /** Os lados do balão procedural. */
  definirLados(lados: number): void {
    this.procedurais.definirLados(lados);
  }

  mostrar(i: number, e: EstadoDoBalao): void {
    this.atual.mostrar(i, e);
  }

  esconder(i: number): void {
    this.procedurais.esconder(i);
    this.artista?.esconder(i);
  }

  esconderTodos(): void {
    this.procedurais.esconderTodos();
    this.artista?.esconderTodos();
  }

  visivel(i: number): boolean {
    return this.atual.visivel(i);
  }

  reiniciar(): void {
    this.atual.reiniciar();
  }

  /** O que o balão do artista `i` faz agora; `null` com o procedural ou se o balão `i` não existe. */
  diagnostico(i: number): ReturnType<BaloesDoArtista['diagnostico']> | null {
    if (this.artista === null || !Number.isInteger(i) || i < 0 || i >= this.artista.quantos) return null;
    return this.artista.diagnostico(i);
  }

  /** O ponto de ancoragem `nome` do balão `i`; `false` com o procedural (ele não tem mãos) ou se o balão `i` não existe. */
  ancora(i: number, nome: string, saida: Quadro): boolean {
    if (this.artista === null || !Number.isInteger(i) || i < 0 || i >= this.artista.quantos) return false;
    this.artista.ancora(i, nome, saida);
    return true;
  }

  materiais(): Material[] {
    return [...this.procedurais.materiais(), ...(this.artista?.materiais() ?? [])];
  }

  descartar(): void {
    this.procedurais.descartar();
    this.artista?.descartar();
  }
}
