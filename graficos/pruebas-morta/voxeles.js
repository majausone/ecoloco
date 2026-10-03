/* VÓXELES DE VERDAD. Los cubos que pone el generador (con su tamaño y su giro) se pintan
   dentro de una rejilla fija de vóxeles iguales y alineados; luego la rejilla se convierte
   en malla dibujando SOLO las caras que dan al aire, con sombreado de esquinas (oclusión
   ambiental por vértice) y un poco de variación de tono por vóxel. Se trocea en bloques de
   64×64 columnas para que, cuando algo cambie, solo haya que rehacer su trozo. */

import * as THREE from './vendor/three.module.js';

const TIPOS = ['solido', 'hoja', 'brillo', 'agua'];
const AGUA = 3;
const AO = [0.42, 0.62, 0.82, 1.0];
const TROZO = 64;

export class Rejilla {
  constructor({ x0, x1, y0, y1, z0, z1, voxel }) {
    this.v = voxel;
    this.x0 = x0; this.y0 = y0; this.z0 = z0;
    this.nx = Math.round((x1 - x0) / voxel);
    this.ny = Math.round((y1 - y0) / voxel);
    this.nz = Math.round((z1 - z0) / voxel);
    this.celdas = new Uint16Array(this.nx * this.ny * this.nz);
    this.paleta = [null]; // 0 = aire
    this.indice = new Map();
    this.llenos = 0;
  }
  i(x, y, z) { return (y * this.nz + z) * this.nx + x; }
  color(tipo, c) {
    const t = TIPOS.indexOf(tipo);
    const r = Math.round(c.r * 1023), g = Math.round(c.g * 1023), b = Math.round(c.b * 1023);
    const clave = ((t * 1024 + r) * 1024 + g) * 1024 + b;
    let p = this.indice.get(clave);
    if (p === undefined) {
      p = this.paleta.length;
      if (p > 65535) p = 1; // no debería pasar: sobran entradas
      else { this.paleta.push({ r: c.r, g: c.g, b: c.b, tipo: t }); this.indice.set(clave, p); }
    }
    return p;
  }
  poner(x, y, z, p) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return;
    const k = this.i(x, y, z);
    if (!this.celdas[k]) this.llenos++;
    this.celdas[k] = p;
  }
  /* Un cubo (centro, tamaño, giro) se rellena con los vóxeles cuyo centro cae dentro. Si es
     más pequeño que un vóxel y no pilla ningún centro, ocupa el vóxel de su centro. */
  cubo(tipo, c) {
    const V = this.v, p = this.color(tipo, c.color);
    const hx = c.sx / 2, hy = c.sy / 2, hz = c.sz / 2;
    const vx = (w) => (w - this.x0) / V - 0.5, vy = (w) => (w - this.y0) / V - 0.5, vz = (w) => (w - this.z0) / V - 0.5;
    let puestos = 0;
    if (!c.rx && !c.ry && !c.rz) {
      const ax = Math.max(0, Math.ceil(vx(c.x - hx))), bx = Math.min(this.nx - 1, Math.floor(vx(c.x + hx)));
      const ay = Math.max(0, Math.ceil(vy(c.y - hy))), by = Math.min(this.ny - 1, Math.floor(vy(c.y + hy)));
      const az = Math.max(0, Math.ceil(vz(c.z - hz))), bz = Math.min(this.nz - 1, Math.floor(vz(c.z + hz)));
      for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) { this.poner(x, y, z, p); puestos++; }
    } else {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(c.rx, c.ry, c.rz));
      const e = m.elements; // columnas: ejes locales en el mundo
      const ex = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
      const ey = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
      const ez = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
      const ax = Math.max(0, Math.ceil(vx(c.x - ex))), bx = Math.min(this.nx - 1, Math.floor(vx(c.x + ex)));
      const ay = Math.max(0, Math.ceil(vy(c.y - ey))), by = Math.min(this.ny - 1, Math.floor(vy(c.y + ey)));
      const az = Math.max(0, Math.ceil(vz(c.z - ez))), bz = Math.min(this.nz - 1, Math.floor(vz(c.z + ez)));
      for (let y = ay; y <= by; y++) {
        const dy = this.y0 + (y + 0.5) * V - c.y;
        for (let z = az; z <= bz; z++) {
          const dz = this.z0 + (z + 0.5) * V - c.z;
          for (let x = ax; x <= bx; x++) {
            const dx = this.x0 + (x + 0.5) * V - c.x;
            // al sistema del cubo: la traspuesta del giro
            const lx = e[0] * dx + e[1] * dy + e[2] * dz, ly = e[4] * dx + e[5] * dy + e[6] * dz, lz = e[8] * dx + e[9] * dy + e[10] * dz;
            if (Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz) { this.poner(x, y, z, p); puestos++; }
          }
        }
      }
    }
    if (!puestos) this.poner(Math.round(vx(c.x)), Math.round(vy(c.y)), Math.round(vz(c.z)), p);
  }

  /* ---- de rejilla a malla ---- */
  mallas(materiales) {
    const { nx, ny, nz, celdas, paleta, v: V } = this;
    const lleno = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) ? 0 : celdas[(y * nz + z) * nx + x];
    const tapa = (x, y, z) => { const q = lleno(x, y, z); return q && paleta[q].tipo !== AGUA ? 1 : 0; };
    // las seis caras: normal, y los dos ejes del plano (u, v)
    const CARAS = [
      { n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], w: [0, 1, 0] },
      { n: [0, 1, 0], u: [0, 0, 1], w: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
      { n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], w: [1, 0, 0] },
    ];
    const trozos = new Map();
    const buffer = (clave) => {
      let b = trozos.get(clave);
      if (!b) { b = { pos: new Float32Array(4096 * 3), nor: new Int8Array(4096 * 3), col: new Uint16Array(4096 * 3), ind: new Uint32Array(6144), nv: 0, ni: 0 }; trozos.set(clave, b); }
      if ((b.nv + 4) * 3 > b.pos.length) {
        const crece = (a) => { const n = new a.constructor(a.length * 2); n.set(a); return n; };
        b.pos = crece(b.pos); b.nor = crece(b.nor); b.col = crece(b.col);
      }
      if (b.ni + 6 > b.ind.length) { const n = new Uint32Array(b.ind.length * 2); n.set(b.ind); b.ind = n; }
      return b;
    };
    let caras = 0;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const p = celdas[(y * nz + z) * nx + x];
      if (!p) continue;
      const pal = paleta[p];
      // un poco de variación por vóxel, para que las caras grandes no queden planas
      let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177);
      const jit = 1 + (((h >>> 0) % 1000) / 1000 - 0.5) * 0.09;
      for (const C of CARAS) {
        const [a, b, c] = C.n;
        const q = lleno(x + a, y + b, z + c);
        if (q && (pal.tipo === AGUA || paleta[q].tipo !== AGUA)) continue; // cara tapada
        const clave = `${Math.floor(x / TROZO)},${Math.floor(z / TROZO)},${pal.tipo}`;
        const B = buffer(clave);
        const base = B.nv;
        const ao = [];
        for (let k = 0; k < 4; k++) {
          const du = k === 1 || k === 2 ? 1 : 0, dw = k >= 2 ? 1 : 0;
          const su = du ? 1 : -1, sw = dw ? 1 : -1;
          // vecinos en el plano de delante de la cara
          const nx_ = x + a, ny_ = y + b, nz_ = z + c;
          const s1 = tapa(nx_ + C.u[0] * su, ny_ + C.u[1] * su, nz_ + C.u[2] * su);
          const s2 = tapa(nx_ + C.w[0] * sw, ny_ + C.w[1] * sw, nz_ + C.w[2] * sw);
          const es = tapa(nx_ + C.u[0] * su + C.w[0] * sw, ny_ + C.u[1] * su + C.w[1] * sw, nz_ + C.u[2] * su + C.w[2] * sw);
          const nivel = s1 && s2 ? 0 : 3 - (s1 + s2 + es);
          ao.push(nivel);
          // la esquina: el vóxel va de (x,y,z) a (x+1,y+1,z+1)
          const ox = (a > 0 ? 1 : 0) + C.u[0] * du + C.w[0] * dw;
          const oy = (b > 0 ? 1 : 0) + C.u[1] * du + C.w[1] * dw;
          const oz = (c > 0 ? 1 : 0) + C.u[2] * du + C.w[2] * dw;
          const vi = B.nv * 3;
          B.pos[vi] = this.x0 + (x + ox) * V; B.pos[vi + 1] = this.y0 + (y + oy) * V; B.pos[vi + 2] = this.z0 + (z + oz) * V;
          B.nor[vi] = a * 127; B.nor[vi + 1] = b * 127; B.nor[vi + 2] = c * 127;
          const f = AO[nivel] * jit * 65535;
          B.col[vi] = Math.min(65535, pal.r * f); B.col[vi + 1] = Math.min(65535, pal.g * f); B.col[vi + 2] = Math.min(65535, pal.b * f);
          B.nv++;
        }
        // se parte el cuadrado por la diagonal que deja el sombreado sin rayas
        if (ao[0] + ao[2] > ao[1] + ao[3]) B.ind.set([base, base + 1, base + 2, base, base + 2, base + 3], B.ni);
        else B.ind.set([base + 1, base + 2, base + 3, base + 1, base + 3, base], B.ni);
        B.ni += 6;
        caras++;
      }
    }
    const salida = [];
    for (const [clave, B] of trozos) {
      const tipo = Number(clave.split(',')[2]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(B.pos.subarray(0, B.nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(B.nor.subarray(0, B.nv * 3), 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(B.col.subarray(0, B.nv * 3), 3, true));
      g.setIndex(new THREE.BufferAttribute(B.ind.subarray(0, B.ni), 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, materiales[TIPOS[tipo]]);
      m.castShadow = TIPOS[tipo] !== 'agua' && TIPOS[tipo] !== 'brillo';
      m.receiveShadow = TIPOS[tipo] !== 'brillo';
      salida.push(m);
    }
    this.caras = caras;
    return salida;
  }
}
