# Huntera Squad

Navegador em grade **2×2** para [huntera.com.br](https://huntera.com.br), com **4 sessões isoladas** (cookies e storage separados por conta).

## Recursos

- Quatro painéis lado a lado (2 em cima, 2 embaixo)
- Cookies isolados por painel (`persist:huntera-account-1` … `4`)
- Zoom − / + por conta (ao lado do reload)
- Clique no nome da janela (ícone ✎) para renomear a conta; o nome fica salvo localmente
- Ping de cada janela até o servidor do jogo (`huntera.com.br:443` / `/game-socket`)
- Menu nativo do Electron (Alt para mostrar): recarregar, home, limpar cookies

## Uso

1. Abra o atalho **Huntera Squad** ou `dist/Huntera-Squad-Portable.exe`
2. Faça login com uma conta diferente em cada painel
3. No EXE portátil os logins ficam em `HunteraSquadData`, ao lado do executável

Na primeira execução, permita o app no Firewall do Windows.

## Desenvolvimento

```bash
npm install
npm start
```

## Build Windows

```bash
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build
```

O executável sai em `dist/Huntera-Squad-Portable.exe`, com o ícone da grade 2×2 no arquivo e na janela.
