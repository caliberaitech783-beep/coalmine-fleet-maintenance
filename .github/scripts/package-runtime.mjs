import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimeSourceFiles } from './runtime-source.mjs';

export function includedRuntimePath(file) {
  if (/^(\.git\/|\.github\/|test\/|docs\/|src\/|public\/|dist\/|node_modules\/|\.oracle-wallet\/)/.test(file)) return false;
  if (/(^|\/)\.env(?:\.|$)/.test(file) || /\.md$/i.test(file)) return false;
  return !['build-site.mjs', '.gitignore', 'render.yaml', 'pnpm-lock.yaml'].includes(file);
}

export function prepareRuntimePackage({ cwd, destination, tracked }) {
  if (existsSync(destination)) throw new Error('Package destination must not already exist.');
  for (const required of ['server.mjs', 'package.json', 'package-lock.json', 'DEPLOYMENT_SHA', 'dist/index.html', 'dist/app-version.txt', 'node_modules']) {
    if (!existsSync(path.join(cwd, required))) throw new Error(`Required runtime input missing: ${required}`);
  }
  mkdirSync(destination, { recursive: true });
  const runtimeFiles = runtimeSourceFiles(cwd);
  for (const file of tracked.filter(file => includedRuntimePath(file) || runtimeFiles.has(file))) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error('Invalid package path.');
    const target = path.join(destination, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(cwd, file), target);
  }
  cpSync(path.join(cwd, 'DEPLOYMENT_SHA'), path.join(destination, 'DEPLOYMENT_SHA'));
  cpSync(path.join(cwd, 'dist'), path.join(destination, 'dist'), {
    recursive: true,
    filter: source => !path.relative(path.join(cwd, 'dist'), source).split(path.sep).includes('.openai'),
  });
  // Keep the installed dependency graph unchanged in phase one. Dependency
  // pruning/reclassification is separate from release coordination.
  cpSync(path.join(cwd, 'node_modules'), path.join(destination, 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
    filter: source => !path.relative(path.join(cwd, 'node_modules'), source).split(path.sep).includes('.cache'),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output) || !output.endsWith('.zip') || existsSync(output)) throw new Error('Use a new absolute ZIP output path.');
  const cwd = process.cwd();
  const stage = path.join(mkdtempSync(path.join(tmpdir(), 'bdms-release-')), 'runtime');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  prepareRuntimePackage({ cwd, destination: stage, tracked });
  execFileSync('zip', ['-q', '-r', output, '.'], { cwd: stage, stdio: 'inherit' });
  console.log('Packaged built frontend, runtime and shared Node modules, report assets, and dependencies; excluded browser-only source, tests, docs, workflows and local secrets.');
}
