/* Ecosistema I+D+i UAH · Maqueta de portal inspirada en PURE.
 * Datos ficticios separados de la interfaz. Bootstrap 5 + vis-network + JS puro.
 * Rutas locales: #inicio, #perfiles, #proyectos, #perfil/acad-01/red.
 */
'use strict';
const RUTA_DATOS = 'datos_prueba.json';
const COLOR = {ing:'#222222',psi:'#b54215',proy:'#36765d',kw:'#a79b8d',acento:'#f06427'};
const estado = {
  datos:null, porId:new Map(), unidades:new Map(), indices:null,
  vistaInterna:true, seleccionado:null, panel:'general',
  categoria:'todos', consulta:'', facultad:'todas', palabra:'todas', unidad:'todas', orden:'nombre',
  red:null, proyectosRed:true, temasRed:false, potencialesRed:true, circular:false,
};
const cantidad = (n,singular,plural=singular+'s') => n+' '+(n===1?singular:plural);
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizar = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const iniciales = nombre => String(nombre || '').split(/\s+/).slice(0,2).map(x=>x[0] || '').join('').toUpperCase();
const etiquetaDe = id => estado.porId.get(id)?.etiqueta || estado.unidades.get(id)?.nombre || id;
const claseFac = a => a.facultad === 'fac-psi' ? 'psi' : '';
const colorFac = a => a.facultad === 'fac-psi' ? COLOR.psi : COLOR.ing;
const proyectoVisible = p => Boolean(p && (estado.vistaInterna || p.visibilidad !== 'interna'));
const icon = nombre => `<i class="bi bi-${nombre}" aria-hidden="true"></i>`;
function avatar(a,extra='') { return `<span class="avatar ${claseFac(a)} ${extra}" aria-hidden="true">${esc(iniciales(a.nombre))}</span>`; }
function empty(mensaje,titulo='Sin resultados') { return `<div class="empty-state glass">${icon('search')}<h2>${esc(titulo)}</h2><p>${esc(mensaje)}</p></div>`; }
function chips(ids,interactivos=true) { return `<div class="chips">${(ids||[]).map(id=>interactivos?`<button class="chip" type="button" data-palabra="${esc(id)}">${esc(etiquetaDe(id))}</button>`:`<span class="chip">${esc(etiquetaDe(id))}</span>`).join('')}</div>`; }
function status(p) { return `<span class="status-chip ${/formulación/i.test(p.estado)?'formulation':/finalizado/i.test(p.estado)?'finished':''}">${esc(p.estado || 'Sin estado')}</span>`; }
function breadcrumbs(nombre,grupo='Perfiles',ruta='perfiles') { return `<div class="breadcrumb-line"><a href="#inicio" data-nav="inicio">Inicio</a>${icon('chevron-right')}<a href="#${ruta}" data-nav="${ruta}">${esc(grupo)}</a>${icon('chevron-right')}<span>${esc(nombre)}</span></div>`; }
function destruirRed() { if(estado.red) { estado.red.destroy(); estado.red=null; } }

