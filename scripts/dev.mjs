import { spawn, spawnSync } from 'node:child_process';

const viteBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const buildResult = spawnSync(viteBin, ['vite', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const serverProc = spawn(
  process.execPath,
  ['--experimental-strip-types', 'server/index.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: process.env.PORT || '3000',
      HOST: process.env.HOST || '0.0.0.0',
    },
  },
);

function stopServer() {
  try {
    serverProc.kill();
  } catch {}
}

process.on('SIGINT', stopServer);
process.on('SIGTERM', stopServer);
serverProc.on('exit', (code) => {
  process.exit(code ?? 0);
});
