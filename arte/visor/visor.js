// Visor da mão: carrega mao.glb, toca as ações com AnimationMixer (fade entre poses) e tinge com a cor da equipe.
// Parâmetros de URL (para capturar quadros sem mexer na tela): ?pose=&de=&fade=&t=&lod=alta|baixa&cam=&cor=&tam=
// L29: `quadro=N` para a ação em `pose` no quadro N (30/s) depois do fade a partir de `de` (o `t` antigo soma 0,2 s por causa do P1); `respirar=1`
// soma o `gesto_respirar` (aditivo) por cima; `sem-adereco` esconde taco, plano de apoio e plano de contato; `raio=` e `alvo=x,y,z` (referencial da mão) trocam o enquadramento; `seguir=1` aponta a câmera para o
// centro da mão no instante parado (o soco e a mão mole saem do quadro com a câmera fixa).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const COR_EQUIPE = 0x3aa0ff;
const POSES = [
  'pose_repouso', 'pose_aberta', 'pose_apontar', 'pose_punho', 'pose_pinca',
  'pose_ponte_v', 'pose_ponte_laco', 'pose_ponte_elevada', 'pose_ponte_tabela', 'pose_ponte_colada', 'pose_ponte_canto',
  'gesto_joinha', 'gesto_soco_ar', 'gesto_tapinha', 'gesto_quase', 'gesto_palmas', 'gesto_tamborilar', 'gesto_mole',
];
const RESPIRAR = 'gesto_respirar'; // aditivo: não é um botão de pose, é uma camada (botão `respirar`)
// direções da câmera no referencial do Blender da mão (dedos +Y, dorso +Z); o glTF é Y para cima: (x, y, z) → (x, z, -y)
const CAMERAS = {
  cima: [0, -0.18, 1], boca: [0, -1, 0.25], tres_quartos: [-0.55, -0.85, 0.62], lado: [-1, -0.12, 0.18], baixo: [0, -0.2, -1], frente: [0, 1, 0.25],
  joinha: [0.7, 0.9, 0.35],
  // a câmera do jogo na ponte: atrás do taco e acima dele a 45° (a 28° o taco da ponte elevada passa na frente da lente)
  jogo_ponte: [0, -0.7, 0.72],
  jogo_punho: [-0.82, -0.17, 0.55],
};
const ALVOS = { // [raio, alvo no referencial da mão (x, y, z)]
  joinha: [0.135, [0, 0.075, 0.045]],
  jogo_ponte: [0.125, [-0.03, 0.075, -0.03]],
  jogo_punho: [0.15, [0, 0.0, -0.04]],
};
const bl = ([x, y, z]) => new THREE.Vector3(x, z, -y);

if (q.has('captura')) document.body.classList.add('captura');
const [LARG, ALT] = (q.get('tam') || `${innerWidth}x${innerHeight}`).split('x').map(Number);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(LARG, ALT);
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const cena = new THREE.Scene();
cena.background = new THREE.Color(0x030304);
const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
cena.environmentIntensity = 0.18;
const lampada = new THREE.SpotLight(0xffc780, 3.4, 3, Math.PI / 4.5, 0.6, 2);
lampada.position.set(0.03, 0.62, -0.05);
cena.add(lampada, lampada.target);
const contra = new THREE.DirectionalLight(0x8cb4ff, 0.9);
contra.position.set(0.5, 0.3, -0.5);
cena.add(contra);
const preench = new THREE.DirectionalLight(0xffdcb4, 0.7);
preench.position.set(-0.6, 0.25, 0.4);
cena.add(preench);

const camera = new THREE.PerspectiveCamera(30, LARG / ALT, 0.01, 5);
const alvo = new THREE.Vector3(0, 0.0, -0.06);
function enquadrar(nome, centro = null) {
  const d = bl(CAMERAS[nome] || CAMERAS.tres_quartos).normalize();
  let [raio, a] = ALVOS[nome] || [0.13, [0, 0.06, 0]];
  if (q.has('raio')) raio = Number(q.get('raio'));
  if (q.has('alvo')) a = q.get('alvo').split(',').map(Number); // no referencial da mão, em m
  alvo.copy(centro || bl(a));
  const fov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect));
  camera.position.copy(alvo).addScaledVector(d, (raio / Math.sin(fov / 2)) * 1.05);
  camera.lookAt(alvo);
}

let mixer, clipes = {}, malhas = {}, props = new THREE.Group(), acaoAtual = null;
cena.add(props);

/** Tinge o látex com a cor da equipe; o fundo do punho (`latex_fundo_glb`, base cinza) continua mais escuro. */
function tingir(cor) {
  for (const m of Object.values(malhas)) {
    m.material.userData.escuro ??= m.material.color.r;
    m.material.color.set(cor).multiplyScalar(m.material.userData.escuro);
  }
}

const PANO = 0x1b6a40, MADEIRA = 0x55311c; // pano e madeira mais escuros que o taco (0xb88a50), para o taco se separar do apoio

/** Plano de apoio (pano ou madeira) ou de contato (translúcido) como um quadrado de `lado` m centrado no ponto, com a normal dada. */
function plano(ponto, normal, cor, lado, translucido = false) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(lado, lado),
    new THREE.MeshStandardMaterial({ color: cor, roughness: 0.9, side: THREE.DoubleSide, transparent: translucido, opacity: translucido ? 0.28 : 1 }),
  );
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bl(normal).normalize());
  m.position.copy(bl(ponto));
  return m;
}

