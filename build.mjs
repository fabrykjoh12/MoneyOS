import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });

const indexPath = 'dist/index.html';
let html = await readFile(indexPath, 'utf8');
html = html.replace('</head>', '  <link rel="stylesheet" href="/purchase-check.css" />\n  <link rel="stylesheet" href="/monthly-margin.css" />\n  <link rel="stylesheet" href="/smart-insights.css" />\n  <link rel="stylesheet" href="/subscriptions.css" />\n  <link rel="stylesheet" href="/money-search.css" />\n</head>');
html = html.replace('</body>', '  <script type="module" src="/purchase-check.js"></script>\n  <script type="module" src="/monthly-margin.js"></script>\n  <script type="module" src="/smart-insights.js"></script>\n  <script type="module" src="/subscriptions.js"></script>\n  <script type="module" src="/money-search.js"></script>\n</body>');
await writeFile(indexPath, html);

console.log('MoneyOS assets copied and decision tools injected');
