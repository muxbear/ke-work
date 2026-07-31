import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts'
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/main/mode/**',
        'src/main/database/**',
        'src/main/security/**',
        'src/main/services/**'
      ]
    }
  }
})
