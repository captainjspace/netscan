import { spawn } from 'node:child_process';
import { openSync, createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TASKS = [
  { name: 'mdns',  sec: 500, args: ['-n', 'host', '224.0.0.251', 'and', 'port', '5353'] },
  { name: 'wl',    sec: 30,  args: ['-i', 'en0', '-w', 'capture.pcap'] },
  { name: 'local', sec: 20,  args: ['-i', 'en15', 'ip', 'and', 'net', 'localnet'] },
];

async function run() {
  // 1. Prime sudo (Wait for password)
  console.log("🔐 Password required for tcpdump...");
  const auth = spawn('sudo', ['-v'], { stdio: 'inherit' });
  await new Promise(r => auth.on('close', r));

  // 2. Map tasks to Promises
  const jobs = TASKS.map(async (task) => {
    const tmp = join(tmpdir(), `${task.name}.tmp`);
    const out = openSync(tmp, 'a');

    // detached: true is key for the negative PID kill later
    const child = spawn('sudo', ['tcpdump', ...task.args], {
      detached: true, 
      stdio: ['ignore', out, out]
    });

    console.log(`🚀 [${task.name}] Started (PID ${child.pid})`);

    // Kill after timeout
    const timer = setTimeout(() => {
      try {
        // Negative PID kills the process group (sudo + tcpdump)
        process.kill(-child.pid, 'SIGTERM');
      } catch (e) {}
    }, task.sec * 1000);

    // Wait for the exit
    return new Promise((resolve) => {
      child.on('exit', async () => {
        clearTimeout(timer);
        const gzPath = `./${task.name}.gz`;
        await pipeline(createReadStream(tmp), createGzip(), createWriteStream(gzPath));
        unlinkSync(tmp);
        console.log(`✅ [${task.name}] Finished -> ${gzPath}`);
        resolve(gzPath);
      });
    });
  });

  // 3. THIS IS THE "WAIT" - Script stays alive until all tasks finish
  const results = await Promise.all(jobs);
  console.log('\nAll captures complete:', results);
}

run().catch(console.error);

