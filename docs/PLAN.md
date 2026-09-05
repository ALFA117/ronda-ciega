# Ronda Ciega — plan de cierre

100 tareas para llevar el proyecto de "funciona" a "entregable que compite".
Deadline: **viernes 11 de septiembre de 2026**. Hoy es el 5 → quedan 6 días.

Estado al escribir esto: programa desplegado en devnet, privacidad verificada
en vivo, matching en una sola transacción, frontend desplegado en
`ronda-ciega.vercel.app`.

Orden de ejecución: **E → C → D → F → G → A → H → I → J**. La claridad y lo
visual primero porque es lo que ven los jueces; el VRF y el undelegate después
porque el requisito duro de elegibilidad ya está cubierto por el ER.

---

## A. Programa on-chain — cerrar lo que falta (15)

1. Solicitar aleatoriedad VRF al abrir la ronda (`request_round_randomness`)
2. Implementar el callback VRF que llena `randomness` y `randomness_fulfilled`
3. Bloquear `run_matching` si hay empates posibles y el VRF no llegó
4. Test del desempate: dos proponentes que el receptor no rankeó
5. `commit_and_undelegate` de `Round` al liquidar, para devolverla a L1
6. Cerrar las cuentas `Preferences` en el ER sin commitearlas
7. Cerrar `MatchState` y devolver la renta a la ronda
8. Instrucción `close_round_account` para recuperar renta en L1
9. Permitir que un participante retire su lista antes del deadline
10. Validar que `seal_preferences` no ingiera dos veces la misma cuenta
11. Emitir `RoundSettled` también desde `tick`, no solo desde `run_matching`
12. Guardar en `Round` cuántas propuestas hubo en total (métrica pública)
13. Guardar el timestamp de liquidación para poder mostrar duración real
14. Revisar overflow en todos los `as u8` del path de matching
15. Redesplegar y regenerar IDL tras los cambios

## B. Cliente y datos (10)

16. Suscripción por websocket a la cuenta `Round` en vez de polling cada 3 s
17. Cache de la conexión TEE por wallet con revalidación silenciosa
18. Reintento con backoff cuando el RPC público devuelve 429
19. Variable de entorno para un RPC dedicado (Helius) y documentarla
20. Detectar wallet en mainnet y avisar antes de que falle la transacción
21. Detectar saldo insuficiente antes de crear ronda o unirse
22. Manejar el caso "ronda delegada pero el ER no responde"
23. Tipos TypeScript generados del IDL en vez de `any` en los decoders
24. Un solo hook `useRoundActions` que agrupe todas las instrucciones
25. Estado optimista al sellar la lista, con rollback si falla

## C. Dark / Light mode (8)

26. Añadir la paleta clara completa como tokens en `:root[data-theme=light]`
27. Verificar contraste 4.5:1 de cada par en claro, no asumir que hereda
28. `ThemeProvider` con estado en `localStorage` y respeto a `prefers-color-scheme`
29. Toggle en el nav con crossfade de iconos sol/luna (AnimatePresence)
30. Evitar el flash de tema incorrecto con un script inline en `<head>`
31. Adaptar el grafo: los cables necesitan otro valor en fondo claro
32. Adaptar `sealed-hatch`, `grid-field` y `aurora` al tema claro
33. Sobrescribir los estilos del wallet adapter en ambos temas

## D. Sistema de idiomas ES / EN (10)

34. Diccionario tipado `lib/i18n/es.ts` y `en.ts` con las mismas claves
35. `LocaleProvider` + hook `useT()` con fallback a español
36. Detectar idioma del navegador en la primera visita
37. Persistir la elección en `localStorage`
38. Selector ES/EN en el nav, junto al toggle de tema
39. Traducir la landing completa (es la que leen los jueces)
40. Traducir la vista de ronda y todos los formularios
41. Traducir los mensajes de error del programa (mapa de códigos Anchor)
42. `<html lang>` dinámico según el idioma activo
43. Metadata y Open Graph por idioma

