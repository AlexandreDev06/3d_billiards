// Visor do boteco (P4): carrega arte/boteco/exportados/boteco-<nivel>.glb, liga as luzes a partir dos marcadores `luz-*` e põe, só para a prova, uma mesa de referência
// com as medidas da física (MESA_BAR). A mesa NÃO está no .glb.
// Parâmetros: ?nivel=alto|medio|baixo & glb=/caminho/do.glb (outro arquivo, p. ex. arte/boteco/trabalho/<nivel>/ ou o `antes` do lote) & casco=leve (como o nível baixo do L44: casco em cor lisa, sem luz) & cam=jogo|menu1|menu2|menu3|cima|canto|fundo|livre (pos=x,y,z&alvo=x,y,z&fov=graus)|planta (ortográfica, sem o que passa de 1,9 m) & zona (contorno vermelho da folga de 1,6 m) & semlum & tam=1280x720 & captura (esconde o painel) & semmesa & semluzes & sombras=0|1 & t=segundos (gira a hélice)
// Sem janela: bash arte/ferramentas/captura_visor.sh boteco SAIDA.png "nivel=alto&cam=jogo" 1280 720  (servidor estático na porta 8731, nunca a 8001)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const avisos = [];
for (const nivel of ['warn', 'error']) { const o = console[nivel].bind(console); console[nivel] = (...a) => { avisos.push(`${nivel}: ${a.join(' ').slice(0, 200)}`); o(...a); }; }
const q = new URLSearchParams(location.search);
if (q.has('captura')) document.body.classList.add('captura');
const NIVEL = q.get('nivel') || 'alto';
const CAM = q.get('cam') || 'jogo';
const [LARG, ALT] = (q.get('tam') || `${innerWidth}x${innerHeight}`).split('x').map(Number);

// medidas da mesa (packages/fisica/src/medidas.ts, MESA_BAR) e do jogo (alturaDoPiso 0,8)
const MESA = { comprimento: 2.1, largura: 1.2, moldura: 0.08, alturaTabela: 0.034, larguraTabela: 0.04 };
const ALTURA_DO_PISO = 0.8;
const BOLA = 0.027;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(LARG, ALT);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(q.get('exp') || 1);
renderer.shadowMap.enabled = q.get('sombras') !== '0';
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const cena = new THREE.Scene();
cena.background = new THREE.Color(0x050407);
const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
cena.environmentIntensity = 0.12;
cena.add(new THREE.HemisphereLight(0x4a5070, 0x2a1a14, 0.5));

function mesaDeReferencia() {
  const g = new THREE.Group();
  g.name = 'mesa-de-referencia';
  const { comprimento: C, largura: W, moldura: M, alturaTabela: AT, larguraTabela: LT } = MESA;
  const pano = new THREE.Mesh(new THREE.BoxGeometry(C, 0.02, W), new THREE.MeshStandardMaterial({ color: 0x0a8a50, roughness: 0.95 }));
  pano.position.y = -0.01;
  g.add(pano);
  const tab = new THREE.MeshStandardMaterial({ color: 0x087544, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(C + 2 * LT, AT, LT), tab);
    a.position.set(0, AT / 2, s * (W / 2 + LT / 2));
    const b = new THREE.Mesh(new THREE.BoxGeometry(LT, AT, W), tab);
    b.position.set(s * (C / 2 + LT / 2), AT / 2, 0);
    g.add(a, b);
  }
  const mad = new THREE.MeshStandardMaterial({ color: 0x3a2314, roughness: 0.4 });
  const MA = AT + 0.012;
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(C + 2 * LT + 2 * M, MA, M), mad);
    a.position.set(0, MA / 2, s * (W / 2 + LT + M / 2));
    const b = new THREE.Mesh(new THREE.BoxGeometry(M, MA, W + 2 * LT), mad);
    b.position.set(s * (C / 2 + LT + M / 2), MA / 2, 0);
    g.add(a, b);
  }
  const saia = new THREE.Mesh(new THREE.BoxGeometry(C + 2 * LT + 0.1, 0.16, W + 2 * LT + 0.1), mad);
  saia.position.y = -0.1;
  g.add(saia);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, ALTURA_DO_PISO - 0.18, 0.13), mad);
    p.position.set(sx * (C / 2 - 0.05), -0.18 - (ALTURA_DO_PISO - 0.18) / 2, sz * (W / 2 - 0.05));
    g.add(p);
  }
  const esf = new THREE.SphereGeometry(BOLA, 20, 14);
  const cores = [0xf2d230, 0x2850c8, 0xd22a2a, 0x5a2a8c, 0xe2761c, 0x1a8a46, 0x8a2a2a, 0x151515, 0xf2d230, 0x2850c8, 0xd22a2a, 0x5a2a8c, 0xe2761c, 0x1a8a46, 0x8a2a2a];
  let i = 0;
  for (let fila = 0; fila < 5; fila++) for (let k = 0; k <= fila; k++) {
    const b = new THREE.Mesh(esf, new THREE.MeshStandardMaterial({ color: cores[i++ % cores.length], roughness: 0.15 }));
    b.position.set(0.5 + fila * BOLA * 1.74, BOLA, (k - fila / 2) * BOLA * 2.02);
    g.add(b);
  }
  const branca = new THREE.Mesh(esf, new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.15 }));
  branca.position.set(-0.5, BOLA, 0);
  g.add(branca);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const FATOR = { retangular: 6.5, ponto: 8 };
