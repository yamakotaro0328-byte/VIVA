package net.vivamc.statsapi;

import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * プレイヤーごとの統計と、接続履歴をメモリ上に保持し、YAMLファイルへ
 * 読み書きする。HTTPサーバーのスレッドと、Bukkitのメインスレッドの
 * 両方から触られるため、すべての操作を synchronized にしている。
 */
public class DataStore {

    private final File playerDataFile;
    private final File historyFile;
    private final Logger logger;
    private final int historyLimit;

    /** UUID文字列 -> 記録 */
    private final Map<String, PlayerRecord> records = new HashMap<>();

    /** 新しい順ではなく「古い順」に並べておき、先頭から捨てていく */
    private final Deque<HistoryEvent> history = new ArrayDeque<>();

    public DataStore(File dataFolder, Logger logger, int historyLimit) {
        this.playerDataFile = new File(dataFolder, "playerdata.yml");
        this.historyFile = new File(dataFolder, "history.yml");
        this.logger = logger;
        this.historyLimit = Math.max(1, historyLimit);
    }

    public synchronized void load() {
        records.clear();
        if (playerDataFile.exists()) {
            YamlConfiguration yaml = YamlConfiguration.loadConfiguration(playerDataFile);
            for (String uuid : yaml.getKeys(false)) {
                PlayerRecord r = new PlayerRecord(yaml.getString(uuid + ".name", uuid));
                r.playerKillsTotal = yaml.getLong(uuid + ".playerKills", 0);
                r.mobKillsTotal = yaml.getLong(uuid + ".mobKills", 0);
                r.deathsTotal = yaml.getLong(uuid + ".deaths", 0);
                r.blocksPlacedTotal = yaml.getLong(uuid + ".blocksPlaced", 0);
                r.blocksBrokenTotal = yaml.getLong(uuid + ".blocksBroken", 0);
                r.loginCount = yaml.getLong(uuid + ".loginCount", 0);
                r.firstSeenMs = yaml.getLong(uuid + ".firstSeenMs", 0);
                r.lastSeenMs = yaml.getLong(uuid + ".lastSeenMs", 0);
                r.totalPlaytimeMs = yaml.getLong(uuid + ".playtimeMs", 0);
                records.put(uuid, r);
            }
        }

        history.clear();
        if (historyFile.exists()) {
            YamlConfiguration yaml = YamlConfiguration.loadConfiguration(historyFile);
            List<Map<?, ?>> list = yaml.getMapList("events");
            for (Map<?, ?> m : list) {
                Object player = m.get("player");
                Object type = m.get("type");
                Object time = m.get("time");
                if (player != null && type != null && time != null) {
                    history.addLast(new HistoryEvent(player.toString(), type.toString(),
                            Long.parseLong(time.toString())));
                }
            }
            trimHistory();
        }
    }

    public synchronized void save() {
        try {
            YamlConfiguration yaml = new YamlConfiguration();
            for (Map.Entry<String, PlayerRecord> e : records.entrySet()) {
                String uuid = e.getKey();
                PlayerRecord r = e.getValue();
                yaml.set(uuid + ".name", r.name);
                yaml.set(uuid + ".playerKills", r.playerKillsTotal);
                yaml.set(uuid + ".mobKills", r.mobKillsTotal);
                yaml.set(uuid + ".deaths", r.deathsTotal);
                yaml.set(uuid + ".blocksPlaced", r.blocksPlacedTotal);
                yaml.set(uuid + ".blocksBroken", r.blocksBrokenTotal);
                yaml.set(uuid + ".loginCount", r.loginCount);
                yaml.set(uuid + ".firstSeenMs", r.firstSeenMs);
                yaml.set(uuid + ".lastSeenMs", r.lastSeenMs);
                // ログイン中でも、直近保存時点までの合計を保存しておく（急な終了対策）
                yaml.set(uuid + ".playtimeMs", r.currentTotalPlaytimeMs());
            }
            yaml.save(playerDataFile);

            YamlConfiguration hist = new YamlConfiguration();
            List<Map<String, Object>> list = new ArrayList<>();
            for (HistoryEvent ev : history) {
                Map<String, Object> m = new HashMap<>();
                m.put("player", ev.player);
                m.put("type", ev.type);
                m.put("time", ev.timeMs);
                list.add(m);
            }
            hist.set("events", list);
            hist.save(historyFile);
        } catch (IOException ex) {
            logger.log(Level.WARNING, "[VivaStatsAPI] データの保存に失敗しました", ex);
        }
    }

