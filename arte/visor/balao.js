// Visor do balão: carrega balao.glb, toca as ações com AnimationMixer, troca as caras (morph targets), pisca e mira os olhos.
// Parâmetros de URL (captura determinística): ?acao=&t=&cara=nome[:peso],...&piscar=0..1&olhar=x,y,z (m, mundo)&lod=alta|baixa&cam=rosto|rosto34|corpo|lado|jogo&dist=m&alvoy=m&cor=rrggbb&yaw=&tam=WxH&captura
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const COR_EQUIPE = 0x3aa0ff;
const ACOES = ['balao_parado', 'balao_inclinar', 'balao_pulinho', 'balao_susto', 'balao_estufar', 'balao_murchar'];
const CARAS = ['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste'];
const REPETE = { balao_parado: [0, 78], balao_inclinar: [24, 84], balao_estufar: [27, 75], balao_murchar: [48, 84] };
const FPS = 30;
const PAR = { balao_parado: 'cara_neutro', balao_inclinar: 'cara_neutro', balao_pulinho: 'cara_sorriso', balao_susto: 'cara_susto', balao_estufar: 'cara_sorriso', balao_murchar: 'cara_triste' };

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
const feltro = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: 0x0a5a18, roughness: 0.9 }));
feltro.rotation.x = -Math.PI / 2;
feltro.position.y = -0.16;
feltro.visible = false;
cena.add(feltro);

// vistas: [alvo em metros (glTF), distância, direção de onde a câmera olha, lente (mm, sensor 36)]
const VISTAS = {
  rosto: [[0, 0.009, 0.045], 0.22, [0, 0.03, 1], 70],
  rosto34: [[0, 0.009, 0.04], 0.22, [0.55, 0.1, 1], 70],
  corpo: [[0, -0.022, 0], 0.54, [0, 0.04, 1], 70],
  lado: [[0, -0.022, 0], 0.54, [1, 0.04, 0.05], 70],
  jogo: [[0, 0.0, 0], 1.3, [0, 0.38, 1], 38],
};
function enquadrar(nome) {
  const [alvo, dist0, dir, lente] = VISTAS[nome] || VISTAS.corpo;
  const dist = q.has('dist') ? Number(q.get('dist')) : dist0;
  if (q.has('alvoy')) alvo[1] = Number(q.get('alvoy'));
  camera.fov = 2 * Math.atan(18 / lente) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  const d = new THREE.Vector3(...dir).normalize();
  camera.position.set(...alvo).addScaledVector(d, dist);
  camera.lookAt(...alvo);
  feltro.visible = nome === 'jogo';
}

let mixer, clipes = {}, malhas = [], balao, acaoAtual = null, nomeAcao = null;
const olhos = {};
const influencias = { piscar: 0 };
let alvoOlhar = null;

function tingir(cor) {
  for (const m of malhas) {
    if (m.material.name !== 'latex_glb') continue;
    m.material.color.set(cor);
  }
}

function pesos(nome, v) {
  for (const m of malhas) {
    const i = m.morphTargetDictionary?.[nome];
    if (i !== undefined) m.morphTargetInfluences[i] = v;
  }
}

function cara(nome) {
  for (const c of CARAS) pesos(c, c === nome ? 1 : 0);
  influencias.cara = nome;
}

function tocar(nome, fade = 0.3) {
  const clip = clipes[nome];
  if (!clip) return null;
  const nova = mixer.clipAction(clip);
  nova.reset();
  if (REPETE[nome] && REPETE[nome][0] === 0) nova.setLoop(THREE.LoopRepeat, Infinity);
  else { nova.setLoop(THREE.LoopOnce, 1); nova.clampWhenFinished = true; }
  if (acaoAtual && acaoAtual !== nova) nova.crossFadeFrom(acaoAtual, fade, false);
  nova.play();
  acaoAtual = nova;
  nomeAcao = nome;
  document.querySelectorAll('#painel button').forEach((b) => b.classList.toggle('ativo', b.dataset.acao === nome));
  return nova;
}

