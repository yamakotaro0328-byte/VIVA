package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.util.Collection;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Lands プラグイン（土地・タウン管理。「所属タウン」の項目はこれから取る）
 * と連携して、プレイヤーが所属している土地（タウン）の名前を取得する。
 *
 * LandsAPIはバージョンによってクラス名・メソッド名が変わることがあり、
 * かつビルド時にLandsAPIのjarを解決できる保証がこの環境には無いため、
 * ここでは実行時にリフレクションで「それらしいメソッド」を順番に試す。
 * どれも見つからない／失敗した場合は空文字を返すだけで、プラグイン本体は
 * 問題なく動き続ける（サイト側は自動で「未所属」と表示する）。
 *
 * もし手元のLandsのバージョンで所属タウンがうまく取れない場合は、
 * ログに出る警告と、実際にサーバーへ入っているLandsAPIのメソッド名を
 * 見比べて、下の candidates 配列に候補を足してください。
 */
public class LandsHook {

    private final Logger logger;
    private Object landsIntegration; // me.angeschossen.lands.api.LandsIntegration の実体
    private boolean available;

    public LandsHook(Plugin plugin, Logger logger) {
        this.logger = logger;
        setup(plugin);
    }

    private void setup(Plugin plugin) {
        try {
            if (Bukkit.getPluginManager().getPlugin("Lands") == null) {
                available = false;
                return;
            }
            Class<?> integrationClass = Class.forName("me.angeschossen.lands.api.LandsIntegration");
            Object instance;
            try {
                // 比較的新しいバージョン: static of(Plugin)
                Method of = integrationClass.getMethod("of", Plugin.class);
                instance = of.invoke(null, plugin);
            } catch (NoSuchMethodException e1) {
                // 古いバージョン: コンストラクタ(Plugin)
                instance = integrationClass.getConstructor(Plugin.class).newInstance(plugin);
            }
            landsIntegration = instance;
            available = landsIntegration != null;
            if (available) {
                logger.info("[VivaStatsAPI] Landsとの連携を有効化しました（所属タウンを取得します）。");
            }
        } catch (Throwable t) {
            available = false;
            landsIntegration = null;
            logger.log(Level.WARNING, "[VivaStatsAPI] Landsとの連携に失敗しました"
                    + "（所属タウンは「未所属」のまま表示されます）: " + t);
        }
    }

    public boolean isAvailable() {
        return available && landsIntegration != null;
    }

    /**
     * 名前からタウン名を取得する。呼び出しはBukkit/LandsのAPIに触れるため、
     * 必ずメインスレッドから呼ぶこと（ApiServer側でスケジューラ経由にしている）。
     */
    public String getTownNameByName(String playerName) {
        if (!isAvailable() || playerName == null || playerName.isEmpty()) {
            return "";
        }
        try {
            UUID uuid = Bukkit.getOfflinePlayer(playerName).getUniqueId();
            return getTownName(uuid);
        } catch (Throwable t) {
            return "";
        }
    }

    private String getTownName(UUID uuid) {
        try {
            Object landPlayer = invokeWithUuid(landsIntegration, uuid,
                    "getLandPlayer");
            if (landPlayer == null) {
                return "";
            }
            // 「選択中の土地」「所有している土地」など、バージョンによって
            // メソッド名が違うので、単体を返すものをいくつか試す
            Object land = invokeNoArg(landPlayer, "getSelectedLand", "getLandOwner", "getLand");
            if (land == null) {
                // 複数返すバージョン向け（最初の1件を使う）
                Object lands = invokeNoArg(landPlayer, "getLandsOwner", "getLands");
                if (lands instanceof Collection) {
                    Collection<?> c = (Collection<?>) lands;
                    if (!c.isEmpty()) {
                        land = c.iterator().next();
                    }
                }
            }
            if (land == null) {
                return "";
            }
            Object name = invokeNoArg(land, "getName");
            return name == null ? "" : name.toString();
        } catch (Throwable t) {
            return "";
        }
    }

    private Object invokeWithUuid(Object target, UUID arg, String... methodNames) {
        for (String m : methodNames) {
            try {
                Method method = target.getClass().getMethod(m, UUID.class);
                return method.invoke(target, arg);
            } catch (NoSuchMethodException ignored) {
                // 次の候補を試す
            } catch (Throwable t) {
                return null;
            }
        }
        return null;
    }

    private Object invokeNoArg(Object target, String... methodNames) {
        for (String m : methodNames) {
            try {
                Method method = target.getClass().getMethod(m);
                return method.invoke(target);
            } catch (NoSuchMethodException ignored) {
                // 次の候補を試す
            } catch (Throwable t) {
                return null;
            }
        }
        return null;
    }
}
