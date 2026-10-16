package net.vivamc.statsapi;

import org.bukkit.Bukkit;
import org.bukkit.event.Event;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.util.logging.Logger;

/**
 * Votifier（NuVotifier）が受け取った投票を、VoteStore に数える。
 * Votifier はビルドに含めず、入っているときだけ実行時に見つけて使う。
 */
public final class VoteHook {

    private VoteHook() {
    }

    @SuppressWarnings("unchecked")
    public static boolean install(Plugin plugin, VoteStore store, Logger logger) {
        Plugin votifier = Bukkit.getPluginManager().getPlugin("Votifier");
        if (votifier == null) {
            votifier = Bukkit.getPluginManager().getPlugin("NuVotifier");
        }
        if (votifier == null) {
            logger.info("[VivaStatsAPI] Votifier が無いので、投票は数えません。");
            return false;
        }
        try {
            Class<?> raw = Class.forName("com.vexsoftware.votifier.model.VotifierEvent", true,
                    votifier.getClass().getClassLoader());
            Class<? extends Event> eventClass = (Class<? extends Event>) raw.asSubclass(Event.class);
            Method getVote = raw.getMethod("getVote");
            Listener owner = new Listener() { };
            Bukkit.getPluginManager().registerEvent(eventClass, owner, EventPriority.MONITOR, (l, ev) -> {
                if (!eventClass.isInstance(ev)) {
                    return;
                }
                try {
                    Object vote = getVote.invoke(ev);
                    Object user = vote.getClass().getMethod("getUsername").invoke(vote);
                    store.add(user == null ? null : user.toString().trim());
                } catch (ReflectiveOperationException ex) {
                    logger.warning("[VivaStatsAPI] 投票を読み取れませんでした: " + ex);
                }
            }, plugin);
            logger.info("[VivaStatsAPI] Votifier の投票を数え始めました。");
            return true;
        } catch (Throwable t) {
            logger.warning("[VivaStatsAPI] Votifier との連携に失敗しました: " + t);
            return false;
        }
    }
}
