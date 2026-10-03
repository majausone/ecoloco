/* PRUEBAS DE ESTILO: un trozo de bosque hecho con cubitos en three.js, pintado a baja
   resolución y escalado sin suavizar, con un retoque final (contraste, sombras teñidas,
   posterizado con tramado, contorno suave y viñeta) para acercarlo a Children of Morta.
   Cada prueba es una configuración: bioma, paleta, luz, cámara, resolución y extras. */

import * as THREE from './vendor/three.module.js';
import { Rejilla } from './voxeles.js?v=202610032115';

/* ---- azar y ruido con semilla --------------------------------------------- */

export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ruido2(semilla) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + semilla * 982451653) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const suave = (t) => t * t * (3 - 2 * t);
  const capa = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = suave(x - xi), fy = suave(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => capa(x, y) * 0.6 + capa(x * 2.1 + 7.3, y * 2.1 + 1.7) * 0.3 + capa(x * 4.3, y * 4.3) * 0.1;
}

const col = (hex) => new THREE.Color(hex);

// v4: el mismo bosque que la v2 (cubos a la mitad), pero pintado en una rejilla de vóxeles
export const CUBO = 0.5;
export const VOXEL = 0.125;
const mezcla = (a, b, t) => a.clone().lerp(b, t);
function tono(lista, t) {
  t = Math.min(0.999, Math.max(0, t)) * (lista.length - 1);
  const i = Math.floor(t);
  return mezcla(col(lista[i]), col(lista[Math.min(i + 1, lista.length - 1)]), t - i);
}

/* ---- el saco de cubos: todo lo que no se mueve por su cuenta va aquí ----------
   Se junta en pocas InstancedMesh: 'solido', 'hoja' (se mece con el viento),
   'brillo' (no le afecta la luz) y 'agua'. */

class Saco {
  constructor() { this.tipos = { solido: [], hoja: [], brillo: [], agua: [] }; }
  cubo(tipo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    this.tipos[tipo].push({ x, y, z, sx, sy, sz, color, rx, ry, rz });
  }
  mallas(tiempo, viento) {
    const R = new Rejilla({ x0: -23, x1: 23, y0: -1, y1: 14, z0: -17, z1: 17, voxel: VOXEL });
    for (const tipo of ['solido', 'agua', 'hoja', 'brillo']) for (const c of this.tipos[tipo]) R.cubo(tipo, c);
    const mats = {
      solido: new THREE.MeshLambertMaterial({ vertexColors: true }),
      hoja: new THREE.MeshLambertMaterial({ vertexColors: true }),
      agua: new THREE.MeshLambertMaterial({ vertexColors: true }),
      brillo: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    mecer(mats.hoja, tiempo, viento);
    const mallas = R.mallas(mats);
    this.stats = { voxeles: R.llenos, triangulos: R.caras * 2 };
    R.celdas = null; // para la prueba no se edita: se suelta la memoria
    return mallas;
  }
}

/* Las hojas se mecen: se desplazan en x según la altura, después de colocar la instancia. */
function mecer(mat, tiempo, viento) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTiempo = tiempo;
    sh.uniforms.uViento = viento;
    sh.vertexShader = 'uniform float uTiempo;\nuniform float uViento;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float sw = sin(uTiempo * 1.7 + mvPosition.x * 0.45 + mvPosition.z * 0.3) + 0.45 * sin(uTiempo * 3.3 + mvPosition.x * 1.3);
      mvPosition.x += sw * uViento * max(mvPosition.y, 0.0) * 0.018;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
}

/* ---- el terreno -------------------------------------------------------------- */

const ANCHO = 46, FONDO = 34;

