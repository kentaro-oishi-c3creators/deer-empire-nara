# 🦌 DEER EMPIRE NARA — 鹿帝国勢力図（3D立体版 / 2Dオリジナル保存版）

> **「奈良県は、本当に人間の県なのか。それとも鹿の帝国なのか？」**
>
> 奈良県全39市町村（12市・15町・12村）の人間人口・森林センサス・ニホンジカ生息状況を空間統計で可視化し、あわせて Antigravity Orchestrator による開発プロセスとトークン消費実測を記録したプロジェクトです。

---

## 🌐 公開ポータル＆各エディション URL（GitHub Pages）

| コンテンツ | 公開URL | ローカルパス | 特徴 |
| :--- | :--- | :--- | :--- |
| **🏛️ 統合親ポータル** | [deer-empire-nara/](https://kentaro-oishi-c3creators.github.io/deer-empire-nara/) | `index.html` | 3D背景・各エディション比較・AI実測サマリー・資料ハブ |
| **🧊 3D立体版ダッシュボード** | [3d/dashboard/](https://kentaro-oishi-c3creators.github.io/deer-empire-nara/3d/dashboard/) | `3d/dashboard/index.html` | Three.js WebGL 3D立体ポリゴン、人vs鹿3Dツインタワー、3D/2D並列比較、3D空間相関キューブ |
| **🗺️ 2D元構成保存版** | [2d/dashboard/](https://kentaro-oishi-c3creators.github.io/deer-empire-nara/2d/dashboard/) | `2d/dashboard/index.html` | 初期公開構成を1階層下へ無改変保存した Leaflet + 国土地理院 2D精密GIS版 |
| **📽️ VCスライド (3D連動)** | [3d/slides/](https://kentaro-oishi-c3creators.github.io/deer-empire-nara/3d/slides/) | `3d/slides/index.html` | 海外VC向け全12枚ブリーフィング（発表者ノート・PDF印刷・3Dダッシュボード導線） |
| **📽️ VCスライド (2D元版)** | [2d/slides/](https://kentaro-oishi-c3creators.github.io/deer-empire-nara/2d/slides/) | `2d/slides/index.html` | 元の構成における12枚スライド |

---

## 📊 主要な調査結果

1. **頭数で見れば「人間の県」**：人間総人口 **1,263,770人**（2026-10-01推計・区分A）に対し、鹿の推定生息数は標準モデルで **62,517頭**（保守 45,908〜高密度 81,243頭）。県全体の鹿人比率は **4.95%**（人間が約20倍）。
2. **面積で見れば「半国土の鹿帝国」**：人間の99.2%が北西部盆地等へ集住する一方、森林率76.9%の山間10市町村では鹿推定数が人間を上回る **「👑 鹿帝国領」** となり、**奈良県総面積の 53.8%（1,986.5 km²）** を占める。
3. **最強の鹿勢力自治体**：吉野郡 **上北山村**（人間 362人 vs 鹿推定 5,052頭 ＝ **鹿人比率 1,395.6%**）。
4. **奈良公園の二重計上排除**：奈良公園の実測 **1,687頭（区分A）** と奈良市東部D管理地区の野生群 **2,852頭（区分B）** を重複なく分離合算（県全体の鹿に対する公園鹿の割合は **2.7%**）。

---

## 📁 ディレクトリ構成

```text
deer-empire-nara/
├── index.html                        # 統合親ポータル（WebGL 3D背景・各エディション＆レポートハブ）
├── 3d/                               # 3D Spatial Edition（Three.js WebGL 3D対応）
│   ├── dashboard/                    # 3D立体勢力図 + 2D並列 + 3D空間相関キューブ
│   └── slides/                       # VC向け12枚スライド（3D版導線付）
├── 2d/                               # 2D Classic Edition（元の構成を1階層下へ完全保存）
│   ├── dashboard/                    # 元の2D Leaflet＋Chart.jsダッシュボード
│   ├── slides/                       # 元のVC向け12枚スライド
│   └── docs/sources.md
├── docs/                             # 調査・推定手法・Red Team監査・AI実測分析レポート
│   ├── research-record.md            # 研究記録とAntigravity Orchestrator実測分析（統合ノート）
│   ├── antigravity-usage-report.md   # Antigravity Orchestrator 実測・API換算レポート
│   ├── red-team-review.md            # Red Team 8項目批判的監査と感度分析
│   ├── methodology.md                # 階層空間配分モデル・DEPI定義
│   ├── limitations.md                # 基準年度ズレ・限界事項
│   └── sources.md                    # 全出典URL・ライセンス
├── data/                             # 一次取得データ・加工済み39市町村GeoJSON/CSV・メタデータ
├── reports/findings.md               # 最終調査報告書
└── scripts/                          # データ生成・自動検証Pythonスクリプト
```

---

## 🚀 ローカル起動・検証方法

```bash
cd deer-empire-nara
python -m http.server 8765
```

- 親ポータル：`http://localhost:8765/`
- 3D立体版：`http://localhost:8765/3d/dashboard/`
- 2D元版：`http://localhost:8765/2d/dashboard/`

整合性自動検証：
```bash
python scripts/verify_project.py
```

---

## ⚠️ 注意事項

- 「鹿帝国領」等の名称は統計可視化上の演出であり、実際の生態的・行政的支配関係を示すものではありません。
- 定住森林がない等の区分D（7市町）は根拠のない推定値や比率を算出せず「未判定」として表示しています。
- API換算コスト試算は公開API単価を仮定した参考値であり、実際のサブスクリプション請求額とは異なります。
