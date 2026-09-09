# Guion del video — 3 minutos

Regla que gobierna todo: **el jurado son los ingenieros que escribieron el runtime.** No hay que
explicarles qué es un ephemeral rollup. Hay que demostrarles que hacía falta uno.

Grabar en **modo oscuro, idioma EN** (el submission es en inglés). Los controles van nombrados
como salen en pantalla, en inglés: buscarlos en español el día de la grabación es cómo se pierden
veinte segundos de toma.

**Lo que cambió desde la última versión:** ahora el emparejamiento **mueve dinero**. Hay un escrow
en L1, y una ronda liquidada donde un vendedor cobró sin firmar nada. Eso reordena el video: lo
que antes era "miren qué privado" ahora es "miren qué privado, **y por eso el pago sale solo**".

Sigue siendo cierto que casi nada de lo que hay que enseñar necesita una firma, lo cual lo hace
difícil de romper en vivo.

---

## 0:00 – 0:25 · El problema, sin jerga

> "Todos tenemos un ranking mental de con quién queremos trabajar. Casi nadie lo dice.
>
> Porque decirlo solo cuesta si el otro no corresponde. Así que la gente empieza por su tercera
> opción, o espera. Y el mercado no empareja a quien se quiere: empareja a quien se atrevió."

**En pantalla:** el hero. Debajo del titular, el diagrama de flujo: los cinco pasos y la banda
del enclave sobre los dos de en medio. Se enciende solo, uno tras otro; no hay que tocarlo.

---

## 0:25 – 0:50 · Por qué no está resuelto

> "Gale–Shapley resolvió esto en 1962. Matching estable. El problema no es el algoritmo.
>
> El problema es que necesita un tercero que reciba todas las listas y no las filtre nunca. Por eso
> solo existe donde hay una institución detrás: residencias médicas, admisiones escolares."

**En pantalla:** la sección "El problema".

---

## 0:50 – 1:25 · El golpe: por qué un commit-reveal no sirve

Esta es la parte que gana o pierde el video. **No apurarla.**

> "La reacción obvia es: sella las listas con un hash y revélalas al final.
>
> No funciona. Un commit-reveal compra secreto **hasta un deadline** — porque verificar exige
> publicar el original. El secreto tiene fecha de caducidad por construcción.
>
> Una lista de preferencias tiene que quedar secreta **para siempre**. Si al final se publica que te
> puse en el puesto siete, el costo social que el mecanismo prometía quitar simplemente llegó tarde.
>
> Y si no se publica nunca, nadie puede verificar el resultado."

**En pantalla:** las dos columnas de la comparativa. Dejar leer el veredicto de cada una.

> "Así que hace falta cómputo real sobre estado que nadie de fuera pueda leer. Eso es exactamente lo
> que hace un Private Ephemeral Rollup, y es la razón por la que este proyecto existe."

---

## 1:25 – 2:15 · La demo

Sin narrar cada clic. **Tres tomas, y ninguna de las dos primeras necesita monedero.**

### 1. El rollup es real, y se ve corriendo — 10 s

Scrollear al panel de las dos cadenas. Dejar que cuente dos o tres segundos antes de hablar.

> "Estas dos alturas se las está pidiendo mi navegador a las dos cadenas ahora mismo, una vez por
> segundo. El rollup TEE contra Solana devnet. Unas tres veces más rápido, y ese número sale de lo
> que contestan, no está escrito en la página."

*Si el endpoint del TEE está caído, el panel lo dice solo. No lo tapes: es la mitad del argumento.*

### 2. La privacidad, con sus controles — 20 s

Abrir una ronda liquidada, ir a **"What this round does not publish"**, pulsar **"Query the chain"**.

> "Cada lista tiene una dirección derivada de la ronda y del monedero de su dueño, así que cualquiera
> puede calcularlas. Estas son las doce de esta ronda.
>
> Fila uno: L1 me devuelve la cuenta pública de la ronda. Fila dos: **el rollup se la devuelve a una
> conexión sin token**. Las dos conexiones funcionan.
>
> Y ahora las listas: cero de doce en L1, cero de doce en el rollup.
>
> Las dos primeras filas son las que hacen que las otras dos signifiquen algo. Sin ellas, un cero es
> indistinguible de una consulta rota."

