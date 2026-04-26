# ireko 記法ガイド

> 入れ子のダイアグラムを書くためのテキスト形式。
> Mermaid で描ける図をそのまま使い、`ref` で詳細へドリルダウンできます。

---

## 基本構造

`.ireko` ファイルは **ダイアグラムブロック** の集まりです。
ちょうど 1 つのブロックに `@root` を付けてエントリーポイントにします。

```text
@root
diagram "トップレベルの図" {
  sequenceDiagram
    ...ここに Mermaid を書く...
    ref サブフロー名
    ...続き...
}

diagram サブフロー名 "サブフローの表示名" {
  sequenceDiagram
    ...サブフローの詳細...
}
```

ビルドすると、`ref` のある行がクリック可能なマーカーに変わり、
クリックで子ダイアグラムに遷移します。

---

## 文法リファレンス

### ファイル構成

```
ファイル   := (注釈 | ダイアグラム)*
注釈       := "@root"                              ← 直後の diagram に適用
ダイアグラム := "diagram" 識別子? "タイトル" "{" 本体 "}"
本体       := (通常行 | ref行)*
ref行      := 空白* "ref" 識別子 空白* 改行
通常行     := ref行でない任意の行（Mermaid にそのまま渡される）
```

### 識別子

`[A-Za-z_][A-Za-z0-9_]*` — 英字・アンダースコアで始まり、
英数字・アンダースコアが続きます。

```text
diagram TokenExchange "トークン交換" { ... }
          ↑ 識別子        ↑ 表示タイトル
```

### @root（ルート指定）

```text
@root
diagram "メインフロー" {
  ...
}
```

- `@root` はファイル全体でちょうど **1 つ** 必要です。
- ルートのダイアグラムは識別子を省略できます。
- それ以外のダイアグラムは必ず識別子を付けてください。

### ref（参照）

2 つの形式があります。

#### スタンドアロン ref（新しいプレースホルダーを作る）

```text
    ref TokenExchange
```

新しいノート / ノードが挿入され、クリックで遷移先に飛びます。

#### アンカー付き ref（既存の要素に接続する）

```text
    ref Day1 > TLSDetail
```

既存のフローチャートノードやシーケンス participant にドリルダウンを付けます。
新しい要素は作られず、既存の `Day1` がそのままクリック可能になります。

**例：**

```text
@root
diagram "TLS Connection" {
  flowchart LR
    DNS --> TCP --> TLS --> HTTP
    ref DNS > DNSDetail       ← DNS ノードをクリックすると詳細に飛ぶ
    ref TCP > TCPDetail
    ref TLS > TLSDetail
}

diagram DNSDetail "DNS Lookup" {
  sequenceDiagram
    Client->>Resolver: query
    ...
}
```

`>` の前後の空白は自由です（`ref A>B` も `ref A > B` も OK）。

#### 共通ルール

- 行全体が `ref 識別子` または `ref 識別子 > 識別子` であるとき参照として認識されます。
- 先頭の空白は OK ですが、ref の後に他のテキストを置くことはできません。
- 存在しない識別子を ref すると **コンパイルエラー** になります。
- ref が循環するとエラーになります（`A → B → A`）。

### 文字列（タイトル）

ダブルクォートで囲みます。エスケープは `\"` と `\\` のみ。

```text
diagram Foo "He said \"hello\"" { ... }
```

### コメント

ファイルレベル（ダイアグラム本体の外）では `//` で行コメントを書けます。

```text
// これはコメント
@root
diagram "メイン" {
  sequenceDiagram
    // ← これは Mermaid に渡される（ireko はコメント扱いしない）
    A->>B: hello
}
```

### 波括弧 `{}`

- `{` はダイアグラムヘッダーの最後に置きます。**同じ行に本体は書けません。**
- 本体は次の行から始まります。
- `}` はネストの深さを追跡して正しく閉じます（classDiagram のネストに対応）。

---

## 図の種類ごとの ref 変換

ireko は本体の 1 行目で Mermaid の図の種類を判定し、
`ref` をその種類に合った形に変換します。

### スタンドアロン ref の変換

| 種類 | 変換先 | 見た目 |
|------|--------|--------|
| `sequenceDiagram` | `Note over <直前の participant>: 🔍 タイトル` | ノートボックス |
| `flowchart` / `graph` | `__ref_ID__["🔍 タイトル"]` | 新ノード |
| `stateDiagram-v2` | `state "🔍 タイトル" as ID_ref` | 状態スタブ |
| その他 | `%% ref: ID`（コメント） | 見えにくいが動作する |

### アンカー付き ref の変換

| 種類 | 変換先 | 見た目 |
|------|--------|--------|
| `flowchart` / `graph` | `click Anchor "#Target"` + スタイルクラス | 既存ノードがリンクに |
| `sequenceDiagram` | `Note over Anchor: 🔍 タイトル` | 指定 participant のノート |
| `stateDiagram-v2` | `state "🔍 タイトル" as Anchor_ref` | アンカー付きスタブ |
| その他 | `%% ref: Anchor > Target` | コメント |

いずれの場合もクリック可能になります。

---

## Mermaid で気をつけること

ireko はダイアグラム本体をそのまま Mermaid に渡すため、
**Mermaid の構文制限がそのまま適用**されます。よくある注意点：

| やりたいこと | NG | OK |
|---|---|---|
| ノートにセミコロン | `Note over A: a; b; c` | `Note over A: a, b, c` |
| メッセージに `[]` | `A->>B: Token[]` | `A->>B: Token list` |
| メッセージに `()` | 基本的に OK | |
| フローチャートで `%%` | ノード内は OK | |

---

## CLI

```bash
# ビルド（out/ に静的サイトを生成）
npx ireko build flow.ireko -o out/

# ヘルプ
npx ireko --help
```

生成された `out/index.html` をブラウザで開けば即座に使えます。
`file://` でも動作します（データは HTML にインラインされます）。

---

## エラーメッセージ一覧

| エラー | 原因 |
|--------|------|
| `undefined ref: no diagram named 'X'` | ref 先のダイアグラムが未定義 |
| `cycle detected: A -> B -> A` | ref が循環している |
| `duplicate diagram identifier 'X'` | 同じ識別子が 2 回使われている |
| `diagram 'X' references itself` | 自分自身を ref している |
| `only the root diagram may omit its identifier` | 非ルートに識別子がない |
| `no root diagram` | `@root` が見つからない |

循環しないが root から到達できないダイアグラムは **警告** になります。

---

## さらに詳しく

- **README.md** — プロジェクト概要・API ドキュメント
- **examples/** — サンプルファイル集（下記参照）
- **CHANGELOG.md** — 変更履歴
