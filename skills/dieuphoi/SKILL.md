---
name: dieuphoi
description: Use when coordinating several projects from the dieuphoi hub - checking which projects have an orchestra (a projectplaner plan), creating one for a project that has none, linking a project under a parent, collecting what waits for the owner's decision, or starting the agents office page.
---

# dieuphoi

dieuphoi is the general manager (tổng quản) of the orchestras: the highest level below the owner. Each project keeps its own plan in projectplaner format
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

## Messages that start with @

When the owner writes `@name ...`, the message is for that project's orchestra, and you carry it there.

1. `python tools/dp.py who @name`. If it prints several candidates or none, ask which one; never guess.
2. Read that project's rules (CLAUDE.md, `plan/ORCHESTRA.md`) and its plan. From here on that project's rules win.
3. Decide how the message lands:
   - A question about the project: answer from its plan, changelog and handoff notes.
   - An answer to an open question: set that `Q-xxx` to `status: answered` with an `- answer:` line, and unblock the items.
   - New work: add an item (manual lane) or change one, add a CHANGELOG line, run `pp check`.
   - Work that needs a session inside the project (code, runs, long tasks): `python tools/dp.py msg @name <text>`
     writes it to the project's mailbox `plan/INBOX.md`; say that it waits there until a session of that project reads it.
4. For kind `seal` or `archive` never write into the project. `dp msg` keeps the message in the hub (`out/mail/`);
   tell the owner it was not delivered into the project and how that project takes messages.
5. Several names in one message (`@a @b ...`): handle each project separately. `@all` is every project of kind plan.
6. Reply with the project's name first, then what you did there.

A message without @ is for the hub itself.

## Agents office

`python tools/dp.py serve` (Windows: `office.cmd`) serves the page at http://127.0.0.1:8765. It is one diorama:
the heads' room has one desk per orchestra (red = an open question), the big office has one sub agent per item being
worked or next in line, and the store holds archives and finished projects as boxes. The page is read-only.

## Never

- Print or list file names inside private folders named by a project's rules.
- Write plan text that contains a machine path; `pp check` rejects it.
- Run `git add -A` in someone's project; commit by explicit path, and only when asked.

## Hardware

`python tools/dp.py hw` shows CPU, RAM, GPU, disks and which projects are running, recently changed or idle. Check it
before proposing a GPU or long CPU run, and say which project is already using the machine.
