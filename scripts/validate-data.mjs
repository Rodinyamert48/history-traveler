// Validates the data files in public/data so broken mission chains or typos are caught
// before deploy (run by `npm run validate` and in the GitHub Pages workflow).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const errors = [];
const fail = (msg) => errors.push(msg);

const geo = JSON.parse(readFileSync(join(root, "turkey-geo.json"), "utf8"));
const provinceIds = new Set(geo.provinces.map((p) => p.id));
if (geo.provinces.length !== 81) fail(`turkey-geo.json: expected 81 provinces, found ${geo.provinces.length}`);

const { cities } = JSON.parse(readFileSync(join(root, "cities.json"), "utf8"));
const scenarioFiles = new Set(readdirSync(join(root, "scenarios")).map((f) => f.replace(/\.json$/, "")));
for (const c of cities) {
  if (!provinceIds.has(c.id)) fail(`cities.json: "${c.id}" is not a province id in turkey-geo.json`);
  if (c.active && !c.scenario) fail(`cities.json: active city "${c.id}" has no scenario`);
  if (c.active && !scenarioFiles.has(c.scenario)) fail(`cities.json: scenario file for "${c.scenario}" is missing`);
}

const OBJECTIVES = new Set(["talk", "reach", "interact", "deliver", "minigame", "hold"]);
// Minigame ids each scenario implements (see the scenario's createMinigame()).
const MINIGAMES = {
  istanbul_1453: new Set(["ship", "cannon", "siege"]),
  mugla_keskek: new Set(["dibek", "forest", "fire", "stir"]),
  ankara_1920: new Set(["lamps", "telegraph", "minutes"]),
  kayseri_pazar: new Set(["manti", "sac", "pazarlik"]),
};
// Completed missions are saved in one flat list, so ids must be unique across scenarios.
const allMissionIds = new Map();
for (const name of scenarioFiles) {
  const data = JSON.parse(readFileSync(join(root, "scenarios", `${name}.json`), "utf8"));
  if (data.scenario !== name) fail(`${name}: "scenario" field is "${data.scenario}", expected "${name}"`);
  if (!MINIGAMES[name]) fail(`${name}: no minigame list registered in validate-data.mjs`);
  const ids = new Set();
  for (const m of data.missions) {
    if (ids.has(m.id)) fail(`${name}: duplicate mission id ${m.id}`);
    if (allMissionIds.has(m.id)) fail(`${name}: mission id ${m.id} is also used by ${allMissionIds.get(m.id)}`);
    ids.add(m.id);
    allMissionIds.set(m.id, name);
  }
  if (!ids.has(data.firstMission)) fail(`${name}: firstMission ${data.firstMission} does not exist`);
  const seen = new Set();
  let cur = data.firstMission;
  while (cur) {
    if (seen.has(cur)) {
      fail(`${name}: mission chain loops at ${cur}`);
      break;
    }
    seen.add(cur);
    const m = data.missions.find((x) => x.id === cur);
    if (!m) {
      fail(`${name}: nextMission ${cur} does not exist`);
      break;
    }
    cur = m.nextMission;
  }
  for (const m of data.missions) {
    if (!seen.has(m.id)) fail(`${name}: mission ${m.id} is unreachable from firstMission`);
    for (const k of ["title", "description", "type"]) if (!m[k]) fail(`${name}/${m.id}: missing ${k}`);
    if (!m.reward?.text) fail(`${name}/${m.id}: missing reward.text`);
    if (!m.objectives?.length) fail(`${name}/${m.id}: no objectives`);
    for (const d of [m.intro, m.outro]) if (d && !data.dialogues[d]) fail(`${name}/${m.id}: dialogue ${d} not defined`);
    for (const o of m.objectives ?? []) {
      if (!OBJECTIVES.has(o.type)) fail(`${name}/${m.id}: unknown objective type ${o.type}`);
      if (!o.text) fail(`${name}/${m.id}: objective without text`);
      if (o.type === "talk" && !data.dialogues[o.dialogue]) fail(`${name}/${m.id}: talk dialogue ${o.dialogue} not defined`);
      if (o.type === "minigame" && !MINIGAMES[name]?.has(o.minigame)) fail(`${name}/${m.id}: unknown minigame ${o.minigame}`);
      if (o.type === "deliver" && !(o.count > 0)) fail(`${name}/${m.id}: deliver count must be > 0`);
    }
  }
  for (const [id, lines] of Object.entries(data.dialogues)) {
    if (!Array.isArray(lines) || !lines.length) fail(`${name}: dialogue ${id} is empty`);
    for (const l of lines) if (!l.speaker || !l.text) fail(`${name}: dialogue ${id} has a line without speaker/text`);
  }
  console.log(`✓ ${name}: ${data.missions.length} missions, ${Object.keys(data.dialogues).length} dialogues`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ data valid (${geo.provinces.length} provinces, ${cities.length} cities)`);
