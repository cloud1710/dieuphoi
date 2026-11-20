---
name: dieuphoi
description: Use when coordinating several projects from the dieuphoi hub - checking which projects have an orchestra (a projectplaner plan), creating one for a project that has none, linking a project under a parent, collecting what waits for the owner's decision, or starting the agents office page.
---

# dieuphoi

dieuphoi is the lead of the orchestras. Each project keeps its own plan in projectplaner format
(`plan/STATUS.yaml`, `plan/QUESTIONS.md`, `plan/CHANGELOG.md`). The hub holds `registry.yaml` and reads those plans.
It never edits a plan of kind `seal` or a folder of kind `archive`.

## Start of a session

1. `python tools/dp.py check`. Fix every error it prints before anything else.
2. `python tools/dp.py scan`, then read `out/INBOX.md`.
3. Tell the owner only what is in the inbox: open questions and items owned by a person. Everything else you decide.

## What goes to the owner, what you decide

Goes to the owner:
- Anything that cannot be undone: deleting files or branches, pushing, publishing, deploying.
- Paid or GPU runs.
- Anything touching patient data or private folders.
- Starting, pausing or archiving a whole project.
- A conflict between two projects' rules.

You decide, and record one line in that project's `plan/CHANGELOG.md`:
- Splitting, ordering and wording of items.
- Which lane an item sits in, as long as nothing moves into the auto lane without the owner's word.
- Registry grouping and parent links.

For a decision that could go several ways and is not the owner's, ask a council of three subagents (one argues
for, one against, one checks the project's own rules), take the majority, and record the reason.

## Create an orchestra for a project

1. Read the project's own CLAUDE.md first. Its rules win over this skill.
2. Add the project to `registry.yaml` with `kind: plan`, a `group`, and a `parent` if it serves another project.
3. `python tools/dp.py init <id>`.
4. Replace the starter item with real items taken from the project's handoff notes. One item is one session's work,
   and its title states the outcome.
5. New items go in the `manual` lane. The `active` lane stays empty until the owner says a chain may run.
6. `pp check` in the project, then `python tools/dp.py check`.

## Link the levels

- Up: a project raises an issue by adding an open `Q-xxx` question or an item with a person as `owner`.
- Down: the hub changes nothing in a project by itself; it opens a session there, which follows that project's rules.
- A child (`parent: <id>`) reports to its parent first. The hub shows both.

## Agents office

`python tools/dp.py serve` (Windows: `office.cmd`) serves the page at http://127.0.0.1:8765. Each room is a project;
a working agent is an item in `doing`, a red agent is an open question. The page is read-only.

## Never

- Print or list file names inside private folders named by a project's rules.
- Write plan text that contains a machine path; `pp check` rejects it.
- Run `git add -A` in someone's project; commit by explicit path, and only when asked.