function construirIndices(datos) {
  const idx={miembrosProyecto:new Map(),colaboradores:new Map()};
  for(const e of datos.enlaces || []) {
    if(e.tipo==='INVESTIGA_EN') {
      if(!idx.miembrosProyecto.has(e.target)) idx.miembrosProyecto.set(e.target,[]);
      const list=idx.miembrosProyecto.get(e.target);
      if(!list.some(m=>m.academico===e.source)) list.push({academico:e.source,rol:e.rol});
    }
    if(e.tipo==='COLABORA_CON') for(const [a,b] of [[e.source,e.target],[e.target,e.source]]) {
      if(!idx.colaboradores.has(a)) idx.colaboradores.set(a,new Map());
      idx.colaboradores.get(a).set(b,e);
    }
  }
  return idx;
}
function proyectosDelAcademico(a) {
  const ids=new Set(a.proyectos || []);
  for(const [id,miembros] of estado.indices.miembrosProyecto) if(miembros.some(m=>m.academico===a.id)) ids.add(id);
  return [...ids].map(id=>estado.porId.get(id)).filter(proyectoVisible).sort((a,b)=>(b.anioInicio||0)-(a.anioInicio||0));
}
function proyectosCompartidos(e) { return (e.proyectosCompartidos||[]).map(id=>estado.porId.get(id)).filter(proyectoVisible); }
function colaboracionVisible(e) {
  return estado.vistaInterna || !(e.proyectosCompartidos||[]).length || proyectosCompartidos(e).length>0 || Number(e.publicacionesConjuntas)>0;
}
function colaboradoresDe(a) { return [...(estado.indices.colaboradores.get(a.id)||[])].filter(([id,e])=>estado.porId.has(id)&&colaboracionVisible(e)); }
function coincidenciasDe(a) {
  if(!estado.vistaInterna) return [];
  return (a.coincidenciasFinanciamiento||[]).map(c=>({...c,datos:estado.datos.catalogos?.lineasFinanciamiento?.find(l=>l.id===c.linea)})).filter(c=>c.datos);
}
function renderEstadisticasGlobales() {
  const n=estado.datos.nodos;
  const items=[['people','Perfiles',n.Academico.length,'perfiles'],['buildings','Unidades de investigación',estado.unidades.size,'unidades'],['folder2-open','Proyectos',n.Proyecto.filter(proyectoVisible).length,'proyectos'],['diagram-3','Colaboraciones',new Set(estado.datos.enlaces.filter(e=>e.tipo==='COLABORA_CON'&&colaboracionVisible(e)).map(e=>[e.source,e.target].sort().join('|'))).size,'red'],['tags','Áreas temáticas',n.PalabraClave.length,'temas']];
  if(estado.vistaInterna) items.push(['cash-coin','Líneas de financiamiento',estado.datos.catalogos?.lineasFinanciamiento?.length || 0,'financiamiento']);
  $('estadisticasGlobales').innerHTML=items.map(([i,label,num,ruta])=>`<button type="button" data-nav="${ruta}" aria-label="Explorar ${esc(label)}: ${num}">${icon(i)}<strong>${num}</strong><span>${esc(label)}</span></button>`).join('');
  // CSS conserva tres columnas en móviles, con independencia del modo.
  $('estadisticasGlobales').style.setProperty('--total',items.length);
}
function tarjetaAcademico(a,listado=false) {
  const proyectos=proyectosDelAcademico(a);
  const nombre=`<a href="#perfil/${esc(a.id)}" data-academico="${esc(a.id)}">${esc(a.nombre)}</a>`;
  if(listado) return `<article class="glass result-person">${avatar(a)}<div class="flex-grow-1"><h2>${nombre}</h2><div class="meta">${esc(a.cargo)} · ${esc(etiquetaDe(a.facultad))}</div><p>${esc(a.lineasInvestigacion?.join(' · '))}</p>${chips(a.palabrasClave)}<div class="card-foot"><span>${cantidad(proyectos.length,'proyecto')} · ${colaboradoresDe(a).length} colaboradores</span><a href="#perfil/${esc(a.id)}" data-academico="${esc(a.id)}">Ver perfil ${icon('arrow-right')}</a></div></div></article>`;
  return `<article class="researcher-card glass">${avatar(a)}<h3>${nombre}</h3><p class="meta mb-3">${esc(a.cargo)}<br>${esc(etiquetaDe(a.facultad))}</p>${chips((a.palabrasClave||[]).slice(0,2))}<div class="card-foot"><span>${cantidad(proyectos.length,'proyecto')}</span><a href="#perfil/${esc(a.id)}" data-academico="${esc(a.id)}" aria-label="Ver perfil de ${esc(a.nombre)}">Ver perfil ${icon('arrow-right')}</a></div></article>`;
}
function tarjetaProyecto(p,a=null) {
  const miembros=estado.indices.miembrosProyecto.get(p.id)||[];
  const rol=a?miembros.find(m=>m.academico===a.id)?.rol:null;
  return `<article class="project-card glass"><div class="d-flex gap-2 flex-wrap align-items-center">${status(p)}<span class="meta">${esc(p.codigo || p.id)} · ${esc(p.anioInicio)} — ${esc(p.anioTermino)}</span>${p.visibilidad==='interna'?'<span class="demo-label">'+icon('lock')+' Interno</span>':''}</div><h2><a href="#proyecto/${esc(p.id)}" data-proyecto="${esc(p.id)}">${esc(p.titulo || p.etiqueta)}</a></h2><div class="project-meta"><span>${icon('bank')} ${esc(p.instrumento)} · ${esc(p.organismo)}</span>${rol?`<span>${icon('person')} ${esc(rol)}</span>`:''}</div><p>${esc(p.resumen)}</p>${chips(p.palabrasClave)}<div class="card-foot"><span>${miembros.length} integrantes · ${esc((p.facultades||[]).map(etiquetaDe).join(' / '))}</span><a href="#proyecto/${esc(p.id)}" data-proyecto="${esc(p.id)}">Explorar proyecto ${icon('arrow-right')}</a></div></article>`;
}
function renderInicio() {
  $('inicio').innerHTML=`<div class="intro-grid"><div><div class="eyebrow mb-2">Un ecosistema de conocimiento</div><h2>Investigación con sentido público</h2><p>Conoce a los investigadores de la Universidad Alberto Hurtado, sus áreas de trabajo y los proyectos que conectan conocimiento con desafíos de la sociedad.</p><a href="#perfiles" data-nav="perfiles" class="small">Explorar todos los perfiles ${icon('arrow-right')}</a></div><aside class="intro-note glass"><h3>${icon('diagram-3')} Encuentra nuevas conexiones</h3><p>Descubre redes de colaboración entre facultades y áreas de investigación. Cada perfil conecta personas, proyectos y temas en un mismo lugar.</p><a href="#red" data-nav="red" class="small">Explorar el ecosistema ${icon('arrow-right')}</a></aside></div><div class="section-heading"><h2>Investigadores del ecosistema</h2><a href="#perfiles" data-nav="perfiles">Ver todos los perfiles ${icon('arrow-right')}</a></div><div class="researcher-grid">${[0,2,4,5].map(i=>estado.datos.nodos.Academico[i]).filter(Boolean).map(a=>tarjetaAcademico(a)).join('')}</div><div class="section-heading"><h2>Explora por facultad</h2><a href="#unidades" data-nav="unidades">Unidades de investigación ${icon('arrow-right')}</a></div><div class="faculty-grid">${estado.datos.nodos.Facultad.map(f=>`<article class="faculty-card glass ${f.id==='fac-psi'?'psi':''}"><h3>${esc(f.nombre || f.etiqueta)}</h3><p class="meta mb-2">${estado.datos.nodos.Academico.filter(a=>a.facultad===f.id).length} investigadores · ${estado.datos.nodos.Proyecto.filter(p=>proyectoVisible(p)&&p.facultades?.includes(f.id)).length} proyectos</p><button type="button" class="btn btn-sm btn-outline-secondary" data-facultad="${esc(f.id)}">Explorar facultad ${icon('arrow-right')}</button></article>`).join('')}</div>`;
}

