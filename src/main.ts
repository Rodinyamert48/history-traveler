import { GameManager } from "./core/GameManager";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
const uiRoot = document.getElementById("ui-root");

if (!canvas || !uiRoot) {
  throw new Error("Missing #game-canvas or #ui-root");
}

const game = new GameManager(canvas, uiRoot);
game.start().catch((err) => {
  console.error("[main] fatal start error", err);
  uiRoot.innerHTML = `<div class="loading-screen"><div class="loading-title">BİR HATA OLUŞTU</div>
    <div class="loading-status">Tarayıcınız WebGL/WebGPU desteklemiyor olabilir. (${String(err?.message ?? err)})</div></div>`;
});

// Exposed for automated smoke tests / debugging in the console.
(window as unknown as { __game: GameManager }).__game = game;
