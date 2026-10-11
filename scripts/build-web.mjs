// Copies the game into www/, the folder Capacitor packages into the Android app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT = 'www';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) {
  cpSync(f, `${OUT}/${f}`, { recursive: true });
}
console.log('web files copied to www/');
