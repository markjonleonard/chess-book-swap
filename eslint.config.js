import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**', 'supabase/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'app/security',
    rules: {
      // All user text is untrusted: render it with interpolation, which Vue escapes.
      'vue/no-v-html': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
    },
  },

  skipFormatting,
)
