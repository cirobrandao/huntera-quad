# Huntera Quad

Navegador em grade **2×2** para [huntera.com.br](https://huntera.com.br), com **4 sessões isoladas** (cookies e storage separados por conta).

## Recursos

- Quatro painéis lado a lado (2 em cima, 2 embaixo)
- Cookies isolados por painel (`persist:huntera-account-1` … `4`)
- Zoom − / + por conta (ao lado do reload)
- Clique no nome da janela para renomear a conta (fica salvo localmente)
- Latência por janela: ping até huntera.com.br e tempo de carregamento
- Menu nativo do Electron (Alt para mostrar): recarregar, home, limpar cookies

## Uso

1. Abra o atalho **Huntera Quad** ou `dist/Huntera-Quad-Portable.exe`
2. Faça login com uma conta diferente em cada painel
3. Os logins ficam salvos localmente

Na primeira execução, permita o app no Firewall do Windows.

## Desenvolvimento

```bash
npm install
npm start
```

## Build Windows

```bash
set CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --win portable --x64 -c.win.signAndEditExecutable=false
```

O executável sai em `dist/Huntera-Quad-Portable.exe`.
