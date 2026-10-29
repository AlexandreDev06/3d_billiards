// Visor do balão (contrato v3): carrega balao.glb, toca as ações com AnimationMixer, troca as caras (morph targets), pisca (os dois olhos ou um só),
// mira os olhos e faz as pálpebras acompanharem o olhar vertical, tudo pela receita de balao-meta.json (a mesma que o jogo deve seguir).
// P8: aparência = chapéu (chapeus.glb preso à `ancora_chapeu`, com a regra de escala do meta), bigode (nó com escala 1), estilo de olho (forma `estilo_*` + materiais da vitrine) e cor do olho (tinge a íris).
// Parâmetros de URL (captura determinística): ?acao=&t=seg&cara=nome[:peso],...&piscar=0..1&esq=0..1&dir=0..1&olhar=x,y,z (m, mundo)&lod=alta|baixa&
// cam=rosto|rosto34|olho|corpo|lado|jogo|cabeca|cabeca34|icone&dist=m&alvoy=m&cor=rrggbb&yaw=&tam=WxH&glb=caminho&meta=caminho&rotulo=texto&palpebras=0&captura&
// chapeu=id&bigode=id&olhos=olho_kawaii&cor_olho=azul&chapeus=caminho&fundo=transparente&luz=estudio
// Para filmar: `window.passo({acao, t, cara, piscar, esq, dir, olhar:[x,y,z], rotulo, chapeu, bigode, olhos, cor_olho, fundo, luz})` ajusta o estado e desenha um quadro (devolve true).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const COR_EQUIPE = 0x3aa0ff;
const GLB = q.get('glb') || '/arte/personagens/exportados/balao.glb';
const META = q.get('meta') || GLB.replace(/balao\.glb$/, 'balao-meta.json');
const CHAPEUS = q.get('chapeus') || '/arte/personagens/exportados/chapeus.glb';
const FPS = 30;

if (q.has('captura')) document.body.classList.add('captura');
const [LARG, ALT] = (q.get('tam') || `${innerWidth}x${innerHeight}`).split('x').map(Number);
const TRANSPARENTE = q.get('fundo') === 'transparente';
if (TRANSPARENTE) document.documentElement.style.background = 'transparent';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: TRANSPARENTE });
if (TRANSPARENTE) { renderer.setClearColor(0x000000, 0); document.body.style.background = 'transparent'; }
renderer.setPixelRatio(1);
renderer.setSize(LARG, ALT);
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const cena = new THREE.Scene();
cena.background = TRANSPARENTE ? null : new THREE.Color(0x030304);
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

/** Luz de estúdio (para os ícones da loja): ambiente claro, sem o spot laranja do boteco. */
function luzDeEstudio(ligar) {
  cena.environmentIntensity = ligar ? 0.75 : 0.18;
  lampada.intensity = ligar ? 0 : 3.4;
  contra.intensity = ligar ? 0.6 : 0.9;
  preench.intensity = ligar ? 1.0 : 0.7;
  contra.color.set(ligar ? 0xffffff : 0x8cb4ff);
  preench.color.set(ligar ? 0xffffff : 0xffdcb4);
  if (ligar) { preench.position.set(-0.4, 0.5, 0.7); contra.position.set(0.5, 0.6, 0.6); }
  else { preench.position.set(-0.6, 0.25, 0.4); contra.position.set(0.5, 0.3, -0.5); }
}
if (q.get('luz') === 'estudio') luzDeEstudio(true);

const camera = new THREE.PerspectiveCamera(30, LARG / ALT, 0.01, 5);
const feltro = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: 0x0a5a18, roughness: 0.9 }));
feltro.rotation.x = -Math.PI / 2;
feltro.position.y = -0.16;
feltro.visible = false;
cena.add(feltro);

const rotuloEl = Object.assign(document.createElement('div'), { id: 'rotulo' });
document.body.appendChild(rotuloEl);

