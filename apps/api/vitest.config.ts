import { defineConfig } from 'vitest/config';

// B10 : environnement de test autonome et reproductible, isolé de tout .env personnel.
// DATABASE_URL n'a pas besoin d'être une base réelle : chaque suite mocke Prisma
// (voir vi.mock('../config/prisma.js', ...)) — cette valeur sert uniquement à satisfaire
// le schéma zod de config/env.ts au chargement. `npm test` doit passer depuis un clone
// fraîchement installé, sans configuration locale préalable.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/mehdi_depannage_test',
      JWT_SECRET: 'vitest-fixed-test-secret-not-for-production-0000',
    },
  },
});
