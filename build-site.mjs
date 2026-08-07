import { build } from "vite";
import { mkdir, writeFile } from "node:fs/promises";

await build();
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/index.js", `export default { async fetch(request, env) { if (env.ASSETS) return env.ASSETS.fetch(request); return new Response("CoalMine Fleet"); } };\n`);
await writeFile("dist/.openai/hosting.json", JSON.stringify({ project_id: "appgprj_6a75aeab589c8191ad09746148ea8ead", d1: null, r2: null }));
