import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

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

    record Out(int exit, String out) {
    }

    static void git(Path dir, String token, String stdin, String... args) throws IOException {
        List<String> cmd = new ArrayList<>(List.of("git", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper="));
        if (token != null) {
            cmd.addAll(List.of("-c", "credential.helper=!f() { echo username=x-access-token; echo \"password=$ELF_MAKER_TOKEN\"; }; f"));
        }
        cmd.addAll(List.of(args));
        Out o = exec(cmd, dir, token, stdin, 180);
        if (o.exit() != 0) throw new IOException("git " + args[0] + " failed: " + o.out().strip());
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
