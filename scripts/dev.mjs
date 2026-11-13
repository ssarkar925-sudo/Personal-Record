import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4173' },
  }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

function stopAll() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
for (const p of procs) {
  p.on('exit', (code) => {
    if (code && code !== 0) stopAll();
  });
}
