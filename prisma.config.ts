import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
    // directUrl is used by prisma db push and prisma migrate — bypasses the pooler
    directUrl: process.env.DIRECT_URL,
  },
});
