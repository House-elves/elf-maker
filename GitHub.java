import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * GitHub, as the account in Elf Maker's settings: its token is gh's (gh auth token -u <login>), read for each run
 * and never written down. Only the calls Elf Maker makes: reading repos, generating one from the template, setting
 * its topics and visibility, and opening the share issue.
 */
public class GitHub {

    static final ObjectMapper JSON = new ObjectMapper();
    static final Pattern LOGIN = Pattern.compile("[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})");
    static final Pattern REPO = Pattern.compile("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}");
    static final String ORG = "House-elves";
    static final String TEMPLATE = "House-elves/elf-template";
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    final String login;
    final String token;

    GitHub(String login) throws IOException {
        if (!LOGIN.matcher(login).matches()) throw new IllegalStateException("Set your GitHub account in Elf Maker's settings");
        this.login = login;
        this.token = token(login);
    }

    static String token(String login) throws IOException {
        try {
            Process p = new ProcessBuilder("gh", "auth", "token", "-u", login).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).strip();
            if (!p.waitFor(30, TimeUnit.SECONDS) || p.exitValue() != 0 || out.isEmpty() || out.contains(" ")) {
                throw new IllegalStateException("gh isn't logged in as " + login + ": run gh auth login");
            }
            return out;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
    }

    record Answer(int status, JsonNode body) {
        boolean ok() {
            return status >= 200 && status < 300;
        }

        String message() {
            return body.path("message").asText("GitHub answered " + status);
        }
    }

    Answer call(String method, String path, Object body) throws IOException {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("https://api.github.com" + path)).timeout(Duration.ofSeconds(45))
                .header("Authorization", "Bearer " + token).header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28").header("User-Agent", "elf-maker");
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
        if (body != null) b.header("Content-Type", "application/json");
        try {
            HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
            JsonNode n = r.body() == null || r.body().isBlank() ? JSON.createObjectNode() : JSON.readTree(r.body());
            return new Answer(r.statusCode(), n);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
    }

    Answer get(String path) throws IOException {
        return call("GET", path, null);
    }

    /** You may make public repos in House-elves: an owner, or a member where members may. */
    boolean canShareInOrg() throws IOException {
        Answer m = get("/orgs/" + ORG + "/memberships/" + login);
        if (!m.ok() || !m.body().path("state").asText().equals("active")) return false;
        if (m.body().path("role").asText().equals("admin")) return true;
        Answer org = get("/orgs/" + ORG);
        return org.ok() && org.body().path("members_can_create_public_repositories").asBoolean(false);
    }

    /** The repo, or null if there's none (or you can't see it). */
    JsonNode repo(String repo) throws IOException {
        Answer a = get("/repos/" + repo);
        return a.ok() ? a.body() : null;
    }

    /** You can push to the repo. */
    boolean canPush(String repo) throws IOException {
        JsonNode r = repo(repo);
        return r != null && r.path("permissions").path("push").asBoolean(false);
    }

    /** The newest commit of the repo's default branch, or null while it has none. */
    String head(String repo) throws IOException {
        JsonNode r = repo(repo);
        if (r == null) return null;
        Answer c = get("/repos/" + repo + "/commits/" + r.path("default_branch").asText("main"));
        return c.ok() ? c.body().path("sha").asText(null) : null;
    }

    /** A new private repo with the template's files, as one commit of its own (no history of the template's). */
    void generate(String owner, String name, String description) throws IOException {
        var body = JSON.createObjectNode().put("owner", owner).put("name", name).put("description", description)
                .put("private", true).put("include_all_branches", false);
        Answer a = call("POST", "/repos/" + TEMPLATE + "/generate", body);
        if (!a.ok()) throw new IOException("GitHub didn't make the repo: " + a.message());
    }

    void topics(String repo, java.util.List<String> topics) throws IOException {
        var body = JSON.createObjectNode();
        var names = body.putArray("names");
        topics.forEach(names::add);
        Answer a = call("PUT", "/repos/" + repo + "/topics", body);
        if (!a.ok()) throw new IOException("Couldn't tag " + repo + ": " + a.message());
    }

    void makePublic(String repo) throws IOException {
        Answer a = call("PATCH", "/repos/" + repo, JSON.createObjectNode().put("private", false));
        if (!a.ok()) throw new IOException("Couldn't make " + repo + " public: " + a.message());
    }

    /** Opens the issue; its URL. */
    String issue(String repo, String title, String body) throws IOException {
        Answer a = call("POST", "/repos/" + repo + "/issues", JSON.createObjectNode().put("title", title).put("body", body));
        if (!a.ok()) throw new IOException("Couldn't open the issue: " + a.message());
        return a.body().path("html_url").asText();
    }

    /**
     * The elf repos you can change: tagged house-elf, in your account or House-elves, that you can push to (search
     * lists a just-tagged repo a few minutes late). [{repo, description, private, url}], Elf Maker and the template left out.
     */
    java.util.List<com.fasterxml.jackson.databind.node.ObjectNode> elfRepos() throws IOException {
        var query = JSON.createObjectNode();
        query.put("query", """
                query($mine: String!, $pub: String!) {
                  mine: search(query: $mine, type: REPOSITORY, first: 100) { nodes { ...elf } }
                  pub: search(query: $pub, type: REPOSITORY, first: 100) { nodes { ...elf } }
                }
                fragment elf on Repository { nameWithOwner description isPrivate url isArchived viewerPermission }""");
        query.putObject("variables").put("mine", "topic:house-elf user:" + login + " archived:false")
                .put("pub", "topic:house-elf org:" + ORG + " archived:false");
        Answer a = call("POST", "/graphql", query);
        if (!a.ok() || a.body().has("errors")) throw new IOException("GitHub didn't list your elves: " + a.body().path("errors").path(0).path("message").asText(a.message()));
        java.util.Map<String, com.fasterxml.jackson.databind.node.ObjectNode> out = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (String list : java.util.List.of("mine", "pub")) {
            for (JsonNode n : a.body().path("data").path(list).path("nodes")) {
                String repo = n.path("nameWithOwner").asText("");
                if (!REPO.matcher(repo).matches() || repo.equals(TEMPLATE) || repo.equals(ORG + "/elf-maker")) continue;
                if (!java.util.Set.of("ADMIN", "MAINTAIN", "WRITE").contains(n.path("viewerPermission").asText())) continue;
                out.put(repo, JSON.createObjectNode().put("repo", repo).put("description", n.path("description").asText(""))
                        .put("private", n.path("isPrivate").asBoolean()).put("url", n.path("url").asText("")));
            }
        }
        return new java.util.ArrayList<>(out.values());
    }

    /** The elf.yaml at the repo's default branch, or null. */
    String elfYaml(String repo) throws IOException {
        Answer a = get("/repos/" + repo + "/contents/elf.yaml");
        if (!a.ok() || !a.body().path("content").isTextual()) return null;
        return new String(java.util.Base64.getMimeDecoder().decode(a.body().path("content").asText()), StandardCharsets.UTF_8);
    }
}
