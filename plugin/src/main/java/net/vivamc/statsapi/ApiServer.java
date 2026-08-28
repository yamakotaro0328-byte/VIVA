package net.vivamc.statsapi;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * サイト（Vercelの中継関数）から呼ばれる、ごく小さなHTTP API。
 * 外部ライブラリを使わず、JDK同梱の HttpServer だけで動く。
 *
 *   GET /v1/player?player=<名前>
 *   GET /v1/history?limit=<件数>
 */
public class ApiServer {

    private final DataStore store;
    private final Logger logger;
    private final String token;
    private final int historyLimit;

    private HttpServer server;

    public ApiServer(DataStore store, Logger logger, String token, int historyLimit) {
        this.store = store;
        this.logger = logger;
        this.token = token == null ? "" : token.trim();
        this.historyLimit = historyLimit;
    }

    public void start(String bindAddress, int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(bindAddress, port), 0);
        server.createContext("/v1/player", this::handlePlayer);
        server.createContext("/v1/history", this::handleHistory);
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

            StringBuilder json = new StringBuilder();
            json.append("{");
            json.append("\"player\":").append(jsonString(r.name)).append(",");
            json.append("\"kill_data\":{");
            json.append("\"player_kills_total\":").append(r.playerKillsTotal).append(",");
            json.append("\"mob_kills_total\":").append(r.mobKillsTotal).append(",");
            json.append("\"deaths_total\":").append(r.deathsTotal);
            json.append("},");
            json.append("\"active_playtime\":").append(r.totalPlaytimeMs).append(",");
            // 所持金・所属タウンは、経済/土地プラグインと接続していないため、
            // いまは空のまま返す（サイト側は自動で「$0」「未所属」と表示する）
            json.append("\"stats\":[");
            json.append("{\"name\":\"balance\",\"value\":0}");
            json.append(",{\"tableName\":\"lands\",\"value\":\"\"}");
            json.append("]");
            json.append("}");

            sendJson(ex, 200, json.toString());
        } catch (Exception e) {
            logger.log(Level.WARNING, "[VivaStatsAPI] /v1/player の処理中にエラー", e);
            sendJson(ex, 500, "{\"error\":\"internal error\"}");
        }
    }

    private void handleHistory(HttpExchange ex) throws IOException {
        try {
            if (!checkAuth(ex)) {
                sendJson(ex, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            int limit = historyLimit;
            String limitParam = queryParam(ex.getRequestURI(), "limit");
            if (limitParam != null) {
                try {
                    limit = Math.max(1, Math.min(historyLimit, Integer.parseInt(limitParam)));
                } catch (NumberFormatException ignored) {
                    // 不正な値は無視して既定値を使う
                }
            }

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
