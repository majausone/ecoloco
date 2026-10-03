/* El panel del mundo vivo, en pestañas:
   - «Mundo»: tamaño, guardar, velocidad, ir a un día, el rendimiento (FPS y triángulos) y los
     animales del mapa (vertebrados e invertebrados por grupo, individuos del motor);
   - «Animales»: el buscador y el listado (vivo/ficha.js);
   - «Datos»: todas las variables del motor del mundo entero (y por capas, las que tienen
     perfil vertical), por categorías, con su gráfica a lo largo del tiempo;
   - «Parámetros»: cambiar el clima y lo que admite el motor desde el día que se ve, y una
     predicción (el motor deprisa, con y sin el cambio) para comparar;
   - y la de la ficha (de un animal, una planta o un hongo), que sale al pulsar uno, lleva su
     nombre y se cierra con una ✕ (se vuelve a la pestaña en la que se estaba). */

import { NOMBRE_CATEGORIA } from '../mundo/registro.js?v=202610032007';
import { INDICADORES } from '../mundo/registro.js?v=202610032007';
import { PARAMETROS, NEUTROS } from '../mundo/parametros.js?v=202610032007';
import { VERTEBRADOS } from '../mundo/especies.js?v=202610032007';
import { grafica, numero, COLOR } from './grafica.js?v=202610032007';
import { T, enIngles } from '../comun/idioma.js?v=202610032007';
import { GRUPO_EN } from '../comun/nombres.js?v=202610032007';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GRUPO_ES_ = {
  carnivorous_mammal: 'Felinos', herbivorous_mammal: 'Mamíferos herbívoros', fungivorous_mammal: 'Jabalíes y ardillas', scavenging_mammal: 'Varanos',
  herbivorous_lizard: 'Dragones del bosque', thermophilic_lizard: 'Eslizones', carnivorous_snake: 'Serpientes', frog: 'Ranas',
  carnivorous_bird: 'Rapaces', herbivorous_bird: 'Cálaos y gallos', swallow: 'Golondrinas',
  carnivorous_insect_iteroparous: 'Escarabajos tigre', carnivorous_insect_semelparous: 'Mantis y libélulas', herbivorous_insect_iteroparous: 'Fulgóridos y escarabajos',
  herbivorous_insect_semelparous: 'Insectos palo y cigarras', caterpillar: 'Orugas', butterfly: 'Mariposas', earthworm: 'Lombrices', dung_beetle: 'Escarabajos peloteros', detritivorous_insect: 'Termitas',
};
// el nombre de cada grupo del motor, en el idioma elegido
export const GRUPO_ES = enIngles() ? GRUPO_EN : GRUPO_ES_;
const CATEGORIA_EN = { clima: 'Climate', agua: 'Water', suelo: 'Soil', hojarasca: 'Leaf litter', plantas: 'Plants and fungi', animales: 'Animals' };
const CAPA_EN = { 'Encima del dosel': 'Above the canopy', Superficie: 'Surface', 'Suelo (capa alta)': 'Topsoil', Subsuelo: 'Subsoil' };
const capaTxt = (s) => (enIngles() ? CAPA_EN[s] || String(s).replace(/^Dosel/, 'Canopy') : s);
const INDICADOR_EN = { temperatura: 'Air temperature', lluvia: 'Rain', aguaSuelo: 'Soil water (top layer)', hojas: 'Canopy leaves', sotobosque: 'Understorey', hojarasca: 'Leaf litter',
  sueloC: 'Soil carbon', vertebrados: 'Vertebrates', invertebrados: 'Invertebrates' };
