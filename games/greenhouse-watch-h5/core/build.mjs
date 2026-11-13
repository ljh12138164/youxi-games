import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build-web.sh', import.meta.url));
if (process.platform === 'win32') {
  const linuxPath = execFileSync('wsl.exe', ['--exec', 'wslpath', '-a', script], { encoding: 'utf8' }).trim();
  execFileSync('wsl.exe', ['--exec', 'bash', linuxPath], { stdio: 'inherit' });
} else {
  execFileSync('bash', [script], { stdio: 'inherit' });
}
