package net.vivamc.statsapi;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/** キル数・死亡数・プレイ時間・入退場を記録するリスナー。 */
public class StatsListener implements Listener {

    private final DataStore store;

    public StatsListener(DataStore store) {
        this.store = store;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        store.onJoin(p.getUniqueId(), p.getName());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player p = event.getPlayer();
        store.onQuit(p.getUniqueId(), p.getName());
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        store.onDeath(victim.getUniqueId(), victim.getName());

        Player killer = victim.getKiller();
        if (killer != null && !killer.getUniqueId().equals(victim.getUniqueId())) {
            store.onPlayerKill(killer.getUniqueId(), killer.getName());
        }
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        // プレイヤーの死亡は onPlayerDeath 側で処理済みなので、ここでは対象外にする
        if (event.getEntity() instanceof Player) {
            return;
        }
        Player killer = event.getEntity().getKiller();
        if (killer != null) {
            store.onMobKill(killer.getUniqueId(), killer.getName());
        }
    }
}
