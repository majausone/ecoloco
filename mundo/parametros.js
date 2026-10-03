// Los parámetros que se pueden tocar en mitad de la partida (pestaña «Parámetros» del mundo
// vivo): el clima de entrada (de un día en adelante) y lo que el motor admite cambiar sin
// empezar de nuevo. Cada cambio se aplica desde un día: lo anterior ya ha pasado y se queda.
// Siempre se calcula sobre el valor de partida (no se acumulan: «+2 °C» es +2 °C sobre el clima
// de Maliau, aunque antes se hubiera puesto +1).

export const PARAMETROS = [
  { id: 'temperatura', nombre: 'Temperatura', nombreEn: 'Temperature', lineaEn: 'Added to the temperature of each day (air at 2 m, from which the canopy and the soil follow).', opciones: [-2, -1, 0, 1, 2, 4], neutro: 0, texto: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} °C`,
    linea: 'Se suma a la temperatura de cada día (la del aire a 2 m, de la que salen el dosel y el suelo).' },
  { id: 'lluvia', nombre: 'Lluvia', nombreEn: 'Rain', lineaEn: 'Multiplies the rain of each day.', opciones: [0.25, 0.5, 0.75, 1, 1.5, 2], neutro: 1, texto: (v) => `×${String(v).replace('.', ',')}`,
    linea: 'Multiplica la lluvia de cada día.' },
  { id: 'humedad', nombre: 'Humedad del aire', nombreEn: 'Air humidity', lineaEn: 'Added to the relative humidity of each day (between 5 and 100 %).', opciones: [-20, -10, 0, 10], neutro: 0, texto: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`,
    linea: 'Se suma a la humedad relativa de cada día (entre 5 y 100 %).' },
  { id: 'co2', nombre: 'CO₂ del aire', nombreEn: 'Air CO₂', lineaEn: 'More CO₂, more photosynthesis (the plants’ P model).', opciones: [1, 1.5, 2], neutro: 1, texto: (v) => `×${String(v).replace('.', ',')}`,
    linea: 'Más CO₂, más fotosíntesis (modelo P de las plantas).' },
  { id: 'mortalidad', nombre: 'Mortalidad de los árboles', nombreEn: 'Tree mortality', lineaEn: 'The probability of each trunk dying in a year (10 % in the scenario).', opciones: [0.5, 1, 2, 4], neutro: 1, texto: (v) => `×${String(v).replace('.', ',')}`,
    linea: 'La probabilidad de que muera cada tronco en un año (10 % en el escenario).' },
  { id: 'reclutamiento', nombre: 'Árboles nuevos', nombreEn: 'New trees', lineaEn: 'The probability of a propagule becoming a tree in a year (20 % in the scenario).', opciones: [0.5, 1, 2], neutro: 1, texto: (v) => `×${String(v).replace('.', ',')}`,
    linea: 'La probabilidad de que un propágulo se haga árbol en un año (20 % en el escenario).' },
];
export const NEUTROS = Object.fromEntries(PARAMETROS.map((p) => [p.id, p.neutro]));

const SERIES = { temperatura: 'air_temperature_ref', lluvia: 'precipitation', humedad: 'relative_humidity_ref', co2: 'atmospheric_co2_ref' };

// aplica los cambios (relativos al escenario de partida) al motor, desde el día «desde»
export function aplicarParametros(puente, cambios, desde) {
  const sim = puente.sim, d = sim.data, n = sim.grid.n_cells;
  puente._base ||= {};
  const c = { ...NEUTROS, ...cambios };
  for (const [id, nombre] of Object.entries(SERIES)) {
    if (!d.has(nombre)) continue;
    const s = d.serie(nombre);
    if (!s.dims.includes('time_index')) continue;
    const base = (puente._base[nombre] ||= s.data.slice());
    const T = s.shape[s.dims.indexOf('time_index')], tPrimero = s.dims[0] === 'time_index';
    const v = c[id];
    for (let t = Math.max(0, desde); t < T; t++) for (let k = 0; k < n; k++) {
      const i = tPrimero ? t * n + k : k * T + t, b = base[i];
      s.data[i] = id === 'temperatura' ? b + v : id === 'humedad' ? Math.min(100, Math.max(5, b + v)) : b * v;
    }
  }
  // la temperatura media anual (sin eje de tiempo): con la misma diferencia
  if (d.has('mean_annual_temperature')) {
    const m = d.get('mean_annual_temperature'), base = (puente._base.mean_annual_temperature ||= m.data.slice());
    for (let k = 0; k < m.data.length; k++) m.data[k] = base[k] + c.temperatura;
  }
  // plantas: las probabilidades de cada día salen de las anuales
  const pl = puente.plantas, k0 = pl.model_constants, upy = pl.model_timing.updates_per_year;
  const anual = (p, f) => Math.min(0.99, p * f);
  pl.probMortalidad = 1 - Math.pow(1 - anual(k0.per_stem_annual_mortality_probability, c.mortalidad), 1 / upy);
  pl.probReclutamiento = 1 - Math.pow(1 - anual(k0.per_propagule_annual_recruitment_probability, c.reclutamiento), 1 / upy);
  puente.cambios = c;
}
