/* =============================================================================
 * app.js — Ecosistema I+D+i UAH (maqueta)
 * -----------------------------------------------------------------------------
 * 1. Carga datos_prueba.json con fetch().
 * 2. Transforma los nodos y enlaces del JSON al formato de vis-network.
 * 3. Dibuja la red en #network-graph y quita el marcador de posición.
 * 4. Al seleccionar un académico, reconstruye la ficha en #perfil.
 * 5. Conecta los filtros (facultad y palabras clave), el buscador,
 *    los botones de zoom y el interruptor Vista Interna / Externa.
 *
 * Requiere, antes de este archivo:
 *   <script src="https://unpkg.com/vis-network@10.1.2/standalone/umd/vis-network.min.js"></script>
 * ========================================================================== */
'use strict';

/* -----------------------------------------------------------------------------
 * Configuración y estado
 * -------------------------------------------------------------------------- */

const RUTA_DATOS = 'datos_prueba.json';
const ALFA_ATENUADO = 0.12; // opacidad de los nodos que no cumplen el filtro
const SEMILLA_LAYOUT = 21;  // cambia este número para probar otra disposición inicial de la red

/** Lee una variable CSS del :root para usar los mismos colores que el HTML. */
function cssVar(nombre, respaldo) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || respaldo;
}

// Paleta institucional: se lee de las variables CSS del HTML (con respaldo por si faltan).
const COLOR = {
  ing: cssVar('--ing', '#0f2e53'),      // azul marino
  psi: cssVar('--psi', '#9b2c2c'),      // burdeos
  proy: cssVar('--proy', '#2f6b4f'),    // verde profundo
  kw: cssVar('--kw', '#94a3b8'),
  marca: cssVar('--marca', '#0f2e53'),
  acento: cssVar('--acento', '#b08d3a'),// dorado sobrio: solo selección
  texto: cssVar('--texto', '#0f172a'),
  texto2: cssVar('--texto-2', '#475569'),
  arista: '#cbd5e1',
};
const FUENTE = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Color de cada facultad. Una facultad nueva sin color usa gris. */
const COLOR_FACULTAD = { 'fac-ing': COLOR.ing, 'fac-psi': COLOR.psi };
const colorFacultad = (idFacultad) => COLOR_FACULTAD[idFacultad] || '#475569';

/** Estado global de la aplicación. */
const estado = {
  datos: null,            // JSON original
  red: null,              // instancia de vis.Network
  nodos: null,            // vis.DataSet de nodos
  aristas: null,          // vis.DataSet de aristas
  porId: new Map(),       // id -> objeto original del JSON (cualquier tipo)
  indices: null,          // relaciones precalculadas (ver construirIndices)
  filtroFacultad: 'todas',
  filtroPalabras: new Set(),
  vistaInterna: true,
  seleccionado: null,     // id del académico cuya ficha está abierta
};

/* -----------------------------------------------------------------------------
 * Utilidades
 * -------------------------------------------------------------------------- */

/** Convierte #rrggbb a rgba(r,g,b,a). */
function rgba(hex, alfa) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Escapa texto antes de insertarlo como HTML. */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
const normalizar = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Iniciales para el avatar: "Valentina Rojas Fuentes" -> "VR". */
function iniciales(nombre) {
  const partes = nombre.split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}

/** Nombre corto de una palabra clave o facultad a partir de su id. */
const etiquetaDe = (id) => estado.porId.get(id)?.etiqueta ?? id;

/* -----------------------------------------------------------------------------
 * 1. Carga de datos
 * -------------------------------------------------------------------------- */

async function cargarDatos() {
  const respuesta = await fetch(RUTA_DATOS, { cache: 'no-store' });
  if (!respuesta.ok) throw new Error(`No se pudo leer ${RUTA_DATOS} (HTTP ${respuesta.status})`);
  return respuesta.json();
}

/**
 * Precalcula relaciones que se usan en filtros y fichas, a partir de los enlaces.
 * Así el resto del código no recorre la lista de enlaces cada vez.
 */
function construirIndices(datos) {
  const idx = {
    miembrosProyecto: new Map(),   // proy -> [{ academico, rol }]
    academicosDePalabra: new Map(),// kw -> Set(acad)
    academicosDeFacultad: new Map(),// fac -> Set(acad)
    colaboradores: new Map(),      // acad -> Map(otroAcad -> enlace)
  };
  const agregar = (mapa, clave, valor) => {
    if (!mapa.has(clave)) mapa.set(clave, new Set());
    mapa.get(clave).add(valor);
  };

  for (const e of datos.enlaces) {
    switch (e.tipo) {
      case 'INVESTIGA_EN':
        if (!idx.miembrosProyecto.has(e.target)) idx.miembrosProyecto.set(e.target, []);
        idx.miembrosProyecto.get(e.target).push({ academico: e.source, rol: e.rol });
        break;
      case 'TIENE_PALABRA_CLAVE':
        agregar(idx.academicosDePalabra, e.target, e.source);
        break;
      case 'PERTENECE_A':
        agregar(idx.academicosDeFacultad, e.target, e.source);
        break;
      case 'COLABORA_CON': // no dirigida: se registra en ambos sentidos
        for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
          if (!idx.colaboradores.has(a)) idx.colaboradores.set(a, new Map());
          idx.colaboradores.get(a).set(b, e);
        }
        break;
    }
  }
  return idx;
}

/* -----------------------------------------------------------------------------
 * 2. Estilos de nodos y aristas (normal / atenuado)
 * -------------------------------------------------------------------------- */

/** Devuelve el color base del nodo según su tipo (y facultad, si es académico). */
function colorBaseNodo(nodo) {
  switch (nodo.tipo) {
    case 'Academico': return colorFacultad(nodo.facultad);
    case 'Facultad': return colorFacultad(nodo.id);
    case 'Proyecto': return COLOR.proy;
    default: return COLOR.kw; // PalabraClave
  }
}

/**
 * Estilo visual de un nodo. Con atenuado=true se vuelve casi transparente.
 * Académicos: relleno sólido del color de su facultad, anillo blanco y sombra corta.
 * La selección se marca con el acento dorado.
 */
