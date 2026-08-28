package net.vivamc.statsapi;

/**
 * 1人のプレイヤーの累計データ。
 * サーバー再起動をまたいでも、DataStoreがYAMLに保存・復元する。
 */
public class PlayerRecord {

    public String name;
    public long playerKillsTotal;
    public long mobKillsTotal;
    public long deathsTotal;

    /** これまでの合計プレイ時間（ミリ秒）。ログイン中の分は含まない。 */
    public long totalPlaytimeMs;

    /** 現在ログイン中なら、ログインした時刻（epochミリ秒）。ログアウト中は0。 */
    public long sessionStartMs;

    public PlayerRecord(String name) {
        this.name = name;
    }

    /** いま計測中のセッション分を含めた合計プレイ時間（ミリ秒） */
    public long currentTotalPlaytimeMs() {
        if (sessionStartMs <= 0) {
            return totalPlaytimeMs;
        }
        long sessionMs = System.currentTimeMillis() - sessionStartMs;
        if (sessionMs < 0) {
            sessionMs = 0;
        }
        return totalPlaytimeMs + sessionMs;
    }
}
