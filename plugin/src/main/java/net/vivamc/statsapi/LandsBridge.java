package net.vivamc.statsapi;

import me.angeschossen.lands.api.LandsIntegration;
import me.angeschossen.lands.api.events.LandDeleteEvent;
import me.angeschossen.lands.api.events.LandRenameEvent;
import me.angeschossen.lands.api.events.land.create.LandPostCreateEvent;
import me.angeschossen.lands.api.events.memberholder.MemberHolderRelationChangeEvent;
import me.angeschossen.lands.api.events.nation.edit.NationCreateEvent;
import me.angeschossen.lands.api.events.nation.edit.NationDeleteEvent;
import me.angeschossen.lands.api.events.nation.edit.NationRenameEvent;
import me.angeschossen.lands.api.events.nation.member.NationTrustLandEvent;
import me.angeschossen.lands.api.events.nation.member.NationUntrustLandEvent;
import me.angeschossen.lands.api.events.war.WarDeclareEvent;
import me.angeschossen.lands.api.events.war.WarEndEvent;
import me.angeschossen.lands.api.events.war.WarStartEvent;
import me.angeschossen.lands.api.land.Land;
import me.angeschossen.lands.api.memberholder.HolderType;
import me.angeschossen.lands.api.memberholder.MemberHolder;
import me.angeschossen.lands.api.nation.Nation;
import me.angeschossen.lands.api.relations.Relation;
import me.angeschossen.lands.api.war.ActiveWarStats;
import me.angeschossen.lands.api.war.War;
import me.angeschossen.lands.api.war.WarStats;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.logging.Logger;

/**
 * Lands と直接つながる部分（国家図鑑・年表）。
 *
 * このクラスは Lands のクラスを使うので、Lands が入っているときだけ読み込む
 * （VivaStatsAPI.java で「Lands があるか」を確かめてから new している）。
 * Lands のバージョンによって無いメソッドがあっても、その項目だけ空になるように
 * 1項目ずつ safe() で包んでいる。
 *
 * - 土地・国の一覧は、メインスレッドで一定間隔ごとに作ってJSONで持っておく
 *   （HTTPのスレッドからは、できあがった文字列を返すだけ）
 * - 宣戦布告・終戦・同盟・建国などは、イベントを受けて年表に書き足す
 */
public class LandsBridge implements Listener {

    private static final int MAX_MEMBER_NAMES = 100;

    private final LandsIntegration api;
    private final ChronicleStore chronicle;
    private final Logger logger;
    private volatile String snapshot = null;
    private volatile long snapshotAt = 0;
    private boolean warnedOnce;

    private LandsBridge(Plugin plugin, ChronicleStore chronicle, Logger logger) {
        this.api = LandsIntegration.of(plugin);
        this.chronicle = chronicle;
        this.logger = logger;
    }

    /**
     * Landsと連携を始める。一覧づくりの定期実行と、年表のイベント登録をして、
     * 「いまの一覧を返す関数」を返す（呼び出し側が Lands のクラスに触れずに済むように）。
     */
    public static Supplier<String> install(Plugin plugin, ChronicleStore chronicle, Logger logger, long refreshTicks) {
        LandsBridge bridge = new LandsBridge(plugin, chronicle, logger);
        // 起動直後は Lands の読み込みが終わっていないことがあるので、少し待ってから始める
        Bukkit.getScheduler().runTaskTimer(plugin, bridge::refresh, 200L, Math.max(200L, refreshTicks));
        try {
            Bukkit.getPluginManager().registerEvents(bridge, plugin);
            logger.info("[VivaStatsAPI] Landsの年表（戦争・外交）の記録を始めました。");
        } catch (Throwable t) {
            logger.warning("[VivaStatsAPI] このLandsのバージョンでは年表の記録ができません: " + t);
        }
        return bridge::getSnapshot;
    }

    /** できあがっている一覧（まだ無ければ null）。 */
    public String getSnapshot() {
        return snapshot;
    }

    public long getSnapshotAt() {
        return snapshotAt;
    }

    // ------------------------------------------------------------------
    // 一覧づくり（メインスレッドで呼ぶ）
    // ------------------------------------------------------------------
    public void refresh() {
        try {
            StringBuilder json = new StringBuilder(8192);
            json.append("{\"available\":true,\"updated\":").append(System.currentTimeMillis());

            // 土地
            json.append(",\"lands\":[");
            boolean first = true;
            List<War> wars = new ArrayList<>();
            Set<String> warIds = new HashSet<>();
            for (Land land : safeList(api::getLands, List.<Land>of())) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                json.append(holderJson(land));
                Nation nation = safe(land::getNation, null);
                json.append(",\"nation\":").append(Json.str(nation == null ? "" : name(nation)));
                json.append(",\"owner\":").append(Json.str(playerName(safe(land::getOwnerUID, null))));
                json.append('}');
                collectWar(safe(land::getWar, null), wars, warIds);
            }
            json.append(']');

            // 国
            json.append(",\"nations\":[");
            first = true;
            for (Nation nation : safeList(api::getNations, List.<Nation>of())) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                json.append(holderJson(nation));
                Land capital = safe(nation::getCapital, null);
                json.append(",\"capital\":").append(Json.str(capital == null ? "" : name(capital)));
                List<String> lands = new ArrayList<>();
                for (Land l : safeList(nation::getLands, List.<Land>of())) {
                    lands.add(name(l));
                }
                json.append(",\"lands\":").append(Json.strArray(lands));
                json.append(",\"leader\":").append(Json.str(playerName(safe(nation::getOwnerUID, null))));
                json.append('}');
                collectWar(safe(nation::getWar, null), wars, warIds);
            }
            json.append(']');

