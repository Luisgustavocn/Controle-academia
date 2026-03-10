import { hash } from "bcryptjs";
import { AlunoStatus, MensalidadeStatus, TipoMovimentacao, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const passwordHash = await hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@academia.local" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@academia.local",
      passwordHash,
      role: UserRole.ADMIN
    }
  });

  const modalidades = [
    ["todos os dias", 180],
    ["3xmusc", 150],
    ["2xpersonal", 300],
    ["3xpersonal", 420],
    ["2xpersonal+1sozinho", 340],
    ["3xpersonal2xsozinha", 490],
    ["1xfuncional", 120],
    ["funcional kids", 130]
  ] as const;

  for (const [nome, valorPadrao] of modalidades) {
    await prisma.modalidade.upsert({
      where: { nome },
      update: { valorPadrao },
      create: { nome, valorPadrao }
    });
  }

  const modalidadesDb = await prisma.modalidade.findMany();
  const todosDias = modalidadesDb.find((m) => m.nome === "todos os dias");
  const funcional = modalidadesDb.find((m) => m.nome === "1xfuncional");

  const alunoA = await prisma.aluno.upsert({
    where: { id: "cl_seed_aluno_ana" },
    update: {},
    create: {
      id: "cl_seed_aluno_ana",
      nomeCompleto: "Ana Martins",
      telefone: "11999990001",
      modalidadeId: todosDias?.id,
      vencimentoDia: 10,
      status: AlunoStatus.ATIVO,
      dataInicio: new Date("2025-11-05")
    }
  });

  const alunoB = await prisma.aluno.upsert({
    where: { id: "cl_seed_aluno_bruno" },
    update: {},
    create: {
      id: "cl_seed_aluno_bruno",
      nomeCompleto: "Bruno Alves",
      telefone: "11999990002",
      modalidadeId: funcional?.id,
      vencimentoDia: 15,
      status: AlunoStatus.ATIVO,
      dataInicio: new Date("2026-01-03")
    }
  });

  await prisma.mensalidade.upsert({
    where: {
      alunoId_competencia: {
        alunoId: alunoA.id,
        competencia: "2026-03"
      }
    },
    update: {},
    create: {
      alunoId: alunoA.id,
      competencia: "2026-03",
      valor: 180,
      vencimento: new Date("2026-03-10"),
      dataPagamento: new Date("2026-03-08"),
      formaPagamento: "pix",
      status: MensalidadeStatus.PAGO
    }
  });

  await prisma.mensalidade.upsert({
    where: {
      alunoId_competencia: {
        alunoId: alunoB.id,
        competencia: "2026-03"
      }
    },
    update: {},
    create: {
      alunoId: alunoB.id,
      competencia: "2026-03",
      valor: 120,
      vencimento: new Date("2026-03-15"),
      status: MensalidadeStatus.PENDENTE
    }
  });

  await prisma.movimentacaoCaixa.createMany({
    data: [
      {
        data: new Date("2026-03-08"),
        tipo: TipoMovimentacao.ENTRADA,
        descricao: "Mensalidade Ana",
        valor: 180,
        competencia: "2026-03",
        formaPagamento: "pix"
      },
      {
        data: new Date("2026-03-09"),
        tipo: TipoMovimentacao.SAIDA,
        descricao: "Conta de luz",
        valor: 320,
        competencia: "2026-03",
        formaPagamento: "boleto"
      }
    ],
    skipDuplicates: true
  });

  await prisma.despesaAcademia.createMany({
    data: [
      {
        dataVencimento: new Date("2026-03-10"),
        competencia: "2026-03",
        descricao: "luz/água academia",
        valorPrevisto: 320,
        valorPago: 320,
        status: "PAGO",
        dataPagamento: new Date("2026-03-09")
      },
      {
        dataVencimento: new Date("2026-03-12"),
        competencia: "2026-03",
        descricao: "aluguel",
        valorPrevisto: 2500,
        valorPago: 0,
        status: "PENDENTE"
      }
    ],
    skipDuplicates: true
  });

  await prisma.despesaFamilia.createMany({
    data: [
      {
        dataVencimento: new Date("2026-03-10"),
        competencia: "2026-03",
        descricao: "net+cel",
        valorPrevisto: 260,
        valorPago: 260,
        status: "PAGO"
      }
    ],
    skipDuplicates: true
  });

  await prisma.presenca.createMany({
    data: [
      {
        alunoId: alunoA.id,
        data: new Date("2026-03-03"),
        horario: "07:00",
        tipoAula: "musculação",
        presente: true
      },
      {
        alunoId: alunoA.id,
        data: new Date("2026-03-05"),
        horario: "07:00",
        tipoAula: "musculação",
        presente: true
      },
      {
        alunoId: alunoB.id,
        data: new Date("2026-03-06"),
        horario: "18:00",
        tipoAula: "funcional",
        presente: true
      }
    ],
    skipDuplicates: true
  });

  await prisma.agendaPersonal.createMany({
    data: [
      {
        professor: "Carlos",
        diaSemana: 1,
        horario: "07:00",
        alunoId: alunoA.id,
        tipoAula: "personal",
        semanaRef: "2026-W11"
      },
      {
        professor: "Carlos",
        diaSemana: 3,
        horario: "18:00",
        alunoId: alunoB.id,
        tipoAula: "funcional",
        semanaRef: "2026-W11"
      }
    ],
    skipDuplicates: true
  });

  const produto = await prisma.produto.upsert({
    where: { id: "cl_seed_produto_camisa" },
    update: {},
    create: {
      id: "cl_seed_produto_camisa",
      nome: "Camiseta Dry Fit",
      categoria: "roupas",
      tamanho: "M",
      cor: "preta",
      preco: 65,
      estoque: 20
    }
  });

  await prisma.pedidoProduto.create({
    data: {
      clienteNome: "Ana Martins",
      alunoId: alunoA.id,
      modelo: "Camiseta Dry Fit",
      cor: "preta",
      tamanho: "M",
      quantidade: 2,
      valorUnitario: 65,
      valorTotal: 130,
      pago: 130,
      itens: {
        create: [
          {
            produtoId: produto.id,
            quantidade: 2,
            valorUnitario: 65,
            valorTotal: 130
          }
        ]
      }
    }
  });

  await prisma.configuracao.upsert({
    where: { chave: "empresa.nome" },
    update: { valor: "Academia Exemplo" },
    create: {
      chave: "empresa.nome",
      valor: "Academia Exemplo",
      descricao: "Nome exibido no cabeçalho"
    }
  });

  console.log("Seed concluída com sucesso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
