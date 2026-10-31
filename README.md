# Fútbol Online

**Página publicada:** https://juanvidal0409.github.io/futbol_online/

Página web estática con las principales ligas del mundo: tablas de posiciones, equipos y calendario de partidos (ayer, hoy y los próximos 7 días), con resultados en vivo.

## Competencias incluidas

Liga BetPlay (Colombia), Champions League, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Europa League, Copa Libertadores, Primeira Liga, Eredivisie, Brasileirão, Liga Profesional Argentina, Liga MX y MLS.

Para agregar o quitar una liga, edita `js/ligas.js` (el `id` es el código de la liga en ESPN, por ejemplo `esp.2` para la Segunda División de España).

## Qué tiene

- **Partidos**: tira de fechas (ayer, hoy y 7 días más) con el número de partidos por día; todas las ligas, solo la seleccionada o solo tus equipos. Marcadores en vivo que se actualizan cada minuto y horarios en la zona horaria del visitante.
- **Detalle de partido**: al tocar un partido se ven los goles con su minuto y asistencia, tarjetas, cambios, estadísticas (posesión, tiros, córners…), alineaciones con formación y los últimos 5 resultados de cada equipo. Se actualiza solo mientras el partido está en juego.
- **Tabla de posiciones**: con zonas de clasificación y descenso, racha de los últimos 5 partidos y selector de fase o grupo cuando la competencia tiene varias.
- **Eliminatorias**: llaves por ronda (ida, vuelta, global y penales) de la edición más reciente: Champions, Libertadores, playoffs de la Liga BetPlay, etc.
- **Equipos favoritos**: con la estrella se sigue a un equipo; sus partidos salen primero en el calendario y su fila se resalta en la tabla. Se guardan solo en el navegador.
- **Noticias** de la liga seleccionada, enlazadas a la nota original en ESPN.
- **Rápida al volver**: lo consultado se guarda en el navegador con una vigencia corta, así que al recargar aparece al instante.
- **Modo oscuro** automático según el sistema.
- **Instalable** en el celular o el computador como app (desde el menú del navegador, "Instalar" o "Agregar a pantalla de inicio").
- El título de la pestaña muestra cuántos partidos hay en vivo.

## Datos

Los datos vienen de la API pública de ESPN (`site.api.espn.com`), que no necesita clave. Si el navegador bloquea la petición directa, la página reintenta una vez a través de `corsproxy.io`.

La API no acepta rangos de días, pero sí un mes (`dates=AAAAMM`) o un año (`dates=AAAA`) completos: el calendario se carga con dos consultas por liga y la racha y las llaves salen de la consulta del año.

## Cómo verla

No necesita compilación ni dependencias.

- **En local**: abre `index.html` en el navegador, o sirve la carpeta con `python3 -m http.server` y entra a `http://localhost:8000`.
- **En GitHub Pages**: en el repositorio, *Settings → Pages → Build and deployment*, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`. Queda en `https://<usuario>.github.io/futbol_online/`.

## Estructura

```
index.html            estructura de la página
css/styles.css        estilos (paleta de césped, cal y tarjetas; modo oscuro)
js/ligas.js           lista de ligas y días a mostrar
js/almacen.js         caché en el navegador y equipos favoritos
js/util.js            utilidades compartidas (formato, escudos, traducciones)
js/api.js             consultas a la API y normalización de datos
js/partido.js         ventana de detalle de partido
js/app.js             interfaz: ligas, fechas, partidos, tabla, llaves, equipos, noticias
sw.js                 service worker (app instalable)
manifest.webmanifest  datos de la app instalable
iconos/               íconos de la app
```
