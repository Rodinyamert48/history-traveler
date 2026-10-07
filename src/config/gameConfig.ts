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
