package net.vivamc.statsapi;

/** 「誰が・いつ・入った/出た」を表す1件の記録。接続履歴に使う。 */
public class HistoryEvent {

    public final String player;
    public final String type; // "join" または "quit"
    public final long timeMs;

    public HistoryEvent(String player, String type, long timeMs) {
        this.player = player;
        this.type = type;
        this.timeMs = timeMs;
    }
}
