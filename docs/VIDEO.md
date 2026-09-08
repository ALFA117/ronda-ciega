# Guion del video — 3 minutos

Regla que gobierna todo: **el jurado son los ingenieros que escribieron el runtime.** No hay que
explicarles qué es un ephemeral rollup. Hay que demostrarles que hacía falta uno.

Grabar en **modo oscuro, idioma EN** (el submission es en inglés).

**Lo que cambió desde la primera versión de este guion:** la página ahora ejecuta sus propias
pruebas en el navegador de quien la ve. Antes había que irse al explorador a demostrar que una
cuenta no se puede leer; ahora es un botón que corre cuatro sondas con sus dos controles. Eso
cambia la demo entera: **casi nada de lo que hay que enseñar necesita una firma**, lo cual también
lo hace mucho más difícil de romper en vivo.

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

Abrir una ronda liquidada, ir a **"What this round does not publish"**, pulsar el botón.

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

### 3. Sellar una lista — 20 s

Ordenar tres nombres, "Sellar mi lista", **mostrar el prompt del monedero**.

> "Dos firmas la primera vez, y ninguna después. Una autoriza una clave de sesión —una transacción
> normal de L1, que el monedero simula sin problema. La otra le prueba al enclave quién soy, y es
> una firma sobre un *mensaje*: no hay nada que simular, así que no hay nada que rechazar.
>
> A partir de ahí sello listas sin tocar el monedero. Lo que esa clave puede hacer es escribir.
> Leer, nunca: el permiso de la cuenta se deriva de mi billetera, no de quien firma."

**En pantalla:** el contador de firmas del panel, que dice el número antes de pedirlo. Si ya
sellaste una vez en ese navegador dirá **"sin firmas"** — vale la pena enseñarlo dos veces
seguidas para que se vea el cambio.

**Si algo falla aquí, corta y sigue.** Los pasos 1 y 2 ya demostraron el sistema.

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

**En pantalla:** la sección 01, el playground. Pulsar **"Otro desempate"** sobre un mercado donde
los empates deciden (si sale "no decide nada", pulsar "Listas nuevas" hasta que cambie — pasa en
una de cada cinco).

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
- [ ] Confirmar que el panel de las dos cadenas está midiendo (no "measuring…")

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
