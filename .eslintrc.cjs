module.exports = {
  root: true,
  env: {
    browser: true,
    es2023: true,
    jest: true,
  },
  extends: [
    '@react-native-community',
    // Usamos config sem type-aware para evitar necessidade de tsconfig fora de /app
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: 'latest',
    sourceType: 'module',
    // Removido 'project' para evitar parsing error quando o lint roda fora de /app
  },
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-array-delete': 'off',
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
        ],
        pathGroups: [
          { pattern: 'react', group: 'external', position: 'before' },
        ],
        pathGroupsExcludedImportTypes: ['react'],
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'react/react-in-jsx-scope': 'off',
    'prettier/prettier': 'error',
  },
  settings: {
    'import/resolver': { typescript: { project: './tsconfig.json' } },
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/', '.expo/'],
};
