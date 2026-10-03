# PostgreSQL integration tests

`npm run test:postgres` verifies the committed Prisma migration chain and database-level contracts against a disposable PostgreSQL database. The command is destructive and therefore runs only when `NODE_ENV=test`, `RUN_POSTGRES_INTEGRATION=1`, an allowed local/CI host, and the exact database name `magic_story_integration` are all present.

The GitHub Actions workflow supplies an ephemeral PostgreSQL 16 service. Never point this command at a developer, staging, or production database.
