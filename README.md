# daizen-webtest
基本大全連動ウェブテスト

KaTeX ・・・KaTeXをローカルで使用するフォルダ(GitHubで手に入る https://github.com/KaTeX/KaTeX/releases)  
　　　　　　Assetsの中の.zipをDL  
index.html ・・・トップページ  
┣数学I第1章：数と式  
┃　┣M1-1-1-1 第1章第1節1番　様々な用語　長い場合は layout: 'vertical' // ★★★ 目印を追加 ★★★　を追加  
┃　┣M1-1-1-2 第1章第1節2番　整式の加法と減法  
┃　┣M1-1-1-3 第1章第1節3番　単項式の乗法  
┃　┣M1-1-1-4 第1章第1節4番　多項式の乗法  

工事中。以下は工事予定のファイル構成
daizen-webtest/
├─ index.html                  ← トップ（そのまま）※ランク自動検出のJSだけ入替済み
├─ quiz.html                   ← 全クイズで共通に使うページ（?id=... で切替）
│
├─ common/
│   ├─ quiz-core.js            ← クイズの共通ロジック
│   └─ quiz.css                ← クイズの共通スタイル
│
├─ data/
│   ├─ M1-1-1-1.json           ← 例：第1節-1 データ（任意。用意できたものから）
│   ├─ M1-1-1-2.json
│   ├─ M1-1-1-3.json
│   ├─ M1-1-1-4.json
│   └─ M1-1-2-1.json           ← 例：(x+a)(x+b)の展開データ
│
├─ katex/                      ← 既存のKaTeX（そのまま）
│   ├─ katex.min.css
│   ├─ katex.min.js
│   └─ contrib/
│       └─ auto-render.min.js
│
├─ images/                     ←（任意）トップや他ページの画像
├─ assets/ css/ js/            ←（任意）もし既にあればそのまま
│
├─ M1-1-1-1.html               ← 既存の個別ページ（残してOK／不要になったら削除可）
├─ M1-1-1-2.html
├─ M1-1-1-3.html
├─ M1-1-1-4.html
└─ M1-1-2-1.html
