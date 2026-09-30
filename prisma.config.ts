import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7+: datasource URL lives here, not in schema.prisma.
// Reads DATABASE_URL validated by Joi at Nest boot.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
