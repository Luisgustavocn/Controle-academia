import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const appUrl = "http://localhost:3000/login";

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: npm ${args.join(" ")}`));
    });
  });
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function main() {
  console.log("Gerando build de producao...");
  await runNpm(["run", "build"]);

  console.log("Iniciando servidor local...");
  setTimeout(() => openBrowser(appUrl), 4000);
  await runNpm(["start"]);
}

main().catch((error) => {
  console.error("\nFalha ao iniciar o sistema.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
