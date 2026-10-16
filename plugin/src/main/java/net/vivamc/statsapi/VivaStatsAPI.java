package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.util.function.Supplier;
import java.util.logging.Level;

public class VivaStatsAPI extends JavaPlugin {

    private DataStore store;
    private OnlineTracker online;
    private ChronicleStore chronicle;
    private ApiServer apiServer;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfig();

        int historyLimit = getConfig().getInt("history-limit", 50);
        store = new DataStore(getDataFolder(), getLogger(), historyLimit);
        store.load();

        boolean trackBlocks = getConfig().getBoolean("track-blocks", true);
        Bukkit.getPluginManager().registerEvents(new StatsListener(store, trackBlocks), this);

        // 接続人数の移り変わり（サイトの「サーバーの様子」のグラフ用）
        online = new OnlineTracker(getDataFolder(), getLogger());
        online.load();
        long sampleTicks = Math.max(1, getConfig().getInt("online-sample-minutes", 5)) * 60L * 20L;
        Bukkit.getScheduler().runTaskTimer(this, online::sample, 100L, sampleTicks);

        // 国と土地の年表（戦争・外交）
        chronicle = new ChronicleStore(getDataFolder(), getLogger(), getConfig().getInt("chronicle-limit", 300));
        chronicle.load();

        // Vault（所持金）・Lands（所属タウン・国家図鑑・年表）は、入っていれば自動で連携する。
        // どちらも入っていなくても、このプラグイン自体は普通に動く。
        EconomyHook economyHook = new EconomyHook(getLogger());
        economyHook.setup();
        LandsHook landsHook = new LandsHook(this, getLogger());

        Supplier<String> landsSnapshot = () -> null;
        if (Bukkit.getPluginManager().getPlugin("Lands") != null) {
            try {
                long refreshTicks = Math.max(10, getConfig().getInt("lands-refresh-seconds", 60)) * 20L;
                landsSnapshot = LandsBridge.install(this, chronicle, getLogger(), refreshTicks);
            } catch (Throwable t) {
                getLogger().warning("[VivaStatsAPI] Landsとの連携（国家図鑑・年表）に失敗しました: " + t);
            }
        }

        String bindAddress = getConfig().getString("bind-address", "0.0.0.0");
        int port = getConfig().getInt("port", 45678);
        String token = getConfig().getString("token", "");

        apiServer = new ApiServer(store, getLogger(), token, historyLimit, this, economyHook, landsHook,
                online, chronicle, landsSnapshot);
        try {
            apiServer.start(bindAddress, port);
        } catch (IOException e) {
            getLogger().log(Level.SEVERE,
                    "[VivaStatsAPI] HTTPサーバーの起動に失敗しました。ポート " + port + " が他のプロセスで" +
                            "使われていないか確認してください。", e);
        }

        int saveIntervalTicks = Math.max(20, getConfig().getInt("save-interval-seconds", 300) * 20);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::saveAll,
                saveIntervalTicks, saveIntervalTicks);

        getLogger().info("[VivaStatsAPI] 有効化しました。");
    }

    private void saveAll() {
        if (store != null) {
            store.save();
        }
        if (online != null) {
            online.save();
        }
        if (chronicle != null) {
            chronicle.save();
        }
    }

    @Override
    public void onDisable() {
        if (apiServer != null) {
            apiServer.stop();
        }
        saveAll();
        getLogger().info("[VivaStatsAPI] 無効化しました。");
    }
}
