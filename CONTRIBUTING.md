# Contributing to BioChem

Thanks for helping build the platform your class studies on. Here's everything you need.

## The fast path: contribute a note (no code required)

1. Sign in → **Contribute**
2. Choose _Submit a note_ or _Submit questions_
3. Write in **markdown** — use `$...$` for inline math and `$$...$$` for display equations
4. Submit. A lecturer reviews it; once approved it publishes with your name on it and you earn **25 XP**.

## The git path (code PRs)

```bash
bun install
bun run dev          # http://localhost:3000
```

Before opening a PR:

```bash
bun run lint         # must pass with zero errors
bun run typecheck    # strict tsc — zero errors, zero `any`
```

### Commit style (Conventional Commits — enforced)

```
feat(mocks): add question-by-question navigation
fix(flashcards): respect due-date timezone in review queue
content(cat2): expand TCA cycle exam pointers
docs(readme): document cron schedules
```

Scopes: `auth, db, ui, exam, mocks, flashcards, ai, planner, community, jobs, ads, admin, lecturer, content, search, notifications, pwa, deps, ci, docs, core`.

### Adding content

All content is added inside the app — no file pipeline:

- **Students**: Contribute → note/question forms (reviewed by a lecturer).
- **Lecturers**: Lecturer panel → publish (with the AI writing assistant), CSV question import, or a zip of markdown/JSON via bulk upload.
- **Database changes**: add a migration under `supabase/migrations/` — the Database sync workflow applies it to the live database and regenerates `src/types/database.ts` when the PR merges.

### Rules of the road

1. **No `any`.** No `as any`, no `@ts-ignore`. CI blocks it.
2. **No placeholders.** Every button ships working; empty states are real states.
3. **RLS stays on every table.** If you add a table, add policies in a migration.
4. **Secrets never leave `.env`.** `.env.example` documents them; `.env` is gitignored.
5. **Accessibility is not optional.** Keyboard operable, labelled icons, semantic HTML.
6. PRs to `main` only, with a description of what + why. A maintainer reviews within a day or two.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and the page URL. Screenshots help enormously.

## License

By contributing you agree your code is MIT-licensed and your content contributions are CC BY-SA 4.0.
