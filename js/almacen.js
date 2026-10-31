/* Almacenamiento en el navegador: caché de datos y equipos favoritos.
   Todo va envuelto en try/catch porque localStorage puede no existir
   (modo privado, almacenamiento lleno o bloqueado). */
(function () {
  const PREFIJO = 'fo:cache:';
  const CLAVE_FAV = 'fo:favoritos';

  function leer(clave) {
    try {
      const raw = localStorage.getItem(PREFIJO + clave);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* Devuelve { datos, fresco } o null. `fresco` indica si sigue dentro de su vigencia. */
  function obtener(clave, vigenciaMs) {
    const r = leer(clave);
    if (!r) return null;
    return { datos: r.d, fresco: Date.now() - r.t < vigenciaMs };
  }

  function guardar(clave, datos) {
    const valor = JSON.stringify({ t: Date.now(), d: datos });
    try {
      localStorage.setItem(PREFIJO + clave, valor);
    } catch (e) {
      // Almacenamiento lleno: se borra la mitad más vieja de la caché y se reintenta una vez
      try {
        limpiar(0.5);
        localStorage.setItem(PREFIJO + clave, valor);
      } catch (e2) { /* sin caché esta vez */ }
    }
  }

  function limpiar(fraccion = 1) {
    try {
      const entradas = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIJO)) {
          let t = 0;
          try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (e) {}
          entradas.push([k, t]);
        }
      }
      entradas.sort((a, b) => a[1] - b[1]);
      entradas.slice(0, Math.ceil(entradas.length * fraccion)).forEach(([k]) => localStorage.removeItem(k));
    } catch (e) {}
  }

  /* ---------- favoritos ----------
     Los ids de equipo de ESPN son globales: Atlético Nacional tiene el mismo id
     en la Liga BetPlay y en la Libertadores, así que basta con el id. */
  let favoritos = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_FAV) || '[]');
    favoritos = new Map(raw.map((f) => [String(f.id), f]));
  } catch (e) {}

  const escuchas = new Set();

  function guardarFavoritos() {
    try { localStorage.setItem(CLAVE_FAV, JSON.stringify([...favoritos.values()])); } catch (e) {}
    escuchas.forEach((fn) => fn());
  }

  window.Almacen = {
    obtener,
    guardar,
    limpiar,
    favoritos: {
      tiene: (id) => favoritos.has(String(id)),
      lista: () => [...favoritos.values()],
      alternar(equipo) {
        const id = String(equipo.id);
        if (favoritos.has(id)) favoritos.delete(id);
        else favoritos.set(id, { id, nombre: equipo.nombre, logo: equipo.logo || null });
        guardarFavoritos();
        return favoritos.has(id);
      },
      alCambiar: (fn) => escuchas.add(fn)
    }
  };
})();
