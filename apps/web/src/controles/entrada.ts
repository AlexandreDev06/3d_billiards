import type { CameraRig } from './camera';
import { teclaEmCampo } from './campo';
import type { PontoDeContato } from './efeito';
import type { GizDaVez } from './giz-jogadores';
import type { Mira } from './mira';
import { PassadaEncadeada } from './passada-encadeada';
import type { Tacada } from './tacada';

export interface DependenciasEntrada {
  readonly canvas: HTMLCanvasElement;
  readonly mira: Mira;
  readonly tacada: Tacada;
  readonly ponto: PontoDeContato;
  readonly giz: Pick<GizDaVez, 'passando' | 'passar' | 'atualizar'>;
  readonly camera: CameraRig;
  /**
   * Dá para mirar, mexer no efeito, passar o giz e armar a tacada agora? Online só na minha vez; no menu, nunca.
   * Orbitar, o zoom e a vista de cima valem sempre. Sem isto, sempre.
   */
  readonly podeJogar?: () => boolean;
  /**
   * A tacada foi dada: a ponta chegou na bola (empurrar) ou o botão foi solto com a barra puxada (linha). `velocidadeTaco` já
   * passou pela curva de força.
   */
  readonly aoTacar: (velocidadeTaco: number) => void;
  /** O mouse foi travado ou solto (Esc, alt-tab, ou `cancelarTacada`). */
  readonly aoMudarTravamento?: (travado: boolean) => void;
}

export interface Entrada {
  /** Teclas de efeito e giz, uma vez por quadro. */
  atualizar(dt: number): void;
  /** Cancela a tacada em curso (o Pointer Lock continua). */
  cancelarTacada(): void;
  /** Solta o mouse (tela de fim de partida, para poder clicar). */
  soltarMouse(): void;
  /** G segue apertada: a passada do giz em curso é seguida de outra (a mão do giz continua na ponta). */
  readonly encadeandoGiz: boolean;
  dispose(): void;
}

/**
 * Liga mouse, teclado e Pointer Lock aos controles. Só aqui existe DOM de entrada.
 * O mouse fica travado durante toda a mira e a tacada: o primeiro clique no
 * canvas pede o travamento (Esc solta); com ele, mover o mouse mira e o botão
 * esquerdo segurado arma a tacada.
 */
