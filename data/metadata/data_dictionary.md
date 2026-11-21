# Data Dictionary — 鹿帝国プロジェクト（Deer Empire NARA）

`data/processed/municipalities_master.csv` / `municipalities_master.json` / `nara_empire_map.geojson` に含まれる全属性の定義です。

## 1. 基本属性・人間人口・土地統計（証拠区分 A）

| カラム名 | 型 | 単位 | 基準年月日 | 定義・出典 |
| :--- | :--- | :--- | :--- | :--- |
| `jis_code` | string | — | — | 総務省 全国地方公共団体コード（5桁：`29201`〜`29453`） |
| `name_ja` | string | — | — | 市町村名（奈良県全39市町村：12市15町12村） |
| `name_kana` | string | — | — | 市町村名よみがな |
| `municipality_type` | string | — | — | 自治体種別（`市` / `町` / `村`） |
| `district_or_area` | string | — | — | 所属郡・市部区分（`市部`, `山辺郡`, `生駒郡`, `磯城郡`, `宇陀郡`, `高市郡`, `北葛城郡`, `吉野郡`） |
| `region_block` | string | — | — | 奈良県ニホンジカ管理計画等に準拠した地域ブロック（`北西部`, `東部`, `南部`, `東部・北西部`） |
| `human_pop` | integer | 人 | 2026-10-01 | 奈良県推計人口調査（令和8年10月1日現在）。県計 `1,263,770人` |
| `human_pop_2020` | integer | 人 | 2020-10-01 | 令和2年国勢調査人口。5〜6年間人口増減率の基準 |
| `pop_change_pct_2020_2026` | float | % | 2020→2026 | `(human_pop - human_pop_2020) / human_pop_2020 × 100` |
| `area_km2` | float | km² | 現行調値 | 国土地理院『全国都道府県市区町村別面積調』 |
| `human_density_km2` | float | 人/km² | 2026-10-01 | `human_pop / area_km2` |
| `forest_area_ha` | integer | ha | 2020-02-01 | 2020年農林業センサス「現況森林面積」（県計 `283,671 ha`） |
| `forest_area_km2` | float | km² | 2020-02-01 | `forest_area_ha / 100` |
| `forest_ratio_pct` | float | % | 2020-02-01 | `(forest_area_km2 / area_km2) × 100`（`0 ha` の自治体は `0.0`） |

## 2. 鹿生息数推定・勢力分布・証拠区分（区分 B / C / D）

| カラム名 | 型 | 単位 | 定義・備考 |
| :--- | :--- | :--- | :--- |
| `evidence_grade` | string | — | 本プロジェクト独自証拠区分（`A`: 公的直接観測 / `B`: 公的資料推定 / `C`: 追加仮定推定 / `D`: データ不足） |
| `evidence_label` | string | — | 証拠区分の詳細説明 |
| `deer_std` | integer / null | 頭 | 標準シナリオにおける鹿推定生息数（区分Dは `null`） |
| `deer_low` | integer / null | 頭 | 保守的（下限）シナリオにおける鹿推定生息数（区分Dは `null`） |
| `deer_high` | integer / null | 頭 | 高密度（上限）シナリオにおける鹿推定生息数（区分Dは `null`） |
| `deer_human_ratio_pct` | float / null | % | 鹿人比率（標準）：`deer_std / human_pop × 100`（区分Dは `null`） |
| `deer_human_ratio_low_pct` | float / null | % | 鹿人比率（保守的シナリオ） |
| `deer_human_ratio_high_pct` | float / null | % | 鹿人比率（高密度シナリオ） |
| `deer_density_admin_km2` | float / null | 頭/km² | 行政面積あたり鹿密度：`deer_std / area_km2` |
| `deer_density_forest_km2` | float / null | 頭/km² | 生息可能森林面積あたり鹿密度：`deer_std / forest_area_km2` |
| `dominance_code` | string | — | 勢力分類コード（`EMPIRE` / `DEER_DOMINANT` / `CONTESTED` / `HUMAN_DOMINANT` / `UNDETERMINED`） |
| `dominance_label` | string | — | 表示用分類名（`👑 鹿帝国領` 等。演出的表現であり生態的支配関係ではない） |
| `tier_shift_sensitive` | boolean | — | 低・標準・高密度シナリオ間で分類が変化する境界敏感自治体かどうか |
| `depi_score` | float / null | 帝国pt | **鹿帝国勢力指数 (DEPI, 0〜100 帝国pt)**。森林率(35pt)＋鹿密度(35pt)＋対人口圧(30pt)の複合指標（鹿人比率とは別指標） |
| `method_formula` | string | — | 当該自治体の具体的な算出式 |
| `habitat_note` | string | — | 地形・植生・生息環境に関する根拠メモ |
| `damage_capture_note` | string | — | 捕獲実績・被害動向・調査点の補足メモ |
