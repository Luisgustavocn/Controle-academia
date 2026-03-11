import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = {
    alunos: await prisma.aluno.count(),
    mensalidades: await prisma.mensalidade.count(),
    modalidades: await prisma.modalidade.count()
  };

  const deletedMensalidades = await prisma.mensalidade.deleteMany();
  const deletedAlunos = await prisma.aluno.deleteMany();
  const deletedModalidades = await prisma.modalidade.deleteMany();

  const after = {
    alunos: await prisma.aluno.count(),
    mensalidades: await prisma.mensalidade.count(),
    modalidades: await prisma.modalidade.count()
  };

  console.log(
    JSON.stringify(
      {
        before,
        deleted: {
          mensalidades: deletedMensalidades.count,
          alunos: deletedAlunos.count,
          modalidades: deletedModalidades.count
        },
        after
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
