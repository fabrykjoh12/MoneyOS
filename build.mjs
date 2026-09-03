import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });

const indexPath = 'dist/index.html';
let html = await readFile(indexPath, 'utf8');
html = html.replace('  <script type="module" src="/months.js"></script>\n', '');
html = html.replace('</body>', '  <script src="/authenticated-loader.js"></script>\n</body>');
await writeFile(indexPath, html);

console.log('MoneyOS core copied; feature modules deferred until authentication');
