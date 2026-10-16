package net.vivamc.statsapi;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * 投票サイト（MinePortal など）からの投票を、名前ごとに数える。
 * 投票はまだ一度も入ったことのない人からも来るので、UUIDではなく名前で持つ。
 * 「今月」は、サーバーの時計で月が変わると自動で0から数え直す。
 */
public class VoteStore {

    public static final class Votes {
        public final String name;
        public final long total;
        public final long month;
        public final long lastMs;

        Votes(String name, long total, long month, long lastMs) {
            this.name = name;
            this.total = total;
            this.month = month;
            this.lastMs = lastMs;
        }
    }

    private static final class Entry {
        String name;
        long total;
        String monthKey = "";
        long month;
        long lastMs;
    }

    private final File file;
    private final Logger logger;
    private final Map<String, Entry> byName = new HashMap<>();
    private boolean dirty;

    public VoteStore(File dataFolder, Logger logger) {
        this.file = new File(dataFolder, "votes.yml");
        this.logger = logger;
    }

    private static String thisMonth() {
        return YearMonth.now().toString();
    }

    public synchronized void add(String name) {
        if (name == null || name.isBlank() || name.length() > 40) {
            return;
        }
        String key = name.toLowerCase(Locale.ROOT);
        Entry e = byName.computeIfAbsent(key, k -> new Entry());
        e.name = name;
        e.total++;
        String m = thisMonth();
        if (!m.equals(e.monthKey)) {
            e.monthKey = m;
            e.month = 0;
        }
        e.month++;
        e.lastMs = System.currentTimeMillis();
        dirty = true;
    }

    private Votes view(Entry e, String m) {
        return new Votes(e.name, e.total, m.equals(e.monthKey) ? e.month : 0, e.lastMs);
    }

    public synchronized Votes get(String name) {
        Entry e = name == null ? null : byName.get(name.toLowerCase(Locale.ROOT));
        return e == null ? null : view(e, thisMonth());
    }

    public synchronized List<Votes> all() {
        String m = thisMonth();
        List<Votes> out = new ArrayList<>(byName.size());
        for (Entry e : byName.values()) {
            out.add(view(e, m));
        }
        return out;
    }

    public synchronized void load() {
        byName.clear();
        if (!file.exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection sec = yaml.getConfigurationSection("votes");
        if (sec == null) {
            return;
        }
        for (String key : sec.getKeys(false)) {
            Entry e = new Entry();
            e.name = sec.getString(key + ".name", key);
            e.total = sec.getLong(key + ".total", 0);
            e.monthKey = sec.getString(key + ".monthKey", "");
            e.month = sec.getLong(key + ".month", 0);
            e.lastMs = sec.getLong(key + ".lastMs", 0);
            byName.put(key, e);
        }
    }

    public synchronized void save() {
        if (!dirty) {
            return;
        }
        YamlConfiguration yaml = new YamlConfiguration();
        for (Map.Entry<String, Entry> me : byName.entrySet()) {
            String k = "votes." + me.getKey();
            Entry e = me.getValue();
            yaml.set(k + ".name", e.name);
            yaml.set(k + ".total", e.total);
            yaml.set(k + ".monthKey", e.monthKey);
            yaml.set(k + ".month", e.month);
            yaml.set(k + ".lastMs", e.lastMs);
        }
        try {
            yaml.save(file);
            dirty = false;
        } catch (IOException ex) {
            logger.log(Level.WARNING, "[VivaStatsAPI] 投票の記録の保存に失敗しました", ex);
        }
    }
}
