# H1-01 · Sliding alien puzzle

- **IF/THEN:** IF al entrar a la escena un NPC alien en el spawn muestra un diálogo que guía al jugador a la primera carpa, AND el sliding puzzle 3×3 de la carpa arma la imagen del alien y al completarlo el jugador regresa donde están los aliens para recibir el consejo esotérico del alien correspondiente, THEN un jugador nuevo llega guiado a la carpa, resuelve el puzzle sin más instrucciones, vuelve al grupo y el consejo esotérico se siente como recompensa.
- **Source section:** — (backfill via dcl-gdd)
- **Cheapest killing test:** greybox en desktop Explorer (Creator Hub), owner self-test, ~15–30 min build + 5 min test
- **Key metric:** 3 de 4 jugadores nuevos completan el ciclo completo (llegar a la carpa, resolver el puzzle, volver y recibir consejo) en ≤5 min guiados solo por el diálogo inicial.
- **Mobile-sensitive:** yes
- **Tested on:** —
- **Parked:** 2026-09-14

## Brief

- **Criterion (external):** 3 de 4 jugadores nuevos completan el ciclo completo (llegar a la carpa, resolver el puzzle, volver al grupo y recibir el consejo esotérico) dentro de 5 minutos, guiados solamente por el diálogo inicial del NPC. Failure looks like: el jugador se queda atascado en el puzzle sin saber que debe tocar las tejas, o completa el puzzle pero no entiende que debe volver al grupo, o nadie llega a la carpa.
- **Kill-check (owner-testable):** el owner comple el ciclo una vez — si como inventor del puzzle el interactuar (tocar una teja, ver que arma la imagen, volver al alien) no se siente obvio y el consejo final no se siente como recompensa (anti-clímax), la hipótesis muere.
- **Rung:** desktop Explorer (el default) — porque el experimento es sobre *inteligibilidad del flujo y feel de la recompensa*, no sobre rendimiento ni input móvil.
- **Who tests:** skill via MCP (smoke mecánico: escena arranca, el puzzle responde, el criterio se puede observar) + creator por mano (verdict feel). Recomendado: ambos, MCP smoke primero.
- **Who launches:** the creator via Creator Hub (su flujo habitual) — el skill no lanza clientes sin pedir.
- **Real:** el diálogo inicial del NPC en el spawn; el sliding puzzle 3×3 (tocar/point-drag de tejas, detección de imagen completada); el pieza-flipch congruente con la imagen objetivo; el paso de vuelta al grupo; el consejo esotérico del alien correspondiente como texto.
- **Faked:** arte — primitivas y geometría de y a priori (carpas como box + techo; NPCs como cajas etiquetadas); aunque las tejas y el panel objetivo ya usan los recortes reales de `OM_krim.png` (dividido 3×3), el resto del arte y la presentación final no; otros jugadores; progresión persistente; carpas más allá de la primera; sonido.
- **Instrumented:** contador de pasos del puzzle; detector de imagen completada (evento log); un timer de ciclo en pantalla o log con timestamp al: dialogo visto → puzzle abierto → puzzle resuelto → consejo recibido; texto debug del estado.
- **Not building:** menú de configuración, inventario, segunda carpa, NPC elegante (una caja de texto basta), arte final, sonido, persistencia, recompensas económicas.
- **Sessions:** v0 — el skill hace el smoke MCP primero, luego el owner se auto-prueba; se espera 1–2 pasadas del owner; se puede cortar temprano si la respuesta ya es inequívoca.
- **Task given to the tester:** "Entra a la escena. Haz lo que harías naturalmente y sigue las pistas que veas. Tómate tu tiempo." (el diálogo del NPC es la única indicación que debe haber)
- **Collected per session:** ¿llegó a la carpa? ¿entendió tocar tejas sin explicación? ¿completó el puzzle? ¿volvió al grupo por su cuenta? ¿el consejo se leyó como recompensa? — con tiempos por cada hito.
- **Briefed:** 2026-09-14

## Sessions
<!-- owned by dcl-prototype -->

- 2026-09-14 · smoke dry-run (agent manual trace) · smoke: passed — all 5 phases reachable, 4+ hitos with timestamps logged, metric observable in console. Puzzle scrambled, pointer events wired, tween on move, solved detection functional. No runtime yet.
- 2026-09-14 · textures + position (owner feedback) · build: passed — tiles now carry real crops of `assets/OM_krim.png` (9 PNGs sliced via System.Drawing into `assets/om_krim_tiles/`); board moved to (45.19, 1.7, 39.29) in tent at (45.19, 39.29); full `OM_krim.png` shown on the OBJETIVO panel as the target; UI mini-grid now a neutral placement aid (grey cells + numbers) instead of color proxies; `TARGET_IMG`/`TILE_COLORS`/`tileTheme` removed. Awaiting owner self-test in Creator Hub.
- 2026-09-14 · texture size guard (DCL 1024px non-HDR limit) · build: passed — `OM_krim.png` (1536×1024) downscaled to `assets/om_krim_full_1024.png` (1024×683) for the OBJETIVO panel; tiles (512×341) already under the limit. Awaiting owner self-test in Creator Hub.
- 2026-09-14 · board reposition (owner editor transform) · build: passed — puzzle moved to (44.3263, 1.665, 40.3794) inside tent with rotation (0, 0.666377, 0, -0.745615) (~84° over Y) matching the owner-placed marker; board now a rotated parent container with tiles/backing/OBJETIVO/pedestal as local children; tiles flipped to vertical plates (scale 0.92×0.92×0.08) so the image faces the entrance. Awaiting owner self-test in Creator Hub.
- 2026-09-14 · new puzzle image 3×2 · build: passed — replaced `OM_krim.png` with `OM_krim_3x3.png` (836×835), sliced into 6 tiles (3 rows × 2 cols → 5 tiles + 1 hole) in `assets/om_krim_3x2_tiles/`. Puzzle logic updated to 3×2 sliding (5-puzzle), backing resized, objetivo panel uses new full image. Awaiting owner self-test in Creator Hub.

## Verdict
<!-- owned by dcl-prototype -->