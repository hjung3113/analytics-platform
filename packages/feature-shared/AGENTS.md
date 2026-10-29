# Shared Package Agent Guide

## Allowed Content

- Generated API types.
- Validation schemas.
- Enum constants and discriminated unions.
- DTO helpers that do not orchestrate workflows.
- Pure utilities with no app, database, or UI dependency.
- Managed System, Analytics Area, Role Level, status, source context, severity, permission, attachment, rich-content, and relation-type vocabulary when shared by backend and frontend contracts.

## Forbidden Content

- Imports from `apps/platform-api`, `apps/feature-screens`, or `@ap/feature-ui` (enforced by `pnpm --filter @ap/platform-api-ops check:boundaries`).
- Database access.
- HTTP clients.
- React components or hooks.
- Permission decisions with runtime authority.
- Domain workflow orchestration.
- Managed System default owner/reviewer resolution logic.

## Rules

- Lint is ESLint over the whole package: `pnpm --filter @ap/feature-shared lint` (`featureSharedPreset`, `--max-warnings 0`). An intended exception names its ESLint rule and a concrete reason in the comment; an unused directive fails. Rule correspondence with the former Biome lint: `docs/integration/platform-packages.md` §6.
- Prefer explicit exported return types for shared helpers.
- Keep domain values centralized; avoid stringly typed statuses outside schema or enum definitions.
- Changes here affect both apps, so update backend and frontend tests when contracts change.