export function ligarEntrada(d: DependenciasEntrada): Entrada {
  const { canvas, mira, tacada, ponto, giz, camera } = d;
  const podeJogar = (): boolean => d.podeJogar?.() ?? true;
  const teclas = { w: false, a: false, s: false, d: false };
  /** G segurada: ao acabar uma passada do giz a próxima começa sozinha, até o giz ficar cheio. */
  const passadas = new PassadaEncadeada();

  const travado = (): boolean => document.pointerLockElement === canvas;
  const sairDoTravamento = (): void => {
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const cancelarTacada = (): void => {
    tacada.cancelar();
  };

  const aoPressionar = (e: PointerEvent): void => {
    if (e.button === 0) {
      if (!podeJogar()) return;
      if (!travado()) {
        // Este clique só pede o mouse; a tacada começa no seguinte.
        Promise.resolve(canvas.requestPointerLock()).catch(() => {});
        return;
      }
      if (giz.passando || !tacada.pressionar()) return;
      tacada.travou();
      camera.encerrarOrbita();
      camera.vista = 'tacada';
    } else if (e.button === 2 && (tacada.fase === 'ociosa' || tacada.fase === 'animando')) {
      camera.iniciarOrbita();
    }
  };

  const aoSoltar = (e: PointerEvent): void => {
    if (e.button === 0) {
      // Na linha de força soltar é dar a tacada (ou cancelar, se a barra está perto de zero); no empurrar, soltar cancela.
      const velocidade = tacada.soltar();
      if (velocidade !== null) d.aoTacar(velocidade);
    } else if (e.button === 2) camera.encerrarOrbita();
  };

  /** O sistema tomou o ponteiro (toque, alt-tab...): nada de tacada. */
  const aoCancelarPonteiro = (): void => {
    cancelarTacada();
    camera.encerrarOrbita();
  };

  const processarMovimento = (e: PointerEvent): void => {
    if (camera.orbitando) {
      camera.orbitar(e.movementX, e.movementY);
    } else if (tacada.fase === 'armada') {
      const velocidade = tacada.mover(e.movementY, e.timeStamp);
      if (velocidade !== null) d.aoTacar(velocidade);
    } else if (tacada.fase === 'ociosa' && !giz.passando && travado() && podeJogar()) {
      mira.girar(e.movementX, e.shiftKey);
    }
  };

  const aoMover = (e: PointerEvent): void => {
    // Os eventos agrupados trazem o tempo de cada deslocamento: a velocidade do taco depende disso.
    const agrupados = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (agrupados.length === 0) processarMovimento(e);
    else for (const evento of agrupados) processarMovimento(evento);
  };

  const aoMudarTravamento = (): void => {
    if (!travado()) tacada.cancelar();
    d.aoMudarTravamento?.(travado());
  };

  const aoPerderFoco = (): void => {
    cancelarTacada();
    camera.encerrarOrbita();
    teclas.w = teclas.a = teclas.s = teclas.d = false;
    passadas.soltou();
  };

  const aoRolar = (e: WheelEvent): void => {
    e.preventDefault();
    camera.zoomar(e.deltaY);
  };

  const aoApertarTecla = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey || teclaEmCampo(e.target)) return;
    switch (e.code) {
      case 'Tab':
        e.preventDefault();
        if (!e.repeat && tacada.fase !== 'armada') camera.alternarVista();
        break;
      case 'KeyG':
        if (!e.repeat && tacada.fase === 'ociosa' && podeJogar()) passadas.apertou(giz.passar());
        break;
      case 'KeyW':
        teclas.w = true;
        break;
      case 'KeyA':
        teclas.a = true;
        break;
      case 'KeyS':
        teclas.s = true;
        break;
      case 'KeyD':
        teclas.d = true;
        break;
    }
  };

  const aoSoltarTecla = (e: KeyboardEvent): void => {
    if (e.code === 'KeyW') teclas.w = false;
    else if (e.code === 'KeyA') teclas.a = false;
    else if (e.code === 'KeyS') teclas.s = false;
    else if (e.code === 'KeyD') teclas.d = false;
    else if (e.code === 'KeyG') passadas.soltou();
  };

  const semMenu = (e: Event): void => e.preventDefault();
  const aoMudarVisibilidade = (): void => {
    if (document.hidden) aoPerderFoco();
  };

  canvas.addEventListener('pointerdown', aoPressionar);
  canvas.addEventListener('wheel', aoRolar, { passive: false });
  canvas.addEventListener('contextmenu', semMenu);
  window.addEventListener('pointerup', aoSoltar);
  window.addEventListener('pointercancel', aoCancelarPonteiro);
  window.addEventListener('pointermove', aoMover);
  window.addEventListener('keydown', aoApertarTecla);
  window.addEventListener('keyup', aoSoltarTecla);
  window.addEventListener('blur', aoPerderFoco);
  document.addEventListener('pointerlockchange', aoMudarTravamento);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);

  return {
    atualizar(dt) {
      giz.atualizar(dt);
      passadas.quadro(giz, tacada.fase === 'ociosa' && podeJogar());
      if (tacada.fase !== 'animando' && podeJogar()) {
        ponto.mover(Number(teclas.d) - Number(teclas.a), Number(teclas.w) - Number(teclas.s), dt);
      }
    },
    cancelarTacada,
    get encadeandoGiz() {
      return passadas.encadeando;
    },
    soltarMouse() {
      cancelarTacada();
      sairDoTravamento();
    },
    dispose() {
      cancelarTacada();
      sairDoTravamento();
      canvas.removeEventListener('pointerdown', aoPressionar);
      canvas.removeEventListener('wheel', aoRolar);
      canvas.removeEventListener('contextmenu', semMenu);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoCancelarPonteiro);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('keydown', aoApertarTecla);
      window.removeEventListener('keyup', aoSoltarTecla);
      window.removeEventListener('blur', aoPerderFoco);
      document.removeEventListener('pointerlockchange', aoMudarTravamento);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    },
  };
}
