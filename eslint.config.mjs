import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

// Backend only. frontend/ has its own config with React rules and browser
// globals; linting it from here would apply the wrong environment to it.
export default defineConfig([
    globalIgnores(['frontend/', 'coverage/', 'node_modules/']),

    {
        files: ['src/**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },

    {
        // Config files are ESM despite package.json's "type": "commonjs".
        // vitest.config.js gets away with it because Vite transpiles its config
        // before loading; this file has to be .mjs because ESLint does not.
        files: ['*.config.js', '*.config.mjs'],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: 'module',
            globals: globals.node,
        },
    },

    {
        // Vitest injects describe/it/expect/vi as globals (globals: true in
        // vitest.config.js), so without this every test file is a wall of
        // no-undef.
        files: ['tests/**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.vitest },
        },
    },
]);
