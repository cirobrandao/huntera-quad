const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

function applyIcon(exePath, icoPath) {
  if (!fs.existsSync(exePath)) {
    throw new Error(`Executável não encontrado: ${exePath}`);
  }
  if (!fs.existsSync(icoPath)) {
    throw new Error(`Ícone não encontrado: ${icoPath}`);
  }

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  const icons = iconFile.icons.map((item) => item.data);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);

  if (groups.length === 0) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);
  } else {
    for (const group of groups) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons);
    }
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`Ícone aplicado em ${exePath}`);
}

async function setWinIconHook(context) {
  if (!context || !context.appOutDir || !context.packager) return;
  if (context.electronPlatformName && context.electronPlatformName !== 'win32') return;
  const icon = path.join(__dirname, '..', 'build', 'icon.ico');
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  applyIcon(path.join(context.appOutDir, exeName), icon);
}

module.exports = setWinIconHook;
module.exports.default = setWinIconHook;
module.exports.applyIcon = applyIcon;
