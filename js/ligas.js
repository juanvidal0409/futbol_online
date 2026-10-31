/* Ligas disponibles. `id` es el código de liga en la API de ESPN.
   Para agregar una liga basta con añadir una línea aquí. */
window.LIGAS = [
  { id: 'col.1',                 nombre: 'Liga BetPlay',        corto: 'BetPlay',      pais: 'Colombia',     color: '#fcd116' },
  { id: 'uefa.champions',        nombre: 'Champions League',    corto: 'Champions',    pais: 'Europa',       color: '#1b3fa0' },
  { id: 'eng.1',                 nombre: 'Premier League',      corto: 'Premier',      pais: 'Inglaterra',   color: '#5a1a6b' },
  { id: 'esp.1',                 nombre: 'LaLiga',              corto: 'LaLiga',       pais: 'España',       color: '#e8452c' },
  { id: 'ita.1',                 nombre: 'Serie A',             corto: 'Serie A',      pais: 'Italia',       color: '#0a6ab4' },
  { id: 'ger.1',                 nombre: 'Bundesliga',          corto: 'Bundesliga',   pais: 'Alemania',     color: '#d3010c' },
  { id: 'fra.1',                 nombre: 'Ligue 1',             corto: 'Ligue 1',      pais: 'Francia',      color: '#0f1e5a' },
  { id: 'uefa.europa',           nombre: 'Europa League',       corto: 'Europa Lg.',   pais: 'Europa',       color: '#f26b0f' },
  { id: 'conmebol.libertadores', nombre: 'Copa Libertadores',   corto: 'Libertadores', pais: 'Sudamérica',   color: '#b8862b' },
  { id: 'por.1',                 nombre: 'Primeira Liga',       corto: 'Portugal',     pais: 'Portugal',     color: '#006a44' },
  { id: 'ned.1',                 nombre: 'Eredivisie',          corto: 'Eredivisie',   pais: 'Países Bajos', color: '#e4572e' },
  { id: 'bra.1',                 nombre: 'Brasileirão',         corto: 'Brasil',       pais: 'Brasil',       color: '#009c3b' },
  { id: 'arg.1',                 nombre: 'Liga Profesional',    corto: 'Argentina',    pais: 'Argentina',    color: '#5fa8d3' },
  { id: 'mex.1',                 nombre: 'Liga MX',             corto: 'Liga MX',      pais: 'México',       color: '#0b6e4f' },
  { id: 'usa.1',                 nombre: 'MLS',                 corto: 'MLS',          pais: 'Estados Unidos', color: '#1d2d5c' }
];

/* Cuántos días hacia adelante mostrar en el calendario (además de ayer y hoy). */
window.DIAS_ADELANTE = 7;
