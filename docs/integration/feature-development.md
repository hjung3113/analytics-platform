# Feature development

Feature screens and the core server share the platform workspace (ADR-0097); there is no standalone product runtime. Start at the [repository layout](repository-layout.md), [platform assembly guide](../../apps/platform-web/AGENTS.md), [core-server guide](../../apps/platform-api/AGENTS.md) and [feature-screen guide](../../apps/feature-screens/AGENTS.md). Operating tools live in `ops/platform-api/`; use the root workspace commands and the subject-specific guide rather than former standalone commands.

For domain implementation use [feature implementation](../agents/feature-implementation.md), [server contracts](../architecture/platform-api/README.md), [code index](feature-code-index.md) and [release/OIDC operations](../architecture/platform-api/release/oidc-and-images.md). [Historical local development](history/feedbackops-local-development.md) preserves the former README for reference.
