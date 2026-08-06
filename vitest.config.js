import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/setup.js'],
        coverage: {
            include: ['src/**/*.js'],   // otherwise the suite's own helpers get measured
        },
    }
});