function coincide(n) {
  const fac=n.tipo==='Academico'?n.facultad:n.facultad || n.facultades;
  if(estado.facultad!=='todas'&&!(Array.isArray(fac)?fac.includes(estado.facultad):fac===estado.facultad)) return false;
  if(estado.palabra!=='todas'&&!(n.palabrasClave||[]).includes(estado.palabra)) return false;
  if(estado.unidad!=='todas') {
    if(n.tipo==='Academico'&&n.unidad!==estado.unidad) return false;
    if(n.tipo==='Proyecto'&&!(estado.indices.miembrosProyecto.get(n.id)||[]).some(m=>estado.porId.get(m.academico)?.unidad===estado.unidad)) return false;
    if(n.tipo!=='Academico'&&n.tipo!=='Proyecto'&&n.id!==estado.unidad) return false;
  }
  const texts=[n.nombre,n.titulo,n.etiqueta,n.descripcion,n.resumen,n.biografia,etiquetaDe(n.facultad||''),estado.unidades.get(n.unidad)?.nombre,...(n.lineasInvestigacion||[]),...(n.palabrasClave||[]).map(etiquetaDe)];
  return !estado.consulta || normalizar(texts.filter(Boolean).join(' ')).includes(normalizar(estado.consulta));
}
function ordenar(lista) {
  const reciente=n=>n.tipo==='Academico'?Math.max(0,...proyectosDelAcademico(n).map(p=>p.anioInicio||0)):n.anioInicio||0;
  const nombre=n=>String(n.nombre||n.titulo||n.etiqueta||'');
  return lista.sort((a,b)=>(estado.orden==='reciente'?reciente(b)-reciente(a):0)||nombre(a).localeCompare(nombre(b),'es'));
}
function filtrosHTML() {
  const opciones=(items,seleccion,label)=>`<option value="todas">${label}</option>`+items.map(([v,t])=>`<option value="${esc(v)}" ${v===seleccion?'selected':''}>${esc(t)}</option>`).join('');
  return `<aside class="filters glass"><h2>${icon('sliders2')} Filtrar resultados</h2><div><label for="filtroFacultad">Facultad</label><select class="form-select form-select-sm" id="filtroFacultad">${opciones(estado.datos.nodos.Facultad.map(f=>[f.id,f.etiqueta]),estado.facultad,'Todas las facultades')}</select></div><div><label for="filtroPalabra">Área temática</label><select class="form-select form-select-sm" id="filtroPalabra">${opciones(estado.datos.nodos.PalabraClave.map(k=>[k.id,k.etiqueta]),estado.palabra,'Todas las áreas')}</select></div><div><label for="filtroUnidad">Unidad de investigación</label><select class="form-select form-select-sm" id="filtroUnidad">${opciones([...estado.unidades.values()].map(u=>[u.id,u.nombre]),estado.unidad,'Todas las unidades')}</select></div><div><button type="button" id="limpiarFiltros" class="btn btn-sm btn-outline-secondary w-100 mt-4">Limpiar filtros</button></div><p class="meta mt-3 mb-0">${estado.vistaInterna?'Vista interna: incluye proyectos en formulación.':'Vista pública: solo proyectos disponibles para difusión.'}</p></aside>`;
}
function tarjetaUnidad(u) {
  const miembros=estado.datos.nodos.Academico.filter(a=>a.unidad===u.id);
  return `<article class="unit-card glass"><div class="section-label">${esc(u.tipo)} · ${esc(etiquetaDe(u.facultad))}</div><h2>${esc(u.nombre)}</h2><p class="muted small">${esc(u.descripcion)}</p>${chips(u.palabrasClave)}<div class="card-foot"><span>${miembros.length} investigadores</span><button type="button" class="btn btn-sm btn-outline-secondary" data-unidad="${esc(u.id)}">Ver integrantes y proyectos ${icon('arrow-right')}</button></div></article>`;
}
function tarjetaFondo(l,c=null) {
  return `<article class="unit-card glass"><div class="d-flex justify-content-between gap-3"><span class="section-label">${esc(l.instrumento)}</span>${c?`<span class="status-chip">Coincidencia ${esc(c.nivel)}</span>`:''}</div><h2>${esc(l.nombre)}</h2><p class="meta">${esc(l.organismo)} · ${esc(l.estado)}</p>${chips(c?.palabrasClaveCoincidentes || l.palabrasClave)}<p class="meta mt-3 mb-0">${c?'Coincidencia temática basada en palabras clave del perfil.':'Línea estratégica incluida en el catálogo de demostración.'}</p></article>`;
}
function renderDirectorio() {
  const nombres={todos:'Resultados de búsqueda',perfiles:'Perfiles de investigación',proyectos:'Proyectos de investigación',unidades:'Unidades de investigación',temas:'Áreas temáticas',financiamiento:'Financiamiento estratégico'};
  $('directorio').innerHTML=`<div class="directory-heading"><div><div class="eyebrow mb-2">Explorar el ecosistema</div><h1>${nombres[estado.categoria] || nombres.todos}</h1></div><span class="demo-label">${icon('info-circle')} Datos ficticios</span></div>${estado.consulta?`<p class="muted small">Búsqueda: «${esc(estado.consulta)}»</p>`:''}<div class="directory-layout">${filtrosHTML()}<div><div class="result-toolbar"><span class="small" id="recuentoResultados" role="status"></span><label class="d-flex align-items-center gap-2 meta">Ordenar<select id="ordenResultados" class="form-select form-select-sm"><option value="nombre" ${estado.orden==='nombre'?'selected':''}>Nombre / título</option><option value="reciente" ${estado.orden==='reciente'?'selected':''}>Inicio más reciente</option></select></label></div><div class="result-list" id="listaResultados"></div></div></div>`;
  renderResultados();
}
function renderResultados() {
  const tipo=estado.categoria;
  const a=ordenar(estado.datos.nodos.Academico.filter(coincide));
  const p=ordenar(estado.datos.nodos.Proyecto.filter(x=>proyectoVisible(x)&&coincide(x)));
  const u=ordenar([...estado.unidades.values()].filter(coincide));
  let html='',total=0;
  if(tipo==='todos'||tipo==='perfiles') { total+=a.length; html+=a.map(x=>tarjetaAcademico(x,true)).join(''); }
  if(tipo==='todos'||tipo==='proyectos') { total+=p.length; html+=p.map(x=>tarjetaProyecto(x)).join(''); }
  if(tipo==='todos'||tipo==='unidades') { total+=u.length; html+=u.map(tarjetaUnidad).join(''); }
  if(tipo==='temas') {
    const kws=estado.datos.nodos.PalabraClave.filter(k=>(!estado.consulta||normalizar(k.etiqueta).includes(normalizar(estado.consulta))) && (estado.palabra==='todas'||estado.palabra===k.id));
    const topics=kws.map(k=>({k,as:a.filter(x=>x.palabrasClave.includes(k.id)),ps:p.filter(x=>x.palabrasClave.includes(k.id))})).filter(x=>x.as.length||x.ps.length);
    total=topics.length;
    html=topics.map(({k,as,ps})=>`<article class="unit-card glass"><h2>${esc(k.etiqueta)}</h2><p class="meta">${as.length} investigadores · ${ps.length} proyectos</p><button type="button" data-palabra="${esc(k.id)}" class="btn btn-sm btn-outline-secondary">Explorar área ${icon('arrow-right')}</button></article>`).join('');
  }
  if(tipo==='financiamiento'&&estado.vistaInterna) {
    const funds=estado.datos.catalogos.lineasFinanciamiento.filter(l=>coincideFondo(l)); total=funds.length;
    html='<div class="notice">Estas oportunidades y sus estados son ficticios. Las coincidencias ayudan a explorar temas de trabajo en la maqueta.</div>'+funds.map(l=>tarjetaFondo(l)).join('');
  }
  $('listaResultados').innerHTML=total?html:empty('Prueba otro nombre o área temática, o limpia los filtros.');
  $('recuentoResultados').textContent=total+' resultados';
}
function coincideFondo(l) {
  if(estado.consulta&&!normalizar([l.nombre,l.instrumento,l.organismo,...l.palabrasClave.map(etiquetaDe)].join(' ')).includes(normalizar(estado.consulta))) return false;
  if(estado.palabra!=='todas'&&!l.palabrasClave.includes(estado.palabra)) return false;
  if(estado.facultad!=='todas'||estado.unidad!=='todas') return estado.datos.nodos.Academico.filter(coincide).some(a=>a.coincidenciasFinanciamiento?.some(c=>c.linea===l.id));
  return true;
}

