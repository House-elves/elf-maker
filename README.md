<img src="https://raw.githubusercontent.com/House-elves/elf-desk/main/docs/brand/mark.svg" width="72" alt="House Elves logo: a checkmark that ends in an elf's hat">

# elf-maker

**Elf Maker** makes new [House Elves](https://github.com/House-elves) elves from what you tell it, and changes them
when you ask. It comes with [Elf Desk](https://github.com/House-elves/elf-desk): open it with **Create an elf** on the
desk's **+** page.

1. **Describe it.** Say what the elf should do.
2. **Read the proposal.** An agent reads how elves are built ([elf-template](https://github.com/House-elves/elf-template)'s
   guide) and searches the web for what this one needs. It comes back with a name, what the elf does, how it will work,
   the settings it asks for, what it reads and writes, when it runs, and where it lives: private or public in your
   account, or public in House-elves. Change any of it.
3. **Create it.** Elf Maker makes a private repo for it from the template, and an agent builds the elf there, in the
   runner's sandbox, as one commit. The runner checks it the way it checks an elf it installs.
4. **Read it, then publish it.** You see what changed, the check, and the code. Ask for changes until it's right. On
   Publish it's pushed, tagged `house-elf`, made public if you chose that, and the desk offers to add it.
5. **Change it any time.** Ask for a change and the agent makes a new version, which you read and publish the same way.
   Your desk then offers it as an update. **Change an elf you already have** works for any elf repo you can push to.

A private elf can be made public later: **Make it public** on its page checks it and its whole history for tokens
and keys, then makes its repo public, so anyone can read it and add it. A public elf in your account can be shared:
**Share with House Elves** opens an issue in
[House-elves/house-elves](https://github.com/House-elves/house-elves). If they take it, an owner lets you create repos
there, and **Move it into House-elves** moves your repo in (GitHub forwards its old address) and closes the issue.
If you can create repos there already, the button is there from the start. **Switch it** then moves the copy on your
desk to the new repo, keeping its settings.

- **Reads:** what you ask for. The proposal agent can only read the template and the web. The build agent works in a
  clone of the elf's repo, in the runner's sandbox, with no GitHub credentials.
- **Writes:** only on a click you confirm. **Create** makes a private repo, **Publish** pushes the version you read
  (and makes the repo public if you chose that), **Make it public** makes a private one public, **Share** opens the issue,
  and **Move it into House-elves** moves the repo there.

Its state is in `~/.config/elf-maker/makes/`, one file per elf, and the agents' reports in `~/.config/elf-maker/agents/`.
It needs the runner 0.5.9 or later.
