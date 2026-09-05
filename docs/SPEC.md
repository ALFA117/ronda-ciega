# Ronda Ciega — planteamiento

> Dices a quién quieres sin que nadie sepa que lo dijiste.

Submission para **MagicBlock Solana Blitz v8** (build 4–11 sept 2026, tema *Global Startup Village*).

---

## 1. El problema

Emparejar cofundadores es un mercado de sinceridad rota.

Todo el mundo tiene un ranking mental de con quién quiere trabajar, y casi nadie lo declara.
Declararlo tiene costo asimétrico: si digo que quiero trabajar contigo y tú no me quieres, pierdo
posición frente a ti y frente a todos los que se enteren. Así que la gente declara preferencias
tibias, empieza por su tercera opción, o no declara nada y espera a que el otro dé el paso.

El resultado es un mercado que asigna mal: no empareja a la gente que se quiere, empareja a la
gente que se atrevió.

La solución teórica se conoce desde 1962 (Gale–Shapley: matching estable). La razón por la que no
se usa fuera de contextos institucionales —el match de residencias médicas, admisiones escolares—
es que **requiere un tercero de confianza** que reciba todas las listas de preferencias, corra el
algoritmo, y no filtre ni venda esas listas. Ese tercero casi nunca existe.

## 2. Por qué esto no se puede hacer con un commit-reveal

La objeción obvia: "sella las preferencias con un hash y revélalas al final". No funciona, y es
importante entender por qué, porque es exactamente lo que separa este proyecto de una app de
votación sellada.

En un commit-reveal, la verificación **exige la revelación**. Publicas el hash, y al cierre
publicas el preimagen para que cualquiera compruebe que no lo cambiaste. Es decir: el secreto
tiene fecha de caducidad, por diseño.

En un matching de preferencias eso destruye el mecanismo. La lista de preferencias debe quedar
secreta **para siempre**, no hasta un deadline. Si al final se publica que yo te puse en el puesto
7 de mi lista, el costo social que el sistema prometía eliminar simplemente llegó tarde. Y si no
se publica, nadie puede verificar que el resultado es correcto.

Ese es el hueco exacto que llena un **Private Ephemeral Rollup**: cómputo real sobre estado que
ningún observador externo puede leer, con las reglas de acceso aplicadas por hardware (TEE) en
lugar de por la buena voluntad del operador. El programa que corre dentro del TEE lee todas las
listas; ninguna wallet, ningún RPC y ni el propio validador puede leerlas.

**No es un tercero de confianza. Es el mismo rol, sin la confianza.**

## 3. Qué hace, en concreto

1. **Te registras** en una ronda, en uno de dos lados: `builder` (perfil técnico) o `founder`
   (producto / go-to-market). Tu perfil es público: nombre, rol, país, link. Es lo mismo que ya
   publicas en el directorio de builders.
2. **Mandas tu ranking privado** de la gente del otro lado. Esa lista se escribe en una cuenta
   delegada al ER privado, con permiso `is_private: true` y un único miembro: tú. Nadie más la lee,
   ni siquiera el operador del rollup.
3. **La ronda cierra** al llegar el deadline.
4. **El matching corre en vivo, ronda por ronda**, dentro del ER. Cada tick es una transacción:
   los no emparejados proponen a su siguiente opción, cada receptor retiene tentativamente a su
   mejor propuesta y rechaza el resto. La UI anima cada tick — se ve el algoritmo resolverse.
5. **Solo se publican los pares finales.** Las listas de preferencias se cierran sin revelarse.

## 4. Por qué dos lados y no uno

Gale–Shapley resuelve el *stable marriage problem*: dos conjuntos disjuntos, cada uno rankeando al
otro. Un pool único donde todos rankean a todos es el *stable roommates problem*, que es otro
algoritmo (Irving) y que **puede no tener solución estable**. Meter roommates en una semana, con
casos sin solución que hay que explicar en el video, es cómo se pierde el hackathon.

Partir el pool en `builder` / `founder` no es una simplificación de conveniencia: es la forma real
del mercado que estamos modelando (el clásico *hacker + hustler*), y coincide con los roles que el
directorio de MagicBlock ya usa. Gale–Shapley sobre dos lados **siempre** produce un matching
estable, y es óptimo para el lado que propone — una propiedad que se puede afirmar en el pitch sin
asteriscos.

## 5. Por qué las rondas resuelven el problema de compute

Gale–Shapley se describe como O(n²), y meter ese loop completo en una sola instrucción de Anchor
choca con el compute budget. Pero el algoritmo **ya es iterativo por naturaleza**: procede en
rondas de propuestas, y el estado entre rondas cabe en unos pocos bytes por participante.

Ejecutando **una ronda de propuestas por transacción del ER**:

- cada transacción es O(n) y no se acerca al límite de compute;
- el estado intermedio (`holds` tentativos, puntero de cada proponente) vive en la cuenta de la
  ronda, que también es privada;
- y a 10 ms por bloque, las rondas de un pool de 32 personas se resuelven en menos de un segundo
  **con cada paso visible**.

El riesgo técnico y la feature del demo son la misma cosa. Esto es lo que el ER aporta que un L1
no puede: no es "más barato", es que la granularidad del cómputo se vuelve la granularidad de la
animación.

## 5b. La animación filtra preferencias, y por eso es opt-in

Descubierto al construirlo, no al diseñarlo, así que vale la pena dejarlo escrito.

**Animar los estados intermedios de Gale–Shapley revela las listas.** Si el tick 1 muestra que el
founder 0 propuso al builder 2, acabamos de publicar cuál era la primera opción del founder 0. La
secuencia completa de propuestas y rechazos reconstruye buena parte de todos los rankings. La
animación bonita y la promesa del producto estaban en conflicto directo.

