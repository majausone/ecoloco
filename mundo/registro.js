// El registro de los datos del motor, día a día, para enseñarlos (pestaña «Datos» del mundo
// vivo) y para las predicciones. Todas las variables del motor, a tres niveles:
//   - el mundo: la media de todos los cuadros (o la suma, en lo que va por cuadro: kg);
//   - un cuadro del motor;
//   - una capa (de la de encima del dosel al subsuelo), en las variables con perfil vertical.
// Se guarda cada día: de las variables de un valor por cuadro, el de cada cuadro (81 números);
// de las de perfil, la media de cada capa; y aparte los animales por grupo (individuos del
// motor) y las plantas (troncos por tipo). Unos 40 kB por día.

// las categorías, por el nombre de la variable
const CATEGORIAS = [
  ['animales', /^(population_densities|total_animal_respiration|animal_)/],
  ['hojarasca', /^(litter_|lignin_|decomposed_|herbivory_waste|stem_lignin|senesced_leaf_lignin|root_lignin|subcanopy_.*litter)/],
  ['agua', /^(soil_moisture|matric_potential|groundwater|surface_runoff|subsurface|total_runoff|baseflow|bypass_flow|vertical_flow|river_|soil_evaporation|canopy_evaporation|interception|transpiration|precipitation_surface|snow|sublimation|temperature_driven_snowmelt|rain_driven_snowmelt|condensation|aerodynamic_resistance)/],
  ['suelo', /^(soil_|pH$|clay_fraction|dissolved_|.*mycorrhiza|plant_symbiote|root_carbohydrate|.*_uptake$|.*mycorrhizal)/],
  ['plantas', /^(canopy_|fallen_|subcanopy_|layer_|leaf_area_index|plant_|foliage_|seed_|fruit_|root_turnover|stem_turnover|stomatal|light_use|fungal_)/],
  ['clima', /./],
];
export const NOMBRE_CATEGORIA = { clima: 'Clima', agua: 'Agua', suelo: 'Suelo', hojarasca: 'Hojarasca', plantas: 'Plantas y hongos', animales: 'Animales' };
export const categoria = (n) => CATEGORIAS.find(([, r]) => r.test(n))[0];

