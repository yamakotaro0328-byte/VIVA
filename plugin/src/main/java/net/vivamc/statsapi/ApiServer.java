package net.vivamc.statsapi;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.ToDoubleFunction;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * サイト（Vercelの中継関数）から呼ばれる、ごく小さなHTTP API。
 * 外部ライブラリを使わず、JDK同梱の HttpServer だけで動く。
 *
 *   GET /v1/player?player=<名前>
 *   GET /v1/history?limit=<件数>
 *   GET /v1/ranking?type=<種類>&limit=<件数>&order=desc|asc
 *   GET /v1/players?query=<部分一致>&limit=<件数>&offset=<開始位置>
 */
public class ApiServer {

    private static final Set<String> RANKING_TYPES = new HashSet<>(Arrays.asList(
            "player_kills", "mob_kills", "deaths", "playtime",
            "blocks_placed", "blocks_broken", "balance"));

    private final DataStore store;
    private final Logger logger;
    private final String token;
    private final int historyLimit;
    private final Plugin plugin;
    private final EconomyHook economyHook;
    private final LandsHook landsHook;

    private HttpServer server;

    public ApiServer(DataStore store, Logger logger, String token, int historyLimit,
                      Plugin plugin, EconomyHook economyHook, LandsHook landsHook) {
        this.store = store;
        this.logger = logger;
        this.token = token == null ? "" : token.trim();
        this.historyLimit = historyLimit;
        this.plugin = plugin;
        this.economyHook = economyHook;
        this.landsHook = landsHook;
    }

    public void start(String bindAddress, int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(bindAddress, port), 0);
        server.createContext("/v1/player", this::handlePlayer);
        server.createContext("/v1/history", this::handleHistory);
        server.createContext("/v1/ranking", this::handleRanking);
        server.createContext("/v1/players", this::handlePlayers);
        // 専用のスレッドプールで動かし、Bukkitのメインスレッドは一切ブロックしない
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        logger.info("[VivaStatsAPI] HTTP APIを " + bindAddress + ":" + port + " で待ち受けます");
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private boolean checkAuth(HttpExchange ex) {
        if (token.isEmpty()) {
            return true;
        }
        List<String> auth = ex.getRequestHeaders().get("Authorization");
        String expected = "Bearer " + token;
        return auth != null && auth.contains(expected);
    }

