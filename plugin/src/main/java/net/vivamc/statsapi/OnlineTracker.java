package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * 何人が接続していたかを一定間隔（既定5分）で記録し、直近7日分を持っておく。
 * サイトの「サーバーの様子」ページで、人数の移り変わりのグラフに使う。
 */
public class OnlineTracker {

    private static final long KEEP_MS = 7L * 24 * 60 * 60 * 1000;

    private final File file;
    private final Logger logger;
    /** [時刻ms, 人数] を古い順に */
    private final Deque<long[]> samples = new ArrayDeque<>();
    private long peak;
    private long peakAt;

    public OnlineTracker(File dataFolder, Logger logger) {
        this.file = new File(dataFolder, "online.yml");
        this.logger = logger;
    }

    /** メインスレッドから呼ぶ（いまの人数を記録する）。 */
    public void sample() {
        record(System.currentTimeMillis(), Bukkit.getOnlinePlayers().size());
    }

    synchronized void record(long time, long count) {
        samples.addLast(new long[]{time, count});
        while (!samples.isEmpty() && time - samples.peekFirst()[0] > KEEP_MS) {
            samples.pollFirst();
        }
        if (count >= peak) {
            peak = count;
            peakAt = time;
        }
    }

    public synchronized List<long[]> copySamples() {
        List<long[]> out = new ArrayList<>(samples.size());
        for (long[] s : samples) {
            out.add(new long[]{s[0], s[1]});
        }
        return out;
    }

    public synchronized long getPeak() {
        return peak;
    }

    public synchronized long getPeakAt() {
        return peakAt;
    }

    public synchronized void load() {
        samples.clear();
        if (!file.exists()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        peak = yaml.getLong("peak", 0);
        peakAt = yaml.getLong("peakAt", 0);
        long now = System.currentTimeMillis();
        for (String line : yaml.getStringList("samples")) {
            int i = line.indexOf(':');
            if (i < 0) {
                continue;
            }
            try {
                long t = Long.parseLong(line.substring(0, i));
                long n = Long.parseLong(line.substring(i + 1));
                if (now - t <= KEEP_MS) {
                    samples.addLast(new long[]{t, n});
                }
            } catch (NumberFormatException ignored) {
                // 壊れた行は読み飛ばす
            }
        }
    }

    public synchronized void save() {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.set("peak", peak);
        yaml.set("peakAt", peakAt);
        List<String> lines = new ArrayList<>(samples.size());
        for (long[] s : samples) {
            lines.add(s[0] + ":" + s[1]);
        }
        yaml.set("samples", lines);
        try {
            yaml.save(file);
        } catch (IOException ex) {
            logger.log(Level.WARNING, "[VivaStatsAPI] 接続人数の記録の保存に失敗しました", ex);
        }
    }
}
