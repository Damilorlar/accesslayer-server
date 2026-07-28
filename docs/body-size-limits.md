# Request Body Size Limits

This document describes how JSON request body size limits are configured per route group, their defaults, and how a client is notified when a request exceeds its limit.

## Overview

Every route group mounted in [modules/index.ts](../src/modules/index.ts) gets its own `express.json()` parser via `routeBodySizeLimit(group)`, instead of a single limit applied globally to every endpoint. This lets a group with a legitimate need for a larger (or smaller) payload be tuned independently, without changing the ceiling for the rest of the API.

- **Middleware:** [body-size-limit.middleware.ts](../src/middlewares/body-size-limit.middleware.ts)
- **Applied in:** [modules/index.ts](../src/modules/index.ts) — one `routeBodySizeLimit(group)` call per router mount
- **Error handling:** [body-parse-error.middleware.ts](../src/middlewares/body-parse-error.middleware.ts), mounted after the router in [app.ts](../src/app.ts)

## Default and Overrides

| Group        | Env Var                    | Default (if unset)        |
| :----------- | :------------------------- | :------------------------ |
| _(fallback)_ | `BODY_SIZE_LIMIT_DEFAULT`  | `10mb`                    |
| `auth`       | `BODY_SIZE_LIMIT_AUTH`     | `BODY_SIZE_LIMIT_DEFAULT` |
| `admin`      | `BODY_SIZE_LIMIT_ADMIN`    | `BODY_SIZE_LIMIT_DEFAULT` |
| `creators`   | `BODY_SIZE_LIMIT_CREATORS` | `BODY_SIZE_LIMIT_DEFAULT` |

All other route groups (`health`, `config`, `metrics`, `ledger`, `activity`, `ownership`, `wallets`, `alerts`) always use `BODY_SIZE_LIMIT_DEFAULT` — they don't currently have a dedicated override, since none of their payloads differ meaningfully from the default ceiling.

Limit values accept any size string understood by the [`bytes`](https://www.npmjs.com/package/bytes) package (used internally by `body-parser`), e.g. `'100kb'`, `'1mb'`, `'10mb'`.

`BODY_SIZE_LIMIT_DEFAULT` itself defaults to `10mb`, matching the single global limit this replaced — existing deployments see no behavior change unless they explicitly set new overrides.

## Adding an Override for a New Group

1. Add the env var to `envSchema` in [config.schema.ts](../src/config.schema.ts):
   ```typescript
   BODY_SIZE_LIMIT_METRICS: optionalNonEmptyString,
   ```
2. Add the group to `BodySizeLimitGroup` and `GROUP_OVERRIDES` in [body-size-limit.middleware.ts](../src/middlewares/body-size-limit.middleware.ts):

   ```typescript
   export type BodySizeLimitGroup =
      | 'auth'
      | 'admin'
      | 'creators'
      | 'metrics'
      | 'default';

   const GROUP_OVERRIDES: Record<
      Exclude<BodySizeLimitGroup, 'default'>,
      string | undefined
   > = {
      auth: envConfig.BODY_SIZE_LIMIT_AUTH,
      admin: envConfig.BODY_SIZE_LIMIT_ADMIN,
      creators: envConfig.BODY_SIZE_LIMIT_CREATORS,
      metrics: envConfig.BODY_SIZE_LIMIT_METRICS,
   };
   ```

3. Pass the group name at the mount point in `modules/index.ts`:
   ```typescript
   router.use('/metrics', routeBodySizeLimit('metrics'), metricsRouter);
   ```
4. Document the new var's default in the table above and in `.env.example`.

## Fail-Fast Behavior

When a request body exceeds its group's limit, `express.json()` never calls the route handler — it raises a body-parser error (`type: 'entity.too.large'`, `status: 413`) before any controller or database code runs. `bodyParseErrorMiddleware` catches this (for mutation methods — `POST`/`PUT`/`PATCH`/`DELETE`) and returns:

```json
{
   "success": false,
   "code": "BAD_REQUEST",
   "message": "Request payload too large"
}
```

with HTTP status `413`. The same error path also logs a structured `body_parse_failure` entry (method, path, request ID, client IP — never the raw body) for observability. This behavior is identical across every route group regardless of its configured limit — only the threshold that triggers it differs.

## Related Documentation

- [Configuration Guide](./configuration.md) — loading environment configuration.
- [Error Code Registry](./ERROR_CODE_REGISTRY.md) — standard API error shapes.
- [Rate Limiting](./rate-limiting.md) — the sibling per-route-group mechanism for request rate, following the same override pattern.
