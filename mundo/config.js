// La configuración de un mundo antes de generarlo (la portada, index.html): tamaño, agua,
// bosque, clima y qué especies hay. Se aplica al escenario del motor (lo que el motor admite:
// área, cohortes de plantas, grupos de animales, clima de entrada) y al mapa (río, charcas y
// qué especies de dibujo salen). Sin gráficos: la usan la portada, el trabajador y las pruebas.
//
// Un mundo se describe entero con su configuración y su semilla (el motor es determinista), así
// que «guardar un mundo» es guardar esto más el día en que va.

import { ESPECIES_DE_GRUPO, VERTEBRADOS } from './especies.js?v=202610060036';

export const CONFIG_BASE = {
  nombre: 'Maliau, bosque maduro',
  km2: 1,               // el mundo que calcula el motor: de 1 a 10 km²
  lado: 100,            // el mapa que se dibuja: un cuadrado de 50 a 1000 m de lado
  semilla: 1,
  rio: 'arroyo',        // arroyo · ancho · ninguno
  charcas: 'pocas',     // ninguna · pocas · muchas
  bosque: 'maduro',     // maduro · claro (tras un incendio) · poco_sotobosque (10 % de arbustos)
  clima: 'maliau',      // maliau · calido (+2 °C) · seco (−40 % de lluvia) · humedo (+40 %)
  quitar: [],           // especies (de animales, plantas y setas) que no hay
};

// los preajustes: rellenan la configuración (y luego se puede tocar)
export const PREAJUSTES = [
  { id: 'maliau', nombre: 'Maliau, bosque maduro', nombreEn: 'Maliau, mature forest', textoEn: 'The dipterocarp forest of the Maliau Basin as the scenario gives it: trees up to 60 m, a stream and every species.', texto: 'El bosque de dipterocarpos de la cuenca de Maliau tal como lo da el escenario: árboles de hasta 60 m, un arroyo y todas las especies.',
    config: {} },
  { id: 'incendio', nombre: 'Claro tras un incendio', nombreEn: 'Clearing after a fire', textoEn: 'One year after the fire: few big trees remain, the understorey and saplings regrow and the canopy animals are missing.', texto: 'Un año después del fuego: quedan pocos árboles grandes, el sotobosque y los arbolillos rebrotan y faltan los animales que viven en la copa.',
    config: { bosque: 'claro', quitar: ['orangutan', 'calao', 'ardilla-prevost', 'rajah-brooke'] } },
  { id: 'ribera', nombre: 'Ribera', nombreEn: 'Riverside', textoEn: 'Next to a wide river, with ponds everywhere: more room for frogs, monitor lizards and dragonflies.', texto: 'Junto a un río ancho, con charcas por todas partes: más sitio para ranas, varanos y libélulas.',
    config: { rio: 'ancho', charcas: 'muchas' } },
  { id: 'seco', nombre: 'Año seco (El Niño)', nombreEn: 'Dry year (El Niño)', textoEn: 'The same forest with 40 % less rain and 2 °C warmer: like the El Niño years in Borneo.', texto: 'El mismo bosque con un 40 % menos de lluvia y 2 °C más: como los años de El Niño en Borneo.',
    config: { clima: 'seco_calido' } },
  { id: 'grande', nombre: 'Maliau a lo grande (10 km²)', nombreEn: 'Maliau at large (10 km²)', textoEn: 'The basin at 10 km²: more of the scarce animals (clouded leopards, orangutans, bearded pigs), at their real density.', texto: 'La cuenca a 10 km²: más animales de los escasos (panteras, orangutanes, jabalíes), a su densidad real.',
    config: { km2: 10 } },
];

// en inglés, los textos de las opciones
export const OPCIONES_EN = { Arroyo: 'Stream', 'Río ancho': 'Wide river', 'Sin río': 'No river', Ninguna: 'None', 'Una por cuadro': 'One per cell', Muchas: 'Many',
  Maduro: 'Mature', 'Claro tras un incendio': 'Clearing after a fire', 'Poco sotobosque': 'Little understorey', 'El de Maliau': 'Maliau’s', '−40 % de lluvia': '−40 % rain', '+40 % de lluvia': '+40 % rain', 'Seco y cálido': 'Dry and warm' };

export const OPCIONES = {
  rio: [['arroyo', 'Arroyo'], ['ancho', 'Río ancho'], ['ninguno', 'Sin río']],
  charcas: [['ninguna', 'Ninguna'], ['pocas', 'Una por cuadro'], ['muchas', 'Muchas']],
  bosque: [['maduro', 'Maduro'], ['claro', 'Claro tras un incendio'], ['poco_sotobosque', 'Poco sotobosque']],
  clima: [['maliau', 'El de Maliau'], ['calido', '+2 °C'], ['seco', '−40 % de lluvia'], ['humedo', '+40 % de lluvia'], ['seco_calido', 'Seco y cálido']],
};

// grupos del motor que van juntos (la oruga se hace mariposa y la mariposa pone orugas)
export const PAREJAS = { caterpillar: 'butterfly', butterfly: 'caterpillar' };