function chartProyectos(proyectos) {
  if(!proyectos.length) return '<p class="meta">Sin proyectos registrados.</p>';
  const min=Math.min(...proyectos.map(p=>p.anioInicio)),max=Math.max(...proyectos.map(p=>p.anioTermino));
  const years=Array.from({length:Math.min(max-min+1,12)},(_,i)=>min+i);
  const counts=years.map(y=>proyectos.filter(p=>p.anioInicio<=y&&p.anioTermino>=y).length);
  const scale=Math.max(...counts,1);
  return `<div class="year-chart" role="img" aria-label="Proyectos vigentes por año: ${esc(years.map((y,i)=>y+': '+counts[i]).join(', '))}">${years.map((y,i)=>`<div class="year-column" title="${y}: ${counts[i]} proyectos"><span class="year-bar" style="height:${Math.max(2,counts[i]/scale*46)}px"></span>${y}</div>`).join('')}</div><p class="meta mt-2 mb-0">Proyectos vigentes por año</p>`;
}
function perfilGeneral(a) {
  return `<div class="panel-grid"><div><section class="content-block"><h2>Perfil personal</h2><h3>Información profesional</h3><p>${esc(a.biografia || 'Sin información profesional registrada.')}</p><h3>Líneas de investigación</h3><ul class="simple-list">${(a.lineasInvestigacion||[]).map(l=>`<li>${esc(l)}</li>`).join('') || '<li>Sin líneas registradas.</li>'}</ul><h3>Investigación aplicada y transferencia</h3><p>${esc(a.experienciaTransferencia || 'Sin experiencia registrada.')}</p><h3>Docencia</h3><ul class="simple-list">${(a.docencia||[]).map(l=>`<li>${esc(l)}</li>`).join('') || '<li>Sin docencia registrada.</li>'}</ul></section><section class="content-block"><h2>Formación académica</h2>${(a.formacion||[]).map(f=>`<div class="timeline-item"><span class="meta">${esc(f.anio)}</span><strong>${esc(f.grado)}</strong><span class="muted">${esc(f.institucion)}</span></div>`).join('') || '<p>Sin formación registrada.</p>'}</section></div><aside><section class="content-block inset-card glass"><div class="section-label">Áreas de especialización</div><h2>Temas de investigación</h2><p>Explora otros perfiles y proyectos relacionados con estas áreas.</p>${chips(a.palabrasClave)}</section><section class="content-block inset-card glass"><div class="section-label">Trayectoria</div><h2>Reconocimientos</h2>${(a.reconocimientos||[]).map(r=>`<h3>${icon('award')} ${esc(r.nombre)}</h3><p>${esc(r.organismo)} · ${esc(r.anio)}</p>`).join('') || '<p>Sin reconocimientos registrados.</p>'}</section><div class="notice">Perfil de demostración. La información profesional y los reconocimientos son ficticios.</div></aside></div>`;
}
function tarjetaColaborador(a,id,e) {
  const otro=estado.porId.get(id); const compartidos=proyectosCompartidos(e);
  const common=(a.palabrasClave||[]).filter(k=>(otro.palabrasClave||[]).includes(k));
  return `<button type="button" class="glass connection-card" data-academico="${esc(id)}" data-abrir-red="true" aria-label="Ver red de ${esc(otro.nombre)}"><span class="connection-head">${avatar(otro)}<span><strong>${esc(otro.nombre)}</strong><span class="meta">${esc(etiquetaDe(otro.facultad))}</span></span></span><p>${cantidad(compartidos.length,'proyecto compartido','proyectos compartidos')} · ${cantidad(Number(e.publicacionesConjuntas)||0,'publicación conjunta','publicaciones conjuntas')}${otro.facultad!==a.facultad?' · Interfacultad':''}</p>${common.length?`<p>Temas comunes: ${esc(common.map(etiquetaDe).join(', '))}</p>`:''}</button>`;
}
function potencialesDe(a) { return estado.vistaInterna?(a.potencialesConexiones||[]).filter(c=>estado.porId.has(c.academico)&&!colaboradoresDe(a).some(([id])=>id===c.academico)):[]; }
function tarjetaPotencial(a,c) {
  const otro=estado.porId.get(c.academico),pct=Math.round(Math.max(0,Math.min(1,Number(c.puntaje)||0))*100);
  return `<article class="glass connection-card"><div class="connection-head">${avatar(otro)}<div><strong><a href="#perfil/${esc(otro.id)}/red" data-academico="${esc(otro.id)}" data-abrir-red="true">${esc(otro.nombre)}</a></strong><span class="meta">${esc(etiquetaDe(otro.facultad))}</span></div></div><div class="d-flex justify-content-between meta mt-3"><span>Afinidad temática</span><strong>${pct}%</strong></div><div class="affinity" role="progressbar" aria-label="Afinidad de demostración con ${esc(otro.nombre)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>${chips(c.palabrasClaveCompartidas,false)}<p>${esc(c.motivo || 'Temas de investigación en común.')}</p>${c.intermediarios?.length?`<p>${icon('signpost-split')} Vía ${esc(c.intermediarios.map(etiquetaDe).join(' / '))}</p>`:''}</article>`;
}
function redHTML(a=null) {
  const col=a?colaboradoresDe(a):[];
  const resumen=a?`${col.length} colaboradores · ${col.filter(([id])=>estado.porId.get(id)?.facultad!==a.facultad).length} de otra facultad`:'Académicos y proyectos conectados por colaboración y participación.';
  return `<div class="section-heading mt-0"><div><h2>${a?'Red de colaboración':'Red del ecosistema'}</h2><p class="meta mb-0 mt-1">${esc(resumen)}</p></div></div><div class="network-layout"><div class="network-frame glass"><div class="network-toolbar"><div><label><input type="checkbox" id="proyectosRed" ${estado.proyectosRed?'checked':''}> Proyectos</label><label><input type="checkbox" id="temasRed" ${estado.temasRed?'checked':''}> Temas</label>${estado.vistaInterna&&a?`<label><input type="checkbox" id="potencialesRed" ${estado.potencialesRed?'checked':''}> Potenciales</label>`:''}<label><input type="checkbox" id="circularRed" ${estado.circular?'checked':''}> Diseño circular</label></div><div class="network-controls"><button type="button" data-zoom="in" aria-label="Acercar red">${icon('plus')}</button><button type="button" data-zoom="out" aria-label="Alejar red">${icon('dash')}</button><button type="button" data-zoom="fit" aria-label="Ajustar red">${icon('arrows-fullscreen')}</button></div></div><div id="network-graph" class="network-canvas" role="region" aria-label="Red interactiva; también puedes explorar las personas en el listado de colaboradores" tabindex="0"></div><div class="network-legend"><span><i class="dot"></i> Ingeniería</span><span><i class="dot psi"></i> Psicología</span><span><i class="dot project"></i> Proyecto</span>${estado.temasRed?'<span>'+icon('tag')+' Tema</span>':''}${estado.vistaInterna&&a?'<span><i class="dash"></i> Conexión potencial</span>':''}</div><p class="meta mt-3 mb-0">Selecciona una persona o un proyecto para abrir su perfil. Selecciona una línea para ver su relación.</p><div id="networkDetail" class="meta mt-2" aria-live="polite"></div></div><aside><div class="section-label">${a?'Colaboradores directos':'Investigadores'}</div><div class="connection-list">${a?(col.sort(([,x],[,y])=>(y.peso||0)-(x.peso||0)).map(([id,e])=>tarjetaColaborador(a,id,e)).join('')||empty('Este perfil aún no tiene colaboradores registrados.','Sin colaboradores')):estado.datos.nodos.Academico.map(b=>`<button type="button" class="glass connection-card" data-academico="${esc(b.id)}" data-abrir-red="true"><span class="connection-head">${avatar(b)}<span><strong>${esc(b.nombre)}</strong><span class="meta">${esc(etiquetaDe(b.facultad))}</span></span></span></button>`).join('')}</div></aside></div>${a&&estado.vistaInterna?`<section class="content-block mt-5"><div class="section-heading"><h2>Conexiones potenciales</h2><span class="demo-label">${icon('lock')} Vista interna</span></div><p class="muted small">Afinidad temática de demostración, basada en temas e intermediarios registrados. Estas sugerencias no representan colaboraciones confirmadas.</p><div class="potential-grid">${potencialesDe(a).map(c=>tarjetaPotencial(a,c)).join('') || empty('No hay sugerencias adicionales con los datos actuales.','Sin conexiones potenciales')}</div></section>`:''}`;
}
function renderPerfil(id,panel='general') {
  const a=estado.porId.get(id);
  if(!a||a.tipo!=='Academico') { $('perfilContenido').innerHTML=empty('El académico solicitado no está disponible.','Perfil no encontrado'); return; }
  estado.seleccionado=id; estado.panel=panel;
  const proyectos=proyectosDelAcademico(a),col=colaboradoresDe(a),funds=coincidenciasDe(a),u=estado.unidades.get(a.unidad);
  const tabs=[['general','person','Información general'],['red','diagram-3','Red ('+col.length+')'],['proyectos','folder2-open','Proyectos ('+proyectos.length+')']];
  if(estado.vistaInterna) tabs.push(['financiamiento','cash-coin','Financiamiento ('+funds.length+')']);
  if(!tabs.some(t=>t[0]===panel)) panel=estado.panel='general';
  $('perfilContenido').innerHTML=`${breadcrumbs(a.nombre)}<div class="profile-identity"><div>${avatar(a)}<span class="demo-label mt-3">Perfil ficticio</span></div><div><h1 id="perfilNombre">${esc(a.nombre)}</h1><p class="muted mb-1">${esc(a.cargo)}</p><div class="affiliation"><a href="#perfiles" data-facultad="${esc(a.facultad)}">${esc(estado.porId.get(a.facultad)?.nombre || etiquetaDe(a.facultad))}</a><span class="muted">${esc(a.departamento || '')}</span>${u?`<a href="#todos" data-unidad="${esc(u.id)}">${esc(u.nombre)}</a>`:''}</div><span class="demo-label">${icon('people')} ${esc(a.disponibilidadColaboracion || 'Explora sus áreas de investigación')}</span></div><aside class="profile-metrics"><div class="section-label">Actividad del perfil</div><div class="metric-row"><div><strong>${proyectos.length}</strong><span>Proyectos</span></div><div><strong>${col.length}</strong><span>Colaboradores</span></div><div><strong>${a.palabrasClave?.length || 0}</strong><span>Temas</span></div></div>${chartProyectos(proyectos)}</aside></div><div class="profile-tabs" role="tablist" aria-label="Secciones del perfil">${tabs.map(([id,i,t])=>`<button type="button" role="tab" id="tab-${id}" data-perfil-tab="${id}" aria-controls="panelPerfil" aria-selected="${id===panel}" tabindex="${id===panel?0:-1}">${icon(i)}${esc(t)}</button>`).join('')}</div><div id="panelPerfil" role="tabpanel" aria-labelledby="tab-${panel}" tabindex="0">${panel==='general'?perfilGeneral(a):panel==='red'?redHTML(a):panel==='proyectos'?`<section class="content-block"><h2>Proyectos de investigación</h2><div class="project-summary">${['En ejecución','En formulación','Finalizado'].map(s=>`<span class="status-chip">${proyectos.filter(p=>p.estado===s).length} ${esc(s.toLowerCase())}</span>`).join('')}</div><div class="result-list">${proyectos.map(p=>tarjetaProyecto(p,a)).join('') || empty('No hay proyectos disponibles en esta vista.','Sin proyectos')}</div></section>`:`<section class="content-block"><h2>Coincidencias de financiamiento</h2><p class="muted small">Líneas estratégicas vinculadas con las palabras clave del perfil. Los estados de convocatoria son ficticios.</p><div class="fund-grid">${funds.map(c=>tarjetaFondo(c.datos,c)).join('') || empty('No se registran coincidencias con el catálogo actual.','Sin coincidencias')}</div></section>`}</div>`;
  document.title=a.nombre+' · Ecosistema I+D+i UAH';
  if(panel==='red') crearRed(a);
}

