# elf-maker

Elf Maker is an elf like any other, and follows the guide in
[elf-template's AGENTS.md](https://github.com/House-elves/elf-template/blob/main/AGENTS.md). What's particular to it:

- **It comes with the desk.** `builtin: true` in elf.yaml is for reading only. The desk itself keeps
  House-elves/elf-maker installed (`ElvesService.keepBuiltin`), leaves it out of the + page and the tab bar, and lets
  only it use `elf.addElf`.
- **One file per elf in the making:** `makes/<id>.json`. Its `stage` moves through proposing, proposed, building,
  review and published (or failed). Each agent's id says which file it belongs to (`propose-<id>-<n>`,
  `build-<id>-<n>`), and `agent-done` takes its answer in.
- **Nothing reaches GitHub without a click you confirm:** `create`, `publish`, `make-public`, `share` and `move` ask first. `published` only
  finishes a publish you confirmed: it checks the pushed commit is on GitHub before it tags the repo or makes it public.
  `make-public` makes a published private elf public only after the runner's check on it and a look through its
  whole history (every branch, tag and pull request ref) for tokens and keys (`Check.beforePublic`), since a public
  repo shows all of them; if anything is pushed while it looks, the repo stays private.
- **The proposal agent** is read-only, on the public template, with web access (`web: true`, runner 0.38.0).
  **The build agent** gets the approved proposal as `untrusted` too, so the runner's safety check reads it first.
