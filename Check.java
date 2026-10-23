import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * The runner's --check-elf, on the version the agent made, before you read it: a fresh clone of the elf's repo at
 * the commit the agent started from, with the agent's patch applied, checked by the installed runner the way it
 * checks an elf it installs. Outside the sandbox, but it only reads: nothing of the elf runs.
 */
public class Check {

    record Result(boolean ok, String out) {
    }

    static final Path DATA = Path.of(System.getenv().getOrDefault("HOUSE_ELVES_DATA",
            System.getProperty("user.home") + "/.local/share/house-elves"));

    static Result run(String token, String repo, String from, String patch) throws IOException {
        Path dir = Files.createTempDirectory("elf-maker-check-");
        try {
            Path wt = dir.resolve("elf");
            git(dir, token, null, "clone", "--quiet", "--no-checkout", "https://github.com/" + repo + ".git", wt.toString());
            git(wt, null, null, "checkout", "--quiet", "--detach", from);
            if (!patch.isBlank()) git(wt, null, patch, "apply", "--index", "--whitespace=nowarn", "-");
            // An elf is plain files: a symlink could point the check at a file of yours, and a submodule at
            // another repo. Either is refused before anything reads the tree.
            for (String line : Check.exec(List.of("git", "ls-files", "-s"), wt, null, null, 60).out().split("\n")) {
                if (line.startsWith("120000 ") || line.startsWith("160000 ")) {
                    return new Result(false, "It has a symlink or a submodule (" + line.substring(line.indexOf('\t') + 1)
                            + "): an elf is plain files. Ask for a change that removes it.");
                }
            }
            Path jar = DATA.resolve("app").resolve("elf-runner.jar");
            if (!Files.isRegularFile(jar)) return new Result(false, "The runner isn't installed here, so the elf couldn't be checked.");
            String java = ProcessHandle.current().info().command().orElse("java");
            Out o = exec(List.of(java, "-jar", jar.toString(), "--check-elf", wt.toString()), dir, null, null, 120);
            if (o.out().contains("Connected to") || o.out().contains("Can't reach the desk")) {
                return new Result(false, "The runner is too old to check an elf: update it with house-elves install.");
            }
            return new Result(o.exit() == 0, o.out().strip());
        } finally {
            delete(dir);
        }
    }

    /** What the runner's check finds in a token or a key; the same as its own (Elves.LEAK). */
    static final Pattern LEAK = Pattern.compile("gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-ant-[A-Za-z0-9_-]{20,}"
            + "|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----");

    /**
     * Before a private repo is made public: the runner's check on what's there now, and every commit any of its refs
     * reaches (branches, tags and pull requests: a public repo shows them all) read for a token or a key. If anything
     * was pushed while it looked, it says so, and the repo stays private.
     */
    static Result beforePublic(String token, String repo) throws IOException {
        Path dir = Files.createTempDirectory("elf-maker-public-");
        try {
            String url = "https://github.com/" + repo + ".git";
            Path mirror = dir.resolve("history.git");
            git(dir, token, null, "clone", "--quiet", "--mirror", url, mirror.toString());
            Set<String> seen = refs(exec(List.of("git", "--git-dir=" + mirror, "show-ref"), dir, null, null, 60).out());
            // Every change in every ref, with the commit it's in: what anyone could read once it's public.
            Path log = dir.resolve("history.txt");
            ProcessBuilder pb = new ProcessBuilder("git", "--git-dir=" + mirror, "-c", "core.hooksPath=/dev/null", "log", "--all",
                    "-p", "--no-color", "--no-ext-diff", "--format=commit %h").directory(dir.toFile()).redirectErrorStream(true)
                    .redirectOutput(log.toFile());
            pb.environment().put("GIT_TERMINAL_PROMPT", "0");
            try {
                Process p = pb.start();
                if (!p.waitFor(120, TimeUnit.SECONDS)) {
                    p.destroyForcibly();
                    throw new IOException("Reading its history took too long");
                }
                if (p.exitValue() != 0) throw new IOException("Couldn't read its history");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(e);
            }
            String commit = "";
            try (var lines = Files.lines(log, StandardCharsets.UTF_8)) {
                for (String line : (Iterable<String>) lines::iterator) {
                    if (line.startsWith("commit ")) commit = line.substring(7);
                    else if (line.startsWith("+") && LEAK.matcher(line).find()) {
                        return new Result(false, "Commit " + commit + " has what looks like a token or key, so it stays private. "
                                + "Revoke that key now: it has been in the repo, even if it's gone from the latest version. "
                                + "Taking it out of the history doesn't make it safe, since clones and forks may have it.");
                    }
                }
            }
            Path wt = dir.resolve("elf");
            git(dir, null, null, "clone", "--quiet", mirror.toString(), wt.toString());
            for (String line : exec(List.of("git", "ls-files", "-s"), wt, null, null, 60).out().split("\n")) {
                if (line.startsWith("120000 ") || line.startsWith("160000 ")) {
                    return new Result(false, "It has a symlink or a submodule (" + line.substring(line.indexOf('\t') + 1) + ").");
                }
            }
            Path jar = DATA.resolve("app").resolve("elf-runner.jar");
            if (!Files.isRegularFile(jar)) return new Result(false, "The runner isn't installed here, so the elf couldn't be checked.");
            String java = ProcessHandle.current().info().command().orElse("java");
            Out o = exec(List.of(java, "-jar", jar.toString(), "--check-elf", wt.toString()), dir, null, null, 120);
            if (o.out().contains("Connected to") || o.out().contains("Can't reach the desk")) {
                return new Result(false, "The runner is too old to check an elf: update it with house-elves install.");
            }
            if (o.exit() != 0) return new Result(false, o.out().strip());
            // What it checked is still all there is.
            Set<String> now = refs(gitOut(dir, token, "ls-remote", url).out());
            if (!now.equals(seen)) return new Result(false, "Something was pushed to it while it was being checked: try again.");
            return new Result(true, o.out().strip());
        } finally {
            delete(dir);
        }
    }

