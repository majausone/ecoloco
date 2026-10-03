// El mapa del mundo vivo: toda la rejilla del motor (nx × ny cuadros de `celda` metros). Sin
// gráficos: alturas, agua, árboles y setas como datos, que usan la simulación de los animales
// (para buscar comida, agua y refugio) y la parte visual (para dibujarlo igual).
//
// Coordenadas: metros, x hacia la derecha y z hacia abajo; el cuadro (ix, iz) del motor va de
// x = ix·celda a (ix+1)·celda y de z = iz·celda a (iz+1)·celda (fila iz = floor(id / nx),
// como el territorio de las cohortes del motor). Escala visual: 1 unidad = 1 m.
//
// Las plantas salen de las cohortes de plantas del motor de cada cuadro, por BALDOSAS de
// 30 m: en cada baldosa hay, de cada cohorte, los troncos que tocan por su densidad
// (n / área del cuadro), redondeados con un azar fijo de la baldosa y la cohorte, y cada
// tronco tiene su sitio fijo. Así el bosque es siempre el mismo y, de un día a otro, solo
// cambia donde el motor dice que nace o muere algo.

import { Azar, ruido2 } from './azar.js?v=202610032115';

export const BALDOSA = 30;

// especie de dibujo de cada árbol según su tipo (PFT) y su diámetro (m), de
// graficos/pruebas-morta/borneo/especies.js; el peso es su frecuencia relativa
const ESPECIES_ARBOL = [
  { pft: 'broadleaf', dbhMin: 0.7, opciones: [['dipterocarpo', 3], ['agathis', 1]] },
  { pft: 'broadleaf', dbhMin: 0.4, opciones: [['higuera', 2], ['roble', 3], ['dillenia', 2], ['dipterocarpo', 1]] },
  { pft: 'broadleaf', dbhMin: 0.2, opciones: [['roble', 4], ['palma-cola-pez', 2], ['dillenia', 2], ['higuera', 1]] },
  { pft: 'broadleaf', dbhMin: 0, opciones: [['pinanga', 3], ['roble', 2], ['palma-cola-pez', 1]] },
  { pft: 'shrub', dbhMin: 0, opciones: [['phrynium', 4], ['helecho-dipteris', 4], ['jengibre-antorcha', 2], ['rododendro', 1], ['pino-apio', 1], ['nepenthes-stenophylla', 1]] },
];
// cuánta fruta da cada especie respecto a su copa (las higueras, mucha más: especie clave)
const FRUTO = { higuera: 6, 'palma-cola-pez': 2, dillenia: 1.5, dipterocarpo: 1, agathis: 0.5, roble: 1, pinanga: 1.5, 'jengibre-antorcha': 1 };
const SETAS_RAIZ = ['amanita', 'russula', 'boleto-ruibarbo'];
const SETAS_TRONCO = ['falo-velo', 'estrella-roja', 'copa-tropical', 'repisa', 'poros-luminosos', 'mycena-verde'];

// las especies de plantas y setas que pueden salir en el mundo (para la portada)
export const PLANTAS_DEL_MUNDO = [...new Set(ESPECIES_ARBOL.flatMap((f) => f.opciones.map(([e]) => e)))];
export const SETAS_DEL_MUNDO = [...SETAS_RAIZ, ...SETAS_TRONCO];
const filaEspecies = (pft, dbh) => ESPECIES_ARBOL.find((e) => e.pft === pft && dbh >= e.dbhMin) || ESPECIES_ARBOL[ESPECIES_ARBOL.length - 1];
// fruta media por copa de una fila de especies (para repartir la fruta del cuadro)
const frutoMedio = (fila) => { const t = fila.opciones.reduce((s, o) => s + o[1], 0); return fila.opciones.reduce((s, [e, p]) => s + (FRUTO[e] ?? 0.3) * p, 0) / t; };

export function hashTexto(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h | 0; }

function elegirPeso(az, opciones) {
  const t = opciones.reduce((s, o) => s + o[1], 0);
  let u = az.r() * t;
  for (const [n, p] of opciones) { u -= p; if (u <= 0) return n; }
  return opciones[opciones.length - 1][0];
}

