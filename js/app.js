(function () {
  const LIGAS = window.LIGAS;
  const $ = (s) => document.querySelector(s);

  const estado = {
    liga: leerLigaInicial(),
    dia: 1,             // índice en la tira de fechas (0 = ayer, 1 = hoy)
    alcance: 'todas',   // 'todas' | 'liga'
    grupo: 0,
    eventos: new Map(), // ligaId -> eventos[]
    logos: new Map(),   // ligaId -> url del logo
    cargando: new Set(),
    fallidas: new Set(),
    tabla: null,
    filtro: ''
  };

  /* ---------- utilidades ---------- */

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ligaPorId = (id) => LIGAS.find((l) => l.id === id) || LIGAS[0];

  function leerLigaInicial() {
    const h = decodeURIComponent(location.hash.replace('#', ''));
    return window.LIGAS.some((l) => l.id === h) ? h : window.LIGAS[0].id;
  }

  const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const claveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const HOY = inicioDia(new Date());
  const DIAS = Array.from({ length: window.DIAS_ADELANTE + 2 }, (_, i) => {
    const d = new Date(HOY);
    d.setDate(d.getDate() + i - 1);
    return d;
  });

  const fmtHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
  const fmtDiaSemana = new Intl.DateTimeFormat('es-CO', { weekday: 'short' });
  const fmtFechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtFechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function escudo(url, nombre, clase = 'escudo') {
    const inicial = esc((nombre || '?').trim().charAt(0).toUpperCase());
    const vacio = `${clase} escudo--vacio`;
    if (url) return `<img class="${clase}" src="${esc(url)}" alt="" loading="lazy" width="28" height="28" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${vacio}',textContent:'${inicial}'}))">`;
    return `<span class="${vacio}" aria-hidden="true">${inicial}</span>`;
  }

  function horaHTML(fecha) {
    const partes = fmtHora.formatToParts(fecha);
    const sufijo = partes.filter((p) => p.type === 'dayPeriod').map((p) => p.value).join('');
    const hora = partes.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    return `<span class="marcador__hora">${esc(hora)}${sufijo ? `<small>${esc(sufijo)}</small>` : ''}</span>`;
  }

  /* ---------- tira de ligas ---------- */

  function pintarLigas() {
    $('#ligas').innerHTML = LIGAS.map((l) => {
      const activa = l.id === estado.liga;
      const logo = estado.logos.get(l.id);
      return `<li role="presentation">
        <button type="button" role="tab" class="liga${activa ? ' liga--activa' : ''}" data-liga="${l.id}"
          aria-selected="${activa}" style="--liga:${l.color}">
          ${logo ? `<img src="${esc(logo)}" alt="" width="22" height="22">` : `<span class="liga__punto"></span>`}
          <span class="liga__nombre">${esc(l.corto)}</span>
        </button></li>`;
    }).join('');
  }

  $('#ligas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-liga]');
    if (!b || b.dataset.liga === estado.liga) return;
    seleccionarLiga(b.dataset.liga);
  });

  function seleccionarLiga(id) {
    estado.liga = id;
    estado.grupo = 0;
    history.replaceState(null, '', '#' + id);
    pintarLigas();
    $(`[data-liga="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('#alcance-liga').textContent = 'Solo ' + ligaPorId(id).corto;
    pintarPartidos();
    cargarTabla();
  }

  /* ---------- tira de fechas ---------- */

  function eventosDelDia(i, soloLiga) {
    const clave = claveDia(DIAS[i]);
    const out = [];
    for (const [liga, evs] of estado.eventos) {
      if (soloLiga && liga !== estado.liga) continue;
      for (const ev of evs) if (claveDia(ev.fecha) === clave) out.push(ev);
    }
    return out;
  }

  function etiquetaDia(i) {
    if (i === 0) return 'Ayer';
    if (i === 1) return 'Hoy';
    if (i === 2) return 'Mañana';
    return capital(fmtDiaSemana.format(DIAS[i]).replace('.', ''));
  }

  function pintarFechas() {
    const soloLiga = estado.alcance === 'liga';
    $('#fechas').innerHTML = DIAS.map((d, i) => {
      const n = eventosDelDia(i, soloLiga).length;
      const vivo = eventosDelDia(i, soloLiga).some((e) => e.estado === 'in');
      return `<button type="button" role="tab" class="fecha${i === estado.dia ? ' fecha--activa' : ''}${n ? '' : ' fecha--vacia'}"
        data-dia="${i}" aria-selected="${i === estado.dia}" aria-label="${esc(capital(fmtFechaLarga.format(d)))}, ${n} partidos">
        <span class="fecha__dia">${etiquetaDia(i)}</span>
        <span class="fecha__num">${d.getDate()}</span>
        <span class="fecha__cuenta">${vivo ? '<i class="vivo-punto"></i>' : ''}${n || '–'}</span>
      </button>`;
    }).join('');
  }

  $('#fechas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dia]');
    if (!b) return;
    estado.dia = Number(b.dataset.dia);
    pintarPartidos();
  });

  document.querySelectorAll('.alcance__btn').forEach((b) =>
    b.addEventListener('click', () => {
      estado.alcance = b.dataset.alcance;
      document.querySelectorAll('.alcance__btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pintarPartidos();
    })
  );

  /* ---------- partidos ---------- */

  function marcador(ev) {
    if (ev.estado === 'pre') {
      if (/POSTPONED|CANCELED|SUSPENDED/.test(ev.nombreEstado)) return `<span class="marcador__estado">Aplazado</span>`;
      return horaHTML(ev.fecha);
    }
    const gl = ev.local.goles ?? '–';
    const gv = ev.visita.goles ?? '–';
    return `<span class="marcador__goles"><b>${gl}</b><span>-</span><b>${gv}</b></span>`;
  }

  function estadoPartido(ev) {
    if (ev.estado === 'in') {
      const txt = /HALFTIME/.test(ev.nombreEstado) || ev.detalle === 'HT' ? 'Descanso' : ev.reloj || ev.detalle || 'En juego';
      return `<span class="chip chip--vivo"><i class="vivo-punto"></i>${esc(txt)}</span>`;
    }
    if (ev.estado === 'post') {
      if (/POSTPONED|CANCELED|ABANDONED/.test(ev.nombreEstado)) return `<span class="chip">Aplazado</span>`;
      const extra = /AET|ET/.test(ev.detalle) ? ' (pró.)' : /PEN|Pens/i.test(ev.detalle) ? ' (pen.)' : '';
      return `<span class="chip chip--final">Final${extra}</span>`;
    }
    return '';
  }

  function filaPartido(ev) {
    const cl = (lado, otro) =>
      ev.estado === 'post' && lado.goles != null && otro.goles != null && lado.goles < otro.goles ? ' equipo--perdio' : '';
    return `<li class="partido${ev.estado === 'in' ? ' partido--vivo' : ''}">
      <div class="partido__estado">${estadoPartido(ev)}</div>
      <div class="equipo equipo--local${cl(ev.local, ev.visita)}">
        <span class="equipo__nombre" title="${esc(ev.local.nombreLargo)}">${esc(ev.local.nombre)}</span>
        ${escudo(ev.local.logo, ev.local.nombre)}
      </div>
      <div class="marcador">${marcador(ev)}</div>
      <div class="equipo equipo--visita${cl(ev.visita, ev.local)}">
        ${escudo(ev.visita.logo, ev.visita.nombre)}
        <span class="equipo__nombre" title="${esc(ev.visita.nombreLargo)}">${esc(ev.visita.nombre)}</span>
      </div>
      ${ev.sede ? `<div class="partido__sede">${esc(ev.sede)}</div>` : ''}
    </li>`;
  }

  function pintarPartidos() {
    pintarFechas();
    const soloLiga = estado.alcance === 'liga';
    const evs = eventosDelDia(estado.dia, soloLiga);
    const cont = $('#partidos');

    const orden = [estado.liga, ...LIGAS.map((l) => l.id).filter((id) => id !== estado.liga)];
    const porLiga = orden
      .map((id) => ({ id, evs: evs.filter((e) => e.liga === id).sort((a, b) => a.fecha - b.fecha) }))
      .filter((g) => g.evs.length);

    const pendientes = soloLiga ? estado.cargando.has(estado.liga) : estado.cargando.size > 0;

    if (!porLiga.length) {
      const fecha = capital(fmtFechaLarga.format(DIAS[estado.dia]));
      if (pendientes) {
        cont.innerHTML = `<div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando partidos…</p></div>`;
      } else if (soloLiga && estado.fallidas.has(estado.liga)) {
        cont.innerHTML = errorHTML('No se pudo cargar el calendario de esta liga.', 'partidos');
      } else {
        cont.innerHTML = `<div class="vacio"><p><strong>Sin partidos el ${esc(fecha.toLowerCase())}.</strong></p>
          <p>${soloLiga ? 'Prueba con <button type="button" class="enlace" data-accion="todas">todas las ligas</button> o elige otro día.' : 'Elige otro día en la tira de fechas.'}</p></div>`;
      }
    } else {
      cont.innerHTML = porLiga.map(({ id, evs }) => {
        const l = ligaPorId(id);
        const logo = estado.logos.get(id);
        return `<article class="bloque-liga" style="--liga:${l.color}">
          <h3 class="bloque-liga__titulo">
            <button type="button" data-ir-liga="${id}">
              ${logo ? `<img src="${esc(logo)}" alt="" width="20" height="20">` : '<span class="liga__punto"></span>'}
              ${esc(l.nombre)} <small>${esc(l.pais)}</small>
            </button>
          </h3>
          <ul class="bloque-liga__lista">${evs.map(filaPartido).join('')}</ul>
        </article>`;
      }).join('') + (pendientes ? `<p class="cargando-mas">Cargando más ligas…</p>` : '');
    }

    const fallidas = [...estado.fallidas].filter((id) => !soloLiga || id === estado.liga);
    $('#nota-hora').innerHTML =
      `Horarios en tu hora local (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' '))}).` +
      (fallidas.length && porLiga.length
        ? ` No se pudieron cargar: ${fallidas.map((id) => esc(ligaPorId(id).corto)).join(', ')}. <button type="button" class="enlace" data-reintentar="partidos">Reintentar</button>`
        : '');
  }

  $('#partidos').addEventListener('click', (e) => {
    const ir = e.target.closest('[data-ir-liga]');
    if (ir) seleccionarLiga(ir.dataset.irLiga);
    if (e.target.closest('[data-accion="todas"]')) document.querySelector('[data-alcance="todas"]').click();
  });

  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-reintentar]');
    if (!r) return;
    if (r.dataset.reintentar === 'partidos') cargarPartidos([...estado.fallidas], true);
    if (r.dataset.reintentar === 'tabla') cargarTabla();
  });

  function errorHTML(msg, que) {
    return `<div class="vacio vacio--error"><p><strong>${esc(msg)}</strong></p>
      <p>Revisa tu conexión a internet y vuelve a intentarlo.</p>
      <button type="button" class="boton" data-reintentar="${que}">Reintentar</button></div>`;
  }

  async function cargarPartidos(ids, fresco = false) {
    const desde = DIAS[0];
    const hasta = DIAS[DIAS.length - 1];
    ids.forEach((id) => { estado.cargando.add(id); estado.fallidas.delete(id); });
    pintarPartidos();
    await Promise.all(ids.map(async (id) => {
      try {
        const { logoLiga, eventos } = await API.partidos(id, desde, hasta, fresco);
        estado.eventos.set(id, eventos);
        if (logoLiga && !estado.logos.has(id)) { estado.logos.set(id, logoLiga); pintarLigas(); }
      } catch (err) {
        console.warn('Partidos', id, err);
        if (!estado.eventos.has(id)) estado.fallidas.add(id);
      } finally {
        estado.cargando.delete(id);
        pintarPartidos();
        if (id === estado.liga && !estado.tabla?.length) pintarEquipos();
      }
    }));
  }

  /* ---------- tabla ---------- */

  async function cargarTabla() {
    const id = estado.liga;
    const l = ligaPorId(id);
    $('#tabla-liga').innerHTML = `<span class="liga__punto" style="--liga:${l.color}"></span>${esc(l.nombre)} · ${esc(l.pais)}`;
    $('#tabla').innerHTML = `<div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando tabla…</p></div>`;
    $('#leyenda').innerHTML = '';
    $('#equipos').innerHTML = '';
    $('#grupo-wrap').hidden = true;
    try {
      const grupos = await API.tabla(id);
      if (id !== estado.liga) return;
      estado.tabla = grupos;
      if (!grupos.length) {
        $('#tabla').innerHTML = `<div class="vacio"><p><strong>Esta competencia todavía no tiene tabla publicada.</strong></p><p>Suele aparecer cuando arranca la temporada o la fase de grupos.</p></div>`;
        pintarEquipos();
        return;
      }
      const sel = $('#grupo');
      if (grupos.length > 1) {
        sel.innerHTML = grupos.map((g, i) => `<option value="${i}">${esc(g.nombre)}</option>`).join('');
        sel.value = String(estado.grupo);
        $('#grupo-wrap').hidden = false;
      }
      pintarTabla();
      pintarEquipos();
    } catch (err) {
      console.warn('Tabla', id, err);
      if (id !== estado.liga) return;
      estado.tabla = null;
      $('#tabla').innerHTML = errorHTML('No se pudo cargar la tabla de posiciones.', 'tabla');
      pintarEquipos();
    }
  }

  $('#grupo').addEventListener('change', (e) => {
    estado.grupo = Number(e.target.value);
    pintarTabla();
  });

  function pintarTabla() {
    const g = estado.tabla?.[estado.grupo];
    if (!g) return;
    const n = (v) => (v == null ? '–' : v);
    const dg = (v) => (v == null ? '–' : v > 0 ? '+' + v : String(v));
    $('#tabla').innerHTML = `<table class="tabla">
      <thead><tr>
        <th scope="col" class="c-pos"><abbr title="Posición">#</abbr></th>
        <th scope="col" class="c-equipo">Equipo</th>
        <th scope="col"><abbr title="Partidos jugados">PJ</abbr></th>
        <th scope="col" class="opc"><abbr title="Ganados">G</abbr></th>
        <th scope="col" class="opc"><abbr title="Empatados">E</abbr></th>
        <th scope="col" class="opc"><abbr title="Perdidos">P</abbr></th>
        <th scope="col" class="opc2"><abbr title="Goles a favor">GF</abbr></th>
        <th scope="col" class="opc2"><abbr title="Goles en contra">GC</abbr></th>
        <th scope="col"><abbr title="Diferencia de gol">DG</abbr></th>
        <th scope="col" class="c-pts"><abbr title="Puntos">Pts</abbr></th>
      </tr></thead>
      <tbody>${g.entradas.map((e) => `
        <tr style="--zona:${e.zona?.color ? '#' + String(e.zona.color).replace('#', '') : 'transparent'}" ${e.zona?.texto ? `title="${esc(e.zona.texto)}"` : ''}>
          <td class="c-pos">${n(e.pos)}</td>
          <th scope="row" class="c-equipo">
            <button type="button" class="tabla__equipo" data-equipo="${esc(e.id)}">
              ${escudo(e.logo, e.nombre, 'escudo escudo--mini')}
              <span class="largo">${esc(e.nombre)}</span><span class="corto">${esc(e.corto)}</span>
            </button>
          </th>
          <td>${n(e.pj)}</td>
          <td class="opc">${n(e.g)}</td><td class="opc">${n(e.e)}</td><td class="opc">${n(e.p)}</td>
          <td class="opc2">${n(e.gf)}</td><td class="opc2">${n(e.gc)}</td>
          <td>${dg(e.dg)}</td>
          <td class="c-pts">${n(e.pts)}</td>
        </tr>`).join('')}
      </tbody></table>`;

    const zonas = new Map();
    g.entradas.forEach((e) => { if (e.zona?.texto && e.zona.color) zonas.set(e.zona.texto, '#' + String(e.zona.color).replace('#', '')); });
    $('#leyenda').innerHTML = [...zonas].map(([t, c]) => `<li><span style="background:${c}"></span>${esc(traducirZona(t))}</li>`).join('');
  }

  function traducirZona(t) {
    return t
      .replace(/Relegation/i, 'Descenso')
      .replace(/Promotion/i, 'Promoción')
      .replace(/Qualifying/i, 'Clasificación')
      .replace(/Qualification/i, 'Clasificación')
      .replace(/Knockout Round Playoffs?/i, 'Playoff de eliminatorias')
      .replace(/Round of 16/i, 'Octavos de final')
      .replace(/Playoffs?/i, 'Playoff')
      .replace(/Group Stage/i, 'Fase de grupos')
      .replace(/League Phase/i, 'Fase de liga')
      .replace(/Next Round/i, 'Siguiente ronda');
  }

  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-equipo]');
    if (b) abrirFicha(b.dataset.equipo);
  });

  /* ---------- equipos ---------- */

  function equiposDeLiga() {
    const vistos = new Map();
    (estado.tabla || []).forEach((g) => g.entradas.forEach((e) => { if (e.id && !vistos.has(e.id)) vistos.set(e.id, { ...e, grupo: g.nombre }); }));
    // Si no hay tabla, se arma la lista con los equipos del calendario
    if (!vistos.size) {
      (estado.eventos.get(estado.liga) || []).forEach((ev) =>
        [ev.local, ev.visita].forEach((t) => { if (t.id && !vistos.has(t.id)) vistos.set(t.id, { id: t.id, nombre: t.nombreLargo, logo: t.logo }); })
      );
    }
    return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function pintarEquipos() {
    const f = estado.filtro.trim().toLowerCase();
    const lista = equiposDeLiga().filter((e) => !f || e.nombre.toLowerCase().includes(f));
    const varios = (estado.tabla || []).length > 1;
    $('#equipos').innerHTML = lista.length
      ? `<ul class="equipos__lista">${lista.map((e) => `
          <li><button type="button" class="tarjeta-equipo" data-equipo="${esc(e.id)}">
            ${escudo(e.logo, e.nombre, 'escudo escudo--grande')}
            <span class="tarjeta-equipo__nombre">${esc(e.nombre)}</span>
            ${e.pts != null ? `<span class="tarjeta-equipo__dato">${e.pos}.º${varios ? ` en ${esc(e.grupo)}` : ''} · ${e.pts} pts</span>` : ''}
          </button></li>`).join('')}</ul>`
      : `<div class="vacio"><p>${f ? `Ningún equipo coincide con “${esc(estado.filtro)}”.` : 'Los equipos aparecen cuando carga la tabla o el calendario.'}</p></div>`;
  }

  $('#buscar').addEventListener('input', (e) => { estado.filtro = e.target.value; pintarEquipos(); });
  $('#equipos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-equipo]');
    if (b) abrirFicha(b.dataset.equipo);
  });

  /* ---------- ficha del equipo ---------- */

  const dialogo = $('#ficha');
  $('#ficha-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });

  function buscarEquipo(id) {
    for (const g of estado.tabla || []) {
      const e = g.entradas.find((x) => String(x.id) === String(id));
      if (e) return { ...e, grupo: g.nombre };
    }
    return equiposDeLiga().find((x) => String(x.id) === String(id));
  }

  async function abrirFicha(id) {
    const eq = buscarEquipo(id);
    if (!eq) return;
    const ligaId = estado.liga;
    const l = ligaPorId(ligaId);
    const datos = eq.pts != null
      ? `<dl class="ficha__datos">
          <div><dt>Posición</dt><dd>${eq.pos}.º</dd></div>
          <div><dt>Puntos</dt><dd>${eq.pts}</dd></div>
          <div><dt>Jugados</dt><dd>${eq.pj ?? '–'}</dd></div>
          <div><dt>G-E-P</dt><dd>${eq.g ?? '–'}-${eq.e ?? '–'}-${eq.p ?? '–'}</dd></div>
          <div><dt>Goles</dt><dd>${eq.gf ?? '–'}:${eq.gc ?? '–'}</dd></div>
        </dl>` : '';

    $('#ficha-cuerpo').innerHTML = `
      <header class="ficha__cabeza" style="--liga:${l.color}">
        ${escudo(eq.logo, eq.nombre, 'escudo escudo--ficha')}
        <div>
          <h2 id="ficha-nombre">${esc(eq.nombre)}</h2>
          <p>${esc(l.nombre)}${eq.grupo && (estado.tabla || []).length > 1 ? ' · ' + esc(eq.grupo) : ''}</p>
        </div>
      </header>
      ${datos}
      <div class="ficha__listas" id="ficha-listas"><div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando partidos del equipo…</p></div></div>`;
    dialogo.showModal();

    try {
      const { ultimos, proximos } = await API.calendarioEquipo(ligaId, id);
      const res = (ev) => {
        const yo = String(ev.local.id) === String(id) ? ev.local : ev.visita;
        const otro = yo === ev.local ? ev.visita : ev.local;
        if (yo.goles == null || otro.goles == null) return '';
        const r = yo.goles > otro.goles ? ['G', 'gano'] : yo.goles < otro.goles ? ['P', 'perdio'] : ['E', 'empato'];
        return `<span class="resultado resultado--${r[1]}" title="${r[1] === 'gano' ? 'Ganó' : r[1] === 'perdio' ? 'Perdió' : 'Empató'}">${r[0]}</span>`;
      };
      const fila = (ev, pasado) => {
        const esLocal = String(ev.local.id) === String(id);
        const rival = esLocal ? ev.visita : ev.local;
        return `<li>
          <span class="ficha__fecha">${esc(fmtFechaCorta.format(ev.fecha))}${pasado ? '' : ' · ' + esc(fmtHora.format(ev.fecha))}</span>
          <span class="ficha__rival">${esLocal ? 'vs' : 'en'} ${escudo(rival.logo, rival.nombre, 'escudo escudo--mini')} ${esc(rival.nombre)}</span>
          ${pasado ? `<span class="ficha__marcador">${ev.local.goles ?? '–'}-${ev.visita.goles ?? '–'}</span>${res(ev)}` : ''}
        </li>`;
      };
      $('#ficha-listas').innerHTML = `
        <section><h3>Próximos partidos</h3>${proximos.length ? `<ul>${proximos.map((e) => fila(e, false)).join('')}</ul>` : '<p class="ficha__nada">No hay partidos programados todavía.</p>'}</section>
        <section><h3>Últimos resultados</h3>${ultimos.length ? `<ul>${ultimos.map((e) => fila(e, true)).join('')}</ul>` : '<p class="ficha__nada">Sin resultados recientes.</p>'}</section>`;
    } catch (err) {
      console.warn('Ficha', err);
      $('#ficha-listas').innerHTML = `<p class="ficha__nada">No se pudo cargar el calendario del equipo.</p>`;
    }
  }

  /* ---------- actualización en vivo ---------- */

  setInterval(() => {
    const ahora = Date.now();
    const activas = [...estado.eventos].filter(([, evs]) =>
      evs.some((e) => e.estado === 'in' || (e.estado === 'pre' && e.fecha.getTime() <= ahora && ahora - e.fecha.getTime() < 3 * 3600e3))
    ).map(([id]) => id);
    if (activas.length && !document.hidden) cargarPartidos(activas, true);
  }, 60000);

  window.addEventListener('hashchange', () => {
    const id = leerLigaInicial();
    if (id !== estado.liga) seleccionarLiga(id);
  });

  /* ---------- arranque ---------- */

  $('#alcance-liga').textContent = 'Solo ' + ligaPorId(estado.liga).corto;
  pintarLigas();
  cargarTabla();
  cargarPartidos(LIGAS.map((l) => l.id));
})();
