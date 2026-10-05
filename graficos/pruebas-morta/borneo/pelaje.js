/* EL PELAJE (y la piel, las plumas, las escamas) DE CADA ANIMAL, pintado por código en una textura
   de 256 × 256. Tres vistas del animal en reposo, como un dibujo de perfil, de arriba y de abajo:
     perfil (256 × 128, arriba), desde un costado: x a lo ancho, y a lo alto;
     lomo   (128 × 128, abajo a la izquierda), desde arriba: x y z;
     vientre(128 × 128, abajo a la derecha), desde abajo.
   En cada vista se pintan las piezas del modelo de cubos (de lejos a cerca, con sus colores: el
   pelo, la barriga, las patas, la cara, las rayas, las orejas...) y encima el dibujo de cada
   especie según sus fotos: las nubes de la pantera, los lunares del gato leopardo, la red de la
   pitón, los puntos redondos de ranas y lagartos... El shader (materialPelaje) toma de cada vista
   según hacia dónde mira la superficie (proyección en tres planos, sin costuras), con la
   posición y la normal de reposo, así que el dibujo va pegado a la piel aunque se mueva.
   Solo en el navegador (usa un canvas). */

import * as THREE from '../vendor/three.module.js';

const LADO = 256, M = 3; // M: margen en píxeles de cada vista (para que al alejarse no se mezclen)
function azar(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const css = (c) => '#' + c.getHexString(THREE.SRGBColorSpace);

// las vistas: rectángulo en el lienzo y cómo se proyecta un punto (u, v de 0 a 1) y su profundidad
function vistas(caja) {
  const t = (p) => [(p.x - caja.min.x) / (caja.max.x - caja.min.x), (p.y - caja.min.y) / (caja.max.y - caja.min.y), (p.z - caja.min.z) / (caja.max.z - caja.min.z)];
  return [
    { nombre: 'perfil', x: 0, y: 0, w: 256, h: 128, uv: (p) => { const [a, b] = t(p); return [a, 1 - b]; }, prof: (p) => p.z },
    { nombre: 'lomo', x: 0, y: 128, w: 128, h: 128, uv: (p) => { const [a, , c] = t(p); return [a, 1 - c]; }, prof: (p) => p.y },
    { nombre: 'vientre', x: 128, y: 128, w: 128, h: 128, uv: (p) => { const [a, , c] = t(p); return [a, 1 - c]; }, prof: (p) => -p.y },
  ];
}
// del espacio (u, v) de una vista a píxeles del lienzo
const px = (V, u, v) => [V.x + M + u * (V.w - 2 * M), V.y + M + v * (V.h - 2 * M)];

function esquinas(pz) {
  const out = [], h = pz.medio;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(new THREE.Vector3(sx * h.x, sy * h.y, sz * h.z).applyQuaternion(pz.giro).add(pz.centro));
  return out;
}
function envolvente(pts) { // casco convexo (monotone chain)
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (hi.length >= 2 && cruz(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// una pieza en una vista: polígono redondeado (las formas) o elipse (motas, para que sean redondas)
function pintarPieza(g, V, pz, color, { redondo = false, borde = null, suave = 1.2 } = {}) {
  const ps = esquinas(pz).map((p) => px(V, ...V.uv(p)));
  const casco = envolvente(ps);
  g.fillStyle = color;
  g.filter = suave ? `blur(${suave}px)` : 'none';
  if (redondo) {
    const xs = casco.map((p) => p[0]), ys = casco.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, rx = (Math.max(...xs) - Math.min(...xs)) / 2, ry = (Math.max(...ys) - Math.min(...ys)) / 2;
    g.beginPath(); g.ellipse(cx, cy, Math.max(0.8, rx), Math.max(0.8, ry), 0, 0, Math.PI * 2); g.fill();
    if (borde) { g.strokeStyle = borde; g.lineWidth = Math.max(1, Math.min(rx, ry) * 0.5); g.stroke(); }
    g.filter = 'none';
    return;
  }
  // esquinas romas (como la forma suave): el polígono encogido y con un trazo grueso redondeado
  const xs = casco.map((p) => p[0]), ys = casco.map((p) => p[1]);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const romo = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.3;
  const enc = casco.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1, k = Math.max(0, l - romo) / l; return [cx + dx * k, cy + dy * k]; });
  g.beginPath(); enc.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.strokeStyle = color; g.lineJoin = 'round'; g.lineWidth = romo * 2; g.stroke();
  g.filter = 'none';
}

/* Los dibujos de cada especie, encima de las piezas, solo donde está el pelo (máscara: el color
   del pelo en el lienzo). r: azar fijo por especie. */
const DIBUJOS = {
  // la pantera nebulosa: manchas grandes como nubes, con el borde negro y el centro algo más oscuro
  // que el fondo, en filas a lo largo del cuerpo; puntos negros en patas y cabeza
  nubes(g, V, p, r, zona) {
    const oscuro = p.manchas.color, centro = p.manchas.borde || p.patas, [x0, y0, w, h] = zona;
    const filas = V.nombre === 'perfil' ? 3 : 4, cols = 7;
    for (let i = 0; i < filas * cols; i++) {
      const fila = Math.floor(i / cols), col = i % cols;
      const cx = x0 + ((col + 0.5 + (fila % 2) * 0.5 + (r() - 0.5) * 0.4) / cols) * w, cy = y0 + ((fila + 0.5 + (r() - 0.5) * 0.3) / filas) * h;
      const rx = (w / cols) * (0.36 + r() * 0.14), ry = Math.min(rx * (0.7 + r() * 0.4), (h / filas) * 0.42);
      g.save(); g.translate(cx, cy); g.rotate((r() - 0.5) * 0.8);
      g.beginPath();
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2, rr = 1 + (r() - 0.5) * 0.45; g.lineTo(Math.cos(a) * rx * rr, Math.sin(a) * ry * rr); }
      g.closePath();
      g.fillStyle = centro; g.fill();
      g.strokeStyle = oscuro; g.lineWidth = Math.max(2, rx * 0.3); g.stroke();
      // unos puntos negros dentro de algunas nubes
      if (r() < 0.5) { g.fillStyle = oscuro; g.beginPath(); g.arc((r() - 0.5) * rx * 0.6, (r() - 0.5) * ry * 0.6, Math.max(1, rx * 0.12), 0, 7); g.fill(); }
      g.restore();
    }
  },
  // el gato leopardo: lunares negros macizos y pequeños por todo el cuerpo; en el lomo, en filas
  // alargadas (casi rayas) de la nuca a la cola
  lunares(g, V, p, r, zona) {
    const [x0, y0, w, h] = zona, c = p.manchas.color;
    g.fillStyle = c;
    if (V.nombre === 'lomo') for (let fila = -2; fila <= 2; fila++) for (let i = 0; i < 9; i++) {
      const cx = x0 + (0.08 + i * 0.1 + r() * 0.03) * w, cy = y0 + h * (0.5 + fila * 0.1);
      g.beginPath(); g.ellipse(cx, cy, w * (0.026 + r() * 0.014) * (Math.abs(fila) < 2 ? 1.6 : 1), h * 0.032, 0, 0, Math.PI * 2); g.fill();
    }
    const n = V.nombre === 'perfil' ? 42 : 24;
    for (let i = 0; i < n; i++) { const cx = x0 + r() * w, cy = y0 + r() * h, k = 0.7 + r() * 0.7; g.beginPath(); g.ellipse(cx, cy, w * 0.016 * k, h * 0.04 * k, (r() - 0.5) * 0.6, 0, Math.PI * 2); g.fill(); }
  },
  // la pitón reticulada: una red de líneas oscuras con rombos claros dentro
  reticulado(g, V, p, r, zona) {
    const [x0, y0, w, h] = zona;
    g.strokeStyle = p.bandas; g.lineWidth = 2.2;
    const paso = w / 22;
    for (let i = -2; i < 26; i++) {
      const x = x0 + i * paso;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + paso, y0 + h * 0.5); g.lineTo(x, y0 + h); g.stroke();
      g.beginPath(); g.moveTo(x + paso, y0); g.lineTo(x, y0 + h * 0.5); g.lineTo(x + paso, y0 + h); g.stroke();
    }
    if (p.rombos) { g.fillStyle = p.rombos; for (let i = 0; i < 22; i++) { const cx = x0 + (i + 0.5) * paso, cy = y0 + h * 0.5; g.beginPath(); g.moveTo(cx, cy - h * 0.12); g.lineTo(cx + paso * 0.3, cy); g.lineTo(cx, cy + h * 0.12); g.lineTo(cx - paso * 0.3, cy); g.closePath(); g.fill(); } }
  },
  // escamas: un punteado fino (lagartos y serpientes)
  escamas(g, V, p, r, zona) {
    const [x0, y0, w, h] = zona;
    for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(x0 + r() * w, y0 + r() * h, 1.5, 1.5); }
  },
};
function dibujoDe(p) {
  if (p.manchas?.borde) return 'nubes';
  if (p.manchas) return 'lunares';
  if (p.rombos) return 'reticulado';
  if (p.rig === 'serpiente' || p.rig === 'reptil') return 'escamas';
  return null;
}