// nombres en castellano de las más usadas (las demás, con la descripción del motor)
export const NOMBRE = {
  air_temperature_ref: 'Temperatura del aire (2 m)', air_temperature: 'Temperatura del aire', relative_humidity_ref: 'Humedad relativa (2 m)',
  relative_humidity: 'Humedad relativa', precipitation: 'Lluvia', atmospheric_pressure_ref: 'Presión atmosférica', atmospheric_co2_ref: 'CO₂ del aire',
  atmospheric_co2: 'CO₂ del aire', wind_speed_ref: 'Viento (2 m)', wind_speed: 'Viento', downward_shortwave_radiation: 'Radiación solar',
  downward_longwave_radiation: 'Radiación de onda larga', diurnal_temperature_range_ref: 'Oscilación de temperatura del día', diurnal_temperature_range: 'Oscilación de temperatura del día',
  mean_annual_temperature: 'Temperatura media anual', vapour_pressure_deficit_ref: 'Déficit de presión de vapor (2 m)', vapour_pressure_deficit: 'Déficit de presión de vapor',
  vapour_pressure_ref: 'Presión de vapor (2 m)', vapour_pressure: 'Presión de vapor', net_radiation: 'Radiación neta', canopy_temperature: 'Temperatura de las hojas',
  soil_temperature: 'Temperatura del suelo', elevation: 'Altitud', atmospheric_pressure: 'Presión atmosférica', density_air: 'Densidad del aire',
  specific_heat_air: 'Calor específico del aire', latent_heat_vapourisation: 'Calor latente de vaporización',
  soil_moisture: 'Agua en el suelo', matric_potential: 'Potencial matricial del suelo', groundwater_storage: 'Agua subterránea', surface_runoff: 'Escorrentía superficial',
  total_runoff: 'Escorrentía total', river_discharge_rate: 'Caudal del río', soil_evaporation: 'Evaporación del suelo', canopy_evaporation: 'Evaporación del dosel',
  interception: 'Lluvia retenida por las hojas', transpiration: 'Transpiración', precipitation_surface: 'Lluvia que llega al suelo', vertical_flow: 'Flujo vertical de agua',
  baseflow: 'Flujo base', subsurface_flow: 'Flujo subsuperficial', bypass_flow: 'Flujo preferente', condensation: 'Condensación',
  pH: 'pH del suelo', clay_fraction: 'Fracción de arcilla', soil_c_pool_bacteria: 'Bacterias del suelo (C)', soil_c_pool_saprotrophic_fungi: 'Hongos saprófitos del suelo (C)',
  soil_c_pool_arbuscular_mycorrhiza: 'Micorrizas arbusculares (C)', soil_c_pool_ectomycorrhiza: 'Ectomicorrizas (C)', soil_cnp_pool_maom: 'Materia orgánica mineral del suelo (C)',
  soil_cnp_pool_pom: 'Materia orgánica particulada del suelo (C)', soil_cnp_pool_lmwc: 'Carbono soluble del suelo', soil_cnp_pool_necromass: 'Necromasa microbiana (C)',
  soil_n_pool_ammonium: 'Amonio del suelo', soil_n_pool_nitrate: 'Nitrato del suelo', soil_p_pool_labile: 'Fósforo lábil del suelo', soil_p_pool_primary: 'Fósforo primario del suelo',
  soil_p_pool_secondary: 'Fósforo secundario del suelo', dissolved_nitrate: 'Nitrato disuelto', dissolved_ammonium: 'Amonio disuelto', dissolved_phosphorus: 'Fósforo disuelto',
  litter_pool_above_metabolic_cnp: 'Hojarasca blanda (C)', litter_pool_above_structural_cnp: 'Hojarasca dura (C)', litter_pool_woody_cnp: 'Madera muerta (C)',
  litter_pool_below_metabolic_cnp: 'Raíces muertas blandas (C)', litter_pool_below_structural_cnp: 'Raíces muertas duras (C)', litter_mineralisation_rate_cnp: 'Mineralización de la hojarasca (C)',
  canopy_foliage_cnp: 'Hojas del dosel (C)', canopy_fruit_cnp: 'Fruta en la copa (C)', canopy_seed_cnp: 'Semillas en la copa (C)', fallen_fruit_cnp: 'Fruta caída (C)',
  fallen_seeds_cnp: 'Semillas caídas (C)', subcanopy_vegetation_cnp: 'Sotobosque (C)', subcanopy_seedbank_cnp: 'Banco de semillas del sotobosque (C)',
  leaf_area_index: 'Índice de área foliar', layer_heights: 'Altura de las capas', layer_fapar: 'Luz absorbida (fracción)', shortwave_absorption: 'Radiación absorbida',
  stomatal_conductance: 'Conductancia estomática', light_use_efficiency: 'Eficiencia en el uso de la luz', plant_pft_propagules: 'Propágulos de plantas',
  fungal_fruiting_bodies_cnp: 'Setas (cuerpos fructíferos, C)', foliage_turnover_cnp: 'Hojas que caen (C)', root_turnover_cnp: 'Raíces que mueren (C)', stem_turnover_cnp: 'Ramas que caen (C)',
  canopy_foliage_cnp_consumed: 'Hojas comidas (C)', canopy_fruit_cnp_consumed: 'Fruta comida en la copa (C)', fallen_fruit_cnp_consumed: 'Fruta caída comida (C)',
  subcanopy_vegetation_cnp_consumed: 'Sotobosque comido (C)', total_animal_respiration: 'Respiración de los animales', population_densities: 'Densidad de animales',
  lignin_above_structural: 'Lignina de la hojarasca dura (fracción)', lignin_woody: 'Lignina de la madera muerta (fracción)', lignin_below_structural: 'Lignina de las raíces muertas duras (fracción)',
  soil_enzyme_pom_bacteria: 'Enzimas bacterianas (materia particulada)', soil_enzyme_maom_bacteria: 'Enzimas bacterianas (materia mineral)', soil_enzyme_pom_fungi: 'Enzimas de hongos (materia particulada)',
  soil_enzyme_maom_fungi: 'Enzimas de hongos (materia mineral)', seed_turnover_cnp: 'Semillas que caen (C)', fruit_turnover_cnp: 'Fruta que cae (C)',
  canopy_seed_cnp_consumed: 'Semillas comidas en la copa (C)', fallen_seeds_cnp_consumed: 'Semillas caídas comidas (C)', subcanopy_seedbank_cnp_consumed: 'Banco de semillas comido (C)',
  subcanopy_seedbank_litter_cnp: 'Banco de semillas que pasa a hojarasca (C)', subcanopy_vegetation_litter_cnp: 'Sotobosque que pasa a hojarasca (C)',
  stem_lignin: 'Lignina de los troncos (fracción)', senesced_leaf_lignin: 'Lignina de las hojas caídas (fracción)', root_lignin: 'Lignina de las raíces (fracción)',
  subcanopy_vegetation_litter_lignin: 'Lignina de la hojarasca del sotobosque (fracción)', subcanopy_seedbank_litter_lignin: 'Lignina de las semillas caídas (fracción)',
  snowfall: 'Nieve', snow_water_equivalent: 'Agua en la nieve', temperature_driven_snowmelt: 'Nieve fundida por el calor', rain_driven_snowmelt: 'Nieve fundida por la lluvia',
  sublimation_snow: 'Nieve que se evapora', aerodynamic_resistance_soil: 'Resistencia aerodinámica del suelo', aerodynamic_resistance_canopy: 'Resistencia aerodinámica del dosel',
  litter_consumed_above_metabolic_cnp: 'Hojarasca blanda comida (C)', litter_consumed_above_structural_cnp: 'Hojarasca dura comida (C)', litter_consumed_woody_cnp: 'Madera muerta comida (C)',
  litter_consumed_below_metabolic_cnp: 'Raíces muertas blandas comidas (C)', litter_consumed_below_structural_cnp: 'Raíces muertas duras comidas (C)', fungal_fruiting_bodies_consumed_cnp: 'Setas comidas (C)',
  ectomycorrhizal_n_supply: 'Nitrógeno que dan las ectomicorrizas', ectomycorrhizal_p_supply: 'Fósforo que dan las ectomicorrizas', arbuscular_mycorrhizal_n_supply: 'Nitrógeno que dan las micorrizas arbusculares',
  arbuscular_mycorrhizal_p_supply: 'Fósforo que dan las micorrizas arbusculares', root_carbohydrate_exudation: 'Azúcares que sueltan las raíces', plant_symbiote_carbon_supply: 'Carbono que dan las plantas a sus hongos',
  plant_ammonium_uptake: 'Amonio que toman las plantas', plant_nitrate_uptake: 'Nitrato que toman las plantas', plant_phosphorus_uptake: 'Fósforo que toman las plantas',
  fallen_fruit_decay_cnp: 'Fruta caída que se pudre (C)', subcanopy_ammonium_uptake: 'Amonio que toma el sotobosque', subcanopy_nitrate_uptake: 'Nitrato que toma el sotobosque',
  subcanopy_phosphorus_uptake: 'Fósforo que toma el sotobosque', decomposed_excrement_cnp: 'Excrementos que se descomponen (C)', decomposed_carcasses_cnp: 'Cadáveres que se descomponen (C)',
  animal_pom_consumption_cnp: 'Materia orgánica del suelo comida por animales (C)', animal_bacteria_consumption: 'Bacterias comidas por animales', animal_saprotrophic_fungi_consumption: 'Hongos saprófitos comidos por animales',
  animal_ectomycorrhiza_consumption: 'Ectomicorrizas comidas por animales', animal_arbuscular_mycorrhiza_consumption: 'Micorrizas arbusculares comidas por animales',
  herbivory_waste_above_cnp: 'Restos de lo que comen los herbívoros, al suelo (C)', herbivory_waste_above_lignin: 'Lignina de los restos de los herbívoros (fracción)',
  herbivory_waste_below_cnp: 'Restos de raíces comidas por herbívoros (C)', herbivory_waste_below_lignin: 'Lignina de los restos de raíces (fracción)',
  subsurface_stormflow: 'Flujo subsuperficial de tormenta', surface_runoff_routed_plus_local: 'Escorrentía superficial que llega al río', subsurface_runoff_routed_plus_local: 'Flujo subsuperficial que llega al río',
};
const NOMBRE_CAPA = (rol, k) => ({ above: 'Encima del dosel', surface: 'Superficie', topsoil: 'Suelo (capa alta)', subsoil: 'Subsuelo' }[rol] || `Dosel ${k}`);

