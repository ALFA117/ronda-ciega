# Ronda Ciega — plan por trimestres

Versión navegable: https://claude.ai/code/artifact/239b524c-3b2f-42f4-ac27-91662bbda165

Cada número de este documento salió de una corrida, no de una estimación.

## Estado actual

| Programa | | Interfaz | | Pruebas que pasan |  |
|---|---|---|---|---|---|
| Instrucciones | 14 | Rutas | 2 | Unitarias | 36 |
| Códigos de error | 19 | Componentes | 30 | Caminos negativos | 11 |
| Estados de ronda | 4 | Hooks | 5 | Casos de interfaz | 18 |
| Máximo por lado | 16 | Idiomas | ES · EN | Comprobaciones fijas | 47 |
| Cuadros de historial | 24 | Temas | claro · oscuro | Etapas extremo a extremo | 10 |

Medido contra devnet desde México:

| | |
|---|---|
| Emparejamiento completo, una transacción | **671 ms** |
| Una transacción por ronda de propuestas | 0.9–1.6 s cada una |
| Llegada del VRF que rompe empates | ~230 ms |

### Cobertura de errores: 6 de 19

Probados contra devnet (`npm run negative`): `DeadlineInPast`,
`NotEnoughParticipants`, `ProfileTooLong`, `RoundStillOpen`, `RoundClosed`,
`WrongRoundStatus`.

Los trece restantes solo se ejecutan sobre una ronda ya delegada al rollup, así
que exigen montar el ciclo completo con el TEE — tarea 1.9.

## Q1 · Oct–Dic 2026 — que lo pueda operar alguien más

Hoy funciona para ocho personas y una billetera que firma todo.

**Programa**

1.1 **Claves de sesión.** Firmar una vez por ronda, no una por acción. El error
`InvalidSession` ya está en el programa pero la interfaz no lo usa: hoy un
participante firma seis veces.

1.2 **Romper el techo de 16 por lado.** `MatchState` es un arreglo fijo en una
sola cuenta efímera; paginarlo sube el límite a 64 sin tocar el algoritmo. El
costo real es coordinar los fragmentos durante el sellado.

1.3 **Reanudar un ciclo interrumpido.** Si `undelegate_round` falla a media
secuencia la ronda queda delegada y sin salida por la interfaz.

**Interfaz**

1.4 **Compruébalo tú mismo.** El oráculo de Gale–Shapley de las pruebas,
corriendo en el navegador: en una ronda transparente recalcula el emparejamiento
desde el historial público y lo compara con el resultado en cadena.

1.5 **Recorrer una ronda sin conectar billetera.**

1.6 **La ronda como línea de tiempo**, con las horas reales que ya guarda la
cuenta.

1.7 **Aviso cuando la ronda cierra.** El emparejamiento tarda menos de un
segundo; la fecha límite tarda días.

1.8 **WCAG 2.2 AA completo.** Contraste, foco visible y devolución de foco ya
pasan; falta auditar el orden de tabulación y las animaciones que aún no
consultan `prefers-reduced-motion`.

**Pruebas**

1.9 **Los trece errores que faltan**, con una suite que delega de verdad.

1.10 **Integración continua**: unitarias, tipos y compilación en cada push. Las
negativas y el extremo a extremo se quedan manuales — cuestan SOL y dependen de
devnet, y una prueba que falla por la red enseña a ignorar fallas.

1.11 **La suite de interfaz también a 768 px.**

> **Se mide así:** una ronda de 32 personas se completa sin que el operador
> toque la consola.

## Q2 · Ene–Mar 2027 — de mecanismo a producto

Una ronda suelta no es un producto; el producto es quien la convoca.

2.1 **Rondas con dueño**: mínimo, fecha, transparencia y quién puede entrar.

2.2 **Filtros duros antes de ordenar.** Una lista ordenada no expresa «no
trabajo fuera de mi huso horario». El filtro también es preferencia, así que
vive dentro del TEE.

2.3 **Reputación que no revela listas.** «Completó cuatro rondas» es público y no
dice a quién ranqueó.

2.4 **Rondas recurrentes.**

2.5 **Mainnet, y quién paga la renta.** Hoy la autoridad prefinancia cada cuenta
efímera de cada participante; eso no escala a 300 personas.

2.6 **Aplicación instalable.**

2.7 **Estabilidad contra rondas reales**: correr el oráculo sobre cada ronda
transparente que cierre en producción.

2.8 **Carga: 64 por lado en una transacción** — medir si sigue cabiendo en el
límite de cómputo.

> **Se mide así:** tres comunidades corren su ronda sin pedir ayuda.

## Q3 · Abr–Jun 2027 — generalizar el mecanismo

3.1 **SDK de emparejamiento privado**: mentorías, contratación, intercambio
académico, asignación de residencias médicas — el problema para el que
Gale–Shapley se inventó y que sigue resolviéndose con listas que un tercero ve.

3.2 **Muchos a uno.** Un mentor toma tres mentorados: cada receptor sostiene una
cola con cupo en vez de un solo lugar.

3.3 **Auditoría externa** del programa y del uso del TEE: permisos, qué queda
legible tras cerrar, y si el borrado de listas es efectivo en rollup y en L1.

3.4 **Reproducción por un tercero.** Alguien de fuera recalcula una ronda
transparente y publica que coincide.

> **Se mide así:** un equipo ajeno corre su ronda con el SDK sin hablarnos.

## Fuera de alcance, a propósito

**Verificación de identidad.** Un humano puede registrar varias billeteras. Es un
problema de identidad, no de emparejamiento: se integra, no se reinventa.

**Cifrar las preferencias.** Esto no es criptografía sino control de acceso por
hardware: el TEE se niega a servir la cuenta a quien no es miembro. Cambiarlo por
cifrado real cambiaría el modelo de confianza y el rendimiento a la vez.

**Pools pequeños.** Con cuatro por lado los pares publicados revelan el resto por
eliminación. Se mitiga con un mínimo; no se arregla.

**Ocultar el resultado.** Si sales emparejado conmigo, sabes que estabas en mi
lista. Lo secreto es el orden completo, no el par.

## Cómo correr lo que ya existe

```bash
cd frontend && npm test      # 36 unitarias, sin red
npm run verify               # 47 comprobaciones fijas y en vivo
npm run negative             # 11 caminos negativos contra devnet (~0.005 SOL)
npm run spike                # 10 etapas extremo a extremo con el TEE
```

Los 18 casos de interfaz corren en el navegador, sobre el sitio desplegado:

```js
new Function(await (await fetch("/ui-cases.js")).text())();
await runUiCases();
```