const UNIDAD_EN = { 'mm/día': 'mm/day', individuos: 'individuals' };
const UNIDAD = { C: '°C', 'kg m-2': 'kg/m²', 'kg m^-2': 'kg/m²', 'kg m^-3': 'kg/m³', 'kg{C} m^-3': 'kg C/m³', mm: 'mm', m: 'm', kPa: 'kPa', 'W m-2': 'W/m²', 'm s-1': 'm/s', ppm: 'ppm', '-': '' };
const unidad = (u) => UNIDAD[u] ?? String(u || '').replace(/^unitless$/, '').replace(/\{(\w)\}/g, ' $1').replace(/\s*day\^-1/g, T('/día', '/day')).replace(/\^?-1\b/g, '⁻¹').replace(/\^?-2\b/g, '⁻²').replace(/\^?-3\b/g, '⁻³').replace(/\^2\b/g, '²');
// el nombre de una variable: en español, el del registro; en inglés, la descripción del motor
const tituloVar = (v) => (enIngles() ? (v.descripcion ? v.descripcion.charAt(0).toUpperCase() + v.descripcion.slice(1).replace(/\.$/, '') : v.nombre) : v.titulo || v.nombre);
const textoParam = (p, o) => (enIngles() ? p.texto(o).replace(',', '.') : p.texto(o));

