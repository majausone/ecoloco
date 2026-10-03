// Cuántos km² representa el mundo: la misma rejilla del motor (9 × 9) con cuadros más grandes
// o más pequeños. Lo que va por superficie (kg/m², densidades de animales, suelo, hojarasca)
// se queda igual; lo que va por cuadro se multiplica por el cambio de área: los troncos de
// cada cohorte de plantas y los propágulos. Los animales salen solos a la misma densidad,
// porque el motor los calcula con la densidad y el área total.

export const KM2_BASE = 0.6561; // 81 cuadros de 90 m

export function escalarEscenario(esc, km2) {
  const g = esc.config.core.grid;
  const n = g.cell_nx * g.cell_ny;
  const area = (km2 * 1e6) / n;
  const k = area / g.cell_area;
  if (Math.abs(k - 1) < 1e-9) return esc;
  g.cell_area = area;
  g.xoff = g.yoff = -Math.sqrt(area) / 2;
  const t = esc.tablas.cohortes_plantas.datos;
  t.plant_cohorts_n = t.plant_cohorts_n.map((x) => Math.max(1, Math.round(x * k)));
  const p = esc.inputs.plant_pft_propagules;
  if (p) p.data = p.data.map((x) => Math.max(1, Math.round(x * k)));
  esc.escalaKm2 = km2;
  return esc;
}
