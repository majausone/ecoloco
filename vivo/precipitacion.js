/* LA LLUVIA Y LA NIEVE, EN LA GPU. Gotas (rayitas) y copos (motas) por instancias en una caja
   alrededor de la cámara; cada una sale de su número de instancia (sitio, velocidad, tamaño) y
   cae sola en el shader con el tiempo (vuelve arriba al llegar abajo). Sin datos por gota en
   memoria. La cantidad (intensidad de 0 a 1) dice cuántas se dibujan. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

const CAJA = 50, ALTO = 32;

function crear(escena, { max, color, opacidad, ancho, largo, velocidad, deriva }) {
  const geo = new THREE.InstancedBufferGeometry();
  // una tarjeta que mira a la cámara (en el shader), x de −0,5 a 0,5 e y de 0 a 1
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = 0;
  const u = { uTiempo: { value: 0 }, uCentro: { value: new THREE.Vector3() }, uViento: { value: new THREE.Vector2(0.6, 0.3) } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uOpacidad: { value: opacidad } }]),
    vertexShader: `
      uniform float uTiempo; uniform vec3 uCentro; uniform vec2 uViento;
      varying float vBorde; varying vec2 vMota;
      #include <fog_pars_vertex>
      float hz(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float id = float(gl_InstanceID);
        float h1 = hz(id * 1.17), h2 = hz(id * 2.31 + 4.0), h3 = hz(id * 3.7 + 9.0), h4 = hz(id * 5.3 + 1.0);
        float v = ${velocidad.toFixed(2)} * (0.75 + h3 * 0.5);
        // el sitio, fijo en el mundo dentro de una caja que se repite alrededor de la cámara
        vec3 p = vec3(h1 * ${CAJA.toFixed(1)}, mod(h2 * ${ALTO.toFixed(1)} - uTiempo * v, ${ALTO.toFixed(1)}), h4 * ${CAJA.toFixed(1)});
        p.xz += uViento * (uTiempo * ${(velocidad * 0.15).toFixed(3)});
        ${deriva ? 'p.x += sin(uTiempo * 0.9 + id) * 0.6; p.z += cos(uTiempo * 0.7 + id * 1.3) * 0.6;' : ''}
        p.xz = mod(p.xz - uCentro.xz + ${(CAJA / 2).toFixed(1)}, ${CAJA.toFixed(1)}) + uCentro.xz - ${(CAJA / 2).toFixed(1)};
        p.y += uCentro.y - ${(ALTO * 0.6).toFixed(1)};
        // la tarjeta: de pie, mirando a la cámara (en horizontal); las gotas, algo inclinadas con el viento
        vec3 aCam = normalize(vec3(cameraPosition.x - p.x, 0.0, cameraPosition.z - p.z) + vec3(1e-4, 0.0, 0.0));
        vec3 lado = vec3(aCam.z, 0.0, -aCam.x);
        vec3 arriba = normalize(vec3(-uViento.x * ${deriva ? '0.0' : '0.12'}, 1.0, -uViento.y * ${deriva ? '0.0' : '0.12'}));
        vec3 w = p + lado * position.x * ${ancho.toFixed(3)} + arriba * position.y * ${largo.toFixed(3)};
        vBorde = abs(position.x) * 2.0; vMota = vec2(position.x * 2.0, position.y * 2.0 - 1.0);
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacidad; varying float vBorde; varying vec2 vMota;
      #include <fog_pars_fragment>
      void main() {
        // las gotas, rayas con el borde suave; los copos, redondos
        float a = ${deriva ? '1.0 - smoothstep(0.55, 1.0, length(vMota))' : '1.0 - 0.6 * vBorde * vBorde'};
        if (a <= 0.01) discard;
        gl_FragColor = vec4(uColor, uOpacidad * a);
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, u);
  const malla = new THREE.Mesh(geo, m);
  malla.frustumCulled = false; malla.renderOrder = 5;
  escena.add(malla);
  return { malla, u, max };
}

export function crearPrecipitacion(escena) {
  const lluvia = crear(escena, { max: 16000, color: '#c4dae6', opacidad: 0.5, ancho: 0.035, largo: 0.9, velocidad: 16, deriva: false });
  const nieve = crear(escena, { max: 12000, color: '#ffffff', opacidad: 0.95, ancho: 0.09, largo: 0.09, velocidad: 1.3, deriva: true });
  return {
    // cada fotograma: tiempo (s), dónde está la cámara (escena), cuánto llueve y nieva (0–1)
    actualizar(t, cam, intLluvia, intNieve, viento = 1) {
      for (const [p, k] of [[lluvia, intLluvia], [nieve, intNieve]]) {
        p.malla.geometry.instanceCount = Math.round(p.max * Math.max(0, Math.min(1, k)));
        p.malla.visible = k > 0.001;
        p.u.uTiempo.value = t; p.u.uCentro.value.copy(cam); p.u.uViento.value.set(0.6 * viento, 0.3 * viento);
      }
    },
  };
}