export class Registro {
  constructor(puente, meta) {
    this.p = puente;
    const sim = puente.sim, ls = sim.layer_structure;
    this.meta = meta?.variables || {};
    this.n = sim.grid.n_cells;
    this.area = sim.grid.cell_area;
    let k = 0;
    this.capas = ls.layer_roles.map((r) => NOMBRE_CAPA(r, r === 'canopy' ? ++k : 0));
    this.fechas = [];
    this.series = new Map(); // clave -> { datos: Float32Array (crece), ancho }
    this.grupos = []; // nombres de los grupos de animales (orden de población)
    this.forma = new Map(); // variable -> 'celda' | 'capas' | 'pft' ...
  }
  // cómo se reduce cada variable a «un valor por cuadro» (o por capa)
  _vista(nombre) {
    const v = this.p.sim.data.get(nombre), d = v.dims;
    if (d.length === 1 && d[0] === 'cell_id') return { tipo: 'celda', valor: (c) => v.data[c] };
    if (d.length === 2 && d[0] === 'cell_id' && d[1] === 'element') return { tipo: 'celda', valor: (c) => v.data[c * 3] };
    if (d.length === 2 && d[0] === 'cell_id' && d[1] === 'pft') return { tipo: 'celda', valor: (c) => v.data[c * v.shape[1]] + v.data[c * v.shape[1] + 1] };
    if (d.length === 3 && d[0] === 'cell_id' && d[1] === 'pft' && d[2] === 'element') { const np = v.shape[1]; return { tipo: 'celda', valor: (c) => { let s = 0; for (let p = 0; p < np; p++) s += v.data[(c * np + p) * 3]; return s; } }; }
    if (d.length === 2 && (d[0] === 'layers' || d[0] === 'groundwater_layers') && d[1] === 'cell_id') { const nl = v.shape[0]; return { tipo: 'capas', nl, valor: (c, l) => v.data[l * this.n + c] }; }
    return null;
  }
  _guardar(clave, valores) {
    let s = this.series.get(clave);
    if (!s) this.series.set(clave, (s = { datos: new Float32Array(64 * valores.length), ancho: valores.length, n: 0 }));
    if ((s.n + 1) * s.ancho > s.datos.length) { const d = new Float32Array(s.datos.length * 2); d.set(s.datos); s.datos = d; }
    s.datos.set(valores, s.n * s.ancho); s.n++;
  }
  // tras cada día del motor
  apuntar(fecha, cohortes) {
    this.fechas.push(fecha);
    const n = this.n, d = this.p.sim.data;
    for (const nombre of d.nombres()) {
      const v = d.get(nombre);
      if (nombre === 'population_densities') continue;
      const w = this._vista(nombre);
      if (!w) continue;
      this.forma.set(nombre, w.tipo === 'capas' ? { tipo: 'capas', nl: w.nl } : { tipo: 'celda' });
      if (w.tipo === 'celda') { const a = new Float32Array(n); for (let c = 0; c < n; c++) a[c] = w.valor(c); this._guardar(nombre, a); }
      else {
        const a = new Float32Array(w.nl);
        for (let l = 0; l < w.nl; l++) { let s = 0, k = 0; for (let c = 0; c < n; c++) { const x = w.valor(c, l); if (Number.isFinite(x)) { s += x; k++; } } a[l] = k ? s / k : NaN; }
        this._guardar(nombre, a);
      }
    }
    // animales: individuos del motor por grupo
    const t = {};
    for (const c of cohortes) if (c.estado === 'activa') t[c.grupo] = (t[c.grupo] || 0) + c.n;
    for (const g of Object.keys(t)) if (!this.grupos.includes(g)) this.grupos.push(g);
    this._guardar('animales', this._ajustarAncho('animales', this.grupos.map((g) => t[g] || 0)));
  }
  // (los grupos pueden aparecer a mitad: la serie de animales se ensancha)
  _ajustarAncho(clave, valores) {
    const s = this.series.get(clave);
    if (s && s.ancho < valores.length) {
      const d = new Float32Array(Math.max(64, s.n + 1) * valores.length * 2);
      for (let i = 0; i < s.n; i++) d.set(s.datos.subarray(i * s.ancho, (i + 1) * s.ancho), i * valores.length);
      s.datos = d; s.ancho = valores.length;
    }
    return Float32Array.from(valores);
  }