// vistas: [alvo em metros (glTF), distância, direção de onde a câmera olha, lente (mm, sensor 36)]
const VISTAS = {
  rosto: [[0, 0.009, 0.045], 0.22, [0, 0.03, 1], 70],
  rosto34: [[0, 0.009, 0.04], 0.22, [0.55, 0.1, 1], 70],
  olho: [[0.0165, 0.0145, 0.04], 0.085, [0, 0.0, 1], 70],
  corpo: [[0, -0.022, 0], 0.54, [0, 0.04, 1], 70],
  lado: [[0, -0.022, 0], 0.54, [1, 0.04, 0.05], 70],
  jogo: [[0, 0.0, 0], 1.3, [0, 0.38, 1], 38],
  cabeca: [[0, 0.04, 0.02], 0.34, [0, 0.12, 1], 60],
  cabeca34: [[0, 0.04, 0.02], 0.34, [0.62, 0.20, 1], 60],
  icone: [[0, 0.022, 0.015], 0.30, [0.38, 0.30, 1], 60],
};
let vistaAtual = 'corpo';
/** `sobre` (opcional: {dist, alvoy}) vale mais que a URL; é o que `window.passo` usa para enquadrar um pulo mais alto. */
function enquadrar(nome, sobre = {}) {
  vistaAtual = nome;
  const [alvo0, dist0, dir, lente] = VISTAS[nome] || VISTAS.corpo;
  const alvo = [...alvo0];
  const dist = sobre.dist !== undefined ? sobre.dist : q.has('dist') ? Number(q.get('dist')) : dist0;
  if (sobre.alvoy !== undefined) alvo[1] = sobre.alvoy;
  else if (q.has('alvoy')) alvo[1] = Number(q.get('alvoy'));
  camera.fov = 2 * Math.atan(18 / lente) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  const d = new THREE.Vector3(...dir).normalize();
  camera.position.set(...alvo).addScaledVector(d, dist);
  camera.lookAt(...alvo);
  feltro.visible = nome === 'jogo';
}

let meta, mixer, clipes = {}, malhas = [], todas = [], balao, acaoAtual = null, nomeAcao = null;
let morfaveis = [], matsDeEstilo = {}, ancora = null, chapeusGltf = null, chapeuAtual = null;
const aparencia = { chapeu: null, bigode: null, olhos: 'olho_normal', cor_olho: 'castanho' };
const olhos = {};
const estado = { cara: 'cara_neutro', piscar: 0, esq: 0, dir: 0, pitch: 0, estilo: null };
let alvoOlhar = null;
let CARAS = [], LIMITE = 30;

function tingir(cor) {
  for (const m of todas) if (m.material.name === 'latex_glb') m.material.color.set(cor);
}

function pesos(nome, v) {
  for (const m of morfaveis) {
    const i = m.morphTargetDictionary?.[nome];
    if (i !== undefined) m.morphTargetInfluences[i] = v;
  }
}

const aberturaDa = (c) => meta.abertura_da_cara?.[c] ?? 1;
const pesoNaPiscadinha = (c) => meta.piscar?.peso_da_cara_na_piscadinha?.[c] ?? 0.5;
const limitar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Aplica o rosto inteiro pela regra do meta: cara x (1 - piscar), piscar, piscadinha e pálpebras que seguem o olhar vertical. */
function aplicarRosto() {
  const { cara, piscar, esq, dir, pitch } = estado;
  const umOlho = Math.max(esq, dir);
  for (const c of CARAS) {
    let w = c === cara ? 1 - piscar : 0;
    if (c === cara && umOlho > 0) w *= 1 - umOlho * (1 - pesoNaPiscadinha(c));
    pesos(c, w);
  }
  pesos('piscar', piscar);
  pesos('piscar_esq', esq);
  pesos('piscar_dir', dir);
  for (const f of meta.formas.nomes.filter((n) => n.startsWith('estilo_'))) pesos(f, f === estado.estilo ? 1 : 0);
  const fechado = Math.max(piscar, umOlho);
  const ab = aberturaDa(cara) * (1 - fechado) * (q.get('palpebras') === '0' ? 0 : 1);
  pesos('palpebra_cima', limitar(pitch / LIMITE) * ab);
  pesos('palpebra_baixo', limitar(-pitch / LIMITE) * ab);
}

/** O tempo dentro do clipe: depois do fim, repete só o trecho de ciclo (se a ação tem). */
function tempoDaAcao(nome, t) {
  const a = meta.acoes[nome];
  const dur = a.quadros / FPS;
  if (!a.ciclo_quadros || t < dur) return Math.min(t, dur);
  const [c0, c1] = a.ciclo_quadros.map((f) => f / FPS);
  return c0 + ((t - c0) % (c1 - c0));
}