/** Función que asigna un color de fondo más notorio al texto según su tipo */
function colorFondoTexto(nodo) {
  if (nodo.tipo === 'Proyecto') return '#cce0d6'; // Verde más sólido
  if (nodo.tipo === 'PalabraClave') return '#e2e8f0'; // Gris pizarra más marcado
  if (nodo.tipo === 'Facultad') return 'transparent'; // Las facultades no necesitan fondo
  
  // Académicos: Azul claro sólido para Ingeniería, Rosa/Burdeos sólido para Psicología
  return nodo.facultad === 'fac-ing' ? '#d3e3f3' : '#f5dada'; 
}

/**
 * Estilo visual de un nodo.
 */
function estiloNodo(nodo, atenuado = false) {
  const base = colorBaseNodo(nodo);
  const esAcademico = nodo.tipo === 'Academico';
  const relleno = rgba(base, atenuado ? ALFA_ATENUADO : 1);

  return {
    opacity: atenuado ? 0.45 : 1,
    shadow: esAcademico
      ? { enabled: !atenuado, color: 'rgba(15, 23, 42, 0.18)', size: 6, x: 0, y: 2 }
      : false,
    color: {
      background: relleno,
      border: esAcademico ? rgba('#ffffff', atenuado ? 0.4 : 1) : relleno,
      highlight: { background: base, border: COLOR.acento },
      hover: { background: base, border: esAcademico ? COLOR.acento : base },
    },
    font: {
      color: nodo.tipo === 'Facultad' ? rgba('#ffffff', atenuado ? 0.6 : 1)
        : rgba(nodo.tipo === 'PalabraClave' ? COLOR.texto2 : COLOR.texto, atenuado ? 0.25 : 1),
      // NUEVO: Aquí aplicamos el color de fondo para tapar las líneas que pasen por detrás
      background: atenuado ? undefined : colorFondoTexto(nodo),
    },
  };
}

/**
 * Estilo de una arista según su tipo. 
 */
const ESTILO_ARISTA = {
  // NUEVO: smooth le da curvatura orgánica a las conexiones humanas
  COLABORA_CON:        { base: '#475569', alfa: 0.7,  realce: COLOR.acento, smooth: { type: 'curvedCW', roundness: 0.2 } },
  POTENCIAL:           { base: COLOR.marca, alfa: 0.5, realce: COLOR.acento, dashes: [5, 5], smooth: { type: 'curvedCCW', roundness: 0.2 } },
  INVESTIGA_EN:        { base: COLOR.proy, alfa: 0.45, realce: COLOR.proy },
  PERTENECE_A:         { base: COLOR.arista, alfa: 1,  realce: COLOR.texto2 },
  TIENE_PALABRA_CLAVE: { base: '#e2e8f0', alfa: 1,    realce: COLOR.texto2 },
};
const ANCHO_ARISTA = { POTENCIAL: 1.2, INVESTIGA_EN: 1.2, PERTENECE_A: 1, TIENE_PALABRA_CLAVE: 0.8 };

const LARGO_ARISTA = { PERTENECE_A: 60, TIENE_PALABRA_CLAVE: 110, INVESTIGA_EN: 160, COLABORA_CON: 230 };

function estiloArista(arista, atenuado = false) {
  const e = ESTILO_ARISTA[arista.tipo] || ESTILO_ARISTA.TIENE_PALABRA_CLAVE;
  const realce = rgba(e.realce, atenuado ? 0.25 : 1);
  return {
    width: arista.tipo === 'COLABORA_CON' ? 1 + (arista.peso || 1) * 1.2 : ANCHO_ARISTA[arista.tipo] ?? 1,
    dashes: e.dashes || false,
    smooth: e.smooth || false, // Aplica la curvatura si está definida
    color: { color: rgba(e.base, atenuado ? 0.07 : e.alfa), highlight: realce, hover: realce, inherit: false },
  };
}

/* -----------------------------------------------------------------------------
 * 3. Mapeo JSON -> formato vis-network
 * -------------------------------------------------------------------------- */

/**
 * Posiciones ancla de las facultades: se reparten en un círculo (con 2 facultades,
 * una a cada lado). En pantallas verticales se ubican arriba y abajo. Las facultades
 * quedan fijas mientras corre la física, y el resto de los nodos se ordena a su alrededor.
 */
function esVertical() { return window.innerHeight > window.innerWidth * 1.1; }

function anclasFacultades(facultades) {
  const radio = 380;
  const vertical = esVertical();
  const giro = vertical ? -Math.PI / 2 : Math.PI; // primera facultad a la izquierda (o arriba)
  const anclas = new Map();
  facultades.forEach((f, i) => {
    const ang = giro + (i * 2 * Math.PI) / facultades.length;
    anclas.set(f.id, { x: Math.round(radio * Math.cos(ang)), y: Math.round(radio * Math.sin(ang)) });
  });
  return anclas;
}

/** Desplazamiento pequeño y determinista (siempre igual para el mismo índice). */
function jitter(i, r = 60) {
  const ang = i * 2.399963; // ángulo áureo: reparte los puntos sin amontonarlos
  return { x: Math.cos(ang) * r * (0.5 + (i % 3) / 4), y: Math.sin(ang) * r * (0.5 + (i % 3) / 4) };
}

/** Promedio de las anclas de un conjunto de facultades (para nodos compartidos). */
function centroDe(ids, anclas, factor) {
  const pts = ids.map((id) => anclas.get(id)).filter(Boolean);
  if (!pts.length) return { x: 0, y: 0 };
  return {
    x: (pts.reduce((s, p) => s + p.x, 0) / pts.length) * factor,
    y: (pts.reduce((s, p) => s + p.y, 0) / pts.length) * factor,
  };
}

