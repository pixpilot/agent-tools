import { packageGenerator } from '@pixpilot/workspace-package-generator';

module.exports = function generator(plop: unknown) {
  packageGenerator(plop, {
    author: 'Mo Doaie <m.doaie@hotmail.com>',
    defaultBundler: 'tsdown',
    orgName: 'pixpilot',
  });
};
