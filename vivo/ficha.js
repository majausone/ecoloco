/* Las fichas del mundo vivo y el listado de los animales.

   - La pestaña «Animales» del panel: un buscador (por especie o nombre científico) y el
     listado de los animales del mapa, agrupados por especie (con cuántos hay; los
     representantes cuentan los individuos del motor a los que representan). Cada especie se
     abre y enseña los más cercanos a la cámara.
   - Pulsar un animal (en el listado o en la escena) lo selecciona: la cámara va a él y lo
     sigue, y su ficha se abre en una pestaña nueva del panel, con su nombre y una ✕ para
     cerrarla (se vuelve a la pestaña en la que se estaba).
   - La ficha de un animal, en vivo: quién es, cómo está (hambre, sed, sueño, condición), qué
     hace y por qué, hacia dónde o a por quién va, cómo es su especie, su hogar y territorio y
     lo que ha hecho hoy. Si muere, lo dice; si se va o deja de verse, también.
   - Las plantas y los hongos también se pulsan: su ficha dice la especie, la cohorte del
     motor de la que sale, su tamaño, su biomasa, la comida que tiene y quién se la come.

   Todo sale de la línea de tiempo del día (fotogramas clave, mundo/dia.js), del detalle del
   seleccionado (hambre, sed, sueño, tarea; se pide al trabajador), de la descripción de los
   animales que manda el trabajador y de las plantas del mapa (mundo/mapa.js). */

