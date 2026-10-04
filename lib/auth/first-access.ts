import { prisma } from "@/lib/prisma";

export const FIRST_ACCESS_DEFAULT_EMAIL = "admin@academia.local";
export const FIRST_ACCESS_PENDING_KEY = "auth.firstAccessPending";

export async function getFirstAccessUser() {
  return prisma.user.findUnique({
    where: { email: FIRST_ACCESS_DEFAULT_EMAIL }
  });
}

export async function isFirstAccessPending() {
  const [user, pendingConfig] = await Promise.all([
    getFirstAccessUser(),
    prisma.configuracao.findUnique({ where: { chave: FIRST_ACCESS_PENDING_KEY } })
  ]);

  if (!user?.active) {
    return false;
  }

  return pendingConfig?.valor === "true";
}

export async function markFirstAccessComplete() {
  await prisma.configuracao.upsert({
    where: { chave: FIRST_ACCESS_PENDING_KEY },
    update: { valor: "false" },
    create: {
      chave: FIRST_ACCESS_PENDING_KEY,
      valor: "false",
      descricao: "Indica se o cadastro seguro do administrador inicial esta pendente"
    }
  });
}
