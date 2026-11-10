// Usage: node render.mjs [voice.mp3]
import puppeteer from 'puppeteer';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const audio = process.argv[2];
const FPS = 30, W = 540, H = 960, SCALE = 2;          // output 1080x1920
const maxT = process.env.MAXT ? +process.env.MAXT : Infinity; // test: MAXT=2
const silent = audio ? 'reel-silent.mp4' : 'reel.mp4';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: SCALE },
});
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('reel-render.html')).href);
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 1500));
const total = Math.min(await page.evaluate(() => window.__total), maxT);
const n = Math.round(total * FPS);

const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent],
  { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < n; i++) {
  await page.evaluate(t => window.__seek(t), Math.min(i / FPS, total - 0.001));
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 60 === 0) console.log(`frame ${i}/${n}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();

if (audio) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', 'reel.mp4']);
  console.log('Done: reel.mp4 (with voice)');
} else console.log('Done: reel.mp4 (no audio)');
