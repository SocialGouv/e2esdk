/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  verbose: true,
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
  transformIgnorePatterns: ['node_modules/(?!(@47ng/chakra-next)/)'],
  // ESM support
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
}

export default jestConfig
