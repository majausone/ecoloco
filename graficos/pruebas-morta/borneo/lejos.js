/* LOS ANIMALES DE LEJOS, PARA MILES A LA VEZ (con animales.js):
   - a media distancia, la malla de ~100 triángulos con sus animaciones GRABADAS EN UNA TEXTURA
     (vertex animation texture): cada fila es un fotograma de una animación con la posición de
     cada vértice (y otra fila con su normal). Se dibuja toda la especie de una vez, con
     instancias; cada instancia dice qué dos fotogramas mezclar (aVat), que calcula manada.js.
   - muy lejos, un recorte plano (impostor): el animal pintado una vez desde 8 direcciones a su
     alrededor (cada 45°) en una textura, y una tarjeta que mira a la cámara (2 triángulos) y enseña
     la vista que toca según el ángulo entre hacia dónde va el animal y la cámara (de frente, de
     lado, de espaldas...). Con una sola vista (de lado) se le veía siempre igual girara como girara.
   Se graban con el mismo esqueleto y las mismas animaciones que el modelo de cerca. */

import * as THREE from '../vendor/three.module.js';
import { crearAnimal, suaveDe } from './animales.js?v=202610052338';
import { materialPelaje } from './pelaje.js?v=202610052338';

// los tramos que se graban de cada animación: las que se repiten, de t = 1 a 1 + PERIODO (2π/2,5:
// un número entero de ciclos para los ritmos más usados); las de una vez (dormir, morir), de 0 a 2,4 s
const PERIODO = (2 * Math.PI) / 2.5, FOTOGRAMAS = 12, UNA_VEZ = { dormir: 2.4, morir: 2.4, enrollarse: 2.4, sentarse: 1.6 };

// m: un modelo suave de la especie ya hecho (si no, se hace uno); se deja en reposo al acabar
export function hornearVAT(especie, m = crearAnimal(especie)) {
  const c = suaveDe(especie);
  // (la malla entera, la misma del modelo de cerca: sin malla aligerada)
  const geo = c.geo0, nv = geo.attributes.position.count;
  const P = geo.attributes.position, N = geo.attributes.normal, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const malla = m.suave.malla, esq = malla.skeleton;
  const filas = {}, datosP = [], datosN = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), mat = new THREE.Matrix4(), m3 = new THREE.Matrix3();
  const fila = (t) => {
    m.paso(t);
    m.raiz.updateMatrixWorld(true);
    esq.update();
    const bm = esq.boneMatrices;
    const fp = new Float32Array(nv * 4), fn = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); acc.set(0, 0, 0); accN.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = SW.getComponent(i, k); if (!w) continue;
        mat.fromArray(bm, SI.getComponent(i, k) * 16);
        acc.addScaledVector(v.clone().applyMatrix4(mat), w);
        accN.addScaledVector(n.clone().applyMatrix3(m3.setFromMatrix4(mat)), w);
      }
      // (en el sitio de la raíz: lo que mueve la raíz va incluido, como en el modelo de cerca)
      fp.set([acc.x, acc.y, acc.z, 1], i * 4); accN.normalize(); fn.set([accN.x, accN.y, accN.z, 0], i * 4);
    }
    datosP.push(fp); datosN.push(fn);
  };
  for (const a of m.anims) {
    const una = UNA_VEZ[a];
    filas[a] = { desde: datosP.length, n: FOTOGRAMAS, bucle: !una, dur: una || PERIODO };
    m.poner(a, 0);
    for (let f = 0; f < FOTOGRAMAS; f++) fila(una ? (f / (FOTOGRAMAS - 1)) * una : 1 + (f / FOTOGRAMAS) * PERIODO);
  }
  m.poner('quieto', 0); m.restaurar(); m.raiz.updateMatrixWorld(true);
  const total = datosP.length, datos = new Float32Array(nv * total * 2 * 4);
  datosP.forEach((f, i) => datos.set(f, i * nv * 4));
  datosN.forEach((f, i) => datos.set(f, (total + i) * nv * 4));
  const tex = new THREE.DataTexture(datos, nv, total * 2, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return { textura: tex, filas, total, nv, geo, anims: m.anims };
}