*Este es el mejor plano del video. Es la afirmación central del proyecto ejecutándose en vivo, con
su propio control, en veinte segundos.*

### 3. El dinero, que es lo nuevo — 35 s

Abrir la **ronda pagada**: `8nMUQHBPfKW8xU528xjuVHb2ZSUxWkFwM3WTj7Rr91dR`. Tres founders, dos
builders, con fondos bloqueados de verdad. *(Los dos lados se llaman así en el programa y en el
explorador. La página dice al lado quién paga y quién cobra, que es lo que importa aquí.)*

> "Esto es lo que hace que sirva. El lado que propone bloqueó su oferta en una cuenta de Solana L1
> —pública, cualquiera la puede mirar— y **el dinero nunca entró al enclave**. El enclave decide a
> quién; L1 guarda el qué.
>
> Cuando la ronda cerró, el pago se ejecutó contra el par que salió. Quien cobró **no firmó nada**:
> la instrucción no pide firmante, así que no depende de que yo siga aquí. Y a quien no salió
> emparejado le volvió su depósito, también sin pedirle permiso a nadie.
>
> Intentar pagarle a alguien que el emparejamiento no eligió lo rechaza el programa con
> `NotYourPair`. Está en la suite, con las otras seis negativas."

**Bajar a "Cuánto tardó cada parte".** Es el plano con la cifra que gana la discusión:

> "Y esto no se lo tienen que creer. Estas horas son tiempos de bloque. La fecha límite pasó, el
> algoritmo convergió **cuatro segundos después**, y **tres segundos más tarde** el dinero estaba en
> la otra billetera. Del cierre al pago, siete segundos, y cada renglón se comprueba en el
> explorador."

*Si hay tiempo, enseñar `npm run escrow` corriendo: diecisiete comprobaciones y 0.02 SOL moviéndose
de verdad. Es el plano más difícil de discutir de todo el video.*

---

### 4. Sellar una lista — 20 s

Ordenar tres nombres, **"Seal my list"**, **mostrar el prompt del monedero**.

> "Dos firmas la primera vez, y ninguna después. Una autoriza una clave de sesión —una transacción
> normal de L1, que el monedero simula sin problema. La otra le prueba al enclave quién soy, y es
> una firma sobre un *mensaje*: no hay nada que simular, así que no hay nada que rechazar.
>
> A partir de ahí sello listas sin tocar el monedero. Lo que esa clave puede hacer es escribir.
> Leer, nunca: el permiso de la cuenta se deriva de mi billetera, no de quien firma."

**En pantalla:** el contador de firmas del panel, que dice el número antes de pedirlo. Si ya
sellaste una vez en ese navegador dirá **"no signatures"** — vale la pena enseñarlo dos veces
seguidas para que se vea el cambio.

**Si algo falla aquí, corta y sigue.** Los pasos 1, 2 y 3 ya demostraron el sistema.

### 5. Abrir una ronda — 10 s, opcional

Solo si sobra tiempo, y es la única toma donde se ve una transacción de L1 aterrizar. En el panel
de arriba de la portada, **"Open a round"**: tres respuestas y una firma, y el riel va marcando
cuál llevas. Al firmar dice **"Signing…"**, luego **"Confirming on L1…"**, luego **"Round open"**
y salta a la ronda.

> "Abrir una ronda es una transacción de L1 y ya. Lo que dura es la confirmación, y la página lo
> dice mientras pasa en vez de quedarse pensando."

*Es la toma más fácil de cortar si el tiempo aprieta: no prueba nada que las otras tres no prueben.*

---

## 2:15 – 2:40 · La honestidad que nadie más va a decir

