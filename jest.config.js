module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|@react-native|@react-native-community|expo(?:-[^/]+)?|@expo|expo-modules-core|expo-font)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  clearMocks: true,
  verbose: true,
  reporters: [
    'default',
    [
      '<rootDir>/tests/time-reporter.js',
      { slowTestThresholdMs: 1500 }, // marca testes acima de 1.5s
    ],
  ],
};
