-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'FINANCEIRO', 'RECEPCAO', 'PERSONAL');

-- CreateEnum
CREATE TYPE "AlunoStatus" AS ENUM ('ATIVO', 'INATIVO', 'CANCELADO', 'TRANCADO');

-- CreateEnum
CREATE TYPE "MensalidadeStatus" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'ISENTO', 'PARCIAL');

-- CreateEnum
CREATE TYPE "PagamentoStatus" AS ENUM ('CONFIRMADO', 'ESTORNADO', 'PENDENTE');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "DespesaStatus" AS ENUM ('PENDENTE', 'PAGO', 'PARCIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modalidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorPadrao" DECIMAL(10,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Modalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "vencimentoDia" INTEGER NOT NULL,
    "status" "AlunoStatus" NOT NULL DEFAULT 'ATIVO',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataSaidaCancelamento" TIMESTAMP(3),
    "observacoes" TEXT,
    "modalidadeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPlano" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "modalidadeAnterior" TEXT,
    "modalidadeNova" TEXT NOT NULL,
    "valorAnterior" DECIMAL(10,2),
    "valorNovo" DECIMAL(10,2),
    "dataMudanca" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "HistoricoPlano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensalidade" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "status" "MensalidadeStatus" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mensalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "mensalidadeId" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "status" "PagamentoStatus" NOT NULL DEFAULT 'CONFIRMADO',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoMovimentacao",
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoCaixa" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "categoriaId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "origemDestino" TEXT,
    "alunoId" TEXT,
    "formaPagamento" TEXT,
    "competencia" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimentacaoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespesaAcademia" (
    "id" TEXT NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "competencia" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT,
    "valorPrevisto" DECIMAL(10,2) NOT NULL,
    "valorPago" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "DespesaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataPagamento" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DespesaAcademia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespesaFamilia" (
    "id" TEXT NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "competencia" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT,
    "valorPrevisto" DECIMAL(10,2) NOT NULL,
    "valorPago" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "DespesaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataPagamento" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DespesaFamilia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presenca" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horario" TEXT,
    "tipoAula" TEXT NOT NULL,
    "presente" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Presenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControleMensalAlunos" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "inicioMes" INTEGER NOT NULL,
    "entrou" INTEGER NOT NULL,
    "saiu" INTEGER NOT NULL,
    "totalFinal" INTEGER NOT NULL,
    "ajusteManual" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControleMensalAlunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaPersonal" (
    "id" TEXT NOT NULL,
    "professor" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horario" TEXT NOT NULL,
    "alunoId" TEXT,
    "alunoNome" TEXT,
    "tipoAula" TEXT NOT NULL,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "semanaRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaPersonal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tamanho" TEXT,
    "cor" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "estoque" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoProduto" (
    "id" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "alunoId" TEXT,
    "modelo" TEXT,
    "cor" TEXT,
    "tamanho" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "pago" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dataPedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoItem" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricaoManual" TEXT,
    "modelo" TEXT,
    "cor" TEXT,
    "tamanho" TEXT,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descricao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "modulo" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Modalidade_nome_key" ON "Modalidade"("nome");

-- CreateIndex
CREATE INDEX "Aluno_nomeCompleto_idx" ON "Aluno"("nomeCompleto");

-- CreateIndex
CREATE INDEX "Aluno_telefone_idx" ON "Aluno"("telefone");

-- CreateIndex
CREATE INDEX "Aluno_status_idx" ON "Aluno"("status");

-- CreateIndex
CREATE INDEX "HistoricoPlano_alunoId_dataMudanca_idx" ON "HistoricoPlano"("alunoId", "dataMudanca");

-- CreateIndex
CREATE INDEX "Mensalidade_competencia_status_idx" ON "Mensalidade"("competencia", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Mensalidade_alunoId_competencia_key" ON "Mensalidade"("alunoId", "competencia");

-- CreateIndex
CREATE INDEX "Pagamento_dataPagamento_idx" ON "Pagamento"("dataPagamento");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_nome_key" ON "CategoriaFinanceira"("nome");

-- CreateIndex
CREATE INDEX "MovimentacaoCaixa_competencia_tipo_idx" ON "MovimentacaoCaixa"("competencia", "tipo");

-- CreateIndex
CREATE INDEX "DespesaAcademia_competencia_status_idx" ON "DespesaAcademia"("competencia", "status");

-- CreateIndex
CREATE INDEX "DespesaFamilia_competencia_status_idx" ON "DespesaFamilia"("competencia", "status");

-- CreateIndex
CREATE INDEX "Presenca_data_idx" ON "Presenca"("data");

-- CreateIndex
CREATE UNIQUE INDEX "Presenca_alunoId_data_horario_key" ON "Presenca"("alunoId", "data", "horario");

-- CreateIndex
CREATE UNIQUE INDEX "ControleMensalAlunos_competencia_key" ON "ControleMensalAlunos"("competencia");

-- CreateIndex
CREATE INDEX "AgendaPersonal_professor_semanaRef_diaSemana_idx" ON "AgendaPersonal"("professor", "semanaRef", "diaSemana");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE INDEX "PedidoProduto_dataPedido_idx" ON "PedidoProduto"("dataPedido");

-- CreateIndex
CREATE UNIQUE INDEX "Configuracao_chave_key" ON "Configuracao"("chave");

-- CreateIndex
CREATE INDEX "LogAuditoria_modulo_createdAt_idx" ON "LogAuditoria"("modulo", "createdAt");

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_modalidadeId_fkey" FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPlano" ADD CONSTRAINT "HistoricoPlano_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_mensalidadeId_fkey" FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCaixa" ADD CONSTRAINT "MovimentacaoCaixa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCaixa" ADD CONSTRAINT "MovimentacaoCaixa_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespesaAcademia" ADD CONSTRAINT "DespesaAcademia_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespesaFamilia" ADD CONSTRAINT "DespesaFamilia_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presenca" ADD CONSTRAINT "Presenca_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaPersonal" ADD CONSTRAINT "AgendaPersonal_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoProduto" ADD CONSTRAINT "PedidoProduto_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