function tocar(nome, fade = 0.3) {
  const clip = clipes[nome];
  if (!clip) return null;
  const nova = mixer.clipAction(clip);
  nova.reset();
  nova.setLoop(THREE.LoopOnce, 1);
  nova.clampWhenFinished = true;
  if (acaoAtual && acaoAtual !== nova) {
    if (fade > 0) nova.crossFadeFrom(acaoAtual, fade, false);
    else acaoAtual.stop();          // sem fade: a anterior sai de uma vez (o fade de 0 s deixaria as duas somadas)
  }
  nova.play();
  acaoAtual = nova;
  nomeAcao = nome;
  document.querySelectorAll('#painel button').forEach((b) => b.classList.toggle('ativo', b.dataset.acao === nome));
  return nova;
}

const V = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
/** Gira os dois olhos para o ponto (mundo, m): a receita de balao-meta.json, com o limite de `olhar.limite_graus`. Devolve a altura do olhar em graus (+ para cima). */
function olharPara(ponto) {
  const lim = (LIMITE * Math.PI) / 180;
  let pitch = 0;
  for (const o of Object.values(olhos)) {
    o.pai.getWorldQuaternion(Q);
    const paiInv = Q.clone().invert();
    o.osso.getWorldPosition(V);
    const dir = ponto.clone().sub(V).normalize().applyQuaternion(paiInv);
    const q2 = new THREE.Quaternion().setFromUnitVectors(o.gazeRepouso, dir);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q2.w)));
    if (ang > lim) q2.slerp(new THREE.Quaternion(), 1 - lim / ang);
    o.osso.quaternion.copy(q2).multiply(o.repouso);
    const final = o.gazeRepouso.clone().applyQuaternion(q2).applyQuaternion(Q);
    pitch += (Math.asin(limitar(final.y, -1, 1)) * 180) / Math.PI / 2;
  }
  return pitch;
}

const NIVEL = () => (todas.find((mm) => mm.visible)?.name.startsWith('balao_baixa') ? 'baixa' : 'alta');

/** Mostra o bigode escolhido (escala 1) e esconde os outros (escala 0), no nível em uso. */
function aplicarBigode() {
  if (!meta.bigodes) return;                  // balao.glb de antes do contrato v3
  const lod = NIVEL();
  for (const id of meta.bigodes.ids) {
    for (const nivel of ['alta', 'baixa']) {
      const no = balao.getObjectByName(`${id}_${nivel}`);
      if (no) no.scale.setScalar(id === aparencia.bigode && nivel === lod ? 1 : 0);
    }
  }
}

/** Estilo de olho (forma + materiais) e cor (tinge a íris): a receita de `estilos_de_olho` e `cores_de_olho` do meta. */
function aplicarOlhos() {
  if (!meta.estilos_de_olho) return;          // balao.glb de antes do contrato v3
  const est = meta.estilos_de_olho.itens[aparencia.olhos];
  estado.estilo = est.forma;
  const cor = meta.cores_de_olho.cores[aparencia.cor_olho].cor;
  for (const mm of todas) {
    mm.userData.matOriginal ??= mm.material;
    const nome = mm.userData.matOriginal.name;
    if (nome === 'olho') mm.material = est.esclera.material === 'olho' ? mm.userData.matOriginal : matsDeEstilo[est.esclera.material];
    if (nome === 'iris') {
      const base = est.iris.material === 'iris' ? mm.userData.matOriginal : matsDeEstilo[est.iris.material];
      mm.material = base.userData.tingida ??= base.clone();
      mm.material.color.set(cor);
      mm.material.emissive.set(cor).multiplyScalar(0.30);
    }
  }
}

/** A regra de escala do meta: o chapéu herda a escala do osso, e o jogo a compensa por eixo (largura = média de x e z; altura = y). */
function regraDoChapeu() {
  if (!chapeuAtual || !ancora) return;
  ancora.updateWorldMatrix(true, false);
  const e = ancora.matrixWorld.elements;
  const S = [Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])];
  const r = meta.ancora_chapeu.escala_do_chapeu;
  const f = (v, g) => limitar(1 + g.segue * (v - 1), g.piso, g.teto);
  const larg = f((S[0] + S[2]) / 2, r.largura), alt = f(S[1], r.altura);
  chapeuAtual.scale.set(larg / S[0], alt / S[1], larg / S[2]);
}