function terreno(cfg, saco, r) {
  const ruido = ruido2(cfg.semilla);
  const P = cfg.paleta;
  const alturas = [], agua = [];
  const rio = cfg.rio;
  for (let x = 0; x < ANCHO; x++) {
    alturas[x] = []; agua[x] = [];
    for (let z = 0; z < FONDO; z++) {
      let n = ruido(x * 0.09, z * 0.09);
      if (cfg.fondoAlto) n += Math.max(0, (8 - z) / 8) * 0.9; // un cortado al fondo
      let nivel = Math.round(n * cfg.relieve);
      let enAgua = false;
      if (rio) {
        const cx = ANCHO * rio.x + Math.sin(z * 0.23 + rio.fase) * rio.curva;
        const d = Math.abs(x - cx);
        if (d < rio.ancho) { enAgua = true; nivel = -1; }
        else if (d < rio.ancho + 1.5) nivel = Math.min(nivel, 0);
      }
      if (cfg.charcas && ruido(x * 0.21 + 40, z * 0.21) > 0.62) { enAgua = true; nivel = -1; }
      alturas[x][z] = nivel; agua[x][z] = enAgua;
    }
  }
  for (let x = 0; x < ANCHO; x++) {
    for (let z = 0; z < FONDO; z++) {
      const nivel = alturas[x][z], cima = nivel * 0.5;
      const px = x - ANCHO / 2 + 0.5, pz = z - FONDO / 2 + 0.5;
      const v = ruido(x * 0.5 + 100, z * 0.5);
      // la columna de tierra o roca
      const lado = nivel >= 2 ? tono(P.roca, v) : tono(P.tierra, v);
      saco.cubo('solido', px, (cima - 3) / 2, pz, 1, cima + 3, 1, lado);
      if (agua[x][z]) {
        const fondo = tono(P.agua, 0.15 + v * 0.3);
        saco.cubo('agua', px, cima + 0.2, pz, 1, 0.12, 1, fondo);
        continue;
      }
      // la capa de hierba (o arena junto al agua), con un poco de vuelo
      const cercaAgua = rio && Math.abs(x - (ANCHO * rio.x + Math.sin(z * 0.23 + rio.fase) * rio.curva)) < rio.ancho + 1.6;
      const piel = cercaAgua && P.arena ? tono(P.arena, v) : tono(P.hierba, v * 0.85 + r() * 0.15);
      const parte = Math.round(1 / CUBO);
      for (let i = 0; i < parte; i++) for (let j = 0; j < parte; j++) {
        const t = cercaAgua && P.arena ? tono(P.arena, v + (r() - 0.5) * 0.15) : tono(P.hierba, v * 0.8 + r() * 0.2);
        saco.cubo('solido', px - 0.5 + (i + 0.5) / parte, cima + 0.06, pz - 0.5 + (j + 0.5) / parte, 1.02 / parte, 0.14, 1.02 / parte, t);
      }
      void piel;
      // motas en el suelo (hojarasca, tierra, flores pequeñas)
      const motas = Math.round((2 + Math.floor(r() * 3)) / CUBO);
      for (let i = 0; i < motas; i++) {
        const c = r() < 0.5 ? tono(P.hierba, Math.min(1, v + 0.25 + r() * 0.2)) : tono(P.suelo, r());
        saco.cubo('solido', px + (r() - 0.5) * 0.8, cima + 0.14, pz + (r() - 0.5) * 0.8, 0.22 * CUBO, 0.04, 0.22 * CUBO, c);
      }
    }
  }
  return { alturas, agua, cima: (x, z) => {
    const ix = Math.max(0, Math.min(ANCHO - 1, Math.floor(x + ANCHO / 2)));
    const iz = Math.max(0, Math.min(FONDO - 1, Math.floor(z + FONDO / 2)));
    return { y: alturas[ix][iz] * 0.5 + 0.13, agua: agua[ix][iz] };
  } };
}

/* ---- la vegetación ----------------------------------------------------------- */

const SOL = new THREE.Vector3();

// Una bola de follaje hecha de cubos, sombreada "a mano": más clara arriba y del lado del sol.
function bola(saco, r, cx, cy, cz, radio, colores, tam = 0.6, densidad = 1, tipo = 'hoja') {
  const n = Math.floor(radio * radio * 9 * densidad / (CUBO * CUBO));
  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (d.lengthSq() > 1) { i--; continue; }
    const l = Math.cbrt(r()) * 0.35 + 0.65; // sobre todo en la cáscara
    d.normalize().multiplyScalar(l);
    const luz = d.dot(SOL) * 0.5 + 0.5;
    let t = (d.y * 0.5 + 0.5) * 0.4 + luz * 0.6;
    t = Math.round(t * 4) / 4 + (r() - 0.5) * 0.07;
    const s = tam * CUBO * (0.85 + r() * 0.3);
    saco.cubo(tipo, cx + d.x * radio, cy + d.y * radio * 0.8, cz + d.z * radio, s, s, s, tono(colores, t), 0, r() * 1.5, 0);
  }
}

function tronco(saco, r, x, y, z, alto, grueso, colores, inclina = 0) {
  const tramo = 0.5 * CUBO;
  const tramos = Math.ceil(alto / tramo);
  let ox = 0, oz = 0;
  for (let i = 0; i < tramos; i++) {
    ox += inclina * tramo; oz += (r() - 0.5) * 0.04 * CUBO;
    const g = grueso * (1 - (i / tramos) * 0.35);
    saco.cubo('solido', x + ox, y + i * tramo + tramo / 2, z + oz, g, tramo * 1.04, g, tono(colores, r() * 0.6 + (i % 3 === 0) * 0.25));
  }
  // raíces
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + r() * 0.5;
    saco.cubo('solido', x + Math.cos(a) * grueso * 0.7, y + 0.12, z + Math.sin(a) * grueso * 0.7, grueso * 0.6, 0.25, grueso * 0.35, tono(colores, 0.2), 0, -a, 0);
  }
  return { x: x + ox, y: y + tramos * tramo, z: z + oz };
}

