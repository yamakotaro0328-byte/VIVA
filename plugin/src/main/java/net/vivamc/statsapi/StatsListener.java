package net.vivamc.statsapi;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/** キル数・死亡数・プレイ時間・入退場・設置/破壊ブロック数を記録するリスナー。 */
public class StatsListener implements Listener {

    private final DataStore store;
    private final boolean trackBlocks;

    public StatsListener(DataStore store, boolean trackBlocks) {
        this.store = store;
        this.trackBlocks = trackBlocks;
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

    @EventHandler(ignoreCancelled = true)
    public void onBlockPlace(BlockPlaceEvent event) {
        if (!trackBlocks) {
            return;
        }
        Player p = event.getPlayer();
        store.onBlockPlace(p.getUniqueId(), p.getName());
    }

    @EventHandler(ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        if (!trackBlocks) {
            return;
        }
        Player p = event.getPlayer();
        store.onBlockBreak(p.getUniqueId(), p.getName());
    }
}
