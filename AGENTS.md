# Repository Guidelines

## Project Structure & Module Organization

This workspace is currently an initial scaffold: no application source, tests, assets, or dependency manifests are present. The `.agents/`, `.codex/`, `.aws/`, and `.git/` directories are environment-managed; do not treat them as application modules or edit them as part of routine contributions.

When introducing code, organize application modules under `src/`, automated tests under `tests/`, and static resources under `assets/` where appropriate. Document the actual layout in this guide as the project develops. Keep related functionality together and avoid creating unused directories.

## Build, Test, and Development Commands

No build, test, or local development commands are configured yet. Do not assume that `npm test`, `make build`, or other ecosystem-specific commands work.

When adding a toolchain, provide reproducible setup, development, build, and test commands in a root `README.md`. Commit the relevant dependency manifest and lockfile, and update this section with verified commands.

## Coding Style & Naming Conventions

No language, formatter, or linter has been established. Follow the conventions of the language selected for the project, and commit shared formatting and lint configuration alongside the first implementation. Use descriptive names and consistent indentation; avoid mixing tabs and spaces within a file.

## Testing Guidelines

No testing framework or coverage threshold is configured. Add tests for new behavior and bug fixes using the chosen framework's discovery conventions. Keep tests deterministic and document how contributors can run them locally.

## Commit & Pull Request Guidelines

Git history is unavailable in this workspace, so no existing commit convention can be verified. Use concise, imperative commit subjects, such as `Add project setup documentation`.

Pull requests should explain the change, its purpose, and validation performed. Link relevant issues and include screenshots for visible interface changes. Explicitly identify checks that could not be run.

## Security & Configuration

Never commit credentials, tokens, or private configuration. Provide placeholder values in example configuration files and document required environment variables when configuration is introduced.