    // ---------------------------------------------------------------
    // /v1/player?player=<名前>
    // ---------------------------------------------------------------
    private void handlePlayer(HttpExchange ex) throws IOException {
        try {
            if (!checkAuth(ex)) {
                sendJson(ex, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            String name = queryParam(ex.getRequestURI(), "player");
            if (name == null || name.isEmpty()) {
                sendJson(ex, 400, "{\"error\":\"player parameter is required\"}");
                return;
            }
            PlayerRecord r = store.findByName(name);
            if (r == null) {
                sendJson(ex, 404, "{\"error\":\"not found\"}");
                return;
            }

            // 所持金(Vault)・所属タウン(Lands)は、実際のプラグインと連携して取る。
            // どちらも入っていない／取得に失敗した場合は 0 / 空文字になるだけで、
            // 例外にはならない。
            double balance = resolveBalance(r.name);
            String town = resolveTown(r.name);

            StringBuilder json = new StringBuilder();
            json.append("{");
            json.append("\"player\":").append(jsonString(r.name)).append(",");
            json.append("\"kill_data\":{");
            json.append("\"player_kills_total\":").append(r.playerKillsTotal).append(",");
            json.append("\"mob_kills_total\":").append(r.mobKillsTotal).append(",");
            json.append("\"deaths_total\":").append(r.deathsTotal).append(",");
            json.append("\"blocks_placed_total\":").append(r.blocksPlacedTotal).append(",");
            json.append("\"blocks_broken_total\":").append(r.blocksBrokenTotal);
            json.append("},");
            json.append("\"active_playtime\":").append(r.totalPlaytimeMs).append(",");
            json.append("\"login_count\":").append(r.loginCount).append(",");
            json.append("\"first_join\":").append(r.firstSeenMs).append(",");
            json.append("\"last_seen\":").append(r.lastSeenMs).append(",");
            // 「name":"balance"」「tableName":"lands"」というキーの形は
            // サイト側(script.js)が文字列検索で拾っているので、そのままにしておくこと。
            json.append("\"stats\":[");
            json.append("{\"name\":\"balance\",\"value\":").append(formatNumber(balance)).append("}");
            json.append(",{\"tableName\":\"lands\",\"value\":").append(jsonString(town)).append("}");
            json.append("]");
            json.append("}");

            sendJson(ex, 200, json.toString());
        } catch (Exception e) {
            logger.log(Level.WARNING, "[VivaStatsAPI] /v1/player の処理中にエラー", e);
            sendJson(ex, 500, "{\"error\":\"internal error\"}");
        }
    }

    // ---------------------------------------------------------------
    // /v1/history?limit=<件数>
    // ---------------------------------------------------------------
    private void handleHistory(HttpExchange ex) throws IOException {
        try {
            if (!checkAuth(ex)) {
                sendJson(ex, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            int limit = parseIntParam(ex, "limit", historyLimit, 1, historyLimit);

            StringBuilder json = new StringBuilder();
            json.append("{\"events\":[");
            List<HistoryEvent> events = store.recentHistory(limit);
            for (int i = 0; i < events.size(); i++) {
                HistoryEvent ev = events.get(i);
                if (i > 0) {
                    json.append(",");
                }
                json.append("{");
                json.append("\"player\":").append(jsonString(ev.player)).append(",");
                json.append("\"type\":").append(jsonString(ev.type)).append(",");
                json.append("\"time\":").append(ev.timeMs);
                json.append("}");
            }
            json.append("]}");

            sendJson(ex, 200, json.toString());
        } catch (Exception e) {
            logger.log(Level.WARNING, "[VivaStatsAPI] /v1/history の処理中にエラー", e);
            sendJson(ex, 500, "{\"error\":\"internal error\"}");
        }
    }

    // ---------------------------------------------------------------
    // /v1/ranking?type=<種類>&limit=<件数>&order=desc|asc
    // ---------------------------------------------------------------
    private void handleRanking(HttpExchange ex) throws IOException {
        try {
            if (!checkAuth(ex)) {
                sendJson(ex, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            String type = queryParam(ex.getRequestURI(), "type");
            if (type == null || type.isEmpty()) {
                type = "player_kills";
            }
            if (!RANKING_TYPES.contains(type)) {
                sendJson(ex, 400, "{\"error\":\"unknown type\",\"allowed\":[" + joinQuoted(RANKING_TYPES) + "]}");
                return;
            }
            int limit = parseIntParam(ex, "limit", 10, 1, 100);
            boolean asc = "asc".equalsIgnoreCase(queryParam(ex.getRequestURI(), "order"));

            List<PlayerRecord> all = store.copyAll();
            all.removeIf(r -> r.name == null || r.name.isEmpty());

            Map<String, Double> balances = Collections.emptyMap();
            if ("balance".equals(type)) {
                List<String> names = new ArrayList<>(all.size());
                for (PlayerRecord r : all) {
                    names.add(r.name);
                }
                balances = resolveBalances(names);
            }
            final Map<String, Double> balancesFinal = balances;
            final String finalType = type;

            ToDoubleFunction<PlayerRecord> valueOf = r -> {
                switch (finalType) {
                    case "player_kills": return r.playerKillsTotal;
                    case "mob_kills": return r.mobKillsTotal;
                    case "deaths": return r.deathsTotal;
                    case "playtime": return r.totalPlaytimeMs;
                    case "blocks_placed": return r.blocksPlacedTotal;
                    case "blocks_broken": return r.blocksBrokenTotal;
                    case "balance": {
                        Double v = balancesFinal.get(r.name);
                        return v == null ? 0 : v;
                    }
                    default: return 0;
                }
            };

            Comparator<PlayerRecord> cmp = (a, b) -> Double.compare(valueOf.applyAsDouble(a), valueOf.applyAsDouble(b));
            all.sort(asc ? cmp : cmp.reversed());

            StringBuilder json = new StringBuilder();
            json.append("{\"type\":").append(jsonString(type)).append(",\"ranking\":[");
            int rank = 0;
            for (PlayerRecord r : all) {
                if (rank >= limit) {
                    break;
                }
                rank++;
                if (rank > 1) {
                    json.append(",");
                }
                json.append("{\"rank\":").append(rank)
                        .append(",\"player\":").append(jsonString(r.name))
                        .append(",\"value\":").append(formatNumber(valueOf.applyAsDouble(r)))
                        .append("}");
            }
            json.append("]}");

            sendJson(ex, 200, json.toString());
        } catch (Exception e) {
            logger.log(Level.WARNING, "[VivaStatsAPI] /v1/ranking の処理中にエラー", e);
            sendJson(ex, 500, "{\"error\":\"internal error\"}");
        }
    }

    // ---------------------------------------------------------------
    // /v1/players?query=<部分一致>&limit=<件数>&offset=<開始位置>
    // ---------------------------------------------------------------
    private void handlePlayers(HttpExchange ex) throws IOException {
        try {
            if (!checkAuth(ex)) {
                sendJson(ex, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            String query = queryParam(ex.getRequestURI(), "query");
            int limit = parseIntParam(ex, "limit", 20, 1, 200);
            int offset = parseIntParam(ex, "offset", 0, 0, Integer.MAX_VALUE);

            List<PlayerRecord> all = store.copyAll();
            all.removeIf(r -> r.name == null || r.name.isEmpty());
            if (query != null && !query.isEmpty()) {
                String q = query.toLowerCase(Locale.ROOT);
                all.removeIf(r -> !r.name.toLowerCase(Locale.ROOT).contains(q));
            }
            all.sort(Comparator.comparing(r -> r.name, String.CASE_INSENSITIVE_ORDER));

            int total = all.size();
            int from = Math.min(offset, total);
            int to = Math.min(offset + limit, total);
            List<PlayerRecord> page = all.subList(from, to);

            StringBuilder json = new StringBuilder();
            json.append("{\"total\":").append(total).append(",\"players\":[");
            for (int i = 0; i < page.size(); i++) {
                PlayerRecord r = page.get(i);
                if (i > 0) {
                    json.append(",");
                }
                json.append("{");
                json.append("\"player\":").append(jsonString(r.name)).append(",");
                json.append("\"player_kills_total\":").append(r.playerKillsTotal).append(",");
                json.append("\"mob_kills_total\":").append(r.mobKillsTotal).append(",");
                json.append("\"deaths_total\":").append(r.deathsTotal).append(",");
                json.append("\"blocks_placed_total\":").append(r.blocksPlacedTotal).append(",");
                json.append("\"blocks_broken_total\":").append(r.blocksBrokenTotal).append(",");
                json.append("\"active_playtime\":").append(r.totalPlaytimeMs).append(",");
                json.append("\"last_seen\":").append(r.lastSeenMs);
                json.append("}");
            }
            json.append("]}");

            sendJson(ex, 200, json.toString());
        } catch (Exception e) {
            logger.log(Level.WARNING, "[VivaStatsAPI] /v1/players の処理中にエラー", e);
            sendJson(ex, 500, "{\"error\":\"internal error\"}");
        }
    }

    // ---------------------------------------------------------------
    // Vault / Lands 連携（必ずメインスレッド経由で呼ぶ）
    // ---------------------------------------------------------------

    /**
     * BukkitのAPI（OfflinePlayerの解決や、Vault/LandsのAPI呼び出し）は
     * メインスレッド以外から呼ぶのが保証されていないため、実際の呼び出しは
     * スケジューラでメインスレッドに渡し、結果をここで（タイムアウト付きで）待つ。
     * 失敗・タイムアウト時はデフォルト値を返すだけで、HTTPの応答は止めない。
     */
    private <T> T runSync(Callable<T> task, T fallback, long timeoutMs) {
        if (plugin == null || !plugin.isEnabled()) {
            return fallback;
        }
        try {
            Future<T> future = Bukkit.getScheduler().callSyncMethod(plugin, task);
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            return fallback;
        }
    }

    private double resolveBalance(String playerName) {
        if (economyHook == null) {
            return 0;
        }
        return runSync(() -> economyHook.getBalance(playerName), 0.0, 1500);
    }

    private String resolveTown(String playerName) {
        if (landsHook == null) {
            return "";
        }
        return runSync(() -> landsHook.getTownNameByName(playerName), "", 1500);
    }

    /** ランキングで balance を使うときだけ、対象者をまとめて1回のメインスレッド往復で解決する。 */
    private Map<String, Double> resolveBalances(List<String> names) {
        if (economyHook == null || names.isEmpty()) {
            return Collections.emptyMap();
        }
        return runSync(() -> {
            Map<String, Double> out = new HashMap<>();
            for (String n : names) {
                out.put(n, economyHook.getBalance(n));
            }
            return out;
        }, Collections.emptyMap(), 4000);
    }

    // ---------------------------------------------------------------
    // 補助メソッド
    // ---------------------------------------------------------------

    private void sendJson(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String queryParam(URI uri, String key) {
        String query = uri.getRawQuery();
        if (query == null) {
            return null;
        }
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                continue;
            }
            String k = java.net.URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            if (k.equals(key)) {
                return java.net.URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static int parseIntParam(HttpExchange ex, String key, int def, int min, int max) {
        String v = queryParam(ex.getRequestURI(), key);
        if (v == null || v.isEmpty()) {
            return def;
        }
        try {
            int n = Integer.parseInt(v.trim());
            return Math.max(min, Math.min(max, n));
        } catch (NumberFormatException e) {
            return def;
        }
    }

    /** 整数値ならそのまま整数として、そうでなければ小数として出す（残高向け）。 */
    private static String formatNumber(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) {
            return "0";
        }
        if (v == Math.rint(v)) {
            return Long.toString((long) v);
        }
        return Double.toString(v);
    }

    private static String joinQuoted(Set<String> values) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (String v : values) {
            if (!first) {
                sb.append(",");
            }
            sb.append(jsonString(v));
            first = false;
        }
        return sb.toString();
    }

    private static String jsonString(String s) {
        if (s == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append("\"");
        return sb.toString();
    }
}
