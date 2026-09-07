import type { Dictionary } from "./es";

/**
 * Typed against the Spanish dictionary, so a missing key fails the build
 * instead of showing up as a blank label mid-demo.
 */
export const en: Dictionary = {
  nav: {
    tagline: "blind matching",
    network: "Devnet",
    theme: "Toggle theme",
    language: "Change language",
    menu: "Menu",
    sections: "Sections",
    home: "Ronda Ciega, home",
  },

  hero: {
    headline: "Say who you want",
    subline: "without anyone knowing you said it.",
    lede: "Stable matching where preference lists are never published. Not at the deadline, not afterwards, not to anyone.",
    cta: "See rounds",
    sealed: "sealed lists",
    stable: "stable",
    round: "round",
    proposing: "proposing…",
    settledNote: "stable — nobody gains by switching",
    proposers: "founders propose",
    receivers: "builders choose",
  },

  band: {
    proposals: "proposals",
    matching: "Whole matching, wall clock",
    vrf: "For verifiable randomness to land",
    oneTx: "Rollup transaction for the entire matching",
    leaked: "Preference lists published. Ever.",
  },

  problem: {
    label: "The problem",
    title: "Nobody states who they actually want",
    cards: [
      {
        title: "Saying it is costly",
        body: "If I say I want you as a cofounder and you don't, I lose standing with you and with everyone who hears.",
      },
      {
        title: "So nobody says it",
        body: "People open with their third choice, or wait for the other side to move. The market matches badly.",
      },
      {
        title: "The 1962 fix isn't enough",
        body: "Gale–Shapley solves this on paper, but it needs a third party to hold every list and never leak it.",
      },
    ],
  },

  solution: {
    label: "The solution",
    title: "The trusted third party is an enclave",
    body: "Lists are written inside a MagicBlock Private Ephemeral Rollup, behind a permission whose only member is you. The algorithm runs in there. Only the pairings come out.",
    steps: [
      { title: "You join", body: "Your profile is public. On Solana L1." },
      { title: "You seal a list", body: "The account is created inside the enclave." },
      { title: "The algorithm runs", body: "One rollup transaction." },
      { title: "Pairings come out", body: "Nothing else. Lists close without being revealed." },
    ],
  },

  compare: {
    label: "Why this isn't commit-reveal",
    title: "The secret can't have an expiry date",
    commitReveal: {
      title: "Commit-reveal",
      points: [
        "You publish a hash of your list",
        "At the deadline you publish the original",
        "Anyone verifies you didn't change it",
        "Your ranking is public forever",
      ],
      verdict: "The social cost arrives late, but it arrives",
    },
    privateEr: {
      title: "Private Ephemeral Rollup",
      points: [
        "Your list is written inside the enclave",
        "The program reads it, nobody else",
        "The result is verifiable on chain",
        "Your ranking is never published",
      ],
      verdict: "There is no instruction that reveals it",
    },
  },

  limits: {
    title: "The limits, before you ask",
    label: "What we don't promise",
    items: [
      {
        title: "The result leaks, by design",
        body: "If you end up matched with me, you know you were on my list. That's the product, not a leak.",
      },
      {
        title: "Access control, not encryption",
        body: "State isn't ciphertext: the TEE refuses to serve it to anyone outside the member list. The guarantee is hardware-backed.",
      },
      {
        title: "A small pool leaks",
        body: "With four people per side, the pairings reveal a lot about the rest. Rounds enforce a minimum.",
      },
      {
        title: "No identity verification",
        body: "One human can register several wallets. Out of scope for a one-week build.",
      },
    ],
  },

  stats: {
    title: "These numbers came off real runs",
    label: "Measured on devnet",
    convergence: "Convergence",
    convergenceNote: "Each proposal round, starting from nobody paired.",
    matched: "matched",
    unmatched: "unmatched",
    latency: "Matching latency",
    latencyOneTx: "One transaction",
    latencyPerTick: "One per round",
    latencyNote: "Same work, a single network trip.",
    empty: "No data from a settled round yet.",
    tick: "round",
    table: "View as table",
  },

  status: {
    open: "open",
    sealing: "sealing",
    matching: "matching",
    settled: "closed",
  },

  rounds: {
    label: "Rounds",
    note: "Everything runs on devnet. No real money moves.",
    create: "Create round",
    empty: "No rounds yet. Create one to try the whole flow.",
    founders: "founders",
    builders: "builders",
    peek: "Preview the outcome",
    emptyRounds: "empty rounds from test runs",
    hideEmpty: "Hide the empty ones",
    emptyNote:
      "Devnet keeps every round ever opened. These are left over from running the test suites: no lists, never settled. They are folded away, not removed.",
    sealedLists: "sealed lists",
  },

  round: {
    title: "Round",
    transparent: "transparent",
    onRollup: "on the rollup",
    transparentWarning:
      "It publishes the algorithm's intermediate states, which reveals who proposed to whom and in what order. Full lists stay sealed, but this round doesn't give the complete guarantee — which is why it's for demos only.",
    algorithm: "The algorithm, round by round",
    result: "Result",
    notTransparent:
      "This round isn't transparent, so there's nothing to animate: the intermediate states never left the enclave. What's above is everything that exists publicly.",
    settled:
      "Stable matching: nobody can do better by switching. The lists are still inside the enclave and will never be published.",
    notFoundNote: "That address is not a round of this program.",
    notFound: "Round not found",
    you: "you",
    replay: "Replay",
    pause: "Pause",
    play: "Continue",
    goToTick: "Go to round",
    deadline: "Closes in",
    swipeHint: "Swipe to step through the rounds",
    closed: "Closed",
  },

  join: {
    sideLabel: "Your side of the market",
    founder: "Founder",
    builder: "Builder",
    founderBlurb: "Product, go-to-market, distribution. This side proposes.",
    builderBlurb: "Technical profile. This side receives proposals and chooses.",
    sideNote:
      "Founders propose and builders choose. That makes the outcome founder-optimal — it's a property of the algorithm, and it's stated here rather than hidden.",
    handle: "Handle",
    link: "Link",
    profileNote:
      "Your profile is public. What stays private is never who you are, only who you want.",
    submit: "Join the round",
    connect: "Connect your wallet",
    waiting:
      "Wait for the organiser to delegate the round to the rollup — your private list can't exist until then.",
    youAreIn: "You're in as",
  },

  autopilot: {
    label: "Autopilot",
    help: "Let the round drive itself. Every step is signed by the local browser key, so the wallet never asks again.",
    enable: "Turn on autopilot",
    disable: "Turn off",
    on: "On",
    tabWarning: "Runs only while this tab is open. Close it and the round stays where it got to; it picks up when you come back.",
    waitingDeadline: "Waiting for the deadline",
    waitingRandomness: "Waiting for the oracle's randomness",
    waitingQuorum: "Short of participants. Nothing but more people joining fixes this.",
    running: "Running",
    doneAll: "Round settled and handed back to L1. Nothing left to do.",
    stopped: "Stopped after repeated failures. Read the error and turn it back on.",
    retrying: "The randomness request never landed. Asking again.",
  },

  pulse: {
    title: "Both chains, right now",
    rollup: "TEE rollup",
    rollupHost: "devnet-tee.magicblock.app",
    l1: "Solana L1",
    l1Host: "api.devnet.solana.com",
    faster: "faster",
    measuring: "measuring…",
    perSecond: "slots/s",
    unreachable: "no answer",
    note: "Measured in your browser: each chain is asked for its height about once a second and the rate comes out of what they answer. None of this is typed into the page.",
  },

  steps: {
    title: "Where you are",
    of: "of",
    connect: { name: "Connect", now: "Connect your wallet to take part in this round." },
    join: { name: "Join", now: "Pick your side and publish your profile. It is the only public part of this." },
    wait: {
      name: "Wait",
      now: "You're in. The round isn't on the rollup yet, so your private list can't exist until it is.",
    },
    rank: { name: "Seal a list", now: "Order the other side. Nobody but you can read that list." },
    sealed: { name: "Sealed", now: "Your list is sealed. You can replace it while the round is open." },
    result: { name: "Result", now: "The round settled. Your pairing is below." },
    done: "done",
    signaturesOne: "1 signature",
    signaturesTwo: "2 signatures",
    signaturesNone: "no signature",
    signaturesWhy: "one for the enclave, one for the transaction",
    signaturesCached: "the enclave already knows you in this browser",
    connectClosed: "This round is closed. Connect your wallet to see whether you were matched.",
    notInRound: "You weren't in this round. What it published is below.",
    closedTitle: "Round closed",
    youAre: "You are",
    matchedWith: "Matched with",
    unmatched: "No pair in this round",
  },

  ranking: {
    label: "Your private ranking",
    help: "Tap in order, from who you want most to least. You can leave people out: not listing someone says you'd rather stay unmatched.",
    seal: "Seal my list",
    signatureNote:
      "Your wallet will ask for a signature. That signature is what proves to the enclave who you are, and it's the reason nobody else can read what you're about to write.",
    sealed: "List sealed",
    sealedNote:
      "Your ranking is in an account only your wallet can read. There is no instruction in the program that reveals it, not at the deadline and not after. You can replace it while the round is open.",
    change: "Change my list",
    dragHint: "Drag, or use the arrows to reorder",
    moveUp: "Move up one place",
    moveDown: "Move down one place",
    reorder: "Reorder by dragging",
    remove: "Remove from my list",
    position: "Position",
    tapToAdd: "Tap to add to your list",
    nobody: "Nobody on the other side to rank yet.",
  },

  controls: {
    label: "Round controls",
    delegate: "Delegate to the rollup",
    settle: "Close and match",
    waitingDeadline: "Waiting for the deadline",
    continue: "Continue matching",
    notDelegated:
      "Until the round is delegated nobody can seal a list: private accounts only exist inside the rollup.",
    delegated: "Round delegated to the TEE validator",
    matchStateCreated: "Working memory created, private with no members",
    closed: "Round closed",
    completeSetup: "Complete the setup",
    needsQuorum: "Not enough people to close",
    delegateLateHint:
      "Leave delegating until last. Before it, joining is an ordinary Solana transaction; after it, joining is a rollup transaction, and wallets simulate those against L1, fail to make sense of them, and refuse to sign. Share the link, let people in, then delegate.",
    operatorFunded: "Local operator key funded",
    operatorNote:
      "Rollup actions are signed by a local key in this browser, not by your wallet: your wallet simulates against L1, and a delegated round no longer lives there. None of those instructions check who signed, only who paid. Your preference list stays bound to your wallet, and this key cannot read it.",
    quorumHint:
      "This round needs {min} per side. It is short {f} founders and {b} builders. The minimum is per side, not the two added together.",
    matchStateExists: "The working memory already existed",
    stepDelegate: "Delegated to the rollup, private working memory created",
    stepRandomness: "Verifiable randomness confirmed",
    stepSettle: "Closed and matched",
    setupHint:
      "Randomness is missing. If you declined a signature during setup, press Complete the setup: it repeats only what is left and is safe to press as many times as needed.",
    resume: "Resume settling",
    sealIncomplete: "Some lists were not ingested — try again",
    ingested: "lists ingested into the enclave",
    matched: "Matching completed in ONE rollup transaction",
    vrfRequested: "VRF randomness requested from the oracle",
    vrfWaiting: "Waiting for the oracle's randomness…",
    vrfReady: "Verifiable randomness ready",
    undelegate: "Destroy lists and commit to L1",
    rankingsDestroyed: "rankings destroyed inside the enclave",
    memoryDestroyed: "Working memory destroyed",
    undelegated: "Round committed back to L1",
    wallClock: "ms wall clock",
  },

  create: {
    closesIn: "Closes in",
    minutes: "minutes",
    transparent: "Transparent round",
    transparentNote:
      "Publishes the intermediate states so the algorithm can be watched running. That reveals who proposed to whom and in what order, which reconstructs much of everyone's ranking. Use it only for demos or when every participant agrees.",
    submit: "Create",
    cancel: "Cancel",
    devnetNote: "Devnet. No real money moves.",
  },

  start: {
    title: "Ready to open your round",
    wallet: "Wallet",
    notConnected: "not connected",
    balance: "Devnet balance",
    network: "Network",
    networkNote:
      "Your wallet has to be on Devnet too. On Mainnet the signature fails with a simulation error, because this program does not exist there.",
    faucet: "Get devnet SOL",
    whatHappens: "What happens next",
    steps: [
      "You share the round link.",
      "Everyone joins and writes their list inside the enclave.",
      "At the deadline the algorithm runs in one transaction.",
      "The pairings come out. The lists are destroyed unpublished.",
    ],
    lowBalanceCta: "You need at least 0.05 devnet SOL to open a round.",
  },

  errors: {
    rejected: "You cancelled the signature. Nothing was created.",
    wrongNetwork:
      "Your wallet is on another network. Switch it to Devnet and try again: this program does not exist on Mainnet, which is why the simulation fails.",
    lowBalance:
      "Not enough devnet SOL to pay the accounts rent. Get some at faucet.solana.com.",
    blockhash: "The network took too long. Try again.",
    roundClosed:
      "This round has closed. If someone else closed it while you were writing, your list did not make it in.",
    alreadyDone: "That was already done. No need to repeat it.",
    notEnough:
      "Not enough people. The round needs a minimum per side, and the two sides together do not count.",
    tooEarly: "The deadline has not passed yet.",
    sideFull: "That side is already full.",
    badRanking:
      "Your list is not valid: it is empty, repeats someone, or includes someone who is not in this round.",
    noRandomness:
      "Verifiable randomness is missing. Without it the matching refuses to run, because ties would fall to registration order.",
    unknown: "The operation could not be completed.",
  },

  play: {
    label: "Try it",
    title: "Run the algorithm yourself",
    lede:
      "Four founders, four builders, random lists. This is the same implementation that verifies the on-chain program, not an imitation of it. No wallet, no transaction.",
    legend: "The letters are each person's order of preference.",
    round: "Round",
    matched: "Paired",
    proposals: "Proposals",
    run: "Run",
    step: "One round",
    shuffle: "New lists",
    reset: "Reset",
    stable: "Stable: no pair would both rather leave their match for each other.",
    unstable: "Unstable. If you see this there is a bug and I want to hear about it.",
  },

  proof: {
    label: "Proof",
    title: "You do not have to take my word for any of this",
    lede:
      "Every check here runs on your machine, against public data, without a wallet. The last section says what none of them can establish.",
    stability: {
      title: "The stability guarantee, checked here",
      lede:
        "Generate four hundred markets with random lists, run the same algorithm the chain runs, and look in each result for a blocking pair: two people who would both rather leave their match for each other. One is enough to make the promise false.",
      run: "Run 400 markets",
      running: "Running…",
      cases: "Markets",
      blocking: "Blocking pairs",
      deepest: "Rounds, deepest",
      time: "Time",
      passed:
        "Not one blocking pair in four hundred markets. That is what stable means, and it is the only promise here that is mathematical rather than engineering.",
      failed:
        "A blocking pair turned up. That is a bug and I want to hear about it — the code is in the repository, at lib/matching.ts.",
    },
    round: {
      title: "One real round, against the chain",
      lede:
        "Only transparent rounds publish their trace. Pick one and compare it with what Solana says.",
      pick: "Round",
      none: "No settled transparent round to check yet.",
    },
    limits: {
      title: "What none of this proves",
      items: [
        {
          title: "That the lists were respected",
          body:
            "It would take the lists, and they were destroyed unpublished. You can verify the process and the outcome; the inputs, no.",
        },
        {
          title: "That the enclave is honest",
          body:
            "The guarantee is hardware: you trust the MagicBlock TEE attestation, not me. If that attestation breaks, the privacy breaks.",
        },
        {
          title: "That each wallet is a person",
          body:
            "There is no identity check. One human can register several. That is an identity problem, not a matching one.",
        },
        {
          title: "That a small pool does not leak",
          body:
            "With few people per side the published pairs reveal the rest by elimination. A minimum mitigates it; nothing removes it.",
        },
      ],
      explorer: "See the program on the explorer",
    },
  },

  ledger: {
    title: "The zero, counted — not written by me",
    lede:
      "A public call to Solana devnet asks how many preference-list accounts this program owns. The answer is zero, because those accounts are created inside the enclave and destroyed there. The same call one size along returns the public profiles: that is the control, and without it a zero could just mean the query was broken.",
    run: "Query the chain",
    running: "Querying…",
    lists: "Preference lists on L1",
    listsNote: "Not one was ever written outside the enclave.",
    profiles: "Public profiles on L1",
    profilesNote: "The control: same query, different account size.",
    showCommand: "Show the command and run it yourself",
  },
  privacy: {
    title: "What this round does not publish",
    lede:
      "Each list has an address derived from the round and its owner's wallet, so anyone can compute them — you, below. Both chains are asked for them from your browser, along with two controls: a connection that cannot even read the round's public account proves nothing by staying silent about a list.",
    run: "Go looking for the lists",
    running: "Looking…",
    checked: "Addresses checked",
    found: "Found on L1",
    passed:
      "Both chains answered, and neither handed over a list. They were never published to L1, and the rollup will not serve them to a connection with no token. On a round that has already closed they were also destroyed inside the enclave: silence because shielded or silence because destroyed, and both are the promise. What is ruled out is that they are readable anywhere.",
    failed:
      "At least one could be read. That is a leak: the project's central claim is false for this round.",
    probeL1Control: "L1 answers: the round's public account reads back from it",
    probeTeeControl: "The rollup answers this token-less connection: the same public account reads back",
    probeL1Prefs: "Preference lists found on L1",
    probeTeePrefs: "Lists an outsider can read off the rollup",
    inconclusive: "One of the controls failed, so the two absences below prove nothing either way — a broken query returns exactly what a shielded list does. Run it again.",
    showAddresses: "Show the addresses and check them yourself",
  },

  verify: {
    title: "Check it yourself",
    lede:
      "This round publishes its full trace. Recompute it here, in your browser, and compare it with what the chain says. You do not have to take my word for it.",
    run: "Verify",
    running: "Verifying…",
    injective: "No builder is held by two founders",
    inRange: "Every index refers to someone in this round",
    monotone: "The number of pairs never falls",
    matchesChain: "The trace ends exactly where the chain says",
    passed: "It checks out.",
    failed: "It does not check out.",
    limit:
      "What this cannot check: whether the hidden lists were respected. That would need the lists, and the lists were destroyed unpublished. That is the trade — a verifiable process and a verifiable outcome, not verifiable inputs.",
  },

  preflight: {
    wrongNetwork:
        "Your wallet is not on Devnet. Switch before signing — the program does not exist on another cluster.",
    lowBalance:
        "Very little devnet SOL left. Top up at faucet.solana.com before creating a round or joining.",
  },

  palette: {
    open: "Search",
    placeholder: "Jump to a section or a round…",
    empty: "Nothing matches",
  },

  ticker: {
    label: "Latest pair",
  },

  common: {
    loading: "Loading…",
    close: "Close",
    error: "Something failed",
  },
};