function aplicarChapeu() {
  if (chapeuAtual) { chapeuAtual.parent?.remove(chapeuAtual); chapeuAtual = null; }
  if (!aparencia.chapeu || !chapeusGltf || !ancora) return;
  const no = chapeusGltf.scene.getObjectByName(`${aparencia.chapeu}_${NIVEL()}`);
  if (!no) { console.error('chapéu sem nó', aparencia.chapeu); return; }
  chapeuAtual = no.clone(true);
  chapeuAtual.position.set(0, 0, 0);
  chapeuAtual.quaternion.identity();
  ancora.add(chapeuAtual);
}

function aplicarAparencia(a = {}) {
  let mudouChapeu = false;
  for (const k of ['chapeu', 'bigode', 'olhos', 'cor_olho']) {
    if (a[k] !== undefined && a[k] !== aparencia[k]) { aparencia[k] = a[k] === 'nenhum' ? null : a[k]; if (k === 'chapeu') mudouChapeu = true; }
  }
  if (aparencia.olhos === null) aparencia.olhos = 'olho_normal';
  if (aparencia.cor_olho === null) aparencia.cor_olho = 'castanho';
  if (mudouChapeu || (chapeuAtual && chapeuAtual.name !== `${aparencia.chapeu}_${NIVEL()}`) || (!chapeuAtual && aparencia.chapeu)) aplicarChapeu();
  aplicarBigode();
  aplicarOlhos();
}

function desenhar() {
  if (alvoOlhar) { balao.updateMatrixWorld(true); estado.pitch = olharPara(alvoOlhar); }
  aplicarRosto();
  regraDoChapeu();
  renderer.render(cena, camera);
}

function parametrosDeCara(texto) {
  CARAS.forEach((c) => pesos(c, 0));
  const lista = texto.split(',').map((p) => p.split(':'));
  estado.cara = lista[0][0];
  // várias caras misturadas ficam por conta da URL: o resto entra direto
  for (const [n, v] of lista.slice(1)) pesos(n, Number(v));
}

