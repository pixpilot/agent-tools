import baseConfig from '@internal/eslint-config/base';

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    // Prettier formats fenced code blocks with its own `trailingComma` setting,
    // so the jsonc rule would fight the formatter over every multi-line sample.
    files: ['**/*.md/**'],
    rules: {
      'jsonc/comma-dangle': 'off',
    },
  },
  {
    files: ['test/**/*.test.ts'],
    rules: {
      'dot-notation': 'off',
      'ts/dot-notation': 'off',
    },
  },
];