function mapearNodos(datos, idx) {
  const nodos = [];
  const anclas = anclasFacultades(datos.nodos.Facultad);
  const facDe = new Map(datos.nodos.Academico.map((a) => [a.id, a.facultad]));

  for (const f of datos.nodos.Facultad) {
    const p = anclas.get(f.id);
    nodos.push({
      id: f.id, tipo: 'Facultad', label: f.etiqueta.toUpperCase(), title: f.nombre,
      // NUEVO: Ícono de edificio para las facultades
      shape: 'icon',
      icon: { face: '"bootstrap-icons"', code: '\uf1ad', size: 45, color: colorBaseNodo(f) },
      font: { size: 12, face: FUENTE, strokeWidth: 4, strokeColor: '#ffffff' },
      mass: 4, x: p.x, y: p.y, fixed: { x: true, y: true },
      ...estiloNodo(f),
    });
  }

  const vertical = esVertical();
  const porFacultad = new Map();
  datos.nodos.Academico.forEach((a) => porFacultad.set(a.facultad, (porFacultad.get(a.facultad) || 0) + 1));
  const orden = new Map();
  const PASO = 75; 
  
  datos.nodos.Academico.forEach((a) => {
    const nColab = idx.colaboradores.get(a.id)?.size ?? 0;
    const k = orden.get(a.facultad) ?? 0; orden.set(a.facultad, k + 1);
    const n = porFacultad.get(a.facultad);
    const ancla = anclas.get(a.facultad) || { x: 0, y: 0 };
    const franja = (k - (n - 1) / 2) * PASO;
    const c = { x: ancla.x * 0.6, y: ancla.y * 0.6 };
    const alterno = (k % 2 ? 1 : -1) * 60;
    const d = vertical ? { x: alterno, y: franja } : { x: franja, y: alterno };
    // Los académicos se mantienen como "puntos" porque visualmente funcionan excelente como avatares
    nodos.push({
      id: a.id, tipo: 'Academico', label: a.etiqueta,
      title: `${a.nombre}\n${a.cargo}\n${a.lineasInvestigacion.join(' · ')}`,
      shape: 'dot', size: 11 + nColab * 1.5,
      borderWidth: 2, borderWidthSelected: 3,
      font: { size: 13, face: FUENTE, strokeWidth: 4, strokeColor: '#ffffff', vadjust: 2 },
      facultad: a.facultad,
      x: c.x + d.x, y: c.y + d.y,
      fixed: vertical ? { x: false, y: true } : { x: true, y: false },
      ...estiloNodo(a),
    });
  });

  datos.nodos.Proyecto.forEach((p, i) => {
    const facs = [...new Set((idx.miembrosProyecto.get(p.id) || []).map((m) => facDe.get(m.academico)))];
    const c = centroDe(facs, anclas, 0.35), d = jitter(i + 20, 70);
    nodos.push({
      id: p.id, tipo: 'Proyecto', label: p.etiqueta,
      title: `${p.titulo}\n${p.instrumento} · ${p.organismo}\n${p.estado} (${p.anioInicio}–${p.anioTermino})`,
      // NUEVO: Ícono de carpeta para los proyectos
      shape: 'icon',
      icon: { face: '"bootstrap-icons"', code: '\uf3d1', size: 26, color: colorBaseNodo(p) },
      font: { size: 12, face: FUENTE, strokeWidth: 4, strokeColor: '#ffffff' },
      visibilidad: p.visibilidad,
      x: c.x + d.x, y: c.y + d.y,
      ...estiloNodo(p),
    });
  });

  datos.nodos.PalabraClave.forEach((k, i) => {
    const facs = [...(idx.academicosDePalabra.get(k.id) || [])].map((id) => facDe.get(id));
    const c = centroDe(facs, anclas, 0.8), d = jitter(i + 40, 110);
    nodos.push({
      id: k.id, tipo: 'PalabraClave', label: k.etiqueta, title: `Palabra clave: ${k.etiqueta}`,
      // NUEVO: Ícono de etiqueta (tag) para las palabras clave
      shape: 'icon',
      icon: { face: '"bootstrap-icons"', code: '\uf5aa', size: 20, color: colorBaseNodo(k) },
      font: { size: 11, face: FUENTE, strokeWidth: 3, strokeColor: '#ffffff' },
      x: c.x + d.x, y: c.y + d.y,
      ...estiloNodo(k),
    });
  });
  
  return nodos;
}

