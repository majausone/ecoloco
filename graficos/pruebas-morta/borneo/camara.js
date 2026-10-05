/* La cámara libre de la vista de escena de Unity, la misma que en las pruebas v1-v4:
   botón derecho mantenido para mirar (con el ratón bloqueado) y WASD para volar hacia
   donde se mira; Q/E bajar y subir, Mayús más rápido y, si se mantiene, acelera. La rueda
   acerca, o cambia la velocidad mientras se vuela. Botón central desplaza, Alt + izquierdo
   orbita, F o R vuelve a encuadrar y P cambia entre perspectiva y ortográfica.
   MODO ÓRBITA (this.orbita = { centro, dist, desvio }; lo pone quien sigue a algo, vivo/vivo.js): la
   cámara mira siempre al centro desde dist m; el botón derecho (o un dedo, vivo/tactil.js) gira
   ALREDEDOR del centro, la rueda acerca o aleja (en ortográfica, el encuadre) y desplazar (botón central,
   WASD o dos dedos) no mueve la cámara sino que se suma a desvio: quien sigue decide si lo suelta. */

import * as THREE from '../vendor/three.module.js';

export class CamaraUnity {
  constructor(lienzo, { elevacion = 50, azimut = 0, distancia = 26, centro = [0, 0, 0], ortoAlto = 14 } = {}) {
    this.lienzo = lienzo;
    this.inicial = { elevacion, azimut, distancia, centro, ortoAlto };
    this.camP = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
    this.camO = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.persp = true;
    this.velocidad = 8; this.acelera = 1;
    this.teclas = new Set();
    this.arrastre = null;
    this.orbita = null;
    this.encuadrar();
    this.escuchar();
  }
  encuadrar() {
    const { elevacion, azimut, distancia, centro, ortoAlto } = this.inicial;
    const el = THREE.MathUtils.degToRad(elevacion), az = THREE.MathUtils.degToRad(azimut);
    this.pos = new THREE.Vector3(centro[0] + Math.sin(az) * Math.cos(el) * distancia, centro[1] + Math.sin(el) * distancia, centro[2] + Math.cos(az) * Math.cos(el) * distancia);
    this.yaw = az + Math.PI; this.pitch = -el; this.ortoAlto = ortoAlto;
  }
  mira() { return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }
  derecha() { return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  // en órbita: la cámara, a dist del centro (más el desvío), mirándolo
  colocarEnOrbita() {
    const o = this.orbita;
    if (!o) return;
    this.pos.copy(o.centro).add(o.desvio).addScaledVector(this.mira(), -o.dist);
  }
  // empezar a orbitar alrededor de un punto desde donde está la cámara ahora (mirándolo)
  orbitar(centro) {
    const d = this.pos.clone().sub(centro), dist = Math.max(1, d.length());
    this.yaw = Math.atan2(-d.x, -d.z); this.pitch = Math.min(-0.05, Math.max(-1.5, Math.asin(-d.y / dist)));
    this.orbita = { centro: centro.clone(), dist, desvio: new THREE.Vector3() };
    this.colocarEnOrbita();
  }
  // girar en órbita (dx, dy en píxeles); el pitch, siempre mirando un poco hacia abajo (no se mete bajo el suelo)
  girarOrbita(dx, dy, k = 0.005) {
    this.yaw -= dx * k;
    this.pitch = Math.min(-0.05, Math.max(-1.5, this.pitch - dy * k));
    this.colocarEnOrbita();
  }
  // acercar o alejar en órbita (factor > 1 aleja)
  zoomOrbita(factor) {
    if (this.persp) this.orbita.dist = Math.min(300, Math.max(0.6, this.orbita.dist * factor));
    else this.ortoAlto = Math.min(80, Math.max(1.5, this.ortoAlto * factor));
    this.colocarEnOrbita();
  }
  // desplazar en órbita: se suma al desvío
  desviarOrbita(v) { this.orbita.desvio.add(v); this.colocarEnOrbita(); }
  paso(dt) {
    const f = this.mira(), d = this.derecha(), T = this.teclas;
    const moviendo = ['w', 'a', 's', 'd', 'q', 'e'].some((k) => T.has(k));
    this.acelera = moviendo ? Math.min(4, this.acelera + dt * 0.8) : 1;
    const v = this.velocidad * this.acelera * (T.has('shift') ? 3 : 1) * dt;
    if (this.orbita) {
      // en órbita, WASDQE desvían del centro (en el plano: adelante es hacia donde se mira)
      const fh = new THREE.Vector3(f.x, 0, f.z).normalize(), m = new THREE.Vector3();
      if (T.has('w')) m.addScaledVector(fh, v); if (T.has('s')) m.addScaledVector(fh, -v);
      if (T.has('d')) m.addScaledVector(d, v); if (T.has('a')) m.addScaledVector(d, -v);
      if (T.has('e')) m.y += v; if (T.has('q')) m.y -= v;
      this.orbita.desvio.add(m);
      this.colocarEnOrbita();
    } else {
    if (T.has('w')) this.pos.addScaledVector(f, v);
    if (T.has('s')) this.pos.addScaledVector(f, -v);
    if (T.has('d')) this.pos.addScaledVector(d, v);
    if (T.has('a')) this.pos.addScaledVector(d, -v);
    if (T.has('e')) this.pos.y += v;
    if (T.has('q')) this.pos.y -= v;
    }
    const objetivo = this.pos.clone().add(f);
    if (this.persp) { this.camP.position.copy(this.pos); this.camP.lookAt(objetivo); return this.camP; }
    const c = this.camO, asp = this.lienzo.clientWidth / Math.max(1, this.lienzo.clientHeight);
    Object.assign(c, { left: -this.ortoAlto * asp / 2, right: this.ortoAlto * asp / 2, top: this.ortoAlto / 2, bottom: -this.ortoAlto / 2, zoom: 1 });
    c.updateProjectionMatrix();
    c.position.copy(this.pos).addScaledVector(f, -60); c.lookAt(objetivo);
    return c;
  }
  escuchar() {
    const L = this.lienzo;
    L.addEventListener('contextmenu', (e) => e.preventDefault());
    L.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    L.addEventListener('pointerdown', (e) => {
      const modo = e.button === 2 ? 'mirar' : e.button === 1 ? 'desplazar' : e.altKey ? 'orbitar' : null;
      if (!modo) return;
      this.arrastre = { x: e.clientX, y: e.clientY, modo };
      L.setPointerCapture(e.pointerId);
      if (modo === 'mirar' && !this.orbita) { try { L.requestPointerLock()?.catch?.(() => {}); } catch {} }
    });
    L.addEventListener('pointerup', () => { this.arrastre = null; if (document.pointerLockElement) document.exitPointerLock(); });
    L.addEventListener('pointermove', (e) => {
      const A = this.arrastre;
      if (!A) return;
      const bloq = document.pointerLockElement === L;
      const dx = bloq ? e.movementX : e.clientX - A.x, dy = bloq ? e.movementY : e.clientY - A.y;
      A.x = e.clientX; A.y = e.clientY;
      if (this.orbita && (A.modo === 'mirar' || A.modo === 'orbitar')) { this.girarOrbita(dx, dy); return; }
      if (this.orbita && A.modo === 'desplazar') {
        const k = (this.persp ? this.orbita.dist * 1.2 : this.ortoAlto) / L.clientHeight;
        const arriba = new THREE.Vector3().crossVectors(this.derecha(), this.mira());
        this.desviarOrbita(this.derecha().multiplyScalar(-dx * k).addScaledVector(arriba, dy * k));
        return;
      }
      if (A.modo === 'mirar') {
        this.yaw -= dx * 0.0035;
        this.pitch = Math.min(1.5, Math.max(-1.5, this.pitch - dy * 0.0035));
      } else if (A.modo === 'desplazar') {
        const k = (this.persp ? 20 : this.ortoAlto) / L.clientHeight;
        const arriba = new THREE.Vector3().crossVectors(this.derecha(), this.mira());
        this.pos.addScaledVector(this.derecha(), -dx * k).addScaledVector(arriba, dy * k);
      } else {
        const centro = this.pos.clone().addScaledVector(this.mira(), 15);
        this.yaw -= dx * 0.005;
        this.pitch = Math.min(1.5, Math.max(-1.5, this.pitch - dy * 0.005));
        this.pos.copy(centro).addScaledVector(this.mira(), -15);
      }
    });
    L.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.orbita) { this.zoomOrbita(Math.exp(e.deltaY * 0.0012)); return; }
      if (this.arrastre && this.arrastre.modo === 'mirar') { this.velocidad = Math.min(60, Math.max(1, this.velocidad * Math.exp(-e.deltaY * 0.0015))); return; }
      if (this.persp) this.pos.addScaledVector(this.mira(), -e.deltaY * 0.02);
      else this.ortoAlto = Math.min(80, Math.max(3, this.ortoAlto * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'p') { this.persp = !this.persp; return; }
      if (k === 'f' || k === 'r') { if (!this.orbita) this.encuadrar(); return; }
      this.teclas.add(k); if (e.shiftKey) this.teclas.add('shift');
    });
    window.addEventListener('keyup', (e) => { this.teclas.delete(e.key.toLowerCase()); if (!e.shiftKey) this.teclas.delete('shift'); });
    window.addEventListener('blur', () => this.teclas.clear());
  }
}