const ARBOLES = {
  redondo(saco, r, x, y, z, P, esc = 1) {
    const top = tronco(saco, r, x, y, z, (2.4 + r() * 1.8) * esc, 0.5 * esc, P.tronco, (r() - 0.5) * 0.06);
    const bolas = 3 + Math.floor(r() * 3);
    for (let i = 0; i < bolas; i++) {
      const a = r() * Math.PI * 2, d = i === 0 ? 0 : (0.8 + r() * 0.7) * esc;
      bola(saco, r, top.x + Math.cos(a) * d, top.y + (r() * 0.8 + 0.6) * esc, top.z + Math.sin(a) * d * 0.7, (1.1 + r() * 0.7) * esc, P.copa);
    }
  },
  pino(saco, r, x, y, z, P, esc = 1) {
    const alto = (3.5 + r() * 2.5) * esc;
    const top = tronco(saco, r, x, y, z, alto * 0.45, 0.4 * esc, P.tronco);
    const pisos = 6;
    for (let i = 0; i < pisos; i++) {
      const rad = (1.5 - i * 0.22) * esc, yy = top.y + i * alto * 0.11;
      const n = Math.floor(rad * 16 / (CUBO * CUBO));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r(), d = rad * Math.sqrt(r());
        const luz = Math.cos(a - Math.atan2(SOL.z, SOL.x)) * 0.5 + 0.5;
        saco.cubo('hoja', top.x + Math.cos(a) * d, yy - d * 0.25, top.z + Math.sin(a) * d, 0.42 * CUBO, 0.3 * CUBO, 0.42 * CUBO, tono(P.pino || P.copa, luz * 0.6 + i / pisos * 0.4));
      }
    }
  },
  palmera(saco, r, x, y, z, P, esc = 1) {
    const inc = (r() - 0.5) * 0.25;
    const top = tronco(saco, r, x, y, z, (3 + r() * 2) * esc, 0.32 * esc, P.tronco, inc);
    const hojas = 7 + Math.floor(r() * 3);
    for (let k = 0; k < hojas; k++) {
      const a = (k / hojas) * Math.PI * 2 + r() * 0.4;
      for (let k = 0; k < 18; k++) {
        const s = k / 2;
        const d = s * 0.32 * esc, caida = (s * s) * 0.018 * esc;
        const luz = Math.cos(a - Math.atan2(SOL.z, SOL.x)) * 0.5 + 0.5;
        saco.cubo('hoja', top.x + Math.cos(a) * d, top.y + 0.3 - caida, top.z + Math.sin(a) * d, (0.42 - s * 0.025) * CUBO * 1.3, 0.08 * CUBO, (0.42 - s * 0.025) * CUBO * 1.3, tono(P.palma || P.copa, luz * 0.7 + 0.15 - s * 0.03), 0, -a, 0);
      }
    }
    bola(saco, r, top.x, top.y + 0.1, top.z, 0.35, P.tronco, 0.25, 2, 'solido');
  },
  gigante(saco, r, x, y, z, P, esc = 1) {
    const top = tronco(saco, r, x, y, z, (5.5 + r() * 2) * esc, 0.85 * esc, P.tronco);
    // contrafuertes
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r();
      for (let s = 0; s < 3; s++) saco.cubo('solido', x + Math.cos(a) * (0.5 + s * 0.3), y + 0.6 - s * 0.2, z + Math.sin(a) * (0.5 + s * 0.3), 0.18, 1.2 - s * 0.35, 0.5, tono(P.tronco, 0.3), 0, -a, 0);
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = r() * 2.2 * esc;
      bola(saco, r, top.x + Math.cos(a) * d, top.y + r() * 0.8, top.z + Math.sin(a) * d * 0.7, (1.2 + r() * 0.6) * esc, P.copa, 0.45, 0.9);
    }
    // lianas colgando
    for (let k = 0; k < 6; k++) {
      const lx = top.x + (r() - 0.5) * 3.5, lz = top.z + (r() - 0.5) * 2, largo = 2 + r() * 3;
      for (let s = 0; s < largo / 0.3; s++) saco.cubo('hoja', lx + Math.sin(s * 0.6) * 0.05, top.y - 0.5 - s * 0.3, lz, 0.09, 0.32, 0.09, tono(P.copa, 0.25 + r() * 0.2));
    }
  },
  seco(saco, r, x, y, z, P, esc = 1) {
    const top = tronco(saco, r, x, y, z, (2.5 + r() * 1.5) * esc, 0.38 * esc, P.tronco);
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      for (let s = 0; s < 5; s++) saco.cubo('solido', top.x + Math.cos(a) * s * 0.28, top.y - 0.4 + s * 0.22, top.z + Math.sin(a) * s * 0.28, 0.14, 0.14, 0.14, tono(P.tronco, 0.4));
    }
    if (P.musgo) bola(saco, r, top.x, top.y, top.z, 0.6, P.musgo, 0.3, 0.6);
  },
};

function arbusto(saco, r, x, y, z, P) {
  bola(saco, r, x, y + 0.35, z, 0.45 + r() * 0.35, P.arbusto || P.copa, 0.3, 1.3);
  if (P.bayas && r() < 0.5) for (let i = 0; i < 4; i++) saco.cubo('solido', x + (r() - 0.5) * 0.7, y + 0.4 + r() * 0.4, z + (r() - 0.5) * 0.7, 0.1, 0.1, 0.1, col(P.bayas));
}

