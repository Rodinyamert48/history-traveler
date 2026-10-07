// Copies the production build (dist/) into docs/ so GitHub Pages can serve the game straight
// from the branch ("Deploy from a branch" → / or /docs) without a build step.
import { cpSync, rmSync, writeFileSync } from "node:fs";

rmSync("docs", { recursive: true, force: true });
cpSync("dist", "docs", { recursive: true });
writeFileSync("docs/.nojekyll", "");
console.log("docs/ updated from dist/");