export function crearPanel(ctx) {
  // ctx: { enviar(m), dia(), tic(), velocidad(), ponerVelocidad(v), irADia(n), cerrarFicha() }
  let pestana = 'mundo', antes = 'mundo';
  const pestanas = ['mundo', 'animales', 'datos', 'parametros', 'ficha'];
  function mostrar(p) {
    if (p !== 'ficha') antes = p;
    pestana = p;
    for (const b of document.querySelectorAll('#pestanas-panel button')) b.classList.toggle('on', b.dataset.p === p);
    for (const q of pestanas) $(`hoja-${q}`).classList.toggle('oculto', q !== p);
    if (p === 'datos' || p === 'mundo') pedirDatos();
    if (p === 'parametros') pintarParametros();
  }
  for (const b of document.querySelectorAll('#pestanas-panel button')) b.onclick = () => mostrar(b.dataset.p);
  // la pestaña de la ficha: sale con el nombre de lo pulsado; la ✕ la cierra y vuelve a la de antes
  function verFicha(titulo) {
    $('pestana-ficha-nombre').textContent = titulo;
    $('pestana-ficha').title = titulo;
    $('pestana-ficha').classList.remove('oculto');
    mostrar('ficha');
  }
  function cerrarFicha() {
    $('pestana-ficha').classList.add('oculto');
    if (pestana === 'ficha') mostrar(antes);
  }
  $('cerrar-ficha').onclick = (e) => { e.stopPropagation(); ctx.cerrarFicha(); };

  // ---------------------------------------------------------------- Mundo: velocidad e ir a un día
  const VEL = [[0, '⏸'], [1, '×1'], [10, '×10'], [60, '×60'], [600, '×600'], [Infinity, T('máx', 'max')]];
  $('panel-velocidad').innerHTML = VEL.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('');
  for (const b of $('panel-velocidad').querySelectorAll('button')) b.onclick = () => ctx.ponerVelocidad(Number(b.dataset.v));
  let diaPedido = null;
  const pintarDia = () => { const d = ctx.dia(); if (!d) return; if (diaPedido == null) $('ir-dia').value = d.dia + 1; };
  for (const b of $('ir-pasos').querySelectorAll('button')) b.onclick = () => { const d = ctx.dia(); diaPedido = Math.max(1, Number($('ir-dia').value || (d?.dia ?? 0) + 1) + Number(b.dataset.d)); $('ir-dia').value = diaPedido; };
  $('ir-dia').oninput = () => { diaPedido = Number($('ir-dia').value); };
  $('ir-boton').onclick = () => { const n = Math.max(1, Math.floor(Number($('ir-dia').value) || 1)); diaPedido = null; ctx.irADia(n - 1); };

  // ---------------------------------------------------------------- datos (del trabajador)
  let datos = null, categoria = 'clima', elegida = null, capa = null, ultimaPeticion = 0, grupoElegido = null;
  function pedirDatos() {
    ultimaPeticion = performance.now();
    ctx.enviar({ tipo: 'datos', celda: null });
  }
  function pedirSerie() {
    if (!elegida) return;
    ctx.enviar({ tipo: 'serie', nombre: elegida, celda: null, capa });
  }
  function recibir(m) {
    if (m.tipo === 'datos') { datos = m; pintarMundo(); pintarDatos(); if (pestana === 'parametros') pintarParametros(); }
    else if (m.tipo === 'serie' && m.nombre === elegida) pintarSerie(m);
    else if (m.tipo === 'prediccion') { prediccion = m; pintarPrediccion(); }
    else if (m.tipo === 'cambiado') { aplicado = m; pendientes = {}; pintarParametros(); pedirDatos(); }
  }

  // ---- Mundo: los animales del mapa por grupo
  function pintarMundo() {
    if (!datos) return;
    const a = datos.animales, n = datos.fechas.length;
    // de cada grupo: los individuos del motor, cuántos se dibujan y por cuántos vale cada dibujado
    const dib = ctx.dibujados?.() || { n: {}, vale: {} };
    const filas = a.grupos.map((g, k) => ({ g, n: a.series[k][n - 1] || 0, vert: VERTEBRADOS.has(g), d: dib.n[g] || 0, v: dib.vale[g] || 1 }));
    const pinta = (f) => (f.d ? `${numero(f.d)}${f.v > 1 ? ` × ${numero(f.v)}` : ''}` : '—');
    const tabla = (l) => l.sort((x, y) => y.n - x.n).map((f) => `<tr class="${f.g === grupoElegido ? 'sel' : ''}" data-g="${f.g}"><td>${GRUPO_ES[f.g] || f.g}</td><td class="dib">${pinta(f)}</td><td>${numero(f.n)}</td></tr>`).join('');
    const suma = (l, k) => l.reduce((s, f) => s + f[k], 0), V = filas.filter((f) => f.vert), I = filas.filter((f) => !f.vert);
    $('mundo-animales').innerHTML = `<table class="tabla"><tr class="cab"><td></td><td class="dib">${T('dibujados × vale', 'drawn × stands for')}</td><td>${T('en el motor', 'in the engine')}</td></tr>
      <tr class="tot"><td>${T('Vertebrados', 'Vertebrates')}</td><td class="dib">${numero(suma(V, 'd'))}</td><td>${numero(suma(V, 'n'))}</td></tr>${tabla(V)}
      <tr class="tot"><td>${T('Invertebrados', 'Invertebrates')}</td><td class="dib">${numero(suma(I, 'd'))}</td><td>${numero(suma(I, 'n'))}</td></tr>${tabla(I)}</table>`;
    for (const tr of $('mundo-animales').querySelectorAll('tr[data-g]')) tr.onclick = () => { grupoElegido = tr.dataset.g; pintarMundo(); };
    const k = a.grupos.indexOf(grupoElegido);
    if (k >= 0) grafica($('mundo-grafica'), { series: [{ nombre: GRUPO_ES[grupoElegido], datos: a.series[k], color: COLOR.serie }], fechas: datos.fechas, unidad: T('individuos', 'individuals') });
    else $('mundo-grafica').innerHTML = '';
  }

  // ---- Datos: categorías, variables y gráfica (siempre del mundo entero: el cuadrado que se ve es todo el mundo)
  function pintarDatos() {
    if (!datos) return;
    const cats = Object.keys(NOMBRE_CATEGORIA);
    $('datos-categorias').innerHTML = cats.map((c) => `<button data-c="${c}" class="${c === categoria ? 'on' : ''}">${T(NOMBRE_CATEGORIA[c], CATEGORIA_EN[c])}</button>`).join('');
    for (const b of $('datos-categorias').querySelectorAll('button')) b.onclick = () => { categoria = b.dataset.c; elegida = null; pintarDatos(); $('datos-grafica').innerHTML = ''; $('datos-titulo').textContent = ''; $('datos-capas').innerHTML = ''; };
    const lista = datos.catalogo.filter((v) => v.categoria === categoria).sort((a, b) => (enIngles() ? 0 : (a.titulo ? 0 : 1) - (b.titulo ? 0 : 1)) || tituloVar(a).localeCompare(tituloVar(b), enIngles() ? 'en' : 'es'));
    const caja = $('datos-lista'), scroll = caja.scrollTop;
    caja.innerHTML = lista.map((v) => `<div class="var${v.nombre === elegida ? ' sel' : ''}" data-v="${v.nombre}" title="${esc(v.nombre)}"><span class="t">${esc(tituloVar(v))}${v.forma === 'capas' ? ` <span class="gris">· ${T('por capas', 'by layer')}</span>` : ''}</span><span class="n">${numero(v.valor)} ${esc(unidad(v.unidad))}</span></div>`).join('') || '<div class="gris">—</div>';
    caja.scrollTop = scroll;
    for (const d of caja.querySelectorAll('.var')) d.onclick = () => { elegida = d.dataset.v; capa = null; pintarDatos(); pedirSerie(); };
    if (elegida) pintarCapas();
    else if (!$('datos-grafica').innerHTML) $('datos-grafica').innerHTML = `<div class="gris">${T('Pulsa una variable para ver su gráfica.', 'Click a variable to see its chart.')}</div>`;
  }
  function pintarCapas() {
    const v = datos.catalogo.find((x) => x.nombre === elegida);
    if (!v || v.forma !== 'capas' || !v.capas) { $('datos-capas').innerHTML = ''; return; }
    const nombres = v.nombresCapas || datos.capas;
    $('datos-capas').innerHTML = `<div class="gris">${T('Por capas (pulsa una para su gráfica):', 'By layer (click one for its chart):')}</div><table class="tabla capas"><tr class="${capa == null ? 'sel' : ''}" data-l=""><td>${T('Media de las capas', 'Mean of the layers')}</td><td>${numero(v.valor)} ${esc(unidad(v.unidad))}</td></tr>` +
      v.capas.map((x, l) => (Number.isFinite(x) ? `<tr class="${capa === l ? 'sel' : ''}" data-l="${l}"><td>${esc(capaTxt(nombres[l] || `capa ${l + 1}`))}</td><td>${numero(x)}</td></tr>` : '')).join('') + '</table>';
    for (const tr of $('datos-capas').querySelectorAll('tr')) tr.onclick = () => { capa = tr.dataset.l === '' ? null : Number(tr.dataset.l); pintarCapas(); pedirSerie(); };
  }
  function pintarSerie(m) {
    const v = datos?.catalogo.find((x) => x.nombre === m.nombre);
    $('datos-titulo').textContent = v ? `${tituloVar(v)}${m.capa != null ? ` · ${capaTxt((v.nombresCapas || datos.capas)[m.capa] || '')}` : ''}` : m.nombre;
    if (!m.datos) { $('datos-grafica').innerHTML = `<div class="gris">${T('Sin datos.', 'No data.')}</div>`; return; }
    grafica($('datos-grafica'), { series: [{ nombre: m.nombre, datos: m.datos, color: COLOR.serie }], fechas: datos.fechas.slice(0, m.datos.length), unidad: unidad(v?.unidad || '') });
  }

  // ---------------------------------------------------------------- Parámetros y predicción
  let pendientes = {}, prediccion = null, aplicado = null, diasPred = 90;
  const actuales = () => ({ ...NEUTROS, ...(datos?.parametros || {}) });
  const nombreParam = (p) => T(p.nombre, p.nombreEn);
  function pintarParametros() {
    const act = actuales(), quiere = { ...act, ...pendientes };
    $('param-lista').innerHTML = PARAMETROS.map((p) => `<div class="opcion"><div class="nom">${nombreParam(p)}<span class="ayuda" tabindex="0" data-globo="${esc(T(p.linea, p.lineaEn))}">?</span></div><div class="botones">${p.opciones.map((o) =>
      `<button data-p="${p.id}" data-v="${o}" class="${quiere[p.id] === o ? 'on' : ''}${act[p.id] === o && quiere[p.id] !== o ? ' ahora' : ''}">${textoParam(p, o)}</button>`).join('')}</div></div>`).join('');
    for (const b of $('param-lista').querySelectorAll('button')) b.onclick = () => {
      const v = Number(b.dataset.v), id = b.dataset.p;
      if (actuales()[id] === v) delete pendientes[id]; else pendientes[id] = v;
      pintarParametros();
    };
    const hay = Object.keys(pendientes).length;
    const d = ctx.dia();
    const hechos = (datos?.cambios || []).map((c) => T(`desde el día ${c.desde + 1}`, `from day ${c.desde + 1}`)).join(', ');
    $('param-estado').innerHTML = hay
      ? `${T('Cambios sin aplicar', 'Changes not applied')}: ${PARAMETROS.filter((p) => p.id in pendientes).map((p) => `${nombreParam(p).toLowerCase()} ${textoParam(p, pendientes[p.id])}`).join(', ')}.`
      : `${T('Sin cambios pendientes.', 'No pending changes.')}${hechos ? ` ${T('Cambios hechos', 'Changes made')}: ${hechos}.` : ''}`;
    $('param-aplicar').disabled = !hay;
    $('param-aplicar').textContent = d ? T(`Aplicar desde el día ${d.dia + 2}`, `Apply from day ${d.dia + 2}`) : T('Aplicar', 'Apply');
    for (const b of $('param-dias').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.d) === diasPred);
  }
  $('param-aplicar').onclick = () => {
    const d = ctx.dia();
    if (!d) return;
    ctx.enviar({ tipo: 'cambiar', cambios: { ...actuales(), ...pendientes }, desde: d.dia + 1 });
    $('param-estado').textContent = T('Aplicando: se vuelven a calcular los días desde mañana…', 'Applying: the days from tomorrow are being computed again…');
  };
  for (const b of $('param-dias').querySelectorAll('button')) b.onclick = () => { diasPred = Number(b.dataset.d); pintarParametros(); };
  $('param-predecir').onclick = () => {
    prediccion = null;
    ctx.enviar({ tipo: 'predecir', cambios: { ...actuales(), ...pendientes }, dias: diasPred });
    $('param-prediccion').innerHTML = `<div class="gris">${T('Calculando la predicción…', 'Computing the prediction…')}</div>`;
  };
  function pintarPrediccion() {
    const p = prediccion;
    if (!p) return;
    const titulo = `<div class="gris">${p.hecho ? T('Predicción', 'Prediction') : T(`Calculando: ${p.fechas.length} de ${p.dias} días…`, `Computing: ${p.fechas.length} of ${p.dias} days…`)} ${T('desde', 'from')} ${p.fechas[0] || ''}.</div>`;
    $('param-prediccion').innerHTML = titulo + INDICADORES.map(([k, t, u]) => `<div class="pred"><div class="t">${T(t, INDICADOR_EN[k])} <span class="gris">(${T(u, UNIDAD_EN[u] || u)})</span></div><div id="pred-${k}"></div></div>`).join('');
    // la naranja (con los cambios) gruesa y debajo; la azul (sin ellos) discontinua y fina encima:
    // donde coinciden se ven las dos
    for (const [k, , u] of INDICADORES) {
      grafica($(`pred-${k}`), { series: [{ nombre: T('con los cambios', 'with the changes'), datos: p.con[k], color: COLOR.serie, grosor: 4 }, { nombre: T('sin ellos', 'without them'), datos: p.sin[k], color: COLOR.sin, discontinua: true, grosor: 1.6 }], fechas: p.fechas, unidad: T(u, UNIDAD_EN[u] || u), alto: 90 });
    }
  }

  return {
    mostrar, recibir, verFicha, cerrarFicha,
    get pestana() { return pestana; },
    // cada poco: la velocidad marcada, el día, y los datos si están a la vista
    actualizar(ms) {
      for (const b of $('panel-velocidad').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.v) === ctx.velocidad());
      pintarDia();
      if ((pestana === 'datos' || pestana === 'mundo') && $('panel').classList.contains('on') && ms - ultimaPeticion > 3000) { pedirDatos(); pedirSerie(); }
    },
    // un día nuevo: los datos cambian
    nuevoDia() { if ($('panel').classList.contains('on') && (pestana === 'datos' || pestana === 'mundo' || pestana === 'parametros')) { pedirDatos(); pedirSerie(); } },
  };
}
