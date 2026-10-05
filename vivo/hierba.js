/* LA HIERBA, ENTERA EN LA GPU. Una sola brizna (unos pocos vértices) dibujada con instancias en
   una rejilla alrededor de la cámara; cada brizna sale de su número de instancia en el shader
   (sin datos por brizna en memoria): su sitio (la casilla de la rejilla, fija en el mundo, con un
   desplazamiento al azar), su altura, su anchura, su giro, su curva y su color (unas más oscuras,
   otras más amarillas, por manchas), y el viento la mece. La altura del suelo y si ahí hay hierba
   (no en el agua ni en la orilla, ni fuera del cuadrado) se leen de una textura pequeña
   del terreno alrededor de la cámara (la altura cada metro, interpolada: la del suelo liso de
   vivo/terreno.js), que se rehace cuando la cámara se aleja. Tres anillos alrededor de la cámara
   (hasta 12, 32 y 70 m), ANIDADOS: el del medio lleva una de cada 2×2 briznas del de cerca y el de
   lejos una de cada 4×4, las mismas briznas en el mismo sitio; en cada frontera solo se retiran poco
   a poco las que el de fuera no lleva (sin briznas que salten de sitio al acercar o alejar la cámara).
   Cerca, 5 triángulos por brizna; en los otros, 1. Debajo, el suelo oscuro donde hay briznas y de su
   verde medio más allá (vivo/terreno.js): de lejos no se nota dónde acaban.
   Baja a propósito (para no tapar a los animales): la altura y la densidad, en la pestaña
   Opciones (vivo/graficos.js). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { conTransparencia } from './transparencia.js?v=202610052205';

const VENTANA = 176; // m de la textura del suelo alrededor de la cámara
// la brizna: x de −1 a 1 (a lo ancho), y de 0 a 1 (a lo alto); cerca con 3 tramos, lejos un triángulo
const BRIZNA = [-1, 0, 1, 0, -0.85, 0.35, 0.85, 0.35, -0.6, 0.7, 0.6, 0.7, 0, 1];
const BRIZNA_IDX = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6];
const BRIZNA_LEJOS = [-1, 0, 1, 0, 0, 1], BRIZNA_LEJOS_IDX = [0, 1, 2];

const CABECERA = `
uniform highp sampler2D uSuelo; uniform vec4 uSueloCaja; // x0, z0 (escena), lado de la textura (texels) y metros por texel
uniform vec2 uCentro; uniform float uPasoFino; uniform float uFactor; uniform float uLado; uniform float uDentro; uniform float uFuera; uniform vec3 uPrueba;
uniform float uAlto; uniform float uTiempo; uniform float uViento; uniform float uGrosor; uniform float uVariacion; uniform float uManchas;
varying vec3 vHierba;
float hz(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruidoH(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hz(i), hz(i + vec2(1, 0)), f.x), mix(hz(i + vec2(0, 1)), hz(i + vec2(1, 1)), f.x), f.y); }
// el azar de cada brizna, con enteros (fract(sin(x)) con x grande pierde precisión en muchas tarjetas
// y salen bandas sin briznas)
uint hu(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float hi(ivec2 c, uint k) { return float(hu(uint(c.x) * 0x9E3779B1u ^ hu(uint(c.y) + k * 0x85EBCA77u)) >> 8) / 16777216.0; }
vec3 gPos; vec3 gNor;
void brizna() {
  // (fila y columna con enteros: con floats, id / lado da a veces k − ε y la brizna cae en otra fila)
  int L = int(uLado + 0.5), id = gl_InstanceID, F = int(uFactor + 0.5);
  ivec2 ij = ivec2(id % L, id / L) - L / 2;
  // NIVELES ANIDADOS: todas las briznas salen de la misma rejilla fina (fija en el mundo); el anillo
  // del medio usa una celda de cada 2×2 y el de lejos una de cada 4×4, así que sus briznas son
  // EXACTAMENTE las mismas briznas (mismo sitio, altura, color...) que las del anillo de dentro: al
  // pasar de un anillo a otro no aparecen briznas nuevas ni se van otras; solo se retiran poco a poco
  // las que el anillo de fuera no lleva. (Antes cada anillo tenía su propia rejilla y en la frontera
  // unas desaparecían y salían otras en otro sitio: el «salto de nivel de detalle»)
  ivec2 ic = (ivec2(floor(uCentro / (uPasoFino * uFactor))) + ij) * F;
  // (el nivel de la brizna: 2 si también la lleva el anillo de lejos, 1 si la del medio, 0 si solo
  // la de cerca; con & y no con %, que con negativos no está definido en GLSL)
  int nivel = ((ic.x & 3) == 0 && (ic.y & 3) == 0) ? 2 : ((ic.x & 1) == 0 && (ic.y & 1) == 0) ? 1 : 0;
  float h1 = hi(ic, 1u), h2 = hi(ic, 2u), h3 = hi(ic, 3u), h4 = hi(ic, 4u), h5 = hi(ic, 5u);
  vec2 p = (vec2(ic) + vec2(h1, h2)) * uPasoFino;
  // el suelo: la altura (interpolada entre los cuatro puntos de alrededor) y si hay hierba
  vec2 q = (p - uSueloCaja.xy) / uSueloCaja.w, fq = fract(q);
  ivec2 c = ivec2(floor(q));
  float hay = 0.0, y0 = 0.0;
  if (c.x >= 0 && c.y >= 0 && float(c.x) < uSueloCaja.z - 1.0 && float(c.y) < uSueloCaja.z - 1.0) {
    vec4 s00 = texelFetch(uSuelo, c, 0), s10 = texelFetch(uSuelo, c + ivec2(1, 0), 0), s01 = texelFetch(uSuelo, c + ivec2(0, 1), 0), s11 = texelFetch(uSuelo, c + ivec2(1, 1), 0);
    y0 = mix(mix(s00.r, s10.r, fq.x), mix(s01.r, s11.r, fq.x), fq.y);
    hay = min(min(s00.g, s10.g), min(s01.g, s11.g));
  }
  // por manchas: más espesa aquí, más clara allá (y la densidad que se pida)
  // por zonas (manchas de varios metros): más alta o más baja, más gorda o más fina, más clara o
  // más rala; y de color, otras manchas, más grandes
  float mancha = ruidoH(p * 0.18), zonaAlto = ruidoH(p * 0.11 + vec2(37.0, 11.0)), zonaGrueso = ruidoH(p * 0.085 + vec2(-21.0, 53.0));
  float zonaColor = ruidoH(p * 0.05 + vec2(91.0, -7.0)), zonaColor2 = ruidoH(p * 0.13 + vec2(-61.0, 29.0)), zonaSeca = ruidoH(p * 0.034 + vec2(13.0, 71.0));
  if (h3 > 0.55 + mancha * 0.9 - uVariacion * 0.25) hay = 0.0;
  // cada anillo dibuja sus briznas entre su radio de dentro y el de fuera (la distancia en el suelo a
  // la cámara); antes de cada frontera se van retirando, poco a poco y siempre las mismas (las de su
  // azar más bajo), las briznas que el anillo de fuera no lleva: las de nivel 0 de 8,4 a 12 m, las de
  // nivel 1 de 22,4 a 32 m y las de nivel 2 (todas) de 49 a 70 m. Las que se quedan no cambian.
  // (ojo: smoothstep con los dos bordes iguales da un resultado indefinido en GLSL: por eso las rampas a mano)
  float d = distance(p, uCentro);
  if (d < uDentro || d >= uFuera) hay = 0.0;
  float masAncha = 1.0;
  float alto = uAlto * (0.5 + h3 * 0.9) * mix(1.0, 0.35 + zonaAlto * 1.5, uVariacion) * hay;
  float t = position.y;
  float ang = h4 * 6.2832, ancho = min(uAlto, 0.3) * (0.06 + h1 * 0.09) * uGrosor * mix(1.0, 0.45 + zonaGrueso * 1.3, uVariacion) * (1.0 - t * 0.85) * masAncha;
  vec2 frente = vec2(cos(ang), sin(ang)), lado = vec2(-frente.y, frente.x);
  // la curva propia y el viento (más en la punta)
  float curva = (h2 - 0.3) * 0.5 * t * t * alto;
  float w = uViento * (0.55 + 0.45 * sin(uTiempo * 1.6 + p.x * 0.35 + p.y * 0.21)) * (0.6 + 0.4 * sin(uTiempo * 4.3 + h1 * 6.0)) * t * t * alto * 0.5;
  vec2 xz = p + lado * position.x * ancho + frente * curva + vec2(0.8, 0.6) * w;
  gPos = alto > 0.002 ? vec3(xz.x, y0 + t * alto * (1.0 - 0.15 * abs(curva) / max(alto, 1e-3)), xz.y) : vec3(0.0, -1000.0, 0.0);
  gNor = normalize(vec3(frente.x, 1.4, frente.y));
  // el color: verdes distintos por brizna y por manchas, más claro en la punta y oscuro abajo
  vec3 oscuro = vec3(0.06, 0.16, 0.04), verde = vec3(0.16, 0.36, 0.08), amarillo = vec3(0.42, 0.48, 0.14);
  vec3 col = mix(verde, amarillo, clamp(h2 * 0.4 + (mancha - 0.5) * 0.4, 0.0, 1.0) * 0.35);
  // las manchas de color, bien marcadas: verde amarillento aquí, verde azulado oscuro allá y
  // zonas secas, pajizas (las mismas que pinta el suelo debajo)
  col = mix(col, vec3(0.42, 0.5, 0.1), smoothstep(0.5, 0.75, zonaColor) * uManchas);
  col = mix(col, vec3(0.04, 0.2, 0.12), smoothstep(0.45, 0.7, zonaColor2) * uManchas);
  col = mix(col, vec3(0.55, 0.46, 0.2), smoothstep(0.6, 0.8, zonaSeca) * uManchas * (0.7 + 0.3 * h1));
  vHierba = mix(oscuro, col, 0.35 + 0.65 * t) * (0.85 + h4 * 0.3);
  // (para las pruebas: cada anillo de un color, herramientas/prueba_hierba.mjs)
  if (uPrueba.x + uPrueba.y + uPrueba.z > 0.0) vHierba = uPrueba;
}
`;

function material(u) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = CABECERA + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'brizna();\nvec3 objectNormal = gNor;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = 'varying vec3 vHierba;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vHierba;')
      // las dos caras, igual de iluminadas
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  m.customProgramCacheKey = () => 'hierba';
  return conTransparencia(m, { margenExtra: 0.3 });
}

export function crearHierba({ escena, mapa, ox, oz, cima, orilla = (x, z) => mapa.distRio(x, z), tiempo, viento = { value: 1 } }) {
  // la textura del suelo (R: altura del suelo; G: 1 si hay hierba), alrededor de la cámara: un texel
  // por metro (o por 2, 4, 8 m con la cámara alta: los anillos crecen con la altura)
  const datos = new Float32Array(VENTANA * VENTANA * 4);
  const tex = new THREE.DataTexture(datos, VENTANA, VENTANA, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const caja = new THREE.Vector4(0, 0, VENTANA, 1);
  let origen = null;
  function rehacerSuelo(x0, z0) {
    const e = 1;
    for (let j = 0; j < VENTANA; j++) for (let i = 0; i < VENTANA; i++) {
      const x = x0 + i * e, z = z0 + j * e, o = (j * VENTANA + i) * 4;
      const dentro = mapa.enMundo(x, z) && x > 0.6 && z > 0.6 && x < mapa.ancho - 0.6 && z < mapa.alto - 0.6;
      const hierba = dentro && orilla(x, z) >= 1.0;
      datos[o] = dentro ? cima(x, z) + 0.01 : 0; datos[o + 1] = hierba ? 1 : 0;
    }
    tex.needsUpdate = true;
    origen = { x: x0, z: z0 };
    caja.set(x0 - ox, z0 - oz, VENTANA, e);
  }
  const comunes = { uSuelo: { value: tex }, uSueloCaja: { value: caja }, uTiempo: tiempo, uViento: viento, uAlto: { value: 0.22 }, uGrosor: { value: 1 }, uVariacion: { value: 0.7 }, uManchas: { value: 0.7 } };
  // los tres anillos: [paso de la rejilla, radio hasta el que se ve, hueco del centro, desde dónde
  // aparece (fundido con el de dentro), brizna]; el tercero, solo con la cámara alta
  // (alrededor de la cámara: [celdas finas por celda, radio de dentro, radio de fuera, brizna])
  const PASO_FINO = 0.115, zona = new THREE.Vector3(0, 0, 32);
  // (un solo anillo: sin niveles de detalle, quitados a petición)
  const RADIO = 30;
  const anillos = [[1, 0, RADIO, BRIZNA, BRIZNA_IDX]].map(([factor, dentro, fuera, vert, idx]) => {
    const lado = Math.ceil((fuera * 2) / (PASO_FINO * factor)) + 2;
    const geo = new THREE.InstancedBufferGeometry();
    const pos = new Float32Array((vert.length / 2) * 3);
    for (let k = 0; k < vert.length / 2; k++) { pos[k * 3] = vert[k * 2]; pos[k * 3 + 1] = vert[k * 2 + 1]; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    geo.setIndex(idx);
    geo.instanceCount = lado * lado;
    const u = { ...comunes, uCentro: { value: new THREE.Vector2() }, uPasoFino: { value: PASO_FINO }, uFactor: { value: factor }, uLado: { value: lado }, uDentro: { value: dentro }, uFuera: { value: fuera }, uPrueba: { value: new THREE.Vector3() } };
    const malla = new THREE.Mesh(geo, material(u));
    malla.frustumCulled = false; malla.receiveShadow = true; malla.castShadow = false;
    malla.userData.triangulosBrizna = idx.length / 3;
    escena.add(malla);
    return { malla, u, lado, factor, fuera };
  });
  const ajustes = { activa: true, alto: 0.22, densidad: 1, grosor: 1, variacion: 0.7, manchas: 0.7 };
  // la densidad: la rejilla, más fina (más briznas) o más gruesa
  // (y con la cámara alta, todo e veces más grande: la rejilla, el radio y la anchura de las briznas;
  // el número de briznas, el mismo)
  // (la misma rejilla fina para los tres anillos, que tienen que seguir anidados)
  let densidadPuesta = 1;
  const ponerDensidad = (k) => {
    densidadPuesta = k;
    const fino = PASO_FINO / Math.sqrt(k);
    for (const a of anillos) {
      const lado = Math.ceil((a.fuera * 2) / (fino * a.factor)) + 2;
      a.u.uPasoFino.value = fino; a.u.uLado.value = lado; a.lado = lado; a.malla.geometry.instanceCount = lado * lado;
    }
  };
  return {
    ajustes,
    // cada fotograma: la cámara y el punto del suelo al que mira (escena). Abajo, los anillos van con
    // la cámara; cuanto más alta, más se van hacia donde mira y más grandes son. La textura, si se ha alejado
    actualizar(cam) {
      // (los anillos, alrededor de la cámara: la distancia es la de cada brizna a la cámara en el
      // suelo, y no cambia el tamaño de nada con la altura)
      const on = ajustes.activa;
      for (const a of anillos) a.malla.visible = on;
      if (!on) return;
      const wx = cam.x + ox, wz = cam.z + oz;
      if (!origen || Math.abs(wx - (origen.x + VENTANA / 2)) > 16 || Math.abs(wz - (origen.z + VENTANA / 2)) > 16)
        rehacerSuelo(Math.floor(wx / 16) * 16 - VENTANA / 2, Math.floor(wz / 16) * 16 - VENTANA / 2);
      comunes.uAlto.value = ajustes.alto; comunes.uGrosor.value = ajustes.grosor; comunes.uVariacion.value = ajustes.variacion; comunes.uManchas.value = ajustes.manchas;
      if (ajustes.densidad !== densidadPuesta) ponerDensidad(ajustes.densidad);
      for (const a of anillos) a.u.uCentro.value.set(cam.x, cam.z);
      zona.set(cam.x, cam.z, RADIO); // (hasta donde llegan las briznas)
    },
    // los triángulos que dibuja como mucho (para las medidas)
    get triangulos() { return anillos.reduce((n, a) => n + (a.malla.visible ? a.lado * a.lado * a.malla.userData.triangulosBrizna : 0), 0); },
    get mallas() { return anillos.map((a) => a.malla); },
    zona, // centro de los anillos y hasta dónde llega la hierba espesa (para el suelo, vivo/terreno.js)
    // pruebas: cada anillo de un color (morado, cian, amarillo) o normal
    prueba(si) { anillos.forEach((a, n) => a.u.uPrueba.value.set(...(si ? [[1, 0, 1], [0, 1, 1], [1, 1, 0]][n] : [0, 0, 0]))); },
  };
}