function ligarLuzes(raiz) {
  const luzes = [];
  raiz.traverse((o) => {
    if (!o.name.startsWith('luz-') || q.has('semluzes')) return;
    const e = o.userData || {};
    const pos = new THREE.Vector3();
    o.getWorldPosition(pos);
    const cor = new THREE.Color(e.cor || '#ffffff');
    let luz;
    if (e.tipo === 'retangular') {
      luz = new THREE.SpotLight(cor, FATOR.retangular * (e.intensidade ?? 1), 6, Math.PI / 3.3, 0.7, 2);
      luz.position.copy(pos);
      luz.target.position.set(pos.x, pos.y - 1, pos.z);
      luz.castShadow = renderer.shadowMap.enabled;
      luz.shadow.mapSize.set(1024, 1024);
      luz.shadow.bias = -0.0004;
      cena.add(luz.target);
    } else {
      luz = new THREE.PointLight(cor, FATOR.ponto * (e.intensidade ?? 1), e.alcance || 6, 2);
      luz.position.copy(pos);
    }
    luz.name = o.name;
    cena.add(luz);
    luzes.push(luz.name);
  });
  return luzes;
}

const camera = new THREE.PerspectiveCamera(50, LARG / ALT, 0.05, 80);
let camAtiva = camera;
function posicionar(raiz) {
  const cams = {};
  raiz.traverse((o) => { if (o.isCamera || o.name.startsWith('camera-menu')) cams[o.name] = o; });
  const no = (n) => { let r = null; raiz.traverse((o) => { if (o.name === n) r = o; }); return r; };
  const PISO = -ALTURA_DO_PISO;
  const alvo = new THREE.Vector3(-0.4, 0.0, 0);
  if (CAM === 'jogo') {
    camera.position.set(3.0, PISO + 1.5, 0.0);
    alvo.set(-3.2, 0.5, 0);
  } else if (CAM === 'cima') {
    camera.position.set(0.001, 2.2, 0.8);
    alvo.set(0, 0, 0);
  } else if (CAM === 'planta') {
    const h = 5.6;
    const asp = LARG / ALT;
    camAtiva = new THREE.OrthographicCamera(-h * asp, h * asp, h, -h, 0.1, 40);
    camAtiva.position.set(0, 10, 0);
    camAtiva.up.set(0, 0, -1);
    camAtiva.lookAt(0, 0, 0);
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.9)];
    return;
  } else if (CAM === 'livre') {   // pos=x,y,z & alvo=x,y,z & fov=graus (para os detalhes da folha)
    const [px, py, pz] = (q.get('pos') || '0,1,0').split(',').map(Number);
    const [ax, ay, az] = (q.get('alvo') || '0,0,0').split(',').map(Number);
    camera.position.set(px, py, pz);
    alvo.set(ax, ay, az);
    camera.fov = Number(q.get('fov') || 50);
    camera.updateProjectionMatrix();
  } else if (CAM === 'fundo') {
    camera.position.set(-3.0, PISO + 1.5, -0.3);
    alvo.set(4.6, 0.2, 1.2);
  } else if (CAM === 'canto') {
    camera.position.set(4.6, 1.7, -2.9);
    alvo.set(-1.5, 0.2, 1.0);
  } else if (CAM.startsWith('menu')) {
    const n = no('camera-menu-' + CAM.slice(4));
    if (n) {
      const cam = n.isCamera ? n : n.children.find((c) => c.isCamera) || n;
      cam.updateWorldMatrix(true, false);
      const p = new THREE.Vector3(), qq = new THREE.Quaternion();
      cam.getWorldPosition(p);
      cam.getWorldQuaternion(qq);
      camera.position.copy(p);
      camera.quaternion.copy(qq);
      if (cam.isCamera) camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      return;
    }
  }
  camera.lookAt(alvo);
}