function mapearAristas(datos) {
  const aristas = datos.enlaces.map((e) => {
    let title;
    if (e.tipo === 'COLABORA_CON') {
      const partes = [];
      if (e.proyectosCompartidos.length) partes.push(`${e.proyectosCompartidos.length} proyecto(s) en común`);
      if (e.publicacionesConjuntas) partes.push(`${e.publicacionesConjuntas} publicación(es) conjunta(s)`);
      title = `Colaboración${e.interfacultad ? ' interfacultad' : ''}\n${partes.join(' · ')}`;
    } else if (e.tipo === 'INVESTIGA_EN') {
      title = e.rol;
    }
    return { id: e.id, from: e.source, to: e.target, tipo: e.tipo, peso: e.peso, title, length: LARGO_ARISTA[e.tipo], ...estiloArista(e) };
  });

  // Aristas derivadas: potenciales conexiones de 2.º grado (línea punteada, solo vista interna).
  const vistos = new Set();
  for (const a of datos.nodos.Academico) {
    for (const pc of a.potencialesConexiones) {
      const clave = [a.id, pc.academico].sort().join('|');
      if (vistos.has(clave)) continue; // A->B y B->A se dibujan una sola vez
      vistos.add(clave);
      const arista = {
        id: `pot-${clave}`, from: a.id, to: pc.academico, tipo: 'POTENCIAL',
        title: `Conexión potencial\n${pc.motivo}`, physics: false, // no deforma la red
      };
      aristas.push({ ...arista, ...estiloArista(arista) });
    }
  }
  return aristas;
}
/** Calcula la envoltura convexa (Convex Hull) usando el algoritmo de Cadena Monótona */
function convexHull(points) {
  if (points.length <= 3) return points;
  const pts = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (let p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    let p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Dibuja "territorios" sombreados agrupando a los académicos de cada facultad */

/** Dibuja territorios sombreados animados y el halo de selección */
function iniciarEfectosCanvas(red) {
  red.on("beforeDrawing", function (ctx) {
    const posiciones = red.getPositions();
    const tiempo = Date.now();

    // 1. EFECTO RESPIRACIÓN EN TERRITORIOS (Convex Hulls)
    const porFacultad = new Map();
    estado.nodos.forEach(nodo => {
      if (nodo.tipo === 'Academico' && !nodo.hidden) {
         const pos = posiciones[nodo.id];
         if (pos) {
           if (!porFacultad.has(nodo.facultad)) porFacultad.set(nodo.facultad, []);
           porFacultad.get(nodo.facultad).push(pos);
         }
      }
    });

    // Pulso muy lento para el fondo (0 a 1)
    const pulsoLento = (Math.sin(tiempo / 800) + 1) / 2; 

    for (const [idFacultad, puntos] of porFacultad.entries()) {
      if (puntos.length === 0) continue;
      const hull = convexHull(puntos);
      const color = colorFacultad(idFacultad);
      
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 80; 
      
      // La opacidad oscila suavemente entre 0.03 y 0.05
      const alfaAnimado = 0.03 + (pulsoLento * 0.02); 
      ctx.fillStyle = rgba(color, alfaAnimado);
      ctx.strokeStyle = rgba(color, alfaAnimado);

      ctx.beginPath();
      ctx.moveTo(hull[0].x, hull[0].y);
      if (hull.length === 1) {
         ctx.lineTo(hull[0].x, hull[0].y);
      } else {
         for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
         ctx.closePath();
      }
      ctx.fill();
      ctx.stroke(); 
    }

    // 2. EFECTO HALO/LATIDO EN NODO SELECCIONADO
    if (estado.seleccionado) {
      const posSelect = posiciones[estado.seleccionado];
      const original = estado.porId.get(estado.seleccionado);
      
      // Si el nodo existe y no está oculto
      if (posSelect && original && !estado.nodos.get(estado.seleccionado).hidden) {
        const colorSelect = colorBaseNodo(original);
        // Pulso rápido para llamar la atención (0 a 1)
        const pulsoRapido = (Math.sin(tiempo / 250) + 1) / 2; 
        
        // El radio crece mientras la opacidad se desvanece
        const radioHalo = 25 + (pulsoRapido * 15);
        const alfaHalo = 0.3 - (pulsoRapido * 0.25);
        
        ctx.beginPath();
        ctx.arc(posSelect.x, posSelect.y, radioHalo, 0, 2 * Math.PI);
        ctx.fillStyle = rgba(colorSelect, Math.max(0, alfaHalo));
        ctx.fill();
      }
    }
  });
}
/* -----------------------------------------------------------------------------
 * 4. Inicialización de la red
 * -------------------------------------------------------------------------- */

/**
 * Zona del mapa que NO queda tapada por los paneles flotantes (píldora, filtros y ficha).
 * El lienzo ocupa toda la ventana, así que el centro visible no es el centro del lienzo:
 * `offset` es el desplazamiento (en píxeles de pantalla) que vis-network necesita para
 * centrar la red en el hueco libre.
 */
function areaVisible() {
  const lienzo = document.getElementById('network-graph');
  const ancho = lienzo.clientWidth;
  const alto = lienzo.clientHeight;
  const margen = 24;
  let izq = 0, der = ancho, sup = 0, inf = alto;

  const pildora = document.querySelector('.topbar-pill');
  if (pildora) sup = pildora.getBoundingClientRect().bottom;

  // Filtros: solo tapan el mapa cuando flotan fijos a la izquierda (escritorio).
  const filtros = document.getElementById('sidebar');
  if (filtros && window.matchMedia('(min-width: 992px)').matches) izq = filtros.getBoundingClientRect().right;

  // Leyenda: en móvil flota arriba, bajo la píldora.
  const leyenda = document.querySelector('.map-info');
  if (leyenda) {
    const r = leyenda.getBoundingClientRect();
    if (r.height && r.top < alto / 2) sup = Math.max(sup, r.bottom);   // móvil: arriba
    else if (r.height && r.top > alto / 2) inf = Math.min(inf, r.top); // escritorio: abajo
  }

  // Ficha: panel derecho en escritorio u hoja inferior en móvil.
  const perfil = document.getElementById('perfil');
  if (perfil && getComputedStyle(perfil).display !== 'none') {
    const r = perfil.getBoundingClientRect();
    if (r.width && r.left > ancho / 2) der = r.left;
    else if (r.height && r.top > alto / 2) inf = r.top;
  }

  return {
    ancho, alto,
    libreAncho: Math.max(der - izq - margen * 2, 120),
    libreAlto: Math.max(inf - sup - margen * 2, 120),
    offset: { x: (izq + der) / 2 - ancho / 2, y: (sup + inf) / 2 - alto / 2 },
  };
}

/** Encuadra toda la red dentro de la zona libre del mapa. */
function ajustarVista(red, animar = true) {
  const a = areaVisible();
  const posiciones = Object.values(red.getPositions());
  if (!posiciones.length) return;

  // Caja que ocupan los nodos (coordenadas del lienzo) y su centro.
  const xs = posiciones.map((p) => p.x), ys = posiciones.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const RELLENO_X = 140, RELLENO_Y = 70; // espacio para etiquetas y radios de los nodos

  const escala = Math.min(
    a.libreAncho / (maxX - minX + RELLENO_X),
    a.libreAlto / (maxY - minY + RELLENO_Y),
    1.3 // tope para que una red pequeña no se vea gigante
  );
  red.moveTo({
    position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    scale: escala,
    offset: a.offset, // centro del hueco entre paneles, no del lienzo
    animation: animar ? { duration: 400, easingFunction: 'easeInOutQuad' } : false,
  });
}

/** Centra un nodo en la zona libre del mapa (no detrás de un panel). */
function enfocarNodo(id) {
  estado.red.focus(id, {
    scale: Math.max(estado.red.getScale(), 1.1),
    offset: areaVisible().offset,
    animation: { duration: 500, easingFunction: 'easeInOutQuad' },
  });
}

function crearRed(contenedor, nodos, aristas) {
  const opciones = {
    autoResize: true,
    layout: { randomSeed: SEMILLA_LAYOUT }, // misma disposición en cada carga
    nodes: { chosen: true },
    // Líneas rectas: lectura más técnica y ordenada que las curvas.
    edges: { smooth: true, selectionWidth: 1, hoverWidth: 0.5 },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -180, // NUEVO: Repulsión mucho más fuerte para separar los nodos
        centralGravity: 0.004,      
        springLength: 110,          
        springConstant: 0.09,
        damping: 0.6,               
        avoidOverlap: 1,            // NUEVO: 1 fuerza a los nodos a no tocarse NUNCA
      },
      maxVelocity: 30,
      minVelocity: 0.5,
      timestep: 0.4,
      // Se estabiliza en segundo plano antes de mostrar la red (sin animación de "rebote").
      stabilization: { enabled: true, iterations: 1000, updateInterval: 50, fit: false },
    },
    interaction: { hover: true, tooltipDelay: 150, multiselect: false, navigationButtons: false, zoomView: true },
  };
  const red = new vis.Network(contenedor, { nodes: nodos, edges: aristas }, opciones);

  // Una vez ordenada la red se congela la física para que no "baile" durante la demo.
  red.once('stabilizationIterationsDone', () => {
    red.setOptions({ physics: false });
    // Se liberan facultades y académicos para que el usuario pueda arrastrarlos.
    nodos.update(nodos.get({ filter: (n) => n.fixed }).map((n) => ({ id: n.id, fixed: false })));
    ajustarVista(red, false);
  });
  return red;
}

