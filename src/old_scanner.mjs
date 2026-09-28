import { spawn } from 'node:child_process';
import { openSync, createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 1. JSON Configuration Loop
const TASKS = [
  { name: 'mdns',  timeout: 500, args: ['-n', 'host', '224.0.0.251', 'and', 'port', '5353'] },
  { name: 'wl',    timeout: 30,  args: ['-i', 'en0', '-w', 'capture.pcap'] },
  { name: 'local', timeout: 20,  args: ['-i', 'en15', 'ip', 'and', 'net', 'localnet'] },
  { name: 'flags', timeout: 20,  args: ['-i', 'en16', 'tcp[tcpflags] & (tcp-syn|tcp-fin) != 0'] },
];

async function runScanner() {
  console.log('--- Post Network Apocalypse Scan ---');
  
  // Trigger sudo password prompt once at the start
  spawn('sudo', ['-v'], { stdio: 'inherit' });

  const activeProcesses = TASKS.map(task => {
    const tempFile = join(tmpdir(), `tcpdump-${task.name}-${Date.now()}`);
    const out = openSync(tempFile, 'a');

    const child = spawn('sudo', ['tcpdump', ...task.args], {
      detached: true,
      stdio: ['ignore', out, out]
    });

    console.log(`[STARTED] ${task.name} (PID: ${child.pid}) -> ${tempFile}`);

    // Kill logic
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (e) {}
    }, task.timeout * 1000);

    // Return a promise that resolves when the process exits
    const completion = new Promise((resolve) => {
      child.on('exit', async () => {
        clearTimeout(timer);
        console.log(`[FINISHED] ${task.name}`);
        
        // Gzip and Cleanup (replaces your loop logic)
        const zipFile = `./${task.name}.gz`;
        await pipeline(
          createReadStream(tempFile),
          createGzip(),
          createWriteStream(zipFile)
        );
        unlinkSync(tempFile);
        resolve(zipFile);
      });
    });

    return completion;
  });

  const results = await Promise.all(activeProcesses);
  console.log('All captures compressed:', results);
}

runScanner().catch(console.error);