// la fila (con su mezcla) de una animación en el segundo t desde que empezó: [filaA, filaB, mezcla]
export function filaVAT(vat, anim, t, salida, o) {
  const f = vat.filas[anim] || vat.filas.quieto || Object.values(vat.filas)[0];
  let x;
  if (f.bucle) { x = (((t - 1) / f.dur) % 1 + 1) % 1 * f.n; const a = Math.floor(x); salida[o] = f.desde + a; salida[o + 1] = f.desde + ((a + 1) % f.n); salida[o + 2] = x - a; }
  else { x = Math.min(f.n - 1, Math.max(0, (t / f.dur) * (f.n - 1))); const a = Math.floor(x); salida[o] = f.desde + a; salida[o + 1] = f.desde + Math.min(f.n - 1, a + 1); salida[o + 2] = x - a; }
}

export function materialVAT(especie, vat) {
  const c = suaveDe(especie);
  const uVat = { value: vat.textura }, uFilas = { value: vat.total };
  const m = materialPelaje(c.pelaje, c.caja, { extra: {
    clave: 'vat',
    cabeceraVertex: 'uniform highp sampler2D uVat;\nuniform float uFilas;\nattribute vec3 aVat;\n',
    reemplazos: [
      ['#include <beginnormal_vertex>', `ivec2 vatA = ivec2(gl_VertexID, int(aVat.x)), vatB = ivec2(gl_VertexID, int(aVat.y)), vatN = ivec2(0, int(uFilas));
      vec3 objectNormal = normalize(mix(texelFetch(uVat, vatA + vatN, 0).xyz, texelFetch(uVat, vatB + vatN, 0).xyz, aVat.z));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`],
    ],
    inicioVertex: 'transformed = mix(texelFetch(uVat, vatA, 0).xyz, texelFetch(uVat, vatB, 0).xyz, aVat.z);',
  } });
  const antes = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => { antes(sh); sh.uniforms.uVat = uVat; sh.uniforms.uFilas = uFilas; };
  return m;
}

/* El impostor: el modelo de cerca, quieto, pintado desde 8 direcciones alrededor (la vista k, con
   la cámara en la dirección (cos k·45°, 0, sin k·45°) del animal, que mira a +x), una al lado de otra
   en una textura con fondo transparente (hace falta el renderer). La tarjeta: tan ancha como el animal
   visto desde cualquier lado y tan alta como él. */
