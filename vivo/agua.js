/* EL AGUA (río y charcas), propia y barata: una sola malla plana (las casillas de 0,5 m donde el
   suelo liso de vivo/terreno.js queda por debajo del agua) y un shader que hace todo sin pasadas
   extra. Cada vértice lleva la profundidad (aFondo: lo que hay del agua al suelo; negativa ya en
   seco) y la dirección de la corriente (aFlujo).
   - la orilla: donde el suelo corta el agua, píxel a píxel (curva, sin cuadrados), y el agua se
     va aclarando hasta desaparecer en el borde (sin una raya dura);
   - el agua misma, como de verdad: se ve el fondo y, según la hondura, se lo va tragando un color
     de té oscuro de arroyo de selva (lo que absorbe el agua: 1 − e^(−k·hondura));
   - el oleaje: capas de ondas (ruido) que corren con la corriente y otras finas con el viento;
   - el reflejo con Fresnel (espejo cuanto más rasante se mira): la copa de los árboles, el
     horizonte y el cielo de ese momento, y el brillo del sol;
   - espuma a jirones donde toca la orilla, corriendo con el agua, y gotas cuando llueve.
   La mezcla con lo de detrás es la de verdad: fondo·(1 − absorción)·(1 − Fresnel) + agua·absorción·(1 − Fresnel) + reflejo·Fresnel. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

const VERT = `
attribute float aFondo; attribute vec2 aFlujo;
varying float vFondo; varying vec2 vFlujo; varying vec3 vMundo;
#include <fog_pars_vertex>
void main() {
  vFondo = aFondo; vFlujo = aFlujo;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform float time; uniform vec3 sunDirection; uniform vec3 sunColor; uniform vec3 waterColor;
uniform vec3 uCielo; uniform vec3 uHorizonte; uniform float uLluvia; uniform float uNoche;
varying float vFondo; varying vec2 vFlujo; varying vec3 vMundo;
#include <fog_pars_fragment>
// (los colores escritos aquí, en sRGB; la escena se pinta en lineal)
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float hz(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hz(i), hz(i + vec2(1, 0)), u.x), mix(hz(i + vec2(0, 1)), hz(i + vec2(1, 1)), u.x), u.y); }
// la altura del oleaje en un punto (para sacar la normal por diferencias)
float ola(vec2 p) {
  vec2 f = vFlujo * time;
  return ruido(p * 0.8 - f * 0.9) * 0.45 + ruido(vec2(p.x * 2.1 - p.y * 0.6, p.y * 2.1 + p.x * 0.6) - f * 1.7 + vec2(3.1, 7.7)) * 0.3
       + ruido(p * 5.5 + vec2(time * 0.35, -time * 0.27)) * 0.13 + ruido(p * 12.0 - vec2(time * 0.6, time * 0.4)) * 0.05;
}
void main() {
  float d = vFondo;
  if (d <= 0.0) discard;
  vec2 p = vMundo.xz;
  float e = 0.05, h = ola(p);
  // (más calma en la orilla, donde casi no hay agua)
  float fuerza = 1.2 * smoothstep(0.0, 0.25, d);
  vec3 n = normalize(vec3((h - ola(p + vec2(e, 0.0))) * fuerza, 1.0, (h - ola(p + vec2(0.0, e))) * fuerza));
  // gotas de lluvia: anillos que se abren y se borran
  if (uLluvia > 0.01) {
    vec2 c = floor(p * 2.5), f = fract(p * 2.5) - 0.5;
    float t = fract(time * 0.9 + hz(c) * 7.0), r = length(f - (vec2(hz(c + 1.3), hz(c + 2.7)) - 0.5) * 0.5);
    float anillo = sin((r - t * 0.45) * 60.0) * (1.0 - t) * smoothstep(0.45, 0.0, abs(r - t * 0.45) * 6.0);
    n.xz += (f / max(r, 0.01)) * anillo * 0.25 * uLluvia * step(hz(c + 5.0), uLluvia);
    n = normalize(n);
  }
  vec3 v = normalize(cameraPosition - vMundo);
  float fres = 0.025 + 0.7 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // el reflejo: en la selva casi siempre la copa de los árboles (oscura y verde); arriba, el cielo
  vec3 r = reflect(-v, n);
  // (con claros entre las hojas, por donde se ve el cielo: manchas de luz que el oleaje deforma)
  vec2 rq = r.xz / max(r.y, 0.15) * 1.3 + p * 0.25;
  float hojas = ruido(rq) * 0.65 + ruido(rq * 2.7 + 5.0) * 0.35;
  vec3 copa = lin(vec3(0.06, 0.1, 0.05)) * (0.6 + 0.8 * hojas) * (1.0 - uNoche * 0.8);
  float claro = smoothstep(0.62, 0.8, hojas) * smoothstep(0.1, 0.6, r.y);
  vec3 refl = mix(mix(copa, uHorizonte * 0.35, 0.2 * (1.0 - smoothstep(0.0, 0.3, r.y))), uCielo * 0.9, claro);
  float sd = max(dot(r, normalize(sunDirection)), 0.0), sol = pow(sd, 500.0) * 3.0 + pow(sd, 60.0) * 0.12 + pow(sd, 8.0) * 0.03;
  // el agua: lo que se traga del fondo según la hondura (y lo que se ve a través, de lado, es más camino)
  float camino = d / max(0.25, v.y);
  float absor = (1.0 - exp(-camino * 1.5)) * 0.92;
  vec3 cuerpo = mix(lin(vec3(0.17, 0.15, 0.08)), lin(vec3(0.05, 0.085, 0.06)), smoothstep(0.1, 0.9, d)) * (1.0 - uNoche * 0.75);
  // la espuma: donde toca la orilla, a jirones, corriendo con el agua
  float jiron = ruido(p * 3.0 - vFlujo * time * 1.3) * 0.65 + ruido(p * 9.0 + time * 0.2) * 0.35;
  float esp = smoothstep(0.07, 0.01, d) * smoothstep(0.5, 0.8, jiron) * 0.35;
  vec3 espuma = lin(vec3(0.62, 0.62, 0.56)) * (1.0 - uNoche * 0.75);
  // la mezcla de verdad (ver arriba), como color premultiplicado y alfa
  float a = 1.0 - (1.0 - absor) * (1.0 - fres);
  float luzOla = 1.0 + dot(n.xz, normalize(sunDirection.xz + vec2(1e-4))) * 1.2;
  vec3 pre = cuerpo * luzOla * absor * (1.0 - fres) + refl * fres + sunColor * sol;
  pre = mix(pre, espuma * max(a, esp), esp);
  a = max(a, esp);
  // y en el mismo borde, se desvanece (sin raya)
  float borde = smoothstep(0.0, 0.07, d);
  a *= borde;
  gl_FragColor = vec4(pre * borde / max(a, 1e-3), a);
  #include <fog_fragment>
}`;

export function materialAgua() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, sunDirection: { value: new THREE.Vector3(0.7, 0.7, 0) }, sunColor: { value: new THREE.Color('#ffffff') },
      waterColor: { value: new THREE.Color('#1d4a44') }, uCielo: { value: new THREE.Color('#6a9ad0') }, uHorizonte: { value: new THREE.Color('#c8d8d8') },
      uLluvia: { value: 0 }, uNoche: { value: 0 },
    }]),
    vertexShader: VERT, fragmentShader: FRAG,
  });
}
