package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.util.logging.Level;

public class VivaStatsAPI extends JavaPlugin {

    private DataStore store;
    private ApiServer apiServer;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfig();

        int historyLimit = getConfig().getInt("history-limit", 50);
        store = new DataStore(getDataFolder(), getLogger(), historyLimit);
        store.load();

        Bukkit.getPluginManager().registerEvents(new StatsListener(store), this);

        String bindAddress = getConfig().getString("bind-address", "0.0.0.0");
        int port = getConfig().getInt("port", 25566);
        String token = getConfig().getString("token", "");

        apiServer = new ApiServer(store, getLogger(), token, historyLimit);
        try {
            apiServer.start(bindAddress, port);
        } catch (IOException e) {
            getLogger().log(Level.SEVERE,
                    "[VivaStatsAPI] HTTPサーバーの起動に失敗しました。ポート " + port + " が他のプロセスで" +
                            "使われていないか確認してください。", e);
        }

        int saveIntervalTicks = Math.max(20, getConfig().getInt("save-interval-seconds", 300) * 20);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, () -> store.save(),
                saveIntervalTicks, saveIntervalTicks);

        getLogger().info("[VivaStatsAPI] 有効化しました。");
    }

    @Override
    public void onDisable() {
        if (apiServer != null) {
            apiServer.stop();
        }
        if (store != null) {
            store.save();
        }
        getLogger().info("[VivaStatsAPI] 無効化しました。");
    }
}
