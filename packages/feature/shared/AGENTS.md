# Shared Package Agent Guide

## Allowed Content

- Generated API types; validation schemas; enum constants and discriminated unions; DTO helpers that do not orchestrate workflows.
- Pure utilities with no app, database, or UI dependency.
- Managed System, Analytics Area, Role Level, status, source context, severity, permission, attachment, rich-content, and relation-type vocabulary when shared by backend and frontend contracts.

## Forbidden Content

- Imports from `apps/platform-api`, `packages/feature/screens`, or `src/ui`.
- Database access; HTTP clients; React components or hooks.
- Permission decisions with runtime authority; domain workflow orchestration; Managed System default owner/reviewer resolution logic.

## Rules

- Prefer explicit exported return types for shared helpers.
- Keep domain values centralized; avoid stringly typed statuses outside schema or enum definitions.
- Changes here affect both apps, so update backend and frontend tests when contracts change.