La solución no es esconder el conflicto, es hacerlo explícito: la ronda lleva un flag
`transparent`, decidido al crearla.

- **Ronda transparente:** graba un snapshot de `pairs` por tick. Se puede ver el algoritmo
  resolverse. Es para demos y para rondas donde todos los participantes aceptaron mostrarlo.
- **Ronda normal:** los estados intermedios nunca salen del TEE. Solo se publica el emparejamiento
  final.

Y esto mejora el pitch en vez de debilitarlo: *"¿quieres ver el algoritmo correr? En una ronda real
no puedes, ni yo tampoco. Ese es exactamente el punto. Así que aquí hay una ronda de demostración
donde todos aceptaron mostrarlo."*

**Nota de implementación:** la animación se reproduce desde el historial grabado en la cuenta
`Round`, no desde los logs de la transacción. Verificado en devnet: el TEE **no sirve logs ni
compute units** para transacciones que tocan cuentas privadas (`getTransaction` devuelve cero
mensajes de log). Tiene sentido — los logs son parte de lo que el permiso controla vía
`TX_LOGS_FLAG` — pero significa que cualquier UI que dependa de eventos de Anchor no funciona aquí.

## 5c. Todo el matching en una sola transacción

Medido contra devnet: correr los ticks uno por transacción cuesta **0.9–1.6 s cada uno desde
México**. Eso no es el rollup, es round-trip de red — y ningún crank del lado del cliente lo
arregla, porque cada tick depende del anterior.

La respuesta correcta no es acelerar al cliente sino pedirle menos: `run_matching` corre todas las
rondas de propuestas **dentro de una sola transacción del ER**, grabando un frame por tick. Un
cliente remoto no puede hacer N transacciones secuenciales rápido; sí puede hacer una transacción
que haga N rondas.

Medido con un pool 6×6: converge en 3 ticks, **671 ms de reloj de pared, un solo round-trip**.

Por eso el pitch nunca debe decir "cada tick tarda 10 ms" mostrando ticks separados. Lo que se dice
es: el matching completo se liquida en una transacción del rollup, y la animación reproduce los
frames que esa transacción grabó.

## 6. Dónde entra el VRF (y por qué no es decoración)

Gale–Shapley asume órdenes estrictos. Los empates son un problema real: si dos proponentes caen en
el mismo escalón del ranking de un receptor —y con listas cortas y rankings por categoría, pasa—
hay que romper el empate. Romperlo por índice de cuenta significa que registrarse temprano te da
ventaja, y eso es exactamente el tipo de sesgo que el sistema dice eliminar.

El desempate se resuelve con **MagicBlock VRF**: aleatoriedad verificable, solicitada al abrir la
ronda, con la semilla publicada al final para que cualquiera reproduzca el resultado sin ver una
sola preferencia.

Es la única parte del sistema que puede ser pública sin filtrar nada, y es la que hace el resultado
auditable.

## 7. Lo que este sistema NO promete

Honestidad sobre los límites, porque el jurado son los ingenieros que escribieron el runtime:

- **El resultado filtra información, por diseño.** Si sales emparejado conmigo, sabes que estabas
  en mi lista. Eso es el punto del producto, no una fuga.
- **La privacidad es control de acceso aplicado por TEE, no cifrado.** El estado no es texto
  cifrado: es estado normal del rollup que el TEE se niega a servir a quien no está en la lista de
  miembros. La garantía es de hardware, no criptográfica. Se dice así en el README y en el video.
- **Un pool pequeño filtra por eliminación.** Con 4 participantes por lado, los matches revelan
  mucho del resto. La ronda exige un mínimo de participantes antes de poder cerrar.
- **No hay verificación de identidad.** Un mismo humano puede registrar varias wallets. Fuera de
  alcance para un hackathon de una semana; se documenta.

## 8. Modelo de cuentas

| Cuenta | Visibilidad | Contenido |
|---|---|---|
| `Round` | pública en L1 | id, deadline, estado, conteo por lado, tick actual, semilla VRF |
| `Participant` | pública | wallet, lado, handle, rol, país, link, índice en la ronda |
| `Preferences` | **privada en el ER** (miembro único: el dueño) | ranking: lista de índices del otro lado |
| `MatchState` | **privada en el ER** durante el proceso | holds tentativos, puntero por proponente |
| `Pairing` | pública al converger | par (builder, founder), tick en que se fijó |

Ciclo: crear en L1 → delegar al ER TEE → correr rondas → `commit_and_undelegate` solo de `Round` y
`Pairing`. `Preferences` y `MatchState` se cierran en el ER **sin commitear a L1**.

## 9. Entregables del hackathon

- [ ] Programa Anchor desplegado en devnet + explorer link
- [ ] Frontend público (Vercel) con wallet Phantom en devnet
- [ ] Repo GitHub público
- [ ] Video pitch/demo (~3 min): el argumento del commit-reveal + el matching resolviéndose en vivo
- [ ] README que explique el modelo de privacidad sin exagerarlo

## 10. Decisiones ya tomadas

- **Reusamos el *plumbing*** del proyecto anterior (delegación, gasless, wallet adapter, deploy),
  **no el mecanismo**. Nada de fork del repo: se copian piezas conscientemente.
- **Versiones ancladas** a las que ya se sabe que compilan en esta máquina:
  `anchor-lang =1.0.2`, `ephemeral-rollups-sdk 0.16.2`, `session-keys 3.1.1`.
- **Endpoint TEE devnet:** `https://devnet-tee.magicblock.app`
  (validador `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`)
- **Sin validador local:** Windows nativo no corre `solana-test-validator`. Todo va contra devnet.
