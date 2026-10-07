import type { AudioManager } from "../audio/AudioManager";
import type { InputManager } from "../core/InputManager";
import type { SaveManager } from "../core/SaveManager";
import { CinematicOverlay } from "./CinematicOverlay";
import { DialogueUI } from "./DialogueUI";
import { HUD } from "./HUD";
import { LoadingScreen } from "./LoadingScreen";
import { MainMenu, type MainMenuActions } from "./MainMenu";
import { MapUI } from "./MapUI";
import { MobileControls } from "./MobileControls";
import { Modal } from "./Modals";
import { SettingsMenu } from "./SettingsMenu";
import "./styles.css";

/**
 * Owns every DOM UI layer. Scenes talk to the UI only through this facade.
 */
export class UIManager {
  readonly root: HTMLElement;
  readonly loading: LoadingScreen;
  readonly mainMenu: MainMenu;
  readonly map: MapUI;
  readonly cinematic: CinematicOverlay;
  readonly hud: HUD;
  readonly dialogue: DialogueUI;
  readonly settings: SettingsMenu;
  readonly modal: Modal;
  readonly mobile: MobileControls;

  constructor(
    root: HTMLElement,
    private readonly audio: AudioManager,
    save: SaveManager,
    input: InputManager,
    getApiName: () => string,
    menuActions: MainMenuActions,
    mapActions: { onBack(): void; onSettings(): void },
    onPause: () => void,
  ) {
    this.root = root;
    this.hud = new HUD(root);
    this.mobile = new MobileControls(root, input, onPause);
    this.dialogue = new DialogueUI(root);
    this.map = new MapUI(root, mapActions.onBack, mapActions.onSettings);
    this.cinematic = new CinematicOverlay(root);
    this.mainMenu = new MainMenu(root, menuActions, () => this.sfx("uiHover"));
    this.modal = new Modal(root);
    this.settings = new SettingsMenu(root, save, getApiName, (n) => this.sfx(n));
    this.loading = new LoadingScreen(root);

    // Every button click gets a UI click sound (delegated, one listener).
    root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".btn")) this.audio.play("uiClick");
    });
  }

  sfx(name: "uiClick" | "uiHover" | "uiBack" | "uiConfirm"): void {
    this.audio.play(name, { volume: name === "uiHover" ? 0.6 : 1 });
  }

  /** True while any blocking menu/modal is open (gameplay input must pause). */
  get isMenuOpen(): boolean {
    return this.settings.isOpen || this.modal.isOpen;
  }
}
