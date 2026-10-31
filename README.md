# Fútbol Online

Página web estática con las principales ligas del mundo: tablas de posiciones, equipos y calendario de partidos (ayer, hoy y los próximos 7 días), con resultados en vivo.

## Competencias incluidas

Liga BetPlay (Colombia), Champions League, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Europa League, Copa Libertadores, Primeira Liga, Eredivisie, Brasileirão, Liga Profesional Argentina, Liga MX y MLS.

Para agregar o quitar una liga, edita `js/ligas.js` (el `id` es el código de la liga en ESPN, por ejemplo `esp.2` para la Segunda División de España).

## Qué tiene

- **Partidos**: tira de fechas con el número de partidos por día, todas las ligas o solo la seleccionada, marcador en vivo (se actualiza cada minuto mientras haya partidos en juego) y horarios en la zona horaria del visitante.
- **Tabla de posiciones**: con zonas de clasificación y descenso, y selector de fase o grupo cuando la competencia tiene varias (Liga BetPlay: Clausura, reclasificación, cuadrangulares).
- **Equipos**: buscador y ficha de cada equipo con su posición, próximos partidos y últimos resultados.

## Datos

Los datos vienen de la API pública de ESPN (`site.api.espn.com`), que no necesita clave. Si el navegador bloquea la petición directa, la página reintenta una vez a través de `corsproxy.io`.

## Cómo verla

No necesita compilación ni dependencias.

- **En local**: abre `index.html` en el navegador, o sirve la carpeta con `python3 -m http.server` y entra a `http://localhost:8000`.
- **En GitHub Pages**: en el repositorio, *Settings → Pages → Build and deployment*, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`. Queda en `https://<usuario>.github.io/futbol_online/`.

## Estructura

```
index.html      estructura de la página
css/styles.css  estilos (paleta de césped, cal y tarjetas)
js/ligas.js     lista de ligas y días a mostrar
js/api.js       consultas a la API y normalización de datos
js/app.js       interfaz: ligas, fechas, partidos, tabla, equipos y ficha
```
