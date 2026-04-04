#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo
echo "Atualizando e iniciando Controle Academia..."
echo

npm run update:start:local

status=$?
if [ $status -ne 0 ]; then
  echo
  echo "O sistema nao conseguiu atualizar ou iniciar corretamente."
  read -r -p "Pressione Enter para fechar..."
  exit $status
fi

echo
echo "Servidor encerrado."
read -r -p "Pressione Enter para fechar..."
