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

        boolean trackBlocks = getConfig().getBoolean("track-blocks", true);
        Bukkit.getPluginManager().registerEvents(new StatsListener(store, trackBlocks), this);

        // Vault（所持金）・Lands（所属タウン）は、入っていれば自動で連携する。
        // どちらも入っていなくても、このプラグイン自体は普通に動く。
        EconomyHook economyHook = new EconomyHook(getLogger());
        economyHook.setup();
        LandsHook landsHook = new LandsHook(this, getLogger());

        String bindAddress = getConfig().getString("bind-address", "0.0.0.0");
        int port = getConfig().getInt("port", 45678);
        String token = getConfig().getString("token", "");

        apiServer = new ApiServer(store, getLogger(), token, historyLimit, this, economyHook, landsHook);
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