> "Dos cosas que quiero decir yo antes de que las pregunten.
>
> Primera: esta ronda es **transparente**. Publica los estados intermedios para que se pueda ver el
> algoritmo. Eso revela quién propuso a quién y en qué orden — filtra. Por eso es un flag que se
> decide al crear la ronda. Si quieren ver el algoritmo correr en una ronda de verdad, no pueden.
> Ese es el punto.
>
> Segunda: la privacidad aquí es **control de acceso aplicado por hardware, no cifrado**. El estado
> no es texto cifrado; el TEE se niega a servirlo a quien no está en la lista de miembros. La
> garantía es del enclave."

---

## 2:40 – 3:00 · Cierre: el VRF, tocándolo

**En pantalla:** la sección 01, el playground. Pulsar **"Different tie-break"** sobre un mercado
donde los empates deciden (si sale *"the tie-break decides nothing"*, pulsar **"New lists"** hasta
que cambie — pasa en una de cada cinco).

> "Los empates se rompen con VRF. Mismas listas, otra semilla, y el emparejamiento se mueve. Sin
> aleatoriedad verificable esto lo decidiría el orden de registro: premiaría a quien llegó primero,
> justo el sesgo que el sistema quita. El matching se niega a correr hasta que llega la
> aleatoriedad.
>
> Al final la ronda vuelve a L1 con los pares. Las listas se quedan en el enclave, y no hay
> instrucción en el programa que las revele.
>
> Ronda Ciega. Dices a quién quieres, sin que nadie sepa que lo dijiste."

---

## Si sobra tiempo (o para la descripción del submission)

Cosas ciertas que no caben en tres minutos, por orden de peso:

- **`/proof`**: cuatrocientos mercados generados en tu navegador, cero pares bloqueantes, 172 de
  ellos capaces de llegar al desempate. La mitad llevan listas cortadas a propósito: con listas
  completas el desempate no se ejecuta nunca, así que un barrido todo-completo dejaba fuera la rama
  que el VRF existe para proteger.
- **Cuarenta tests en Rust** sobre el programa mismo, dos de ellos vectores clavados también en la
  suite de TypeScript, para que las dos implementaciones no puedan separarse en silencio.
- **Piloto automático**: la ronda se conduce sola desde la pestaña. Ninguna de las instrucciones del
  operador comprueba quién firma, así que las manda una llave local del navegador sin un solo
  prompt.

---

## Checklist antes de grabar

**El día antes**

- [ ] Sembrar 2–3 rondas con handles creíbles, no `founder-0`
- [ ] Una ronda liquidada y **transparente**, con VRF cumplido → para el replay del algoritmo
- [ ] Una ronda **no** transparente → para enseñar que ahí no hay nada que animar
- [ ] Abrir `/proof` y correrlo una vez: confirmar 400 / 0 / 172
- [ ] Abrir el panel de privacidad de la ronda que vas a usar y correrlo: **las cuatro filas en
      verde**. Si un control falla, es devnet, no el proyecto — reintentar
- [ ] Abrir la **ronda pagada** y confirmar que carga: es el plano nuevo y el que más pesa
- [ ] Correr `npm run escrow` una vez la noche anterior: 17/17 y ~0.4 SOL. Si falla, hay tiempo
- [ ] Confirmar que el panel **"Both chains, right now"** está midiendo (no "measuring…")
- [ ] Abrir la portada y ver el diagrama debajo del titular: los cinco pasos encendiéndose y la
      banda **"Inside the enclave"** sobre los dos de en medio

**Justo antes**

- [ ] Modo oscuro, idioma EN
- [ ] Monedero con SOL de devnet suficiente para el paso 3
- [ ] Cerrar pestañas y notificaciones
- [ ] Probar el audio antes de la toma buena
- [ ] Máximo 3 tomas: si a la tercera no sale, el guion es el problema, no la ejecución

**Plan B si devnet está mal**

Los pasos 1 y 2 dependen de devnet; el paso 3 también. El playground y `/proof` **no dependen de
nada**: corren enteros en el navegador. Si devnet está caído, el video se puede grabar con el
playground, `/proof` y una ronda ya liquidada cargada de caché, y decirlo:

> "Devnet está teniendo un mal día, así que esto corre en mi navegador contra la misma
> implementación que corre en la cadena."
