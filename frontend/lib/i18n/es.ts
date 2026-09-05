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
    home: "Ronda Ciega, inicio",
  },

  hero: {
    headline: "Dices a quién quieres",
    subline: "sin que nadie sepa que lo dijiste.",
    lede: "Matching estable donde las listas de preferencias nunca se publican. Ni al cerrar, ni después, ni para nadie.",
    cta: "Ver rondas",
    ctaHow: "Cómo funciona",
    sealed: "listas selladas",
    stable: "estable",
    round: "ronda",
    proposing: "proponiendo…",
    settledNote: "estable — nadie mejora cambiando de par",
    proposers: "founders proponen",
    receivers: "builders eligen",
  },

  band: {
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

  example: {
    label: "Un ejemplo",
    title: "Cuatro personas, tres rondas",
    body: "Ana y Cami quieren al mismo builder. Eli prefiere a Cami. Ana queda desplazada en la ronda 2 y cae a su segunda opción. Nadie se entera de las listas — solo del resultado.",
    tickLabel: "ronda",
  },

  limits: {
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
    label: "Medido en devnet",
    proposalsPerTick: "Propuestas por ronda",
    convergence: "Convergencia",
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
    notFound: "Ronda no encontrada",
    you: "tú",
    replay: "Repetir",
    pause: "Pausar",
    play: "Continuar",
    goToTick: "Ir a la ronda",
    deadline: "Cierra en",
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
    handle: "Handle",
    link: "Link",
    profileNote:
      "Tu perfil es público. Lo privado nunca es quién eres, solo a quién quieres.",
    submit: "Entrar a la ronda",
    connect: "Conecta tu wallet",
    waiting:
      "Espera a que quien organiza delegue la ronda al rollup — tu lista privada no puede existir hasta entonces.",
    youAreIn: "Estás dentro como",
  },

  ranking: {
    label: "Tu ranking privado",
    help: "Toca en orden, del que más quieres al que menos. Puedes dejar gente fuera: no listar a alguien es decir que prefieres quedarte sin par.",
    seal: "Sellar mi lista",
    signatureNote:
      "Tu wallet va a pedirte una firma. Esa firma es lo que le prueba al enclave quién eres, y es la razón por la que nadie más puede leer lo que estás por escribir.",
    sealed: "Lista sellada",
    sealedNote:
      "Tu ranking está en una cuenta que solo tu wallet puede leer. No hay instrucción en el programa que la revele, ni al cerrar la ronda ni después. Puedes reemplazarla mientras la ronda siga abierta.",
    change: "Cambiar mi lista",
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
    ingested: "listas ingeridas al enclave",
    matched: "Matching completo en UNA transacción del rollup",
    vrfRequested: "Aleatoriedad VRF solicitada al oráculo",
    vrfWaiting: "Esperando la aleatoriedad del oráculo…",
    vrfReady: "Aleatoriedad verificable lista",
    undelegate: "Devolver a L1",
    undelegated: "Ronda comiteada de vuelta a L1",
    wallClock: "ms de reloj de pared",
  },

  create: {
    closesIn: "Cierra en",
    minutes: "minutos",
    transparent: "Ronda transparente",
    transparentNote:
      "Publica los estados intermedios para poder ver el algoritmo correr. Eso revela quién propuso a quién y en qué orden, lo que reconstruye buena parte de los rankings. Úsala solo para demos o cuando todos los participantes lo acepten.",
    submit: "Crear",
    cancel: "Cancelar",
    devnetNote: "Devnet. No se mueve dinero real.",
  },

  preflight: {
    wrongNetwork:
        "Tu wallet no está en Devnet. Cámbiala antes de firmar: aquí el programa no existe en otra red.",
    lowBalance:
        "Te queda muy poco SOL de devnet. Consigue más en faucet.solana.com antes de crear una ronda o entrar.",
  },

  common: {
    loading: "Cargando…",
    error: "Algo falló",
    copy: "Copiar",
    copied: "Copiado",
    close: "Cerrar",
  },
};

// No `as const`: literal types here would make every English string a type
// error rather than a translation. Widening to `string` is the point — the
// shape is what must match, not the words.
export type Dictionary = typeof es;