/* Pinta el pelaje de una especie: piezas (de suavizar.js), su caja y los datos del modelo. */
export function pintarPelaje(piezas, caja, especie) {
  const p = especie.modelo, r = azar([...especie.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0);
  const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(LADO, LADO) : Object.assign(document.createElement('canvas'), { width: LADO, height: LADO });
  const g = lienzo.getContext('2d', { willReadFrequently: true });
  const formas = piezas.filter((x) => x.clase === 'forma');
  // el color de fondo: el de la forma más grande (el torso)
  const mayor = formas.reduce((a, b) => (a && a.medio.x * a.medio.y * a.medio.z > b.medio.x * b.medio.y * b.medio.z ? a : b), null);
  const fondo = mayor ? css(mayor.color) : '#888';
  const dibujo = dibujoDe(p);
  for (const V of vistas(caja)) {
    g.save(); g.beginPath(); g.rect(V.x, V.y, V.w, V.h); g.clip();
    g.fillStyle = fondo; g.fillRect(V.x, V.y, V.w, V.h);
    // de lejos a cerca
    const lista = piezas.filter((x) => x.clase !== 'ojo' && x.clase !== 'nada').sort((a, b) => V.prof(a.centro) - V.prof(b.centro));
    // primero las formas y láminas, luego lo pintado encima (rayas, motas), cada grupo de lejos a cerca
    for (const pz of lista) if (pz.clase === 'forma' || pz.clase === 'lamina' || pz.clase === 'palo') pintarPieza(g, V, pz, css(pz.color));
    // el dibujo de la especie, en la zona del cuerpo (la caja de las formas del torso en esta vista)
    if (dibujo) {
      const cuerpo = formas.filter((x) => x.hueso === 'cuerpo' || x.hueso === 'base' || /^(t|c|v|g)\d/.test(x.hueso));
      if (cuerpo.length) {
        const pts = cuerpo.flatMap((x) => esquinas(x)).map((q) => px(V, ...V.uv(q)));
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const zona = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
        g.save(); g.beginPath(); g.rect(...zona); g.clip();
        DIBUJOS[dibujo](g, V, p, r, zona);
        g.restore();
      }
    }
    // lo pintado del modelo (rayas, orejas, cara, motas; las motas, redondas). Las manchas que ya
    // salen en el dibujo de la especie (nubes, lunares) no se repiten como motas
    for (const pz of lista) if (pz.clase === 'pintura') {
      if (pz.mota && (dibujo === 'nubes' || dibujo === 'lunares') && pz.hueso === 'cuerpo') continue;
      pintarPieza(g, V, pz, css(pz.color), { redondo: pz.mota });
    }
    // un poco de grano (pelo, plumas, escamas)
    const img = g.getImageData(V.x, V.y, V.w, V.h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = 0.93 + r() * 0.12; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    g.putImageData(img, V.x, V.y);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.userData.lienzo = lienzo;
  return tex;
}

/* El material de un animal suave: Lambert con el pelaje en tres planos y el color propio de los
   ojos (aPropio). Sirve igual para el modelo con esqueleto y para el de instancias de lejos. */
export function materialPelaje(textura, caja, { extra = null } = {}) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.userData.base = m.color.clone();
  const uCaja = { min: { value: caja.min.clone() }, max: { value: caja.max.clone() } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPelaje = { value: textura }; sh.uniforms.uCajaMin = uCaja.min; sh.uniforms.uCajaMax = uCaja.max;
    sh.vertexShader = 'attribute vec4 aPropio;\nvarying vec4 vPropio;\nvarying vec3 vRep;\nvarying vec3 vNRep;\n' + (extra?.cabeceraVertex || '') + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vRep = position; vNRep = normal; vPropio = aPropio;\n${extra?.inicioVertex || ''}`);
    if (extra?.reemplazos) for (const [a, b] of extra.reemplazos) sh.vertexShader = sh.vertexShader.replace(a, b);
    sh.fragmentShader = 'uniform sampler2D uPelaje;\nuniform vec3 uCajaMin;\nuniform vec3 uCajaMax;\nvarying vec4 vPropio;\nvarying vec3 vRep;\nvarying vec3 vNRep;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 tp = clamp((vRep - uCajaMin) / max(uCajaMax - uCajaMin, vec3(1e-5)), 0.0, 1.0);
        vec3 nr = normalize(vNRep);
        float wT = pow(max(nr.y, 0.0), 3.0), wB = pow(max(-nr.y, 0.0), 3.0), wS = pow(1.0 - abs(nr.y), 1.5);
        const float m = ${(M / LADO).toFixed(5)};
        vec2 uS = vec2(m + tp.x * (1.0 - 2.0 * m), 0.5 + m + tp.y * (0.5 - 2.0 * m));
        vec2 uT = vec2(m + tp.x * (0.5 - 2.0 * m), m + tp.z * (0.5 - 2.0 * m));
        vec2 uB = vec2(0.5 + m + tp.x * (0.5 - 2.0 * m), m + tp.z * (0.5 - 2.0 * m));
        vec3 pel = (texture2D(uPelaje, uS).rgb * wS + texture2D(uPelaje, uT).rgb * wT + texture2D(uPelaje, uB).rgb * wB) / (wS + wT + wB + 1e-4);
        diffuseColor.rgb *= mix(pel, vPropio.rgb, vPropio.a);
      }`);
  };
  m.customProgramCacheKey = () => 'pelaje:' + (extra?.clave || '');
  m.userData.uCaja = uCaja;
  return m;
}
