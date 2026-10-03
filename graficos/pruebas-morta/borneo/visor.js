/* El visor común del editor y del bioma: un renderizador a la resolución que se pida,
   el retoque de la v3 (sin trama ni viñeta), luces de día, atardecer y noche, y
   pantalla completa. */

import * as THREE from '../vendor/three.module.js';
import { retoque } from '../escena-v3.js';

export const LUCES = {
  dia: { cielo: '#7fa8a0', sol: '#fff2d0', fuerza: 3.2, dir: [-0.6, 0.75, 0.35], hemiCielo: '#cfe0c0', hemiSuelo: '#2a3a20', ambiente: 1.4, niebla: '#6a8a7a',
    post: { contraste: 1.08, saturacion: 1.15, sombra: [0.3, 0.32, 0.45], luzTinte: [1.04, 1, 0.9] } },
  atardecer: { cielo: '#3a2030', sol: '#ff9a5a', fuerza: 3.4, dir: [0.85, 0.35, 0.3], hemiCielo: '#c07aa0', hemiSuelo: '#2a1420', ambiente: 1.0, niebla: '#4a2a38',
    post: { contraste: 1.12, saturacion: 1.2, sombra: [0.5, 0.25, 0.55], luzTinte: [1.08, 0.9, 0.85] } },
  noche: { cielo: '#070a12', sol: '#8fb0ff', fuerza: 0.9, dir: [0.4, 0.75, 0.5], hemiCielo: '#3a4a70', hemiSuelo: '#0a0a14', ambiente: 0.9, niebla: '#0a1018',
    post: { contraste: 1.15, saturacion: 1.0, sombra: [0.3, 0.32, 0.7], luzTinte: [0.9, 1, 1.1] } },
};

export class Visor {
  constructor(lienzo, { sombras = 2048 } = {}) {
    this.lienzo = lienzo;
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), retoque());
    this.escenaQuad = new THREE.Scene(); this.escenaQuad.add(this.quad);
    this.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.objetivo = null;
    this.pixel = 1; // 1 = resolución nativa; 2, 3... = píxeles más gordos
    this.sombras = sombras;
  }
  luces(escena, nombre, alcance = 30) {
    const L = LUCES[nombre];
    for (const o of [...escena.children]) if (o.userData.esLuz) escena.remove(o);
    escena.background = new THREE.Color(L.cielo);
    const sol = new THREE.DirectionalLight(L.sol, L.fuerza);
    sol.position.set(...L.dir).normalize().multiplyScalar(alcance * 2);
    sol.castShadow = true;
    sol.shadow.mapSize.set(this.sombras, this.sombras);
    Object.assign(sol.shadow.camera, { left: -alcance, right: alcance, top: alcance, bottom: -alcance, near: 0.1, far: alcance * 5 });
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02;
    const hemi = new THREE.HemisphereLight(L.hemiCielo, L.hemiSuelo, L.ambiente);
    sol.userData.esLuz = hemi.userData.esLuz = true;
    escena.add(sol, hemi);
    this.post = L.post;
    this.sol = sol;
    return L;
  }
  ajustar() {
    const w = Math.max(1, Math.floor(this.lienzo.clientWidth / this.pixel)), h = Math.max(1, Math.floor(this.lienzo.clientHeight / this.pixel));
    if (this.objetivo && this.objetivo.width === w && this.objetivo.height === h) return;
    this.renderer.setSize(w, h, false);
    this.objetivo?.depthTexture?.dispose(); this.objetivo?.dispose();
    this.objetivo = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.objetivo.depthTexture = new THREE.DepthTexture(w, h);
  }
  pintar(escena, cam) {
    this.ajustar();
    const { width: w, height: h } = this.objetivo;
    if (cam.isPerspectiveCamera) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    this.renderer.setRenderTarget(this.objetivo);
    this.renderer.render(escena, cam);
    const u = this.quad.material.uniforms, p = this.post;
    u.tColor.value = this.objetivo.texture; u.tProf.value = this.objetivo.depthTexture; u.res.value.set(w, h);
    u.contraste.value = p.contraste; u.saturacion.value = p.saturacion;
    u.sombra.value.setRGB(...p.sombra); u.luzTinte.value.setRGB(...p.luzTinte);
    u.niveles.value = 48; u.tramado.value = 0; u.contorno.value = 0.3; u.vineta.value = 0;
    u.lejos.value = cam.far - cam.near; u.cerca.value = cam.near; u.persp.value = cam.isPerspectiveCamera ? 1 : 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.escenaQuad, this.camQuad);
  }
}

export function pantallaCompleta(el) {
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.();
}