/* -----------------------------------------------------------------------------
 * 5. Filtros (facultad + palabras clave) y vista interna/externa
 * -------------------------------------------------------------------------- */

/**
 * Recalcula qué nodos y aristas quedan activos, atenuados u ocultos.
 * Ahora incluye lógica de Revelación Progresiva para no saturar el mapa.
 */
function aplicarFiltros() {
  const { datos, indices, filtroFacultad, filtroPalabras, vistaInterna, seleccionado, hovered } = estado;
  if (!datos) return;

  const academicosActivos = new Set(
    datos.nodos.Academico
      .filter((a) => filtroFacultad === 'todas' || a.facultad === filtroFacultad)
      .filter((a) => filtroPalabras.size === 0 || a.palabrasClave.some((k) => filtroPalabras.has(k)))
      .map((a) => a.id)
  );
  const hayActivo = (conjunto) => [...(conjunto || [])].some((id) => academicosActivos.has(id));

  const activos = new Set(academicosActivos);
  for (const p of datos.nodos.Proyecto) {
    if ((indices.miembrosProyecto.get(p.id) || []).some((m) => academicosActivos.has(m.academico))) activos.add(p.id);
  }
  for (const k of datos.nodos.PalabraClave) {
    if (filtroPalabras.has(k.id) || hayActivo(indices.academicosDePalabra.get(k.id))) activos.add(k.id);
  }
  for (const f of datos.nodos.Facultad) {
    if (hayActivo(indices.academicosDeFacultad.get(f.id))) activos.add(f.id);
  }

  const expandidos = new Set();
  if (seleccionado) {
    const nodoSelect = estado.porId.get(seleccionado);
    if (nodoSelect) {
      if (nodoSelect.tipo === 'Academico') {
        (nodoSelect.proyectos || []).forEach(p => expandidos.add(p));
        (nodoSelect.palabrasClave || []).forEach(kw => expandidos.add(kw));
      } else if (nodoSelect.tipo === 'Proyecto' || nodoSelect.tipo === 'PalabraClave') {
        expandidos.add(nodoSelect.id);
      }
    }
  }

  // --- NUEVO: Lógica de Spotlight (Hover) ---
  const focoHover = new Set();
  if (hovered && estado.red) {
    focoHover.add(hovered);
    // Recupera automáticamente a todos los vecinos conectados
    estado.red.getConnectedNodes(hovered).forEach(id => focoHover.add(id));
  }

  const cambiosNodos = [];
  for (const nodo of estado.nodos.get()) {
    const original = estado.porId.get(nodo.id);
    let oculto = false;

    if (original.tipo === 'Proyecto' || original.tipo === 'PalabraClave') {
      oculto = true;
      if (expandidos.has(nodo.id)) oculto = false;
      if (original.tipo === 'PalabraClave' && filtroPalabras.has(nodo.id)) oculto = false;
      if (original.tipo === 'Proyecto' && !vistaInterna && original.visibilidad === 'interna') oculto = true;
    }

    let atenuado = !activos.has(nodo.id);
    let extratransparente = false;
    
    // Si hay un nodo en hover, y este nodo NO está conectado a él, lo atenuamos fuertemente
    if (hovered && !focoHover.has(nodo.id)) {
      atenuado = true;
      extratransparente = true;
    }

    const estilo = estiloNodo(original, atenuado);
    
    // Forzar opacidad al 5% para lograr el efecto Spotlight agresivo
    if (extratransparente) {
      const cBase = colorBaseNodo(original);
      estilo.color.background = rgba(cBase, 0.05);
      if (estilo.color.border) estilo.color.border = rgba('#ffffff', 0.05);
      estilo.font.color = rgba(original.tipo === 'PalabraClave' ? COLOR.texto2 : COLOR.texto, 0.05);
      if (estilo.icon) estilo.icon.color = rgba(cBase, 0.05);
    }

    cambiosNodos.push({ id: nodo.id, hidden: oculto, ...estilo });
  }
  estado.nodos.update(cambiosNodos);

  const cambiosAristas = estado.aristas.get().map((a) => {
    let atenuado = !(activos.has(a.from) && activos.has(a.to));
    let extratransparente = false;

    if (hovered && (!focoHover.has(a.from) || !focoHover.has(a.to))) {
      atenuado = true;
      extratransparente = true;
    }

    const est = estiloArista(a, atenuado);
    
    // Las líneas desconectadas casi desaparecen (2% opacidad)
    if (extratransparente) {
      const eStyle = ESTILO_ARISTA[a.tipo] || ESTILO_ARISTA.TIENE_PALABRA_CLAVE;
      est.color.color = rgba(eStyle.base, 0.02); 
    }

    return {
      id: a.id,
      hidden: a.tipo === 'POTENCIAL' && !vistaInterna,
      ...est
    };
  });
  estado.aristas.update(cambiosAristas);

  const meta = document.getElementById('graphMeta');
  if (meta) {
    const total = datos.nodos.Academico.length;
    const proyectosVisibles = datos.nodos.Proyecto.filter((p) => activos.has(p.id) && (vistaInterna || p.visibilidad !== 'interna')).length;
    meta.textContent = academicosActivos.size === total
      ? `${total} académicos · ${proyectosVisibles} proyectos · ${datos.nodos.Facultad.length} facultades`
      : `${academicosActivos.size} de ${total} académicos · ${proyectosVisibles} proyectos relacionados`;
  }
}

/* -----------------------------------------------------------------------------
 * 6. Ficha del académico (#perfil)
 * -------------------------------------------------------------------------- */