export const VISTAS_IMPOSTOR = 8;
export function hacerImpostor(especie, renderer, m = null) {
  const propio = !m;
  if (propio) m = crearAnimal(especie);
  m.poner('quieto', 0); m.paso(0.3);
  const caja = new THREE.Box3().setFromObject(m.raiz, true);
  const tam = caja.getSize(new THREE.Vector3());
  // (la mitad del ancho: lo más lejos que llega del eje, por cualquier lado; así cabe en todas las vistas)
  const medio = Math.max(Math.abs(caja.min.x), Math.abs(caja.max.x), Math.abs(caja.min.z), Math.abs(caja.max.z), 1e-3);
  const N = VISTAS_IMPOSTOR, W = 128, H = Math.max(16, Math.min(128, Math.round(128 * tam.y / (medio * 2) / 8) * 8));
  const rt = new THREE.WebGLRenderTarget(W * N, H);
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight('#ffffff', '#606060', 2.2));
  const sol = new THREE.DirectionalLight('#ffffff', 1.6); sol.position.set(-0.3, 1, 1); escena.add(sol);
  escena.add(m.raiz);
  const cam = new THREE.OrthographicCamera(-medio, medio, caja.max.y, caja.min.y, 0.01, medio * 6 + 10);
  const antes = renderer.getRenderTarget(), color = renderer.getClearColor(new THREE.Color()), alfa = renderer.getClearAlpha(), tij = renderer.getScissorTest();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.setScissorTest(true);
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    // (la cámara a ese lado del animal, mirando a su eje; su derecha en pantalla es (dz, 0, −dx), la
    // misma cuenta que hace el shader con la tarjeta)
    cam.position.set(Math.cos(a) * (medio * 3 + 2), (caja.min.y + caja.max.y) / 2, Math.sin(a) * (medio * 3 + 2));
    cam.up.set(0, 1, 0); cam.lookAt(0, (caja.min.y + caja.max.y) / 2, 0);
    cam.top = caja.max.y - (caja.min.y + caja.max.y) / 2; cam.bottom = caja.min.y - (caja.min.y + caja.max.y) / 2; cam.updateProjectionMatrix();
    rt.viewport.set(W * k, 0, W, H); rt.scissor.set(W * k, 0, W, H); rt.scissorTest = true;
    renderer.setRenderTarget(rt); renderer.render(escena, cam);
  }
  rt.scissorTest = false;
  // a una textura normal (con mipmaps) para que de lejos no parpadee
  const px = new Uint8Array(W * N * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W * N, H, px);
  renderer.setScissorTest(tij); renderer.setRenderTarget(antes); renderer.setClearColor(color, alfa);
  rt.dispose(); escena.remove(m.raiz); if (propio) m.suave.malla.material.dispose();
  m.poner('quieto', 0); m.restaurar();
  const tex = new THREE.DataTexture(px, W * N, H, THREE.RGBAFormat);
  tex.generateMipmaps = true; // (los píxeles del render target ya son lineales)
  tex.premultiplyAlpha = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  // la tarjeta: de −medio a medio de ancho y de abajo a arriba del animal (la uv.x, dentro de una vista)
  const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXY(i, -medio + pos.getX(i) * medio * 2, caja.min.y + pos.getY(i) * tam.y);
  geo.computeBoundingSphere();
  return { textura: tex, geo };
}

export function materialImpostor(textura) {
  const m = new THREE.MeshLambertMaterial({ map: textura, alphaTest: 0.5, side: THREE.DoubleSide });
  m.userData.base = m.color.clone();
  m.onBeforeCompile = (sh) => {
    const giro = `vec3 centroI = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 haciaCam = cameraPosition - centroI; haciaCam.y = 0.0; haciaCam = normalize(haciaCam + vec3(1e-5, 0.0, 0.0));
      vec3 derecha = vec3(haciaCam.z, 0.0, -haciaCam.x);
      float escI = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\n{ ${giro} transformedNormal = normalize((viewMatrix * vec4(normalize(haciaCam + vec3(0.0, 0.6, 0.0)), 0.0)).xyz); }`)
      .replace('#include <project_vertex>', `${giro}
      vec3 pI = centroI + derecha * position.x * escI + vec3(0.0, position.y * escI, 0.0);
      vec4 mvPosition = viewMatrix * vec4(pI, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      // la vista que toca: la dirección de la cámara vista desde el animal (en su marco: x delante, z a
      // su lado), redondeada a la más cercana de las 8
      vec3 delante = normalize((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
      vec3 costado = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
      float angI = atan(dot(haciaCam, costado), dot(haciaCam, delante));
      float vista = mod(floor(angI / 6.2831853 * ${VISTAS_IMPOSTOR}.0 + 0.5), ${VISTAS_IMPOSTOR}.0);
      vUvImp = vec2((vista + uv.x) / ${VISTAS_IMPOSTOR}.0, uv.y);`);
    sh.vertexShader = 'varying vec2 vUvImp;\n' + sh.vertexShader;
    sh.fragmentShader = 'varying vec2 vUvImp;\n' + sh.fragmentShader.replace('#include <map_fragment>', '{ vec4 sampledDiffuseColor = texture2D(map, vUvImp); diffuseColor *= sampledDiffuseColor; }');
    // (volteada, la tarjeta da la cara de atrás: que se ilumine igual)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  m.customProgramCacheKey = () => 'impostorAnimal8';
  return m;
}
