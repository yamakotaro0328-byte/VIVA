package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.RegisteredServiceProvider;

import java.lang.reflect.Method;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Vault経由で所持金（残高）を取得する。
 *
 * Vault本体をこのプラグインの依存に加えると、入っていないサーバーでも
 * jarに同梱／解決が必要になって面倒なので、ここでは実行時にリフレクションで
 * 呼び出す。Vaultが導入されていない、または経済プラグインが登録されて
 * いない環境でも、このクラスは黙って「取得できない」状態になるだけで、
 * プラグイン本体の起動やHTTP APIには影響しない。
 */
public class EconomyHook {

    private final Logger logger;
    private Object economy;               // net.milkbowl.vault.economy.Economy の実体
    private Method getBalanceMethod;

    public EconomyHook(Logger logger) {
        this.logger = logger;
    }

    /** @return Vaultの残高取得が使える状態になったら true */
    public boolean setup() {
        try {
            if (Bukkit.getPluginManager().getPlugin("Vault") == null) {
                return false;
            }
            Class<?> economyClass = Class.forName("net.milkbowl.vault.economy.Economy");
            RegisteredServiceProvider<?> rsp = Bukkit.getServicesManager().getRegistration(economyClass);
            if (rsp == null) {
                logger.info("[VivaStatsAPI] Vaultは入っていますが、経済プラグインが見つかりませんでした。"
                        + "所持金は0のまま表示されます。");
                return false;
            }
            economy = rsp.getProvider();
            getBalanceMethod = economyClass.getMethod("getBalance", OfflinePlayer.class);
            if (economy == null) {
                return false;
            }
            logger.info("[VivaStatsAPI] Vaultとの連携を有効化しました（所持金を取得します）。");
            return true;
        } catch (Throwable t) {
            // Vaultのバージョン差やクラス未検出などは、握りつぶして「使えない」扱いにする
            logger.log(Level.WARNING, "[VivaStatsAPI] Vaultとの連携に失敗しました（所持金は0のまま表示されます）", t);
            economy = null;
            getBalanceMethod = null;
            return false;
        }
    }

    public boolean isAvailable() {
        return economy != null && getBalanceMethod != null;
    }

    /**
     * 指定した名前の所持金を返す。呼び出しはBukkit APIに触れるため、
     * 必ずメインスレッドから呼ぶこと（ApiServer側でスケジューラ経由にしている）。
     */
    public double getBalance(String playerName) {
        if (!isAvailable() || playerName == null || playerName.isEmpty()) {
            return 0;
        }
        try {
            OfflinePlayer op = Bukkit.getOfflinePlayer(playerName);
            Object result = getBalanceMethod.invoke(economy, op);
            return result instanceof Number ? ((Number) result).doubleValue() : 0;
        } catch (Throwable t) {
            return 0;
        }
    }
}
