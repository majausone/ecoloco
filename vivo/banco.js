/* BANCO DE PRUEBAS DE LOS ANIMALES: miles de ejemplares de una especie (las ranas, por defecto)
   en un suelo plano, dibujados con el mismo código que el mundo vivo (vivo/manada.js), para
   medir lo que cuestan. ?especie=rana-gigante-rio&n=5000&lado=100
   En la consola: __banco.medir(120) -> ms por fotograma esperando a la GPU, triángulos... */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { Visor } from '../graficos/pruebas-morta/borneo/visor.js?v=202610052309';
import { crearManada } from './manada.js?v=202610052309';
import { ESTADOS } from '../mundo/especies.js?v=202610052309';
import { TICS } from '../mundo/dia.js?v=202610052309';
import { ANIMALES } from '../graficos/pruebas-morta/borneo/especies.js?v=202610052309';
import { prepararSuaves } from '../graficos/pruebas-morta/borneo/animales.js?v=202610052309';

const q = new URLSearchParams(location.search);
const ESPECIE = q.get('especie') || 'rana-gigante-rio', N = Number(q.get('n') || 5000), LADO = Number(q.get('lado') || 100);
const lienzo = document.getElementById('lienzo');
const visor = new Visor(lienzo, { sombras: 2048 });
const escena = new THREE.Scene();
visor.luces(escena, 'dia', 60);
escena.fog = new THREE.Fog('#7fa8a0', 140, 480);
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(LADO, LADO).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#3a5a2a' }));
suelo.receiveShadow = true; escena.add(suelo);
const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1200);
cam.position.set(-LADO * 0.25, 6, -LADO * 0.25); cam.lookAt(LADO * 0.1, 0, LADO * 0.1);

// azar fijo
let s = 12345; const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
await prepararSuaves(ANIMALES.filter((e) => e.id === ESPECIE));
const manada = crearManada({ escena, ox: 0, oz: 0, cima: () => 0, renderer: visor.renderer });
const ids = [], agentes = {}, claves = [];
const ANDAR = ESTADOS.indexOf('andar'), QUIETO = ESTADOS.indexOf('quieto'), COMER = ESTADOS.indexOf('comer');
for (let i = 0; i < N; i++) {
  const id = 'b' + i, x = (r() - 0.5) * LADO, z = (r() - 0.5) * LADO, rumbo = r() * 6.28;
  const est = [ANDAR, QUIETO, COMER][i % 3], v = est === ANDAR ? 0.02 : 0;
  ids.push(id); agentes[id] = { especie: ESPECIE };
  claves.push(Float32Array.from([0, x, 0, z, rumbo, est, 0, TICS, x + Math.cos(rumbo) * v * TICS, 0, z + Math.sin(rumbo) * v * TICS, rumbo, est, 0]));
}
manada.ponerDia({ ids, agentes, claves });

let tic = 600, ultimo = performance.now();
function cuadro(ms) {
  const dt = Math.min(0.1, (ms - ultimo) / 1000); ultimo = ms;
  tic += dt;
  manada.actualizar(tic, cam.position, dt);
  const ri = visor.renderer.info; ri.autoReset = false; ri.reset();
  visor.pintar(escena, cam);
  return { triangulos: ri.render.triangles, llamadas: ri.render.calls };
}
function medir(n = 120) {
  const gl = visor.renderer.getContext(), px = new Uint8Array(4);
  let info;
  const t0 = performance.now();
  for (let k = 0; k < n; k++) { info = cuadro(ultimo + 1000 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ms = (performance.now() - t0) / n;
  return { ms: +ms.toFixed(2), fps: Math.round(1000 / ms), ...info, ...manada.medidas };
}
function bucle(ms) { requestAnimationFrame(bucle); const i = cuadro(ms); document.getElementById('info').textContent = `${ESPECIE} × ${N} · ${i.triangulos} triángulos · ${i.llamadas} llamadas`; }
requestAnimationFrame(bucle);
window.__banco = { medir, cam, escena, manada, visor };