const painel = document.getElementById('painel');
for (const n of ['alto', 'medio', 'baixo']) {
  const b = document.createElement('button');
  b.textContent = n;
  if (n === NIVEL) b.classList.add('ativo');
  b.onclick = () => { q.set('nivel', n); location.search = q.toString(); };
  painel.appendChild(b);
}
for (const n of ['jogo', 'menu1', 'menu2', 'menu3', 'cima', 'canto', 'fundo', 'planta']) {
  const b = document.createElement('button');
  b.textContent = n;
  if (n === CAM) b.classList.add('ativo');
  b.onclick = () => { q.set('cam', n); location.search = q.toString(); };
  painel.appendChild(b);
}

const GLB = q.get('glb') || `/arte/boteco/exportados/boteco-${NIVEL}.glb`;

// `ConfigBoteco.cascoLeve` do jogo (L44): estes materiais viram cor lisa (média da textura x cor x tom), sem luz.
const CASCO_LEVE = { materiais: ['piso', 'azulejo', 'barrado', 'reboco', 'forro'], tom: [0.66, 0.41, 0.31] };
function corMedia(tex) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.drawImage(tex.image, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  const lin = (v) => Math.pow(v / 255, 2.2);
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); gg += lin(d[i + 1]); b += lin(d[i + 2]); }
  const n = d.length / 4;
  return [r / n, gg / n, b / n];
}
function alisarOCasco(raiz) {
  const feitos = new Map();
  raiz.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (!CASCO_LEVE.materiais.includes(m.name) || !m.isMeshStandardMaterial) return;
    if (!feitos.has(m)) {
      const cor = new THREE.Color(m.color);
      if (m.map) { const med = corMedia(m.map); cor.setRGB(med[0] * m.color.r, med[1] * m.color.g, med[2] * m.color.b); }
      cor.setRGB(cor.r * CASCO_LEVE.tom[0], cor.g * CASCO_LEVE.tom[1], cor.b * CASCO_LEVE.tom[2]);
      const liso = new THREE.MeshBasicMaterial({ color: cor, side: m.side });
      liso.name = m.name;
      feitos.set(m, liso);
    }
    o.material = feitos.get(m);
  });
}

new GLTFLoader().load(GLB, (gltf) => {
  const raiz = gltf.scene;
  cena.add(raiz);
  if (q.get('casco') === 'leve') alisarOCasco(raiz);
  raiz.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
      o.castShadow = !['janela-rua', 'letreiro-neon'].includes(o.name);
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.name === 'letreiro-halo') { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
        if (m.name === 'luminaria-luz' || m.name.startsWith('neon-') || m.name === 'lampada') m.toneMapped = false;
      }
    }
  });
  if (!q.has('semmesa')) cena.add(mesaDeReferencia());
  const luzes = ligarLuzes(raiz);
  posicionar(raiz);
  if (q.has('semlum') || CAM === 'planta') { const l = raiz.getObjectByName('luminaria'); if (l) l.visible = false; }
  if (q.has('zona')) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const FOLGA = 1.6, ax = MESA.comprimento / 2 + MESA.larguraTabela + MESA.moldura + FOLGA, az = MESA.largura / 2 + MESA.larguraTabela + MESA.moldura + FOLGA;
    const y = -ALTURA_DO_PISO + 0.02, e = 0.04;
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(2 * ax, 0.005, e), mat); a.position.set(0, y, s * az);
      const b = new THREE.Mesh(new THREE.BoxGeometry(e, 0.005, 2 * az), mat); b.position.set(s * ax, y, 0);
      cena.add(a, b);
    }
  }
  const helice = raiz.getObjectByName('ventilador-helice');
  if (helice && q.has('t')) helice.rotation.y = Number(q.get('t')) * 4;
  renderer.render(cena, camAtiva);
  window.__boteco = { luzes, nivel: NIVEL, triangulos: renderer.info.render.triangles, chamadas: renderer.info.render.calls };
  document.title = 'pronto';
  document.body.dataset.avisos = JSON.stringify(avisos);
  if (!q.has('captura')) {
    const laco = () => { if (helice) helice.rotation.y += 0.04; renderer.render(cena, camAtiva); requestAnimationFrame(laco); };
    laco();
  }
}, undefined, (e) => { document.title = 'erro'; console.error(e); });