## E. Claridad: el problema y la solución, con menos texto (12)

44. Reescribir el hero a una sola frase de problema y una de solución
45. Bloque "El problema" en tres tarjetas cortas, no en párrafos
46. Bloque "La solución" como diagrama, no como prosa
47. Diagrama del flujo: L1 → delegación → enclave → liquidación
48. Comparativa visual commit-reveal vs Private ER (dos columnas)
49. Reducir cada párrafo de la landing a máximo 3 líneas
50. Mover el detalle técnico largo a un `/como-funciona` aparte
51. Glosario desplegable para "ER", "TEE", "delegación", "Gale–Shapley"
52. Un ejemplo numérico concreto: 4 personas, quién acaba con quién y por qué
53. Sección "Qué NO prometemos" visible, no escondida en el README
54. Timeline visual de una ronda con el estado actual resaltado
55. CTA único y claro por pantalla, sin acciones compitiendo

## F. Gráficas y visualizaciones (10)

56. Gráfica de barras: propuestas por ronda de la partida real
57. Indicador de convergencia: emparejados vs sin par por tick
58. Medidor de "cuántas listas selladas" sobre el total esperado
59. Comparativa de latencia: N transacciones vs una sola (barras)
60. Matriz de preferencias del propio usuario (solo la suya, nunca la ajena)
61. Mini-mapa de la ronda: quién está, quién selló, quién falta
62. Sparkline del histórico de rondas en la landing
63. Todas las gráficas con tabla alternativa accesible
64. Todas las gráficas con estado vacío explícito
65. Respetar `prefers-reduced-motion` en las animaciones de entrada

## G. Animaciones y componentes (12)

66. Transición compartida entre la tarjeta de ronda y la vista de ronda (`layoutId`)
67. Skeleton coherente para cada bloque que carga
68. Toast system con `aria-live` para confirmar acciones
69. Modal de confirmación antes de cerrar una ronda
70. Stepper animado de las fases de la ronda
71. Copiar dirección al portapapeles con feedback animado
72. Estado de "firmando en la wallet" explícito, no solo un spinner
73. Animación de éxito al sellar la lista (candado que se cierra)
74. Hover con elevación en las tarjetas, sin reflow
75. Barra de progreso del deadline que se agota en vivo
76. Página 404 y estado de error con la misma identidad visual
77. Favicon, OG image y manifest

## H. Accesibilidad y responsive (8)

78. Recorrer toda la app solo con teclado
79. `aria-label` en cada botón que es solo icono
80. Anunciar los cambios de estado de la ronda con `aria-live`
81. Verificar 375 / 768 / 1024 / 1440
82. Áreas táctiles de 44×44 mínimo
83. Probar con `prefers-reduced-motion` activo
84. Jerarquía de encabezados sin saltos
85. Foco visible en ambos temas

## I. Rendimiento y robustez (7)

86. Import dinámico de las gráficas para no cargarlas en la landing
87. Reducir el bundle de la vista de ronda (128 kB ahora)
88. Error boundary por sección
89. Reintentar la conexión TEE si el token expira a media acción
90. No romper si la ronda tiene 0 participantes
91. No romper si el historial está vacío pero la ronda es transparente
92. Lighthouse por encima de 90 en performance y accesibilidad

## J. Entregables del hackathon (8)

93. Repo público en GitHub con README en inglés
94. README con el argumento del commit-reveal arriba del todo
95. Explorer links de programa, ronda de ejemplo y transacción de matching
96. Guion del video de 3 minutos
97. Grabar el video: problema → por qué no basta commit-reveal → demo → cierre
98. Sembrar 2 o 3 rondas de demo con datos creíbles antes de grabar
99. Rellenar el formulario de submission en build.magicblock.app
100. Entregar el jueves 10, no el viernes 11 — el viernes es colchón