function renderProyecto(id) {
  const p=estado.porId.get(id);
  if(!p||p.tipo!=='Proyecto'||!proyectoVisible(p)) { $('perfilContenido').innerHTML=empty('El proyecto no está disponible en esta vista.','Proyecto no disponible'); return; }
  estado.seleccionado=id;
  const miembros=estado.indices.miembrosProyecto.get(id)||[];
  $('perfilContenido').innerHTML=`${breadcrumbs(p.etiqueta,'Proyectos','proyectos')}<div class="profile-identity"><div><div class="avatar" aria-hidden="true">${icon('folder2-open')}</div><span class="demo-label mt-3">Proyecto ficticio</span></div><div><div class="section-label">${esc(p.codigo)}</div><h1 id="perfilNombre">${esc(p.titulo)}</h1><p class="muted mb-2">${esc(p.instrumento)} · ${esc(p.organismo)}</p>${status(p)}${p.visibilidad==='interna'?'<span class="demo-label ms-2">'+icon('lock')+' Proyecto interno</span>':''}<p class="meta mt-3 mb-0">${icon('calendar3')} ${esc(p.anioInicio)} — ${esc(p.anioTermino)}</p></div><aside class="profile-metrics"><div class="section-label">Equipo y alcance</div><div class="metric-row"><div><strong>${miembros.length}</strong><span>Investigadores</span></div><div><strong>${p.facultades?.length || 0}</strong><span>Facultades</span></div></div><p class="meta">${esc(p.territorio || '')}</p>${estado.vistaInterna&&p.presupuestoCLP?`<div class="section-label mt-3">Presupuesto de demostración</div><strong>${Number(p.presupuestoCLP).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})}</strong>`:''}</aside></div><div class="profile-tabs"><span class="py-3 small">${icon('folder2-open')} Información del proyecto</span></div><div class="panel-grid"><div><section class="content-block"><h2>Resumen del proyecto</h2><p>${esc(p.resumen)}</p><h3>Objetivos</h3><ul class="simple-list">${(p.objetivos||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Resultados esperados</h3><ul class="simple-list">${(p.resultadosEsperados||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section class="content-block"><h2>Equipo de investigación</h2><div class="connection-list">${miembros.map(m=>{const a=estado.porId.get(m.academico); return a?`<button type="button" class="connection-card glass" data-academico="${esc(a.id)}"><span class="connection-head">${avatar(a)}<span><strong>${esc(a.nombre)}</strong><span class="meta">${esc(m.rol)} · ${esc(etiquetaDe(a.facultad))}</span></span></span></button>`:'';}).join('') || '<p class="muted">Sin equipo registrado.</p>'}</div></section></div><aside><section class="content-block inset-card glass"><h2>Áreas de investigación</h2>${chips(p.palabrasClave)}</section><section class="content-block inset-card glass"><h2>Hitos del proyecto</h2>${(p.hitos||[]).map(h=>`<div class="timeline-item"><span class="meta">${esc(h.anio)}</span><strong>${esc(h.titulo)}</strong></div>`).join('')}</section><section class="content-block inset-card glass"><h2>Vinculación territorial</h2>${(p.socios||[]).map(s=>`<h3>${esc(s.nombre)}</h3><p>${esc(s.tipo)} · ${esc(s.pais)}<br>Socio ficticio para la maqueta</p>`).join('')}</section></aside></div>`;
  document.title=p.etiqueta+' · Ecosistema I+D+i UAH';
}

