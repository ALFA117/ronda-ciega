/**
 * Spanish is the source dictionary: every key is defined here first, and
 * `en.ts` is typed against it so a missing translation is a compile error
 * rather than a blank label discovered in the demo.
 */
export const es = {
  nav: {
    tagline: "matching ciego",
    network: "Devnet",
    theme: "Cambiar tema",
    language: "Cambiar idioma",
    menu: "Menú",
    sections: "Secciones",
    home: "Ronda Ciega, inicio",
  },

  hero: {
    headline: "Dices a quién quieres",
    subline: "sin que nadie sepa que lo dijiste.",
    lede: "Matching estable donde las listas de preferencias nunca se publican. Ni al cerrar, ni después, ni para nadie.",
    cta: "Ver rondas",
    sealed: "listas selladas",
    stable: "estable",
    round: "ronda",
    proposing: "proponiendo…",
    settledNote: "estable — nadie mejora cambiando de par",
    proposers: "founders proponen",
    receivers: "builders eligen",
  },

  band: {
    proposals: "propuestas",
    matching: "Matching completo, de reloj de pared",
    vrf: "En llegar la aleatoriedad verificable",
    oneTx: "Transacción del rollup para todo el matching",
    leaked: "Listas de preferencias publicadas. Nunca.",
  },

  problem: {
    label: "El problema",
    title: "Nadie declara a quién quiere de verdad",
    cards: [
      {
        title: "Declarar cuesta",
        body: "Si digo que te quiero de socio y tú no, pierdo posición frente a ti y frente a quien se entere.",
      },
      {
        title: "Así que nadie declara",
        body: "La gente empieza por su tercera opción, o espera a que el otro dé el paso. El mercado asigna mal.",
      },
      {
        title: "La solución de 1962 no basta",
        body: "Gale–Shapley resuelve esto en papel, pero exige un tercero que reciba todas las listas y no las filtre.",
      },
    ],
  },

  solution: {
    label: "La solución",
    title: "El tercero de confianza es un enclave",
    body: "Las listas se escriben dentro de un Private Ephemeral Rollup de MagicBlock, detrás de un permiso cuyo único miembro eres tú. El algoritmo corre ahí adentro. Solo salen los pares.",
    steps: [
      { title: "Te registras", body: "Tu perfil es público. En Solana L1." },
      { title: "Sellas tu lista", body: "La cuenta se crea dentro del enclave." },
      { title: "Corre el algoritmo", body: "Una transacción del rollup." },
      { title: "Salen los pares", body: "Nada más. Las listas se cierran sin revelarse." },
    ],
  },

  compare: {
    label: "Por qué no es un commit-reveal",
    title: "El secreto no puede tener fecha de caducidad",
    commitReveal: {
      title: "Commit-reveal",
      points: [
        "Publicas un hash de tu lista",
        "Al cierre publicas el original",
        "Cualquiera verifica que no cambiaste",
        "Tu ranking queda público para siempre",
      ],
      verdict: "El costo social llega tarde, pero llega",
    },
    privateEr: {
      title: "Private Ephemeral Rollup",
      points: [
        "Tu lista se escribe dentro del enclave",
        "El programa la lee, nadie más",
        "El resultado es verificable en cadena",
        "Tu ranking no se publica nunca",
      ],
      verdict: "No hay instrucción que lo revele",
    },
  },

  limits: {
    title: "Los límites, antes de que los preguntes",
    label: "Lo que no prometemos",
    items: [
      {
        title: "El resultado filtra, por diseño",
        body: "Si sales emparejado conmigo, sabes que estabas en mi lista. Eso es el producto, no una fuga.",
      },
      {
        title: "Es control de acceso, no cifrado",
        body: "El estado no es texto cifrado: el TEE se niega a servirlo a quien no está en la lista de miembros. La garantía es de hardware.",
      },
      {
        title: "Un pool chico filtra",
        body: "Con cuatro personas por lado, los pares revelan mucho del resto. La ronda exige un mínimo.",
      },
      {
        title: "No hay verificación de identidad",
        body: "Un mismo humano puede registrar varias wallets. Fuera de alcance para una semana.",
      },
    ],
  },

  stats: {
    title: "Estos números salieron de corridas reales",
    label: "Medido en devnet",
    convergence: "Convergencia",
    convergenceNote: "Cada ronda de propuestas, desde que nadie tiene par.",
    matched: "emparejados",
    unmatched: "sin par",
    latency: "Latencia del matching",
    latencyOneTx: "Una transacción",
    latencyPerTick: "Una por ronda",
    latencyNote: "Mismo trabajo, un solo viaje de red.",
    empty: "Todavía no hay datos de una ronda liquidada.",
    tick: "ronda",
    table: "Ver como tabla",
  },

  status: {
    open: "abierta",
    sealing: "sellando",
    matching: "emparejando",
    settled: "cerrada",
  },

  rounds: {
    label: "Rondas",
    note: "Todo corre en devnet. No se mueve dinero real.",
    create: "Crear ronda",
    empty: "Todavía no hay rondas. Crea una para probar el flujo completo.",
    founders: "founders",
    builders: "builders",
    peek: "Ver el resultado sin entrar",
    moreRounds: "rondas más",
    emptyRounds: "rondas vacías de pruebas",
    hideEmpty: "Ocultar las vacías",
    emptyNote:
      "Devnet conserva toda ronda que se haya abierto. Estas quedaron de correr las suites de prueba: sin listas y sin cerrar. No se borran — se pliegan.",
    sealedLists: "listas selladas",
  },

  round: {
    title: "Ronda",
    transparent: "transparente",
    onRollup: "en el rollup",
    transparentWarning:
      "Publica los estados intermedios del algoritmo, lo que revela quién propuso a quién y en qué orden. Las listas completas siguen selladas, pero esta ronda no da la garantía completa — por eso es solo para demos.",
    algorithm: "El algoritmo, ronda por ronda",
    result: "Resultado",
    notTransparent:
      "Esta ronda no es transparente, así que no hay nada que animar: los estados intermedios nunca salieron del enclave. Lo de arriba es todo lo que existe públicamente.",
    settled:
      "Emparejamiento estable: nadie puede mejorar cambiando de par. Las listas siguen dentro del enclave y no se van a publicar nunca.",
    notFoundNote: "Esa dirección no corresponde a ninguna ronda de este programa.",
    notFound: "Ronda no encontrada",
    you: "tú",
    replay: "Repetir",
    pause: "Pausar",
    play: "Continuar",
    goToTick: "Ir a la ronda",
    deadline: "Cierra en",
    swipeHint: "Desliza para ver ronda por ronda",
    closed: "Cerrada",
  },

  join: {
    sideLabel: "Tu lado del mercado",
    founder: "Founder",
    builder: "Builder",
    founderBlurb: "Producto, go-to-market, distribución. Este lado propone.",
    builderBlurb: "Perfil técnico. Este lado recibe propuestas y elige.",
    sideNote:
      "Los founders proponen y los builders eligen. Eso hace el resultado óptimo para los founders — es una propiedad del algoritmo, y se dice aquí en vez de esconderla.",
    profileErrors: {
      handleEmpty: "Pon un handle.",
      handleTooLong: "El handle no cabe. El límite son 32 bytes: los acentos cuentan dos y los emoji cuatro.",
      linkTooLong: "El enlace no cabe. El límite son 96 bytes.",
    },
    handle: "Handle",
    link: "Link",
    profileNote:
      "Tu perfil es público. Lo privado nunca es quién eres, solo a quién quieres.",
    submit: "Entrar a la ronda",
    connect: "Conecta tu wallet",
    waiting:
      "Espera a que quien organiza delegue la ronda al rollup — tu lista privada no puede existir hasta entonces.",
  },

  autopilot: {
    label: "Piloto automático",
    help: "Deja que la ronda se conduzca sola. Cada paso lo firma la llave local del navegador, así que no vuelve a salir el monedero.",
    enable: "Activar piloto automático",
    disable: "Desactivar",
    on: "Activo",
    tabWarning: "Corre solo mientras esta pestaña esté abierta. Si la cierras, la ronda se queda donde iba y la retomas al volver.",
    waitingDeadline: "Esperando la fecha límite",
    waitingRandomness: "Esperando la aleatoriedad del oráculo",
    waitingQuorum: "Faltan participantes. Nadie puede arreglar esto salvo más gente entrando.",
    running: "Ejecutando",
    doneAll: "Ronda cerrada y devuelta a L1. No queda nada por hacer.",
    stopped: "Detenido tras varios fallos seguidos. Revisa el error y vuelve a activarlo.",
    retrying: "La solicitud de aleatoriedad no llegó. Reintentando.",
  },

  pulse: {
    title: "Los dos encadenados, ahora mismo",
    rollup: "Rollup TEE",
    rollupHost: "devnet-tee.magicblock.app",
    l1: "Solana L1",
    l1Host: "api.devnet.solana.com",
    heroLine: "más rápido que L1, medido en tu navegador ahora mismo",
    faster: "más rápido",
    measuring: "midiendo…",
    perSecond: "slots/s",
    unreachable: "sin respuesta",
    note: "Medido en tu navegador: se le pregunta la altura a cada cadena cada segundo y la tasa sale de lo que contestan. Nada de esto está escrito en la página.",
  },

  steps: {
    title: "Tu recorrido",
    of: "de",
    connect: { name: "Conectar", now: "Conecta tu monedero para entrar a esta ronda." },
    join: { name: "Entrar", now: "Elige tu lado y publica tu perfil. Es lo único público de todo esto." },
    wait: {
      name: "Esperar",
      now: "Estás dentro. La ronda todavía no está en el rollup, así que tu lista privada aún no puede existir.",
    },
    alone: { name: "Sellar lista", now: "Estás solo de tu lado." },
    aloneFounder: "Eres el único founder y no hay ni un builder al que rankear. Una ronda necesita {n} por lado, y el mínimo es por lado, no la suma. Pásale el enlace a quien quieras que entre — pueden unirse hasta que cierre.",
    aloneBuilder: "Eres el único builder y no hay ni un founder al que rankear. Una ronda necesita {n} por lado, y el mínimo es por lado, no la suma. Pásale el enlace a quien quieras que entre — pueden unirse hasta que cierre.",
    copyInvite: "Copiar el enlace de la ronda",
    copied: "Copiado",
    copyManually: "Copia este enlace:",
    rank: { name: "Sellar lista", now: "Ordena a la otra parte. Solo tú podrás leer esa lista." },
    sealed: { name: "Sellada", now: "Tu lista está sellada. Puedes cambiarla mientras la ronda siga abierta." },
    result: { name: "Resultado", now: "La ronda se resolvió. Abajo está tu par." },
    done: "hecho",
    signaturesOne: "1 firma",
    signaturesTwo: "2 firmas",
    signaturesWhy: "una para el enclave, una para la transacción",
    signaturesCached: "el enclave ya te conoce en este navegador",
    connectClosed: "Esta ronda ya cerró. Conecta tu monedero para ver si te tocó par.",
    notInRound: "No participaste en esta ronda. Abajo está lo que publicó.",
    closedTitle: "Ronda cerrada",
    youAre: "Eres",
    matchedWith: "Emparejado con",
    unmatched: "Sin par en esta ronda",
  },

  ranking: {
    label: "Tu ranking privado",
    help: "Toca en orden, del que más quieres al que menos. Puedes dejar gente fuera: no listar a alguien es decir que prefieres quedarte sin par.",
    sessionCreated: "Clave de sesión autorizada. Las siguientes listas no piden firma de transacción.",
    seal: "Sellar mi lista",
    signatureNote:
      "Tu wallet va a pedirte una firma. Esa firma es lo que le prueba al enclave quién eres, y es la razón por la que nadie más puede leer lo que estás por escribir.",
    sealed: "Lista sellada",
    sealedNote:
      "Tu ranking está en una cuenta que solo tu wallet puede leer. No hay instrucción en el programa que la revele, ni al cerrar la ronda ni después. Puedes reemplazarla mientras la ronda siga abierta.",
    change: "Cambiar mi lista",
    dragHint: "Arrastra, o usa las flechas para reordenar",
    moveUp: "Subir un lugar",
    moveDown: "Bajar un lugar",
    reorder: "Reordenar arrastrando",
    remove: "Quitar de mi lista",
    position: "Posición",
    tapToAdd: "Toca para añadir a tu lista",
    nobody: "Todavía no hay nadie del otro lado a quien rankear.",
  },

  controls: {
    label: "Controles de la ronda",
    delegate: "Delegar al rollup",
    settle: "Cerrar y emparejar",
    waitingDeadline: "Esperando el deadline",
    continue: "Continuar el matching",
    notDelegated:
      "Hasta que la ronda esté delegada nadie puede sellar su lista: las cuentas privadas solo existen dentro del rollup.",
    delegated: "Ronda delegada al validador TEE",
    matchStateCreated: "Memoria de trabajo creada, privada y sin miembros",
    closed: "Ronda cerrada",
    completeSetup: "Completar la preparación",
    needsQuorum: "Falta gente para poder cerrar",
    delegateLateHint:
      "Deja la delegación para el final. Antes de delegar, entrar a la ronda es una transacción normal de Solana; después es del rollup, y las billeteras la simulan contra L1, no la entienden y se niegan a firmar. Comparte el enlace, deja que entre la gente, y delega cuando ya estén.",
    operatorFunded: "Clave local del operador fondeada",
    operatorNote:
      "Las acciones del rollup las firma una clave local de este navegador, no tu billetera: tu billetera simula contra L1 y una ronda delegada ya no vive ahí. Ninguna de esas instrucciones comprueba quién firma, solo quién paga. Tu lista de preferencias sigue atada a tu billetera y esta clave no puede leerla.",
    quorumHint:
      "Esta ronda necesita {min} por lado. Faltan {f} founders y {b} builders. El mínimo es por lado, no la suma de los dos.",
    matchStateExists: "La memoria de trabajo ya existía",
    stepDelegate: "Delegada al rollup, con memoria de trabajo privada",
    stepRandomness: "Aleatoriedad verificable confirmada",
    stepSettle: "Cerrada y emparejada",
    setupHint:
      "Falta la aleatoriedad. Si cancelaste una firma durante la preparación, pulsa «Completar la preparación»: repite solo lo que quedó pendiente y es seguro pulsarlo las veces que haga falta.",
    resume: "Retomar el cierre",
    sealIncomplete: "Faltan listas por ingerir — vuelve a intentar",
    ingested: "listas ingeridas al enclave",
    matched: "Matching completo en UNA transacción del rollup",
    vrfRequested: "Aleatoriedad VRF solicitada al oráculo",
    undelegate: "Destruir listas y devolver a L1",
    rankingsDestroyed: "listas destruidas dentro del enclave",
    memoryDestroyed: "Memoria de trabajo destruida",
    undelegated: "Ronda comiteada de vuelta a L1",
    wallClock: "ms de reloj de pared",
  },

  create: {
    errors: {
      empty: "Pon cuántos minutos dura la ronda. En blanco se crearía ya vencida.",
      notNumber: "Eso no es un número de minutos.",
      tooShort: "Mínimo 1 minuto. Menos que eso nace cerrada y nadie alcanza a entrar.",
      tooLong: "Máximo 14 días (20160 minutos). Más que eso suele ser un dígito de más.",
    },
    closesIn: "Cierra en",
    minutes: "minutos",
    transparent: "Ronda transparente",
    transparentNote:
      "Publica los estados intermedios para poder ver el algoritmo correr. Eso revela quién propuso a quién y en qué orden, lo que reconstruye buena parte de los rankings. Úsala solo para demos o cuando todos los participantes lo acepten.",
    submit: "Crear",
    cancel: "Cancelar",
    devnetNote: "Devnet. No se mueve dinero real.",
  },

  start: {
    title: "Listo para abrir tu ronda",
    wallet: "Billetera",
    notConnected: "sin conectar",
    balance: "Saldo en devnet",
    network: "Red",
    networkNote:
      "Tu billetera también tiene que estar en Devnet. Si está en Mainnet, la firma falla con un error de simulación: el programa no existe en esa red.",
    faucet: "Conseguir SOL de devnet",
    connectToOpen: "Conecta tu monedero para abrir una ronda. También puedes entrar a cualquiera de las que están abiertas abajo.",
    whatHappens: "Lo que pasa después",
    steps: [
      "Compartes el enlace de la ronda.",
      "Cada quien entra y escribe su lista dentro del enclave.",
      "Al cerrar, el algoritmo corre en una transacción.",
      "Salen los pares. Las listas se destruyen sin publicarse.",
    ],
    lowBalanceCta: "Necesitas al menos 0.05 SOL de devnet para crear una ronda.",
  },

  errors: {
    rejected: "Cancelaste la firma. No se creó nada.",
    wrongNetwork:
      "Tu billetera está en otra red. Cámbiala a Devnet y vuelve a intentar: en Mainnet este programa no existe, y por eso la simulación falla.",
    lowBalance:
      "Te falta SOL de devnet para pagar la renta de las cuentas. Consíguelo en faucet.solana.com.",
    blockhash: "La red tardó de más. Vuelve a intentar.",
    roundClosed:
      "Esta ronda ya cerró. Si alguien más la cerró mientras escribías, tu lista no alcanzó a entrar.",
    alreadyDone: "Eso ya estaba hecho. No hacía falta repetirlo.",
    notEnough:
      "Falta gente. La ronda exige un mínimo por lado, y contar los dos lados juntos no cuenta.",
    tooEarly: "Todavía no llega la fecha límite.",
    sideFull: "Ese lado ya está lleno.",
    badRanking:
      "Tu lista no es válida: está vacía, repite a alguien, o incluye a alguien que no está en esta ronda.",
    noRandomness:
      "Falta la aleatoriedad verificable. Sin ella el emparejamiento se niega a correr, porque los empates caerían al orden de registro.",
    deadlinePast:
      "La fecha límite ya pasó en el momento en que se envió. El programa rechaza una ronda que nace cerrada.",
    profileTooLong:
      "El handle o el enlace no caben. El límite del programa se mide en bytes, no en letras: los acentos y los emoji ocupan dos o más cada uno.",
    wrongRound: "Esa cuenta pertenece a otra ronda.",
    sealIncomplete:
      "No entraron todas las listas selladas, así que la ronda no puede pasar a emparejar. Vuelve a intentar el sellado.",
    badSession:
      "La clave de sesión no sirve para esto: expiró, o es de otro monedero o de otro programa.",
    badPreferences:
      "Esa cuenta de preferencias no corresponde a esta ronda ni a ese participante.",
    randomnessDone:
      "La aleatoriedad de esta ronda ya llegó. No se puede pedir ni sobrescribir otra vez.",
    badTickBudget: "Ese presupuesto de rondas de propuesta no es válido.",
    overflow: "Un contador se desbordó. Esto es un fallo del programa, no tuyo.",
    unknown: "No se pudo completar la operación.",
  },

  play: {
    label: "Pruébalo",
    title: "Corre el algoritmo tú mismo",
    lede:
      "Cuatro founders, cuatro builders, listas al azar. Es la misma implementación que verifica al programa en cadena, no una imitación. Sin billetera y sin transacción.",
    legend: "Las letras son el orden de preferencia de cada quien.",
    round: "Ronda",
    matched: "Con par",
    proposals: "Propuestas",
    run: "Correr",
    step: "Una ronda",
    reroll: "Otro desempate",
    tiesIrrelevant: "En estas listas el desempate no decide nada: {n} semillas distintas dan exactamente el mismo emparejamiento. Solo hace falta cuando alguien no clasificó a ninguno de los dos que le proponen.",
    tiesMatter: "Aquí el desempate sí decide: {d} de {n} semillas dan un emparejamiento distinto. Sin aleatoriedad verificable esto lo resolvería el orden de registro, o sea quien se registró primero.",
    shuffle: "Otras listas",
    reset: "Reiniciar",
    stable: "Estable: no existe ninguna pareja que prefiera dejarse por estar junta.",
    unstable: "Inestable. Si ves esto, hay un error y quiero saberlo.",
  },

  privacy: {
    title: "Lo que esta ronda no publica",
    lede:
      "La dirección de cada lista se deriva de la ronda y de la billetera de su dueño, así que cualquiera puede calcularlas — tú incluido, aquí abajo. Se le preguntan a las dos cadenas desde tu navegador, junto con dos controles: si una conexión ni siquiera alcanza a leer la cuenta pública de la ronda, su silencio sobre las listas no significa nada.",
    run: "Buscar las listas",
    running: "Buscando…",
    checked: "Direcciones consultadas",
    found: "Encontradas en L1",
    passed:
      "Las dos cadenas contestaron, y ninguna entregó una sola lista. Nunca se publicaron en L1, y el rollup no se las sirve a una conexión sin token. En una ronda ya cerrada además fueron destruidas dentro del enclave: silencio por protegidas o silencio por destruidas, las dos son la promesa. Lo que queda descartado es que estén publicadas en algún lado.",
    failed:
      "Al menos una se dejó leer. Eso es una fuga: la promesa central del proyecto es falsa en esta ronda.",
    probeL1Control: "L1 contesta: la cuenta pública de la ronda se lee ahí",
    probeTeeControl: "El rollup le contesta a esta conexión sin token: la misma cuenta pública se lee",
    probeL1Prefs: "Listas de preferencias encontradas en L1",
    probeTeePrefs: "Listas que un extraño alcanza a leer del rollup",
    inconclusive: "Uno de los controles falló, así que las dos ausencias de abajo no prueban nada: una consulta rota devuelve exactamente lo mismo que una lista protegida. Vuelve a intentarlo.",
    showAddresses: "Ver las direcciones y comprobarlas por tu cuenta",
  },

  verify: {
    title: "Compruébalo tú mismo",
    lede:
      "Esta ronda publica su traza completa. Vuelve a calcularla aquí, en tu navegador, y compárala con lo que dice la cadena. No tienes que creerme.",
    run: "Verificar",
    running: "Verificando…",
    injective: "Ningún builder aparece tomado por dos founders",
    inRange: "Todos los índices existen en esta ronda",
    monotone: "El número de emparejados nunca retrocede",
    matchesChain: "La traza termina exactamente en el resultado en cadena",
    passed: "Cuadra.",
    failed: "No cuadra.",
    limit:
      "Lo que esto no comprueba, y no puede: si las listas ocultas se respetaron. Eso exigiría las listas, y las listas se destruyeron sin publicarse. Ese es el trato — proceso y resultado verificables, entradas no.",
  },

  proof: {
    label: "Pruebas",
    title: "No tienes que creerme nada de esto",
    lede:
      "Cada comprobación de aquí corre en tu máquina, sobre datos públicos, sin billetera. La última sección dice lo que ninguna de ellas puede establecer.",
    stability: {
      title: "La garantía de estabilidad, comprobada aquí",
      lede:
        "Genera cuatrocientos mercados —la mitad con listas completas, la mitad con listas cortadas— corre el mismo algoritmo que corre en cadena, y busca en cada resultado un par bloqueante: dos personas que preferirían dejarse por estar juntas. Si existe uno solo, la promesa es falsa. Las listas cortadas están ahí a propósito: el desempate solo se consulta cuando alguien no clasificó a ninguno de los dos que le proponen, así que con listas completas nunca se ejecuta.",
      run: "Correr 400 mercados",
      running: "Corriendo…",
      cases: "Mercados",
      blocking: "Pares bloqueantes",
      withTies: "Con empates posibles",
      deepest: "Rondas, la más larga",
      time: "Tiempo",
      passed:
        "Ni un par bloqueante en cuatrocientos mercados. Eso es lo que significa estable, y es la única promesa de este proyecto que es matemática y no de ingeniería.",
      failed:
        "Apareció un par bloqueante. Eso es un error y quiero saberlo — el código está en el repositorio, en lib/matching.ts.",
    },
    round: {
      title: "Una ronda concreta, contra la cadena",
      lede:
        "Solo las rondas transparentes publican su traza. Elige una y compárala con lo que dice Solana.",
      pick: "Ronda",
      none: "Todavía no hay ninguna ronda transparente cerrada que comprobar.",
    },
    limits: {
      title: "Lo que nada de esto demuestra",
      items: [
        {
          title: "Que se respetaron las listas",
          body:
            "Haría falta tener las listas, y se destruyeron sin publicarse. Puedes verificar el proceso y el resultado; las entradas no.",
        },
        {
          title: "Que el enclave es honesto",
          body:
            "La garantía es de hardware: confías en la atestación del TEE de MagicBlock, no en mí. Si esa atestación se rompe, se rompe la privacidad.",
        },
        {
          title: "Que cada wallet es una persona",
          body:
            "No hay verificación de identidad. Alguien puede registrar varias. Es un problema de identidad, no de emparejamiento.",
        },
        {
          title: "Que un pool chico no filtra",
          body:
            "Con pocas personas por lado, los pares publicados revelan el resto por eliminación. Se mitiga con un mínimo; no se elimina.",
        },
      ],
      explorer: "Ver el programa en el explorador",
    },
  },

  ledger: {
    title: "El cero, contado — no escrito por mí",
    lede:
      "Una llamada pública a Solana devnet pregunta cuántas cuentas de lista de preferencias tiene este programa. La respuesta es cero porque esas cuentas nacen dentro del enclave y ahí se destruyen. La misma llamada, con otro tamaño, devuelve los perfiles públicos: ese es el control, sin él un cero podría significar que la consulta está rota.",
    run: "Consultar la cadena",
    running: "Consultando…",
    lists: "Listas de preferencias en L1",
    listsNote: "Nunca se escribió ninguna fuera del enclave.",
    profiles: "Perfiles públicos en L1",
    profilesNote: "El control: la misma consulta, otro tamaño de cuenta.",
    verdictOk:
      "El control contestó, así que el cero de arriba es un cero medido: esta consulta sí encuentra cuentas de este programa cuando existen, y de listas de preferencias no encuentra ninguna.",
    verdictBroken:
      "El control también salió en cero, y eso no puede ser: los perfiles públicos sí están en L1. La consulta está rota o el RPC no contestó, así que el cero de las listas no prueba nada. Vuelve a intentarlo.",
    showCommand: "Ver el comando y correrlo tú",
  },

  preflight: {
    wrongNetwork:
        "Tu wallet no está en Devnet. Cámbiala antes de firmar: aquí el programa no existe en otra red.",
    lowBalance:
        "Te queda muy poco SOL de devnet. Consigue más en faucet.solana.com antes de crear una ronda o entrar.",
  },

  palette: {
    open: "Buscar",
    placeholder: "Salta a una sección o a una ronda…",
    empty: "Nada coincide",
  },

  ticker: {
    label: "Último par",
  },

  common: {
    loading: "Cargando…",
    close: "Cerrar",
    error: "Algo falló",
  },
};

// No `as const`: literal types here would make every English string a type
// error rather than a translation. Widening to `string` is the point — the
// shape is what must match, not the words.
export type Dictionary = typeof es;