function adereco(info, nome) {
  props.clear();
  if (q.has('sem-adereco')) return;
  const d = info && info[nome];
  if (!d) return;
  if (d.tipo === 'taco') {
    const u = bl(d.direcao_cabo_para_ponta).normalize(), P = bl(d.ponto_m), s = d.ponta_a_ponto_m, c = d.comprimento_m;
    const raio = (t) => d.raio_ponta_m + (d.raio_cabo_m - d.raio_ponta_m) * Math.min(Math.max(s - t, 0), c) / c;
    // pose de contato (punho): 25 cm de cada lado do ponto; ponte (com apoio): da ponta para trás, 90 cm
    const t0 = d.apoio ? s - 0.9 : -0.25, t1 = d.apoio ? s : 0.25;
    const g = new THREE.CylinderGeometry(raio(t1), raio(t0), t1 - t0, 40, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xb88a50, roughness: 0.55 }));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
    m.position.copy(P).addScaledVector(u, (t0 + t1) / 2);
    props.add(m);
    if (d.apoio) props.add(plano(d.apoio.ponto_m, d.apoio.normal, d.apoio.tipo === 'madeira' ? MADEIRA : PANO, 1.6));
  } else if (d.tipo === 'contato') {
    props.add(plano(d.plano.ponto_m, d.plano.normal, 0xd9d2c4, 0.16, true));
  } else {
    const a = d.aresta_m, m = new THREE.Mesh(new THREE.BoxGeometry(a, a, a), new THREE.MeshStandardMaterial({ color: 0x1f3fb0, roughness: 0.9 }));
    const n = bl(d.eixo_n).normalize(), e1 = bl(d.eixo_e1).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(n, e1, e2));
    m.position.copy(bl(d.centro_m));
    props.add(m);
  }
}

let taco = null, camadaRespirar = null;

/** Liga/desliga o `gesto_respirar` como camada aditiva (o quadro 0 é a referência; só a diferença soma) por cima do que estiver tocando. */
function respirar(ligar) {
  if (!clipes[RESPIRAR]) return;
  camadaRespirar ??= (() => {
    const a = mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(clipes[RESPIRAR].clone(), 0));
    a.blendMode = THREE.AdditiveAnimationBlendMode;
    a.setLoop(THREE.LoopRepeat, Infinity);
    return a;
  })();
  if (ligar) camadaRespirar.reset().play(); else camadaRespirar.stop();
  document.querySelector('#painel button[data-camada=respirar]')?.classList.toggle('ativo', ligar);
}

function tocar(nome, fade = 0.35) {
  const clip = clipes[nome];
  if (!clip) return null;
  const nova = mixer.clipAction(clip);
  nova.reset().setLoop(THREE.LoopOnce, 1);
  nova.clampWhenFinished = true;
  if (acaoAtual && acaoAtual !== nova) nova.crossFadeFrom(acaoAtual, fade, false);
  nova.play();
  acaoAtual = nova;
  document.querySelectorAll('#painel button').forEach((b) => b.classList.toggle('ativo', b.dataset.pose === nome));
  adereco(taco, nome);
  return nova;
}

new GLTFLoader().load('/arte/personagens/exportados/mao.glb', async (gltf) => {
  taco = await fetch('/arte/personagens/exportados/mao-taco.json').then((r) => r.json()).catch(() => null);
  const mao = gltf.scene;
  cena.add(mao);
  mao.traverse((o) => { if (o.isSkinnedMesh) { malhas[o.name] = o; o.frustumCulled = false; } });
  const lod = q.get('lod') || 'alta';
  for (const [n, m] of Object.entries(malhas)) m.visible = lod === 'ambas' || n.startsWith('mao_' + lod);
  tingir(Number('0x' + (q.get('cor') || COR_EQUIPE.toString(16))));
  for (const c of gltf.animations) clipes[c.name] = c;
  mixer = new THREE.AnimationMixer(mao);

  const painel = document.getElementById('painel');
  for (const n of POSES) {
    const b = Object.assign(document.createElement('button'), { textContent: n.replace(/^(pose|gesto)_/, '') });
    b.dataset.pose = n;
    b.onclick = () => tocar(n);
    painel.appendChild(b);
  }
  const br = Object.assign(document.createElement('button'), { textContent: 'respirar (aditivo)' });
  br.dataset.camada = 'respirar';
  br.onclick = () => respirar(!br.classList.contains('ativo'));
  painel.appendChild(br);
  enquadrar(q.get('cam') || 'tres_quartos');

  // captura determinística: de→pose com fade, parado no instante t (s)
  if (q.has('pose') && q.has('quadro')) {
    const fade = Number(q.get('fade') || 0.2);
    tocar(q.get('de') || 'pose_repouso', 0);
    tocar(q.get('pose'), fade);
    if (q.has('respirar')) respirar(true);
    mixer.setTime(Number(q.get('quadro')) / 30);
    if (q.has('seguir')) {
      cena.updateMatrixWorld(true);
      const caixa = new THREE.Box3();
      for (const m of Object.values(malhas)) if (m.visible) { m.skeleton.update(); caixa.union(new THREE.Box3().setFromObject(m, true)); }
      enquadrar(q.get('cam') || 'tres_quartos', caixa.getCenter(new THREE.Vector3()));
    }
  } else if (q.has('pose')) {
    const t = Number(q.get('t') || 0), fade = Number(q.get('fade') || 0.35);
    if (q.has('de')) { tocar(q.get('de'), 0); mixer.setTime(0.2); }
    tocar(q.get('pose'), fade);
    mixer.setTime(q.has('de') ? 0.2 + t : t);
    if (!q.has('de')) mixer.setTime(t);
  } else tocar('pose_repouso', 0);
  renderer.setAnimationLoop(() => {
    if (!q.has('pose')) mixer.update(clock.getDelta());
    renderer.render(cena, camera);
    window.pronto = true;
  });
});
const clock = new THREE.Clock();
addEventListener('resize', () => {
  if (q.has('tam')) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