function datosRed(a=null) {
  const col=a?colaboradoresDe(a):[];
  const potentials=a&&estado.potencialesRed?potencialesDe(a):[];
  const selected=new Set(a?[a.id,...col.map(([id])=>id),...potentials.map(c=>c.academico)]:estado.datos.nodos.Academico.map(x=>x.id));
  const projects=estado.proyectosRed?(a?proyectosDelAcademico(a):estado.datos.nodos.Proyecto.filter(proyectoVisible)):[];
  // Los participantes de cada proyecto acompañan al nodo del proyecto.
  projects.forEach(p=>(estado.indices.miembrosProyecto.get(p.id)||[]).forEach(m=>selected.add(m.academico)));
  const academics=[...selected].map(id=>estado.porId.get(id)).filter(n=>n?.tipo==='Academico');
  const nodes=academics.map((n,i)=>({id:n.id,label:n.etiqueta || n.nombre,color:{background:colorFac(n),border:n.id===a?.id?COLOR.acento:'#fff',highlight:{background:colorFac(n),border:COLOR.acento}},borderWidth:n.id===a?.id?4:2,size:n.id===a?.id?25:17,shape:'dot',font:{size:12,color:'#36322d'},x:n.id===a?.id?0:Math.cos(i/academics.length*Math.PI*2)*220,y:n.id===a?.id?0:Math.sin(i/academics.length*Math.PI*2)*220,title:esc(n.nombre)+'<br>'+esc(etiquetaDe(n.facultad))}));
  nodes.push(...projects.map((p,i)=>({id:p.id,label:p.etiqueta,shape:'square',size:12,color:{background:COLOR.proy,border:'#fff'},borderWidth:2,font:{size:11,color:'#285740'},x:Math.cos(i/projects.length*Math.PI*2+.4)*370,y:Math.sin(i/projects.length*Math.PI*2+.4)*370,title:esc(p.titulo)})));
  const ids=new Set(nodes.map(n=>n.id));
  const edges=[]; const pairs=new Set();
  for(const e of estado.datos.enlaces) {
    if(e.tipo==='COLABORA_CON'&&ids.has(e.source)&&ids.has(e.target)&&colaboracionVisible(e)) {
      const key=[e.source,e.target].sort().join('|'); if(pairs.has(key)) continue; pairs.add(key);
      edges.push({id:e.id,from:e.source,to:e.target,width:1+Math.min(3,proyectosCompartidos(e).length),color:'#b8aea3',title:esc(proyectosCompartidos(e).length+' proyectos compartidos · '+(e.publicacionesConjuntas||0)+' publicaciones conjuntas')});
    }
    if(e.tipo==='INVESTIGA_EN'&&ids.has(e.source)&&ids.has(e.target)) edges.push({id:e.id,from:e.source,to:e.target,color:'#82ad98',width:1,title:esc(e.rol || 'Participación en proyecto')});
  }
  if(a) for(const c of potentials) edges.push({id:'pot-'+c.academico,from:a.id,to:c.academico,dashes:[6,5],width:1.5,color:COLOR.acento,title:esc('Conexión potencial · '+Math.round(c.puntaje*100)+'% de afinidad de demostración')});
  if(estado.temasRed) {
    const kws=new Set(academics.flatMap(n=>n.palabrasClave||[]));
    [...kws].forEach((id,i)=>nodes.push({id,label:etiquetaDe(id),shape:'diamond',size:9,color:COLOR.kw,font:{size:10,color:'#65635f'},x:Math.cos(i/kws.size*Math.PI*2)*470,y:Math.sin(i/kws.size*Math.PI*2)*470}));
    for(const n of academics) for(const id of n.palabrasClave||[]) edges.push({id:'kw-'+n.id+'-'+id,from:n.id,to:id,color:'#dfd8cf',width:1});
  }
  return {nodes,edges};
}
function crearRed(a=null) {
  destruirRed(); const canvas=$('network-graph'); if(!canvas) return;
  if(typeof vis==='undefined') { canvas.innerHTML=empty('No se pudo cargar vis-network. Puedes explorar los perfiles en el listado de la derecha.','Red no disponible'); return; }
  const d=datosRed(a);
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const red=estado.red=new vis.Network(canvas,{nodes:new vis.DataSet(d.nodes),edges:new vis.DataSet(d.edges)},{layout:{randomSeed:21,improvedLayout:false},interaction:{hover:true,tooltipDelay:150,keyboard:{enabled:true,bindToWindow:false},navigationButtons:false},nodes:{font:{face:'Rubik, sans-serif'},shadow:false},edges:{smooth:{enabled:true,type:'continuous',roundness:.1}},physics:{enabled:!estado.circular&&!reduce,solver:'forceAtlas2Based',stabilization:{enabled:true,iterations:180},forceAtlas2Based:{gravitationalConstant:-60,centralGravity:.012,springLength:140,springConstant:.06,damping:.7}},autoResize:true});
  red.on('stabilizationIterationsDone',()=>{red.setOptions({physics:false});red.fit({animation:false});});
  red.fit({animation:false});
  red.on('click',params=>{
    const id=params.nodes[0],n=estado.porId.get(id);
    if(n?.tipo==='Academico') navegar('perfil/'+id+'/red');
    else if(n?.tipo==='Proyecto'&&proyectoVisible(n)) navegar('proyecto/'+id);
    else if(n?.tipo==='PalabraClave') explorarPalabra(id);
    else if(params.edges.length) {
      const e=estado.datos.enlaces.find(e=>e.id===params.edges[0]);
      if(e?.tipo==='COLABORA_CON') $('networkDetail').innerHTML=`<strong>${esc(etiquetaDe(e.source))} ↔ ${esc(etiquetaDe(e.target))}</strong><br>${proyectosCompartidos(e).map(p=>`<a href="#proyecto/${esc(p.id)}" data-proyecto="${esc(p.id)}">${esc(p.etiqueta)}</a>`).join(' · ') || 'Sin proyectos compartidos disponibles en esta vista.'} · ${cantidad(Number(e.publicacionesConjuntas)||0,'publicación conjunta','publicaciones conjuntas')}`;
      else if(e) $('networkDetail').textContent=etiquetaDe(e.source)+' → '+etiquetaDe(e.target)+': '+(e.rol || 'Relación temática');
      else $('networkDetail').textContent='Conexión potencial: revisa su afinidad temática en las tarjetas inferiores.';
    }
  });
  document.fonts?.ready.then(()=>{if(estado.red===red) red.redraw();});
}

