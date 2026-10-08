/**
 * GAME_CONFIG — every tunable gameplay / camera / audio value lives here so that
 * systems never hard-code "magic numbers". Values are in SI units (meters, seconds)
 * unless stated otherwise.
 */
export const GAME_CONFIG = {
  version: "0.1.0",
  saveKey: "history-traveler.save.v1",

  player: {
    height: 1.8,
    eyeHeight: 1.64,
    radius: 0.36,
    movementSpeed: 4.3,
    sprintSpeed: 7.6,
    carrySpeedMultiplier: 0.8,
    acceleration: 16,
    deceleration: 12,
    airControl: 0.3,
    jumpForce: 5.4,
    gravity: 18,
    stepHeight: 0.5,
    maxFallSpeed: 40,
    interactDistance: 3.2,
    interactMinDot: 0.55,
    footstepStride: 1.9,
  },

  camera: {
    fov: 85,
    minFov: 80,
    maxFov: 100,
    nearPlane: 0.06,
    farPlane: 1600,
    maxPitchDeg: 86,
    headBob: {
      walkFrequency: 1.85,
      walkAmplitude: 0.042,
      sprintFrequency: 2.55,
      sprintAmplitude: 0.075,
      lateralRatio: 0.5,
      rollDeg: 0.6,
    },
    sprintFovBoost: 7,
    landingDip: 0.12,
    idleSway: 0.006,
  },

  input: {
    mouseSensitivity: 1,
    minSensitivity: 0.2,
    maxSensitivity: 3,
    baseMouseScale: 0.0021,
    touchLookScale: 0.0055,
    joystickRadiusPx: 56,
  },

  graphics: {
    defaultQualityDesktop: "HIGH" as const,
    defaultQualityMobile: "LOW" as const,
    defaultQualityMobileHighEnd: "MEDIUM" as const,
  },

  audio: {
    master: 0.8,
    music: 0.5,
    sfx: 0.85,
  },

  map: {
    /** Projection origin (lon/lat) roughly at the center of Türkiye. */
    originLon: 35.3,
    originLat: 38.9,
    /** World units per degree latitude. */
    unitsPerDegree: 10,
    provinceHeight: 0.7,
    neighborHeight: 0.25,
    hoverLift: 0.35,
    activeLift: 0.25,
    borderWidth: 0.07,
    outlineWidth: 0.22,
    cameraRadius: 150,
    cameraBeta: 0.78,
    cameraAlpha: -Math.PI / 2,
    zoomDuration: 2.4,
  },

  world: {
    waterLevel: 0,
    bounds: { minX: -400, maxX: 400, minZ: -260, maxZ: 400 },
    fogColor: [0.78, 0.74, 0.66] as const,
    fogDensity: 0.0016,
  },

  npc: {
    /** Distance thresholds for the NPC animation/visibility LOD. */
    animFullDistance: 40,
    animReducedDistance: 90,
    visibleDistance: 260,
    walkSpeed: 1.6,
    runSpeed: 4.2,
    turnSpeed: 6,
    lookAtDistance: 7,
  },

  minigames: {
    ship: {
      duration: 95,
      beatInterval: 1.05,
      perfectWindow: 0.11,
      goodWindow: 0.24,
      perfectPower: 1.6,
      goodPower: 1,
      weakPower: 0.45,
      idleDecayPerSecond: 0.0035,
      uphillDecayBonus: 0.004,
      progressPerPower: 0.0123,
      comboBonusStep: 0.06,
      maxComboBonus: 0.5,
    },
    cannon: {
      muzzleSpeed: 58,
      gravity: 9.81,
      minElevationDeg: 0,
      maxElevationDeg: 24,
      yawLimitDeg: 32,
      elevationStepDeg: 0.6,
      reloadTime: 2.4,
      shakeIntensity: 0.32,
      trajectoryPreviewFraction: 0.18,
    },
    siege: {
      captureRadius: 7,
      captureTime: 9,
      allyBonusPerSoldier: 0.12,
      maxAllyBonus: 0.8,
      arrowInterval: 1.4,
      stunDuration: 0.7,
    },
    flag: {
      holdTime: 2.6,
    },
    // ---- Muğla: keşkek chapter
    dibek: {
      /** Seconds between strikes (the two of you alternate, so you strike every other beat). */
      startInterval: 0.82,
      endInterval: 0.66,
      perfectWindow: 0.1,
      goodWindow: 0.21,
      clashWindow: 0.12,
      perfectGain: 5.2,
      goodGain: 3.6,
      weakGain: 1.2,
      clashPenalty: 2,
    },
    forest: {
      duration: 150,
      extraTime: 45,
      branches: 10,
      cira: 3,
      pickRadius: 2.4,
      /** Each carried bundle slows you a little (never below minSpeed). */
      weightPerItem: 0.025,
      minSpeed: 0.72,
    },
    fire: {
      startHeat: 22,
      startFuel: 35,
      bandMin: 55,
      bandMax: 82,
      overflowAt: 92,
      boilPerSecond: 2.4,
      fuelPerLog: 22,
      logCooldown: 0.7,
      bellowsBoost: 16,
      emberPull: 18,
      gustEvery: [11, 17] as const,
    },
    // ---- Ankara: TBMM chapter
    lamps: {
      reach: 2.4,
      /** Needle sweeps per second (grows a little with every lit lamp). */
      sweepSpeed: 0.55,
      sweepGain: 0.05,
      zoneWidth: 0.16,
    },
    telegraph: {
      /** Holding the key longer than this (seconds) sends a dash. */
      dashThreshold: 0.22,
      words: ["ANKARA", "MECLIS", "23 NISAN"],
    },
    minutes: {
      /** Wrong keystrokes forgiven per word before the ink blots. */
      blotEvery: 4,
    },
    // ---- Samsun: 19 May 1919
    atis: {
      popups: 12,
      hitsNeeded: 7,
      ammo: 20,
      clip: 5,
      boltTime: 0.75,
      reloadTime: 2.2,
      /** Seconds a target stays up (first → last pop-up). */
      upTime: [3.2, 1.9] as const,
      /** Aim sway amplitude (radians) and how much holding the breath steadies it. */
      sway: 0.014,
      breathSteady: 0.22,
      breathMax: 3,
    },
    durbun: {
      /** Zoomed field of view (radians) and seconds the crosshair must stay on a ship. */
      fov: 0.24,
      holdTime: 1.0,
    },
    toren: {
      commands: 12,
      needed: 9,
      /** Reaction window after the execution word (first → last command). */
      window: [1.0, 0.62] as const,
    },
    duello: {
      playerHp: 6,
      bossHp: 30,
      parryWindow: 0.2,
    },
    // ---- Kayseri: bazaar chapter
    manti: {
      /** Knife sweeps per second across the dough sheet. */
      knifeSpeed: 0.42,
      /** Cut lines (strips) before folding starts. */
      cuts: 6,
      /** Allowed distance from the guide line (fraction of the sheet width). */
      cutTolerance: 0.035,
      /** Folding rounds (four mantı each) and the time per round. */
      rounds: 10,
      roundTime: [3.4, 2.0] as const,
    },
    sac: {
      /** Good yufkas needed for the yağlama. */
      needed: 8,
      /** Doneness per second for each of the three griddles (1 = golden). */
      rates: [0.3, 0.38, 0.34] as const,
      /** Doneness windows: perfect inside ±perfect of 1, good inside ±good. */
      perfect: 0.15,
      good: 0.3,
      burn: 1.6,
      maxBurnt: 6,
    },
    pazarlik: {
      /** Akçe the day's sales must reach. */
      goal: 118,
      /** Patience lost per offer, and extra per akçe asked above the buyer's limit (relative to the narh). */
      patienceBase: 0.12,
      patienceOver: 0.9,
      /** Asking more than this × narh is called robbery. */
      greedy: 1.6,
      /** A taste (ikram) raises the buyer's limit by this share of the narh. */
      tasteBonus: 0.15,
    },
    // ---- Bursa: siege fort chapter
    kapi: {
      /** Correct decisions needed out of the carts that come to the gate. */
      needed: 6,
      cartSpeed: 4.2,
    },
    cevirme: {
      /** Doneness per second on the side facing the embers, per unit of heat. */
      cookRate: 0.2,
      /** Share of that reaching the two neighbouring sides. */
      sideShare: 0.15,
      heatDecay: 0.035,
      woodHeat: 0.22,
      /** Good doneness band for every side, and where a side burns. */
      done: [0.85, 1.25] as const,
      burn: 1.4,
      /** Above this heat the fat flares and cooking runs hot. */
      flare: 0.95,
    },
    iskender: {
      layers: 8,
      slices: 8,
      /** Browning per second of the face turned to the knife. */
      brownRate: 0.42,
      good: [0.75, 1.15] as const,
    },
    ordu: {
      /** Garrison morale at the start, and where the Tekfur makes his last sortie. */
      morale: 100,
      bossAt: 40,
      /** Morale lost per second for each blockaded gate. */
      blockadeDrain: 0.36,
      blockadeTime: 4,
      convoyEvery: 11,
      convoyIn: 8,
      convoyCut: 6,
      sortieEvery: 17,
      bossHp: 460,
    },
    stir: {
      /** Ideal stirring speed band in revolutions per second. */
      minRps: 0.35,
      maxRps: 1.15,
      progressPerSecond: 2.5,
      burnPerSecond: 7,
      burnPenalty: 10,
      splashLossPerSecond: 1.5,
    },
  },
} as const;

export type QualityLevel = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";
export const QUALITY_LEVELS: readonly QualityLevel[] = ["LOW", "MEDIUM", "HIGH", "ULTRA"];
