package net.vivamc.statsapi;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.logging.Logger;

/**
 * 公式サイトの VIVA Portal に「通知を送って」と頼む。
 * サイト側（/api/push?action=notify）が、通知をオンにしている人の端末へまとめて送る。
 *
 * サイトに送るときは config.yml の token を合言葉にする（サイトの環境変数
 * VIVA_STATS_API_TOKEN と同じ値）。token が空なら、通知は送らない。
 */
public class PushNotifier {

    private final String endpoint;
    private final String token;
    private final Logger logger;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public PushNotifier(String siteUrl, String token, Logger logger) {
        String base = siteUrl == null ? "" : siteUrl.trim().replaceAll("/+$", "");
        this.endpoint = base.isEmpty() ? "" : base + "/api/push?action=notify";
        this.token = token == null ? "" : token.trim();
        this.logger = logger;
    }

    public boolean isEnabled() {
        return !endpoint.isEmpty() && !token.isEmpty();
    }

    /** 別スレッドで送る（サーバーの動きを止めない）。失敗してもログに残すだけ。 */
    public void send(String topic, String title, String body, String url) {
        if (!isEnabled()) {
            return;
        }
        String json = "{\"topic\":" + Json.str(topic)
                + ",\"title\":" + Json.str(title)
                + ",\"body\":" + Json.str(body)
                + ",\"url\":" + Json.str(url) + "}";
        HttpRequest req = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
        http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> {
                    if (r.statusCode() >= 300) {
                        logger.warning("[VivaStatsAPI] 通知の依頼に失敗しました（" + r.statusCode() + "）: " + r.body());
                    }
                })
                .exceptionally(e -> {
                    logger.warning("[VivaStatsAPI] 通知の依頼でサイトにつながりませんでした: " + e);
                    return null;
                });
    }

    /** 年表に書かれた出来事のうち、戦争の始まりだけを通知する。 */
    public void onChronicle(ChronicleStore.Entry e) {
        if ("war_declare".equals(e.type)) {
            send("war", "宣戦布告", "「" + e.a + "」が「" + e.b + "」に宣戦布告しました。", "/chronicle.html");
        } else if ("war_start".equals(e.type)) {
            send("war", "開戦", "「" + e.a + "」と「" + e.b + "」の戦争が始まりました。", "/nations.html");
        }
    }
}