    /** "commit ref" lines (show-ref, ls-remote) as a set, without HEAD and peeled tags. */
    static Set<String> refs(String out) {
        Set<String> refs = new TreeSet<>();
        for (String line : out.split("\n")) {
            String[] f = line.strip().split("\\s+");
            if (f.length == 2 && !f[1].equals("HEAD") && !f[1].endsWith("^{}")) refs.add(f[0] + " " + f[1]);
        }
        return refs;
    }

    record Out(int exit, String out) {
    }

    static void git(Path dir, String token, String stdin, String... args) throws IOException {
        Out o = gitRun(dir, token, stdin, args);
        if (o.exit() != 0) throw new IOException("git " + args[0] + " failed: " + o.out().strip());
    }

    /** Its output, for a git command that reads. */
    static Out gitOut(Path dir, String token, String... args) throws IOException {
        Out o = gitRun(dir, token, null, args);
        if (o.exit() != 0) throw new IOException("git " + args[0] + " failed: " + o.out().strip());
        return o;
    }

    static Out gitRun(Path dir, String token, String stdin, String[] args) throws IOException {
        List<String> cmd = new ArrayList<>(List.of("git", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper="));
        if (token != null) {
            cmd.addAll(List.of("-c", "credential.helper=!f() { echo username=x-access-token; echo \"password=$ELF_MAKER_TOKEN\"; }; f"));
        }
        cmd.addAll(List.of(args));
        return exec(cmd, dir, token, stdin, 180);
    }

    static Out exec(List<String> cmd, Path dir, String token, String stdin, int seconds) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(cmd).directory(dir.toFile()).redirectErrorStream(true);
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        if (token != null) pb.environment().put("ELF_MAKER_TOKEN", token);
        Process p = pb.start();
        CompletableFuture<String> out = CompletableFuture.supplyAsync(() -> {
            try {
                return new String(p.getInputStream().readNBytes(200_000), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        });
        try (var in = p.getOutputStream()) {
            if (stdin != null) in.write(stdin.getBytes(StandardCharsets.UTF_8));
        }
        try {
            if (!p.waitFor(seconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException(cmd.get(0) + " took too long");
            }
            return new Out(p.exitValue(), out.get(10, TimeUnit.SECONDS));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        } catch (Exception e) {
            if (e instanceof IOException io) throw io;
            throw new IOException(e);
        }
    }

    static void delete(Path dir) {
        try (var files = Files.walk(dir)) {
            files.sorted(Comparator.reverseOrder()).forEach(f -> f.toFile().delete());
        } catch (IOException ignored) {
        }
    }
}
