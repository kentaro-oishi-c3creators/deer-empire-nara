Ran inspect transcript schemas and keys across parent and subagents
Ran check conversation directory structure and recent brain folders
Ran inspect full transcript keys, plan transitions, models, and token semantics · Exited with code 1
Ran inspect full transcript schemas and dirs
Ran inspect log files, subagents, and token-bearing steps
Analyzed SKILL.md:L1-65
Ran inspect subagent metadata and parent timeline events
Ran trace parent mode switches, cache resets, and turns
Ran extract parent phase-by-phase token and timing stats
Ran extract subagent stats and image-generator trace
Ran analyze image sizes, thinking tokens, errors, and active timing
Analyzed SKILL.md:L1-106
Ran audit errors, thinking ratios, cache TTLs, and Turn 3 exclusion
Analyzed hooks.md:L1-429
Ran verify errors, cache misses, and master token totals
Ran audit browser failures and <=200k/>200k token tiers
Searching ai.google.dev for Gemini Developer API pricing per 1M tokens input output context caching image generation
Searched Google Antigravity Argon Hydrogen Orchestrator model pricing documentation
Searched ai.google.dev for "Gemini 4 Argon" "Gemini 4 Hydrogen" API pricing input output context caching per million tokens
Searched "Gemini 4 Argon" pricing per million tokens input output cache official Google
Searched ai.google.dev for Gemini API pricing Gemini Flash context caching image generation 1K per image 2026
Searched ai.google.dev for "Gemini 4 Argon" "200k" OR "context window" OR "cache" pricing
Searched ai.google.dev for "Gemini 4 Hydrogen" pricing input output "context caching" OR "cache read" OR "cache write"
Searched "Google Antigravity" subagent "flash" model OR "image-generator" model name 2026
Searched ai.google.dev for "Gemini 3" OR "Gemini 3.1" OR "Gemini 3.8" "Flash" "Image" pricing 1K 1376 768 per image 2026
Ran calculate exact API-equivalent cost scenarios and savings

# 🦌 鹿帝国プロジェクト（`deer-empire-nara`）Antigravity 利用状況分析レポート

> [!IMPORTANT]
> **分析の前提と厳守事項**
> - **対象範囲**：`deer-empire-nara` の制作に該当する **Turn 1（調査・Red Team監査・Webダッシュボード構築）** および **Turn 2（海外VC向け12枚スライド・画像生成・ブラウザ検証）** の全5会話（親1＋サブエージェント4）。本レポートを作成している **Turn 3（`step_index >= 469`）は集計から除外**しています。
> - **データの厳格な3区分**：本レポートではすべての数値を **`[実測値]`**（ローカル実行ログから直接集計）、**`[ログからの推定値]`**（ログ上の構造・プロトコル・キャッシュ挙動から導出）、**`[仮定による試算]`**（外部公開API単価や未記録モデルの仮定を置いた換算）に厳密に区分し、ログに存在しない項目は **`取得不可`** と明記します。
> - **請求額との非混同**：本レポートのAPI換算コストは、**「観測されたトークン数および画像生成枚数を、仮にパブリックな Gemini Developer API 従量課金で実行した場合の理論換算額」**であり、Antigravity サブスクリプション（Google AI Pro / Ultra / Enterprise 等）における**実際の請求金額とは異なります**。
> - **コンテキスト長と累積トークン消費量の区別**：最大コンテキスト使用量（単一呼び出し時の最大プロンプト長：`493,339` tokens）は、複数ステップにわたる累積消費トークン数（総処理量：`47,922,572` tokens）とは明確に区別して記載します。

---

## エグゼクティブサマリー

| 指標 | 数値 | 区分 | 備考 |
| :--- | ---: | :--- | :--- |
| **対象セッション（会話数）** | **5会話**（親1 ＋ サブエージェント4） | `[実測値]` | 親 `step 0–468` ＋ 全4サブエージェント |
| **総モデル呼び出し回数** | **230回**（親 125回 / サブ 105回） | `[実測値]` | 親内訳：Planner 23回 / Executor 102回 `[ログからの推定値]` |
| **総ツール呼び出し回数** | **447回**（うち画像生成 `generate_image` 5回） | `[実測値]` | 親 279回 / サブエージェント 168回 |
| **累積非キャッシュ入力トークン** | **3,693,238 tokens** | `[実測値]` | 新規入力・キャッシュミス分 |
| **累積キャッシュ読込トークン** | **43,834,864 tokens** | `[実測値]` | 全体キャッシュヒット率 **92.2%** |
| **累積入力トークン合計** | **47,528,102 tokens** | `[実測値]` | 非キャッシュ入力 ＋ キャッシュ読込 |
| **累積出力トークン（推論込み）** | **394,470 tokens** | `[実測値]` | 可視出力＋内部推論トークン合算（単体推論は `取得不可`） |
| **総処理トークン数（入出力合計）** | **47,922,572 tokens** | `[実測値]` | 累積消費量（コンテキスト長とは別指標） |
| **最大コンテキスト長（ピーク値）** | **493,339 tokens** | `[実測値]` | Turn 2 親 Executor 最終ステップ（`step 468`） |
| **実稼働時間（Turn 1 + Turn 2）** | **約67分30秒+**（T1: 44m36s+ / T2: 22m54s+） | `[実測値]` | Turn 1〜2間のユーザー待機 `3m49s` を除外 |
| **API換算コスト（基準・2026-11-21単価）** | **約 \$12.07〜\$12.24** | `[仮定による試算]` | 導入価格適用時（Turn 1: \$8.13 / Turn 2: \$3.94〜\$4.10） |
| **API換算コスト（感度レンジ全体）** | **\$11.67〜\$18.63** | `[仮定による試算]` | Argon 12/1通常価格・未記録サブエージェントモデル変動を含む |

