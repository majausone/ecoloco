// El puente entre el motor (el port de Virtual Ecosystem) y el mundo vivo: hace avanzar el
// motor de día en día y entrega, para cada día, lo que necesita la capa de individuos:
// el estado de las cohortes de animales, los sucesos del día (cazas, muertes, nacimientos,
// dispersiones, entradas y salidas), el clima, las plantas de cada cuadro (cohortes de
// árboles, fruta, hojas, setas) y lo que comió cada cohorte en cada cuadro.

import { Simulacion } from '../motor/simulacion.js?v=202610052205';
import { diasAFecha } from '../motor/core/componentes.js?v=202610052205';

const suma3 = (a, i) => a[i] + a[i + 1] + a[i + 2];

export class PuenteMotor {
  constructor(escenario, meta, { semilla = 1, celdaDiorama = null } = {}) {
    this.sim = new Simulacion(escenario, { semilla, meta, guardarSalidas: false, registrarEventos: true });
    this.sim.inicializar();
    const g = this.sim.grid;
    this.nx = g.cell_nx; this.ny = g.cell_ny; this.celda = Math.sqrt(g.cell_area);
    this.celdaDiorama = celdaDiorama ?? Math.floor(this.ny / 2) * this.nx + Math.floor(this.nx / 2);
    this.animal = this.sim.modelos.animal;
    this.plantas = this.sim.modelos.plants;
  }

  get dia() { return this.sim.time_index; }
  get terminado() { return this.sim.terminada; }
  fecha(t = this.dia) { return diasAFecha(this.sim.model_timing.update_datestamps[Math.min(t, this.sim.model_timing.n_updates - 1)]); }

  // las cohortes de animales tal como están ahora
  cohortes() {
    const out = [];
    const una = (c, estado) => ({
      id: c.id, grupo: c.fg.name, n: c.individuals, masa: c.mass, adulta: c.fg.adult_mass, madura: c.is_mature,
      edad: c.age, territorio: c.territory.slice(), centroide: c.centroid_key, estado, campeo: c.territory_size,
    });
    for (const c of this.animal.active_cohorts.values()) out.push(una(c, 'activa'));
    for (const c of this.animal.migrated_cohorts.values()) out.push(una(c, 'migrada'));
    for (const c of this.animal.aquatic_cohorts.values()) out.push(una(c, 'acuatica'));
    return out;
  }

  // las plantas de un cuadro: sus cohortes (árboles del motor) y su comida
  plantasDe(c) {
    const d = this.sim.data;
    const com = this.plantas.comunidades.get(c);
    const pfts = this.plantas.pfts;
    const porPft = (nombre) => {
      if (!d.has(nombre)) return {};
      const a = d.get(nombre), np = a.shape[1], o = {};
      pfts.forEach((p, k) => { o[p] = suma3(a.data, (c * np + k) * 3); });
      return o;
    };
    const densidad = (nombre) => (d.has(nombre) ? d.get(nombre).data[c * 3] : 0);
    return {
      celda: c,
      cohortesPlantas: { pft_name: com.cohortes.pft_name.slice(), dbh_value: Array.from(com.cohortes.dbh_value),
        n_individuals: com.cohortes.n_individuals.slice(), cohort_id: com.cohortes.cohort_id.slice() },
      alometria: { stem_height: Array.from(com.alometria.stem_height), crown_area: Array.from(com.alometria.crown_area),
        stem_mass: Array.from(com.alometria.stem_mass || []), foliage_mass: Array.from(com.alometria.foliage_mass || []) },
      recursos: {
        fruta: porPft('canopy_fruit_cnp'), frutaSuelo: porPft('fallen_fruit_cnp'), hojas: porPft('canopy_foliage_cnp'),
        setas: densidad('fungal_fruiting_bodies_cnp'), sotobosque: densidad('subcanopy_vegetation_cnp'),
        hojarasca: densidad('litter_pool_above_metabolic_cnp') + densidad('litter_pool_above_structural_cnp'),
      },
    };
  }
  // compatibilidad: el cuadro central
  diorama() { return this.plantasDe(this.celdaDiorama); }
  // todos los cuadros (para la zona de detalle, que puede caer en cualquiera)
  todasLasPlantas() { return this.sim.grid.cell_id.map((c) => this.plantasDe(c)); }

  clima(t = this.dia) {
    const d = this.sim.data, c = this.celdaDiorama;
    const v = (n) => (d.has(n) ? d.corte(n, Math.min(t, this.sim.model_timing.n_updates - 1)).data[c] : NaN);
    // nubosidad: el motor no la da; sale de la radiación solar del día frente a la de un día
    // despejado (la más alta de ese mes en la serie de entrada)
    const rad = v('downward_shortwave_radiation');
    return { temperatura: v('air_temperature_ref'), lluvia: v('precipitation'), humedad: v('relative_humidity_ref'),
      oscilacion: v('diurnal_temperature_range_ref'), viento: v('wind_speed_ref'), radiacion: rad,
      nubes: Number.isFinite(rad) ? Math.min(1, Math.max(0, 1 - rad / this.radiacionDespejada(t))) : 0.5 };
  }
  // la radiación de un día despejado: el percentil 95 de los días del mismo mes de la serie
  radiacionDespejada(t) {
    if (!this._despejado) {
      const d = this.sim.data, c = this.celdaDiorama, T = this.sim.model_timing.n_updates, porMes = Array.from({ length: 12 }, () => []);
      if (d.has('downward_shortwave_radiation')) for (let k = 0; k < T; k++) { const x = d.corte('downward_shortwave_radiation', k).data[c]; if (Number.isFinite(x)) porMes[Number(this.fecha(k).slice(5, 7)) - 1].push(x); }
      this._despejado = porMes.map((l) => { l.sort((a, b) => a - b); return l.length ? l[Math.floor(l.length * 0.95)] : 1; });
    }
    return this._despejado[Number(this.fecha(t).slice(5, 7)) - 1] || 1;
  }

  // avanza un día. Devuelve el día con lo de antes (cohortes al empezar) y lo de después.
  paso() {
    const t = this.dia;
    const antes = this.cohortes();
    const clima = this.clima(t);
    this.sim.paso();
    const eventos = this.animal.eventos.slice();
    // lo que comió cada cohorte en cada cuadro (kg de C, N y P por tipo de recurso)
    const consumo = [];
    for (const c of this.animal.active_cohorts.values()) {
      for (const r of c.trophic_record.values()) {
        if (r.kind !== 'cohort') consumo.push({ cohorte: c.id, recurso: r.kind, celda: Number(r.id), masa: r.C + r.N + r.P });
      }
    }
    return { dia: t, fecha: this.fecha(t), clima, antes, despues: this.cohortes(), eventos, consumo, plantas: this.todasLasPlantas() };
  }
}