function renderPerfil(idNodo) {
  const cont = document.getElementById('perfilContenido');
  const nodo = estado.porId.get(idNodo);
  // Validar que sea Académico o Proyecto
  if (!cont || !nodo || (nodo.tipo !== 'Academico' && nodo.tipo !== 'Proyecto')) return;
  
  estado.seleccionado = idNodo;
  document.getElementById('perfil')?.classList.remove('is-empty');

  if (nodo.tipo === 'Academico') {
    const a = nodo;
    const fac = estado.porId.get(a.facultad);
    const colorFac = colorFacultad(a.facultad);
    const colaboradores = estado.indices.colaboradores.get(a.id) || new Map();
    const interfacultad = [...colaboradores.values()].filter((e) => e.interfacultad).length;
    const lineasFin = new Map(estado.datos.catalogos.lineasFinanciamiento.map((l) => [l.id, l]));

    const conexionesHTML = a.potencialesConexiones.length
      ? a.potencialesConexiones.map((pc) => {
          const otro = estado.porId.get(pc.academico);
          const cOtro = colorFacultad(otro.facultad);
          const via = pc.intermediarios[0] ? estado.porId.get(pc.intermediarios[0]) : null;
          const extra = pc.intermediarios.length > 1 ? ` <span class="text-secondary">+${pc.intermediarios.length - 1}</span>` : '';
          const pct = Math.round(pc.puntaje * 100);
          return `
            <button type="button" class="conn w-100 text-start mb-2" data-academico="${esc(otro.id)}"
                    title="Ver ficha de ${esc(otro.nombre)}">
              <div class="avatar" style="background:${rgba(cOtro, 0.12)};color:${cOtro};border-color:${cOtro}" aria-hidden="true">${esc(iniciales(otro.nombre))}</div>
              <div class="flex-grow-1">
                <div class="conn-name">${esc(otro.nombre)}</div>
                <div class="conn-meta">${esc(etiquetaDe(otro.facultad))} · ${esc(otro.lineasInvestigacion.join(', '))}</div>
                ${via ? `
                <div class="path" aria-label="Ruta de conexión">
                  <span class="node">${esc(a.etiqueta)}</span><i class="bi bi-arrow-right"></i>
                  <span class="node">${esc(via.etiqueta)}</span>${extra}<i class="bi bi-arrow-right"></i>
                  <span class="node">${esc(otro.etiqueta)}</span>
                </div>` : ''}
                <div class="d-flex justify-content-between align-items-center mt-2 gap-2" style="font-size:.75rem">
                  <span>Comparten: ${pc.palabrasClaveCompartidas.map((k) => `<span class="chip py-0 px-2 m-0">${esc(etiquetaDe(k))}</span>`).join(' ')}</span>
                  <span class="text-secondary text-nowrap">Afinidad ${pct}%</span>
                </div>
                <div class="affinity" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Afinidad"><div style="width:${pct}%"></div></div>
              </div>
            </button>`;
        }).join('')
      : '<p class="small text-secondary mb-0">No se detectan conexiones potenciales con los datos actuales.</p>';

    const financiamientoHTML = a.coincidenciasFinanciamiento.length
      ? a.coincidenciasFinanciamiento.map((c) => {
          const l = lineasFin.get(c.linea);
          if (!l) return '';
          const nivel = c.nivel.toLowerCase();
          const abierta = /abierta/i.test(l.estado);
          return `
            <div class="fund ${nivel}">
              <div class="fund-top">
                <div>
                  <div class="fund-name">${esc(l.nombre)}</div>
                  <div class="fund-inst">${esc(l.instrumento)} · ${esc(l.organismo)}</div>
                </div>
                <span class="lvl ${nivel}">${esc(c.nivel)}</span>
              </div>
              <div class="fund-foot">
                <span class="kws"><i class="bi bi-check2"></i> ${esc(c.palabrasClaveCoincidentes.map(etiquetaDe).join(', '))}</span>
                <span class="state"><i class="d" style="background:${abierta ? COLOR.proy : COLOR.kw}"></i> ${esc(l.estado)}</span>
              </div>
            </div>`;
        }).join('')
      : '<p class="small text-secondary mb-0">Sin coincidencias con las líneas registradas.</p>';

    cont.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <span class="side-label mb-0">Ficha del académico</span>
        <button class="btn btn-sm btn-light" type="button" id="btnCerrarPerfil" aria-label="Cerrar ficha"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="profile-head">
        <div class="avatar" style="background:${rgba(colorFac, 0.12)};color:${colorFac};border-color:${colorFac}" aria-hidden="true">${esc(iniciales(a.nombre))}</div>
        <div>
          <h2 id="perfilNombre">${esc(a.nombre)}</h2>
          <div class="role mb-2">${esc(a.cargo)}</div>
          <span class="fac-badge" style="background:${rgba(colorFac, 0.12)};color:${colorFac}"><i class="bi bi-building"></i> ${esc(fac?.nombre ?? a.facultad)}</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${a.proyectos.length}</b><span>Proyectos</span></div>
        <div class="stat"><b>${colaboradores.size}</b><span>Colaboradores</span></div>
        <div class="stat"><b>${interfacultad}</b><span>Interfacultad</span></div>
      </div>
      <section class="p-section">
        <h3><i class="bi bi-bullseye"></i> Líneas de investigación</h3>
        ${a.lineasInvestigacion.map((l) => `<div class="line-item"><i class="bi bi-dot fs-4" style="color:${colorFac}"></i> ${esc(l)}</div>`).join('')}
      </section>
      <section class="p-section">
        <h3><i class="bi bi-tags"></i> Palabras clave</h3>
        ${a.palabrasClave.map((k) => `<span class="chip">${esc(etiquetaDe(k))}</span>`).join('')}
      </section>
      <section class="p-section solo-interna">
        <h3><i class="bi bi-share"></i> Potenciales conexiones (2do grado) <span class="tag-int">Interno</span></h3>
        ${conexionesHTML}
      </section>
      <section class="p-section solo-interna">
        <h3><i class="bi bi-cash-coin"></i> Coincidencias de financiamiento estratégico <span class="tag-int">Interno</span></h3>
        ${financiamientoHTML}
      </section>
      <section class="p-section public-note">
        <div class="alert small mb-0">
          <i class="bi bi-info-circle me-1"></i>
          ¿Quieres colaborar con ${a.cargo.startsWith('Profesora') ? 'esta investigadora' : 'este investigador'}? Escribe a la Dirección de Innovación y Transferencia.
        </div>
      </section>`;
      
  } else if (nodo.tipo === 'Proyecto') {
    // --- NUEVA FICHA DE PROYECTO ---
    const p = nodo;
    const miembros = estado.indices.miembrosProyecto.get(p.id) || [];
    
    const integrantesHTML = miembros.map(m => {
      const acad = estado.porId.get(m.academico);
      if (!acad) return '';
      const cAcad = colorFacultad(acad.facultad);
      return `
        <button type="button" class="conn w-100 text-start mb-2" data-academico="${esc(acad.id)}" title="Ver ficha de ${esc(acad.nombre)}">
          <div class="avatar" style="background:${rgba(cAcad, 0.12)};color:${cAcad};border-color:${cAcad}" aria-hidden="true">${esc(iniciales(acad.nombre))}</div>
          <div class="flex-grow-1">
            <div class="conn-name">${esc(acad.nombre)}</div>
            <div class="conn-meta">${esc(m.rol)} · ${esc(etiquetaDe(acad.facultad))}</div>
          </div>
        </button>`;
    }).join('');

    const colorEstado = p.estado.toLowerCase().includes('ejecución') ? COLOR.proy : (p.estado.toLowerCase().includes('finalizado') ? '#475569' : '#b08d3a');

    cont.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <span class="side-label mb-0">Ficha del proyecto</span>
        <button class="btn btn-sm btn-light" type="button" id="btnCerrarPerfil" aria-label="Cerrar ficha"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="profile-head">
        <div class="avatar" style="background:${rgba(COLOR.proy, 0.12)};color:${COLOR.proy};border-color:${COLOR.proy}" aria-hidden="true"><i class="bi bi-folder2-open"></i></div>
        <div>
          <h2 id="perfilNombre">${esc(p.etiqueta)}</h2>
          <div class="role mb-2">${esc(p.instrumento)} · ${esc(p.organismo)}</div>
          <span class="fac-badge" style="background:${rgba(COLOR.proy, 0.12)};color:${COLOR.proy}"><i class="bi bi-calendar3"></i> ${p.anioInicio} – ${p.anioTermino}</span>
        </div>
      </div>
      <section class="p-section">
        <h3 class="mb-2"><i class="bi bi-info-circle"></i> Título y Resumen</h3>
        <p class="small text-body mb-2 fw-semibold" style="line-height: 1.4;">${esc(p.titulo)}</p>
        <p class="small text-secondary mb-0" style="line-height: 1.4;">${esc(p.resumen)}</p>
        <div class="mt-3">
          <span class="state"><i class="d" style="background:${colorEstado}; width:8px; height:8px; border-radius:50%; display:inline-block;"></i> ${esc(p.estado)}</span>
          ${p.visibilidad === 'interna' ? `<span class="badge bg-warning text-dark ms-2" style="font-size:0.6rem; background:#ffc107; padding:2px 4px; border-radius:3px;">INTERNO</span>` : ''}
        </div>
      </section>
      <section class="p-section">
        <h3><i class="bi bi-tags"></i> Palabras clave</h3>
        ${p.palabrasClave.map((k) => `<span class="chip">${esc(etiquetaDe(k))}</span>`).join('')}
      </section>
      <section class="p-section">
        <h3><i class="bi bi-people"></i> Equipo de Investigación</h3>
        ${integrantesHTML || '<p class="small text-secondary mb-0">No hay integrantes registrados.</p>'}
      </section>`;
  }
}

