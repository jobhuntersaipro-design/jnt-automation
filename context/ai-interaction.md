# AI Interaction Guidelines

## Communication

- Be concise and direct
- Explain non-obvious decisions briefly
- Ask before large refactors or architectural changes
- Don't add features not in the project spec
- Never delete files without clarification

## Workflow

This is the common workflow for every feature/fix:

1. **Document** — Document the feature in `@context/current-feature.md`
2. **Branch** — Create a new branch for the feature/fix
3. **Implement** — Implement what is described in `@context/current-feature.md`
4. **Test** — Verify in the browser. Run `npm run test` for unit tests and `npm run build` to check for errors
5. **Iterate** — Iterate and change things if needed
6. **Commit** — Only after build passes and everything works, and only with permission
7. **Merge** — Merge to main
8. **Delete Branch** — Ask to delete the branch after merge
9. **Review** — Review AI-generated code periodically and on demand
10. **Complete** — Mark as completed in `@context/current-feature.md` and add to history

Do NOT commit without permission and until build and tests pass. Fix all issues before committing.

## Branching

Create a new branch for every feature/fix:
- `feature/[feature-name]`
- `fix/[fix-name]`
- `chore/[task-name]`

Ask to delete the branch once merged.

## Commits

- Ask before committing — never auto-commit
- Use conventional commit messages: `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- Keep commits focused — one feature/fix per commit
- Never include "Generated with Claude" or similar in commit messages

## When Stuck

- If something isn't working after 2–3 attempts, stop and explain the issue clearly
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features not in the spec
- Preserve existing patterns in the codebase

## Design & UI

Follow the design system and visual references documented in `@context/project-overview.md` under the **Design System** section. Key files:
- `@context/DESIGN.md` — full design system rules
- `@context/design-reference.html` — HTML mockup reference
- `@context/design-reference.png` — visual screenshot reference

## Project-Specific Rules

- **Never run `prisma db push`** — always use `prisma migrate dev` locally and `prisma migrate deploy` in production
- **Never auto-approve new dispatchers** — when a new dispatcher is detected in an upload, always prompt the user to fill in mandatory fields (IC No, weight tiers, incentive rule, petrol rule) before processing
- **Always scope DB queries by `agentId`** — no query should ever return data belonging to another agent
- **Avatar uploads and Excel uploads go to separate R2 paths** — never mix them
- **Gender is always derived from IC, never stored as a manual input field**
- **PDF invoices are generated on demand and never saved to storage**

## Code Review

Review AI-generated code periodically, especially for:

- **Security** — auth checks, `agentId` scoping on every query, input validation
- **Performance** — unnecessary re-renders, N+1 queries (especially dispatcher + salary record joins)
- **Logic errors** — salary calculation edge cases (e.g. dispatcher with no orders, missing weight tier)
- **Patterns** — matches existing codebase conventions?
