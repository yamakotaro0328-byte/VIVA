package net.vivamc.statsapi;

import java.util.Collection;

/** 外部ライブラリを使わずにJSONを組み立てるための、小さな補助。 */
final class Json {

    private Json() {
    }

    static String str(String s) {
        if (s == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
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
        return sb.append('"').toString();
    }

    /** 整数値ならそのまま整数として、そうでなければ小数として出す。 */
    static String num(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) {
            return "0";
        }
        if (v == Math.rint(v) && Math.abs(v) < 9e15) {
            return Long.toString((long) v);
        }
        return Double.toString(Math.round(v * 100) / 100.0);
    }

    static String strArray(Collection<String> values) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (String v : values) {
            if (!first) {
                sb.append(',');
            }
            sb.append(str(v));
            first = false;
        }
        return sb.append(']').toString();
    }

    /** 名前に入っている色コード（§a や &a、&#RRGGBB）を取り除く。 */
    static String plain(String s) {
        if (s == null) {
            return "";
        }
        return s.replaceAll("(?i)[§&]x([§&][0-9a-f]){6}", "")
                .replaceAll("(?i)&#[0-9a-f]{6}", "")
                .replaceAll("(?i)[§&][0-9a-fk-or]", "")
                .replaceAll("<[^>]{1,40}>", "")
                .trim();
    }
}