export function completar(c = {}) {
  const out = { ...CONFIG_BASE, ...c, quitar: [...new Set(c.quitar || [])] };
  out.km2 = Math.round(Math.min(10, Math.max(1, Number(out.km2) || 1)) * 10) / 10;
  out.lado = Math.round(Math.min(1000, Math.max(50, Number(out.lado) || 100)) / 10) * 10;
  out.semilla = Math.max(1, Math.floor(Number(out.semilla) || 1));
  return out;
}

// qué grupos del motor se quedan sin ninguna especie (y entonces salen del motor)
export function gruposQuitados(c) {
  const fuera = new Set(c.quitar);
  const sin = new Set(Object.entries(ESPECIES_DE_GRUPO).filter(([, l]) => l.every(([e]) => fuera.has(e))).map(([g]) => g));
  for (const g of [...sin]) if (PAREJAS[g]) sin.add(PAREJAS[g]);
  return sin;
}

// aplica la configuración al escenario del motor (antes de crear la simulación)
export function aplicarAlEscenario(esc, c) {
  // animales: los grupos sin especies salen de la tabla de grupos
  const sin = gruposQuitados(c);
  if (sin.size) {
    const t = esc.tablas.grupos_animales.datos, quedan = t.name.map((n) => !sin.has(n));
    for (const k of Object.keys(t)) t[k] = t[k].filter((_, i) => quedan[i]);
  }
  // bosque
  const p = esc.tablas.cohortes_plantas.datos;
  if (c.bosque === 'claro') {
    // tras el fuego: de los árboles grandes queda 1 de cada 20, de los medianos la mitad, y el
    // sotobosque y los arbolillos rebrotan con fuerza
    p.plant_cohorts_n = p.plant_cohorts_n.map((n, i) => {
      const d = p.plant_cohorts_dbh[i], arbusto = p.plant_cohorts_pft[i] === 'shrub';
      return Math.max(1, Math.round(arbusto ? n * 2 : d >= 0.25 ? n * 0.05 : d >= 0.12 ? n * 0.5 : n * 2));
    });
  } else if (c.bosque === 'poco_sotobosque') {
    // un 10 % de los arbustos (no ninguno: si el motor se queda sin arbustos, el modelo del
    // suelo recibe hojarasca de arbusto vacía y da NaN; está en el informe)
    p.plant_cohorts_n = p.plant_cohorts_n.map((n, i) => (p.plant_cohorts_pft[i] === 'shrub' ? Math.max(1, Math.round(n * 0.1)) : n));
  }
  // clima de entrada (temperatura y lluvia de todos los días)
  const dT = c.clima === 'calido' || c.clima === 'seco_calido' ? 2 : 0;
  const fL = c.clima === 'seco' || c.clima === 'seco_calido' ? 0.6 : c.clima === 'humedo' ? 1.4 : 1;
  if (dT) { const a = esc.inputs.air_temperature_ref; a.data = a.data.map((x) => x + dT); if (esc.inputs.mean_annual_temperature) { const m = esc.inputs.mean_annual_temperature; m.data = m.data.map((x) => x + dT); } }
  if (fL !== 1) { const a = esc.inputs.precipitation; a.data = a.data.map((x) => x * fL); }
  esc.configMundo = c;
  return esc;
}

// lo que la configuración cambia en el mapa (agua y especies de dibujo)
export function opcionesMapa(c) {
  return { rio: c.rio, charcas: c.charcas, quitar: c.quitar };
}

// lo que va a tener el mundo (para enseñarlo antes de generarlo), a partir del escenario
export function resumen(esc, c) {
  const area = c.km2 * 1e6, sin = gruposQuitados(c);
  const t = esc.tablas.grupos_animales.datos, grupos = [];
  t.name.forEach((g, i) => { if (!sin.has(g)) grupos.push({ grupo: g, n: t.density_individuals_m2[i] * area, vertebrado: VERTEBRADOS.has(g) }); });
  // árboles por hectárea (broadleaf) del escenario base, con lo que cambia el bosque
  const p = esc.tablas.cohortes_plantas.datos, celdas = new Set(p.plant_cohorts_cell_id).size || 1;
  const aCelda = esc.config.core.grid.cell_area;
  let arboles = 0, grandes = 0, arbustos = 0;
  p.plant_cohorts_n.forEach((n, i) => {
    const d = p.plant_cohorts_dbh[i], arb = p.plant_cohorts_pft[i] === 'shrub';
    let k = 1;
    if (c.bosque === 'claro') k = arb ? 2 : d >= 0.25 ? 0.05 : d >= 0.12 ? 0.5 : 2;
    if (c.bosque === 'poco_sotobosque' && arb) k = 0.1;
    const porHa = n * k / celdas / aCelda * 1e4;
    if (arb) arbustos += porHa; else { arboles += porHa; if (d >= 0.5) grandes += porHa; }
  });
  return { grupos, arboles, grandes, arbustos, lado: Math.sqrt(area) };
}

// para pasar la configuración por la dirección (?mundo=...)
export const aTexto = (c) => btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deTexto = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
