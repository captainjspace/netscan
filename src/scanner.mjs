import { spawn } from "node:child_process";
import { openSync, createReadStream, createWriteStream, unlinkSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
//import { join } from "node:path";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import * as tar from "tar";

const tmpDir=tmpdir();
console.log(tmpDir);
const curDir=dirname(fileURLToPath(import.meta.url));
const logDir=join("..","logs");
const TASKS = [
  { cmd: "nmap", name: "nmap", timeout: 1000, 
    args: ["A", "-Pn", "-oX", "192.168.1.0/24", "--dns-servers", "192.168.1.5"] } ,
  { cmd: "tcpdump", name: "mdns",  timeout: 50, 
    args: ["-n", "host", "224.0.0.251", "and", "port", "5353"] },
  { cmd: "tcpdump", name: "wl",    timeout: 30,  
    args: ["-i", "en0", "-w", "capture.pcap"] },
  { cmd: "tcpdump", name: "local", timeout: 20,  
    args: ["-i", "en15", "ip", "and", "net", "localnet"] },
  { cmd: "tcpdump", name: "flags", timeout: 20,  
    args: ["-i", "en16", "tcp[tcpflags] & (tcp-syn|tcp-fin) != 0"] },
  { cmd: "tcpdump", name: "vlan",  timeout: 10, 
    args: ["-nn", "-e", "vlan", "10"] }
];
console.log(JSON.stringify(TASKS));

/**
 * Primes sudo by asking for a password interactively
 */
async function primeSudo() {
  return new Promise((resolve, reject) => {
    console.log("--- Authorization Required ---");
    console.log("🔐 Password required for tcpdump...");
    const auth = spawn("sudo", ["-v"], { stdio: "inherit" });
    auth.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Sudo failed"))));
  });
}

async function runScanner() {
  try {
    // 1. Wait for user to type password
    await primeSudo();
    const zipFiles=[];
    // 2. Map tasks to background promises
    const activeProcesses = TASKS.map(async (task) => {
      const tempFile = `${tmpDir}/${task.cmd}-${task.name}-${Date.now()}.tmp`;
      const out = openSync(tempFile, "a");

      // Launch tcpdump (it uses the cached sudo credentials)
      const child = spawn("sudo", [task.cmd, ...task.args], {
        detached: true,
        stdio: ["ignore", out, out] 
      });

      console.log(`[🚀STARTED] ${task.name} (PID: ${child.pid})`);

      // Handle the timeout
      const timer = setTimeout(() => {
        try {
          // Kill the process group (negative PID)
          process.kill(-child.pid, "SIGTERM");
        } catch (e) { /* already dead */ }
      }, task.timeout * 1000);

      // Return promise that resolves when process closes
      return new Promise((resolve) => {
        child.on("exit", async () => {
          clearTimeout(timer);
          
          const zipFile = `${logDir}/${task.name}-${Date.now()}.gz`;
          zipFiles.push(zipFile);
          await pipeline(createReadStream(tempFile), createGzip(), createWriteStream(zipFile));
          unlinkSync(tempFile);
          
          console.log(`[✅SAVED] ${zipFile}`);
          resolve(zipFile);
        });
      });
    });

    const results = await Promise.all(activeProcesses);
    console.log("\n--- All scans complete ---");

    const tarFile=`${logDir}/scanner-${Date.now()}.tar`;
    tar.create({ file: `${tarFile}` }, zipFiles, 
      (err)=> {
        if (err){
          console.error("Could not tar the zips", err);
        } else {
          console.log(`--- Consolidated Files Archive ---`);
          console.log(`[✅SAVED] ${tarFile}`);
          zipFiles.forEach((z)=>unlinkSync(z));
        }
      }
    );

    console.table(results);

  } catch (err) {
    console.error("Execution Error:", err.message);
  }
}

runScanner();

