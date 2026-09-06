import baseConfig from '@internal/eslint-config/base';

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    files: ['test/**/*.test.ts'],
    rules: {
      'dot-notation': 'off',
      'ts/dot-notation': 'off',
    },
  },
];
