import { readFileSync } from 'node:fs';
import path from 'node:path';

// Follow local Node module imports, including shared helpers located in src/.
// Browser source location alone does not prove a file is frontend-only.
export function runtimeSourceFiles(cwd) {
  const root = path.resolve(cwd);
  const files = new Set();
  const visit = file => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Runtime import escapes the repository.');
    if (files.has(relative)) return;
    files.add(relative);
    if (!/\.[cm]?js$/.test(file)) return;
    const source = readFileSync(file, 'utf8');
    const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(imports)) visit(path.resolve(path.dirname(file), match[1]));
  };
  visit(path.join(root, 'server.mjs'));
  return files;
}
