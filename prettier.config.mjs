/** @type {import("prettier").Config} */
const config = {
  singleQuote: true,
  trailingComma: 'es5',
  overrides: [
    {
      files: ['*.md', '*.mdx'],
      options: {
        tabWidth: 4,
      },
    },
  ],
  plugins: [
    '@trivago/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss',
  ],
  tailwindStylesheet: './packages/ui/src/index.css',
  tailwindFunctions: ['cx', 'cva', 'tw', 'cn'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '^(react|react-dom)$',
    '<THIRD_PARTY_MODULES>',
    '^@repo/(.*)$',
    '^@/.*$',
    '^#/.*$',
    '^#[^/]+/.*$',
    '^[./]',
  ],
  importOrderSideEffects: false,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};

export default config;