function helecho(saco, r, x, y, z, P) {
  const n = 5 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5;
    for (let k = 0; k < 10; k++) {
      const s = k / 2;
      const d = s * 0.16;
      saco.cubo('hoja', x + Math.cos(a) * d, y + 0.1 + s * 0.09 - s * s * 0.025, z + Math.sin(a) * d, 0.16 * CUBO, 0.05 * CUBO, 0.12 * CUBO, tono(P.helecho || P.hierba, 0.4 + s * 0.12), 0, -a, 0);
    }
  }
}

function matojo(saco, r, x, y, z, P) {
  const n = (3 + Math.floor(r() * 3)) * 2;
  for (let k = 0; k < n; k++) {
    const h = 0.18 + r() * 0.3;
    saco.cubo('hoja', x + (r() - 0.5) * 0.25, y + h / 2, z + (r() - 0.5) * 0.25, 0.07 * CUBO, h, 0.07 * CUBO, tono(P.hierba, 0.5 + r() * 0.5), (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
  }
}

function flor(saco, r, x, y, z, P) {
  saco.cubo('hoja', x, y + 0.12, z, 0.05, 0.24, 0.05, tono(P.hierba, 0.6));
  const c = col(P.flores[Math.floor(r() * P.flores.length)]);
  saco.cubo('solido', x, y + 0.27, z, 0.13, 0.08, 0.13, c);
}

function seta(saco, r, x, y, z, P, brilla) {
  const h = 0.15 + r() * 0.15;
  saco.cubo('solido', x, y + h / 2, z, 0.07, h, 0.07, col('#e8dcc4'));
  const c = brilla ? col(P.setaBrillo) : col(r() < 0.6 ? '#b8321f' : '#8a5a33');
  saco.cubo(brilla ? 'brillo' : 'solido', x, y + h, z, 0.24, 0.09, 0.24, c);
  if (!brilla && r() < 0.6) saco.cubo('solido', x + 0.04, y + h + 0.05, z, 0.05, 0.02, 0.05, col('#f3eee2'));
}

function roca(saco, r, x, y, z, P) {
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.3 + r() * 0.5;
    saco.cubo('solido', x + (r() - 0.5) * 0.6, y + s * 0.35, z + (r() - 0.5) * 0.6, s, s * 0.7, s * 0.9, tono(P.roca, r() * 0.7 + 0.2), r() * 0.3, r() * 3, r() * 0.3);
    if (P.musgo && r() < 0.6) saco.cubo('solido', x + (r() - 0.5) * 0.4, y + s * 0.72, z + (r() - 0.5) * 0.4, s * 0.6, 0.06, s * 0.6, tono(P.musgo, r()));
  }
}

function tronquito(saco, r, x, y, z, P) {
  const a = r() * Math.PI, largo = 1.6 + r() * 1.2;
  for (let s = 0; s < largo / 0.4; s++) {
    const d = s * 0.4 - largo / 2;
    saco.cubo('solido', x + Math.cos(a) * d, y + 0.2, z + Math.sin(a) * d, 0.42, 0.36, 0.36, tono(P.tronco, 0.3 + (s % 2) * 0.2), 0, -a, 0);
    if (P.musgo && r() < 0.5) saco.cubo('solido', x + Math.cos(a) * d, y + 0.4, z + Math.sin(a) * d, 0.3, 0.06, 0.3, tono(P.musgo, r()));
  }
  seta(saco, r, x, y + 0.36, z, P, false);
}

function ruinas(saco, r, x, y, z, P) {
  // un muro roto y dos columnas
  for (let i = 0; i < 6; i++) {
    const alto = 1 + Math.floor(r() * 4);
    for (let j = 0; j < alto; j++) saco.cubo('solido', x + i * 0.62, y + j * 0.42 + 0.21, z, 0.6, 0.4, 0.55, tono(P.piedra, r() * 0.6 + 0.2));
    if (r() < 0.6) for (let s = 0; s < 3 + r() * 4; s++) saco.cubo('hoja', x + i * 0.62 + (r() - 0.5) * 0.3, y + alto * 0.42 - s * 0.25, z + 0.3, 0.12, 0.26, 0.05, tono(P.copa, 0.3 + r() * 0.3));
  }
  for (const dx of [-1.6, 5.2]) {
    const alto = 3 + Math.floor(r() * 3);
    for (let j = 0; j < alto; j++) saco.cubo('solido', x + dx, y + j * 0.5 + 0.25, z + 1.2, 0.7, 0.48, 0.7, tono(P.piedra, 0.3 + (j % 2) * 0.25));
    saco.cubo('solido', x + dx, y + alto * 0.5 + 0.1, z + 1.2, 0.95, 0.2, 0.95, tono(P.piedra, 0.75));
  }
  // un ídolo
  saco.cubo('solido', x + 2, y + 0.5, z + 1.6, 0.9, 1, 0.7, tono(P.piedra, 0.5));
  saco.cubo('brillo', x + 2, y + 0.75, z + 1.96, 0.5, 0.12, 0.05, col(P.setaBrillo || '#7ff2d8'));
}

/* ---- los bichos (se mueven, van aparte) -------------------------------------- */

function figura(piezas) {
  const g = new THREE.Group();
  for (const [x, y, z, sx, sy, sz, c] of piezas) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

const BICHOS = {
  ciervo: () => figura([
    [0, 0.75, 0, 1.0, 0.45, 0.4, '#9a5b2e'], [0, 0.62, 0, 0.8, 0.12, 0.36, '#e9d2b0'],
    [-0.38, 0.3, 0.13, 0.1, 0.6, 0.1, '#7a4422'], [-0.38, 0.3, -0.13, 0.1, 0.6, 0.1, '#7a4422'],
    [0.38, 0.3, 0.13, 0.1, 0.6, 0.1, '#7a4422'], [0.38, 0.3, -0.13, 0.1, 0.6, 0.1, '#7a4422'],
    [0.55, 1.05, 0, 0.18, 0.5, 0.2, '#9a5b2e'], [0.72, 1.3, 0, 0.36, 0.22, 0.22, '#9a5b2e'],
    [0.9, 1.27, 0, 0.08, 0.08, 0.1, '#1d1410'], [0.62, 1.55, 0.1, 0.05, 0.35, 0.05, '#e8dcc4'],
    [0.62, 1.55, -0.1, 0.05, 0.35, 0.05, '#e8dcc4'], [0.7, 1.68, 0.1, 0.2, 0.05, 0.05, '#e8dcc4'],
    [0.7, 1.68, -0.1, 0.2, 0.05, 0.05, '#e8dcc4'], [-0.52, 0.85, 0, 0.12, 0.14, 0.12, '#f1e6d4'],
  ]),
  conejo: () => figura([
    [0, 0.17, 0, 0.32, 0.24, 0.22, '#b49a7c'], [0.17, 0.3, 0, 0.17, 0.17, 0.16, '#b49a7c'],
    [0.15, 0.48, 0.04, 0.05, 0.2, 0.05, '#c9b294'], [0.15, 0.48, -0.04, 0.05, 0.2, 0.05, '#c9b294'],
    [-0.18, 0.2, 0, 0.09, 0.09, 0.09, '#f4efe6'],
  ]),
  jabali: () => figura([
    [0, 0.42, 0, 0.9, 0.42, 0.42, '#4a3a33'], [0, 0.66, 0, 0.7, 0.12, 0.1, '#2c221e'],
    [0.5, 0.42, 0, 0.3, 0.3, 0.3, '#4a3a33'], [0.68, 0.38, 0, 0.12, 0.14, 0.16, '#c49a8a'],
    [0.62, 0.36, 0.13, 0.04, 0.12, 0.04, '#efe6d0'], [0.62, 0.36, -0.13, 0.04, 0.12, 0.04, '#efe6d0'],
    [-0.3, 0.12, 0.12, 0.1, 0.24, 0.1, '#332823'], [-0.3, 0.12, -0.12, 0.1, 0.24, 0.1, '#332823'],
    [0.3, 0.12, 0.12, 0.1, 0.24, 0.1, '#332823'], [0.3, 0.12, -0.12, 0.1, 0.24, 0.1, '#332823'],
  ]),
  pajaro: (c) => figura([
    [0, 0, 0, 0.3, 0.12, 0.14, c], [0.16, 0.04, 0, 0.1, 0.1, 0.1, c], [0.23, 0.03, 0, 0.06, 0.03, 0.03, '#f2b33d'],
    [0, 0.02, 0.18, 0.18, 0.03, 0.26, c], [0, 0.02, -0.18, 0.18, 0.03, 0.26, c],
  ]),
};

/* ---- partículas --------------------------------------------------------------- */

function particulas(n, color, tam, r, gen, aditivo = false, opacidad = 1) {
  const pos = new Float32Array(n * 3);
  const datos = [];
  for (let i = 0; i < n; i++) { const d = gen(r, i); datos.push(d); pos.set([d.x, d.y, d.z], i * 3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: tam, sizeAttenuation: false, transparent: true, opacity: opacidad, depthWrite: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending });
  const p = new THREE.Points(geo, mat);
  p.userData.datos = datos;
  return p;
}

/* Rayos de luz: planos aditivos con un degradado, inclinados como la luz. */
function rayos(escena, cfg, r) {
  const lienzo = document.createElement('canvas'); lienzo.width = 4; lienzo.height = 64;
  const g = lienzo.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(lienzo);
  const lista = [];
  for (let i = 0; i < cfg.extras.rayos; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + r() * 2, 16), new THREE.MeshBasicMaterial({ map: tex, color: cfg.luz.sol, transparent: true, opacity: 0.07 + r() * 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((r() - 0.5) * 34, 6, (r() - 0.5) * 18);
    m.rotation.set(-0.6, 0.15, 0.55);
    m.userData.base = m.material.opacity; m.userData.fase = r() * 6;
    escena.add(m); lista.push(m);
  }
  return lista;
}

/* ---- montar una prueba ---------------------------------------------------------- */

export function montar(cfg) {
  const r = azar(cfg.semilla);
  const escena = new THREE.Scene();
  escena.background = col(cfg.cielo);
  if (cfg.niebla) escena.fog = new THREE.Fog(cfg.niebla.color, cfg.niebla.cerca, cfg.niebla.lejos);
  SOL.set(...cfg.luz.dir).normalize();

  const tiempo = { value: 0 }, viento = { value: cfg.viento ?? 1 };
  const saco = new Saco();
  const T = terreno(cfg, saco, r);
  const P = cfg.paleta;

  // la vegetación, por celdas, según el bioma
  const B = cfg.bioma;
  for (let x = 1; x < ANCHO - 1; x++) {
    for (let z = 1; z < FONDO - 1; z++) {
      const px = x - ANCHO / 2 + 0.5 + (r() - 0.5) * 0.6, pz = z - FONDO / 2 + 0.5 + (r() - 0.5) * 0.6;
      const c = T.cima(px, pz);
      if (c.agua) {
        if (B.nenufares && r() < B.nenufares) saco.cubo('hoja', px, c.y + 0.12, pz, 0.45, 0.03, 0.45, tono(P.copa, 0.5 + r() * 0.3), 0, r() * 3, 0);
        continue;
      }
      if (cfg.claro && Math.hypot(px - cfg.claro[0], pz - cfg.claro[1]) < cfg.claro[2]) {
        if (r() < 0.5) matojo(saco, r, px, c.y, pz, P);
        if (r() < 0.12) flor(saco, r, px, c.y, pz, P);
        continue;
      }
      const u = r();
      let acum = 0;
      let hecho = false;
      // lo que ve la cámara es más o menos |x| < 12, |z| < 9: los árboles enmarcan esa zona
      const ex = Math.abs(px) / 12, ez = Math.abs(pz) / 9;
      const borde = Math.min(1, Math.max(0, (Math.max(ex, ez) - 0.4) / 0.5));
      const factor = (0.12 + 0.88 * borde * borde) * (cfg.densidadArboles ?? 0.55);
      for (const [tipo, prob] of B.arboles) {
        acum += prob * factor;
        if (u < acum) { ARBOLES[tipo](saco, r, px, c.y, pz, P, 0.85 + r() * 0.35); hecho = true; break; }
      }
      if (hecho) continue;
      if (r() < B.arbustos) arbusto(saco, r, px, c.y, pz, P);
      if (r() < (B.helechos || 0)) helecho(saco, r, px + 0.3, c.y, pz, P);
      if (r() < B.hierba) matojo(saco, r, px, c.y, pz, P);
      if (r() < B.hierba * 0.6) matojo(saco, r, px + 0.4, c.y, pz - 0.3, P);
      if (r() < B.flores) flor(saco, r, px - 0.2, c.y, pz + 0.2, P);
      if (r() < B.setas) seta(saco, r, px, c.y, pz, P, !!cfg.extras.setasBrillo && r() < 0.6);
      if (r() < B.rocas) roca(saco, r, px, c.y, pz, P);
      if (r() < (B.troncos || 0)) tronquito(saco, r, px, c.y, pz, P);
    }
  }
  if (cfg.extras.ruinas) { const c = T.cima(-3, -2); ruinas(saco, r, -3, c.y, -2, P); }

  const cubos = Object.values(saco.tipos).reduce((n, l) => n + l.length, 0);
  const tierra = new THREE.Group();
  for (const m of saco.mallas(tiempo, viento)) tierra.add(m);
  escena.add(tierra);

  // la luz
  const sol = new THREE.DirectionalLight(cfg.luz.sol, cfg.luz.fuerza);
  sol.position.copy(SOL).multiplyScalar(40);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  escena.add(sol);
  escena.add(new THREE.HemisphereLight(cfg.luz.cielo, cfg.luz.suelo, cfg.luz.ambiente));

  // brillos (luciérnagas, setas) con alguna luz puntual de verdad
  const animar = [];
  if (cfg.extras.lucesPuntuales) {
    for (let i = 0; i < cfg.extras.lucesPuntuales; i++) {
      const l = new THREE.PointLight(cfg.extras.colorLuces || '#ffd27a', 3, 6, 1.5);
      const x = (r() - 0.5) * 34, z = (r() - 0.5) * 22;
      l.position.set(x, T.cima(x, z).y + 0.8, z);
      l.userData.fase = r() * 6;
      escena.add(l); animar.push((t) => { l.intensity = 2.2 + Math.sin(t * 2 + l.userData.fase) * 1.2; });
    }
  }

  // agua: reflejos que se mueven
  if (cfg.rio || cfg.charcas) {
    const brillos = particulas(260, cfg.paleta.reflejo || '#e6f6ff', 1, r, (r) => {
      for (;;) {
        const x = (r() - 0.5) * ANCHO, z = (r() - 0.5) * FONDO, c = T.cima(x, z);
        if (c.agua) return { x, y: c.y + 0.15, z, fase: r() * 6 };
      }
    }, true, 0.8);
    escena.add(brillos);
    animar.push((t) => {
      const pos = brillos.geometry.attributes.position;
      brillos.userData.datos.forEach((d, i) => pos.setX(i, d.x + Math.sin(t * 0.8 + d.fase) * 0.25));
      pos.needsUpdate = true;
      brillos.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;
    });
  }

  const E = cfg.extras;
  if (E.luciernagas) {
    const lu = particulas(E.luciernagas, '#f6f08a', 2, r, (r) => ({ x: (r() - 0.5) * 36, y: 0.5 + r() * 2.5, z: (r() - 0.5) * 24, fase: r() * 9, v: 0.3 + r() * 0.5 }), true);
    escena.add(lu);
    animar.push((t) => {
      const pos = lu.geometry.attributes.position;
      lu.userData.datos.forEach((d, i) => pos.setXYZ(i, d.x + Math.sin(t * d.v + d.fase) * 0.8, d.y + Math.sin(t * d.v * 1.7 + d.fase) * 0.4, d.z + Math.cos(t * d.v + d.fase) * 0.6));
      pos.needsUpdate = true;
      lu.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
    });
  }
  if (E.hojas) {
    const ho = particulas(E.hojas, E.colorHojas || '#d9822b', 2, r, (r) => ({ x: (r() - 0.5) * 40, y: r() * 9, z: (r() - 0.5) * 26, fase: r() * 9, v: 0.4 + r() * 0.5 }));
    escena.add(ho);
    animar.push((t, dt) => {
      const pos = ho.geometry.attributes.position;
      ho.userData.datos.forEach((d, i) => {
        d.y -= dt * d.v; if (d.y < 0) d.y = 9;
        pos.setXYZ(i, d.x + Math.sin(t + d.fase) * 0.6 + (9 - d.y) * 0.25, d.y, d.z);
      });
      pos.needsUpdate = true;
    });
  }
  if (E.lluvia) {
    const n = E.lluvia, pos = new Float32Array(n * 6), datos = [];
    for (let i = 0; i < n; i++) datos.push({ x: (r() - 0.5) * 44, y: r() * 14, z: (r() - 0.5) * 30, v: 14 + r() * 6 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lineas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#b9c9d6', transparent: true, opacity: 0.45 }));
    escena.add(lineas);
    animar.push((t, dt) => {
      const a = geo.attributes.position;
      datos.forEach((d, i) => {
        d.y -= dt * d.v; if (d.y < 0) d.y += 14;
        a.setXYZ(i * 2, d.x, d.y, d.z); a.setXYZ(i * 2 + 1, d.x - 0.12, d.y + 0.6, d.z);
      });
      a.needsUpdate = true;
    });
  }
  if (E.mariposas) {
    const ma = particulas(E.mariposas, E.colorMariposas || '#f7f2ff', 2, r, (r) => ({ x: (r() - 0.5) * 30, y: 0.6 + r() * 1.2, z: (r() - 0.5) * 20, fase: r() * 9 }));
    escena.add(ma);
    animar.push((t) => {
      const pos = ma.geometry.attributes.position;
      ma.userData.datos.forEach((d, i) => pos.setXYZ(i, d.x + Math.sin(t * 0.7 + d.fase) * 1.5, d.y + Math.abs(Math.sin(t * 6 + d.fase)) * 0.25, d.z + Math.sin(t * 0.5 + d.fase * 2) * 1.2));
      pos.needsUpdate = true;
    });
  }
  if (E.polvo) {
    const po = particulas(E.polvo, cfg.luz.sol, 1, r, (r) => ({ x: (r() - 0.5) * 36, y: r() * 5, z: (r() - 0.5) * 24, fase: r() * 9 }), true, 0.6);
    escena.add(po);
    animar.push((t) => {
      const pos = po.geometry.attributes.position;
      po.userData.datos.forEach((d, i) => pos.setXYZ(i, d.x + Math.sin(t * 0.2 + d.fase) * 0.8, d.y + Math.sin(t * 0.3 + d.fase) * 0.4, d.z));
      pos.needsUpdate = true;
    });
  }
  if (E.niebla) {
    const ni = particulas(E.niebla, cfg.niebla?.color || '#dfe8ee', 10, r, (r) => ({ x: (r() - 0.5) * 46, y: 0.3 + r() * 1.2, z: (r() - 0.5) * 30, fase: r() * 9 }), false, 0.07);
    escena.add(ni);
    animar.push((t) => {
      const pos = ni.geometry.attributes.position;
      ni.userData.datos.forEach((d, i) => pos.setX(i, ((d.x + t * 0.5 + 23) % 46) - 23));
      pos.needsUpdate = true;
    });
  }
  if (E.rayos) {
    const rs = rayos(escena, cfg, r);
    animar.push((t) => rs.forEach((m) => { m.material.opacity = m.userData.base * (0.75 + Math.sin(t * 0.6 + m.userData.fase) * 0.25); }));
  }

  // bichos
  for (const [tipo, n] of Object.entries(E.bichos || {})) {
    for (let i = 0; i < n; i++) {
      let x, z, c;
      for (let k = 0; k < 50; k++) { x = (r() - 0.5) * 30; z = (r() - 0.5) * 18; c = T.cima(x, z); if (!c.agua) break; }
      if (tipo === 'pajaro') {
        const p = BICHOS.pajaro(E.colorPajaro || '#2f4f6f');
        const cx = x, cz = z, rad = 3 + r() * 4, alt = 5 + r() * 3, v = 0.5 + r() * 0.4, fase = r() * 6;
        escena.add(p);
        animar.push((t) => {
          const a = t * v + fase;
          p.position.set(cx + Math.cos(a) * rad, alt + Math.sin(t * 2 + fase) * 0.3, cz + Math.sin(a) * rad * 0.6);
          p.rotation.y = -a - Math.PI / 2;
          p.children[3].rotation.x = Math.sin(t * 14) * 0.7; p.children[4].rotation.x = -Math.sin(t * 14) * 0.7;
        });
        continue;
      }
      const b = BICHOS[tipo]();
      b.position.set(x, c.y, z); b.rotation.y = r() * Math.PI * 2;
      escena.add(b);
      const fase = r() * 6, y0 = c.y;
      if (tipo === 'conejo') animar.push((t) => { const s = Math.max(0, Math.sin(t * 3 + fase)); b.position.y = y0 + s * s * 0.25; });
      if (tipo === 'ciervo') animar.push((t) => { b.children[6].rotation.z = Math.sin(t * 0.7 + fase) * 0.25; });
    }
  }

  // la cámara: vista 3/4 casi frontal (como Children of Morta) o diagonal (isométrica)
  const alto = cfg.camara.alto;
  const cam = new THREE.OrthographicCamera(-alto * 16 / 18, alto * 16 / 18, alto / 2, -alto / 2, 0.1, 200);
  const el = THREE.MathUtils.degToRad(cfg.camara.elevacion), az = THREE.MathUtils.degToRad(cfg.camara.azimut);
  cam.position.set(Math.sin(az) * Math.cos(el) * 60, Math.sin(el) * 60, Math.cos(az) * Math.cos(el) * 60);
  cam.lookAt(0, 0, 0);

  let t0 = 0;
  return {
    escena, cam, cubos: saco.stats.voxeles, triangulos: saco.stats.triangulos,
    paso(t) {
      const dt = Math.min(0.05, t - t0 || 0.016); t0 = t;
      tiempo.value = t;
      for (const f of animar) f(t, dt);
    },
  };
}

/* ---- el retoque final ------------------------------------------------------------ */

export function retoque() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tProf: { value: null }, res: { value: new THREE.Vector2() },
      contraste: { value: 1.1 }, saturacion: { value: 1.1 }, tinte: { value: new THREE.Color(1, 1, 1) },
      sombra: { value: new THREE.Color(0.3, 0.2, 0.45) }, luzTinte: { value: new THREE.Color(1, 0.95, 0.85) },
      niveles: { value: 24 }, tramado: { value: 1 }, contorno: { value: 0.35 }, vineta: { value: 0.35 },
      lejos: { value: 200 }, persp: { value: 0 }, cerca: { value: 0.1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor; uniform sampler2D tProf; uniform vec2 res;
      uniform float contraste, saturacion, niveles, tramado, contorno, vineta, lejos, persp, cerca;
      // en perspectiva la profundidad no es lineal: se pasa a distancia (0..1 entre cerca y lejos)
      float lin(float d){ if (persp < 0.5) return d; float f = cerca + lejos; return (cerca * f / (f - d * (f - cerca))) / lejos; }
      uniform vec3 tinte, sombra, luzTinte;
      varying vec2 vUv;
      float bayer(vec2 p){
        int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
        int i = x + y * 4;
        int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
        return float(m[i]) / 16.0 - 0.5;
      }
      vec3 aSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec3 c = aSRGB(max(texture2D(tColor, vUv).rgb, 0.0));
        // contorno suave: el píxel que está bastante más cerca que algún vecino se oscurece
        vec2 px = 1.0 / res;
        float d = lin(texture2D(tProf, vUv).r);
        float m = max(max(lin(texture2D(tProf, vUv + vec2(px.x, 0.)).r), lin(texture2D(tProf, vUv - vec2(px.x, 0.)).r)),
                      max(lin(texture2D(tProf, vUv + vec2(0., px.y)).r), lin(texture2D(tProf, vUv - vec2(0., px.y)).r)));
        float borde = step(0.6 / lejos, m - d);
        c *= 1.0 - borde * contorno;
        // gradación: contraste, saturación, sombras teñidas y luces cálidas
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturacion);
        c = (c - 0.5) * contraste + 0.5;
        l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c * (0.55 + sombra), c, smoothstep(0.0, 0.5, l));
        c = mix(c, c * luzTinte * 1.15, smoothstep(0.55, 1.0, l));
        c *= tinte;
        // viñeta
        vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * vineta * 2.2;
        // posterizado con tramado ordenado
        c = floor(clamp(c, 0.0, 1.0) * niveles + 0.5 + bayer(gl_FragCoord.xy) * tramado) / niveles;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}
