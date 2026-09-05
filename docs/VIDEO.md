# Guion del video — 3 minutos

Regla que gobierna todo: **el jurado son los ingenieros que escribieron el runtime.** No hay que
explicarles qué es un ephemeral rollup. Hay que demostrarles que hacía falta uno.

Grabar en **modo oscuro, español o inglés según el público** (el submission es en inglés → grabar
en EN). Ronda de demo sembrada de antemano, ya liquidada, para no depender del oráculo en vivo.

---

## 0:00 – 0:25 · El problema, sin jerga

> "Todos tenemos un ranking mental de con quién queremos trabajar. Casi nadie lo dice.
>
> Porque decirlo solo cuesta si el otro no corresponde. Así que la gente empieza por su tercera
> opción, o espera. Y el mercado no empareja a quien se quiere: empareja a quien se atrevió."

**En pantalla:** el hero. Las listas selladas resolviéndose en el gráfico.

---

## 0:25 – 0:50 · Por qué no está resuelto

> "Gale–Shapley resolvió esto en 1962. Matching estable. El problema no es el algoritmo.
>
> El problema es que necesita un tercero que reciba todas las listas y no las filtre nunca. Por eso
> solo existe donde hay una institución detrás: residencias médicas, admisiones escolares."

**En pantalla:** la sección "El problema", tres tarjetas.

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

## 1:25 – 2:10 · La demo

Sin narrar cada clic. Mostrar y decir qué está pasando.

1. **Sellar una lista.** Ordenar tres nombres, pulsar "Sellar mi lista", **mostrar la firma de la
   wallet**.
   > "Esa firma no es un trámite. Es lo que le prueba al enclave quién soy, y es la razón por la que
   > nadie más puede leer lo que acabo de escribir."

2. **La cuenta, en el explorador.** Intentar leer la cuenta `Preferences` desde fuera.
   > "Esta cuenta existe. No la puedo leer, y ustedes tampoco. Solo su dueño."
   >
   > Y el control: la cuenta `Round`, pública, en la misma conexión, se lee sin problema. El rechazo
   > es el permiso funcionando, no una conexión rota.

3. **Correr el matching.** Una sola transacción.
   > "El matching completo — todas las rondas de propuestas — en una transacción del rollup.
   > 671 milisegundos de reloj de pared desde México. Un cliente remoto no puede hacer N
   > transacciones seguidas rápido. Sí puede hacer una que haga N rondas."

4. **La animación.** El tick donde un builder suelta a un founder por una propuesta mejor.
   > "Ahí. El founder cero estaba emparejado y lo desplazan. En la siguiente ronda cae a su segunda
   > opción."

---

## 2:10 – 2:35 · La honestidad que nadie más va a decir

> "Dos cosas que quiero decir yo antes de que las pregunten.
>
> Primera: esta ronda es **transparente**. Publica los estados intermedios para que se pueda ver el
> algoritmo. Eso revela quién propuso a quién y en qué orden — filtra. Por eso es un flag que se
> decide al crear la ronda, y por eso una ronda con gente real no lo lleva. Si quieren ver el
> algoritmo correr en una ronda de verdad, no pueden. Ese es el punto.
>
> Segunda: la privacidad aquí es **control de acceso aplicado por hardware, no cifrado**. El estado
> no es texto cifrado; el TEE se niega a servirlo a quien no está en la lista de miembros. La
> garantía es del enclave."

---

## 2:35 – 3:00 · Cierre

> "Los empates se rompen con VRF, porque romperlos por índice de cuenta premiaría a quien se
> registró primero — justo el sesgo que esto quita. El matching no corre hasta que llega la
> aleatoriedad.
>
> Al final, la ronda vuelve a L1 con los pares. Las listas se quedan en el enclave y no hay
> instrucción en el programa que las revele.
>
> Ronda Ciega. Dices a quién quieres, sin que nadie sepa que lo dijiste."

**En pantalla:** el pareo final, y el link.

---

## Checklist antes de grabar

- [ ] Sembrar 2–3 rondas con handles creíbles, no `founder-0`
- [ ] Una ronda liquidada, transparente, con VRF cumplido
- [ ] Una ronda **no** transparente, para mostrar que ahí no hay nada que animar
- [ ] Modo oscuro, idioma EN
- [ ] Wallet con SOL de devnet suficiente
- [ ] Cerrar pestañas y notificaciones
- [ ] Probar el audio antes de la toma buena
- [ ] Máximo 3 tomas: si a la tercera no sale, el guion es el problema, no la ejecución
