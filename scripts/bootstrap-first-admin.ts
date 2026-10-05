import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  FIRST_ACCESS_DEFAULT_EMAIL,
  FIRST_ACCESS_PENDING_KEY
} from "../lib/auth/first-access";
import { initializeBrandingDefaults } from "../lib/services/branding";

async function bootstrapFirstAdmin() {
  const placeholderPasswordHash = await hash(randomBytes(48).toString("base64url"), 10);

  await prisma.$transaction(
    async (transaction) => {
      const [adminCount, placeholderUser] = await Promise.all([
        transaction.user.count({ where: { role: UserRole.ADMIN } }),
        transaction.user.findUnique({
          where: { email: FIRST_ACCESS_DEFAULT_EMAIL },
          select: { id: true }
        })
      ]);

      if (adminCount > 0) {
        throw new Error("Bootstrap recusado: já existe um usuário ADMIN.");
      }

      if (placeholderUser) {
        throw new Error("Bootstrap recusado: o usuário inicial já existe.");
      }

      await transaction.user.create({
        data: {
          name: "Administrador",
          email: FIRST_ACCESS_DEFAULT_EMAIL,
          passwordHash: placeholderPasswordHash,
          role: UserRole.ADMIN
        }
      });

      await transaction.configuracao.upsert({
        where: { chave: FIRST_ACCESS_PENDING_KEY },
        update: {
          valor: "true",
          descricao: "Indica se o cadastro seguro do administrador inicial esta pendente"
        },
        create: {
          chave: FIRST_ACCESS_PENDING_KEY,
          valor: "true",
          descricao: "Indica se o cadastro seguro do administrador inicial esta pendente"
        }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  await initializeBrandingDefaults();

  console.log("Bootstrap concluído. Complete o primeiro acesso pela tela de login.");
}

bootstrapFirstAdmin()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Falha desconhecida no bootstrap";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