function navegar(ruta) { if(location.hash==='#'+ruta) renderRuta(true); else location.hash=ruta; }
function limpiarEstadoFiltros() { estado.consulta=''; estado.facultad='todas'; estado.palabra='todas'; estado.unidad='todas'; $('buscador').value=''; }
function explorarPalabra(id) { limpiarEstadoFiltros(); estado.palabra=id; navegar('todos'); }
function renderRuta(scroll=false) {
  if(!estado.datos) return;
  destruirRed(); estado.seleccionado=null;
  const [ruta='inicio',id,panel='general']=location.hash.slice(1).split('/');
  const home=!ruta||ruta==='inicio',isProfile=ruta==='perfil'||ruta==='proyecto',isNet=ruta==='red';
  const category=['perfiles','proyectos','unidades','temas','financiamiento','todos'].includes(ruta)?ruta:'todos';
  document.body.classList.toggle('compact',!home);
  $('resumenGlobal').hidden=!home;
  $('inicio').hidden=!home; $('perfil').hidden=!isProfile; $('redEcosistema').hidden=!isNet; $('directorio').hidden=home||isProfile||isNet;
  document.querySelectorAll('.solo-interna').forEach(el=>el.hidden=!estado.vistaInterna);
  const nav=ruta==='perfil'?'perfiles':ruta==='proyecto'?'proyectos':ruta||'inicio';
  document.querySelectorAll('[data-nav]').forEach(el=>{if(el.closest('.main-nav')) { if(el.dataset.nav===nav) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); }});
  $('buscador').value=estado.consulta;
  document.title='Ecosistema I+D+i UAH';
  if(home) renderInicio();
  else if(ruta==='perfil') renderPerfil(id,panel);
  else if(ruta==='proyecto') renderProyecto(id);
  else if(isNet) { $('redEcosistema').innerHTML=`<div class="directory-heading"><div><div class="eyebrow mb-2">Personas · Proyectos · Temas</div><h1>Explora la red de investigación</h1></div><span class="demo-label">${icon('info-circle')} Datos ficticios</span></div>${redHTML()}`; crearRed(); }
  else { estado.categoria=category; renderDirectorio(); }
  renderEstadisticasGlobales();
  if(scroll) window.scrollTo({top:0,behavior:'instant'});
}
function cambiarPanelPerfil(panel,enfocar=false) {
  const a=estado.seleccionado;
  if(!a||estado.porId.get(a)?.tipo!=='Academico') return;
  // Conserva el scroll al alternar secciones, y permite volver con el historial.
  const pos=window.scrollY;
  history.pushState(null,'','#perfil/'+a+'/'+panel); destruirRed(); renderPerfil(a,panel);
  window.scrollTo({top:pos,behavior:'instant'});
  if(enfocar) document.querySelector('[data-perfil-tab="'+panel+'"]')?.focus();
}
function eventos() {
  $('formBuscador').addEventListener('submit',e=>{e.preventDefault(); estado.consulta=$('buscador').value.trim(); estado.facultad='todas';estado.palabra='todas';estado.unidad='todas'; navegar('todos');});
  $('toggleVista').addEventListener('change',e=>{
    estado.vistaInterna=e.target.checked; $('vistaLabel').textContent=estado.vistaInterna?'Vista interna':'Vista pública';
    const route=location.hash.slice(1).split('/');
    if(!estado.vistaInterna&&(route[0]==='financiamiento'||(route[0]==='proyecto'&&!proyectoVisible(estado.porId.get(route[1]))))) { navegar(route[0]==='proyecto'?'proyectos':'inicio'); return; }
    renderRuta();
  });
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,a'); if(!target) return;
    if(target.classList.contains('skip-link')) {e.preventDefault();$('contenidoPrincipal').focus();return;}
    if(target.dataset.nav) { e.preventDefault(); limpiarEstadoFiltros(); navegar(target.dataset.nav); }
    else if(target.dataset.academico) {e.preventDefault();navegar('perfil/'+target.dataset.academico+(target.dataset.abrirRed?'/red':''));}
    else if(target.dataset.proyecto) {e.preventDefault();if(proyectoVisible(estado.porId.get(target.dataset.proyecto))) navegar('proyecto/'+target.dataset.proyecto);}
    else if(target.dataset.perfilTab) {e.preventDefault(); cambiarPanelPerfil(target.dataset.perfilTab);}
    else if(target.dataset.facultad) {e.preventDefault();limpiarEstadoFiltros();estado.facultad=target.dataset.facultad;navegar('todos');}
    else if(target.dataset.unidad) {e.preventDefault();limpiarEstadoFiltros();estado.unidad=target.dataset.unidad;navegar('todos');}
    else if(target.dataset.palabra) {e.preventDefault();explorarPalabra(target.dataset.palabra);}
    else if(target.id==='limpiarFiltros') {limpiarEstadoFiltros();renderDirectorio();}
    else if(target.dataset.zoom&&estado.red) {
      if(target.dataset.zoom==='fit') estado.red.fit({animation:false});
      else estado.red.moveTo({scale:Math.max(.15,Math.min(4,estado.red.getScale()*(target.dataset.zoom==='in'?1.25:.8))),animation:false});
    }
  });
  document.addEventListener('change',e=>{
    const fields={filtroFacultad:'facultad',filtroPalabra:'palabra',filtroUnidad:'unidad',ordenResultados:'orden'};
    if(fields[e.target.id]) {estado[fields[e.target.id]]=e.target.value; renderResultados();}
    const graphFields={proyectosRed:'proyectosRed',temasRed:'temasRed',potencialesRed:'potencialesRed',circularRed:'circular'};
    if(graphFields[e.target.id]) {estado[graphFields[e.target.id]]=e.target.checked;crearRed(estado.porId.get(estado.seleccionado));}
  });
  document.addEventListener('keydown',e=>{
    if(!e.target.matches('[data-perfil-tab]')) return;
    const tabs=[...document.querySelectorAll('[data-perfil-tab]')],i=tabs.indexOf(e.target);let next;
    if(e.key==='ArrowRight') next=(i+1)%tabs.length;
    if(e.key==='ArrowLeft') next=(i+tabs.length-1)%tabs.length;
    if(e.key==='Home') next=0;
    if(e.key==='End') next=tabs.length-1;
    if(next!==undefined) {e.preventDefault();cambiarPanelPerfil(tabs[next].dataset.perfilTab,true);}
  });
  window.addEventListener('hashchange',()=>renderRuta(true));
  // pushState de las pestañas también debe responder al botón Atrás.
  window.addEventListener('popstate',()=>renderRuta());
}
async function iniciarApp() {
  try {
    const respuesta=await fetch(RUTA_DATOS,{cache:'no-store'});
    if(!respuesta.ok) throw new Error('No se pudieron cargar los datos (HTTP '+respuesta.status+').');
    const datos=await respuesta.json();
    if(!datos.nodos?.Academico||!datos.nodos?.Proyecto||!datos.nodos?.Facultad||!datos.nodos?.PalabraClave||!Array.isArray(datos.enlaces)) throw new Error('El archivo de datos no tiene la estructura esperada.');
    estado.datos=datos;
    Object.values(datos.nodos).forEach(list=>list.forEach(n=>estado.porId.set(n.id,n)));
    (datos.catalogos?.unidades||[]).forEach(u=>estado.unidades.set(u.id,u));
    estado.indices=construirIndices(datos);
    estado.vistaInterna=$('toggleVista').checked;
    $('vistaLabel').textContent=estado.vistaInterna?'Vista interna':'Vista pública';
    $('fechaDatos').textContent=datos.metadata?.fechaGeneracion || 'No registrada';
    $('mensajeCarga').hidden=true;
    eventos(); renderRuta();
  } catch(error) {
    console.error(error);
    $('mensajeCarga').innerHTML=empty(location.protocol==='file:'?'Abre la carpeta con un servidor local (Live Server o un servidor HTTP) para poder cargar el JSON.':error.message,'No se pudo cargar el portal');
  }
}
document.addEventListener('DOMContentLoaded',iniciarApp);