export class Mapa {
  // opciones (de la configuración del mundo, mundo/config.js): rio (arroyo, ancho, ninguno),
  // charcas (ninguna, pocas, muchas) y quitar (especies de plantas y setas que no salen)
  // areaCelda: los m² de verdad de cada cuadro del motor, si se dibuja a otro tamaño (el
  // diorama: siempre 90 m de lado, sea cual sea el cuadro que representa)
  constructor({ nx = 9, ny = 9, celda = 90, areaCelda = null, diorama = null, semilla = 1, rio = 'arroyo', charcas = 'pocas', quitar = [] } = {}) {
    this.nx = nx; this.ny = ny; this.celda = celda; this.areaCelda = areaCelda || celda * celda;
    this.ancho = nx * celda; this.alto = ny * celda;
    this.semilla = semilla;
    this.dio = diorama ?? Math.floor(ny / 2) * nx + Math.floor(nx / 2);
    this._ruido = ruido2(semilla);
    // el centro del mundo: el del cuadro central (ahí empieza la cámara)
    const c0 = this.centroCelda(this.dio);
    this.centro = c0;
    // el arroyo cruza la rejilla de arriba abajo pasando cerca del centro
    const az = new Azar(semilla, 11);
    this.rio = { x: c0.x + 4.5 + az.r() * 13.5, amplitud: 6 + az.r() * 4, onda: 0.035 + az.r() * 0.02, fase: az.r() * 6.28, ancho: 3.2 };
    if (rio === 'ancho') { this.rio.ancho = 9; this.rio.amplitud *= 2; this.rio.onda *= 0.6; }
    if (rio === 'ninguno') this.rio = null;
    // un manantial o charca por cuadro para los que no llegan al arroyo (o muchas, o ninguna):
    // charcas[cuadro] = lista de charcas del cuadro
    this.charcas = [];
    for (let c = 0; c < nx * ny; c++) {
      const cx = (c % nx) * celda, cz = Math.floor(c / nx) * celda;
      const una = { celda: c, x: cx + celda * (0.2 + 0.6 * az.r()), z: cz + celda * (0.2 + 0.6 * az.r()), radio: 1.5 + az.r() };
      this.charcas.push(charcas === 'ninguna' ? [] : [una]);
    }
    if (charcas === 'muchas') {
      // unas 4 por hectárea, de 2 a 6 m (como mucho 40 por cuadro)
      const az2 = new Azar(semilla, 12), k = Math.min(40, Math.max(3, Math.round(celda * celda / 1e4 * 4)));
      for (let c = 0; c < nx * ny; c++) {
        const cx = (c % nx) * celda, cz = Math.floor(c / nx) * celda;
        for (let j = 0; j < k; j++) this.charcas[c].push({ celda: c, x: cx + celda * (0.05 + 0.9 * az2.r()), z: cz + celda * (0.05 + 0.9 * az2.r()), radio: 2 + az2.r() * 4 });
      }
    }
    this.quitar = new Set(quitar);
    this.plantas = null;      // plantas de cada cuadro del motor (las del último día)
  }

  // área en común de un rectángulo con un cuadro del motor
  solape(r, c) {
    const x0 = (c % this.nx) * this.celda, z0 = Math.floor(c / this.nx) * this.celda;
    const w = Math.min(r.x1, x0 + this.celda) - Math.max(r.x0, x0), h = Math.min(r.z1, z0 + this.celda) - Math.max(r.z0, z0);
    return w > 0 && h > 0 ? w * h : 0;
  }
  // qué parte de un territorio (lista de cuadros) cae dentro de un rectángulo
  fraccion(r, territorio) {
    if (!territorio?.length) return 0;
    let s = 0;
    for (const c of territorio) s += this.solape(r, c);
    return s / (territorio.length * this.celda * this.celda);
  }
  // un punto al azar en lo común de un rectángulo y un territorio
  puntoEn(r, territorio, az) {
    const cs = territorio.filter((c) => this.solape(r, c) > 0);
    for (let k = 0; k < 20 && cs.length; k++) {
      const c = cs[az.entero(cs.length)];
      const x0 = Math.max(r.x0, (c % this.nx) * this.celda), x1 = Math.min(r.x1, (c % this.nx + 1) * this.celda);
      const z0 = Math.max(r.z0, Math.floor(c / this.nx) * this.celda), z1 = Math.min(r.z1, (Math.floor(c / this.nx) + 1) * this.celda);
      const x = az.entre(x0, x1), z = az.entre(z0, z1);
      if (!this.esAgua(x, z)) return { x, z };
    }
    return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
  }

