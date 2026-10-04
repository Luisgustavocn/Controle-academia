# Dependências vendoradas

## SheetJS Community Edition

- Pacote: `xlsx`
- Versão: `0.20.3`
- Origem oficial: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- Artefato: `vendor/xlsx-0.20.3.tgz`
- SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- Licença declarada no pacote: Apache-2.0
- Incorporado em: 2026-10-04

O tarball é mantido no repositório para que instalações e deploys não dependam do CDN. O próprio artefato preserva os arquivos `LICENSE` e `dist/LICENSE` distribuídos pelo SheetJS.

Para atualizar, obtenha a nova versão exclusivamente da origem oficial, confira `name`, `version`, licença e estrutura do tarball sem executar seus scripts, calcule o SHA-256, substitua o arquivo em `vendor/`, atualize esta documentação e a referência `file:` do `package.json`, e regenere o lockfile.
