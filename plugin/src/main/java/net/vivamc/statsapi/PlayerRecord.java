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
    public long blocksPlacedTotal;
    public long blocksBrokenTotal;

    /** 参加した回数（ログインのたびに1増える） */
    public long loginCount;

    /** 初めて参加した時刻（epochミリ秒）。まだ一度も記録が無ければ0。 */
    public long firstSeenMs;

    /** 最後に参加／退出した時刻（epochミリ秒）。まだ一度も記録が無ければ0。 */
    public long lastSeenMs;

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

    /**
     * 外に渡しても内部の状態を書き換えられないよう、値だけをコピーした
     * 新しいインスタンスを作る。ランキングや一覧のように、複数件を
     * ロックの外へ持ち出して並び替えたいときに使う。
     */
    public PlayerRecord copy() {
        PlayerRecord c = new PlayerRecord(name);
        c.playerKillsTotal = playerKillsTotal;
        c.mobKillsTotal = mobKillsTotal;
        c.deathsTotal = deathsTotal;
        c.blocksPlacedTotal = blocksPlacedTotal;
        c.blocksBrokenTotal = blocksBrokenTotal;
        c.loginCount = loginCount;
        c.firstSeenMs = firstSeenMs;
        c.lastSeenMs = lastSeenMs;
        c.totalPlaytimeMs = currentTotalPlaytimeMs(); // ログイン中の分も含めて確定させる
        c.sessionStartMs = 0;
        return c;
    }
}