  // vuelve atrás: se queda con los n primeros días (al volver a una instantánea)
  recortar(n) {
    this.fechas.length = Math.min(this.fechas.length, n);
    for (const s of this.series.values()) s.n = Math.min(s.n, n);
  }
  // lo que hay ahora (el último día), para la lista de la pestaña: celda = null es el mundo
  catalogo(celda = null, nDias = Infinity) {
    const out = [];
    for (const [nombre, f] of this.forma) {
      const s = this.series.get(nombre);
      const n = Math.min(s?.n || 0, nDias);
      if (!n) continue;
      const o = (n - 1) * s.ancho, m = this.meta[nombre] || {};
      let valor, capas = null;
      if (f.tipo === 'celda') {
        if (celda == null) { let sum = 0, k = 0; for (let c = 0; c < s.ancho; c++) { const x = s.datos[o + c]; if (Number.isFinite(x)) { sum += x; k++; } } valor = k ? sum / k : NaN; }
        else valor = s.datos[o + celda];
      } else {
        // por capas: del cuadro, el valor del motor en cada capa (el del último día calculado);
        // del mundo, la media de cada capa
        const v = this.p.sim.data.get(nombre);
        capas = [];
        for (let l = 0; l < f.nl; l++) capas.push(celda == null ? s.datos[o + l] : v.data[l * this.n + celda]);
        const fin = capas.filter(Number.isFinite);
        valor = fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : NaN;
      }
      out.push({ nombre, titulo: NOMBRE[nombre] || null, descripcion: m.description || '', unidad: m.unit || '', categoria: categoria(nombre), forma: f.tipo, valor, capas, nombresCapas: f.tipo === 'capas' && f.nl === this.capas.length ? this.capas : null });
    }
    return out;
  }
  // la serie de una variable: un valor por día (del mundo, de un cuadro o de una capa)
  serie(nombre, celda = null, capa = null) {
    const s = this.series.get(nombre), f = this.forma.get(nombre);
    if (!s) return null;
    const out = new Float32Array(s.n);
    for (let i = 0; i < s.n; i++) {
      const o = i * s.ancho;
      if (f?.tipo === 'capas') {
        if (capa != null) out[i] = s.datos[o + capa];
        else { let sum = 0, k = 0; for (let l = 0; l < s.ancho; l++) { const x = s.datos[o + l]; if (Number.isFinite(x)) { sum += x; k++; } } out[i] = k ? sum / k : NaN; }
      } else if (celda != null) out[i] = s.datos[o + celda];
      else { let sum = 0, k = 0; for (let c = 0; c < s.ancho; c++) { const x = s.datos[o + c]; if (Number.isFinite(x)) { sum += x; k++; } } out[i] = k ? sum / k : NaN; }
    }
    return out;
  }
  // los animales por grupo (individuos del motor): { grupos, series: Float32Array por grupo }
  animales(nDias = Infinity) {
    const s = this.series.get('animales');
    if (!s) return { grupos: [], series: [] };
    const n = Math.min(s.n, nDias);
    return { grupos: this.grupos.slice(), series: this.grupos.map((_, g) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = g < s.ancho ? s.datos[i * s.ancho + g] : 0; return a; }) };
  }
}

