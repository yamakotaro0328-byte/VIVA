package net.vivamc.statsapi;

import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * 国と土地の「年表」。宣戦布告・終戦・同盟・建国などの出来事を古い順に貯め、
 * サイトの「年表」ページに出す。Landsのイベントは別スレッドから来ることもあるので
 * すべて synchronized にしている。
 */
public class ChronicleStore {

    /** 1件の出来事。a / b は土地名か国名、detail は結果や関係など。 */
    public static final class Entry {
        final String type;
        final long timeMs;
        final String a;
        final String aKind;
        final String b;
        final String bKind;
        final String detail;

        Entry(String type, long timeMs, String a, String aKind, String b, String bKind, String detail) {
            this.type = type;
            this.timeMs = timeMs;
            this.a = a == null ? "" : a;
            this.aKind = aKind == null ? "" : aKind;
            this.b = b == null ? "" : b;
            this.bKind = bKind == null ? "" : bKind;
            this.detail = detail == null ? "" : detail;
        }

        String toJson() {
            return "{\"type\":" + Json.str(type)
                    + ",\"time\":" + timeMs
                    + ",\"a\":" + Json.str(a)
                    + ",\"a_kind\":" + Json.str(aKind)
                    + ",\"b\":" + Json.str(b)
                    + ",\"b_kind\":" + Json.str(bKind)
                    + ",\"detail\":" + Json.str(detail) + "}";
        }
    }

    private final File file;
    private final Logger logger;
    private final int limit;
    private final Deque<Entry> entries = new ArrayDeque<>();
    private boolean dirty;
    private volatile Consumer<Entry> listener;

    public ChronicleStore(File dataFolder, Logger logger, int limit) {
        this.file = new File(dataFolder, "chronicle.yml");
        this.logger = logger;
        this.limit = Math.max(10, limit);
    }

    /** 出来事が書き足されたときに呼ぶ処理（通知など）。 */
    public void setListener(Consumer<Entry> listener) {
        this.listener = listener;
    }

    public void add(String type, String a, String aKind, String b, String bKind, String detail) {
        Entry added = append(type, a, aKind, b, bKind, detail);
        Consumer<Entry> l = listener;
        if (added != null && l != null) {
            try {
                l.accept(added);
            } catch (RuntimeException ignored) {
                // 通知の失敗で年表の記録を止めない
            }
        }
    }

    private synchronized Entry append(String type, String a, String aKind, String b, String bKind, String detail) {
        Entry last = entries.peekLast();
        long now = System.currentTimeMillis();
        // 同じ出来事が短い間に二重に届いたときは1件にまとめる
        if (last != null && last.type.equals(type) && last.a.equals(a == null ? "" : a)
                && last.b.equals(b == null ? "" : b) && now - last.timeMs < 5000) {
            return null;
        }
        Entry e = new Entry(type, now, a, aKind, b, bKind, detail);
        entries.addLast(e);
        while (entries.size() > limit) {
            entries.pollFirst();
        }
        dirty = true;
        return e;
    }

    /** 新しい順に最大 n 件。 */
    public synchronized List<Entry> recent(int n) {
        List<Entry> out = new ArrayList<>(Math.min(n, entries.size()));
        Iterator<Entry> it = entries.descendingIterator();
        while (it.hasNext() && out.size() < n) {
            out.add(it.next());
        }
        return out;
    }

    public synchronized void load() {
        entries.clear();
        if (!file.exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        for (Map<?, ?> m : yaml.getMapList("entries")) {
            try {
                entries.addLast(new Entry(
                        String.valueOf(m.get("type")),
                        Long.parseLong(String.valueOf(m.get("time"))),
                        str(m.get("a")), str(m.get("aKind")),
                        str(m.get("b")), str(m.get("bKind")),
                        str(m.get("detail"))));
            } catch (RuntimeException ignored) {
                // 壊れた行は読み飛ばす
            }
        }
        while (entries.size() > limit) {
            entries.pollFirst();
        }
    }

    public synchronized void save() {
        if (!dirty) {
            return;
        }
        YamlConfiguration yaml = new YamlConfiguration();
        List<Map<String, Object>> list = new ArrayList<>();
        for (Entry e : entries) {
            Map<String, Object> m = new HashMap<>();
            m.put("type", e.type);
            m.put("time", e.timeMs);
            m.put("a", e.a);
            m.put("aKind", e.aKind);
            m.put("b", e.b);
            m.put("bKind", e.bKind);
            m.put("detail", e.detail);
            list.add(m);
        }
        yaml.set("entries", list);
        try {
            yaml.save(file);
            dirty = false;
        } catch (IOException ex) {
            logger.log(Level.WARNING, "[VivaStatsAPI] 年表の保存に失敗しました", ex);
        }
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
