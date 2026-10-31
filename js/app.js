(function () {
  const LIGAS = window.LIGAS;
  const { esc, capital, fmt, escudo, horaHTML, aplazado, textoEstado, nombreRonda, traducirNota } = window.FO;
  const Fav = window.Almacen.favoritos;
  const $ = (s) => document.querySelector(s);

  const estado = {
    liga: leerLigaInicial(),
    dia: 1,             // índice en la tira de fechas (0 = ayer, 1 = hoy)
    alcance: 'todas',   // 'todas' | 'liga' | 'favoritos'
    grupo: 0,
    eventos: new Map(), // ligaId -> Map(idPartido -> partido)
    logos: new Map(),   // ligaId -> url del logo
    cargando: new Set(), // claves 'liga|AAAA-M' en curso
    fallidas: new Set(), // claves 'liga|AAAA-M' que fallaron
    tabla: null,
    temporada: new Map(), // ligaId -> partidos de la temporada (racha y llaves)
    filtro: ''
  };

  function leerLigaInicial() {
    const h = decodeURIComponent(location.hash.replace('#', ''));
    return window.LIGAS.some((l) => l.id === h) ? h : window.LIGAS[0].id;
  }

  const ligaPorId = (id) => LIGAS.find((l) => l.id === id) || LIGAS[0];
  const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const claveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const HOY = inicioDia(new Date());
  const DIAS = Array.from({ length: window.DIAS_ADELANTE + 2 }, (_, i) => {
    const d = new Date(HOY);
    d.setDate(d.getDate() + i - 1);
    return d;
  });
  const claveMes = (d) => `${d.getFullYear()}-${d.getMonth()}`;
  const MESES = [...new Map(DIAS.map((d) => [claveMes(d), d])).values()]; // meses que cubre la tira

  const esFavorito = (ev) => Fav.tiene(ev.local.id) || Fav.tiene(ev.visita.id);

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
    cargarNoticias();
    cargarTemporada();
  }

  /* ---------- tira de fechas ---------- */

  function eventosDelDia(i, alcance = estado.alcance) {
    const clave = claveDia(DIAS[i]);
    const out = [];
    for (const [liga, evs] of estado.eventos) {
      if (alcance === 'liga' && liga !== estado.liga) continue;
      for (const ev of evs.values()) {
        if (claveDia(ev.fecha) !== clave) continue;
        if (alcance === 'favoritos' && !esFavorito(ev)) continue;
        out.push(ev);
      }
    }
    return out;
  }

  function etiquetaDia(i) {
    if (i === 0) return 'Ayer';
    if (i === 1) return 'Hoy';
    if (i === 2) return 'Mañana';
    return capital(fmt.diaSemana.format(DIAS[i]).replace('.', ''));
  }

  function pintarFechas() {
    $('#fechas').innerHTML = DIAS.map((d, i) => {
      const evs = eventosDelDia(i);
      const n = evs.length;
      const vivo = evs.some((e) => e.estado === 'in');
      return `<button type="button" role="tab" class="fecha${i === estado.dia ? ' fecha--activa' : ''}${n ? '' : ' fecha--vacia'}"
        data-dia="${i}" aria-selected="${i === estado.dia}" aria-label="${esc(capital(fmt.fechaLarga.format(d)))}, ${n} partidos">
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
      if (aplazado(ev.nombreEstado)) return `<span class="marcador__estado">Aplazado</span>`;
      return horaHTML(ev.fecha);
    }
    return `<span class="marcador__goles"><b>${ev.local.goles ?? '–'}</b><span>-</span><b>${ev.visita.goles ?? '–'}</b></span>`;
  }

  function chipEstado(ev) {
    const t = textoEstado(ev);
    if (!t) return '';
    if (ev.estado === 'in') return `<span class="chip chip--vivo"><i class="vivo-punto"></i>${esc(t)}</span>`;
    return `<span class="chip${ev.estado === 'post' ? ' chip--final' : ''}">${esc(t)}</span>`;
  }

  function filaPartido(ev) {
    const perdio = (lado, otro) =>
      ev.estado === 'post' && lado.goles != null && otro.goles != null && (lado.goles < otro.goles || (lado.goles === otro.goles && otro.ganador && !lado.ganador))
        ? ' equipo--perdio' : '';
    const fav = (t) => (Fav.tiene(t.id) ? '<span class="estrella-mini" aria-label="Favorito">★</span>' : '');
    const etiqueta = `${ev.local.nombreLargo} contra ${ev.visita.nombreLargo}. Ver detalle del partido`;
    return `<li>
      <button type="button" class="partido${ev.estado === 'in' ? ' partido--vivo' : ''}" data-partido="${esc(ev.id)}" data-liga-partido="${esc(ev.liga)}" aria-label="${esc(etiqueta)}">
        <span class="partido__estado">${chipEstado(ev)}</span>
        <span class="equipo equipo--local${perdio(ev.local, ev.visita)}">
          <span class="equipo__nombre">${fav(ev.local)}${esc(ev.local.nombre)}</span>
          ${escudo(ev.local.logo, ev.local.nombre)}
        </span>
        <span class="marcador">${marcador(ev)}</span>
        <span class="equipo equipo--visita${perdio(ev.visita, ev.local)}">
          ${escudo(ev.visita.logo, ev.visita.nombre)}
          <span class="equipo__nombre">${esc(ev.visita.nombre)}${fav(ev.visita)}</span>
        </span>
        ${ev.sede || ev.nota ? `<span class="partido__sede">${esc([traducirNota(ev.nota), ev.sede].filter(Boolean).join(' · '))}</span>` : ''}
      </button>
    </li>`;
  }

  function bloque(titulo, subtitulo, color, logo, idLiga, evs, clase = '') {
    return `<article class="bloque-liga ${clase}" style="--liga:${color}">
      <h3 class="bloque-liga__titulo">
        ${idLiga
          ? `<button type="button" data-ir-liga="${idLiga}">${logo ? `<img src="${esc(logo)}" alt="" width="20" height="20">` : '<span class="liga__punto"></span>'}${esc(titulo)} <small>${esc(subtitulo)}</small></button>`
          : `<span class="bloque-liga__fijo"><span class="estrella-mini">★</span>${esc(titulo)} <small>${esc(subtitulo)}</small></span>`}
      </h3>
      <ul class="bloque-liga__lista">${evs.map(filaPartido).join('')}</ul>
    </article>`;
  }

  function pintarPartidos() {
    pintarFechas();
    actualizarTitulo();
    const alcance = estado.alcance;
    const evs = eventosDelDia(estado.dia).sort((a, b) => a.fecha - b.fecha);
    const cont = $('#partidos');

    // Los partidos de equipos favoritos van primero, en su propio bloque
    const favs = alcance === 'favoritos' ? [] : evs.filter(esFavorito);
    const resto = alcance === 'favoritos' ? evs : evs.filter((e) => !esFavorito(e));

    const orden = [estado.liga, ...LIGAS.map((l) => l.id).filter((id) => id !== estado.liga)];
    const porLiga = orden
      .map((id) => ({ id, evs: resto.filter((e) => e.liga === id) }))
      .filter((g) => g.evs.length);

    const mesVisto = claveMes(DIAS[estado.dia]);
    const delMes = (set) => [...set]
      .map((k) => k.split('|'))
      .filter(([liga, mes]) => mes === mesVisto && (alcance !== 'liga' || liga === estado.liga))
      .map(([liga]) => liga);
    const pendientes = delMes(estado.cargando).length > 0;
    const fallidas = delMes(estado.fallidas);

    if (!favs.length && !porLiga.length) {
      const fecha = capital(fmt.fechaLarga.format(DIAS[estado.dia]));
      if (pendientes) {
        cont.innerHTML = `<div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando partidos…</p></div>`;
      } else if (fallidas.length && (alcance === 'liga' || fallidas.length === LIGAS.length)) {
        cont.innerHTML = errorHTML('No se pudo cargar el calendario.', 'partidos');
      } else if (alcance === 'favoritos' && !Fav.lista().length) {
        cont.innerHTML = `<div class="vacio"><p><strong>Todavía no sigues a ningún equipo.</strong></p>
          <p>Toca la estrella de un equipo en la lista de equipos, o abre su ficha y toca <b>☆ Seguir</b>.</p></div>`;
      } else {
        cont.innerHTML = `<div class="vacio"><p><strong>Sin partidos el ${esc(fecha.toLowerCase())}.</strong></p>
          <p>${alcance !== 'todas' ? 'Prueba con <button type="button" class="enlace" data-accion="todas">todas las ligas</button> o elige otro día.' : 'Elige otro día en la tira de fechas.'}</p></div>`;
      }
    } else {
      cont.innerHTML =
        (favs.length ? bloque('Mis equipos', `${favs.length} ${favs.length === 1 ? 'partido' : 'partidos'}`, 'var(--amarilla)', null, null, favs, 'bloque-liga--favs') : '') +
        porLiga.map(({ id, evs }) => {
          const l = ligaPorId(id);
          return bloque(l.nombre, l.pais, l.color, estado.logos.get(id), id, evs);
        }).join('') +
        (pendientes ? `<p class="cargando-mas">Cargando más ligas…</p>` : '');
    }

    $('#nota-hora').innerHTML =
      `Horarios en tu hora local (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' '))}). Toca un partido para ver el detalle.` +
      (fallidas.length && (favs.length || porLiga.length)
        ? ` No se pudieron cargar: ${fallidas.map((id) => esc(ligaPorId(id).corto)).join(', ')}. <button type="button" class="enlace" data-reintentar="partidos">Reintentar</button>`
        : '');
  }

  $('#partidos').addEventListener('click', (e) => {
    const ir = e.target.closest('[data-ir-liga]');
    if (ir) return seleccionarLiga(ir.dataset.irLiga);
    if (e.target.closest('[data-accion="todas"]')) return document.querySelector('[data-alcance="todas"]').click();
    const p = e.target.closest('[data-partido]');
    if (p) {
      const ev = estado.eventos.get(p.dataset.ligaPartido)?.get(p.dataset.partido);
      Partido.abrir(p.dataset.ligaPartido, p.dataset.partido, ev);
    }
  });

  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-reintentar]');
    if (!r) return;
    if (r.dataset.reintentar === 'partidos') cargarPartidos([...estado.fallidas], true);
    if (r.dataset.reintentar === 'tabla') cargarTabla();
    if (r.dataset.reintentar === 'noticias') cargarNoticias();
  });

  function errorHTML(msg, que) {
    return `<div class="vacio vacio--error"><p><strong>${esc(msg)}</strong></p>
      <p>Revisa tu conexión a internet y vuelve a intentarlo.</p>
      <button type="button" class="boton" data-reintentar="${que}">Reintentar</button></div>`;
  }

  /* Repinta como mucho una vez por cuadro aunque lleguen muchas respuestas seguidas. */
  let repintePendiente = false;
  function repintar() {
    if (repintePendiente) return;
    repintePendiente = true;
    requestAnimationFrame(() => {
      repintePendiente = false;
      pintarPartidos();
      if (!estado.tabla?.length) pintarEquipos();
    });
  }

  function guardarEventos(liga, eventos, logoLiga) {
    const mapa = estado.eventos.get(liga) || new Map();
    eventos.forEach((ev) => mapa.set(ev.id, ev));
    estado.eventos.set(liga, mapa);
    if (logoLiga && !estado.logos.has(liga)) { estado.logos.set(liga, logoLiga); pintarLigas(); }
  }

  /* claves: 'liga|AAAA-M'. Cada clave es un mes completo de una liga (una sola consulta). */
  const MAX_SIMULTANEAS = 6;
  async function cargarPartidos(claves, fresco = false) {
    const cola = [...new Set(claves)].sort((a, b) => {
      // primero la liga seleccionada y el mes que se está viendo
      const peso = (k) => (k.startsWith(estado.liga + '|') ? 0 : 2) + (k.endsWith('|' + claveMes(DIAS[estado.dia])) ? 0 : 1);
      return peso(a) - peso(b);
    });
    cola.forEach((k) => { estado.cargando.add(k); estado.fallidas.delete(k); });
    repintar();

    async function trabajador() {
      while (cola.length) {
        const k = cola.shift();
        const [liga, mes] = k.split('|');
        const [anio, m] = mes.split('-').map(Number);
        try {
          const { logoLiga, eventos } = await API.partidosMes(liga, anio, m, fresco);
          guardarEventos(liga, eventos, logoLiga);
        } catch (err) {
          console.warn('Partidos', k, err);
          estado.fallidas.add(k);
        } finally {
          estado.cargando.delete(k);
          repintar();
        }
      }
    }
    await Promise.all(Array.from({ length: MAX_SIMULTANEAS }, trabajador));
  }

  const clavesDe = (ligas) => ligas.flatMap((l) => MESES.map((d) => `${l}|${claveMes(d)}`));

  /* ---------- título de la pestaña ---------- */

  const TITULO = document.title;
  function actualizarTitulo() {
    let vivos = 0;
    for (const evs of estado.eventos.values()) for (const ev of evs.values()) if (ev.estado === 'in') vivos++;
    document.title = vivos ? `⚽ ${vivos} en vivo · ${TITULO}` : TITULO;
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
    estado.tabla = null;
    try {
      const grupos = await API.tabla(id);
      if (id !== estado.liga) return;
      estado.tabla = grupos;
      if (!grupos.length) {
        $('#tabla').innerHTML = `<div class="vacio"><p><strong>Esta competencia no tiene tabla en este momento.</strong></p><p>Aparece cuando empieza la temporada o la fase de grupos.</p></div>`;
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
      $('#tabla').innerHTML = errorHTML('No se pudo cargar la tabla de posiciones.', 'tabla');
      pintarEquipos();
    }
  }

  $('#grupo').addEventListener('change', (e) => {
    estado.grupo = Number(e.target.value);
    pintarTabla();
  });

  /* Últimos 5 resultados por equipo, a partir de los partidos de la temporada */
  function rachas(ligaId) {
    const evs = (estado.temporada.get(ligaId) || []).filter((e) => e.estado === 'post' && e.local.goles != null && e.visita.goles != null && !aplazado(e.nombreEstado));
    if (!evs.length) return null;
    const anio = Math.max(...evs.map((e) => e.temporada ?? 0));
    const r = new Map();
    evs.filter((e) => (e.temporada ?? 0) === anio)
      .sort((a, b) => b.fecha - a.fecha)
      .forEach((e) => {
        [[e.local, e.visita], [e.visita, e.local]].forEach(([yo, otro]) => {
          const lista = r.get(yo.id) || [];
          if (lista.length >= 5) return;
          let res = yo.goles > otro.goles ? 'G' : yo.goles < otro.goles ? 'P' : 'E';
          if (res === 'E' && (yo.ganador || otro.ganador)) res = yo.ganador ? 'G' : 'P'; // definido por penales
          lista.push({ res, rival: otro.nombre, marcador: `${yo.goles}-${otro.goles}` });
          r.set(yo.id, lista);
        });
      });
    return r;
  }

  function rachaHTML(lista) {
    if (!lista?.length) return '<span class="racha racha--vacia">–</span>';
    const cl = { G: 'gano', E: 'empato', P: 'perdio' };
    const tx = { G: 'Ganó', E: 'Empató', P: 'Perdió' };
    // del más antiguo al más reciente, de izquierda a derecha
    return `<span class="racha">${[...lista].reverse().map((x) =>
      `<i class="racha__p racha__p--${cl[x.res]}" title="${tx[x.res]} ${esc(x.marcador)} vs ${esc(x.rival)}">${x.res}</i>`).join('')}</span>`;
  }

  function pintarTabla() {
    const g = estado.tabla?.[estado.grupo];
    if (!g) return;
    const r = rachas(estado.liga);
    const n = (v) => (v == null ? '–' : v);
    const dg = (v) => (v == null ? '–' : v > 0 ? '+' + v : String(v));
    $('#tabla').innerHTML = `<table class="tabla${r ? ' tabla--racha' : ''}">
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
        ${r ? '<th scope="col" class="c-racha">Últimos 5</th>' : ''}
      </tr></thead>
      <tbody>${g.entradas.map((e) => `
        <tr class="${Fav.tiene(e.id) ? 'fila--fav' : ''}" style="--zona:${e.zona?.color || 'transparent'}" ${e.zona?.texto ? `title="${esc(traducirZona(e.zona.texto))}"` : ''}>
          <td class="c-pos">${n(e.pos)}</td>
          <th scope="row" class="c-equipo">
            <button type="button" class="tabla__equipo" data-equipo="${esc(e.id)}">
              ${escudo(e.logo, e.nombre, 'escudo escudo--mini')}
              <span class="largo">${esc(e.nombre)}</span><span class="corto">${esc(e.corto)}</span>
              ${Fav.tiene(e.id) ? '<span class="estrella-mini" aria-label="Favorito">★</span>' : ''}
            </button>
          </th>
          <td>${n(e.pj)}</td>
          <td class="opc">${n(e.g)}</td><td class="opc">${n(e.e)}</td><td class="opc">${n(e.p)}</td>
          <td class="opc2">${n(e.gf)}</td><td class="opc2">${n(e.gc)}</td>
          <td>${dg(e.dg)}</td>
          <td class="c-pts">${n(e.pts)}</td>
          ${r ? `<td class="c-racha">${rachaHTML(r.get(e.id))}</td>` : ''}
        </tr>`).join('')}
      </tbody></table>`;

    const zonas = new Map();
    g.entradas.forEach((e) => { if (e.zona?.texto) zonas.set(traducirZona(e.zona.texto), e.zona.color); });
    $('#leyenda').innerHTML = [...zonas].map(([t, c]) => `<li><span style="background:${c}"></span>${esc(t)}</li>`).join('');
  }

  /* ESPN entrega las zonas en inglés: se traducen las frases conocidas. */
  const ZONAS = [
    [/^Qualifies for round of 16$/i, 'Clasifica a octavos de final'],
    [/^Knockout phase playoffs? - seeded$/i, 'Playoff de eliminatorias (cabeza de serie)'],
    [/^Knockout phase playoffs? - unseeded$/i, 'Playoff de eliminatorias (sin cabeza de serie)'],
    [/^Eliminated$/i, 'Eliminado'],
    [/^Champions League qualifying$/i, 'Previa de Champions League'],
    [/^Europa League qualifying$/i, 'Previa de Europa League'],
    [/^Conference League qualifying$/i, 'Previa de Conference League'],
    [/^Relegation playoffs?$/i, 'Playoff de descenso'],
    [/^Relegat(ion|ed)$/i, 'Descenso'],
    [/^Qualifies for Sudamericana KO Playoffs$/i, 'Clasifica al playoff de la Sudamericana'],
    [/^Qualifies for MLS Cup Playoffs - Round One Best-of-3 series$/i, 'Playoffs de la MLS: primera ronda'],
    [/^Qualifies for MLS Cup Playoffs - Wild Card Matches$/i, 'Playoffs de la MLS: comodín']
  ];
  function traducirZona(t) {
    for (const [re, es] of ZONAS) if (re.test(t.trim())) return es;
    return t
      .replace(/^Qualifies for /i, 'Clasifica a ')
      .replace(/Round of 16/i, 'octavos de final')
      .replace(/Relegation/i, 'Descenso')
      .replace(/Promotion/i, 'Ascenso')
      .replace(/qualifying/i, '(previa)')
      .replace(/Playoffs?/i, 'playoff');
  }

  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-equipo]');
    if (b) abrirFicha(b.dataset.equipo);
  });

  /* ---------- temporada: racha y llaves ---------- */

  async function cargarTemporada() {
    const id = estado.liga;
    $('#panel-llaves').hidden = true;
    try {
      if (!estado.temporada.has(id)) estado.temporada.set(id, await API.temporada(id));
      if (id !== estado.liga) return;
      pintarTabla();
      pintarLlaves();
      if (!estado.tabla?.length) pintarEquipos();
    } catch (err) {
      console.warn('Temporada', id, err); // la racha y las llaves son opcionales: si fallan, no se muestran
    }
  }

  const esEliminatoria = (e) => !!e.serie || (/round-of|quarter|semi|final|playoff|stage/.test(e.ronda) && !/group|league-phase/.test(e.ronda));

  function pintarLlaves() {
    const panel = $('#panel-llaves');
    const ko = (estado.temporada.get(estado.liga) || []).filter(esEliminatoria);
    if (!ko.length) { panel.hidden = true; return; }

    // La edición más reciente que tenga eliminatorias; en Colombia, el torneo (Apertura/Clausura) más reciente
    const anio = Math.max(...ko.map((e) => e.temporada ?? 0));
    let evs = ko.filter((e) => (e.temporada ?? 0) === anio);
    const torneo = (e) => (e.ronda.includes('---') ? e.ronda.split('---')[0] : '');
    const ultimoTorneo = torneo(evs[evs.length - 1]);
    if (ultimoTorneo) evs = evs.filter((e) => torneo(e) === ultimoTorneo);

    // Rondas en orden cronológico, y dentro de cada una las llaves (ida y vuelta juntas)
    const rondas = new Map();
    evs.forEach((e) => {
      if (!rondas.has(e.ronda)) rondas.set(e.ronda, new Map());
      const par = [e.local.id, e.visita.id].sort().join('-');
      const llaves = rondas.get(e.ronda);
      if (!llaves.has(par)) llaves.set(par, []);
      llaves.get(par).push(e);
    });

    const anios = [...new Set(evs.map((e) => e.fecha.getFullYear()))].sort();
    const edicion = ultimoTorneo
      ? `${capital(ultimoTorneo)} ${anio}`
      : anios.length > 1 ? `Temporada ${anios[0]}-${String(anios[anios.length - 1]).slice(2)}` : `Edición ${anios[0]}`;
    const terminada = evs.every((e) => e.estado === 'post');
    $('#llaves-edicion').textContent = edicion + (terminada ? ' · finalizada' : ' · en curso');

    $('#llaves').innerHTML = [...rondas].map(([slug, llaves]) => `
      <section class="ronda">
        <h3 class="ronda__titulo">${esc(nombreRonda(slug))}</h3>
        <ul class="ronda__lista">${[...llaves.values()].map(llaveHTML).join('')}</ul>
      </section>`).join('');
    panel.hidden = false;
  }

  function llaveHTML(partidos) {
    partidos.sort((a, b) => a.fecha - b.fecha);
    const p0 = partidos[0];
    const A = p0.local, B = p0.visita; // A es local en la ida
    const goles = (t) => partidos.reduce((s, p) => {
      if (p.estado === 'pre') return s;
      const g = p.local.id === t.id ? p.local.goles : p.visita.goles;
      return g == null ? s : (s ?? 0) + g;
    }, null);
    const gA = goles(A), gB = goles(B);
    const ultimo = partidos[partidos.length - 1];
    let ganador = ultimo.serie?.completa ? ultimo.serie.ganador : '';
    if (!ganador && ultimo.estado === 'post') {
      const lA = ultimo.local.id === A.id ? ultimo.local : ultimo.visita;
      const lB = ultimo.local.id === B.id ? ultimo.local : ultimo.visita;
      if (lA.ganador || lB.ganador) ganador = lA.ganador ? A.id : B.id;
      else if (gA != null && gB != null && gA !== gB && partidos.every((p) => p.estado === 'post')) ganador = gA > gB ? A.id : B.id;
    }
    const pen = /(\d+-\d+) on penalties/i.exec(ultimo.nota || '');
    const fila = (t, g) => `<li class="llave__equipo${ganador === t.id ? ' llave__equipo--gana' : ganador ? ' llave__equipo--fuera' : ''}">
        ${escudo(t.logo, t.nombre, 'escudo escudo--mini')}
        <span class="llave__nombre">${esc(t.nombre)}</span>
        <b class="llave__goles">${g ?? ''}</b>
      </li>`;
    const detalle = partidos.length > 1
      ? partidos.map((p, i) => {
          const txt = p.estado === 'pre' ? fmt.fechaCorta.format(p.fecha) : `${p.local.abrev || p.local.nombre} ${p.local.goles ?? '–'}-${p.visita.goles ?? '–'} ${p.visita.abrev || p.visita.nombre}`;
          return `<button type="button" class="llave__partido" data-partido="${esc(p.id)}" data-liga-partido="${esc(p.liga)}">${i === 0 ? 'Ida' : i === 1 ? 'Vuelta' : 'Partido ' + (i + 1)}: ${esc(txt)}</button>`;
        }).join('')
      : `<button type="button" class="llave__partido" data-partido="${esc(p0.id)}" data-liga-partido="${esc(p0.liga)}">${p0.estado === 'pre' ? esc(capital(fmt.fechaLarga.format(p0.fecha))) : 'Ver partido'}</button>`;
    return `<li class="llave">
      <ul class="llave__equipos">${fila(A, gA)}${fila(B, gB)}</ul>
      <div class="llave__detalle">${detalle}${pen ? `<span>Penales ${esc(pen[1])}</span>` : ''}</div>
    </li>`;
  }

  $('#llaves').addEventListener('click', (e) => {
    const p = e.target.closest('[data-partido]');
    if (!p) return;
    const ev = (estado.temporada.get(p.dataset.ligaPartido) || []).find((x) => x.id === p.dataset.partido);
    Partido.abrir(p.dataset.ligaPartido, p.dataset.partido, ev);
  });

  /* ---------- noticias ---------- */

  async function cargarNoticias() {
    const id = estado.liga;
    const cont = $('#noticias');
    $('#noticias-liga').textContent = ligaPorId(id).nombre;
    cont.innerHTML = `<div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando noticias…</p></div>`;
    try {
      const lista = await API.noticias(id);
      if (id !== estado.liga) return;
      cont.innerHTML = lista.length
        ? `<ul class="noticias__lista">${lista.slice(0, 6).map((n) => `
            <li><a class="noticia" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
              ${n.imagen ? `<img class="noticia__img" src="${esc(n.imagen)}" alt="" loading="lazy">` : '<span class="noticia__img noticia__img--vacia" aria-hidden="true"></span>'}
              <span class="noticia__texto">
                <span class="noticia__titulo">${n.video ? '<span class="noticia__video">Video</span> ' : ''}${esc(n.titulo)}</span>
                ${n.fecha ? `<span class="noticia__fecha">${esc(fmt.fechaCorta.format(new Date(n.fecha)))} · ESPN</span>` : ''}
              </span>
            </a></li>`).join('')}</ul>`
        : `<div class="vacio"><p>No hay noticias recientes de esta liga.</p></div>`;
    } catch (err) {
      console.warn('Noticias', id, err);
      if (id !== estado.liga) return;
      cont.innerHTML = errorHTML('No se pudieron cargar las noticias.', 'noticias');
    }
  }

  /* ---------- equipos ---------- */

  function equiposDeLiga() {
    const vistos = new Map();
    (estado.tabla || []).forEach((g) => g.entradas.forEach((e) => { if (e.id && !vistos.has(e.id)) vistos.set(e.id, { ...e, grupo: g.nombre }); }));
    if (!vistos.size) {
      const fuentes = [...(estado.eventos.get(estado.liga)?.values() || []), ...(estado.temporada.get(estado.liga) || [])];
      fuentes.forEach((ev) => [ev.local, ev.visita].forEach((t) => {
        if (t.id && !vistos.has(t.id)) vistos.set(t.id, { id: t.id, nombre: t.nombreLargo, logo: t.logo });
      }));
    }
    return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function pintarEquipos() {
    const f = estado.filtro.trim().toLowerCase();
    const lista = equiposDeLiga().filter((e) => !f || e.nombre.toLowerCase().includes(f));
    const varios = (estado.tabla || []).length > 1;
    $('#equipos').innerHTML = lista.length
      ? `<ul class="equipos__lista">${lista.map((e) => {
          const fav = Fav.tiene(e.id);
          return `<li class="equipos__item">
            <button type="button" class="tarjeta-equipo${fav ? ' tarjeta-equipo--fav' : ''}" data-equipo="${esc(e.id)}">
              ${escudo(e.logo, e.nombre, 'escudo escudo--grande')}
              <span class="tarjeta-equipo__nombre">${esc(e.nombre)}</span>
              ${e.pts != null ? `<span class="tarjeta-equipo__dato">${e.pos}.º${varios ? ` en ${esc(e.grupo)}` : ''} · ${e.pts} pts</span>` : ''}
            </button>
            <button type="button" class="estrella${fav ? ' estrella--activa' : ''}" data-fav="${esc(e.id)}"
              aria-pressed="${fav}" aria-label="${fav ? 'Dejar de seguir a' : 'Seguir a'} ${esc(e.nombre)}">★</button>
          </li>`;
        }).join('')}</ul>`
      : `<div class="vacio"><p>${f ? `Ningún equipo coincide con “${esc(estado.filtro)}”.` : 'Los equipos aparecen cuando carga la tabla o el calendario.'}</p></div>`;
  }

  $('#buscar').addEventListener('input', (e) => { estado.filtro = e.target.value; pintarEquipos(); });
  $('#equipos').addEventListener('click', (e) => {
    const s = e.target.closest('[data-fav]');
    if (s) return alternarFavorito(s.dataset.fav);
    const b = e.target.closest('[data-equipo]');
    if (b) abrirFicha(b.dataset.equipo);
  });

  function alternarFavorito(id) {
    const eq = buscarEquipo(id);
    if (eq) Fav.alternar(eq);
  }

  // Cualquier cambio de favoritos repinta todo lo que los muestra
  Fav.alCambiar(() => {
    pintarPartidos();
    pintarTabla();
    pintarEquipos();
    const b = document.getElementById('ficha-seguir');
    if (b) pintarBotonSeguir(b);
  });

  /* ---------- ficha del equipo ---------- */

  const dialogo = $('#ficha');
  $('#ficha-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) return dialogo.close();
    const seguir = e.target.closest('#ficha-seguir');
    if (seguir) return alternarFavorito(seguir.dataset.id);
    const p = e.target.closest('[data-partido]');
    if (p) {
      dialogo.close();
      Partido.abrir(p.dataset.ligaPartido, p.dataset.partido);
    }
  });

  function buscarEquipo(id) {
    for (const g of estado.tabla || []) {
      const e = g.entradas.find((x) => String(x.id) === String(id));
      if (e) return { ...e, grupo: g.nombre };
    }
    return equiposDeLiga().find((x) => String(x.id) === String(id));
  }

  function pintarBotonSeguir(b) {
    const fav = Fav.tiene(b.dataset.id);
    b.classList.toggle('seguir--activo', fav);
    b.setAttribute('aria-pressed', String(fav));
    b.textContent = fav ? '★ Siguiendo' : '☆ Seguir';
  }

  async function abrirFicha(id) {
    const eq = buscarEquipo(id);
    if (!eq) return;
    const ligaId = estado.liga;
    const l = ligaPorId(ligaId);
    const r = rachas(ligaId)?.get(String(id));
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
          <button type="button" class="seguir" id="ficha-seguir" data-id="${esc(id)}"></button>
        </div>
      </header>
      ${datos}
      ${r ? `<div class="ficha__racha"><span>Últimos 5</span>${rachaHTML(r)}</div>` : ''}
      <div class="ficha__listas" id="ficha-listas"><div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando partidos del equipo…</p></div></div>`;
    pintarBotonSeguir($('#ficha-seguir'));
    dialogo.showModal();

    try {
      const { ultimos, proximos } = await API.calendarioEquipo(ligaId, id);
      const res = (ev) => {
        const yo = String(ev.local.id) === String(id) ? ev.local : ev.visita;
        const otro = yo === ev.local ? ev.visita : ev.local;
        if (yo.goles == null || otro.goles == null) return '';
        let k = yo.goles > otro.goles ? 'gano' : yo.goles < otro.goles ? 'perdio' : 'empato';
        if (k === 'empato' && (yo.ganador || otro.ganador)) k = yo.ganador ? 'gano' : 'perdio';
        const t = { gano: ['G', 'Ganó'], perdio: ['P', 'Perdió'], empato: ['E', 'Empató'] }[k];
        return `<span class="resultado resultado--${k}" title="${t[1]}">${t[0]}</span>`;
      };
      const fila = (ev, pasado) => {
        const esLocal = String(ev.local.id) === String(id);
        const rival = esLocal ? ev.visita : ev.local;
        return `<li><button type="button" class="ficha__fila" data-partido="${esc(ev.id)}" data-liga-partido="${esc(ev.liga)}">
          <span class="ficha__fecha">${esc(fmt.fechaCorta.format(ev.fecha))}${pasado ? '' : ' · ' + esc(fmt.hora.format(ev.fecha))}</span>
          <span class="ficha__rival">${esLocal ? 'vs' : 'en'} ${escudo(rival.logo, rival.nombre, 'escudo escudo--mini')} ${esc(rival.nombre)}</span>
          ${pasado ? `<span class="ficha__marcador">${ev.local.goles ?? '–'}-${ev.visita.goles ?? '–'}</span>${res(ev)}` : ''}
        </button></li>`;
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

  setInterval(async () => {
    if (document.hidden) return;
    const ahora = Date.now();
    const activas = [...estado.eventos].filter(([, evs]) =>
      [...evs.values()].some((e) => e.estado === 'in' || (e.estado === 'pre' && !aplazado(e.nombreEstado) && e.fecha.getTime() <= ahora && ahora - e.fecha.getTime() < 3 * 3600e3))
    ).map(([id]) => id);
    // Un partido de la noche puede quedar en la fecha de ESPN de ayer: se refrescan ayer y hoy
    await Promise.all(activas.flatMap((liga) => [DIAS[0], DIAS[1]].map(async (dia) => {
      try {
        const { eventos } = await API.partidosDia(liga, dia, true);
        guardarEventos(liga, eventos);
      } catch (e) { /* se reintenta en el siguiente ciclo */ }
    })));
    if (activas.length) repintar();
  }, 60000);

  window.addEventListener('hashchange', () => {
    const id = leerLigaInicial();
    if (id !== estado.liga) seleccionarLiga(id);
  });

  /* ---------- app instalable ---------- */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }

  /* ---------- arranque ---------- */

  $('#alcance-liga').textContent = 'Solo ' + ligaPorId(estado.liga).corto;
  pintarLigas();
  cargarTabla();
  cargarNoticias();
  cargarTemporada();
  cargarPartidos(clavesDe(LIGAS.map((l) => l.id)));
})();