// lo que se compara en una predicción (un valor por día, del mundo entero)
export function indicadores(puente, vertebrados) {
  const d = puente.sim.data, n = puente.sim.grid.n_cells, area = puente.sim.grid.cell_area;
  const media = (nombre, f = (v, c) => v.data[c]) => { if (!d.has(nombre)) return NaN; const v = d.get(nombre); let s = 0, k = 0; for (let c = 0; c < n; c++) { const x = f(v, c); if (Number.isFinite(x)) { s += x; k++; } } return k ? s / k : NaN; };
  const capa = (nombre, rol) => { const ls = puente.sim.layer_structure, l = ls.layer_roles.indexOf(rol); return media(nombre, (v, c) => v.data[l * n + c]); };
  const pft3 = (v, c) => { const np = v.shape[1]; let s = 0; for (let p = 0; p < np; p++) s += v.data[(c * np + p) * 3]; return s; };
  let vert = 0, inv = 0;
  for (const c of puente.animal.active_cohorts.values()) { if (vertebrados.has(c.fg.name)) vert += c.individuals; else inv += c.individuals; }
  return {
    temperatura: media('air_temperature_ref'),
    lluvia: media('precipitation'),
    aguaSuelo: capa('soil_moisture', 'topsoil'),
    hojas: media('canopy_foliage_cnp', pft3) * n / (n * area) * 1e4, // kg C por hectárea
    sotobosque: media('subcanopy_vegetation_cnp', (v, c) => v.data[c * 3]) * 1e4,
    hojarasca: media('litter_pool_above_metabolic_cnp', (v, c) => v.data[c * 3]) + media('litter_pool_above_structural_cnp', (v, c) => v.data[c * 3]),
    sueloC: media('soil_cnp_pool_maom', (v, c) => v.data[c * 3]) + media('soil_cnp_pool_pom', (v, c) => v.data[c * 3]),
    vertebrados: vert, invertebrados: inv,
  };
}
export const INDICADORES = [
  ['temperatura', 'Temperatura del aire', '°C'], ['lluvia', 'Lluvia', 'mm/día'], ['aguaSuelo', 'Agua en el suelo (capa alta)', 'mm'],
  ['hojas', 'Hojas del dosel', 'kg C/ha'], ['sotobosque', 'Sotobosque', 'kg C/ha'], ['hojarasca', 'Hojarasca', 'kg C/m²'], ['sueloC', 'Carbono del suelo', 'kg C/m³'],
  ['vertebrados', 'Vertebrados', 'individuos'], ['invertebrados', 'Invertebrados', 'individuos'],
];
