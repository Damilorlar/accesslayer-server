# Template Scaffolding Guide

This repo contains reusable template files that speed up development. This guide explains what each piece is, whether it should be adapted, and what is local-only.

## What is template scaffolding?

Template scaffolding refers to starter files, utility wrappers, and configuration that were carried over from a reusable backend template. These files provide working defaults so contributors do not need to build common infrastructure from scratch.

They are **not product logic**. They are development accelerators that should be adapted as the product evolves.

## Reusable template files

| File                                   | Purpose                                                           | Adapt or keep as-is?                                                             |
| -------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/template/render-starter-email.ts` | Generic HTML email wrapper for transactional emails               | Adapt when Access Layer needs branded email layouts                              |
| `src/utils/mail.utils.ts`              | Gmail-based email transport with starter templates                | Keep structure, update templates as product flows are added                      |
| `src/config.ts`                        | Zod-validated environment config with common variables            | Extend with new env vars as needed                                               |
| `src/middlewares/error.middleware.ts`  | Global error handler covering Zod, Prisma, JWT, and syntax errors | Keep as-is, extend for new error types                                           |
| `src/middlewares/rate.middleware.ts`   | Rate limiting with dev/prod defaults                              | Keep as-is, tune limits for production                                           |
| `src/middlewares/cors.middleware.ts`   | CORS setup using allowed origins from config                      | Keep as-is                                                                       |
| `src/utils/prisma.utils.ts`            | Prisma singleton with dev-friendly logging                        | Keep as-is                                                                       |
| `src/utils/logger.utils.ts`            | Pino logger and HTTP status constants                             | Keep as-is                                                                       |
| `src/tspec.config.ts`                  | OpenAPI doc generation config                                     | Keep, update title and description as API grows                                  |
| `src/types/profile.types.ts`           | Domain types and a `STARTER_ACCOUNT_SCHEMA` reference string      | Adapt types as data model evolves; schema string is a reference, not a migration |

## Local-only and example files

| File                 | Purpose                                | Notes                                                   |
| -------------------- | -------------------------------------- | ------------------------------------------------------- |
| `.env.example`       | Safe placeholder environment variables | Copy to `.env` locally. Never commit a real `.env` file |
| `docker-compose.yml` | Local PostgreSQL container             | Local development only. Not used in production or CI    |
| `nodemon.json`       | Auto-reload config for `pnpm dev`      | Local development convenience                           |
| `.husky/`            | Git hooks for lint-staged              | Runs locally on commit, enforced by `prepare` script    |

## Files that are not scaffolding

These are product files, not template carryover:

- `src/modules/` — Application route modules (e.g. `auth`)
- `src/types/auth.types.ts` — Auth domain types
- `prisma/` — Database schema (source of truth for the data model)
- `docs/open-source/issue-backlog.md` — Maintainer issue inventory
- `.github/` — Issue templates, PR template, CI workflow

## How to tell the difference

Template scaffolding files often have comments like:

- `// Copy this to your src/middlewares/...`
- `// Helper function - adjust based on your actual template`
- `// Updated for your existing codebase`

These comments indicate the file originated from the template. The file is still useful — the comment just means it was not written specifically for Access Layer and can be adapted.

## Guidelines for contributors

1. **Do not delete scaffolding** that is still functional. If a utility works, keep it.
2. **Adapt naming** when adding new product-specific logic on top of template files.
3. **Local-only files** (`.env`, `docker-compose.yml`) should never be committed with real credentials or production config.
4. **When in doubt**, check this guide or ask in a discussion before removing or restructuring a template file.