---

## 1. 対象会話・セッション・実行ログの特定（出典と計測方法）

ローカルの Antigravity ログディレクトリ（`<appDataDir>/brain/`）を走査し、本プロジェクトに対応する**全5会話**を特定しました。すべての実測集計は各会話の非省略版ログ `transcript_full.jsonl`（および親会話の `.system_generated/subagents/*.json`）を Python スクリプトで読み取り専用解析して算出しています。

| 役割 | 会話リンク / ID | 対象ターン | 生成ステップ範囲 / 行数 | 実行ログ出典（`transcript_full.jsonl`） |
| :--- | :--- | :--- | :--- | :--- |
| **Orchestrator（親）** | [Parent Orchestrator](conversation://215de37a-e7f1-4998-98d6-106626e75eff) (`215de37a-...`) | Turn 1 & Turn 2 | `step 0–468`（469行 / 除外: `step 469+`） | [transcript_full.jsonl](`<appDataDir>/brain/215de37a-e7f1-4998-98d6-106626e75eff/.system_generated/logs/transcript_full.jsonl`) |
| **Subagent 1（`red-team-auditor`）** | [Red Team Data Auditor](conversation://6aa67521-081f-4ad0-9bd8-4f3200ffe506) (`6aa67521-...`) | Turn 1 (`step 162` 起動) | 全131行 | [transcript_full.jsonl](`<appDataDir>/brain/6aa67521-081f-4ad0-9bd8-4f3200ffe506/.system_generated/logs/transcript_full.jsonl`) |
| **Subagent 2（`browser`・ダッシュボード検証）** | [Dashboard Browser Verifier](conversation://a44d1266-7c03-40f7-ba5d-4c37c63a0172) (`a44d1266-...`) | Turn 1 (`step 179` 起動) | 全67行 | [transcript_full.jsonl](`<appDataDir>/brain/a44d1266-7c03-40f7-ba5d-4c37c63a0172/.system_generated/logs/transcript_full.jsonl`) |
| **Subagent 3（`image-generator`・画像生成）** | [Visual Asset Generator](conversation://aac974c3-0bee-40f4-9f86-06f6ca76ea66) (`aac974c3-...`) | Turn 2 (`step 379` 起動) | 全12行 | [transcript_full.jsonl](`<appDataDir>/brain/aac974c3-0bee-40f4-9f86-06f6ca76ea66/.system_generated/logs/transcript_full.jsonl`) |
| **Subagent 4（`browser`・スライド検証）** | [VC Slides Deck Verifier](conversation://b394d50f-7102-41f2-880d-a66484a336b0) (`b394d50f-...`) | Turn 2 (`step 401` 起動) | 全90行 | [transcript_full.jsonl](`<appDataDir>/brain/b394d50f-7102-41f2-880d-a66484a336b0/.system_generated/logs/transcript_full.jsonl`) |

*補足*：親会話の `step 469` 以降（Turn 3：本レポート作成ターン）ではモデル設定が `Orchestrator (Argon)` から `Gemini 4 Neon (XHigh)` に切り替えられており、プロジェクト制作実績と混ざらないよう完全に除外しています。

---

## 2. 使用モデルの特定と Planner / Executor の分離根拠

### 2.1 モデル特定状況

| 実行主体 | ログ上の直接記録 | 特定されたモデル（または推定） | 判定区分 |
| :--- | :--- | :--- | :--- |
| **親会話（設定値）** | `step 0` の `<USER_SETTINGS_CHANGE>` に `Orchestrator (Argon)` と記録（`step 469` で変更されるまで維持）。※個別ステップの `model` フィールドは Turn 1–2 では `null`（未記録） | Antigravity 公式仕様より **Orchestrator (Argon)** ＝ Planner: **Gemini 4 Argon** ＋ Executor: **Gemini 4 Hydrogen** | `[実測値]`（設定名）＋ `[ログからの推定値]`（公式仕様対応） |
| **親：Planner フェーズ（23回）** | `USER_INPUT` 直後、および `[plan review] Plan mode is on` 受信後〜`exit_plan_mode` 呼び出しまで | **Gemini 4 Argon**（`gemini-4-argon`） | `[ログからの推定値]` |
| **親：Executor フェーズ（102回）** | `exit_plan_mode` 完了後〜ターン終了または `enter_plan_mode` 呼び出しまで | **Gemini 4 Hydrogen**（`gemini-4-hydrogen`） | `[ログからの推定値]` |
| **Subagent 1（`red-team-auditor`）** | `invoke_subagent` で `Model` 省略（デフォルト `inherit`）、起動元は親 Executor（`step 162`）。`model` フィールド未記録 | **正確なモデルIDは取得不可**。呼出元が Executor のため **Gemini 4 Hydrogen 継承**を基準とし、**Argon 継承**を上限感度ケースとして併記 | `取得不可`（試算上は `[仮定]`） |
| **Subagent 2 & 4（`browser` ×2）** | `invoke_subagent` に `"Model": "flash"` と明示記録。`model` フィールド未記録 | 層指定は **`flash`** `[実測値]`。ただし具体的な裏側バージョンID（例：Gemini 3.8 Flash / 3.5 Flash / 2.5 Flash）は **取得不可** | `取得不可`（層指定のみ `[実測値]`） |
| **Subagent 3（`image-generator`・制御LLM）** | `invoke_subagent` で `Model` 省略。`model` フィールド未記録 | **正確なモデルIDは取得不可**（軽量Flash相当として試算、金額影響は \$0.04未満） | `取得不可` |
| **Subagent 3（`generate_image` ツール ×5回）** | 出力JPEG 5枚の実解像度はすべて **`1376 × 768`（16:9 / 1Kクラス）** `[実測値]`。画像モデルIDは未記録 | **正確な画像生成モデルIDは取得不可**（Gemini Image 1K系単価 \$0.034〜\$0.067/枚 で試算） | `取得不可`（解像度・枚数は `[実測値]`） |

### 2.2 Planner（Argon）と Executor（Hydrogen）の分離が確実である技術的証拠

Turn 1–2 の `transcript_full.jsonl` には各ステップ単位の `model` フィールドが存在しませんが、以下の**二重の客観的証拠**により全125回の親モデル呼び出しを 100% 境界ズレなく分離できました。

1. **プロトコル上の明示的切替**：`USER_INPUT` → `exit_plan_mode`（`step 59`, `194`, `293`, `376`）で Executor へ移行し、Executor が30回実行に達すると `[plan review due]` 通知を受けて `enter_plan_mode`（`step 190`, `290`）→ `[plan review] Plan mode is on`（`step 192`, `292`）で Planner へ戻る遷移が完全に一致。
2. **プロンプトキャッシュ境界による裏付け（決定的な物証）**：
   - `T1_Executor_1` 終了時（`step 190`）のコンテキスト長は **`257,298` tokens**。直後の `T1_Planner_Review1`（`step 194`）は別モデルのため **`cache_read_tokens = 0`**（`input_tokens = 269,592`）となったが、その直後に再開した `T1_Executor_2`（`step 197`）では **`cache_read_tokens = 257,299`** となり、**Executor のキャッシュがそのまま再利用**されました。
   - 同様に、`T1_Executor_2` 終了時（`335,593`）→ `T1_Planner_Review2`（`cr = 0`）→ `T1_Executor_3` 再開時（**`cr = 335,594`**）、および `T1_Executor_3` 終了時（`381,901`）→ `T2_Planner_Initial`（`cr = 0`）→ `T2_Executor_1` 再開時（**`cr = 381,902`**）でも完全に同じキャッシュ分離・復帰パターンが確認されました。

---

## 3. モデル・ロール別の詳細トークン消費量

> [!NOTE]
> **`input_tokens` と `cache_read_tokens` の関係および `output_tokens` の仕様**
> - ログ上の `input_tokens` は**非キャッシュ新規入力トークン**であり、各呼び出しの総プロンプト長は `input_tokens + cache_read_tokens` です（初回呼び出し `step 1` は `input=30,350, cr=0`、直近キャッシュヒット時は `input=2,830, cr=490,509` となることから確認済み）。
> - **`reasoning_tokens`（推論トークン）単体のカラムは存在せず `取得不可`**です。ただし、ログ解析により **`output_tokens` に内部推論トークンが合算されている**ことが強く実証されました（例：Subagent 1 `step 68` は可視出力＋ツール引数 `383` 文字・思考要約 `3,490` 文字［英語99.7%］に対し `output_tokens = 3,508`、`step 113` は可視 `2,008` 文字に対し `output_tokens = 14,034`）。また、`thinking` フィールドは英語の**要約された思考ログ**であり、生テキスト文字数から直接トークン数を逆算することはできません。

### 3.1 ロール・ターン別トークン集計表（すべて `[実測値]`、ロール分離は親のみ `[ログからの推定値]`）

| ターン | ロール / サブエージェント | 想定モデル層 | 呼出回数 | 非キャッシュ入力 (`input_tokens`) | キャッシュ読込 (`cache_read_tokens`) | 累積入力合計 (`in + cr`) | キャッシュ率 | 出力・推論合算 (`output_tokens`) | 累積総トークン (`in + cr + out`) | 最大コンテキスト長 (`max(in+cr)`) | 推論トークン単体 / キャッシュ書込 |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| **Turn 1** | 親：Planner（初期13＋レビュー2） | Argon | 15 | 706,927 | 706,281 | 1,413,208 | 50.0% | 19,348 | 1,432,556 | 347,643 | `取得不可` |
| **Turn 1** | 親：Executor（3フェーズ計） | Hydrogen | 77 | 1,248,856 | 18,821,892 | 20,070,748 | 93.8% | 157,057 | 20,227,805 | 381,901 | `取得不可` |
| **Turn 1** | Sub1：`red-team-auditor` | `inherit` (不明) | 43 | 331,896 | 7,732,435 | 8,064,331 | 95.9% | 72,039 | 8,136,370 | 301,183 | `取得不可` |
| **Turn 1** | Sub2：`browser`（ダッシュボード） | `flash` (詳細不明) | 30 | 204,404 | 1,525,003 | 1,729,407 | 88.2% | 28,391 | 1,757,798 | 109,910 | `取得不可` |
| **Turn 1 小計** | **調査・Red Team・ダッシュボード** | — | **165** | **2,492,083** | **28,785,611** | **31,277,694** | **92.0%** | **276,835** | **31,554,529** | **381,901** | `取得不可` |
| **Turn 2** | 親：Planner（スライド設計） | Argon | 8 | 417,817 | 2,833,525 | 3,251,342 | 87.1% | 9,898 | 3,261,240 | 416,770 | `取得不可` |
| **Turn 2** | 親：Executor（スライド実装・修正） | Hydrogen | 25 | 569,169 | 11,184,981 | 11,754,150 | 95.2% | 57,266 | 11,811,416 | 493,339 | `取得不可` |
| **Turn 2** | Sub3：`image-generator`（制御LLM） | 組み込み (不明) | 5 | 16,752 | 33,805 | 50,557 | 66.9% | 4,425 | 54,982 | 14,220 | `取得不可` (+画像5枚) |
| **Turn 2** | Sub4：`browser`（スライド検証） | `flash` (詳細不明) | 27 | 197,417 | 996,942 | 1,194,359 | 83.5% | 46,046 | 1,240,405 | 72,760 | `取得不可` |
| **Turn 2 小計** | **VCスライド・画像生成・検証** | — | **65** | **1,201,155** | **15,049,253** | **16,250,408** | **92.6%** | **117,635** | **16,368,043** | **493,339** | `取得不可` |
| **合計（親）** | **親：Planner 合計** | Argon | **23** | **1,124,744** | **3,539,806** | **4,664,550** | **75.9%** | **29,246** | **4,693,796** | **416,770** | `取得不可` |
| **合計（親）** | **親：Executor 合計** | Hydrogen | **102** | **1,818,025** | **30,006,873** | **31,824,898** | **94.3%** | **214,323** | **32,039,221** | **493,339** | `取得不可` |
| **合計（サブ）** | **サブエージェント4体 合計** | 混在 | **105** | **750,469** | **10,288,185** | **11,038,654** | **93.2%** | **150,901** | **11,189,555** | **301,183** | `取得不可` |
| **総計（全5会話）** | **プロジェクト制作 総合計** | **全体** | **230** | **3,693,238** | **43,834,864** | **47,528,102** | **92.2%** | **394,470** | **47,922,572** | **493,339** | `取得不可` |

### 3.2 親会話のフェーズ別内訳とコスト構造上の重要発見

| 親フェーズ | ステップ範囲 | 呼出 | 非キャッシュ入力 | キャッシュ読込 | キャッシュ率 | 出力トークン | 最大コンテキスト | 時刻（JST） |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `T1_Planner_Initial` | `1–59` | 13 | 89,692 | 706,281 | 88.7% | 17,599 | 85,604 | `17:01:20–17:09:01` |
| `T1_Executor_1` | `62–190` | 31 | 494,470 | 5,089,560 | 91.1% | 106,723 | 257,298 | `17:11:17–17:29:46` |
| `T1_Planner_Review1` | `194` | 1 | 269,592 | 0 | 0.0% | 873 | 269,592 | `17:30:05` |
| `T1_Executor_2` | `197–290` | 31 | 347,775 | 8,626,553 | 96.1% | 28,013 | 335,593 | `17:30:38–17:40:23` |
| `T1_Planner_Review2` | `293` | 1 | 347,643 | 0 | 0.0% | 876 | 347,643 | `17:40:42` |
| `T1_Executor_3` | `296–352` | 15 | 406,611 | 5,105,779 | 92.6% | 22,321 | 381,901 | `17:41:15–17:45:52` |
| `T2_Planner_Initial` | `354–376` | 8 | 417,817 | 2,833,525 | 87.1% | 9,898 | 416,770 | `17:49:42–17:51:58` |
| `T2_Executor_1` | `379–468` | 25 | 569,169 | 11,184,981 | 95.2% | 57,266 | 493,339 | `17:53:40–18:12:35` |

**トークン消費の構造的特徴（ログからの実測発見）**：
1. **待機→復帰（Wakeup）時のキャッシュ部分失効が非キャッシュ入力の 68.5% を占めた**：親 Executor がサブエージェント完了を待つため一旦ターンを閉じ（`tools=[]`）、`SYSTEM_MESSAGE` で再起動された4回（`step 186, 204, 339, 406`）では、毎回システムプロンプト固定部（`28,198` tokens）のみキャッシュヒットし、会話履歴全体（`228k + 236k + 349k + 432k = 1,244,714` tokens）が非キャッシュ入力として再計算されました。これは親 Executor の非キャッシュ入力全体（`1,818,025` tokens）の **68.5%** に相当します（うち `step 406` は約6分の待機によるTTL超過、`step 204, 339` は 4〜5 秒間隔でも発生しており、Wakeup時の動的プレフィックス再構築に起因すると推察されます）。
2. **2回の計画レビュー（`T1_Planner_Review1/2`）は1回ずつキャッシュミスが発生**：各30回の Executor 実行後に自動発火した `[plan review]` では、Planner 側の暗黙キャッシュが失効していたため、それぞれ `269,592` tokens・`347,643` tokens が非キャッシュ入力となり、Planner 側非キャッシュ入力の **54.9%** を占めました。

---

## 4. 作業時間・モデル呼び出し回数・エラーおよび再試行の集計

### 4.1 タイムラインと作業時間（すべて `[実測値]`、JST = UTC+9）

| 区間 | 開始時刻（JST） | 終了時刻（JST） | 所要時間 | 補足 |
| :--- | :--- | :--- | ---: | :--- |
| **Turn 1（調査＋ダッシュボード）** | `17:01:16` (`step 0`) | `17:45:52`+ (`step 352` 開始) | **44分36秒+** | 最終回答 `3,726` tokens 生成完了まで含め実測約 **45分** |
| （うち Turn 1 親 Planner 計） | `17:01:20` 〜 `17:11:16` 等 | — | **約10分40秒** | 初期計画生成 `exit_plan_mode` 完了 `17:11:16` 含む |
| （うち Sub1 `red-team-auditor`・並列） | `17:24:23` | `17:38:38` | **14分15秒** | 連続稼働（親 Executor と並列実行） |
| （うち Sub2 `browser` ダッシュボード・並列） | `17:28:32` | `17:45:16` | **スパン 16分44秒** | **実稼働 8分04秒**（`256s + 180s + 48s` の3ラウンド / 待機 `8m40s`） |
| *Turn 1 → Turn 2 ユーザー待機* | `17:45:52` | `17:49:41` | *3分49秒* | *非稼働時間（プロジェクト稼働時間から除外）* |
| **Turn 2（海外VC向けスライド）** | `17:49:41` (`step 353`) | `18:12:35`+ (`step 468` 開始) | **22分54秒+** | 最終回答 `2,179` tokens 生成完了まで含め実測約 **23分** |
| （うち Turn 2 親 Planner） | `17:49:42` | `17:53:38` (`step 377` 完了) | **3分56秒** | `exit_plan_mode` 計画書生成完了まで |
| （うち Sub3 `image-generator`・並列） | `17:54:13` | `17:56:04` | **1分51秒** | 5枚生成（初回3枚並列＋再生成2回） |
| （うち Sub4 `browser` スライド・並列） | `17:57:47` | `18:11:48` | **スパン 14分01秒** | **実稼働 10分51秒**（`357s + 192s + 102s` の3ラウンド / 待機 `3m10s`） |
| **プロジェクト実稼働合計（Turn 1 + Turn 2）** | — | — | **67分30秒+（約68分）** | ユーザー待機除くウォールクロック稼働時間 |
| **開始〜終了の全経過時間** | `17:01:16` | `18:12:35`+ | **71分19秒+** | ユーザー待機 `3m49s` を含む |

*注*：各 `PLANNER_RESPONSE` には `created_at`（開始時刻）のみ記録され `completed_at` がないため、各ターンの最終応答ステップ（`step 352`・`step 468`）のストリーミング完了秒数（数十秒程度）は正確な秒単位では `取得不可`（上記は `+` 表記で下限実測値を記載）。

### 4.2 エラー・再試行・反復ループの集計

| 区分 | 回数 | 区分 | ログ上の具体内容 |
| :--- | ---: | :--- | :--- |
| **ステップ実行エラー（`status == "ERROR"`）** | **1回** | `[実測値]` | 親 `step 25`：`search_web` 実行時のバックエンド応答エラー（`no summary returned from GenerateContent`） |
| **シェルコマンド失敗（`exit code != 0`）** | **2回** | `[実測値]` | 親 `step 24`（PowerShellクォート構文エラー）、親 `step 36`（`pref.nara.jp` HTTP `403 Forbidden`） |
| **ブラウザスクリプト実行失敗（`"ok": false`）** | **7回** | `[実測値]` | Sub2 `step 41`（1回）、Sub4 `step 17, 30, 71, 73, 81, 83`（6回・Playwright要素取得・操作リトライ） |
| **画像再生成（品質改善リトライ）** | **2回** | `[実測値]` | Sub3：最終採用3枚に対し `generate_image` を計**5回**実行（スライド1の分割画面アーティファクト解消のため `step 5`, `step 7` で2回再生成） |
| **ブラウザ修正→再検証サイクル** | **計4回** | `[実測値]` | Sub2（ダッシュボード）3ラウンド＝初回＋再検証**2回**、Sub4（スライド）3ラウンド＝初回＋再検証**2回** |
| **自動計画レビュー差し戻し（`[plan review due]`）** | **2回** | `[実測値]` | Turn 1 Executor が30回呼出に到達した `step 189`・`step 289` で2回発生（仕様上の正常ハンドバック） |
| **ブラウザ会話の自動コンパクション（`CHECKPOINT`）** | **3回** | `[実測値]` | Sub2（1回：`step 37`）、Sub4（2回：`step 26, 65`）。※親会話は Turn 1–2 中 **0回** |
| **LLM API 通信層リトライ（HTTP 429 / 503 等）** | **`取得不可`** | `取得不可` | `transcript_full.jsonl` に通信層リトライ回数は記録されない |

---

## 5. 公式モデル単価に基づく API 換算コスト試算

> [!WARNING]
> **必ず区別してください**
> - 以下はすべて **`[仮定による試算]`** です。実際の Antigravity サブスクリプション請求額・クォータ課金額とは異なります。
> - 親会話の `Orchestrator (Argon)` は **Gemini 4 Argon / Gemini 4 Hydrogen** の公式単価に対応づけ可能ですが、**サブエージェント4体の裏側モデルIDはログ未記録（`取得不可`）**のため、単価仮定の幅を複数シナリオ（基準値＋感度レンジ）で提示します。

### 5.1 使用時点（2026-11-21）の公式 Gemini Developer API 単価一覧

Google 公式ドキュメント（`ai.google.dev` / Google AI Studio Paid Tier、2026年11月時点）に基づく 100万トークン（1M tokens）あたり単価（米ドル・1Mコンテキスト全域フラット料金）：

| モデル | 適用条件 | 非キャッシュ入力 | キャッシュ読込（暗黙） | 出力（推論込み） | 備考 |
| :--- | :--- | ---: | ---: | ---: | :--- |
| **Gemini 4 Argon** | **2026-11-30 まで（導入価格・使用当時）** | **\$2.00** | **\$0.10**（95%引） | **\$10.00** | 本プロジェクト実行日（2026-11-21）適用 |
| **Gemini 4 Argon** | 2026-12-01 以降（通常価格・参考比較） | \$4.00 | \$0.20（95%引） | \$20.00 | 12/1以降の感度比較に使用 |
| **Gemini 4 Hydrogen** | Global / Standard（通常価格） | **\$1.50** | **\$0.075**（95%引） | **\$7.50** | Non-global は +10%（\$1.65 / \$0.0825 / \$8.25） |
| **Gemini 3.8 Flash** | **2026-12-31 まで（導入価格・使用当時）** | **\$0.75** | **\$0.075**（90%引） | **\$3.75** | `flash` サブエージェント基準仮定 |
| **Gemini 3.8 Flash** | 2027-01-01 以降（通常価格・上限参考） | \$1.50 | \$0.15（90%引） | \$7.50 | 上限感度ケースに使用 |
| **Gemini 2.5 Flash** | 下限参考（旧Flash仮定） | \$0.30 | \$0.03（90%引） | \$2.50 | 下限感度ケースに使用 |
| **画像生成（1K / `1376×768`）** | Gemini Image 1K（1,120 tokens/枚） | — | — | **\$0.034〜\$0.067 / 枚** | Flash Image (\$30/1M) ≒ \$0.034 / 3.1 Flash Image (\$60/1M) ≒ \$0.067 |

### 5.2 基準シナリオ詳細内訳（2026-11-21 導入価格適用・`[仮定による試算]`）

*仮定*：親 Planner = `Argon (導入価格)`、親 Executor & Sub1 (`inherit`) = `Hydrogen`、Sub2 / Sub3制御LLM / Sub4 (`flash`) = `Gemini 3.8 Flash (導入価格)`、画像5枚 = `\$0.034/枚`（括弧内は `\$0.067/枚` の場合）。

| 区分 | ロール | 仮定モデル | 非キャッシュ入力 | キャッシュ読込 | 出力（推論込み） | 小計（USD） | 構成比 |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| **Turn 1** | 親：Planner（15回） | Argon（導入） | \$1.4139 | \$0.0706 | \$0.1935 | **\$1.6780** | 13.9% |
| **Turn 1** | 親：Executor（77回） | Hydrogen | \$1.8733 | \$1.4116 | \$1.1779 | **\$4.4629** | 37.0% |
| **Turn 1** | Sub1：`red-team-auditor`（43回） | Hydrogen（仮定） | \$0.4978 | \$0.5799 | \$0.5403 | **\$1.6181** | 13.4% |
| **Turn 1** | Sub2：`browser` ダッシュボード（30回） | 3.8 Flash（仮定） | \$0.1533 | \$0.1144 | \$0.1065 | **\$0.3741** | 3.1% |
| **Turn 1 小計** | — | — | **\$3.9383** | **\$2.1765** | **\$2.0182** | **\$8.1330** | **67.4%** |
| **Turn 2** | 親：Planner（8回） | Argon（導入） | \$0.8356 | \$0.2834 | \$0.0990 | **\$1.2180** | 10.1% |
| **Turn 2** | 親：Executor（25回） | Hydrogen | \$0.8538 | \$0.8389 | \$0.4295 | **\$2.1221** | 17.6% |
| **Turn 2** | Sub3：`image-generator` LLM（5回） | 3.8 Flash（仮定） | \$0.0126 | \$0.0025 | \$0.0166 | **\$0.0317** | 0.3% |
| **Turn 2** | Sub3：`generate_image` ×5枚（1K） | 画像1K（仮定） | — | — | — | **\$0.1700**（\$0.3350） | 1.4% |
| **Turn 2** | Sub4：`browser` スライド（27回） | 3.8 Flash（仮定） | \$0.1481 | \$0.0748 | \$0.1727 | **\$0.3955** | 3.3% |
| **Turn 2 小計** | — | — | **\$1.8501** | **\$1.1996** | **\$0.7178** | **\$3.9373**（\$4.1023） | **32.6%** |
| **総合計** | **全5会話 ＋ 画像5枚** | — | **\$5.7883** | **\$3.3761** | **\$2.7359** | **\$12.07**（**\$12.24**） | **100.0%** |

### 5.3 感度分析・比較シナリオ（`[仮定による試算]`）

| シナリオ | 前提条件 | Turn 1 | Turn 2 | 合計（USD） | 基準比 |
| :--- | :--- | ---: | ---: | ---: | ---: |
| **下限ケース（Low）** | 2026-11-21 導入価格、Sub2/3/4 に旧 Flash 2.5 相当を仮定、画像 \$0.034/枚 | \$7.94 | \$3.73 | **\$11.67** | -3.3% |
| **基準ケース（Base・2026-11-21）** | Argon 導入価格 ＋ Hydrogen ＋ Sub1=Hydrogen ＋ Flash 3.8 導入 ＋ 画像 \$0.034〜\$0.067 | \$8.13 | \$3.94〜\$4.10 | **\$12.07〜\$12.24** | 基準 |
| **基準＋Sub1 Argon継承ケース** | 基準ケースのうち Sub1 (`inherit`) が Argon 導入価格を継承していた場合（画像 \$0.067） | \$8.67 | \$4.10 | **\$12.77** | +5.8% |
| **12/1以降 通常価格ケース** | Argon 通常価格（\$4/\$20）＋ Hydrogen ＋ Flash 3.8 導入 ＋ 画像 \$0.034〜\$0.067 | \$9.81 | \$5.16〜\$5.32 | **\$14.97〜\$15.13** | +24.0% |
| **上限ケース（High）** | Argon 通常価格 ＋ Sub1=Argon通常 ＋ Flash 3.8 通常価格 ＋ 画像 \$0.067/枚 | \$12.88 | \$5.75 | **\$18.63** | +54.3% |
| *参考：キャッシュ割引なし仮想* | 基準単価でキャッシュ読込 4,383万 tokens が全額非キャッシュ課金だった場合 | — | — | ***\$74.30*** | *+516%* |

**コスト効率に関する3つの実測インサイト**：
1. **暗黙キャッシュの効果が絶大**：キャッシュヒット率 92.2% により、API換算コストは **\$74.30 → \$12.07（約83.8%削減）** に圧縮されました。
2. **Orchestrator（Argon + Hydrogen）分業の効果**：親 Executor（102回呼出）の Hydrogen 換算コストは **\$6.59**。もし同じ実行を Argon 単体で回していた場合、導入価格でも **\$8.78（25.0%削減）**、12/1以降の通常価格では **\$17.56（62.5%削減）** に相当します。
3. **最大の改善余地は「待機後 Wakeup 時のキャッシュ再構築」**：親 Executor の非キャッシュ入力の 68.5%（約 **\$1.87** 相当）はわずか4回のサブエージェント待機復帰（`step 186, 204, 339, 406`）で発生しています。

---

## 6. 取得不可項目一覧

以下の項目はローカル実行ログ（`transcript_full.jsonl` および `.system_generated/`）に記録されていないため、捏造や推測補完を行わず明確に **`取得不可`** とします。

| 項目 | 状況 | 理由・技術的背景 |
| :--- | :--- | :--- |
| **推論（思考）トークン単体の数値** | `取得不可` | `output_tokens` に可視出力と合算記録されており、独立した `thoughts_tokens` / `reasoning_tokens` フィールドが存在しない。`thinking` 欄は英語の要約文のため文字数逆算も不可。 |
| **キャッシュ書込（`cache_write`）トークン数** | `取得不可` | ログに `cache_read_tokens` のみ存在し、書込トークンやキャッシュ保持時間（Storage課金対象）は未記録（なお Gemini 4 は暗黙キャッシュのみ対応）。 |
| **Turn 1–2 各ステップの厳密な裏側モデルID** | `取得不可` | Turn 1–2 の `transcript_full.jsonl` では `model` フィールドが `null`。特にサブエージェント（`red-team-auditor`, `browser` ×2, `image-generator`）の厳密なモデルバージョンIDは記録なし。 |
| **画像生成ツール内部のトークン数・モデルID** | `取得不可` | `generate_image` ツール出力には保存パスと画像サイズ（`1376×768`）のみ残り、画像生成モデル名や内部トークン数は未記録。 |
| **`search_web` ツール裏側の検索要約モデル消費量** | `取得不可` | `search_web` 内部で動く検索グラウンディング用モデルのトークン消費や課金単価（Search Grounding fee）は親・サブログに含まれない。 |
| **ブラウザ `CHECKPOINT`（3回）の圧縮処理トークン** | `取得不可` | Sub2（1回）・Sub4（2回）の `CHECKPOINT` ステップにはトークンフィールドが `null` で記録されており、要約生成コストは含まれない。 |
| **通信層（HTTP 429/503等）の自動リトライ回数** | `取得不可` | API クライアント内部の透過的リトライやバックオフ回数は `transcript_full.jsonl` に出力されない。 |
| **各モデル呼び出しの厳密な生成完了時刻（レイテンシ）** | `取得不可` | `PLANNER_RESPONSE` には `created_at`（開始時刻）のみ記録され、`completed_at` がない（ツール結果の `GENERIC` ステップにのみ `Completed At` が存在）。 |
| **実際の Antigravity 請求金額・消費クォータ実数値** | `取得不可` | サーバー側の契約プラン・クォータ残量・請求台帳はローカルログに保存されない。 |

---

## 7. 今後のプロジェクトで自動記録するための計測アーキテクチャ提案

今回の調査で判明した最大のギャップは、**(a) Orchestrator 利用時に各ステップの実モデル名（`model`）が `transcript.jsonl` に残らない点**、および **(b) 親＋サブエージェントを横断してプロジェクト単位の台帳へ自動集計する仕組みがない点**です。

Antigravity の公式カスタマイズ機構である **Lifecycle Hooks（`hooks.json`）** は、すべてのイベントで `conversationId`・`transcriptPath`・**`modelName`**・`workspacePaths` を `stdin` の JSON としてスクリプトへ渡します（参照：[hooks.md](`<appDataDir>/builtin/skills/agy-customizations/docs/hooks.md`)）。これを使うと、**プロンプト本文や機密情報を外部送信せず、完全ローカルで全自動記録**できます。

### 提案構成：2フック連携 ＋ ローカル台帳（`.agents/hooks.json` または `~/.gemini/config/hooks.json`）

1. **`PreInvocation` フック（モデル名のリアルタイム補完）**
   - 毎回のモデル呼び出し直前に `stdin` から `{conversationId, stepIdx/initialNumSteps, modelName, timestamp}` だけを受け取り、軽量なサイドカーログ（例：`~/.gemini/usage_ledger/invocations/<conversationId>.jsonl`）へ1行追記します。
   - **効果**：`transcript_full.jsonl` に欠落しがちな `modelName`（Planner / Executor / サブエージェント各層）と正確な呼び出し時刻をリアルタイムで捕捉できます。
2. **`Stop` フック（ターン完了時の自動集計・レポート出力）**
   - `terminationReason == "NO_TOOL_CALL"` かつ `fullyIdle == true` のタイミングで自動実行し、以下を一括処理します。
     1. `transcriptPath`（同階層の `transcript_full.jsonl`）を読み込み、ターン別・Planner/Executor別の `input_tokens` / `cache_read_tokens` / `output_tokens` / `max_ctx` / `generate_image` 枚数 / エラー数を集計。
     2. 親の `.system_generated/subagents/*.json`（または `invoke_subagent` の結果）から全子会話の `transcript_full.jsonl` を自動探索して合算。
     3. `PreInvocation` サイドカーの `modelName` と突き合わせ、ローカルに保持したバージョン管理付き単価表（`pricing_rates.json`）で API 換算コストを自動試算。
     4. プロジェクト単位のローカル台帳（`usage_ledger.jsonl` および `usage_report.md`）に**数値メトリクスのみ**を追記（プロンプト本文・ファイル内容・認証情報は一切書き出さない）。

### 設定例（`.agents/hooks.json`）

```json
{
  "usage-telemetry": {
    "enabled": true,
    "PreInvocation": [
      {
        "type": "command",
        "command": "python ./scripts/agy_telemetry_hook.py pre-invocation",
        "timeout": 5
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "python ./scripts/agy_telemetry_hook.py stop-summary",
        "timeout": 15
      }
    ]
  }
}
```

### 運用上の設計ポイント
- **同期ブロッキング対策**：Antigravity のフックは同期実行のため、`PreInvocation` は JSON 1行の追記のみ（数ミリ秒）に留め、集計処理はターン完了時の `Stop` フック（`fullyIdle: true` 時のみ）に限定します。
- **出力契約の厳守**：各フックは最後に必ず標準出力へ有効な JSON（`PreInvocation` は `{}`、`Stop` は `{}`）を返し、エージェントの動作を妨げないようにします。
- **単価表の分離管理**：公式API単価は変更される（例：Argon の 2026-12-01 単価改定）ため、`pricing_rates.json` に有効期間（`effective_from` / `effective_to`）を持たせておき、実行日ベースで自動選択できるようにすると過去プロジェクトの再検証も再現可能になります。
- **プライバシー保護**：台帳には会話ID・タイムスタンプ・モデル名・トークン数・エラー件数・換算額のみを保存し、`.gitignore` 対象または `~/.gemini/usage_ledger/` に置くことで GitHub 等への誤流出を防ぎます。

ご希望であれば、この `agy_telemetry_hook.py` および `hooks.json` を実際にワークスペースへ作成して動作確認するところまで進めることも可能です。