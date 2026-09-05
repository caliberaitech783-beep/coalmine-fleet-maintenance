import { build } from "vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedVersionModule = path.join("src", "app-version.js");
const versionedSourcePaths = ["build-site.mjs", "index.html", "package.json", "package-lock.json", "public", "src"];

function normalizedBuildIdentity(value) {
  const identity = String(value || "").trim();
  if (!identity) return "";
  if (/^[0-9a-f]{7,64}$/i.test(identity)) return identity.toLowerCase();
  return createHash("sha256").update(identity).digest("hex");
}

async function sourceTreeVersion(cwd) {
  const hash = createHash("sha256");
  const appendPath = async (relativePath) => {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    if (normalizedPath === "src/app-version.js") return;
    const absolutePath = path.join(cwd, relativePath);
    const details = await stat(absolutePath).catch(() => null);
    if (!details) return;
    if (details.isDirectory()) {
      const entries = await readdir(absolutePath);
      for (const entry of entries.sort()) await appendPath(path.join(relativePath, entry));
      return;
    }
    hash.update(normalizedPath);
    hash.update("\0");
    hash.update(await readFile(absolutePath));
    hash.update("\0");
  };
  for (const sourcePath of versionedSourcePaths) await appendPath(sourcePath);
  return hash.digest("hex");
}

export async function resolveAppVersion({ env = process.env, cwd = process.cwd(), gitHead } = {}) {
  // PREVIOUS_SHA is set while the fast workflow builds its rollback package,
  // whereas GITHUB_SHA identifies the current package in every normal build.
  const configuredIdentity = env.APP_VERSION_SOURCE || env.PREVIOUS_SHA || env.GITHUB_SHA || env.DEPLOYMENT_SHA;
  if (configuredIdentity) return normalizedBuildIdentity(configuredIdentity);
  let repositoryHead = gitHead;
  if (repositoryHead === undefined) {
    try {
      repositoryHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      repositoryHead = "";
    }
  }
  return normalizedBuildIdentity(repositoryHead) || sourceTreeVersion(cwd);
}

export async function buildSite({ cwd = process.cwd(), env = process.env, buildClient = build } = {}) {
  const appVersion = await resolveAppVersion({ env, cwd });
  const versionModulePath = path.join(cwd, generatedVersionModule);
  const originalVersionModule = await readFile(versionModulePath).catch(() => null);
  await writeFile(versionModulePath, `export const APP_VERSION = ${JSON.stringify(appVersion)};\n`);
  try {
    await buildClient({ root: cwd });
  } finally {
    if (originalVersionModule === null) await rm(versionModulePath, { force: true });
    else await writeFile(versionModulePath, originalVersionModule);
  }
  await mkdir(path.join(cwd, "dist", "server"), { recursive: true });
  await mkdir(path.join(cwd, "dist", ".openai"), { recursive: true });
  await writeFile(path.join(cwd, "dist", "app-version.txt"), appVersion);
  await writeFile(path.join(cwd, "dist", "server", "index.js"), `export default { async fetch(request, env) { if (env.ASSETS) return env.ASSETS.fetch(request); return new Response("Nerve Center"); } };\n`);
  await writeFile(path.join(cwd, "dist", ".openai", "hosting.json"), JSON.stringify({ project_id: "appgprj_6a75aeab589c8191ad09746148ea8ead", d1: null, r2: null }));
  return appVersion;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await buildSite();
