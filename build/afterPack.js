// Запуск без песочницы Chromium на Linux: на части систем она не стартует
// (ошибка про /dev/shm, чёрный экран). Подменяем главный файл скриптом-обёрткой.
const fs = require('fs'), path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'linux') return;
  const opts = context.packager.platformSpecificBuildOptions || {};
  const name = opts.executableName || context.packager.executableName || 'music-player';
  const bin = path.join(context.appOutDir, name);
  fs.renameSync(bin, bin + '.bin');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/${name}.bin" --no-sandbox "$@"\n`, { mode: 0o755 });
};