    private PlayerRecord getOrCreate(UUID uuid, String name) {
        PlayerRecord r = records.get(uuid.toString());
        if (r == null) {
            r = new PlayerRecord(name);
            records.put(uuid.toString(), r);
        } else {
            r.name = name; // 名前変更に追従
        }
        return r;
    }

    public synchronized void onJoin(UUID uuid, String name) {
        PlayerRecord r = getOrCreate(uuid, name);
        long now = System.currentTimeMillis();
        r.sessionStartMs = now;
        r.loginCount++;
        if (r.firstSeenMs <= 0) {
            r.firstSeenMs = now;
        }
        r.lastSeenMs = now;
        history.addLast(new HistoryEvent(name, "join", now));
        trimHistory();
    }

    public synchronized void onQuit(UUID uuid, String name) {
        PlayerRecord r = getOrCreate(uuid, name);
        long now = System.currentTimeMillis();
        if (r.sessionStartMs > 0) {
            long sessionMs = now - r.sessionStartMs;
            if (sessionMs > 0) {
                r.totalPlaytimeMs += sessionMs;
            }
            r.sessionStartMs = 0;
        }
        r.lastSeenMs = now;
        history.addLast(new HistoryEvent(name, "quit", now));
        trimHistory();
    }

    public synchronized void onPlayerKill(UUID uuid, String name) {
        getOrCreate(uuid, name).playerKillsTotal++;
    }

    public synchronized void onMobKill(UUID uuid, String name) {
        getOrCreate(uuid, name).mobKillsTotal++;
    }

    public synchronized void onDeath(UUID uuid, String name) {
        getOrCreate(uuid, name).deathsTotal++;
    }

    public synchronized void onBlockPlace(UUID uuid, String name) {
        getOrCreate(uuid, name).blocksPlacedTotal++;
    }

    public synchronized void onBlockBreak(UUID uuid, String name) {
        getOrCreate(uuid, name).blocksBrokenTotal++;
    }

    private void trimHistory() {
        while (history.size() > historyLimit) {
            history.removeFirst();
        }
    }

    /** 名前（大文字小文字を区別しない）で検索。見つからなければ null。 */
    public synchronized PlayerRecord findByName(String name) {
        for (PlayerRecord r : records.values()) {
            if (r.name != null && r.name.equalsIgnoreCase(name)) {
                // 呼び出し側で安全に使えるよう、コピーを返す
                return r.copy();
            }
        }
        return null;
    }

    /**
     * 全員分のコピーを返す（内部のMapをそのまま外に渡さないため）。
     * ランキングや一覧のAPIは、これを受け取ってからロックの外で
     * 並び替え・絞り込みを行う。
     */
    public synchronized List<PlayerRecord> copyAll() {
        List<PlayerRecord> out = new ArrayList<>(records.size());
        for (PlayerRecord r : records.values()) {
            out.add(r.copy());
        }
        return out;
    }

    /** 新しい順の一覧を返す（コピー） */
    public synchronized List<HistoryEvent> recentHistory(int limit) {
        List<HistoryEvent> all = new ArrayList<>(history);
        List<HistoryEvent> out = new ArrayList<>();
        for (int i = all.size() - 1; i >= 0 && out.size() < limit; i--) {
            out.add(all.get(i));
        }
        return out;
    }
}
