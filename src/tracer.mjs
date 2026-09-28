import { spawn } from 'node:child_process';

export function startTcpdump(durationMs = 5000) {
  const child = spawn('sudo', [
    'tcpdump', '-n', 'host', '224.0.0.251', 'and', 'port', '5353'
  ], {
    // 'inherit' allows you to see and type the sudo password prompt
    stdio: 'inherit', 
    detached: true 
  });

  const timer = setTimeout(() => {
    try {
      // Use negative PID to kill the sudo process group
      process.kill(-child.pid, 'SIGTERM');
    } catch (e) {}
  }, durationMs);

  child.unref();
  return child.pid;
}

