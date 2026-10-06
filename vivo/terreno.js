/* EL TERRENO del mundo entero: un suelo liso y continuo (sin columnas ni escalones).
   - La altura sale del mapa del mundo (mundo/mapa.js) sin redondear, con unas lomas suaves por
     encima; el río y las charcas son hondonadas de orilla curva: el suelo baja poco a poco hasta
     el agua y por debajo, más hondo en el centro (alturaSuelo). Sin cuadrados: la orilla es donde
     el suelo corta el plano del agua, píxel a píxel.
   - Una malla basta de todo el mundo, hecha UNA vez al empezar (cada 2-80 m según el tamaño): el
     relieve y, por encima, el color del bosque (de lejos, el dosel).
   - Cerca de donde mira la cámara, una rejilla de 0,5 m por baldosas de 30 m (con las normales
     sacadas de las alturas de al lado, también las de la baldosa vecina: no se ven las uniones).
     El color, por vértice (tierra y hojarasca que cambian por zonas, arena y barro en la orilla,
     el lecho bajo el agua) y en el shader: un detalle de hojarasca pintado una vez y repetido a dos
     escalas giradas (para que no se note la repetición), el verde de la hierba con sus manchas
     (las mismas que las briznas de vivo/hierba.js) y los reflejos del sol en el fondo del agua.
   - El agua cercana (río y charcas): una sola malla plana con las casillas de 0,5 m donde el suelo
     queda por debajo del agua, con la profundidad en cada vértice, y un shader propio (vivo/agua.js). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { conTransparencia } from './transparencia.js?v=202610060036';
import { ruido2, tono } from '../graficos/pruebas-morta/escena-v3.js?v=202610060036';
import { BALDOSA } from '../mundo/mapa.js?v=202610060036';
import { materialAgua } from './agua.js?v=202610060036';

export const NIVEL_AGUA = -0.72;
const B = BALDOSA, PASO = 0.5, N = B / PASO; // la rejilla de detalle: N + 1 vértices por lado
const PALETA = {
  hojarasca: ['#3a2618', '#4e3420', '#5e4228', '#6e5232', '#4a4424'], tierra: ['#2e2016', '#3e2a1c', '#4e3624'],
  musgo: ['#24361a', '#2e4420', '#3c5226'],
  agua: ['#173e44', '#235a5e', '#337a78'], lecho: ['#241c14', '#33281c', '#463826', '#5a4c34'], arena: ['#5a5038', '#6a5e42', '#7a6c4c'], barro: ['#2a2218', '#382e20'],
  dosel: ['#16351a', '#1f4422', '#2a5228'],
};
// las paletas ya convertidas (r, g, b lineales) y un tono sin crear objetos: deja el color en out
const PAL = Object.fromEntries(Object.entries(PALETA).map(([k, l]) => [k, l.map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; })]));
function tonoEn(lista, t, out) {
  t = Math.min(0.999, Math.max(0, t)) * (lista.length - 1);
  const i = Math.floor(t), f = t - i, a = lista[i], b = lista[Math.min(i + 1, lista.length - 1)];
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}
const mezclar = (c, o, k) => { c[0] += (o[0] - c[0]) * k; c[1] += (o[1] - c[1]) * k; c[2] += (o[2] - c[2]) * k; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

// el detalle del suelo: hojarasca, ramitas y piedrecillas sobre gris medio (se multiplica por el
// color del vértice), que se repite sin costuras
function texturaDetalle() {
  const L = 256, cv = document.createElement('canvas');
  cv.width = cv.height = L;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, L, L);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const repetido = (x, y, f) => { for (const dx of [-L, 0, L]) for (const dy of [-L, 0, L]) { g.save(); g.translate(x + dx, y + dy); f(); g.restore(); } };
  // manchas grandes y suaves (humedad, tierra al aire)
  for (let i = 0; i < 40; i++) {
    const x = r() * L, y = r() * L, rad = 15 + r() * 35, v = 128 + (r() - 0.5) * 50;
    repetido(x, y, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); });
  }
  // hojas caídas (elipses con su nervio), ramitas y piedrecillas
  for (let i = 0; i < 900; i++) {
    const x = r() * L, y = r() * L, a = r() * Math.PI, w = 2 + r() * 5, h = w * (0.35 + r() * 0.3);
    const v = 100 + r() * 70, t = r();
    const c = t < 0.5 ? [v * 1.12, v * 0.98, v * 0.8] : t < 0.8 ? [v * 1.05, v, v * 0.85] : [v * 0.9, v * 1.05, v * 0.85];
    repetido(x, y, () => {
      g.rotate(a);
      g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.85)`;
      g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(70,60,50,0.35)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-w, 0); g.lineTo(w, 0); g.stroke();
    });
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * L, y = r() * L, a = r() * Math.PI, l = 6 + r() * 14;
    repetido(x, y, () => { g.rotate(a); g.strokeStyle = 'rgba(80,66,50,0.7)'; g.lineWidth = 0.8 + r() * 0.8; g.beginPath(); g.moveTo(-l / 2, 0); g.quadraticCurveTo(0, (r() - 0.5) * 4, l / 2, 0); g.stroke(); });
  }
  for (let i = 0; i < 140; i++) {
    const x = r() * L, y = r() * L, rad = 0.6 + r() * 1.6, v = 120 + r() * 60;
    repetido(x, y, () => { g.fillStyle = `rgba(${v | 0},${v | 0},${(v * 0.95) | 0},0.9)`; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill(); });
  }
  // grano fino
  const im = g.getImageData(0, 0, L, L), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const k = (r() - 0.5) * 22; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  g.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return tex;
}

// el material del suelo de cerca: Lambert con el color del vértice y, en el shader, el detalle,
// el verde de la hierba por manchas y los reflejos del sol en el fondo del agua
function materialSuelo(u) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aHierba;\nvarying float vHierbaS;\nvarying vec3 vSuelo;\n' + sh.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\n vSuelo = (modelMatrix * vec4(transformed, 1.0)).xyz; vHierbaS = aHierba;');
    sh.fragmentShader = `uniform sampler2D uDetalle; uniform float uNivel; uniform float uTiempoS; uniform float uSueloHierba; uniform float uManchas; uniform float uVariacion; uniform vec3 uSolS; uniform vec3 uHierbaZona;
varying float vHierbaS; varying vec3 vSuelo;
float hzS(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruidoS(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hzS(i), hzS(i + vec2(1, 0)), f.x), mix(hzS(i + vec2(0, 1)), hzS(i + vec2(1, 1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vSuelo.xz;
    // el detalle, a dos escalas giradas (media 0,5 cada una)
    vec3 det = texture2D(uDetalle, p * 0.29).rgb * texture2D(uDetalle, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.071 + 0.37).rgb * 4.0;
    // la hierba: el mismo verde y las mismas manchas que las briznas, donde las hay
    if (vHierbaS > 0.01 && uSueloHierba > 0.5) {
      float mancha = ruidoS(p * 0.18), zonaColor = ruidoS(p * 0.05 + vec2(91.0, -7.0)), zonaColor2 = ruidoS(p * 0.13 + vec2(-61.0, 29.0)), zonaSeca = ruidoS(p * 0.034 + vec2(13.0, 71.0));
      // (el color medio de las briznas, con la misma cuenta que vivo/hierba.js: donde ya no llegan
      // las briznas, el suelo se ve igual; no hay corte)
      vec3 col = mix(vec3(0.16, 0.36, 0.08), vec3(0.42, 0.48, 0.14), clamp(0.2 + (mancha - 0.5) * 0.4, 0.0, 1.0) * 0.35);
      col = mix(col, vec3(0.42, 0.5, 0.1), smoothstep(0.5, 0.75, zonaColor) * uManchas);
      col = mix(col, vec3(0.04, 0.2, 0.12), smoothstep(0.45, 0.7, zonaColor2) * uManchas);
      col = mix(col, vec3(0.55, 0.46, 0.2), smoothstep(0.6, 0.8, zonaSeca) * uManchas * 0.85);
      // donde hay briznas, el suelo de debajo oscuro (la sombra entre las matas): si fuera del mismo
      // verde que ellas, se confundirían con él y parecería que no hay hierba; donde ya no llegan las
      // briznas, su color medio (así no hay corte a lo lejos). uHierbaZona: centro de los anillos (xz)
      // y hasta dónde llegan las briznas espesas
      float sinBriznas = smoothstep(uHierbaZona.z * 0.45, uHierbaZona.z, distance(p, uHierbaZona.xy));
      vec3 verde = mix(mix(vec3(0.035, 0.07, 0.02), col, 0.18), mix(vec3(0.06, 0.16, 0.04), col, 0.62), sinBriznas);
      float cubre = clamp((0.55 + mancha * 0.9 - uVariacion * 0.25) * 1.2, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, verde / mix(vec3(1.0), max(det, vec3(0.5)), 0.75), cubre * vHierbaS);
    }
    diffuseColor.rgb *= det;
    // bajo el agua: más oscuro con la hondura y los reflejos del sol que corren por el fondo
    float hondo = (uNivel - vSuelo.y) * clamp(-vHierbaS, 0.0, 1.0);
    if (hondo > 0.0) {
      vec2 q = p * 1.7 + vec2(uTiempoS * 0.3, uTiempoS * 0.2);
      float c1 = abs(ruidoS(q) - 0.5), c2 = abs(ruidoS(q * 1.9 - vec2(uTiempoS * 0.5, 0.0) + 4.0) - 0.5);
      float caus = pow(1.0 - min(c1, c2) * 2.0, 8.0);
      diffuseColor.rgb *= exp(-hondo * vec3(1.0, 0.7, 0.65)) * (1.0 + caus * 1.4 * uSolS.x * smoothstep(0.0, 0.12, hondo));
    }
  }`);
  };
  m.customProgramCacheKey = () => 'sueloLiso';
  return conTransparencia(m, { margenExtra: 4 });
}

export function crearTerreno({ escena, mapa, ox, oz }) {
  const ruido = ruido2(7), ruidoB = ruido2(19);
  const W = NIVEL_AGUA;
  // las charcas, por casillas de 16 m (para buscar las de cerca deprisa)
  const charcas = new Map();
  for (const lista of mapa.charcas) for (const c of lista) {
    const r = c.radio + 8;
    for (let i = Math.floor((c.x - r) / 16); i <= Math.floor((c.x + r) / 16); i++)
      for (let j = Math.floor((c.z - r) / 16); j <= Math.floor((c.z + r) / 16); j++) {
        const k = i * 100000 + j;
        if (!charcas.has(k)) charcas.set(k, []);
        charcas.get(k).push(c);
      }
  }
  const hondoRio = mapa.rio && mapa.rio.ancho > 5 ? 1.4 : 0.9;
  // la distancia (m) a la orilla más cercana: negativa dentro del agua
  function orilla(x, z) {
    let s = 1e9, hondo = 0.8;
    if (mapa.rio) { const d = mapa.rioX(z + 0.5) - mapa.rioX(z - 0.5); s = mapa.distRio(x, z) / Math.hypot(1, d); hondo = hondoRio; }
    const cs = charcas.get(Math.floor(x / 16) * 100000 + Math.floor(z / 16));
    if (cs) for (const c of cs) { const d = Math.hypot(x - c.x, z - c.z) - c.radio; if (d < s) { s = d; hondo = Math.min(1.1, 0.5 + c.radio * 0.1); } }
    return [s, hondo];
  }
  // la altura del suelo en un punto (sin caché): el mapa, unas lomas suaves y la hondonada del agua
  let ultimaOrilla = 0; // (la orilla del último punto de alturaSuelo)
  function alturaSuelo(x, z) {
    const base = mapa.altura(x, z) + (ruido(x * 0.09 + 40, z * 0.09) - 0.5) * 0.9 + (ruidoB(x * 0.33, z * 0.33 + 80) - 0.5) * 0.14;
    const [s, hondo] = orilla(x, z);
    ultimaOrilla = s;
    if (s > 7) return base;
    // dentro: baja desde la orilla y se allana en el fondo
    if (s <= 0) return smax(W + 0.45 * s, W - hondo, 0.4);
    // fuera: la ribera sube desde el agua y se junta con el relieve; nunca por debajo del agua cerca de ella
    const t = sstep(0, 7, s), m = (W + 0.4 * s) * (1 - t) + base * t;
    return Math.max(m, W + 0.3 * s - 0.5 * Math.max(0, s - 1.5) ** 2);
  }

  // las alturas de cada baldosa (con un vértice más de borde por cada lado, para las normales), con caché
  const alturas = new Map();
  const M = N + 3; // vértices por lado con los bordes
  function alturasDe(bi, bj) {
    const k = bi * 100000 + bj;
    let a = alturas.get(k);
    if (a) return a;
    // (las alturas y, detrás, la distancia a la orilla de cada vértice)
    a = new Float32Array(M * M * 2);
    const x0 = bi * B, z0 = bj * B;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { a[j * M + i] = alturaSuelo(x0 + (i - 1) * PASO, z0 + (j - 1) * PASO); a[M * M + j * M + i] = ultimaOrilla; }
    if (alturas.size > 300) alturas.delete(alturas.keys().next().value);
    alturas.set(k, a);
    return a;
  }
  // la altura del suelo (o del agua) en un punto del mundo: la de la malla (interpolada)
  function cima(x, z) {
    const bi = Math.floor(x / B), bj = Math.floor(z / B);
    const a = alturasDe(bi, bj);
    const fx = (x - bi * B) / PASO, fz = (z - bj * B) / PASO, i = Math.min(N - 1, Math.floor(fx)), j = Math.min(N - 1, Math.floor(fz));
    const u = fx - i, v = fz - j, o = (j + 1) * M + i + 1;
    const h = (a[o] * (1 - u) + a[o + 1] * u) * (1 - v) + (a[o + M] * (1 - u) + a[o + M + 1] * u) * v;
    return h < W && mapa.esAgua(x, z) ? W : h;
  }

  // ---- la malla basta de todo el mundo (una vez)
  const lado = Math.max(mapa.ancho, mapa.alto);
  const paso = Math.max(2, Math.ceil(lado / 400));
  const nx = Math.ceil(mapa.ancho / paso) + 1, nz = Math.ceil(mapa.alto / paso) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = Math.min(i * paso, mapa.ancho), z = Math.min(j * paso, mapa.alto), k = (i * nz + j) * 3;
    // (por debajo de la de detalle; el agua, solo la de verdad: no las hondonadas secas)
    const h = alturaSuelo(x, z), agua = h < W && orilla(x, z)[0] < 0.5;
    // (y más abajo junto al agua: en una hondonada, la malla basta pasaría por encima de la de detalle)
    pos[k] = x - ox; pos[k + 1] = h - (orilla(x, z)[0] < 3 ? 1.2 : 0.35); pos[k + 2] = z - oz;
    c.copy(agua ? tono(PALETA.agua, 0.3) : tono(PALETA.dosel, ruido(x * 0.05, z * 0.05)));
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nz - 1; j++) {
    const a = i * nz + j, b = (i + 1) * nz + j;
    idx[o++] = a; idx[o++] = a + 1; idx[o++] = b; idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const basto = new THREE.Mesh(geo, conTransparencia(new THREE.MeshLambertMaterial({ vertexColors: true }), { margenExtra: 4 }));
  basto.receiveShadow = true;
  escena.add(basto);

  // ---- el detalle: la rejilla de 0,5 m por baldosas, cerca de la cámara
  const uSuelo = { uDetalle: { value: texturaDetalle() }, uNivel: { value: W }, uTiempoS: { value: 0 }, uSueloHierba: { value: 1 }, uManchas: { value: 0.7 }, uVariacion: { value: 0.7 }, uSolS: { value: new THREE.Vector3(1, 0, 0) }, uHierbaZona: { value: new THREE.Vector3(0, 0, 40) } };
  const matSuelo = materialSuelo(uSuelo);
  // el índice de una rejilla de (N+1)² vértices (el mismo para todas las baldosas)
  const idxSuelo = new Uint32Array(N * N * 6);
  for (let j = 0, o = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + N + 1;
    // la diagonal, alternada (para que las lomas no salgan rayadas en una dirección)
    if ((i + j) & 1) { idxSuelo[o++] = a; idxSuelo[o++] = b; idxSuelo[o++] = a + 1; idxSuelo[o++] = a + 1; idxSuelo[o++] = b; idxSuelo[o++] = b + 1; }
    else { idxSuelo[o++] = a; idxSuelo[o++] = b + 1; idxSuelo[o++] = a + 1; idxSuelo[o++] = a; idxSuelo[o++] = b; idxSuelo[o++] = b + 1; }
  }
    const trozos = new Map(); // clave -> { mallas, agua }
  // la corriente en un punto: a lo largo del río (en las charcas, casi nada)
  const flujo = (x, z) => {
    if (!mapa.rio || mapa.distRio(x, z) > 1) return [0.08, 0.05];
    const dx = (mapa.rioX(z + 0.5) - mapa.rioX(z - 0.5)), l = Math.hypot(dx, 1);
    return [dx / l * 0.55, 1 / l * 0.55];
  };
  function construir(bi, bj) {
    const a = alturasDe(bi, bj), x0 = bi * B, z0 = bj * B, nv = (N + 1) * (N + 1);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), hie = new Float32Array(nv);
    const cc = [0, 0, 0], c2 = [0, 0, 0], c3 = [0, 0, 0], MM = M * M;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const v = j * (N + 1) + i, o = (j + 1) * M + i + 1, x = x0 + i * PASO, z = z0 + j * PASO, h = a[o];
      // (fuera del cuadrado del mundo, el vértice se pega al borde y baja: el canto del mapa, de tierra)
      const fuera = x > mapa.ancho || z > mapa.alto;
      pos[v * 3] = Math.min(x, mapa.ancho) - ox; pos[v * 3 + 1] = fuera ? h - 3 : h; pos[v * 3 + 2] = Math.min(z, mapa.alto) - oz;
      if (fuera) { tonoEn(PAL.tierra, ruido(x * 0.4, z * 0.4), cc); col[v * 3] = cc[0] * 0.6; col[v * 3 + 1] = cc[1] * 0.6; col[v * 3 + 2] = cc[2] * 0.6; nor[v * 3 + 1] = 1; hie[v] = 0; continue; }
      const gx = (a[o + 1] - a[o - 1]) / (2 * PASO), gz = (a[o + M] - a[o - M]) / (2 * PASO), l = Math.hypot(gx, 1, gz);
      nor[v * 3] = -gx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -gz / l;
      // el color: hojarasca y tierra por zonas grandes y pequeñas; arena y barro en la orilla; el lecho
      const s = a[MM + o], n1 = ruido(x * 0.06 + 100, z * 0.06), n2 = ruido(x * 0.4, z * 0.4 + 50), n3 = ruidoB(x * 0.17, z * 0.17);
      tonoEn(PAL.hojarasca, n1 * 0.7 + n2 * 0.3, cc);
      mezclar(cc, tonoEn(PAL.tierra, n2, c3), sstep(0.55, 0.8, n3) * 0.6);
      mezclar(cc, tonoEn(PAL.musgo, n2, c3), sstep(0.6, 0.85, ruidoB(x * 0.05 + 30, z * 0.05)) * 0.7);
      if (s < 1.8) {
        tonoEn(PAL.arena, n2 * 0.7 + n1 * 0.3, c2); mezclar(c2, tonoEn(PAL.barro, n1, c3), sstep(0.9, 0, s) * 0.8);
        mezclar(cc, c2, sstep(1.5, 0.4, s) * (0.5 + 0.5 * n3));
      }
      if (h < W + 0.02 && s < 1) mezclar(cc, tonoEn(PAL.lecho, n2 * 0.6 + n1 * 0.4, c3), sstep(W + 0.02, W - 0.15, h));
      // las laderas, algo más oscuras
      const k = 0.8 + 0.2 / l;
      col[v * 3] = cc[0] * k; col[v * 3 + 1] = cc[1] * k; col[v * 3 + 2] = cc[2] * k;
      // (aHierba: lo que cubre la hierba, de 0 a 1; −1 en el lecho del agua)
      hie[v] = s < 0.3 && h < W ? -1 : mapa.enMundo(x, z) ? sstep(0.9, 1.8, s) : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aHierba', new THREE.BufferAttribute(hie, 1));
    g.setIndex(new THREE.BufferAttribute(idxSuelo, 1)); // (el mismo array; su propio búfer, que se suelta con la baldosa)
    g.computeBoundingSphere(); g.computeBoundingBox();
    const malla = new THREE.Mesh(g, matSuelo);
    malla.receiveShadow = true;
    escena.add(malla);
    // el agua de la baldosa: las casillas con alguna esquina por debajo del agua
    const usado = new Int32Array(nv).fill(-1), aPos = [], aFondo = [], aFlu = [], aIdx = [], MM2 = M * M;
    const vert = (i, j) => {
      const v = j * (N + 1) + i;
      if (usado[v] < 0) {
        usado[v] = aFondo.length;
        const x = x0 + i * PASO, z = z0 + j * PASO, [fx, fz] = flujo(x, z);
        aPos.push(x - ox, W, z - oz); aFondo.push(W - a[(j + 1) * M + i + 1]); aFlu.push(fx, fz);
      }
      return usado[v];
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = (j + 1) * M + i + 1;
      if (Math.min(a[o], a[o + 1], a[o + M], a[o + M + 1]) >= W) continue;
      const xc = x0 + (i + 0.5) * PASO, zc = z0 + (j + 0.5) * PASO;
      if (!mapa.enMundo(xc, zc) || Math.min(a[MM2 + o], a[MM2 + o + 1], a[MM2 + o + M], a[MM2 + o + M + 1]) > 1) continue; // (no en las hondonadas secas)
      const p = vert(i, j), q = vert(i + 1, j), r = vert(i, j + 1), t = vert(i + 1, j + 1);
      aIdx.push(p, r, q, q, r, t);
    }
    return { mallas: [malla], agua: { pos: aPos, fondo: aFondo, flujo: aFlu, idx: aIdx } };
  }
  // ---- el agua: la de las baldosas a la vista, en una sola malla
  const agua = new THREE.Mesh(new THREE.BufferGeometry(), materialAgua());
  agua.frustumCulled = false; agua.renderOrder = 1;
  escena.add(agua);
  let firmaAgua = '';
  function rehacerAgua(claves) {
    const firma = claves.join(',');
    if (firma === firmaAgua) return;
    firmaAgua = firma;
    let nv = 0, ni = 0;
    for (const k of claves) { const w = trozos.get(k).agua; nv += w.fondo.length; ni += w.idx.length; }
    const pos = new Float32Array(nv * 3), fon = new Float32Array(nv), flu = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let v = 0, i = 0;
    for (const k of claves) {
      const w = trozos.get(k).agua;
      pos.set(w.pos, v * 3); fon.set(w.fondo, v); flu.set(w.flujo, v * 2);
      for (let q = 0; q < w.idx.length; q++) idx[i + q] = w.idx[q] + v;
      v += w.fondo.length; i += w.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aFondo', new THREE.BufferAttribute(fon, 1));
    g.setAttribute('aFlujo', new THREE.BufferAttribute(flu, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    agua.geometry.dispose(); agua.geometry = g;
  }
  const medidas = { trozos: 0, pendientes: 0, triangulos: 0 };
  return {
    cima, medidas, basto, agua, uSuelo,
    // la distancia a la orilla (negativa en el agua): para la hierba
    orilla: (x, z) => orilla(x, z)[0],
    // la altura del suelo sin baldosas (para lo lejano)
    altura: alturaSuelo,
    // cada fotograma: dónde mira la cámara y cuánto tiempo hay para construir
    actualizar(fx, fz, ms = 4) {
      const t0 = performance.now(), quiero = new Set(), pend = [];
      // el diorama (un cuadrado pequeño): entero, con sus bordes, desde su centro
      const DETALLE = mapa.ancho <= 200 ? Math.hypot(mapa.ancho, mapa.alto) : 75;
      if (mapa.ancho <= 200) { fx = mapa.ancho / 2; fz = mapa.alto / 2; }
      for (let i = Math.floor((fx - DETALLE) / B); i <= Math.floor((fx + DETALLE) / B); i++)
        for (let j = Math.floor((fz - DETALLE) / B); j <= Math.floor((fz + DETALLE) / B); j++) {
          if (i < 0 || j < 0 || i * B >= mapa.ancho || j * B >= mapa.alto) continue;
          const d = Math.hypot(i * B + B / 2 - fx, j * B + B / 2 - fz);
          if (d > DETALLE + B) continue;
          const k = i * 100000 + j;
          quiero.add(k);
          const t = trozos.get(k);
          if (t) { t.mallas.forEach((m) => (m.visible = true)); continue; }
          pend.push([d, i, j, k]);
        }
      pend.sort((a, b) => a[0] - b[0]);
      let hechos = 0;
      for (const [, i, j, k] of pend) {
        if (hechos && performance.now() - t0 > ms) break;
        trozos.set(k, construir(i, j)); hechos++;
      }
      // los que ya no hacen falta, ocultos; y si hay muchos guardados, se tiran los más viejos
      for (const [k, t] of trozos) if (!quiero.has(k)) t.mallas.forEach((m) => (m.visible = false));
      if (trozos.size > 120) for (const [k, t] of trozos) { if (trozos.size <= 100) break; if (!quiero.has(k)) { t.mallas.forEach((m) => { escena.remove(m); m.geometry.dispose(); }); trozos.delete(k); } }
      medidas.trozos = quiero.size; medidas.pendientes = pend.length - hechos;
      rehacerAgua([...quiero].filter((k) => trozos.has(k)).sort((a, b) => a - b));
      return hechos;
    },
    *mallas() { yield basto; yield agua; for (const t of trozos.values()) yield* t.mallas; },
  };
}
