const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

const exePath = path.join(__dirname, '..', 'dist', 'Huntera-Quad-Portable.exe');
const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');

if (!fs.existsSync(exePath)) {
  console.warn('Portable exe não encontrado, pulando ícone do wrapper.');
  process.exit(0);
}

const raw = fs.readFileSync(exePath);
const exe = ResEdit.NtExecutable.from(raw, { ignoreCert: true });
const extra = exe.getExtraData();
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
if (extra) exe.setExtraData(extra);

const out = Buffer.from(exe.generate());
fs.writeFileSync(exePath, out);
console.log(
  `Ícone aplicado no wrapper ${exePath} (${raw.length} -> ${out.length} bytes, overlay ${extra ? extra.byteLength : 0})`
);
