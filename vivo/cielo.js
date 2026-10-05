/* EL CIELO Y EL TIEMPO del mundo vivo.
   - El cielo: el `Sky` de los ejemplos de three.js (r186, licencia MIT, vivo/vendor/Sky.js;
     modelo de Preetham, con nubes), con el sol donde toca según la hora de la simulación
     (amanece hacia las 6:10 y anochece hacia las 18:15, en Maliau, a 4,8° N).
   - De noche, estrellas y la luna (propias, sencillas).
   - El tiempo, de los datos del motor del día (mundo/puente.js, clima): nubes según la
     radiación solar del día frente a la de un día despejado del mismo mes (el motor no da la
     nubosidad), lluvia (los mm del día, por la tarde, que es lo normal en Borneo), y neblina con
     la humedad cerca de la saturación al amanecer o mientras llueve (el motor tampoco da la
     niebla; sale de la humedad relativa).
   Todo lo del cielo va en la capa 1, que es la que se refleja en el agua (vivo/terreno.js). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { Sky } from './vendor/Sky.js';

export const CAPA_CIELO = 1;
const RADIO = 900;

export function crearCielo({ escena }) {
  const sky = new Sky();
  sky.scale.setScalar(RADIO);
  // sin mapeo de tonos en el renderizador: una exposición propia (1 − e^(−x·k)) para que el
  // cielo de Preetham, que va en unidades de luz, quede en 0–1
  const m = sky.material;
  m.uniforms.uExposicion = { value: 0.22 };
  m.fragmentShader = 'uniform float uExposicion;\n' + m.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( 1.0 - exp( -texColor * uExposicion ), 1.0 );');
  m.depthWrite = false;
  sky.frustumCulled = false; sky.renderOrder = -10;
  sky.layers.set(CAPA_CIELO);
  const U = m.uniforms;
  U.turbidity.value = 4; U.rayleigh.value = 2.4; U.mieCoefficient.value = 0.006; U.mieDirectionalG.value = 0.82;
  U.cloudScale.value = 0.0004; U.cloudSpeed.value = 0.00003; U.cloudElevation.value = 0.45;

  // estrellas: puntos en una esfera, que se encienden al anochecer
  const n = 1800, pos = new Float32Array(n * 3), az = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < n; i++) {
    const u = az() * 2 - 1, f = az() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(f) * r * RADIO * 0.8, Math.abs(u) * RADIO * 0.8, Math.sin(f) * r * RADIO * 0.8], i * 3);
  }
  const gEst = new THREE.BufferGeometry(); gEst.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const estrellas = new THREE.Points(gEst, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  estrellas.frustumCulled = false; estrellas.layers.set(CAPA_CIELO); estrellas.renderOrder = -9;
  // la luna: un disco con su halo, al otro lado del sol
  const luna = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: '#f2efe2', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  luna.layers.set(CAPA_CIELO); luna.renderOrder = -8; luna.frustumCulled = false;
  escena.add(sky, estrellas, luna);

  const sol = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tiempo = { nubes: 0, lluvia: 0, niebla: 0 };
  return {
    sky, tiempo,
    // dirección del sol (normalizada) a una hora; de noche, bajo el horizonte
    direccionSol(hora, out = new THREE.Vector3()) {
      const a = 2 * Math.PI * (hora - 6.21) / 24; // 0 al amanecer, π/2 a mediodía
      return out.set(Math.cos(a), Math.sin(a), 0.32).normalize();
    },
    // cada fotograma: dónde está la cámara, la hora, cuánto es de noche (0–1) y el clima del día
    // forzar: { lluvia, nieve, niebla, nubes } de 0 a 1 (la pestaña Gráficos) o nada (el del motor)
    actualizar(camPos, hora, noche, clima, t, forzar = null) {
      sky.position.copy(camPos); estrellas.position.copy(camPos);
      this.direccionSol(hora, sol);
      U.sunPosition.value.copy(sol);
      // el tiempo de ahora: nubes del día (más mientras llueve), neblina con humedad alta al
      // amanecer y con lluvia
      const mm = clima?.lluvia || 0, llueve = mm > 5 && hora >= 14 && hora < 14 + Math.min(8, mm / 4);
      const hum = clima?.humedad ?? 85, madrugada = hora < 9 || hora > 21;
      tiempo.lluvia = llueve ? Math.min(1, mm / 40) : 0;
      tiempo.nubes = Math.min(1, (clima?.nubes ?? 0.3) * 1.2 + (llueve ? 0.5 : 0) + Math.min(0.3, mm / 100));
      tiempo.niebla = Math.max(madrugada ? Math.max(0, (hum - 88) / 12) : 0, llueve ? 0.4 + tiempo.lluvia * 0.4 : 0);
      tiempo.nieve = 0;
      if (forzar) Object.assign(tiempo, forzar);
      U.cloudCoverage.value = 0.15 + tiempo.nubes * 0.7;
      U.cloudDensity.value = Math.min(1, 0.25 + tiempo.nubes * 0.6 + tiempo.lluvia * 0.3);
      U.turbidity.value = 3.5 + tiempo.niebla * 8 + tiempo.nubes * 3;
      U.time.value = t;
      U.uExposicion.value = 0.22 * (1 - tiempo.nubes * 0.3) * (1 - 0.7 * tiempo.lluvia);
      estrellas.material.opacity = noche * (1 - tiempo.nubes * 0.9);
      // la luna (de fase fija, sin más): al otro lado del sol
      tmp.copy(sol).negate(); tmp.y = Math.abs(tmp.y) * 0.8 + 0.25; tmp.normalize();
      luna.position.copy(camPos).addScaledVector(tmp, RADIO * 0.7);
      luna.lookAt(camPos);
      luna.material.opacity = noche * (1 - tiempo.nubes * 0.7);
      return tiempo;
    },
    get sol() { return sol; },
  };
}
