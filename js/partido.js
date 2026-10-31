/* Detalle de un partido: goles, tarjetas, cambios, estadísticas y alineaciones. */
(function () {
  const { esc, fmt, escudo, textoEstado, traducirNota, aplazado } = window.FO;
  const dialogo = document.getElementById('detalle');
  const cuerpo = document.getElementById('detalle-cuerpo');
  let actual = null;      // { liga, id, pestana }
  let temporizador = null;

  document.getElementById('detalle-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
  dialogo.addEventListener('close', () => { clearInterval(temporizador); actual = null; });

  cuerpo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pestana]');
    if (!b || !actual) return;
    actual.pestana = b.dataset.pestana;
    cuerpo.querySelectorAll('[data-pestana]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    cuerpo.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== actual.pestana; });
  });

  async function abrir(ligaId, eventoId, previo) {
    clearInterval(temporizador);
    actual = { liga: ligaId, id: eventoId, pestana: null };
    const l = window.LIGAS.find((x) => x.id === ligaId) || {};
    // Mientras carga se muestra lo que ya se sabe por el calendario
    cuerpo.innerHTML = cabecera(previo ? {
      ...previo,
      local: { ...previo.local, nombre: previo.local.nombreLargo },
      visita: { ...previo.visita, nombre: previo.visita.nombreLargo }
    } : null, l) + `<div class="vacio"><span class="balon" aria-hidden="true"></span><p>Cargando detalle del partido…</p></div>`;
    if (!dialogo.open) dialogo.showModal();
    await cargar(false);
  }

  async function cargar(fresco) {
    if (!actual) return;
    const { liga, id } = actual;
    const l = window.LIGAS.find((x) => x.id === liga) || {};
    try {
      const p = await API.partido(liga, id, fresco);
      if (!actual || actual.id !== id) return;
      pintar(p, l);
      clearInterval(temporizador);
      if (p.estado === 'in') temporizador = setInterval(() => { if (!document.hidden) cargar(true); }, 30000);
    } catch (err) {
      console.warn('Detalle', err);
      if (!actual || actual.id !== id) return;
      const viejo = cuerpo.querySelector('.vacio');
      if (viejo) viejo.outerHTML = `<div class="vacio vacio--error"><p><strong>No se pudo cargar el detalle del partido.</strong></p>
        <p>Revisa tu conexión a internet y vuelve a intentarlo.</p>
        <button type="button" class="boton" id="detalle-reintentar">Reintentar</button></div>`;
      document.getElementById('detalle-reintentar')?.addEventListener('click', () => cargar(true));
    }
  }

  function cabecera(p, l) {
    if (!p) return `<header class="detalle__cabeza" style="--liga:${l.color}"><p class="detalle__liga">${esc(l.nombre || '')}</p></header>`;
    const fecha = p.fecha instanceof Date ? p.fecha : new Date(p.fecha);
    const pre = p.estado === 'pre' && !aplazado(p.nombreEstado);
    const marcador = pre
      ? `<span class="detalle__hora">${esc(fmt.hora.format(fecha))}</span>`
      : `<span class="detalle__goles">${p.local.goles ?? '–'}<span>-</span>${p.visita.goles ?? '–'}</span>`;
    const pen = p.local.penales != null && p.visita.penales != null ? `<span class="detalle__pen">Penales ${p.local.penales}-${p.visita.penales}</span>` : '';
    const estado = textoEstado(p);
    const lado = (t, clase) => `<div class="detalle__equipo ${clase}">
        ${escudo(t.logo, t.nombre, 'escudo escudo--detalle')}
        <span>${esc(t.nombre)}</span>
      </div>`;
    const datos = [
      FO.capital(fmt.fechaHora.format(fecha)),
      p.sede ? p.sede + (p.ciudad ? ', ' + p.ciudad : '') : '',
      p.arbitro ? 'Árbitro: ' + p.arbitro : ''
    ].filter(Boolean);
    return `<header class="detalle__cabeza" style="--liga:${l.color}">
      <p class="detalle__liga">${esc(l.nombre || '')}${p.nota ? ' · ' + esc(traducirNota(p.nota)) : ''}</p>
      <div class="detalle__marcador">
        ${lado(p.local, 'detalle__equipo--local')}
        <div class="detalle__centro">
          ${marcador}
          ${pen}
          ${estado ? `<span class="chip ${p.estado === 'in' ? 'chip--vivo' : 'chip--claro'}">${p.estado === 'in' ? '<i class="vivo-punto"></i>' : ''}${esc(estado)}</span>` : ''}
        </div>
        ${lado(p.visita, 'detalle__equipo--visita')}
      </div>
      <p class="detalle__datos">${datos.map(esc).join('<br>')}</p>
    </header>`;
  }

  function iconoEvento(tipo) {
    if (tipo === 'amarilla') return '<span class="tarjeta tarjeta--amarilla" aria-label="Tarjeta amarilla"></span>';
    if (tipo === 'roja') return '<span class="tarjeta tarjeta--roja" aria-label="Tarjeta roja"></span>';
    if (tipo === 'cambio') return '<span class="icono-cambio" aria-label="Cambio">⇄</span>';
    if (tipo === 'penal-fallado') return '<span class="icono-gol icono-gol--fallado" aria-label="Penal fallado">⚽</span>';
    return '<span class="icono-gol" aria-label="Gol">⚽</span>';
  }

  function lineaEvento(ev, p) {
    const local = ev.equipo === p.local.id;
    let texto = `<strong>${esc(ev.jugador || '—')}</strong>`;
    if (ev.tipo === 'gol' && ev.segundo) texto += `<small>Asistencia: ${esc(ev.segundo)}</small>`;
    if (ev.tipo === 'penal') texto += '<small>De penal</small>';
    if (ev.tipo === 'autogol') texto += '<small>En contra</small>';
    if (ev.tipo === 'penal-fallado') texto += '<small>Penal fallado</small>';
    if (ev.tipo === 'cambio') texto = `<strong>Entra ${esc(ev.jugador || '—')}</strong>${ev.segundo ? `<small>Sale ${esc(ev.segundo)}</small>` : ''}`;
    return `<li class="linea ${local ? 'linea--local' : 'linea--visita'} linea--${ev.tipo}">
      <span class="linea__min">${esc(ev.minuto)}</span>
      <span class="linea__icono">${iconoEvento(ev.tipo)}</span>
      <span class="linea__texto">${texto}</span>
    </li>`;
  }

  function panelResumen(p) {
    const evs = [...p.eventos].sort((a, b) => a.orden - b.orden);
    if (!evs.length) {
      return `<p class="detalle__nada">${p.estado === 'post' ? 'No hay registro de goles ni tarjetas para este partido.' : 'Todavía no hay goles ni tarjetas.'}</p>`;
    }
    return `<ol class="lineas">${evs.map((e) => lineaEvento(e, p)).join('')}</ol>`;
  }

  function panelEstadisticas(p) {
    return `<ul class="stats">${p.stats.map((s) => {
      const total = (s.local || 0) + (s.visita || 0);
      const pl = s.unidad === '%' && s.clave === 'possessionPct' ? s.local : total ? (s.local / total) * 100 : 50;
      const v = (x) => (s.unidad ? `${Math.round(x)}${s.unidad}` : x);
      const mejorL = s.local > s.visita, mejorV = s.visita > s.local;
      return `<li class="stat">
        <span class="stat__val${mejorL ? ' stat__val--mas' : ''}">${v(s.local)}</span>
        <span class="stat__nombre">${esc(s.etiqueta)}</span>
        <span class="stat__val${mejorV ? ' stat__val--mas' : ''}">${v(s.visita)}</span>
        <span class="stat__barra" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pl))}%"></i></span>
      </li>`;
    }).join('')}</ul>`;
  }

  function listaJugadores(js, suplentes) {
    if (!js.length) return '';
    return `<ul class="plantel">${js.map((j) => `<li>
      <span class="plantel__num">${esc(j.num)}</span>
      <span class="plantel__nombre">${esc(j.nombre)}</span>
      <span class="plantel__pos">${esc(j.pos)}</span>
      ${!suplentes && j.salio ? '<span class="plantel__mov plantel__mov--sale" title="Salió">▼</span>' : ''}
      ${suplentes && j.entro ? '<span class="plantel__mov plantel__mov--entra" title="Entró">▲</span>' : ''}
    </li>`).join('')}</ul>`;
  }

  function panelAlineaciones(p) {
    const col = (t) => `<div class="alineacion">
      <h4>${escudo(t.logo, t.nombre, 'escudo escudo--mini')} ${esc(t.corto)} ${t.formacion ? `<small>${esc(t.formacion)}</small>` : ''}</h4>
      ${listaJugadores(t.titulares, false)}
      ${t.suplentes.length ? `<h5>Suplentes</h5>${listaJugadores(t.suplentes, true)}` : ''}
    </div>`;
    return `<div class="alineaciones">${col(p.local)}${col(p.visita)}</div>`;
  }

  function forma(t) {
    if (!t.forma.length) return '<p class="detalle__nada">Sin partidos recientes.</p>';
    const R = { W: ['G', 'gano', 'Ganó'], D: ['E', 'empato', 'Empató'], L: ['P', 'perdio', 'Perdió'] };
    return `<ul class="forma">${t.forma.map((f) => {
      const r = R[f.res] || ['–', 'empato', ''];
      return `<li><span class="resultado resultado--${r[1]}" title="${r[2]}">${r[0]}</span>
        <span>${f.enCasa ? 'vs' : 'en'} ${esc(f.rival)}</span><b>${esc(f.marcador)}</b></li>`;
    }).join('')}</ul>`;
  }

  function panelPrevia(p) {
    return `<div class="alineaciones">
      <div class="alineacion"><h4>${escudo(p.local.logo, p.local.nombre, 'escudo escudo--mini')} ${esc(p.local.corto)}</h4>${forma(p.local)}</div>
      <div class="alineacion"><h4>${escudo(p.visita.logo, p.visita.nombre, 'escudo escudo--mini')} ${esc(p.visita.corto)}</h4>${forma(p.visita)}</div>
    </div>`;
  }

  function pintar(p, l) {
    const pestanas = [];
    if (p.estado !== 'pre' || p.eventos.length) pestanas.push(['resumen', 'Resumen', panelResumen(p)]);
    if (p.stats.length) pestanas.push(['estadisticas', 'Estadísticas', panelEstadisticas(p)]);
    if (p.local.titulares.length || p.visita.titulares.length) pestanas.push(['alineaciones', 'Alineaciones', panelAlineaciones(p)]);
    if (p.local.forma.length || p.visita.forma.length) pestanas.push(['previa', 'Últimos partidos', panelPrevia(p)]);

    if (!actual.pestana || !pestanas.some(([k]) => k === actual.pestana)) actual.pestana = pestanas[0]?.[0] || null;

    cuerpo.innerHTML = cabecera(p, l) + (pestanas.length
      ? `<div class="pestanas" role="tablist">${pestanas.map(([k, t]) =>
          `<button type="button" role="tab" data-pestana="${k}" aria-selected="${k === actual.pestana}">${t}</button>`).join('')}</div>
         ${pestanas.map(([k, , html]) => `<section class="detalle__panel" data-panel="${k}" ${k === actual.pestana ? '' : 'hidden'}>${html}</section>`).join('')}`
      : `<p class="detalle__nada detalle__panel">ESPN todavía no publica información de este partido.</p>`);
  }

  window.Partido = { abrir };
})();