Promise.all([new GLTFLoader().loadAsync(GLB), fetch(META).then((r) => r.json()), new GLTFLoader().loadAsync(CHAPEUS).catch(() => null)]).then(([gltf, m, chapeus]) => {
  chapeusGltf = chapeus;
  meta = m;
  CARAS = meta.caras || meta.formas.nomes.filter((n) => n.startsWith('cara_'));
  LIMITE = meta.olhar.limite_graus;
  balao = gltf.scene;
  cena.add(balao);
  balao.updateMatrixWorld(true);
  balao.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; malhas.push(o); } });
  const lod = q.get('lod') || 'alta';
  balao.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) morfaveis.push(o); });
  const vitrine = balao.getObjectByName('estilos_de_olho');
  vitrine?.traverse((o) => { if (o.isMesh) matsDeEstilo[o.material.name] = o.material; });
  ancora = balao.getObjectByName('ancora_chapeu');
  for (const mm of malhas) mm.visible = mm.name.startsWith('balao_' + lod);
  todas = malhas;
  malhas = malhas.filter((mm) => mm.visible);
  for (const mm of todas) mm.visible = mm.name.startsWith('balao_' + lod);
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
  balao.rotation.y = (Number(q.get('yaw') || 0) * Math.PI) / 180;

  const painel = document.getElementById('painel');
  const botao = (rotulo, fn, dado) => { const b = Object.assign(document.createElement('button'), { textContent: rotulo, onclick: fn }); if (dado) b.dataset.acao = dado; painel.appendChild(b); return b; };
  const ACOES = Object.keys(meta.acoes);
  for (const n of ACOES) botao(n.replace('balao_', ''), () => { tocar(n); estado.cara = meta.par_de_cara[n]; tAcao = 0; }, n);
  for (const n of CARAS) botao(n.replace('cara_', ''), () => { estado.cara = n; });
  botao('piscar', () => { inicioPisca = performance.now(); ladoPisca = 'piscar'; });
  botao('piscar esq', () => { inicioPisca = performance.now(); ladoPisca = 'esq'; });
  botao('piscar dir', () => { inicioPisca = performance.now(); ladoPisca = 'dir'; });
  enquadrar(q.get('cam') || 'corpo');
  aplicarAparencia({ chapeu: q.get('chapeu') || undefined, bigode: q.get('bigode') || undefined, olhos: q.get('olhos') || undefined, cor_olho: q.get('cor_olho') || undefined });

  // cara: ?cara=cara_sorriso (outras caras misturadas: cara_sorriso,cara_susto:0.5)
  parametrosDeCara(q.get('cara') || (q.has('acao') ? meta.par_de_cara[q.get('acao')] : 'cara_neutro'));
  estado.piscar = Number(q.get('piscar') || 0);
  estado.esq = Number(q.get('esq') || 0);
  estado.dir = Number(q.get('dir') || 0);

  if (q.has('olhar')) alvoOlhar = new THREE.Vector3(...q.get('olhar').split(',').map(Number));
  else if (!q.has('captura')) {
    // o olhar segue o ponteiro (num plano a 0,5 m na frente do balão)
    addEventListener('pointermove', (e) => { alvoOlhar = new THREE.Vector3(((e.clientX / innerWidth) - 0.5) * 0.7, (0.5 - e.clientY / innerHeight) * 0.5 + 0.02, 0.5); });
  }
  if (q.has('rotulo')) rotuloEl.textContent = q.get('rotulo');

  if (q.has('acao')) {
    tocar(q.get('acao'), 0);
    mixer.setTime(tempoDaAcao(q.get('acao'), Number(q.get('t') || 0)));
  } else tocar(ACOES.includes('balao_parado') ? 'balao_parado' : ACOES[0], 0);

  /** Um quadro determinístico (para filmar): zera o mixer, vai ao tempo `t` da ação e desenha. */
  window.passo = (e) => {
    window.congelado = true;       // o laço de tempo real para: daqui em diante o tempo é só o que `passo` manda
    if (e.cam || e.dist !== undefined || e.alvoy !== undefined) enquadrar(e.cam || vistaAtual, e);
    if (e.lod) { for (const mm of todas) mm.visible = mm.name.startsWith('balao_' + e.lod); malhas = todas.filter((mm) => mm.visible); }
    if (e.luz !== undefined) luzDeEstudio(e.luz === 'estudio');
    if (e.fundo !== undefined) cena.background = e.fundo === 'transparente' ? null : new THREE.Color(0x030304);
    aplicarAparencia({ chapeu: e.chapeu, bigode: e.bigode, olhos: e.olhos, cor_olho: e.cor_olho });
    if (e.yaw !== undefined) balao.rotation.y = (e.yaw * Math.PI) / 180;
    if (e.cor) tingir(Number('0x' + e.cor));
    const nome = e.acao || nomeAcao;
    if (nome !== nomeAcao || e.reiniciar) tocar(nome, 0);
    mixer.setTime(tempoDaAcao(nome, e.t || 0));
    if (e.cara) estado.cara = e.cara;
    estado.piscar = e.piscar || 0;
    estado.esq = e.esq || 0;
    estado.dir = e.dir || 0;
    alvoOlhar = e.olhar ? new THREE.Vector3(...e.olhar) : alvoOlhar;
    if (e.rotulo !== undefined) rotuloEl.textContent = e.rotulo;
    desenhar();
    return true;
  };

  let tAcao = 0;
  renderer.setAnimationLoop(() => {
    if (q.has('acao') || window.congelado) { desenhar(); window.pronto = true; return; }
    const dt = clock.getDelta();
    // o trecho que repete: antes de chegar ao fim, volta ao começo do ciclo (o clipe toca uma vez só)
    const a = meta.acoes[nomeAcao];
    if (a?.ciclo_quadros && acaoAtual) {
      const [c0, c1] = a.ciclo_quadros.map((f) => f / FPS);
      if (acaoAtual.time + dt >= a.quadros / FPS - 1e-4) acaoAtual.time -= c1 - c0;
    }
    mixer.update(dt);
    tAcao += dt;
    // pisca sozinho de tempos em tempos (fora da captura); os botões disparam na hora
    const agora = performance.now();
    if (!q.has('captura') && !inicioPisca && agora > proximoPisca) { inicioPisca = agora; ladoPisca = 'piscar'; }
    if (inicioPisca) {
      const t = (agora - inicioPisca) / 140;
      estado.piscar = estado.esq = estado.dir = 0;
      estado[ladoPisca] = t < 1 ? t : t < 2 ? 2 - t : 0;
      if (t >= 2) { inicioPisca = 0; proximoPisca = agora + 2500 + Math.random() * 3000; }
    }
    desenhar();
    window.pronto = true;
  });
});
let inicioPisca = 0, ladoPisca = 'piscar', proximoPisca = performance.now() + 2000;
const clock = new THREE.Clock();
addEventListener('resize', () => {
  if (q.has('tam')) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
