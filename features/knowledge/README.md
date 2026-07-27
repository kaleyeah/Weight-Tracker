# Compound Knowledge Module

## Where to place this folder

Copy the included `features/knowledge/` directory into the root of the Claude Code repository.

Claude must begin with:

```text
features/knowledge/architecture/00-PROMPT.md
```

The Max Rogers Codex is included at:

```text
features/knowledge/architecture/CODEX/max-rogers-fitness-knowledge-codex.md
```

## Working roles

- Product Owner: user
- Product Architect: ChatGPT
- Lead Engineer: Claude Code

## Workflow

1. Product architecture lives in `architecture/`.
2. Claude builds in the existing project, using `implementation/` for module-specific work when appropriate.
3. Module tests live in `tests/`.
4. Claude places Product Architect handoff packages in `reviews/`.
5. The Codex remains the grounded knowledge source and must retain its evidence labels.
