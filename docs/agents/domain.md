# Domain Docs

## Before exploring

This repo uses a single-context layout.

- Read the root `GLOSSARY.md`.
- Read ADRs in `docs/adr/` relevant to the area being explored.

If these files are absent, proceed silently. Domain documentation is
created lazily through `/domain-modeling` when terms or decisions are resolved.

## Use the glossary's vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and test names.
Avoid synonyms the glossary explicitly rejects.

If a needed concept is missing, reconsider whether it belongs to the
project's vocabulary or note the gap for `/domain-modeling`.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
including the ADR number and why reopening the decision is warranted.
