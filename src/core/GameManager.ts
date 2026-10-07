import { AudioManager } from "../audio/AudioManager";
import { QUALITY_PRESETS, type QualityPreset } from "../config/qualityPresets";
import type { CitiesFile, CityEntry, TurkeyGeo } from "../data/types";
import { MapScene } from "../map/MapScene";
import { loadScenario } from "../scenarios/registry";
import type { ScenarioInstance } from "../scenarios/types";
import { UIManager } from "../ui/UIManager";
import { fetchJson, nextFrame, wait } from "../utils/async";
import { createEngine, type EngineInfo } from "./EngineFactory";
import { gameEvents } from "./GameEvents";
import type { GameScene, GameServices } from "./GameServices";
import { InputManager } from "./InputManager";
import { SaveManager } from "./SaveManager";

type GameState = "boot" | "loading" | "menu" | "map" | "intro" | "playing" | "paused" | "transition";

/**
 * Top-level state machine:
 * BOOT → Loading → Main Menu → Türkiye Map → City Selected → Intro → FPS scenario → (map)
 */
export class GameManager {
  private state: GameState = "boot";
  private services!: GameServices;
  private engineInfo!: EngineInfo;
  private current: GameScene | null = null;
  private map: MapScene | null = null;
  private scenario: ScenarioInstance | null = null;
  private geo: TurkeyGeo | null = null;
  private cities: CityEntry[] = [];
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsText = "";
  /** Timestamp of the last pause/unpause, to ignore the ESC keydown that also released pointer lock. */
  private lastPauseToggle = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly uiRoot: HTMLElement) {}

  async start(): Promise<void> {
    const save = new SaveManager();
    const input = new InputManager(this.canvas);
    const audio = new AudioManager();
    this.engineInfo = await createEngine(this.canvas, save.settings.renderApi);
    const engine = this.engineInfo.engine;
    console.info(`[Game] Render API: ${this.engineInfo.api}`);

    const ui = new UIManager(
      this.uiRoot,
      audio,
      save,
      input,
      () => this.engineInfo.api,
      {
        onPlay: () => void this.enterMap(),
        onSettings: () => ui.settings.show(),
        onAbout: () => this.showAbout(),
      },
      {
        onBack: () => this.backToMenu(),
        onSettings: () => ui.settings.show(),
      },
      () => this.togglePause(),
    );

    this.services = {
      engine,
      engineInfo: this.engineInfo,
      canvas: this.canvas,
      input,
      save,
      audio,
      ui,
      preset: () => this.effectivePreset(),
    };

    audio.setVolumes(save.settings.masterVolume, save.settings.musicVolume, save.settings.sfxVolume);
    gameEvents.on("settings:changed", ({ settings, changed }) => {
      audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
      this.current?.applySettings(settings, changed);
    });

    // First user gesture unlocks WebAudio (autoplay policy).
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", () => ui.mobile.refresh(), { once: true, passive: true });
    window.addEventListener("resize", () => engine.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.togglePause(true);
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.onEscape();
    });

    engine.runRenderLoop(() => this.frame());

    this.state = "loading";
    ui.loading.show();
    ui.loading.setProgress(0.02, "Veriler yükleniyor");
    try {
      const [geo, cities] = await Promise.all([fetchJson<TurkeyGeo>("data/turkey-geo.json"), fetchJson<CitiesFile>("data/cities.json")]);
      this.geo = geo;
      this.cities = cities.cities;
    } catch (err) {
      console.error(err);
      ui.loading.setProgress(0, "Harita verisi yüklenemedi. Sayfayı yenileyin.");
      return;
    }
    ui.loading.setProgress(0.25, "Harita oluşturuluyor");
    await nextFrame();
    await this.buildMap((f, s) => ui.loading.setProgress(0.25 + f * 0.75, s));
    await wait(250);
    await ui.loading.hide();
    this.state = "menu";
    this.map!.setMode("menu");
    ui.mainMenu.show();
  }

  private effectivePreset(): QualityPreset {
    const s = this.services.save.settings;
    const base = QUALITY_PRESETS[s.quality];
    return {
      ...base,
      particles: s.particles ? base.particles : 0,
    };
  }

  private async buildMap(onProgress: (f: number, s: string) => void): Promise<void> {
    this.map = await MapScene.create(this.services, this.geo!, this.cities, onProgress);
    this.map.onCitySelected = (city) => void this.selectCity(city);
    this.current = this.map;
  }

  private frame(): void {
    const engine = this.services?.engine ?? this.engineInfo?.engine;
    if (!engine) return;
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    const cur = this.current;
    if (cur) {
      try {
        cur.update(dt);
      } catch (err) {
        console.error("[Game] update error", err);
      }
      if (cur.scene.activeCamera) cur.scene.render();
    }
    this.services?.ui.dialogue.update(dt);
    this.services?.input.endFrame();
    this.updateFps(dt);
  }

  private updateFps(dt: number): void {
    if (!this.services) return;
    const show = this.services.save.settings.showFps;
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fpsText = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS · ${this.engineInfo.api} · ${this.services.save.settings.quality}`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    this.services.ui.hud.setFps(show && (this.state === "playing" || this.state === "paused"), this.fpsText);
    if (show && this.state === "map") document.title = `Tarih Yolcusu — ${this.fpsText}`;
  }

  // ----------------------------------------------------------------------- flow
  private async enterMap(): Promise<void> {
    if (this.state !== "menu") return;
    const { audio, ui } = this.services;
    audio.unlock();
    audio.playMusic("map");
    audio.setAmbience({ sea: 0.25, wind: 0.35, camp: 0, battle: 0 });
    this.state = "transition";
    await ui.mainMenu.hide();
    this.map?.setMode("map");
    this.state = "map";
  }

  private backToMenu(): void {
    if (this.state !== "map") return;
    this.state = "menu";
    this.map?.setMode("menu");
    this.services.ui.mainMenu.show();
  }

  private async selectCity(city: CityEntry): Promise<void> {
    if (this.state !== "map" || !city.scenario || !this.map) return;
    this.state = "intro";
    const { ui, audio, save } = this.services;
    await this.map.playSelectSequence(city.id);

    let instance: ScenarioInstance;
    try {
      const module = await loadScenario(city.scenario);
      const completed = save.save.completedScenarios.includes(module.id);
      if (completed) save.resetScenario(module.id, [...module.missionIds]);
      ui.cinematic.setSkipHint(true, "Yükleniyor…");
      instance = await module.create(this.services, {
        onProgress: (f, s) => ui.cinematic.setSkipHint(true, `${s} · ${Math.round(f * 100)}%`),
        // `?mission=mission_005` jumps to a mission (QA / demo convenience).
        resumeMissionId: new URLSearchParams(location.search).get("mission") ?? save.getResumeMission(module.id),
      });
    } catch (err) {
      console.error("[Game] scenario failed to load", err);
      ui.cinematic.setSkipHint(false);
      await ui.cinematic.hideTitle();
      await ui.cinematic.fade(0, 0.6);
      ui.cinematic.setLetterbox(false);
      this.state = "map";
      this.map.setMode("map");
      ui.hud.toast("Senaryo yüklenemedi. Lütfen tekrar deneyin.");
      return;
    }
    ui.cinematic.setSkipHint(false);
    this.map.dispose();
    this.map = null;
    this.scenario = instance;
    this.current = instance;
    instance.onExitToMap = () => void this.returnToMap();
    instance.onRequestPause = () => this.togglePause(true);
    audio.setAmbience({ sea: 0.4, wind: 0.3, camp: 0.5, battle: 0.1 });
    await instance.playIntro();
    this.state = "playing";
  }

  private async returnToMap(): Promise<void> {
    if (!this.scenario) return;
    const { ui, audio, input } = this.services;
    this.state = "transition";
    input.exitPointerLock();
    input.gameplayEnabled = false;
    ui.modal.hide();
    await ui.cinematic.fade(1, 0.7, true);
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.dialogue.close();
    this.scenario.dispose();
    this.scenario = null;
    this.current = null;
    ui.loading.setTitle("TÜRKİYE", "Haritaya dönülüyor");
    ui.loading.show();
    await this.buildMap((f, s) => ui.loading.setProgress(f, s));
    ui.cinematic.setFadeInstant(0);
    ui.cinematic.setLetterbox(false);
    await ui.loading.hide();
    audio.playMusic("map");
    audio.setAmbience({ sea: 0.25, wind: 0.35, camp: 0, battle: 0 });
    this.map!.setMode("map");
    this.state = "map";
  }

  // ---------------------------------------------------------------------- pause
  private onEscape(): void {
    const ui = this.services?.ui;
    if (!ui) return;
    if (ui.settings.isOpen) {
      ui.settings.hide();
      return;
    }
    if (this.state === "playing" || this.state === "paused") {
      if (performance.now() - this.lastPauseToggle < 350) return;
      this.togglePause();
    } else if (this.state === "map") this.backToMenu();
  }

  togglePause(force?: boolean): void {
    if (!this.scenario) return;
    const pause = force ?? this.state === "playing";
    if (pause && this.state === "playing") {
      this.lastPauseToggle = performance.now();
      this.state = "paused";
      this.scenario.setPaused(true);
      this.services.input.exitPointerLock();
      this.showPauseMenu();
    } else if (!pause && this.state === "paused") {
      this.lastPauseToggle = performance.now();
      this.services.ui.modal.hide();
      this.services.ui.settings.hide();
      this.state = "playing";
      this.scenario.setPaused(false);
    }
  }

  private showPauseMenu(): void {
    const { ui } = this.services;
    ui.modal.show(
      "DURAKLATILDI",
      `<p>İstanbul · 1453</p>`,
      [
        { label: "Devam Et", primary: true, onClick: () => this.togglePause(false) },
        { label: "Ayarlar", onClick: () => ui.settings.show() },
        { label: "Haritaya Dön", onClick: () => void this.returnToMap() },
      ],
    );
  }

  private showAbout(): void {
    const { ui } = this.services;
    ui.modal.show(
      "HAKKINDA",
      `<p><b>Tarih Yolcusu</b>, Türkiye haritasından seçtiğin şehrin önemli bir tarihî dönemini birinci şahıs olarak oyunlaştırılmış görevler ve mini oyunlarla yaşatan bir web oyunudur.</p>
       <p>İlk bölüm: <b>İstanbul — 1453</b>. Diğer şehirler yakında.</p>
       <p style="font-size:12px">Render: ${this.engineInfo.api} · Babylon.js<br/>Harita verisi: Natural Earth (kamu malı).<br/>Tüm 3B modeller, dokular, müzik ve sesler kod ile prosedürel üretilmiştir.</p>`,
      [{ label: "Kapat", primary: true, onClick: () => ui.modal.hide() }],
    );
  }
}
