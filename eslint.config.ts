import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

// Flat ESLint config for a TypeScript library (no Vue SFCs). Uses the shared
// Vue+TS preset's TypeScript rules for consistency with the rest of the monorepo.
export default defineConfigWithVueTs(
  { name: 'seal-client/files-to-lint', files: ['**/*.{ts,mts,tsx}'] },
  globalIgnores(['**/dist/**', '**/coverage/**', '**/*.d.ts']),
  vueTsConfigs.recommended,

  {
    name: 'seal-client/overrides',
    rules: {
      // Underscore-prefixed args/vars are an intentional "unused" marker; rest-sibling
      // destructuring (`const { a, ...rest } = x`) is a legitimate key-omission pattern.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
)
