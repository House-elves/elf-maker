import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What an elf will be, as the proposal agent works it out and you edit it: {name, title, description, how, settings,
 * reads, writes, schedule, scheduleWhy, where, questions}. Checked whole every time it's saved, since the tab and an
 * agent both write it: only these fields, each within its limits. The runner checks the elf.yaml built from it again.
 */
public class Proposal {

    static final ObjectMapper JSON = new ObjectMapper();
    static final Pattern NAME = Pattern.compile("[a-z0-9][a-z0-9-]{0,40}");
    static final Pattern KEY = Pattern.compile("[A-Z][A-Z0-9_]{0,60}");
    static final Pattern CALENDAR = Pattern.compile("[A-Za-z0-9 *:,;./~-]{1,300}");
    static final Set<String> KINDS = Set.of("text", "login", "email", "emails", "words", "repos", "host", "int", "bool", "calendar", "secret");
    /** House Elves' own names, and the ones the runner keeps for itself (Elves.RESERVED). */
    static final Set<String> RESERVED = Set.of("house-elves", "elf-runner", "elf-desk", "elf-maker", "elf-template", "gh", "git",
            "systemd", "jbang", "claude", "elves", "settings", "dashboard");
    static final List<String> WHERE = List.of("private", "public", "house-elves");

    /** The proposal, checked and trimmed to what it may hold. */
    static ObjectNode check(JsonNode p) {
        if (p == null || !p.isObject()) throw new IllegalArgumentException("A proposal is an object");
        ObjectNode out = JSON.createObjectNode();
        String name = text(p, "name", 41).toLowerCase(Locale.ROOT);
        if (!NAME.matcher(name).matches()) throw new IllegalArgumentException("The name is lowercase letters, digits and -, like release-notes");
        if (RESERVED.contains(name)) throw new IllegalArgumentException(name + " is one of House Elves' own names");
        out.put("name", name);
        out.put("title", required(p, "title", 30));
        out.put("description", required(p, "description", 300));
        out.put("how", required(p, "how", 8000));
        ArrayNode settings = out.putArray("settings");
        for (JsonNode s : p.path("settings")) {
            if (settings.size() >= 20) throw new IllegalArgumentException("That's more settings than an elf should ask for");
            String key = text(s, "key", 61).toUpperCase(Locale.ROOT);
            if (!KEY.matcher(key).matches()) throw new IllegalArgumentException("Setting keys are UPPER_CASE: " + key);
            String kind = text(s, "kind", 20).toLowerCase(Locale.ROOT);
            if (!KINDS.contains(kind)) throw new IllegalArgumentException(key + " has a kind the desk doesn't know: " + kind);
            String dflt = text(s, "default", 200);
            if (kind.equals("secret") && !dflt.isEmpty()) throw new IllegalArgumentException(key + " is a secret: it can't have a default");
            settings.addObject().put("key", key).put("label", required(s, "label", 80)).put("kind", kind).put("help", text(s, "help", 300))
                    .put("default", dflt);
        }
        out.set("reads", lines(p.path("reads"), "reads"));
        out.set("writes", lines(p.path("writes"), "writes"));
        String schedule = text(p, "schedule", 300);
        if (!schedule.isEmpty() && !CALENDAR.matcher(schedule).matches()) throw new IllegalArgumentException("The schedule is like Mon..Fri *-*-* 07:00");
        out.put("schedule", schedule);
        out.put("scheduleWhy", text(p, "scheduleWhy", 300));
        String where = text(p, "where", 20);
        if (!WHERE.contains(where)) where = "private";
        out.put("where", where);
        ArrayNode questions = out.putArray("questions");
        for (JsonNode q : p.path("questions")) {
            if (questions.size() < 10 && q.isTextual() && !q.asText().isBlank()) questions.add(clip(q.asText().strip(), 400));
        }
        return out;
    }

    static ArrayNode lines(JsonNode n, String what) {
        ArrayNode out = JSON.createArrayNode();
        for (JsonNode x : n) {
            if (x.isTextual() && !x.asText().isBlank()) out.add(clip(x.asText().strip().replaceAll("\\s+", " "), 200));
        }
        if (out.isEmpty()) throw new IllegalArgumentException("Say what it " + what + ", even if it's nothing outside this machine");
        if (out.size() > 10) throw new IllegalArgumentException("Say what it " + what + " in at most 10 lines");
        return out;
    }

    static String required(JsonNode n, String field, int max) {
        String v = text(n, field, max);
        if (v.isEmpty()) throw new IllegalArgumentException("It needs a " + field);
        return v;
    }

    static String text(JsonNode n, String field, int max) {
        String v = n.path(field).asText("").strip();
        if (v.length() > max) throw new IllegalArgumentException("The " + field + " is longer than " + max + " characters");
        if (v.chars().anyMatch(c -> c < 0x20 && c != '\n' && c != '\t')) throw new IllegalArgumentException("The " + field + " has control characters");
        return v;
    }

    static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    /** The main class's name for an elf's name: release-notes is ReleaseNotes. */
    static String mainClass(String name) {
        StringBuilder b = new StringBuilder();
        for (String part : name.split("-")) {
            if (part.isEmpty()) continue;
            b.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        String s = b.toString();
        return Character.isDigit(s.charAt(0)) ? "Elf" + s : s;
    }

    /** What the proposal agent answers with. */
    static final String SCHEMA = """
            {"type":"object","properties":{
              "note":{"type":"string","description":"Anything you say to the user about the proposal: what you found, what can't be done."},
              "name":{"type":"string","description":"lowercase-with-dashes, like release-notes"},
              "title":{"type":"string","description":"Its name on the desk, sentence case, at most 30 characters"},
              "description":{"type":"string","description":"One sentence: what it does for the user"},
              "how":{"type":"string","description":"How it will work, in plain words for the user (Markdown): what it reads, when it runs, what its tab shows, what they click"},
              "settings":{"type":"array","items":{"type":"object","properties":{
                "key":{"type":"string"},"label":{"type":"string"},"kind":{"type":"string","enum":["text","login","email","emails","words","repos","host","int","bool","calendar","secret"]},
                "help":{"type":"string"},
                "default":{"type":"string","description":"What a new install starts with (like 30 or false); empty when they must fill it in. Never for a secret."}},
                "required":["key","label","kind","help","default"]}},
              "reads":{"type":"array","items":{"type":"string"}},
              "writes":{"type":"array","items":{"type":"string"}},
              "schedule":{"type":"string","description":"Like Mon..Fri *-*-* 07:00, or empty when it should only run when the user starts it"},
              "scheduleWhy":{"type":"string","description":"Why it runs on that schedule, or why it has none"},
              "where":{"type":"string","enum":["private","public"]},
              "questions":{"type":"array","items":{"type":"string"},"description":"What you couldn't decide and the user should"}},
            "required":["note","name","title","description","how","settings","reads","writes","schedule","scheduleWhy","where","questions"]}""";

    /** What the build agent answers with. */
    static final String BUILD_SCHEMA = """
            {"type":"object","properties":{
              "note":{"type":"string","description":"Anything you say to the user: what you built, what to know before using it"},
              "summary":{"type":"string","description":"What changed in this version, in a few plain sentences for the user"},
              "tried":{"type":"string","description":"How you checked it: --check-elf, the dry run, what you couldn't try and why"},
              "settingsToTry":{"type":"string","description":"What the user should fill in first to try it"}},
            "required":["note","summary","tried","settingsToTry"]}""";
}