/** Estado vacío de la ficha (al cerrarla). */
function renderPerfilVacio() {
  estado.seleccionado = null;
  document.getElementById('perfil')?.classList.add('is-empty'); // en móvil oculta la hoja
  const cont = document.getElementById('perfilContenido');
  if (!cont) return;
  cont.innerHTML = `
    <div class="text-center text-secondary py-5 px-3">
      <i class="bi bi-person-circle fs-1 d-block mb-2"></i>
      <div class="fw-semibold text-body mb-1">Ningún académico seleccionado</div>
      <div class="small">Haz clic en un nodo de la red o usa el buscador para ver su ficha.</div>
    </div>`;
}

/** Selecciona un académico en la red, abre su ficha y (opcional) centra la vista. */
function seleccionarAcademico(id, { enfocar = false } = {}) {
  if (!estado.porId.has(id)) return;
  estado.red.selectNodes([id]);
  renderPerfil(id);
  document.getElementById('perfil')?.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Dispara la actualización visual (Revela proyectos)
  aplicarFiltros(); 

  if (enfocar) enfocarNodo(id);
}

/* -----------------------------------------------------------------------------
 * 7. Eventos de la interfaz
 * -------------------------------------------------------------------------- */

/** Interruptor Vista Interna / Externa (funciona aunque los datos no carguen). */
function iniciarInterruptorVista() {
  const toggle = document.getElementById('toggleVista');
  const titulo = document.getElementById('vtTitle');
  const sub = document.getElementById('vtSub');
  const aplicar = () => {
    estado.vistaInterna = toggle.checked;
    document.body.classList.toggle('vista-externa', !toggle.checked);
    titulo.textContent = toggle.checked ? 'Vista Interna' : 'Vista Externa';
    sub.textContent = toggle.checked ? 'Dirección de Innovación' : 'Público';
    aplicarFiltros();
  };
  toggle.addEventListener('change', aplicar);
  aplicar();
}

function iniciarFiltros() {
  // Facultades (radio buttons)
  document.querySelectorAll('input[name="filtroFacultad"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      estado.filtroFacultad = radio.value; // "todas" | "fac-ing" | "fac-psi"
      aplicarFiltros();
    });
  });

  // Palabras clave (checkboxes; se combinan con O lógico entre sí)
  const checks = document.querySelectorAll('.kw-list .btn-check');
  checks.forEach((c) => c.addEventListener('change', () => {
    c.checked ? estado.filtroPalabras.add(c.value) : estado.filtroPalabras.delete(c.value);
    aplicarFiltros();
  }));

  document.getElementById('limpiarKw')?.addEventListener('click', (e) => {
    e.preventDefault();
    checks.forEach((c) => (c.checked = false));
    estado.filtroPalabras.clear();
    aplicarFiltros();
  });
}

