/* EL IMPOSTOR DE UN ÁRBOL, para lo lejos: el árbol (su versión ligera) pintado una vez en una
   textura, de lado y desde arriba, sin luz (sus colores). Se dibuja con dos tarjetas: una de pie
   que siempre mira a la cámara (girando sobre el tronco) con la vista de lado, y otra tumbada a
   la altura de la copa con la vista de arriba (para cuando se mira desde lo alto). 4 triángulos
   por árbol, con la luz del día encima (Lambert) y el recorte de las hojas (alphaTest). */

import * as THREE from '../vendor/three.module.js';
import { atlas } from './plantas.js?v=202610052309';

const LADO = 256;

// geos: { tipo: BufferGeometry } de la planta en el origen (las de plantas.js: color, uv del atlas)
export function hacerImpostorPlanta(geos, renderer) {
  const escena = new THREE.Scene(), caja = new THREE.Box3();
  for (const [tipo, g] of Object.entries(geos)) {
    const cartas = tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto';
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, map: cartas ? atlas() : null, alphaTest: cartas ? 0.42 : 0, side: THREE.DoubleSide });
    const malla = new THREE.Mesh(g, m);
    escena.add(malla);
    if (!g.boundingBox) g.computeBoundingBox();
    caja.union(g.boundingBox);
  }
  const tam = caja.getSize(new THREE.Vector3());
  const ancho = Math.max(tam.x, tam.z), alto = tam.y;
  // de lado (desde +z) en la mitad izquierda; desde arriba en la derecha
  const rt = new THREE.WebGLRenderTarget(LADO * 2, LADO);
  const antes = renderer.getRenderTarget(), color = renderer.getClearColor(new THREE.Color()), alfa = renderer.getClearAlpha(), tij = renderer.getScissorTest();
  renderer.setRenderTarget(rt);
  // (el fondo, del color medio del follaje con alfa 0, para que al alejarse no salga un halo oscuro)
  renderer.setClearColor(0x2a4a24, 0); renderer.clear();
  renderer.setScissorTest(true);
  const lado = new THREE.OrthographicCamera(-ancho / 2, ancho / 2, caja.max.y, caja.min.y, 0.01, ancho * 4);
  lado.position.set(0, 0, ancho * 2); lado.lookAt(0, 0, 0);
  lado.top = caja.max.y; lado.bottom = caja.min.y; lado.updateProjectionMatrix();
  renderer.setViewport(0, 0, LADO, LADO); renderer.setScissor(0, 0, LADO, LADO); renderer.render(escena, lado);
  const arriba = new THREE.OrthographicCamera(-ancho / 2, ancho / 2, ancho / 2, -ancho / 2, 0.01, alto * 4);
  arriba.position.set(0, caja.max.y + alto, 0); arriba.up.set(0, 0, -1); arriba.lookAt(0, 0, 0); arriba.updateProjectionMatrix();
  renderer.setViewport(LADO, 0, LADO, LADO); renderer.setScissor(LADO, 0, LADO, LADO); renderer.render(escena, arriba);
  const px = new Uint8Array(LADO * 2 * LADO * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, LADO * 2, LADO, px);
  renderer.setScissorTest(tij); renderer.setRenderTarget(antes); renderer.setClearColor(color, alfa);
  rt.dispose();
  for (const o of escena.children) o.material.dispose();
  const tex = new THREE.DataTexture(px, LADO * 2, LADO, THREE.RGBAFormat);
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  // las dos tarjetas: la de pie (de -ancho/2 a ancho/2, de min.y a max.y; uv en la mitad izquierda)
  // y la tumbada, a la altura de la copa (uv en la mitad derecha); aImp: 1 = de pie (gira hacia la cámara)
  const yCopa = caja.min.y + alto * 0.72;
  const pos = [-ancho / 2, caja.min.y, 0, ancho / 2, caja.min.y, 0, ancho / 2, caja.max.y, 0, -ancho / 2, caja.max.y, 0,
    -ancho / 2, yCopa, ancho / 2, ancho / 2, yCopa, ancho / 2, ancho / 2, yCopa, -ancho / 2, -ancho / 2, yCopa, -ancho / 2];
  const uv = [0, 0, 0.5, 0, 0.5, 1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0.5, 1];
  const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aImp', new THREE.Float32BufferAttribute([1, 1, 1, 1, 0, 0, 0, 0], 1));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geo.computeBoundingSphere();
  geo.userData.triangulos = 4;
  return { textura: tex, geo };
}

// el material: Lambert con la textura; la tarjeta de pie gira hacia la cámara en el shader.
// extra (del bosque): uniformes y el recorte por distancia
export function materialImpostorPlanta(textura, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ map: textura, alphaTest: 0.45, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, extra.uniformes || {});
    const giro = `vec3 centroI = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 haciaCam = cameraPosition - centroI; haciaCam.y = 0.0; haciaCam = normalize(haciaCam + vec3(1e-5, 0.0, 0.0));
      vec3 derecha = vec3(haciaCam.z, 0.0, -haciaCam.x);
      float escI = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);`;
    sh.vertexShader = 'attribute float aImp;\n' + (extra.cabeceraVertex || '') + '\n' + (String(extra.cabeceraVertex).includes('vOrgPlanta') ? '' : 'varying vec2 vOrgPlanta;\n') + sh.vertexShader
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\n if (aImp > 0.5) { ${giro} transformedNormal = normalize((viewMatrix * vec4(normalize(haciaCam + vec3(0.0, 0.8, 0.0)), 0.0)).xyz); }`)
      .replace('#include <project_vertex>', `vec4 mvPosition;
      vec3 orgPlanta;
      if (aImp > 0.5) {
        ${giro}
        orgPlanta = centroI;
        mvPosition = viewMatrix * vec4(centroI + derecha * position.x * escI + vec3(0.0, position.y * escI, 0.0), 1.0);
      } else {
        orgPlanta = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
      }
      gl_Position = projectionMatrix * mvPosition;
      vOrgPlanta = orgPlanta.xz;
      ${extra.vertexFinal || ''}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  m.customProgramCacheKey = () => 'impostorPlanta:' + (extra.clave || '');
  return m;
}
