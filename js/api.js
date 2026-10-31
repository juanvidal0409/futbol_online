/* Capa de datos: API pública de ESPN (sin clave).
   Normaliza las respuestas a objetos simples y las guarda en el navegador
   para que al volver a abrir la página todo aparezca al instante. */
(function () {
  const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
  const V2 = 'https://site.api.espn.com/apis/v2/sports/soccer/';
  /* Si el navegador bloquea la petición directa (CORS o red), se reintenta
     una vez a través de este proxy público. */
  const PROXY = 'https://corsproxy.io/?url=';

  const MIN = 60e3;
  const enVuelo = new Map();

  async function pedir(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function getJSON(url) {
    try {
      return await pedir(url);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) throw e; // un 400/404 no se arregla con el proxy
      return await pedir(PROXY + encodeURIComponent(url));
    }
  }

  /* Consulta con caché: si hay una copia vigente se usa; si no, se pide a la API.
     Si la API falla y hay una copia vieja, se devuelve la vieja. */
  function conCache({ clave, url, vigencia, normalizar, revivir = (x) => x, fresco = false }) {
    const guardado = Almacen.obtener(clave, Infinity);
    const vig = typeof vigencia === 'function' && guardado ? vigencia(guardado.datos) : vigencia;
    const enCache = Almacen.obtener(clave, typeof vig === 'number' ? vig : 0);
    if (!fresco && enCache?.fresco) return Promise.resolve(revivir(enCache.datos));
    if (enVuelo.has(clave)) return enVuelo.get(clave);

    const p = (async () => {
      try {
        const datos = normalizar(await getJSON(url));
        Almacen.guardar(clave, datos);
        return revivir(JSON.parse(JSON.stringify(datos)));
      } catch (e) {
        if (enCache) return revivir(enCache.datos);
        throw e;
      } finally {
        enVuelo.delete(clave);
      }
    })();
    enVuelo.set(clave, p);
    return p;
  }

  /* ---------- utilidades ---------- */

  const dos = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + dos(d.getMonth() + 1) + dos(d.getDate());
  const num = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'object') v = v.value ?? v.displayValue;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const logoDe = (team) => team?.logo || team?.logos?.[0]?.href || null;

  /* ---------- partidos ---------- */

  function normalizarEvento(ev, ligaId) {
    const comp = ev.competitions?.[0] || {};
    const st = comp.status || ev.status || {};
    const tipo = st.type || {};
    const serie = comp.series;
    const lado = (c) => ({
      id: String(c?.team?.id ?? c?.id ?? ''),
      nombre: c?.team?.shortDisplayName || c?.team?.displayName || c?.team?.name || '—',
      nombreLargo: c?.team?.displayName || c?.team?.name || '—',
      abrev: c?.team?.abbreviation || '',
      logo: logoDe(c?.team),
      goles: num(c?.score),
      penales: num(c?.shootoutScore),
      ganador: !!c?.winner
    });
    const cs = comp.competitors || [];
    const local = cs.find((c) => c.homeAway === 'home') || cs[0];
    const visita = cs.find((c) => c.homeAway === 'away') || cs[1];
    return {
      id: String(ev.id),
      liga: ligaId,
      fecha: new Date(ev.date || comp.date).getTime(),
      estado: tipo.state || 'pre', // pre | in | post
      nombreEstado: tipo.name || '',
      detalle: tipo.shortDetail || tipo.detail || '',
      reloj: st.displayClock || '',
      sede: comp.venue?.fullName || '',
      ronda: ev.season?.slug || '',
      temporada: ev.season?.year ?? null,
      nota: comp.notes?.[0]?.headline || '',
      serie: serie ? {
        titulo: serie.title || '',
        completa: !!serie.completed,
        ganador: String((serie.competitors || []).find((c) => c.winner)?.id ?? '')
      } : null,
      local: lado(local),
      visita: lado(visita)
    };
  }

  const revivirEventos = (lista) => lista.map((e) => ({ ...e, fecha: new Date(e.fecha) }));

  function scoreboard(ligaId, consulta, clave, vigencia, fresco) {
    return conCache({
      clave, vigencia, fresco,
      url: `${SITE}${ligaId}/scoreboard?dates=${consulta}&limit=500`,
      normalizar: (data) => ({
        logoLiga: data?.leagues?.[0]?.logos?.[0]?.href || null,
        eventos: (data?.events || []).map((e) => normalizarEvento(e, ligaId))
      }),
      revivir: (d) => ({ ...d, eventos: revivirEventos(d.eventos) })
    });
  }

  /* Un mes completo en una sola consulta (la API no acepta rangos de días). */
  function partidosMes(ligaId, anio, mes, fresco = false) {
    const c = `${anio}${dos(mes + 1)}`;
    return scoreboard(ligaId, c, `mes:${ligaId}:${c}`, 5 * MIN, fresco);
  }

  /* Un solo día: se usa para refrescar marcadores en vivo. */
  function partidosDia(ligaId, dia, fresco = false) {
    const c = ymd(dia);
    return scoreboard(ligaId, c, `dia:${ligaId}:${c}`, 30e3, fresco);
  }

  /* Toda la temporada de la liga (para la racha y las llaves).
     Las ligas europeas cruzan dos años: de enero a junio también se pide el año anterior. */
  async function temporada(ligaId) {
    const hoy = new Date();
    const anios = [hoy.getFullYear()];
    if (hoy.getMonth() <= 5) anios.unshift(hoy.getFullYear() - 1);
    const partes = await Promise.all(anios.map((a) => scoreboard(ligaId, String(a), `anio:${ligaId}:${a}`, 30 * MIN, false)));
    const todos = new Map();
    partes.forEach((p) => p.eventos.forEach((e) => todos.set(e.id, e)));
    return [...todos.values()].sort((a, b) => a.fecha - b.fecha);
  }

  /* ---------- tabla ---------- */

  const ALIAS = {
    pj: ['gamesPlayed', 'GP'], g: ['wins', 'W'], e: ['ties', 'D'], p: ['losses', 'L'],
    gf: ['pointsFor', 'F'], gc: ['pointsAgainst', 'A'], dg: ['pointDifferential', 'GD'],
    pts: ['points', 'P'], pos: ['rank', 'R']
  };

  function stat(stats, clave) {
    for (const nombre of ALIAS[clave]) {
      const s = stats.find((x) => x.name === nombre || x.abbreviation === nombre);
      if (s) return num(s.value ?? s.displayValue);
    }
    return null;
  }

  function normalizarGrupo(g, i) {
    const entradas = (g.standings?.entries || []).map((en) => {
      const stats = en.stats || [];
      const t = en.team || {};
      return {
        id: String(t.id ?? ''),
        nombre: t.displayName || t.name || '—',
        corto: t.shortDisplayName || t.abbreviation || t.displayName || '—',
        logo: logoDe(t),
        pos: stat(stats, 'pos') ?? en.note?.rank ?? null,
        pj: stat(stats, 'pj'), g: stat(stats, 'g'), e: stat(stats, 'e'), p: stat(stats, 'p'),
        gf: stat(stats, 'gf'), gc: stat(stats, 'gc'), dg: stat(stats, 'dg'), pts: stat(stats, 'pts'),
        zona: en.note?.description ? { color: '#' + String(en.note.color || '').replace('#', ''), texto: en.note.description } : null
      };
    });
    entradas.sort((a, b) => {
      if (a.pos != null && b.pos != null && a.pos !== b.pos) return a.pos - b.pos;
      return (b.pts ?? 0) - (a.pts ?? 0) || (b.dg ?? 0) - (a.dg ?? 0) || (b.gf ?? 0) - (a.gf ?? 0);
    });
    entradas.forEach((e, k) => { if (e.pos == null) e.pos = k + 1; });
    return { nombre: g.name || g.abbreviation || `Grupo ${i + 1}`, entradas };
  }

  function tabla(ligaId) {
    return conCache({
      clave: `tabla:${ligaId}`, vigencia: 10 * MIN,
      url: `${V2}${ligaId}/standings`,
      normalizar: (data) => {
        let grupos = data?.children?.length ? data.children : data?.standings ? [data] : [];
        grupos = grupos.flatMap((g) => (g.children?.length && !g.standings ? g.children : [g]));
        return grupos.map(normalizarGrupo).filter((g) => g.entradas.length);
      }
    });
  }

  /* ---------- noticias ---------- */

  function noticias(ligaId) {
    return conCache({
      clave: `noticias:${ligaId}`, vigencia: 15 * MIN,
      url: `${SITE}${ligaId}/news`,
      normalizar: (data) => (data?.articles || [])
        .map((a) => ({
          titulo: a.headline || '',
          resumen: a.description || '',
          fecha: a.published || a.lastModified || null,
          url: a.links?.web?.href || null,
          imagen: (a.images || []).find((i) => i.url)?.url || null,
          video: a.type === 'Media'
        }))
        .filter((a) => a.titulo && a.url)
    });
  }

  /* ---------- detalle de partido ---------- */

  const STATS = [
    ['possessionPct', 'Posesión', '%'],
    ['totalShots', 'Tiros'],
    ['shotsOnTarget', 'Tiros al arco'],
    ['wonCorners', 'Tiros de esquina'],
    ['foulsCommitted', 'Faltas'],
    ['offsides', 'Fueras de lugar'],
    ['yellowCards', 'Amarillas'],
    ['redCards', 'Rojas'],
    ['saves', 'Atajadas'],
    ['precisionPases', 'Precisión de pases', '%']
  ];

  function tipoEvento(k) {
    const t = (k.type?.type || '').toLowerCase();
    if (k.scoringPlay || /goal/.test(t)) {
      if (/own/.test(t)) return 'autogol';
      if (/penalty/.test(t)) return 'penal';
      return 'gol';
    }
    if (/yellow/.test(t)) return /red/.test(t) ? 'roja' : 'amarilla';
    if (/red/.test(t)) return 'roja';
    if (/substitution/.test(t)) return 'cambio';
    if (/penalty.*miss|miss.*penalty/.test(t)) return 'penal-fallado';
    return null;
  }

  function normalizarPartido(s, ligaId) {
    const comp = s.header?.competitions?.[0] || {};
    const tipo = comp.status?.type || {};
    const cs = comp.competitors || [];
    const box = s.boxscore?.teams || [];
    const rosters = s.rosters || [];
    const l5 = s.lastFiveGames || [];

    const lado = (ha) => {
      const c = cs.find((x) => x.homeAway === ha) || {};
      const id = String(c.team?.id ?? '');
      const b = box.find((x) => x.homeAway === ha || String(x.team?.id) === id);
      const r = rosters.find((x) => x.homeAway === ha || String(x.team?.id) === id);
      const f = l5.find((x) => String(x.team?.id) === id);
      const valor = (n) => {
        const st = (b?.statistics || []).find((x) => x.name === n);
        return st ? num(st.displayValue ?? st.value) : null;
      };
      const stats = {};
      STATS.forEach(([n]) => { stats[n] = valor(n); });
      const acc = valor('accuratePasses'), tot = valor('totalPasses');
      stats.precisionPases = acc != null && tot ? Math.round((acc / tot) * 100) : null;
      const jugador = (p) => ({
        num: p.jersey || '',
        nombre: p.athlete?.displayName || p.athlete?.shortName || '—',
        pos: p.position?.abbreviation || '',
        entro: !!p.subbedIn,
        salio: !!p.subbedOut
      });
      const plantel = r?.roster || [];
      return {
        id,
        nombre: c.team?.displayName || c.team?.name || '—',
        corto: c.team?.shortDisplayName || c.team?.abbreviation || c.team?.displayName || '—',
        logo: logoDe(c.team),
        goles: num(c.score),
        penales: num(c.shootoutScore),
        ganador: !!c.winner,
        formacion: r?.formation || '',
        titulares: plantel.filter((p) => p.starter).map(jugador),
        suplentes: plantel.filter((p) => !p.starter).map(jugador),
        stats,
        forma: (f?.events || []).map((e) => ({
          res: e.gameResult || '',
          marcador: e.score || '',
          rival: e.opponent?.displayName || '',
          enCasa: e.atVs !== '@',
          fecha: e.gameDate || null
        }))
      };
    };

    const local = lado('home');
    const visita = lado('away');
    const eventos = (s.keyEvents || []).map((k) => {
      const t = tipoEvento(k);
      if (!t) return null;
      const ps = (k.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
      return {
        tipo: t,
        minuto: k.clock?.displayValue || '',
        orden: num(k.clock?.value) ?? 0,
        equipo: String(k.team?.id ?? ''),
        jugador: ps[0] || '',
        segundo: ps[1] || '', // asistencia en goles; jugador que sale en cambios
        texto: k.text || ''
      };
    }).filter(Boolean);

    return {
      id: String(s.header?.id ?? ''),
      liga: ligaId,
      estado: tipo.state || 'pre',
      nombreEstado: tipo.name || '',
      detalle: tipo.shortDetail || '',
      reloj: comp.status?.displayClock || '',
      fecha: new Date(comp.date || s.header?.competitions?.[0]?.date || Date.now()).getTime(),
      nota: comp.notes?.[0]?.headline || '',
      sede: s.gameInfo?.venue?.fullName || '',
      ciudad: s.gameInfo?.venue?.address?.city || '',
      arbitro: (s.gameInfo?.officials || []).find((o) => /referee/i.test(o.position?.name || o.position?.displayName || ''))?.displayName
        || s.gameInfo?.officials?.[0]?.displayName || '',
      local, visita, eventos,
      stats: STATS.map(([clave, etiqueta, unidad]) => ({
        clave, etiqueta, unidad: unidad || '',
        local: local.stats[clave], visita: visita.stats[clave]
      })).filter((x) => x.local != null && x.visita != null)
    };
  }

  function partido(ligaId, eventoId, fresco = false) {
    return conCache({
      clave: `partido:${ligaId}:${eventoId}`,
      vigencia: (d) => (d.estado === 'post' ? 24 * 60 * MIN : d.estado === 'pre' ? 10 * MIN : 25e3),
      fresco,
      url: `${SITE}${ligaId}/summary?event=${encodeURIComponent(eventoId)}`,
      normalizar: (s) => normalizarPartido(s, ligaId),
      revivir: (d) => ({ ...d, fecha: new Date(d.fecha) })
    });
  }

  /* ---------- equipo ---------- */

  async function calendarioEquipo(ligaId, equipoId) {
    const base = `${SITE}${ligaId}/teams/${equipoId}/schedule`;
    const opciones = (sufijo, url) => ({
      clave: `equipo:${ligaId}:${equipoId}:${sufijo}`, vigencia: 10 * MIN, url,
      normalizar: (d) => (d?.events || []).map((e) => normalizarEvento(e, ligaId)),
      revivir: revivirEventos
    });
    const [jugados, proximos] = await Promise.allSettled([
      conCache(opciones('jugados', base)),
      conCache(opciones('proximos', base + '?fixture=true'))
    ]);
    if (jugados.status === 'rejected' && proximos.status === 'rejected') throw jugados.reason;
    const val = (r) => (r.status === 'fulfilled' ? r.value : []);
    const unicos = [...new Map([...val(jugados), ...val(proximos)].map((e) => [e.id, e])).values()];
    const ahora = Date.now();
    return {
      ultimos: unicos.filter((e) => e.estado === 'post').sort((a, b) => b.fecha - a.fecha).slice(0, 5),
      proximos: unicos
        .filter((e) => e.estado !== 'post' && e.fecha.getTime() > ahora - 3 * 3600e3)
        .sort((a, b) => a.fecha - b.fecha)
        .slice(0, 5)
    };
  }

  window.API = { partidosMes, partidosDia, temporada, tabla, noticias, partido, calendarioEquipo };
})();
