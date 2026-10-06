// Rejilla espacial (core/grid.py). Celdas cuadradas o hexagonales, con centroides
// calculados como GEOS (abanico de triángulos desde el primer vértice) y distancias
// como scipy.spatial.distance.pdist.

import { pow } from '../num/ucrt.js?v=202610060036';

function escalar(pol, f) { return pol.map(([x, y]) => [f * x + 0 * y + (0 - 0 * f), 0 * x + f * y + (0 - 0 * f)]); }
function trasladar(pol, dx, dy) { return pol.map(([x, y]) => [x + dx, y + dy]); }

// GEOS Centroid::addShell + getCentroid
function centroide(pts) {
  const base = pts[0];
  // Orientation::isCCW: área con signo del anillo
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  const positiva = !(a > 0);
  const signo = positiva ? 1 : -1;
  let cx = 0, cy = 0, suma2 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const t3x = base[0] + p1[0] + p2[0];
    const t3y = base[1] + p1[1] + p2[1];
    const area2 = (p1[0] - base[0]) * (p2[1] - base[1]) - (p2[0] - base[0]) * (p1[1] - base[1]);
    cx += signo * area2 * t3x;
    cy += signo * area2 * t3y;
    suma2 += signo * area2;
  }
  return [cx / 3 / suma2, cy / 3 / suma2];
}

function cuadrada(cellArea, nx, ny, xoff, yoff) {
  let proto = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const f = Math.sqrt(cellArea);
  proto = trasladar(escalar(proto, f), xoff, yoff);
  const ids = [], polis = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      ids.push(ix + iy * nx);
      polis.push(trasladar(proto, ix * f, (ny - 1 - iy) * f));
    }
  }
  return { ids, polis };
}

function hexagonal(cellArea, nx, ny, xoff, yoff) {
  const lado1 = pow(3, 1 / 4) * Math.sqrt(2 / 9);
  const apo1 = Math.sqrt(3) * lado1 / 2;
  let proto = [[apo1, 0], [2 * apo1, lado1 * 0.5], [2 * apo1, lado1 * 1.5], [apo1, lado1 * 2],
    [0, lado1 * 1.5], [0, lado1 * 0.5], [apo1, 0]];
  const f = Math.sqrt(cellArea);
  const lado = pow(3, 1 / 4) * Math.sqrt(2 * (cellArea / 9));
  const apo = Math.sqrt(3) * lado / 2;
  proto = trasladar(escalar(proto, f), xoff, yoff);
  const ids = [], polis = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      ids.push(ix + iy * nx);
      polis.push(trasladar(proto, 2 * apo * ix + apo * (iy % 2), 1.5 * lado * (ny - 1 - iy)));
    }
  }
  return { ids, polis };
}

export class Rejilla {
  constructor({ grid_type = 'square', cell_area = 8100, cell_nx = 9, cell_ny = 9, xoff = -45, yoff = -45 } = {}) {
    this.grid_type = grid_type;
    this.cell_area = cell_area;
    this.cell_nx = cell_nx;
    this.cell_ny = cell_ny;
    const creador = { square: cuadrada, hexagon: hexagonal }[grid_type];
    if (!creador) throw new Error(`The grid_type ${grid_type} is not defined.`);
    const { ids, polis } = creador(cell_area, cell_nx, cell_ny, xoff, yoff);
    this.cell_id = ids;
    this.polygons = polis;
    this.n_cells = ids.length;
    this.centroids = polis.map(centroide);
    this._neighbours = null;
    this._distances = null;
  }

  populateDistances() {
    const n = this.n_cells, c = this.centroids;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = c[i][0] - c[j][0], dy = c[i][1] - c[j][1];
        let s = 0;
        s += dx * dx;
        s += dy * dy;
        d[i * n + j] = d[j * n + i] = Math.sqrt(s);
      }
    }
    this._distances = d;
  }

  distancia(i, j) { return this._distances[i * this.n_cells + j]; }

  setNeighbours(distancia) {
    const n = this.n_cells;
    this._neighbours = [];
    for (let i = 0; i < n; i++) {
      const v = [];
      for (let j = 0; j < n; j++) if (this._distances[i * n + j] <= distancia) v.push(j);
      this._neighbours.push(v);
    }
  }

  get neighbours() {
    if (!this._neighbours) throw new Error('Neighbours not yet defined: use set_neighbours.');
    return this._neighbours;
  }
}