import { ANIMALES, PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js?v=202610032115';
import { COMPORTAMIENTO, ESTADOS } from '../mundo/especies.js?v=202610032115';
import { CLAVE, DETALLE, TAREAS } from '../mundo/dia.js?v=202610032115';
import { T, enIngles, num } from '../comun/idioma.js?v=202610032115';
import { ayuda } from '../comun/ayuda.js?v=202610032115';
import { NOMBRE_EN, nombreEsp, categoria } from '../comun/nombres.js?v=202610032115';
import { dato } from '../comun/fichas-en.js?v=202610032115';

const $ = (id) => document.getElementById(id);
const FICHA = Object.fromEntries(ANIMALES.map((e) => [e.id, e]));
const VEGETAL = Object.fromEntries([...PLANTAS, ...SETAS].map((e) => [e.id, e]));
const REFUGIO = { arbol: ['los árboles', 'the trees'], agua: ['el agua', 'the water'], hojarasca: ['la hojarasca', 'the leaf litter'], aire: ['el aire (sale volando)', 'the air (flies off)'], madriguera: ['su madriguera', 'its burrow'], termitero: ['el termitero', 'the termite mound'] };
const GRUPO = {
  carnivorous_mammal: ['mamífero carnívoro', 'carnivorous mammal'], herbivorous_mammal: ['mamífero herbívoro', 'herbivorous mammal'], fungivorous_mammal: ['mamífero fungívoro', 'fungivorous mammal'],
  scavenging_mammal: ['mamífero carroñero', 'scavenging mammal'], herbivorous_lizard: ['lagarto herbívoro', 'herbivorous lizard'], thermophilic_lizard: ['lagarto termófilo', 'thermophilic lizard'],
  carnivorous_snake: ['serpiente carnívora', 'carnivorous snake'], frog: ['rana', 'frog'], carnivorous_bird: ['ave carnívora', 'carnivorous bird'], herbivorous_bird: ['ave herbívora', 'herbivorous bird'], swallow: ['golondrina', 'swallow'],
  carnivorous_insect_iteroparous: ['insecto carnívoro iteróparo', 'iteroparous carnivorous insect'], carnivorous_insect_semelparous: ['insecto carnívoro semélparo', 'semelparous carnivorous insect'],
  herbivorous_insect_iteroparous: ['insecto herbívoro iteróparo', 'iteroparous herbivorous insect'], herbivorous_insect_semelparous: ['insecto herbívoro semélparo', 'semelparous herbivorous insect'],
  caterpillar: ['oruga', 'caterpillar'], butterfly: ['mariposa', 'butterfly'], earthworm: ['lombriz', 'earthworm'], dung_beetle: ['escarabajo pelotero', 'dung beetle'], detritivorous_insect: ['insecto detritívoro', 'detritivorous insect'],
};
const t2 = (par) => (par ? T(par[0], par[1]) : '');
// lo que come (mundo/dia.js, TIPO_COMIDA)
const COMIDA = [null, ['fruta en la copa', 'fruit in the canopy'], ['fruta caída', 'fallen fruit'], ['hojas', 'leaves'], ['plantas del sotobosque', 'understorey plants'], ['semillas', 'seeds'],
  ['setas', 'mushrooms'], ['hojarasca', 'leaf litter'], ['carroña', 'carrion'], ['excrementos', 'dung'], ['una presa', 'prey']];
const COMIDA_LISTA = { fruta: ['fruta', 'fruit'], fruta_suelo: ['fruta caída', 'fallen fruit'], hojas: ['hojas', 'leaves'], sotobosque: ['sotobosque', 'understorey'], semillas: ['semillas', 'seeds'], setas: ['setas', 'mushrooms'],
  hojarasca: ['hojarasca', 'leaf litter'], 'carroña': ['carroña', 'carrion'], excremento: ['excrementos', 'dung'], presas: ['presas', 'prey'] };
const HOGAR = { madriguera: ['su madriguera', 'its burrow'], nido_arbol: ['su nido', 'its nest'], dormidero_arbol: ['su dormidero', 'its roost'], cama: ['su cama de hojas', 'its leaf bed'], termitero: ['el termitero', 'the termite mound'], ninguno: null };
const HOGAR_TIPO = { madriguera: ['madriguera', 'burrow'], nido_arbol: ['nido en un árbol', 'nest in a tree'], dormidero_arbol: ['dormidero en un árbol', 'roost in a tree'], cama: ['cama de hojas en el suelo', 'leaf bed on the ground'], termitero: ['termitero', 'termite mound'], ninguno: ['ninguno (descansa donde esté)', 'none (rests wherever it is)'] };
const CAZA = { acecho: ['al acecho', 'stalking'], emboscada: ['emboscada', 'ambush'], lengua: ['con la lengua', 'with its tongue'], picada: ['en picado', 'diving'], al_vuelo: ['al vuelo', 'on the wing'], persecucion: ['persiguiendo', 'chasing'] };
const ACTIVIDAD = { diurno: ['diurno', 'diurnal'], nocturno: ['nocturno', 'nocturnal'], crepuscular: ['crepuscular', 'crepuscular'], catemeral: ['a cualquier hora', 'at any hour'] };
const CORTEJO = { acicalar: ['acicalarse', 'grooming'], canto: ['canto', 'song'], cauto: ['cauto', 'cautious'], croar: ['croar', 'croaking'], enredarse: ['enredarse', 'entwining'], exhibicion: ['exhibición', 'display'],
  flexiones: ['flexiones', 'push-ups'], ladrido: ['ladrido', 'barking'], llamada: ['llamada', 'calling'], lucha: ['lucha', 'fighting'], persecucion: ['persecución', 'chase'], regalo: ['regalo', 'gift'], vuelo_nupcial: ['vuelo nupcial', 'nuptial flight'] };
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RUMBOS = [['al este', 'east'], ['al sureste', 'south-east'], ['al sur', 'south'], ['al suroeste', 'south-west'], ['al oeste', 'west'], ['al noroeste', 'north-west'], ['al norte', 'north'], ['al noreste', 'north-east']];
const E = Object.fromEntries(ESTADOS.map((n, i) => [n, i]));

const hhmm = (t) => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const peso = (kg) => (kg >= 1 ? `${num(kg, { maximumFractionDigits: kg >= 10 ? 0 : 1 })} kg` : kg >= 0.001 ? `${num(kg * 1000, { maximumFractionDigits: kg >= 0.01 ? 0 : 1 })} g` : `${num(kg * 1e6, { maximumFractionDigits: 0 })} mg`);
const edadTxt = (d) => (d == null ? '—' : d < 60 ? `${Math.round(d)} ${Math.round(d) === 1 ? T('día', 'day') : T('días', 'days')}` : d < 730 ? `${Math.round(d / 30.4)} ${T('meses', 'months')}` : `${num(d / 365, { maximumFractionDigits: 1 })} ${T('años', 'years')}`);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const barra = (v, color) => `<span class="barra"><span style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${color}"></span></span>${Math.round(v * 100)} %`;
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreDe = (id) => (FICHA[id] || VEGETAL[id] ? nombreEsp(FICHA[id] || VEGETAL[id]) : id);

export function crearFicha(ctx) {
  // ctx: { dia(), tic(), mapa(), animal(id), pose(a, tic), detalle(id), seguir(id), dejarDeSeguir(), seguido(), celda(), foco(), total(),
  //        verFicha(titulo), cerrarFicha(), cima(x, z), animales() }
  const panel = $('panel'), boton = $('b-panel');
  let abierto = false, sel = null, planta = null, ultimo = null, ultimoListado = 0, ultimaFicha = 0, buscar = '';
  const abiertos = new Set();

  const abrir = (si) => {
    abierto = si ?? !abierto;
    panel.classList.toggle('on', abierto);
    boton.classList.toggle('on', abierto);
    document.body.classList.toggle('panel-abierto', abierto);
    if (abierto) { ultimoListado = 0; ultimaFicha = 0; }
  };
  boton.onclick = () => abrir();
  $('buscar-animal').oninput = () => { buscar = sinTildes($('buscar-animal').value.trim()); ultimoListado = 0; listado(); };

  // ---------------------------------------------------------------- lo que se sabe de un animal
  // «una rana», «un muntíaco» (femenino si la primera palabra acaba en -a, con excepciones); «a frog», «an owl»
  const FEM = new Set(['lombriz', 'mantis']), MASC = new Set(['águila']);
  const conArticulo = (n) => {
    if (enIngles()) return (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n;
    const p = n.split(' ')[0];
    return ((/a$/.test(p) && !MASC.has(p)) || FEM.has(p) ? 'una ' : 'un ') + n;
  };
  const minus = (s) => (enIngles() ? s : s.toLowerCase());
  const nombre = (id) => {
    const a = ctx.dia()?.agentes[id];
    if (!a) return T('un animal', 'an animal');
    return conArticulo(minus(nombreDe(a.especie)));
  };
  const a_ = (x) => (enIngles() ? x : x.startsWith('el ') ? 'al ' + x.slice(3) : 'a ' + x);
  // lo que hace un animal en el fotograma clave i, en el orden de siempre:
  // [x, y, z, rumbo, estado, comida, hambre, sed, sueño, destino x, destino z, con quién, tarea]
  // (sin el detalle, hambre, sed y sueño quedan sin saber y no hay destino ni tarea)
  const filaDe = (a, i, det) => {
    const o = i * CLAVE, k = a.k, p = i * DETALLE, hay = det && det.length > p;
    return [k[o + 1], k[o + 2], k[o + 3], k[o + 4], k[o + 5], k[o + 6],
      hay ? det[p] : NaN, hay ? det[p + 1] : NaN, hay ? det[p + 2] : NaN,
      hay ? det[p + 5] : k[o + 1], hay ? det[p + 6] : k[o + 3], hay ? det[p + 4] : -1, hay ? det[p + 3] : 0];
  };
  // ahora (o en el tic t): con la posición interpolada; null si no está
  const fila = (id, t = ctx.tic(), conDetalle = true) => {
    const a = ctx.animal(id);
    if (!a || !ctx.pose(a, t)) return null;
    const f = filaDe(a, a.i, conDetalle ? ctx.detalle(id) : null);
    f[0] = a.x; f[1] = a.y; f[2] = a.z; f[3] = a.rumbo;
    return f;
  };
  const pct = (v) => (Number.isFinite(v) ? ` (${Math.round(v * 100)} %)` : '');
  // el árbol o la seta que hay junto a un punto (para decir «bajo la higuera»)
  const sitio = (x, z) => {
    const m = ctx.mapa();
    if (!m || !Number.isFinite(x)) return '';
    let mejor = null, md = 3.5;
    for (const a of m.arbolesCerca(x, z, 3.5)) { const d = Math.hypot(a.x - x, a.z - z); if (d < md) { md = d; mejor = a.especie; } }
    for (const s of m.setasCerca(x, z, 1.5)) { const d = Math.hypot(s.x - x, s.z - z); if (d < Math.min(md, 1.5)) { md = d; mejor = s.especie; } }
    if (!mejor) return '';
    return minus(nombreDe(mejor));
  };
  const cerca = (a, x, z) => a?.hogar && Math.hypot(a.hogar.x - x, a.hogar.z - z) < 3;
  const m1 = (d) => num(d, { maximumFractionDigits: d < 10 ? 1 : 0 });

  // qué hace y por qué
  function accion(id, f) {
    const d = ctx.dia(), a = d.agentes[id], e = COMPORTAMIENTO[a.especie];
    const estado = ESTADOS[f[4]] || 'quieto', tarea = TAREAS[f[12]] || '', comidaN = f[5], comida = t2(COMIDA[comidaN]);
    const presa = comidaN === 10;
    const con = f[11] >= 0 ? d.otros[f[11]] : null, quien = con ? nombre(con) : null;
    const x = f[0], z = f[2], tx = f[9], tz = f[10], dist = Math.hypot(tx - x, tz - z);
    const hogar = t2(HOGAR[e?.hogar]);
    // «junto al helecho», «junto a la higuera» (femenino si la primera palabra acaba en -a); «by the strangler fig»
    const junto = (px, pz) => { const s = sitio(px, pz); if (!s) return ''; if (enIngles()) return ` by the ${s}`; const fem = /a$/.test(s.split(' ')[0]); return fem ? ` junto a la ${s}` : ` junto al ${s}`; };
    const porque = [];
    let que;
    if (estado === 'comer') {
      if (presa) {
        // lo que acaba de cazar, o animales pequeños que ha encontrado
        const t = ctx.tic(), cz = d.eventos.find((ev) => ev.tipo === 'caza' && ev.id === id && ev.tic <= t && ev.tic > t - 120);
        que = cz ? T(`se come a ${nombre(cz.presa)}, que acaba de cazar`, `eats ${nombre(cz.presa)} it has just caught`) : T('come animales pequeños que ha encontrado (insectos, gusanos)', 'eats small animals it has found (insects, worms)');
      } else que = T(`come ${comida || 'algo'}`, `eats ${comida || 'something'}`) + junto(x, z);
      porque.push(T('tenía hambre', 'it was hungry') + pct(f[6]));
    } else if (estado === 'beber') { que = T('bebe en la orilla', 'drinks at the water’s edge'); porque.push(T('tenía sed', 'it was thirsty')); }
    else if (estado === 'dormir') {
      que = T('duerme', 'sleeps') + (cerca(a, x, z) && hogar ? T(` en ${hogar}`, ` in ${hogar}`) : '');
      porque.push(T(`es ${t2(ACTIVIDAD[e?.actividad]) || 'activo de día'} y no es su hora`, `it is ${t2(ACTIVIDAD[e?.actividad]) || 'diurnal'} and this is not its time`));
    } else if (estado === 'descansar') { que = T('descansa', 'rests'); porque.push(T('está cansado', 'it is tired') + (Number.isFinite(f[8]) ? ` (${T('sueño', 'sleepiness')} ${Math.round(f[8] * 100)} %)` : '')); }
    else if (estado === 'acechar') { que = T(`acecha a ${quien || 'una presa'}`, `stalks ${quien || 'a prey'}`); porque.push(T('tiene hambre', 'it is hungry')); }
    else if (estado === 'atacar') { que = T(`se lanza sobre ${quien || 'su presa'}`, `pounces on ${quien || 'its prey'}`); }
    else if (estado === 'huir') { que = quien ? T(`huye de ${quien}`, `flees from ${quien}`) : T('huye', 'flees'); porque.push(T('se le ha echado encima un depredador', 'a predator is on it')); }
    else if (estado === 'cortejar') { que = T(`corteja a ${quien || 'una pareja'}`, `courts ${quien || 'a mate'}`); porque.push(T('es su época de cría', 'it is its breeding season')); }
    else if (estado === 'aparearse') { que = T('se aparea', 'mates'); }
    else if (estado === 'anidar') { que = T('arregla su nido', 'tends its nest'); porque.push(T('está criando', 'it is breeding')); }
    else if (estado === 'excavar') { que = e?.hogar === 'madriguera' && a.vertebrado ? T('excava su madriguera', 'digs its burrow') : T('excava en el suelo', 'digs in the ground'); }
    else if (estado === 'morir' || estado === 'muerto') { que = estado === 'morir' ? T('se muere', 'is dying') : T('está muerto', 'is dead'); }
    else if (estado === 'nacer') { que = T('acaba de nacer', 'has just been born'); }
    else if (estado === 'llegar') { que = T('llega a esta parte del bosque', 'arrives in this part of the forest'); }
    else if (estado === 'irse') { que = T('se va a otra parte del bosque', 'leaves for another part of the forest'); }
    else if (estado === 'quieto') { que = tarea === 'seguir' && quien ? T(`espera a ${quien}, de su grupo`, `waits for ${quien} from its group`) : T('está quieto, mirando', 'stands still, watching'); }
    else {
      // en marcha (andar, correr, volar, planear, trepar, nadar): depende de para qué
      const como = T({ andar: 'va', correr: 'corre', volar: 'vuela', planear: 'planea', trepar: 'trepa', nadar: 'nada' }[estado] || 'va',
        { andar: 'goes', correr: 'runs', volar: 'flies', planear: 'glides', trepar: 'climbs', nadar: 'swims' }[estado] || 'goes');
      if (tarea === 'comer' && presa) { que = T(`${como} buscando animales pequeños que comer`, `${como} looking for small animals to eat`); porque.push(T('tiene hambre', 'it is hungry') + pct(f[6])); }
      else if (tarea === 'comer') { que = T(`${como} a por ${comida || 'comida'}`, `${como} for ${comida || 'food'}`) + junto(tx, tz); porque.push(T('tiene hambre', 'it is hungry') + pct(f[6])); }
      else if (tarea === 'beber') { que = T(`${como} a beber al agua`, `${como} to drink at the water`); porque.push(T('tiene sed', 'it is thirsty') + pct(f[7])); }
      else if (tarea === 'dormir') { que = T(`${como} ${a_(hogar || 'su sitio')} a dormir`, `${como} to ${hogar || 'its spot'} to sleep`); porque.push(T('se acaba su hora', 'its active time is over')); }
      else if (tarea === 'cortejar') { que = T(`${como} hacia ${quien || 'una pareja'} para cortejarla`, `${como} towards ${quien || 'a mate'} to court it`); porque.push(T('es su época de cría', 'it is its breeding season')); }
      else if (tarea === 'irse') { que = T(`${como} hacia otra parte del bosque`, `${como} towards another part of the forest`); porque.push(T('se va a otra parte del bosque', 'it is leaving for another part of the forest')); }
      else if (tarea === 'anidar') { que = T(`${como} a su nido`, `${como} to its nest`); porque.push(T('está criando', 'it is breeding')); }
      else if (tarea === 'cazar') { que = T(`${como} tras ${quien || 'una presa'}`, `${como} after ${quien || 'a prey'}`); porque.push(T('tiene hambre', 'it is hungry')); }
      else if (tarea === 'seguir' && quien) { que = T(`${como} detrás de ${quien}, de su grupo`, `${como} behind ${quien} from its group`); }
      else { que = estado === 'andar' || !estado ? T('pasea por su territorio', 'wanders around its territory') : T(`${como} por su territorio`, `${como} around its territory`); }
      if (estado === 'nadar') que += T(' (cruzando el agua)', ' (crossing the water)');
    }
    const hacia = dist > 0.6 && !['comer', 'beber', 'dormir', 'descansar', 'muerto', 'morir'].includes(estado)
      ? (con && quien ? T(`hacia ${quien}, a ${m1(dist)} m`, `towards ${quien}, ${m1(dist)} m away`) : T(`a ${m1(dist)} m de su destino`, `${m1(dist)} m from its destination`)) : '';
    return { que, porque: porque.join(', '), hacia, estado };
  }

  // cómo ha muerto (si ha muerto hoy)
  function muerte(id) {
    const d = ctx.dia();
    for (const e of d.eventos) {
      if (e.tipo === 'caza' && e.presa === id) return { tic: e.tic, como: T(`cazado por ${e.id ? nombre(e.id) : 'un depredador'}`, `caught by ${e.id ? nombre(e.id) : 'a predator'}`) };
      if (e.tipo === 'muerte' && e.id === id) return { tic: e.tic, como: e.causa === 'caza' ? T('cazado', 'caught') : T('de muerte natural (vejez, hambre o enfermedad, según el motor)', 'of natural causes (old age, hunger or disease, according to the engine)') };
    }
    return null;
  }

  // lo que ha hecho hoy hasta ahora: sucesos y cambios de estado de la línea de tiempo
  function historial(id, t) {
    const d = ctx.dia(), a = ctx.animal(id), out = [];
    if (!a) return out;
    const MIRA = new Set(['comer', 'beber', 'dormir', 'huir', 'acechar', 'cortejar', 'aparearse', 'excavar', 'anidar', 'nadar', 'nacer', 'llegar', 'irse', 'morir']);
    const det = ctx.detalle(id);
    let ant = -1;
    for (let i = 0; i < a.k.length / CLAVE && a.k[i * CLAVE] <= t; i++) {
      const est = a.k[i * CLAVE + 5];
      if (est !== ant && MIRA.has(ESTADOS[est])) out.push([a.k[i * CLAVE], accion(id, filaDe(a, i, det)).que]);
      ant = est;
    }
    for (const e of d.eventos) {
      if (e.tic > t) continue;
      if (e.tipo === 'caza' && e.id === id) out.push([e.tic, T(`cazó a ${nombre(e.presa)}`, `caught ${nombre(e.presa)}`)]);
      else if (e.tipo === 'caza_fallida' && e.id === id) out.push([e.tic, T(`falló al cazar a ${nombre(e.presa)}`, `failed to catch ${nombre(e.presa)}`)]);
      else if (e.tipo === 'caza_fallida' && e.presa === id) out.push([e.tic, T(`se libró de ${nombre(e.id)}`, `escaped from ${nombre(e.id)}`)]);
      else if (e.tipo === 'picoteo' && e.id === id) out.push([e.tic, T(`picoteó ${nombre(e.presa)}`, `pecked at ${nombre(e.presa)}`)]);
      else if (e.tipo === 'apareamiento' && e.id === id) out.push([e.tic, T('se apareó', 'mated')]);
    }
    out.sort((a, b) => a[0] - b[0]);
    // juntar repetidos seguidos
    const limpio = [];
    for (const x of out) if (!limpio.length || limpio[limpio.length - 1][1] !== x[1]) limpio.push(x);
    return limpio.slice(-12).reverse();
  }

  const tabla = (filas) => `<table>${filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  const nota = (e) => (dato(e, 'nota') ? `<div class="gris nota">${esc(dato(e, 'nota'))}</div>` : '');

  // ---------------------------------------------------------------- la ficha de un animal
  function ficha() {
    if (planta) return fichaPlanta();
    const d = ctx.dia(), t = ctx.tic();
    const caja = $('ficha');
    if (!sel) { caja.innerHTML = ''; return; }
    const a = d.agentes[sel] || ultimo?.a;
    if (!a) { caja.innerHTML = `<div class="nada">${T('Ese animal ya no está.', 'That animal is no longer here.')}</div>`; return; }
    const f = fila(sel, t);
    const esp = FICHA[a.especie] || {}, e = COMPORTAMIENTO[a.especie] || {};
    const seguido = ctx.seguido() === sel;
    let estado;
    const m = d.agentes[sel] ? muerte(sel) : null;
    if (m && t >= m.tic) estado = `<div class="aviso muerto">✝ ${T(`Ha muerto a las ${hhmm(m.tic)}`, `Died at ${hhmm(m.tic)}`)}: ${esc(m.como)}.</div>`;
    else if (ultimo?.muerto) estado = `<div class="aviso muerto">✝ ${T(`Murió ayer a las ${hhmm(ultimo.muerto.tic)}`, `Died yesterday at ${hhmm(ultimo.muerto.tic)}`)}: ${esc(ultimo.muerto.como)}.</div>`;
    else if (f) {
      const ac = accion(sel, f);
      estado = `<div class="ahora"><b>${esc(ac.que[0].toUpperCase() + ac.que.slice(1))}</b>${ac.porque ? `<div class="porque">${T('porque', 'because')} ${esc(ac.porque)}</div>` : ''}${ac.hacia ? `<div class="porque">${esc(ac.hacia)}</div>` : ''}</div>`;
    } else if (!d.agentes[sel]) estado = `<div class="aviso">${T('Ya no está en el mapa: se ha ido a otra parte del bosque.', 'It is no longer on the map: it has gone to another part of the forest.')}</div>`;
    else estado = `<div class="aviso">${T('Ahora no está en el mapa (aún no ha llegado o ya se ha ido).', 'It is not on the map right now (it has not arrived yet or has already left).')}</div>`;
    const quien = [
      [T('Grupo del motor', 'Engine group'), `<span title="${a.grupo}">${t2(GRUPO[a.grupo]) || a.grupo}</span>`],
      [T('Sexo', 'Sex'), a.sexo === 'h' ? T('♀ hembra', '♀ female') : T('♂ macho', '♂ male')],
      ...(a.vertebrado ? [[T('Edad', 'Age'), `${edadTxt(a.edad)}${ayuda('Contada por el motor desde que empezó la simulación o desde que nació.', 'Counted by the engine since the simulation started or since it was born.')}`],
        [T('Peso', 'Weight'), `${peso(a.masa)} <span class="gris">(${T('adulto', 'adult')}: ${peso(a.adulta)})</span>`],
        [T('Cohorte del motor', 'Engine cohort'), `<span class="gris">…${esc(String(a.cohorte).slice(-8))}</span>${ayuda('Es un individuo de esa cohorte del motor (un grupo de animales iguales).', 'It is one individual of that engine cohort (a group of identical animals).')}`]]
        : [[T('Peso', 'Weight'), peso(a.masa)], [T('Representa a', 'Stands for'), `${num(a.vale || 1)} ${T('individuos del motor', 'engine individuals')}`]]),
    ];
    const como = f && Number.isFinite(f[6]) ? [
      [T('Hambre', 'Hunger'), barra(f[6], '#d8823a')], [T('Sed', 'Thirst'), barra(f[7], '#4a9ad8')], [T('Sueño', 'Sleepiness'), barra(f[8], '#9a7ad8')],
      [T('Condición', 'Condition'), `${barra(Math.min(1, a.masa / (a.adulta || a.masa)), '#6ab04a')} <span class="gris">${T('de su peso adulto', 'of its adult weight')}</span>`],
    ] : [];
    const meses = enIngles() ? MESES_EN : MESES_ES;
    const cria = e.cria ? `${e.cria.meses.length === 12 ? T('todo el año', 'all year') : e.cria.meses.map((x) => meses[x - 1]).join(', ')} · ${e.cria.crias} ${T('cría(s)', 'young')} · ${e.cria.dias} ${T('días', 'days')} · ${T('cortejo', 'courtship')}: ${t2(CORTEJO[e.cria.cortejo]) || e.cria.cortejo}` : T('no cría (larva)', 'does not breed (larva)');
    const especie = [
      [T('Velocidad', 'Speed'), T(`anda a ${num(e.andar)} m/s, corre a ${num(e.correr)} m/s`, `walks at ${num(e.andar)} m/s, runs at ${num(e.correr)} m/s`)], [T('Vista', 'Sight'), `${num(e.vista)} m`], [T('Horario', 'Activity'), t2(ACTIVIDAD[e.actividad]) || e.actividad],
      [T('Come', 'Eats'), (e.come || []).map((c) => t2(COMIDA_LISTA[c]) || c).join(', ')],
      ...(e.caza ? [[T('Caza', 'Hunts'), T(`${t2(CAZA[e.caza]) || e.caza}, acierta ${Math.round((e.exito ?? 0.3) * 100)} %`, `${t2(CAZA[e.caza]) || e.caza}, succeeds ${Math.round((e.exito ?? 0.3) * 100)} %`)]] : []),
      [T('Alerta', 'Alertness'), e.alerta ? T(`ve venir al peligro a ${e.alerta} m`, `spots danger at ${e.alerta} m`) : T('no se entera', 'does not notice')], [T('Refugio', 'Refuge'), t2(REFUGIO[e.refugio]) || e.refugio], [T('Hogar', 'Home'), t2(HOGAR_TIPO[e.hogar]) || e.hogar],
      [T('Grupo', 'Group'), e.social && e.social[1] > 1 ? T(`de ${e.social[0]} a ${e.social[1]}`, `${e.social[0]} to ${e.social[1]}`) : T('solitario', 'solitary')], [T('Bebe', 'Drinks'), e.bebe ? T('sí, en el arroyo', 'yes, at the stream') : T('no (le basta la comida)', 'no (its food is enough)')], [T('Cría', 'Breeding'), cria],
    ];
    const tierra = [];
    if (e.hogar === 'ninguno') tierra.push([T('Hogar', 'Home'), T('no tiene: descansa donde esté, dentro de su zona', 'none: it rests wherever it is, within its area')]);
    else if (a.hogar) {
      const dx = a.hogar.x - (f ? f[0] : a.hogar.x), dz = a.hogar.z - (f ? f[2] : a.hogar.z), dd = Math.hypot(dx, dz);
      const rumbo = t2(RUMBOS[Math.round(((Math.atan2(dz, dx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8]);
      tierra.push([T('Hogar', 'Home'), `${t2(HOGAR_TIPO[e.hogar]) || '—'}${f && dd > 1 ? T(`, a ${num(Math.round(dd))} m ${rumbo}`, `, ${num(Math.round(dd))} m ${rumbo}`) : f ? T(', aquí mismo', ', right here') : ''}`]);
    }
    if (a.rango) tierra.push([T('Territorio', 'Territory'), T(`se mueve unos ${num(Math.round(a.rango))} m alrededor de ${e.hogar === 'ninguno' ? 'su sitio' : 'su hogar'}`, `moves about ${num(Math.round(a.rango))} m around its ${e.hogar === 'ninguno' ? 'spot' : 'home'}`)]);
    const hist = d.agentes[sel] ? historial(sel, t) : [];
    caja.innerHTML = `<div class="cab"><div><div class="nom">${esc(nombreEsp(esp) || a.especie)}</div><div class="cien">${esc(esp.cientifico || '')}</div></div>
      <div class="acc"><button id="f-seguir" class="${seguido ? 'on' : ''}" title="${T('La cámara lo sigue', 'The camera follows it')}">${seguido ? T('siguiendo', 'following') : T('seguir', 'follow')}</button></div></div>
      ${estado}
      <h4>${T('Quién es', 'Who it is')}</h4>${tabla(quien)}
      ${como.length ? `<h4>${T('Cómo está', 'How it is')}</h4>${tabla(como)}` : ''}
      <h4>${T('Hoy', 'Today')}</h4>${hist.length ? `<div class="hist">${hist.map(([k, s]) => `<div><b>${hhmm(k)}</b> ${esc(s)}</div>`).join('')}</div>` : '<div class="gris">—</div>'}
      <h4>${T('Su hogar y su territorio', 'Its home and territory')}</h4>${tabla(tierra)}
      <h4>${T('Cómo es su especie', 'What its species is like')}</h4>${tabla(especie)}${nota(esp)}`;
    $('f-seguir').onclick = () => (ctx.seguido() === sel ? ctx.dejarDeSeguir() : ctx.seguir(sel));
  }

  // ---------------------------------------------------------------- la ficha de una planta o un hongo
  // quién come lo que tiene esta planta: las especies con esa comida
  const comen = (tipos) => ANIMALES.filter((x) => (COMPORTAMIENTO[x.id]?.come || []).some((c) => tipos.includes(c))).map((x) => minus(nombreEsp(x)));
  function fichaPlanta() {
    const caja = $('ficha'), { tipo, p } = planta, esp = VEGETAL[p.especie] || {}, m = ctx.mapa();
    const kg = (v) => (Number.isFinite(v) ? (v >= 1 ? `${num(v, { maximumFractionDigits: v >= 100 ? 0 : 1 })} kg` : `${num(v * 1000, { maximumFractionDigits: 0 })} g`) : '—');
    // los animales que están comiendo junto a ella ahora
    const r = tipo === 'arbol' ? Math.max(1.5, Math.sqrt((p.copa || 1) / Math.PI)) : 0.8, ahora = [];
    for (const a of ctx.animales()) {
      if (!a.visible || Math.hypot(a.x - p.x, a.z - p.z) > r) continue;
      const f = fila(a.id, ctx.tic(), false);
      if (f && ESTADOS[f[4]] === 'comer') ahora.push(nombre(a.id));
    }
    let filas, comida;
    if (tipo === 'arbol') {
      const arbol = p.pft === 'broadleaf';
      filas = [
        [T('Cohorte del motor', 'Engine cohort'), `<span class="gris">…${esc(String(p.cohorte).slice(-8))}</span> · ${arbol ? T('árbol de hoja ancha', 'broadleaf tree') : T('arbusto', 'shrub')}${ayuda(
          `En el motor, cada cuadro tiene cohortes de plantas: grupos de árboles iguales (mismo tipo y mismo diámetro). Esta planta es uno de los ${num(Math.round(p.n || 0))} de su cohorte; en el mapa salen los que tocan por su densidad.`,
          `In the engine, each cell has plant cohorts: groups of identical trees (same type and same diameter). This plant is one of the ${num(Math.round(p.n || 0))} in its cohort; the map shows as many as its density gives.`)}`],
        [T('Edad', 'Age'), `—${ayuda('El motor no lleva la edad de las plantas: crecen por su diámetro, día a día, según la luz y el agua.', 'The engine does not track plant age: they grow by their diameter, day by day, depending on light and water.')}`],
        [T('Altura', 'Height'), `${num(p.altura, { maximumFractionDigits: 1 })} m`],
        [T('Diámetro del tronco', 'Trunk diameter'), `${num(p.dbh * 100, { maximumFractionDigits: 0 })} cm`],
        [T('Copa', 'Crown'), `${num(p.copa, { maximumFractionDigits: 1 })} m²`],
        [T('Biomasa', 'Biomass'), `${T('tronco', 'stem')} ${kg(p.masaTronco)} · ${T('hojas', 'leaves')} ${kg(p.masaHojas)}${ayuda('Carbono del tronco y de las hojas, según las alometrías del motor (pyrealm).', 'Carbon in the stem and leaves, from the engine allometries (pyrealm).')}`],
      ];
      comida = [
        [T('Fruta en la copa', 'Fruit in the canopy'), kg(p.fruta)], [T('Fruta caída', 'Fallen fruit'), kg(p.frutaSuelo)], [T('Hojas que se pueden comer', 'Edible leaves'), kg(p.hojas)],
        [T('Se la comen', 'Eaten by'), [...new Set(comen(['fruta', 'fruta_suelo', 'semillas', 'hojas']))].join(', ') || '—'],
      ];
    } else {
      const c = m?.celdaDe(p.x, p.z), rc = m?.plantas?.[c]?.recursos;
      filas = [[T('En el motor', 'In the engine'), `${T('cuerpos fructíferos de hongos', 'fungal fruiting bodies')}${rc ? `: ${num(rc.setas * 1000, { maximumFractionDigits: 1 })} g/m²` : ''}${ayuda(
        'El motor no lleva cada seta: lleva cuánta masa de setas hay por metro cuadrado. En el mapa salen junto a los árboles y los troncos caídos.',
        'The engine does not track each mushroom: it tracks how much mushroom mass there is per square metre. On the map they appear by trees and fallen logs.')}`]];
      comida = [[T('Se la comen', 'Eaten by'), comen(['setas']).join(', ') || '—']];
    }
    if (ahora.length) comida.push([T('Comiendo aquí ahora', 'Eating here now'), ahora.join(', ')]);
    caja.innerHTML = `<div class="cab"><div><div class="nom">${esc(nombreEsp(esp) || p.especie)}</div><div class="cien">${esc(esp.cientifico || '')}</div></div></div>
      <div class="gris">${esc(categoria(esp.cat || ''))}</div>
      <h4>${T('Qué es', 'What it is')}</h4>${tabla(filas)}
      <h4>${T('Lo que se come de ella', 'What is eaten from it')}</h4>${tabla(comida)}${nota(esp)}`;
  }

  // ---------------------------------------------------------------- el listado
  const coincide = (sp) => {
    if (!buscar) return true;
    const e = FICHA[sp];
    return [e?.nombre, NOMBRE_EN[sp], e?.cientifico, sp].some((s) => sinTildes(s).includes(buscar));
  };
  function listado() {
    const d = ctx.dia(), t = ctx.tic(), f0 = ctx.foco();
    if (!d) return;
    // por especie: cuántos (cada simulado vale por los individuos del motor que representa)
    const porEsp = new Map();
    for (const id of d.ids) {
      const a = d.agentes[id];
      if (!a) continue;
      let l = porEsp.get(a.especie);
      if (!l) porEsp.set(a.especie, (l = { ids: [], n: 0, grupo: a.grupo, vale: a.vale || 1 }));
      l.ids.push(id); l.n += a.vale || 1;
    }
    const todos = porEsp.size;
    const grupos = [...porEsp.entries()].filter(([sp]) => coincide(sp)).sort((x, y) => nombreDe(x[0]).localeCompare(nombreDe(y[0]), enIngles() ? 'en' : 'es'));
    const html = grupos.map(([sp, l]) => {
      const abierto = abiertos.has(sp) || (buscar && grupos.length <= 2);
      let indiv = '';
      if (abierto) {
        // los más cercanos a donde mira la cámara (y el seleccionado)
        const vivos = [];
        for (const id of l.ids) { const f = fila(id, t, false); if (f && f[4] !== E.muerto) vivos.push({ id, a: d.agentes[id], f, dist: Math.hypot(f[0] - f0.x, f[2] - f0.z) }); }
        vivos.sort((x, y) => (x.id === sel ? -1 : y.id === sel ? 1 : x.dist - y.dist));
        const MAX = 30;
        indiv = `<div class="indiv">${vivos.slice(0, MAX).map(({ id, a, f, dist }) =>
          `<div class="uno${id === sel ? ' sel' : ''}" data-id="${id}">${a.sexo === 'h' ? '♀' : '♂'} ${peso(a.masa)} · ${T('a', '')} ${dist < 1000 ? num(Math.round(dist)) + ' m' : num(dist / 1000, { maximumFractionDigits: 1 }) + ' km'} · <span class="gris">${esc(accion(id, f).que)}</span></div>`).join('')}${vivos.length > MAX ? `<div class="gris">${T(`y ${vivos.length - MAX} más, más lejos`, `and ${vivos.length - MAX} more, further away`)}</div>` : ''}</div>`;
      }
      return `<div class="esp${abierto ? ' abierta' : ''}" data-esp="${sp}"><span class="flecha">${abierto ? '▾' : '▸'}</span> ${esc(nombreDe(sp))}
        <span class="n">${num(Math.round(l.n))}</span><div class="gris sub">${esc(t2(GRUPO[l.grupo]) || l.grupo)}${l.vale > 1 ? T(` · se ven ${num(l.ids.length)}, cada uno por ${num(l.vale)}`, ` · ${num(l.ids.length)} shown, each one for ${num(l.vale)}`) : ''}</div></div>${indiv}`;
    }).join('');
    const caja = $('lista');
    const scroll = caja.scrollTop;
    caja.innerHTML = `<div class="gris tot">${T('Animales en el mapa', 'Animals on the map')}: ${ctx.total()} · ${buscar ? `${grupos.length} ${T('de', 'of')} ` : ''}${todos} ${T('especies', 'species')}</div>${html || `<div class="gris tot">${T('Ninguna especie con ese nombre.', 'No species with that name.')}</div>`}`;
    caja.scrollTop = scroll;
    for (const el of caja.querySelectorAll('.esp')) el.onclick = () => { const sp = el.dataset.esp; abiertos.has(sp) ? abiertos.delete(sp) : abiertos.add(sp); ultimoListado = 0; listado(); };
    for (const el of caja.querySelectorAll('.uno')) el.onclick = () => seleccionar(el.dataset.id, true);
  }

  // ---------------------------------------------------------------- selección
  function seleccionar(id, seguir = true) {
    sel = id; planta = null;
    ultimo = null;
    if (id) {
      if (!abierto) abrir(true);
      const a = ctx.dia()?.agentes[id];
      if (a) abiertos.add(a.especie);
      if (seguir) ctx.seguir(id);
      ctx.verFicha(a ? nombreDe(a.especie) : T('Animal', 'Animal'));
    } else { ctx.dejarDeSeguir(); ctx.cerrarFicha(); }
    ultimoListado = 0; ultimaFicha = 0;
    if (id) ficha();
  }
  // una planta o una seta pulsada en la escena (tipo 'arbol' o 'seta'; p: la del mapa)
  function seleccionarPlanta(tipo, p) {
    sel = null; ultimo = null; planta = { tipo, p };
    ctx.dejarDeSeguir();
    if (!abierto) abrir(true);
    ctx.verFicha(nombreDe(p.especie));
    ultimaFicha = 0;
    fichaPlanta();
  }
  // la ✕ de la pestaña de la ficha
  function cerrar() { sel = null; planta = null; ultimo = null; ctx.dejarDeSeguir(); ctx.cerrarFicha(); }

  // al cambiar de día: si el seleccionado ya no sale, se guarda lo último que se sabía
  function nuevoDia(anterior) {
    if (!sel || !anterior) return;
    const d = ctx.dia();
    if (!d.agentes[sel]) {
      const a = anterior.agentes[sel];
      let muerto = null;
      for (const e of anterior.eventos) {
        if (e.tipo === 'caza' && e.presa === sel) { const n = anterior.agentes[e.id]?.especie; muerto = { tic: e.tic, como: T(`cazado por ${n ? conArticulo(minus(nombreDe(n))) : 'un depredador'}`, `caught by ${n ? conArticulo(minus(nombreDe(n))) : 'a predator'}`) }; }
        if (e.tipo === 'muerte' && e.id === sel) muerto = { tic: e.tic, como: T('de muerte natural', 'of natural causes') };
      }
      ultimo = { a, muerto };
    }
  }

  return {
    seleccionar, seleccionarPlanta, cerrar, nuevoDia, abrir,
    get seleccionado() { return sel; },
    get planta() { return planta; },
    actualizar(ms, pestana) {
      if (!ctx.dia() || !abierto) return;
      if (pestana === 'animales' && ms - ultimoListado > 700) { ultimoListado = ms; listado(); }
      if (pestana === 'ficha' && ms - ultimaFicha > (planta ? 1000 : 200)) { ultimaFicha = ms; ficha(); }
    },
  };
}
