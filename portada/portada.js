/* La página «Simulación» de EcoLoco (portada/simulacion.html): el botón de empezar, configurar
   un mundo antes de generarlo (con preajustes), ver lo que va a tener y abrir los mundos guardados.
   La configuración va a la simulación por la dirección: vivo/?mundo=... (mundo/config.js). */

import { ANIMALES, PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js?v=202610032043';
import { ESPECIES_DE_GRUPO, VERTEBRADOS } from '../mundo/especies.js?v=202610032043';
import { PLANTAS_DEL_MUNDO, SETAS_DEL_MUNDO } from '../mundo/mapa.js?v=202610032043';
import { CONFIG_BASE, PREAJUSTES, OPCIONES, OPCIONES_EN, completar, gruposQuitados, resumen, aTexto } from '../mundo/config.js?v=202610032043';
import { controlTamano, LADO } from '../comun/tamano.js?v=202610032043';
import { T, enIngles, traducirDom, num as numero } from '../comun/idioma.js?v=202610032043';
import { ayuda, ponerAyudas } from '../comun/ayuda.js?v=202610032043';
import { cabecera } from '../comun/cabecera.js?v=202610032043';
import { GRUPO_EN, nombreEsp, categoria } from '../comun/nombres.js?v=202610032043';

traducirDom(); ponerAyudas(); cabecera('simulacion');
// (la página está en portada/: lo demás, desde la raíz del proyecto)
const RAIZ = new URL('../', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (n) => numero(n, { maximumFractionDigits: n >= 10 ? 0 : n >= 1 ? 1 : 2 });
const opt = (t) => T(t, OPCIONES_EN[t] || t);
const FICHA = Object.fromEntries([...ANIMALES, ...PLANTAS, ...SETAS].map((e) => [e.id, e]));
const GRUPO_ES = {
  carnivorous_mammal: 'felinos', herbivorous_mammal: 'mamíferos herbívoros', fungivorous_mammal: 'jabalíes y ardillas', scavenging_mammal: 'varanos',
  herbivorous_lizard: 'dragones del bosque', thermophilic_lizard: 'eslizones', carnivorous_snake: 'serpientes', frog: 'ranas',
  carnivorous_bird: 'rapaces', herbivorous_bird: 'cálaos y gallos', swallow: 'golondrinas',
  carnivorous_insect_iteroparous: 'escarabajos tigre', carnivorous_insect_semelparous: 'mantis y libélulas', herbivorous_insect_iteroparous: 'fulgóridos y escarabajos',
  herbivorous_insect_semelparous: 'insectos palo y cigarras', caterpillar: 'orugas', butterfly: 'mariposas', earthworm: 'lombrices', dung_beetle: 'escarabajos peloteros', detritivorous_insect: 'termitas',
};
const ETIQUETA = { rio: ['Río', 'River'], charcas: ['Charcas', 'Ponds'], bosque: ['Bosque', 'Forest'], clima: ['Clima', 'Climate'] };
const LINEA = {
  rio: ['El agua donde beben y se bañan los animales (el motor no lo usa: es del mundo).', 'The water where animals drink and bathe (the engine does not use it: it belongs to the world).'],
  charcas: ['Para los animales que no llegan al río; con «muchas», unas 4 por hectárea.', 'For the animals that do not reach the river; with «many», about 4 per hectare.'],
  bosque: ['Cuántos árboles y arbustos hay al empezar (cohortes de plantas del motor).', 'How many trees and shrubs there are at the start (engine plant cohorts).'],
  clima: ['Cambia la temperatura y la lluvia de todos los días del clima de Maliau (2010–2020).', 'Changes the temperature and rain of every day of the Maliau climate (2010–2020).'],
};
const grupoTxt = (g) => T(GRUPO_ES[g] || g, (GRUPO_EN[g] || g).toLowerCase());

// las especies del mundo: animales (por grupo del motor), plantas y setas
const LISTAS = {
  animales: Object.entries(ESPECIES_DE_GRUPO).flatMap(([g, l]) => l.map(([e]) => ({ id: e, grupo: g }))),
  plantas: PLANTAS_DEL_MUNDO.map((id) => ({ id })),
  hongos: SETAS_DEL_MUNDO.map((id) => ({ id })),
};
const NOMBRE_LISTA = { animales: ['Animales', 'Animals'], plantas: ['Plantas', 'Plants'], hongos: ['Hongos', 'Fungi'] };

let config = completar(CONFIG_BASE), preajuste = 'maliau', pestana = 'animales', escenario = null;

// ---------------------------------------------------------------- preajustes y opciones
function pintarPreajustes() {
  $('preajustes').innerHTML = PREAJUSTES.map((p) => `<button data-p="${p.id}" class="${p.id === preajuste ? 'on' : ''}">${esc(T(p.nombre, p.nombreEn))}</button>`).join('');
  const p = PREAJUSTES.find((x) => x.id === preajuste);
  $('preajuste-texto').textContent = p ? T(p.texto, p.textoEn) : T('A tu manera: has cambiado alguna opción del punto de partida.', 'Your way: you have changed some option of the starting point.');
  for (const b of $('preajustes').querySelectorAll('button')) b.onclick = () => {
    preajuste = b.dataset.p;
    const p2 = PREAJUSTES.find((x) => x.id === preajuste);
    config = completar({ ...CONFIG_BASE, ...p2.config, nombre: T(p2.nombre, p2.nombreEn), semilla: config.semilla });
    pintar();
  };
}
function pintarOpciones() {
  const filas = Object.entries(OPCIONES).map(([k, ops]) => `<div class="opcion"><div class="nom">${T(...ETIQUETA[k])}${ayuda(...LINEA[k])}</div><div class="botones">${ops.map(([v, t]) =>
    `<button data-k="${k}" data-v="${v}" class="${String(config[k]) === String(v) ? 'on' : ''}">${opt(t)}</button>`).join('')}</div></div>`);
  filas.push(`<div class="opcion"><div class="nom">${T('Semilla', 'Seed')}${ayuda('Con otra semilla, el mismo bosque sale distinto (dónde está cada árbol, cada animal y el río).', 'With another seed, the same forest comes out different (where each tree, each animal and the river are).')}</div><div class="botones"><input type="number" id="semilla" min="1" value="${config.semilla}"><button id="otra">${T('Otra', 'Another')}</button></div></div>`);
  // los dos tamaños: el del mundo (km²) y el del mapa (lado del cuadrado, m)
  filas.unshift(`<div class="opcion"><div class="nom">${T('Mundo', 'World')}${ayuda('Cuánta selva calcula el motor (1–10 km²) y, por tanto, cuántos animales hay.', 'How much forest the engine computes (1–10 km²), and therefore how many animals there are.')}</div><div id="p-tam-mundo"></div></div>`,
    `<div class="opcion"><div class="nom">${T('Mapa', 'Map')}${ayuda('El lado del cuadrado que se dibuja (50–1000 m; 100 por defecto): todo el mundo cabe en él.', 'The side of the square that is drawn (50–1000 m; 100 by default): the whole world fits in it.')}</div><div id="p-tam-mapa"></div></div>`);
  $('opciones').innerHTML = filas.join('');
  controlTamano($('p-tam-mundo'), config.km2, (v) => { config.km2 = v; cambiado(); });
  controlTamano($('p-tam-mapa'), config.lado, (v) => { config.lado = v; cambiado(); }, { rango: LADO });
  for (const b of $('opciones').querySelectorAll('button[data-k]')) b.onclick = () => {
    const k = b.dataset.k;
    config[k] = k === 'km2' ? Number(b.dataset.v) : b.dataset.v;
    cambiado();
  };
  $('semilla').onchange = () => { config.semilla = Math.max(1, Math.floor(Number($('semilla').value) || 1)); cambiado(false); };
  $('otra').onclick = () => { config.semilla = 1 + Math.floor(Math.random() * 99999); cambiado(); };
}
// al tocar una opción, ya no es exactamente el preajuste (salvo que coincida)
function cambiado(repintar = true) {
  const igual = PREAJUSTES.find((p) => { const c = completar({ ...CONFIG_BASE, ...p.config }); return ['km2', 'lado', 'rio', 'charcas', 'bosque', 'clima'].every((k) => String(c[k]) === String(config[k])) && c.quitar.slice().sort().join() === config.quitar.slice().sort().join(); });
  const base = (config.nombre || CONFIG_BASE.nombre).replace(/ \((cambiado|changed)\)$/, '');
  preajuste = igual?.id || null;
  config.nombre = (igual && T(igual.nombre, igual.nombreEn)) || `${base} (${T('cambiado', 'changed')})`;
  if (repintar) pintar(); else { pintarPreajustes(); pintarResumen(); }
}

// ---------------------------------------------------------------- especies
function pintarEspecies() {
  const fuera = new Set(config.quitar);
  $('pestanas').innerHTML = Object.keys(LISTAS).map((k) => {
    const l = LISTAS[k], hay = l.filter((e) => !fuera.has(e.id)).length;
    return `<button data-t="${k}" class="${k === pestana ? 'on' : ''}">${T(...NOMBRE_LISTA[k])} (${hay}/${l.length})</button>`;
  }).join('') + `<span style="flex:1"></span><button id="todas">${T('Todas', 'All')}</button><button id="ninguna">${T('Ninguna', 'None')}</button>`;
  for (const b of $('pestanas').querySelectorAll('button[data-t]')) b.onclick = () => { pestana = b.dataset.t; pintarEspecies(); };
  const ids = LISTAS[pestana].map((e) => e.id);
  $('todas').onclick = () => { config.quitar = config.quitar.filter((q) => !ids.includes(q)); cambiado(); };
  $('ninguna').onclick = () => { config.quitar = [...new Set([...config.quitar, ...ids])]; cambiado(); };
  $('especies').innerHTML = LISTAS[pestana].map((e) => {
    const f = FICHA[e.id] || {};
    const sub = e.grupo ? grupoTxt(e.grupo) : categoria(f.cat || '');
    return `<div class="esp ${fuera.has(e.id) ? '' : 'on'}" data-id="${e.id}" title="${esc(f.cientifico || '')}"><img src="${RAIZ}graficos/pruebas-morta/borneo/ref/${e.id}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div><div class="n">${esc(nombreEsp(f) || e.id)}</div><div class="g">${esc(sub)}</div></div></div>`;
  }).join('');
  for (const el of $('especies').querySelectorAll('.esp')) el.onclick = () => {
    const id = el.dataset.id;
    config.quitar = fuera.has(id) ? config.quitar.filter((q) => q !== id) : [...config.quitar, id];
    cambiado();
  };
  const sin = [...gruposQuitados(config)];
  const pl = PLANTAS_DEL_MUNDO.filter((p) => !fuera.has(p)).length, st = SETAS_DEL_MUNDO.filter((p) => !fuera.has(p)).length;
  $('aviso-especies').textContent = [
    sin.length ? `${T('Salen del motor', 'Leaving the engine')}: ${sin.map(grupoTxt).join(', ')}${sin.includes('caterpillar') || sin.includes('butterfly') ? T(' (orugas y mariposas van juntas: unas se hacen las otras)', ' (caterpillars and butterflies go together: one becomes the other)') : ''}.` : '',
    !pl ? T('Sin ninguna planta, los árboles del motor se dibujan con la primera especie de su tamaño.', 'With no plants, the engine trees are drawn with the first species of their size.') : '',
    !st ? T('Sin hongos, no salen setas (el motor sigue teniendo sus cuerpos fructíferos).', 'With no fungi, no mushrooms appear (the engine still has its fruiting bodies).') : '',
  ].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- lo que va a tener
function pintarResumen() {
  if (!escenario) return;
  const r = resumen(escenario, config);
  const vert = r.grupos.filter((g) => g.vertebrado).sort((a, b) => b.n - a.n), inv = r.grupos.filter((g) => !g.vertebrado);
  const totV = vert.reduce((s, g) => s + g.n, 0), totI = inv.reduce((s, g) => s + g.n, 0);
  const fuera = new Set(config.quitar);
  const especies = LISTAS.animales.filter((e) => !fuera.has(e.id) && !gruposQuitados(config).has(e.grupo)).length;
  const lado = r.lado >= 1000 ? `${num(r.lado / 1000)} km` : `${Math.round(r.lado)} m`;
  const clima = opt(OPCIONES.clima.find(([v]) => v === config.clima)[1]), rio = opt(OPCIONES.rio.find(([v]) => v === config.rio)[1]);
  $('resumen').classList.remove('gris');
  $('resumen').innerHTML = `<table>
    <tr><td>${T('Mundo', 'World')}</td><td>${num(config.km2)} km² (${lado} ${T('de lado', 'a side')})</td></tr>
    <tr><td>${T('Mapa dibujado', 'Drawn map')}</td><td>${config.lado} × ${config.lado} m</td></tr>
    <tr><td>${T('Agua', 'Water')}</td><td>${rio} · ${T('charcas', 'ponds')}: ${opt(OPCIONES.charcas.find(([v]) => v === config.charcas)[1]).toLowerCase()}</td></tr>
    <tr><td>${T('Clima', 'Climate')}</td><td>${clima}</td></tr>
    <tr><td>${T('Árboles por hectárea (los de más de 50 cm)', 'Trees per hectare (those over 50 cm)')}</td><td>${num(r.arboles)} (${num(r.grandes)})</td></tr>
    <tr><td>${T('Arbustos por hectárea', 'Shrubs per hectare')}</td><td>${num(r.arbustos)}</td></tr>
    <tr><td>${T('Especies de animales · plantas · hongos', 'Species of animals · plants · fungi')}</td><td>${especies} · ${PLANTAS_DEL_MUNDO.filter((p) => !fuera.has(p)).length} · ${SETAS_DEL_MUNDO.filter((p) => !fuera.has(p)).length}</td></tr>
  </table>
  <h3>${T('Vertebrados al empezar', 'Vertebrates at the start')}${ayuda('Densidad del motor × superficie. Se simulan todos; de los muy numerosos, cada animal del mapa representa a varios individuos del motor.', 'Engine density × area. All are simulated; for the very numerous ones, each animal on the map stands for several engine individuals.')}</h3><table>
    ${vert.map((g) => `<tr><td>${grupoTxt(g.grupo)}</td><td>${num(g.n)}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td>${num(totV)}</td></tr></table>
  <h3>${T('Invertebrados', 'Invertebrates')}</h3><table><tr><td>${T('Insectos, lombrices y termitas', 'Insects, earthworms and termites')}</td><td>${num(totI)}</td></tr></table>`;
}

function pintar() { pintarPreajustes(); pintarOpciones(); pintarEspecies(); pintarResumen(); }

// ---------------------------------------------------------------- entrar y mundos guardados
// la simulación se abre en otra pestaña: la portada se queda
const abrir = (c, dia = 0) => { window.open(`${RAIZ}vivo/?mundo=${aTexto(c)}${dia ? `&dia=${dia}` : ''}`, '_blank', 'noopener'); };
$('generar').onclick = () => abrir(config);
$('empezar').onclick = () => abrir(config);
const guardados = () => { try { return JSON.parse(localStorage.getItem('ecoloco.mundos') || '[]'); } catch { return []; } };
function pintarGuardados() {
  const l = guardados();
  $('guardados').innerHTML = l.length ? l.map((g, i) => `<div class="fila"><div class="t">${esc(g.config?.nombre || T('Mundo', 'World'))} · ${T('día', 'day')} ${g.dia + 1}<small>${num(g.config?.km2 || 1)} km² · ${esc(g.fecha || '')} · ${T('guardado el', 'saved on')} ${new Date(g.guardado).toLocaleString(enIngles() ? 'en-GB' : 'es-ES')}</small></div>
    <button data-a="${i}">${T('Abrir', 'Open')}</button><button data-b="${i}" title="${T('Borrar', 'Delete')}">✕</button></div>`).join('') : `<div class="gris">${T('Aún no hay ninguno.', 'None yet.')}</div>`;
  for (const b of $('guardados').querySelectorAll('[data-a]')) b.onclick = () => { const g = l[b.dataset.a]; abrir(g.config, g.dia); };
  for (const b of $('guardados').querySelectorAll('[data-b]')) b.onclick = () => { l.splice(b.dataset.b, 1); localStorage.setItem('ecoloco.mundos', JSON.stringify(l)); pintarGuardados(); };
}
$('cargar').onclick = () => $('archivo').click();
$('archivo').onchange = async () => {
  const f = $('archivo').files[0];
  if (!f) return;
  try {
    const g = JSON.parse(await f.text());
    if (g.app !== 'EcoLoco' || !g.config) throw new Error(T('no es un mundo de EcoLoco', 'it is not an EcoLoco world'));
    abrir(g.config, g.dia || 0);
  } catch (e) { alert(`${T('No se ha podido abrir', 'Could not open it')}: ${e.message}`); }
};

pintar();
pintarGuardados();
fetch(`${RAIZ}datos/escenarios/maliau.json`).then((r) => r.json()).then((e) => { escenario = e; pintarResumen(); })
  .catch(() => { $('resumen').textContent = T('No se encuentra datos/escenarios/maliau.json (se genera con herramientas/clima_maliau.py).', 'datos/escenarios/maliau.json not found (it is generated with herramientas/clima_maliau.py).'); });