  // ---------------------------------------------------------------- geografía
  rioX(z) { return this.rio ? this.rio.x + Math.sin(z * this.rio.onda + this.rio.fase) * this.rio.amplitud : -1e9; }
  distRio(x, z) { return this.rio ? Math.abs(x - this.rioX(z)) - this.rio.ancho / 2 : 1e9; }
  altura(x, z) {
    let h = (this._ruido(x * 0.02, z * 0.02) - 0.5) * 6 + (this._ruido(x * 0.07 + 30, z * 0.07) - 0.5) * 1.5;
    const d = this.distRio(x, z);
    if (d < 6) h = Math.min(h, -0.6 + Math.max(0, d) * 0.25 + (h + 0.6) * Math.max(0, d / 6) ** 2); // vaguada del arroyo
    return h;
  }
  esAgua(x, z) {
    if (this.distRio(x, z) < 0) return true;
    for (const c of this.charcas[this.celdaDe(x, z)]) if (Math.hypot(x - c.x, z - c.z) < c.radio) return true;
    return false;
  }
  // el punto de agua más cercano (orilla del arroyo o charca de su cuadro)
  aguaCercana(x, z) {
    let mejor = null, md = Infinity;
    if (this.rio) {
      const xr = this.rioX(z), lado = x < xr ? -1 : 1;
      mejor = { x: xr + lado * (this.rio.ancho / 2 + 0.4), z }; md = Math.abs(mejor.x - x);
    }
    for (const ch of this.charcas[this.celdaDe(x, z)]) {
      const p = { x: ch.x + (x > ch.x ? 1 : -1) * (ch.radio + 0.3), z: ch.z }, d = Math.hypot(p.x - x, p.z - z);
      if (d < md) { md = d; mejor = p; }
    }
    // sin río ni charca en su cuadro: el centro del mundo (algún manantial habrá)
    return mejor || { x: this.centro.x, z: this.centro.z };
  }
  celdaDe(x, z) {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.celda)));
    const iz = Math.min(this.ny - 1, Math.max(0, Math.floor(z / this.celda)));
    return ix + iz * this.nx;
  }
  centroCelda(c) { return { x: ((c % this.nx) + 0.5) * this.celda, z: (Math.floor(c / this.nx) + 0.5) * this.celda }; }
  puntoEnCelda(c, az, margen = 2) {
    const x0 = (c % this.nx) * this.celda, z0 = Math.floor(c / this.nx) * this.celda;
    for (let k = 0; k < 20; k++) {
      const x = x0 + margen + az.r() * (this.celda - 2 * margen), z = z0 + margen + az.r() * (this.celda - 2 * margen);
      if (!this.esAgua(x, z)) return { x, z };
    }
    return { x: x0 + this.celda / 2, z: z0 + this.celda / 2 };
  }
  enMundo(x, z) { return x >= 0 && z >= 0 && x < this.ancho && z < this.alto; }

  // ---------------------------------------------------------------- plantas del mundo
  // plantas: lo que da el motor de cada cuadro (PuenteMotor.todasLasPlantas). Las baldosas se
  // generan al pedirlas (son deterministas: salen iguales siempre) y se guardan hasta el día
  // siguiente, que pueden cambiar porque el motor dice que nacen o mueren plantas.
  actualizarPlantas(plantas) {
    if (plantas) this.plantas = plantas;
    this._baldosas = new Map();
    this._pesos = new Map();
  }
  // lo mismo, poco a poco (para la parte visual, sin tirones): genera con las plantas nuevas
  // las baldosas que se le digan, una por paso (yield), sin tocar lo que se está dibujando, y
  // al acabar las cambia todas de una vez
  *prepararPlantas(plantas, baldosas, cadaUna = null) {
    const nuevo = [plantas, new Map(), new Map()];
    // los árboles que siguen de un día a otro se reutilizan (menos basura que recoger)
    this._previas = this._baldosas;
    for (const [bi, bj] of baldosas) {
      const viejo = [this.plantas, this._baldosas, this._pesos];
      [this.plantas, this._baldosas, this._pesos] = nuevo;
      const b = this.baldosa(bi, bj);
      [this.plantas, this._baldosas, this._pesos] = viejo;
      if (cadaUna) cadaUna(b);
      yield;
    }
    [this.plantas, this._baldosas, this._pesos] = nuevo;
    this._previas = null;
  }
  _pesosDe(c) {
    let p = this._pesos.get(c);
    if (p) return p;
    const P = this.plantas[c], ch = P.cohortesPlantas, al = P.alometria;
    p = { copa: {}, fruta: {} };
    for (let i = 0; i < ch.pft_name.length; i++) {
      const pft = ch.pft_name[i], n = ch.n_individuals[i], copa = al.crown_area[i];
      p.copa[pft] = (p.copa[pft] || 0) + n * copa;
      p.fruta[pft] = (p.fruta[pft] || 0) + n * copa * frutoMedio(filaEspecies(pft, ch.dbh_value[i]));
    }
    this._pesos.set(c, p);
    return p;
  }
  // las especies de dibujo que se pueden elegir (sin las quitadas; si se quitan todas las de
  // un tamaño de árbol, se queda la primera: el motor sigue teniendo esos árboles)
  _opciones(fila) {
    if (!this.quitar.size) return fila.opciones;
    const l = fila.opciones.filter(([e]) => !this.quitar.has(e));
    return l.length ? l : fila.opciones.slice(0, 1);
  }
  _setas(lista) { return this.quitar.size ? lista.filter((e) => !this.quitar.has(e)) : lista; }
  // una baldosa de BALDOSA × BALDOSA m: { arboles, setas, troncos, termiteros }
  baldosa(bi, bj) {
    const clave = bi * 100000 + bj;
    let b = this._baldosas?.get(clave);
    if (b) return b;
    const B = BALDOSA, area = this.areaCelda, x0 = bi * B, z0 = bj * B;
    b = { bi, bj, arboles: [], setas: [], troncos: [], termiteros: [] };
    const c = this.celdaDe(x0 + B / 2, z0 + B / 2), P = this.plantas?.[c];
    if (P && bi >= 0 && bj >= 0 && x0 < this.ancho && z0 < this.alto) {
      const ch = P.cohortesPlantas, al = P.alometria, rc = P.recursos, pw = this._pesosDe(c);
      const grandes = [];
      const previa = this._previas?.get(clave), antes = previa && new Map(previa.arboles.map((a) => [a.id, a]));
      for (let i = 0; i < ch.pft_name.length; i++) {
        const cid = ch.cohort_id[i], hc = hashTexto(String(cid));
        const esperado = ch.n_individuals[i] * B * B / area;
        const cuantos = Math.floor(esperado + new Azar(this.semilla, 21, bi, bj, hc).r());
        const fila = filaEspecies(ch.pft_name[i], ch.dbh_value[i]);
        for (let k = 0; k < cuantos; k++) {
          const az = new Azar(this.semilla, 22, bi, bj, hc, k);
          let x = x0 + az.r() * B, z = z0 + az.r() * B;
          for (let t = 0; t < 4 && (this.esAgua(x, z) || this.distRio(x, z) < 1); t++) { x = x0 + az.r() * B; z = z0 + az.r() * B; }
          // (las baldosas de 30 m no casan con el lado del mapa: lo que cae fuera del cuadrado, fuera)
          if (this.esAgua(x, z) || !this.dentro(x, z)) continue;
          const especie = elegirPeso(az, this._opciones(fila));
          const copa = al.crown_area[i], pft = ch.pft_name[i];
          const id = `a${bi}.${bj}.${cid}.${k}`, altura = al.stem_height[i], giro = az.r() * 6.283;
          const fruta = pw.fruta[pft] ? (rc.fruta[pft] || 0) * copa * (FRUTO[especie] ?? 0.3) / pw.fruta[pft] : 0;
          const frutaSuelo = pw.fruta[pft] ? (rc.frutaSuelo[pft] || 0) * copa * (FRUTO[especie] ?? 0.3) / pw.fruta[pft] : 0;
          const hojas = pw.copa[pft] ? (rc.hojas[pft] || 0) * copa / pw.copa[pft] : 0;
          let a = antes?.get(id);
          if (a && a.especie === especie && a.x === x && a.z === z) {
            // el mismo árbol: se actualiza (si ha crecido bastante, lo guardado para dibujarlo ya no vale)
            if (a._dibujo && Math.abs(altura / (a._dibujo.alto || altura) - 1) > 0.02) a._dibujo = undefined;
            a.dbh = ch.dbh_value[i]; a.altura = altura; a.copa = copa; a.masaTronco = al.stem_mass?.[i]; a.masaHojas = al.foliage_mass?.[i]; a.n = ch.n_individuals[i]; a.fruta = fruta; a.frutaSuelo = frutaSuelo; a.hojas = hojas;
          } else a = { id, cohorte: cid, pft, especie, dbh: ch.dbh_value[i], altura, copa, x, z, giro, fruta, frutaSuelo, hojas, masaTronco: al.stem_mass?.[i], masaHojas: al.foliage_mass?.[i], n: ch.n_individuals[i] };
          b.arboles.push(a);
          if (especie === 'dipterocarpo' || especie === 'agathis') grandes.push(a);
        }
      }
      // troncos caídos (unos 6 por hectárea) y termiteros (uno cada 0,8 ha), fijos
      const azT = new Azar(this.semilla, 23, bi, bj);
      const nTroncos = Math.floor(6 * B * B / 8100 + azT.r()), hayTermitero = azT.r() < B * B / 8100;
      for (let k = 0; k < nTroncos; k++) {
        const x = x0 + 3 + azT.r() * (B - 6), z = z0 + 3 + azT.r() * (B - 6), largo = 4 + azT.r() * 8, angulo = azT.r() * Math.PI;
        const ex = Math.cos(angulo) * largo / 2, ez = Math.sin(angulo) * largo / 2;
        if (!this.esAgua(x, z) && this.dentro(x - ex, z - ez) && this.dentro(x + ex, z + ez)) b.troncos.push({ id: `t${bi}.${bj}.${k}`, x, z, largo, angulo });
      }
      if (hayTermitero) {
        const x = x0 + 5 + azT.r() * (B - 10), z = z0 + 5 + azT.r() * (B - 10);
        if (!this.esAgua(x, z) && this.dentro(x, z, 1)) b.termiteros.push({ id: `m${bi}.${bj}`, x, z });
      }
      // setas: una mata por cada 2,5 g/m² de cuerpos fructíferos (como mucho 120 por 0,8 ha),
      // cada una en su sitio fijo: junto a los árboles grandes o en los troncos caídos
      const porM2 = Math.min(120 / 8100, (rc.setas || 0) / 0.0025 / 8100);
      const nSetas = Math.floor(porM2 * B * B + new Azar(this.semilla, 24, bi, bj).r());
      for (let k = 0; k < nSetas; k++) {
        const az = new Azar(this.semilla, 25, bi, bj, k);
        if (grandes.length && az.si(0.55)) {
          const a = grandes[az.entero(grandes.length)], ang = az.r() * 6.283, r = 1.2 + az.r() * 2.5;
          const l = this._setas(SETAS_RAIZ);
          const sx = a.x + Math.cos(ang) * r, sz = a.z + Math.sin(ang) * r;
          if (l.length && this.dentro(sx, sz)) b.setas.push({ id: `s${bi}.${bj}.${k}`, especie: az.elegir(l), x: sx, z: sz });
        } else if (b.troncos.length) {
          const t = b.troncos[az.entero(b.troncos.length)], u = az.r() - 0.5;
          const l = this._setas(SETAS_TRONCO);
          if (l.length) b.setas.push({ id: `s${bi}.${bj}.${k}`, especie: az.elegir(l), x: t.x + Math.cos(t.angulo) * u * t.largo, z: t.z + Math.sin(t.angulo) * u * t.largo });
        }
      }
    }
    (this._baldosas ||= new Map()).set(clave, b);
    return b;
  }
  // si un punto está dentro del cuadrado del mapa (con un margen en m)
  dentro(x, z, m = 0) { return x >= m && z >= m && x <= this.ancho - m && z <= this.alto - m; }
  // las baldosas que tocan un círculo
  *baldosasCerca(x, z, r) {
    const B = BALDOSA;
    for (let i = Math.max(0, Math.floor((x - r) / B)); i <= Math.min(Math.ceil(this.ancho / B) - 1, Math.floor((x + r) / B)); i++)
      for (let j = Math.max(0, Math.floor((z - r) / B)); j <= Math.min(Math.ceil(this.alto / B) - 1, Math.floor((z + r) / B)); j++) yield this.baldosa(i, j);
  }
  arbolesCerca(x, z, r) { const out = []; for (const b of this.baldosasCerca(x, z, r)) for (const a of b.arboles) if (Math.hypot(a.x - x, a.z - z) < r) out.push(a); return out; }
  setasCerca(x, z, r) { const out = []; for (const b of this.baldosasCerca(x, z, r)) for (const s of b.setas) if (Math.hypot(s.x - x, s.z - z) < r) out.push(s); return out; }
  termiteroCercano(x, z, r = 120) {
    let mejor = null, md = Infinity;
    for (const b of this.baldosasCerca(x, z, r)) for (const m of b.termiteros) { const d = Math.hypot(m.x - x, m.z - z); if (d < md) { md = d; mejor = m; } }
    return mejor;
  }
}