            // いま起きている戦争
            json.append(",\"wars\":[");
            first = true;
            for (War war : wars) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                json.append(warJson(war));
            }
            json.append("]}");

            snapshot = json.toString();
            snapshotAt = System.currentTimeMillis();
        } catch (Throwable t) {
            if (!warnedOnce) {
                warnedOnce = true;
                logger.warning("[VivaStatsAPI] Landsの土地・国の一覧を作れませんでした: " + t);
            }
        }
    }

    /** 土地と国で共通の項目。閉じカッコは呼び出し側でつける。 */
    private String holderJson(MemberHolder h) {
        StringBuilder sb = new StringBuilder(512);
        sb.append("{\"name\":").append(Json.str(name(h)));
        sb.append(",\"members\":").append(safe(h::getMembersAmount, 0));
        sb.append(",\"chunks\":").append(safe(h::getChunksAmount, 0));
        sb.append(",\"balance\":").append(Json.num(safe(h::getBalance, 0.0)));
        sb.append(",\"created\":").append(safe(h::getCreationTime, 0L));
        sb.append(",\"in_war\":").append(safe(h::isInWar, false));
        Object level = safe(h::getLevel, null);
        sb.append(",\"level\":").append(Json.str(level == null ? "" : Json.plain(safe(() -> h.getLevel().getName(), ""))));
        Integer color = safe(h::getWebMapFillColor, null);
        sb.append(",\"color\":").append(Json.str(color == null ? "" : String.format("#%06X", color & 0xFFFFFF)));

        List<String> allies = new ArrayList<>();
        for (MemberHolder m : safeList(h::getAllies, List.<MemberHolder>of())) {
            allies.add(name(m));
        }
        List<String> enemies = new ArrayList<>();
        for (MemberHolder m : safeList(h::getEnemies, List.<MemberHolder>of())) {
            enemies.add(name(m));
        }
        sb.append(",\"allies\":").append(Json.strArray(allies));
        sb.append(",\"enemies\":").append(Json.strArray(enemies));

        List<String> members = new ArrayList<>();
        for (UUID u : safeList(h::getTrustedPlayers, List.<UUID>of())) {
            if (members.size() >= MAX_MEMBER_NAMES) {
                break;
            }
            String n = playerName(u);
            if (!n.isEmpty()) {
                members.add(n);
            }
        }
        sb.append(",\"member_names\":").append(Json.strArray(members));

        WarStats st = safe(h::getStats, null);
        if (st != null) {
            sb.append(",\"war_stats\":{\"won\":").append(safe(st::getWon, 0))
                    .append(",\"lost\":").append(safe(st::getLost, 0))
                    .append(",\"kills\":").append(safe(st::getKills, 0))
                    .append(",\"deaths\":").append(safe(st::getDeaths, 0))
                    .append(",\"captures\":").append(safe(st::getCaptures, 0))
                    .append('}');
        }
        return sb.toString();
    }

    private void collectWar(War war, List<War> wars, Set<String> ids) {
        if (war == null) {
            return;
        }
        String id = safe(() -> String.valueOf(war.getULID()), String.valueOf(System.identityHashCode(war)));
        if (ids.add(id)) {
            wars.add(war);
        }
    }

    private String warJson(War war) {
        MemberHolder att = safe(war::getAttacker, null);
        MemberHolder def = safe(war::getDefender, null);
        ActiveWarStats as = safe(war::getAttackerStats, null);
        ActiveWarStats ds = safe(war::getDefenderStats, null);
        java.sql.Timestamp started = safe(war::getStarted, null);
        Object state = safe(war::getState, null);
        return "{\"attacker\":" + Json.str(att == null ? "" : name(att))
                + ",\"attacker_kind\":" + Json.str(kind(att))
                + ",\"defender\":" + Json.str(def == null ? "" : name(def))
                + ",\"defender_kind\":" + Json.str(kind(def))
                + ",\"state\":" + Json.str(state == null ? "" : state.toString())
                + ",\"started\":" + (started == null ? 0 : started.getTime())
                + ",\"time_left\":" + safe(war::getTimeLeft, 0L)
                + ",\"points_to_win\":" + Json.num(safe(war::getPointsToWin, 0f))
                + ",\"attacker_points\":" + (as == null ? 0 : safe(as::getPoints, 0))
                + ",\"defender_points\":" + (ds == null ? 0 : safe(ds::getPoints, 0))
                + ",\"attacker_kills\":" + (as == null ? 0 : safe(as::getKills, 0))
                + ",\"defender_kills\":" + (ds == null ? 0 : safe(ds::getKills, 0))
                + "}";
    }

    // ------------------------------------------------------------------
    // 年表（イベント）
    // ------------------------------------------------------------------
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onWarDeclare(WarDeclareEvent e) {
        chronicle.add("war_declare", name(e.getAttacker()), kind(e.getAttacker()),
                name(e.getDefender()), kind(e.getDefender()), "");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onWarStart(WarStartEvent e) {
        War w = e.getWar();
        MemberHolder a = safe(w::getAttacker, null);
        MemberHolder d = safe(w::getDefender, null);
        chronicle.add("war_start", name(a), kind(a), name(d), kind(d), "");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onWarEnd(WarEndEvent e) {
        MemberHolder winner = safe(e::getWinner, null);
        MemberHolder loser = safe(e::getLoser, null);
        Object result = safe(e::getResult, null);
        if (winner == null || loser == null) {
            War w = e.getWar();
            winner = safe(w::getAttacker, null);
            loser = safe(w::getDefender, null);
        }
        chronicle.add("war_end", name(winner), kind(winner), name(loser), kind(loser),
                result == null ? "" : result.toString());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onRelation(MemberHolderRelationChangeEvent e) {
        Relation now = e.getNewRelation();
        Relation before = e.getCurrentRelation();
        String type;
        if (now == Relation.ALLY) {
            type = "ally";
        } else if (now == Relation.ENEMY) {
            type = "enemy";
        } else if (before == Relation.ALLY) {
            type = "ally_end";
        } else if (before == Relation.ENEMY) {
            type = "enemy_end";
        } else {
            return;
        }
        MemberHolder a = e.getMemberHolder();
        MemberHolder b = e.getTarget();
        chronicle.add(type, name(a), kind(a), name(b), kind(b), "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onNationCreate(NationCreateEvent e) {
        Nation n = e.getNation();
        Land capital = safe(n::getCapital, null);
        chronicle.add("nation_create", name(n), "nation", capital == null ? "" : name(capital), "land", "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onNationDelete(NationDeleteEvent e) {
        Object reason = safe(e::getReason, null);
        chronicle.add("nation_delete", name(e.getNation()), "nation", "", "",
                reason == null ? "" : reason.toString());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onNationJoin(NationTrustLandEvent e) {
        chronicle.add("nation_join", name(e.getLand()), "land", name(e.getNation()), "nation", "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onNationLeave(NationUntrustLandEvent e) {
        Object reason = safe(e::getReason, null);
        chronicle.add("nation_leave", name(e.getLand()), "land", name(e.getNation()), "nation",
                reason == null ? "" : reason.toString());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onLandCreate(LandPostCreateEvent e) {
        chronicle.add("land_create", name(e.getLand()), "land", "", "", "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLandDelete(LandDeleteEvent e) {
        Object reason = safe(e::getReason, null);
        chronicle.add("land_delete", name(e.getLand()), "land", "", "",
                reason == null ? "" : reason.toString());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLandRename(LandRenameEvent e) {
        chronicle.add("rename", Json.plain(e.getCurrentName()), "land", Json.plain(e.getNewName()), "land", "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onNationRename(NationRenameEvent e) {
        chronicle.add("rename", Json.plain(e.getCurrentName()), "nation", Json.plain(e.getNewName()), "nation", "");
    }

    // ------------------------------------------------------------------
    // 補助
    // ------------------------------------------------------------------
    private static String name(MemberHolder h) {
        if (h == null) {
            return "";
        }
        return Json.plain(safe(h::getName, ""));
    }

    private static String kind(MemberHolder h) {
        if (h == null) {
            return "";
        }
        HolderType t = safe(h::getType, null);
        if (t == HolderType.NATION || h instanceof Nation) {
            return "nation";
        }
        return "land";
    }

    private static String playerName(UUID uuid) {
        if (uuid == null) {
            return "";
        }
        OfflinePlayer p = Bukkit.getOfflinePlayer(uuid);
        String n = p.getName();
        return n == null ? "" : n;
    }

    /** Landsのバージョン違いでメソッドが無い・例外が出るときは既定値を返す。 */
    private static <T> T safe(Supplier<T> s, T def) {
        try {
            T v = s.get();
            return v == null ? def : v;
        } catch (Throwable t) {
            return def;
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Collection<T> safeList(Supplier<? extends Collection<? extends T>> s, Collection<T> def) {
        try {
            Collection<? extends T> v = s.get();
            return v == null ? def : (Collection<T>) v;
        } catch (Throwable t) {
            return def;
        }
    }
}