function iniciarBuscador() {
  const input = document.getElementById('buscador');
  const form = input?.closest('form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = normalizar(input.value);
    if (!q) return;
    const campos = (n) => [n.nombre, n.etiqueta, n.titulo].filter(Boolean).map(normalizar);
    const orden = ['Academico', 'Proyecto', 'PalabraClave', 'Facultad'];
    const hallazgo = orden.flatMap((t) => estado.datos.nodos[t]).find((n) => campos(n).some((c) => c.includes(q)));

    input.classList.toggle('is-invalid', !hallazgo);
    if (!hallazgo) return;
    
    // NUEVO: Abre la ficha también si se busca un Proyecto desde la barra
    if (hallazgo.tipo === 'Academico' || hallazgo.tipo === 'Proyecto') {
      seleccionarAcademico(hallazgo.id, { enfocar: true });
    } else {
      estado.red.selectNodes([hallazgo.id]);
      enfocarNodo(hallazgo.id);
    }
  });
  input.addEventListener('input', () => input.classList.remove('is-invalid'));
}

function iniciarZoom() {
  const animar = { duration: 300, easingFunction: 'easeInOutQuad' };
  const zoom = (factor) => estado.red.moveTo({ scale: estado.red.getScale() * factor, animation: animar });
  document.getElementById('btnZoomIn')?.addEventListener('click', () => zoom(1.25));
  document.getElementById('btnZoomOut')?.addEventListener('click', () => zoom(0.8));
  document.getElementById('btnFit')?.addEventListener('click', () => ajustarVista(estado.red));
}

function iniciarEventosRed() {
  estado.red.on('selectNode', (params) => {
    const id = params.nodes[0];
    const tipo = estado.porId.get(id)?.tipo;
    if (tipo === 'Academico' || tipo === 'Proyecto') {
      seleccionarAcademico(id, { enfocar: window.matchMedia('(max-width: 991.98px)').matches });
    } else {
      estado.seleccionado = id;
      aplicarFiltros(); 
    }
  });

  estado.red.on('deselectNode', () => {
    estado.seleccionado = null;
    renderPerfilVacio();
    aplicarFiltros();
  });

  // --- NUEVO: Eventos para encender/apagar el Spotlight ---
  estado.red.on('hoverNode', (params) => {
    estado.hovered = params.node;
    aplicarFiltros();
  });
  
  estado.red.on('blurNode', () => {
    estado.hovered = null;
    aplicarFiltros();
  });

  document.getElementById('perfil').addEventListener('click', (e) => {
    const conexion = e.target.closest('[data-academico]');
    if (conexion) {
      seleccionarAcademico(conexion.dataset.academico, { enfocar: true });
      return;
    }
    if (e.target.closest('#btnCerrarPerfil')) {
      estado.red.unselectAll();
      estado.seleccionado = null;
      renderPerfilVacio();
      aplicarFiltros(); 
    }
  });
}

/** Mensaje dentro del contenedor del grafo si algo falla. */
function mostrarError(error) {
  console.error(error);
  const ph = document.getElementById('graph-placeholder');
  if (!ph) return;
  const esArchivoLocal = location.protocol === 'file:';
  ph.innerHTML = `
    <i class="bi bi-exclamation-triangle fs-1 text-warning mb-2"></i>
    <div class="ph-title">No se pudo cargar la red</div>
    <div class="ph-sub">${esArchivoLocal
      ? 'Abriste el archivo con doble clic. Los navegadores bloquean <code>fetch()</code> en <code>file://</code>: sirve la carpeta con un servidor local (por ejemplo, Live Server o <code>python -m http.server</code>).'
      : esc(error.message)}</div>`;
}

/* -----------------------------------------------------------------------------
 * 8. Arranque
 * -------------------------------------------------------------------------- */

// --- NUEVO: Animación de trayectorias punteadas (Flujo de información) ---
// --- Animación global de redibujado ---
let dashOffset = 0;
function iniciarAnimaciones(red) {
  red.on("beforeDrawing", (ctx) => {
    ctx.lineDashOffset = dashOffset;
  });
  
  function animar() {
    // Si estamos en vista interna, deslizamos el patrón de la línea punteada
    if (estado.vistaInterna) {
      dashOffset -= 0.5; 
    }
    // Forzamos el redibujado constante para que el "Latido" y la "Respiración" funcionen siempre
    red.redraw();
    requestAnimationFrame(animar);
  }
  animar();
}

async function iniciarApp() {
  iniciarInterruptorVista();

  if (typeof vis === 'undefined') {
    mostrarError(new Error('No se cargó la librería vis-network. Revisa la etiqueta <script> del CDN.'));
    return;
  }

  try {
    const datos = await cargarDatos();
    estado.datos = datos;
    for (const lista of Object.values(datos.nodos)) lista.forEach((n) => estado.porId.set(n.id, n));
    estado.indices = construirIndices(datos);

    estado.nodos = new vis.DataSet(mapearNodos(datos, estado.indices));
    estado.aristas = new vis.DataSet(mapearAristas(datos));

    const contenedor = document.getElementById('network-graph');
    document.getElementById('graph-placeholder')?.remove(); 

    const superpuestos = [...contenedor.children];
    superpuestos.forEach((el) => el.remove());
    estado.red = crearRed(contenedor, estado.nodos, estado.aristas);
    
    // --- NUEVO: Inicia los efectos de canvas y el motor de animación ---
    iniciarEfectosCanvas(estado.red);
    iniciarAnimaciones(estado.red);
    // ------------------------------------------

    superpuestos.forEach((el) => contenedor.appendChild(el));

    iniciarFiltros();
    iniciarBuscador();
    iniciarZoom();
    iniciarEventosRed();
    aplicarFiltros();

    document.fonts.ready.then(() => estado.red.redraw());

    const primero = datos.nodos.Academico[0]?.id;
    if (primero && window.matchMedia('(min-width: 992px)').matches) seleccionarAcademico(primero);
    else renderPerfilVacio();
  } catch (error) {
    mostrarError(error);
  }
}

document.addEventListener('DOMContentLoaded', iniciarApp);