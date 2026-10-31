/* Capa de datos: API pública de ESPN (sin clave).
   Normaliza las respuestas a objetos simples para que app.js no dependa
   de la forma exacta del JSON. */
(function () {
  const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
  const V2 = 'https://site.api.espn.com/apis/v2/sports/soccer/';
  /* Si el navegador bloquea la petición directa (CORS o red), se reintenta
     una vez a través de este proxy público. */
  const PROXY = 'https://corsproxy.io/?url=';

  const cache = new Map();

  async function getJSON(url, { fresco = false } = {}) {
    if (!fresco && cache.has(url)) return cache.get(url);
    const promesa = (async () => {
      try {
        return await pedir(url);
      } catch (e) {
        return await pedir(PROXY + encodeURIComponent(url));
      }
    })();
    cache.set(url, promesa);
    promesa.catch(() => cache.delete(url));
    return promesa;
  }

  async function pedir(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  const ymd = (d) =>
    d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');

  const num = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') v = v.value ?? v.displayValue;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const logoDe = (team) =>
    team?.logo || team?.logos?.[0]?.href || null;

  /* ---------- Partidos ---------- */

  function normalizarEvento(ev, ligaId) {
    const comp = ev.competitions?.[0] || {};
    const st = comp.status || ev.status || {};
    const tipo = st.type || {};
    const lado = (c) => ({
      id: c?.team?.id || c?.id,
      nombre: c?.team?.shortDisplayName || c?.team?.displayName || c?.team?.name || '—',
      nombreLargo: c?.team?.displayName || c?.team?.name || '—',
      abrev: c?.team?.abbreviation || '',
      logo: logoDe(c?.team),
      goles: num(c?.score),
      ganador: !!c?.winner
    });
    const cs = comp.competitors || [];
    const local = cs.find((c) => c.homeAway === 'home') || cs[0];
    const visita = cs.find((c) => c.homeAway === 'away') || cs[1];
    return {
      id: ev.id,
      liga: ligaId,
      fecha: new Date(ev.date || comp.date),
      estado: tipo.state || 'pre', // pre | in | post
      nombreEstado: tipo.name || '',
      detalle: tipo.shortDetail || tipo.detail || st.displayClock || '',
      reloj: st.displayClock || '',
      sede: comp.venue?.fullName || '',
      ronda: comp.notes?.[0]?.headline || ev.season?.slug || '',
      local: lado(local),
      visita: lado(visita)
    };
  }

  /* La API solo acepta un día por consulta (los rangos devuelven 400). */
  async function partidosDia(ligaId, dia, fresco = false) {
    const url = `${SITE}${ligaId}/scoreboard?dates=${ymd(dia)}`;
    const data = await getJSON(url, { fresco });
    const logoLiga = data?.leagues?.[0]?.logos?.[0]?.href || null;
    const eventos = (data?.events || []).map((e) => normalizarEvento(e, ligaId));
    return { logoLiga, eventos };
  }

  /* ---------- Tabla ---------- */

  const ALIAS = {
    pj: ['gamesPlayed', 'GP'],
    g: ['wins', 'W'],
    e: ['ties', 'D', 'T'],
    p: ['losses', 'L'],
    gf: ['pointsFor', 'F', 'GF'],
    gc: ['pointsAgainst', 'A', 'GA'],
    dg: ['pointDifferential', 'GD'],
    pts: ['points', 'P', 'PTS'],
    pos: ['rank', 'R']
  };

  function stat(stats, clave) {
    for (const nombre of ALIAS[clave]) {
      const s = stats.find((x) => x.name === nombre || x.abbreviation === nombre || x.type === nombre?.toLowerCase());
      if (s) return num(s.value ?? s.displayValue);
    }
    return null;
  }

  function normalizarGrupo(g, i) {
    const entradas = (g.standings?.entries || []).map((en) => {
      const stats = en.stats || [];
      const t = en.team || {};
      return {
        id: t.id,
        nombre: t.displayName || t.name || '—',
        corto: t.shortDisplayName || t.abbreviation || t.displayName || '—',
        abrev: t.abbreviation || '',
        logo: logoDe(t),
        pos: stat(stats, 'pos') ?? en.note?.rank ?? null,
        pj: stat(stats, 'pj'), g: stat(stats, 'g'), e: stat(stats, 'e'), p: stat(stats, 'p'),
        gf: stat(stats, 'gf'), gc: stat(stats, 'gc'), dg: stat(stats, 'dg'), pts: stat(stats, 'pts'),
        zona: en.note ? { color: en.note.color, texto: en.note.description } : null
      };
    });
    entradas.sort((a, b) => {
      if (a.pos != null && b.pos != null && a.pos !== b.pos) return a.pos - b.pos;
      return (b.pts ?? 0) - (a.pts ?? 0) || (b.dg ?? 0) - (a.dg ?? 0) || (b.gf ?? 0) - (a.gf ?? 0);
    });
    entradas.forEach((e, k) => { if (e.pos == null) e.pos = k + 1; });
    return { nombre: g.name || g.abbreviation || `Grupo ${i + 1}`, entradas };
  }

  async function tabla(ligaId) {
    const data = await getJSON(`${V2}${ligaId}/standings`);
    let grupos = data?.children?.length ? data.children : data?.standings ? [data] : [];
    // Algunas competencias anidan subgrupos (p. ej. grupos dentro de una fase)
    grupos = grupos.flatMap((g) => (g.children?.length && !g.standings ? g.children : [g]));
    return grupos.map(normalizarGrupo).filter((g) => g.entradas.length);
  }

  /* ---------- Equipo ---------- */

  async function calendarioEquipo(ligaId, equipoId) {
    const base = `${SITE}${ligaId}/teams/${equipoId}/schedule`;
    const [jugados, proximos] = await Promise.allSettled([
      getJSON(base),
      getJSON(base + '?fixture=true')
    ]);
    const ev = (r) => (r.status === 'fulfilled' ? r.value?.events || [] : []);
    const todos = [...ev(jugados), ...ev(proximos)].map((e) => normalizarEvento(e, ligaId));
    const unicos = [...new Map(todos.map((e) => [e.id, e])).values()];
    const ahora = Date.now();
    return {
      ultimos: unicos.filter((e) => e.estado === 'post').sort((a, b) => b.fecha - a.fecha).slice(0, 5),
      proximos: unicos
        .filter((e) => e.estado !== 'post' && e.fecha.getTime() > ahora - 3 * 3600e3)
        .sort((a, b) => a.fecha - b.fecha)
        .slice(0, 5)
    };
  }

  window.API = { partidosDia, tabla, calendarioEquipo };
})();