const V = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
/** Gira os dois olhos para o ponto (mundo, m): a receita de balao-meta.json, com o limite de 30 graus. */
function olharPara(ponto, limiteGraus = 30) {
  for (const o of Object.values(olhos)) {
    o.pai.getWorldQuaternion(Q);
    const paiInv = Q.clone().invert();
    o.osso.getWorldPosition(V);
    const dir = ponto.clone().sub(V).normalize().applyQuaternion(paiInv);
    const q2 = new THREE.Quaternion().setFromUnitVectors(o.gazeRepouso, dir);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q2.w)));
    const lim = (limiteGraus * Math.PI) / 180;
    if (ang > lim) q2.slerp(new THREE.Quaternion(), 1 - lim / ang);
    o.osso.quaternion.copy(q2).multiply(o.repouso);
  }
}

new GLTFLoader().load('/arte/personagens/exportados/balao.glb', async (gltf) => {
  const meta = await fetch('/arte/personagens/exportados/balao-meta.json').then((r) => r.json());
  balao = gltf.scene;
  cena.add(balao);
  balao.updateMatrixWorld(true);
  balao.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; malhas.push(o); } });
  const lod = q.get('lod') || 'alta';
  for (const m of malhas) m.visible = m.name.startsWith('balao_' + lod);
  malhas = malhas.filter((m) => m.visible);
  tingir(Number('0x' + (q.get('cor') || COR_EQUIPE.toString(16))));
  for (const [nome, o] of Object.entries(meta.olhos)) {
    const osso = balao.getObjectByName(nome);
    const pai = osso.parent;
    const gaze = new THREE.Vector3(...o.eixo_do_olhar_no_repouso);
    pai.getWorldQuaternion(Q);
    olhos[nome] = { osso, pai, repouso: osso.quaternion.clone(), gazeRepouso: gaze.applyQuaternion(Q.invert()).normalize() };
  }
  for (const c of gltf.animations) clipes[c.name] = c;
  mixer = new THREE.AnimationMixer(balao);
  const yaw = Number(q.get('yaw') || 0);
  balao.rotation.y = (yaw * Math.PI) / 180;

  const painel = document.getElementById('painel');
  const botao = (rotulo, fn, dado) => { const b = Object.assign(document.createElement('button'), { textContent: rotulo, onclick: fn }); if (dado) b.dataset.acao = dado; painel.appendChild(b); return b; };
  for (const n of ACOES) botao(n.replace('balao_', ''), () => { tocar(n); cara(PAR[n]); }, n);
  for (const n of CARAS) botao(n.replace('cara_', ''), () => cara(n));
  botao('piscar', () => { inicioPisca = performance.now(); });
  enquadrar(q.get('cam') || 'corpo');

  // cara: ?cara=cara_sorriso ou cara_sorriso:0.5,cara_susto:0.5
  cara(null);
  for (const par of (q.get('cara') || (q.has('acao') ? PAR[q.get('acao')] : 'cara_neutro')).split(',')) {
    const [n, v] = par.split(':');
    pesos(n, v === undefined ? 1 : Number(v));
  }
  if (q.has('piscar')) pesos('piscar', Number(q.get('piscar')));

  if (q.has('acao')) {
    tocar(q.get('acao'), 0);
    mixer.setTime(Number(q.get('t') || 0));
  } else tocar('balao_parado', 0);
  if (q.has('olhar')) alvoOlhar = new THREE.Vector3(...q.get('olhar').split(',').map(Number));
  else if (!q.has('captura')) {
    // o olhar segue o ponteiro (num plano a 0,5 m na frente do balão)
    addEventListener('pointermove', (e) => { alvoOlhar = new THREE.Vector3(((e.clientX / innerWidth) - 0.5) * 0.7, (0.5 - e.clientY / innerHeight) * 0.5 + 0.02, 0.5); });
  }
  renderer.setAnimationLoop(() => {
    if (!q.has('acao')) mixer.update(clock.getDelta());
    if (alvoOlhar) { balao.updateMatrixWorld(true); olharPara(alvoOlhar); }
    // pisca sozinho de tempos em tempos (fora da captura); o botão `piscar` dispara na hora
    const agora = performance.now();
    if (!q.has('captura') && !inicioPisca && agora > proximoPisca) inicioPisca = agora;
    if (inicioPisca) {
      const t = (agora - inicioPisca) / 140;
      pesos('piscar', t < 1 ? t : t < 2 ? 2 - t : 0);
      if (t >= 2) { inicioPisca = 0; proximoPisca = agora + 2500 + Math.random() * 3000; }
    }
    renderer.render(cena, camera);
    window.pronto = true;
  });
});
let inicioPisca = 0, proximoPisca = performance.now() + 2000;
const clock = new THREE.Clock();
addEventListener('resize', () => {
  if (q.has('tam')) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
