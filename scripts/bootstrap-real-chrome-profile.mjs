import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function getRealChromeArgs({
  cdpPort,
  extensionPath,
  extensionUrl,
  userDataDir,
}) {
  return [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    extensionUrl,
  ];
}

function getExtensionId(publicKey) {
  const digest = crypto
    .createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode("a".charCodeAt(0) + Number.parseInt(digit, 16)),
    );
}

export function main() {
  const projectRoot = process.cwd();
  const extensionPath = path.resolve(projectRoot, "dist");
  const manifestPath = path.join(extensionPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Extension build not found at ${extensionPath}. Run "npm run build" first.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (typeof manifest.key !== "string") {
    console.error(`Extension manifest at ${manifestPath} has no public key.`);
    process.exit(1);
  }

  const userDataDir = path.resolve(
    projectRoot,
    process.env.REAL_CHROME_PROFILE_DIR ?? ".pw-profiles/calendar",
  );
  const cdpPort = process.env.REAL_CHROME_CDP_PORT ?? "9225";
  const chromeBinary =
    process.env.REAL_CHROME_BINARY ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(chromeBinary)) {
    console.error(`Google Chrome binary not found at ${chromeBinary}.`);
    process.exit(1);
  }

  fs.mkdirSync(userDataDir, { recursive: true });
  const extensionUrl = `chrome-extension://${getExtensionId(manifest.key)}/index.html`;
  const child = spawn(
    chromeBinary,
    getRealChromeArgs({ cdpPort, extensionPath, extensionUrl, userDataDir }),
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });

  console.log(`Opened Google Chrome with profile ${userDataDir}.`);
  console.log(`CDP endpoint: http://127.0.0.1:${cdpPort}`);
  console.log("Connect Calendar in that Chrome window, then leave it open while real tests run.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
