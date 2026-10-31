/* Utilidades compartidas por app.js y partido.js */
(function () {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const fmt = {
    hora: new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }),
    diaSemana: new Intl.DateTimeFormat('es-CO', { weekday: 'short' }),
    fechaLarga: new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
    fechaCorta: new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }),
    fechaHora: new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  };

  function escudo(url, nombre, clase = 'escudo') {
    const inicial = esc((nombre || '?').trim().charAt(0).toUpperCase());
    const vacio = `${clase} escudo--vacio`;
    if (url) return `<img class="${clase}" src="${esc(url)}" alt="" loading="lazy" width="28" height="28" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${vacio}',textContent:'${inicial}'}))">`;
    return `<span class="${vacio}" aria-hidden="true">${inicial}</span>`;
  }

  function horaHTML(fecha) {
    const partes = fmt.hora.formatToParts(fecha);
    const sufijo = partes.filter((p) => p.type === 'dayPeriod').map((p) => p.value).join('');
    const hora = partes.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    return `<span class="marcador__hora">${esc(hora)}${sufijo ? `<small>${esc(sufijo)}</small>` : ''}</span>`;
  }

  const aplazado = (nombreEstado) => /POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED|DELAYED/.test(nombreEstado || '');

  /* Texto corto del estado de un partido: "67'", "Descanso", "Final", "Aplazado"… */
  function textoEstado(ev) {
    if (aplazado(ev.nombreEstado)) return /SUSPENDED|ABANDONED/.test(ev.nombreEstado) ? 'Suspendido' : 'Aplazado';
    if (ev.estado === 'in') {
      if (/HALFTIME/.test(ev.nombreEstado) || ev.detalle === 'HT') return 'Descanso';
      if (/SHOOTOUT/.test(ev.nombreEstado)) return 'Penales';
      return ev.reloj || ev.detalle || 'En juego';
    }
    if (ev.estado === 'post') {
      if (/AET|ET/.test(ev.detalle)) return 'Final (prórroga)';
      if (/PEN|Pens/i.test(ev.detalle) || ev.local?.penales != null) return 'Final (penales)';
      return 'Final';
    }
    return '';
  }

  /* Rondas de eliminación directa (slug de ESPN → nombre en español) */
  const RONDAS = [
    [/knockout-round-playoffs?|playoff/, 'Playoff'],
    [/round-of-64/, 'Treintaidosavos'],
    [/round-of-32/, 'Dieciseisavos'],
    [/round-of-16/, 'Octavos de final'],
    [/quarterfinals?/, 'Cuartos de final'],
    [/semifinals?/, 'Semifinales'],
    [/^finals?$|---finals?$/, 'Final'],
    [/first-stage/, 'Primera fase'],
    [/second-stage/, 'Segunda fase'],
    [/third-stage/, 'Tercera fase']
  ];
  function nombreRonda(slug) {
    const parte = (slug || '').split('---').pop();
    for (const [re, es] of RONDAS) if (re.test(parte) || re.test(slug)) return es;
    return capital(parte.replace(/-/g, ' '));
  }

  /* Traduce las notas de ESPN sobre ida/vuelta y penales */
  function traducirNota(t) {
    return String(t || '')
      .replace(/1st Leg/gi, 'Ida')
      .replace(/2nd Leg/gi, 'Vuelta')
      .replace(/Tied on aggregate/gi, 'Empate en el global')
      .replace(/Aggregate/gi, 'Global')
      .replace(/(\S+) (?:win|advance)s? (\d+-\d+) on penalties/gi, '$1 gana $2 en penales')
      .replace(/(\S+) (?:win|advance)s? (\d+-\d+) on aggregate/gi, '$1 avanza $2 en el global')
      .replace(/(\S+) advances?/gi, '$1 avanza')
      .replace(/ - /g, ' · ');
  }

  window.FO = { esc, capital, fmt, escudo, horaHTML, aplazado, textoEstado, nombreRonda, traducirNota };
})();
