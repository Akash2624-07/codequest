import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/setup.js'],
        coverage: {
            // Measure src/ only. Without this the report includes the suite's own
            // helpers, padding the denominator with code that isn't the subject.
            include: ['src/**/*.js'],
        },
    }
});