import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const gitCommand = "git";
const appUrl = "http://localhost:3000/login";

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n${label}...`);

    const child = spawn(command, args, {
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

      reject(new Error(`Command failed: ${command} ${args.join(" ")}`));
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

async function pullLatestChanges() {
  if (!existsSync(".git")) {
    console.log("\nRepositorio Git nao encontrado. Pulando atualizacao do GitHub.");
    return;
  }

  await runCommand(gitCommand, ["pull", "--ff-only"], "Baixando atualizacoes do GitHub");
}

async function main() {
  await pullLatestChanges();
  await runCommand(npmCommand, ["install"], "Atualizando dependencias");
  await runCommand(npxCommand, ["prisma", "migrate", "deploy"], "Aplicando migracoes do banco");
  await runCommand(npmCommand, ["run", "build"], "Gerando build de producao");
  setTimeout(() => openBrowser(appUrl), 4000);
  await runCommand(npmCommand, ["start"], "Iniciando servidor local");
}

main().catch((error) => {
  console.error("\nFalha ao atualizar e iniciar o sistema.");
  console.error(error instanceof Error ? error.message : error);
  console.error("Se houver alteracoes locais no projeto, revise antes de tentar novamente.");
  process.exit(1);
});
