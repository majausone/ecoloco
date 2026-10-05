// Junta capturas en una hoja (rejilla) con su nombre: node herramientas/hoja_contacto.mjs salida.png columnas img1 img2 ...
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const fs = await import('node:fs');
const [salida, cols, ...imgs] = process.argv.slice(2);
const W = 1600, c = Number(cols), w = Math.floor(W / c);
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${c},${w}px);font:12px system-ui;color:#eee">${imgs.map((f) => `<div style="position:relative"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:${w}px;display:block"><span style="position:absolute;left:4px;bottom:3px;background:#0008;padding:1px 4px">${f.split(/[\/]/).pop().replace('.png', '')}</span></div>`).join('')}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 400 } });
await p.setContent(html); await p.screenshot({ path: salida, fullPage: true }); await b.close();
