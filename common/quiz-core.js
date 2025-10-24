// /common/quiz-core.js
(function () {
  "use strict";

  // ====== ユーティリティ ======
  const qs = new URLSearchParams(location.search);
  const quizId = qs.get("id");           // 例: M1-1-1-2
  const limitN = Math.max(1, parseInt(qs.get("n") || "10", 10));

  if (!quizId) {
    console.error("クエリに id がありません。例: quiz.html?id=M1-1-1-2&n=10");
    renderError("URL に id パラメータがありません。例: <code>quiz.html?id=M1-1-1-2&n=10</code>");
    return;
  }

  // JSON の探索候補（存在するものから読み込み）
  const jsonCandidates = [
    `./${quizId}.json`,
    `./data/${quizId}.json`,
    `./common/data/${quizId}.json`,
    `../${quizId}.json`,
    `../data/${quizId}.json`
  ];

  function $(sel, root = document) { return root.querySelector(sel); }
  function $el(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rankFromRatio(ratio) {
    // しきい値：S:90%以上, A:75%以上, B:50%以上, C:それ未満
    if (ratio >= 0.9) return "S";
    if (ratio >= 0.75) return "A";
    if (ratio >= 0.5) return "B";
    return "C";
  }

  function renderError(msg) {
    const main = document.body || document.documentElement;
    const wrap = $el("div", { class: "container" }, [
      $el("h2", { html: "読み込みエラー" }),
      $el("p", { html: msg })
    ]);
    main.appendChild(wrap);
  }

  async function fetchFirstAvailable(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("JSON の取得に失敗しました。");
  }

  function normalizeQuestions(raw) {
    // 新フォーマット：{ meta, questions: [ ... ] }
    if (raw && Array.isArray(raw.questions)) {
      return {
        meta: raw.meta || null,
        questions: raw.questions
      };
    }
    // 旧フォーマット：{ allQuizData: [ { question, options, answer, rationale } ... ] } あるいは二重配列
    if (raw && Array.isArray(raw.allQuizData)) {
      let flat = [];
      for (const item of raw.allQuizData) {
        if (Array.isArray(item)) {
          flat = flat.concat(item);
        } else {
          flat.push(item);
        }
      }
      return {
        meta: raw.meta || null,
        questions: flat
      };
    }
    // 上記以外は questions として解釈不能
    throw new Error("問題データの形式が想定外です。");
  }

  // ====== 画面生成 ======
  const app = $el("div", { class: "quiz-app" });
  const header = $el("div", { class: "quiz-header" });
  const titleEl = $el("h2", { class: "quiz-title", html: `テスト: ${quizId}` });
  const metaEl = $el("div", { class: "quiz-meta" });
  const progressEl = $el("div", { class: "quiz-progress" });

  const qWrap = $el("div", { class: "quiz-question-wrap" });
  const qText = $el("div", { class: "quiz-question" });
  const optsWrap = $el("div", { class: "quiz-options" });
  const actionWrap = $el("div", { class: "quiz-actions" });
  const checkBtn = $el("button", { class: "quiz-check" }, "解答する");
  const nextBtn = $el("button", { class: "quiz-next", disabled: "true" }, "次へ");

  const feedback = $el("div", { class: "quiz-feedback" });
  const resultWrap = $el("div", { class: "quiz-result" });

  header.appendChild(titleEl);
  header.appendChild(metaEl);
  header.appendChild(progressEl);

  qWrap.appendChild(qText);
  qWrap.appendChild(optsWrap);
  actionWrap.appendChild(checkBtn);
  actionWrap.appendChild(nextBtn);

  const container = $el("div", { class: "container" }, [
    header, qWrap, actionWrap, feedback, resultWrap
  ]);
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(container);
  });

  // ====== ロジック ======
  let questions = [];
  let currentIdx = 0;
  let correctCount = 0;
  let usedOrder = []; // 出題順インデックス
  let currentAnswer = null;
  let answered = false;

  function applyMathJax() {
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      window.MathJax.typesetPromise().catch(() => {});
    } else if (window.MathJax && typeof window.MathJax.typeset === "function") {
      window.MathJax.typeset();
    }
  }

  function setMeta(meta) {
    if (!meta) return;
    const bits = [];
    if (meta.subject) bits.push(meta.subject);
    if (meta.chapter) bits.push(meta.chapter);
    if (meta.section) bits.push(meta.section);

    if (bits.length) {
      metaEl.innerHTML = bits.join(" / ");
    }

    // 学びエイドリンクがあれば表示
    const link = meta.bookLinks && meta.bookLinks.lesson;
    if (link) {
      const a = $el("a", { href: link, target: "_blank" }, "解説動画（学びエイド）");
      metaEl.appendChild($el("div", {}, a));
    }
  }

  function renderProgress() {
    progressEl.textContent = `進捗: ${currentIdx + 1} / ${usedOrder.length}　正答: ${correctCount}`;
  }

  function renderQuestion() {
    answered = false;
    feedback.innerHTML = "";
    nextBtn.disabled = true;
    optsWrap.innerHTML = "";
    qText.innerHTML = "";

    const q = questions[usedOrder[currentIdx]];
    // 質問本文（HTML許可）
    qText.innerHTML = q.question || "";

    // 選択肢
    const opts = Array.isArray(q.options) ? q.options.slice() : [];
    const layout = (q.layout === "vertical") ? "vertical" : "normal";
    optsWrap.className = "quiz-options" + (layout === "vertical" ? " vertical" : "");

    opts.forEach((opt, i) => {
      const id = `opt_${currentIdx}_${i}`;
      const label = $el("label", { class: "quiz-option" });
      const input = $el("input", { type: "radio", name: `q_${currentIdx}`, id });
      const span = $el("span", { class: "quiz-option-text", html: opt });

      input.addEventListener("change", () => { currentAnswer = opt; });

      label.appendChild(input);
      label.appendChild(span);
      optsWrap.appendChild(label);
    });

    renderProgress();
    applyMathJax();
  }

  function lockOptions() {
    optsWrap.querySelectorAll("input[type=radio]").forEach((inp) => inp.disabled = true);
  }

  function revealAnswer(q, isCorrect) {
    const correct = q.answer;
    const rat = q.rationale || "";

    feedback.innerHTML = "";
    feedback.appendChild($el("div", {
      class: "judge " + (isCorrect ? "correct" : "wrong"),
      html: isCorrect ? "✔ 正解！" : "✖ 不正解"
    }));
    feedback.appendChild($el("div", { class: "correct-ans", html: `正答：${correct}` }));
    if (rat) {
      feedback.appendChild($el("div", { class: "rationale", html: rat }));
    }
    applyMathJax();
  }

  function onCheck() {
    if (answered) return;
    const q = questions[usedOrder[currentIdx]];
    if (currentAnswer == null) {
      alert("選択肢を選んでください。");
      return;
    }
    answered = true;
    lockOptions();

    const isCorrect = String(currentAnswer).trim() === String(q.answer).trim();
    if (isCorrect) correctCount++;

    revealAnswer(q, isCorrect);
    nextBtn.disabled = false;
  }

  function onNext() {
    if (!answered) return;
    currentIdx++;
    if (currentIdx >= usedOrder.length) {
      finish();
    } else {
      renderQuestion();
    }
  }

  function finish() {
    qWrap.style.display = "none";
    actionWrap.style.display = "none";
    feedback.style.display = "none";

    const total = usedOrder.length;
    const ratio = total ? correctCount / total : 0;
    const rank = rankFromRatio(ratio);

    // ランク保存（index.html の表示と連動）
    try {
      localStorage.setItem("quizRank_" + quizId, rank);
    } catch (e) {
      console.warn("ランクの保存に失敗:", e);
    }

    resultWrap.innerHTML = "";
    resultWrap.appendChild($el("h3", { html: "結果" }));
    resultWrap.appendChild($el("p", { html: `スコア：${correctCount} / ${total}（${Math.round(ratio * 100)}%）` }));
    resultWrap.appendChild($el("p", { html: `ランク：<strong>${rank}</strong>` }));
    const back = $el("a", { href: "index.html" }, "← テスト一覧へ戻る");
    resultWrap.appendChild($el("p", {}, back));
  }

  checkBtn.addEventListener("click", onCheck);
  nextBtn.addEventListener("click", onNext);

  // ====== 起動 ======
  (async () => {
    let raw;
    try {
      raw = await fetchFirstAvailable(jsonCandidates);
    } catch (e) {
      console.error(e);
      renderError(`問題ファイル <code>${quizId}.json</code> を読み込めませんでした。（配置場所やファイル名を確認してください）`);
      return;
    }

    let normalized;
    try {
      normalized = normalizeQuestions(raw);
    } catch (e) {
      console.error(e);
      renderError("問題データの構造が不正です。キーや配列の形を見直してください。");
      return;
    }

    setMeta(normalized.meta);

    // 問題を決める（シャッフル→先頭 limitN 件）
    const all = normalized.questions || [];
    if (!all.length) {
      renderError("問題が0件です。");
      return;
    }
    const picked = shuffle(all).slice(0, limitN);

    // 内部に保持
    questions = picked;
    usedOrder = [...picked.keys()];

    // タイトルも置き換え
    if (normalized.meta && (normalized.meta.section || normalized.meta.chapter)) {
      const t = [normalized.meta.section, normalized.meta.chapter, normalized.meta.subject]
        .filter(Boolean)
        .join(" / ");
      if (t) titleEl.innerHTML = t;
    }

    renderQuestion();
  })();

  // ====== 簡単なスタイル（必要なら調整） ======
  const baseCss = `
  .quiz-app { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif; }
  .quiz-header { margin-bottom: 10px; }
  .quiz-title { margin: 0 0 4px; }
  .quiz-meta { color:#555; font-size: 0.95em; margin-bottom: 6px;}
  .quiz-progress { color:#333; font-weight: 600; margin: 10px 0 16px; }
  .quiz-question { padding: 16px; background:#f8f9fa; border-radius:8px; }
  .quiz-options { display:grid; gap:10px; margin-top:14px; }
  .quiz-options.vertical .quiz-option { display:flex; align-items:flex-start; }
  .quiz-option { display:flex; gap:10px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer; }
  .quiz-option input { margin-top:2px; }
  .quiz-actions { display:flex; gap:8px; margin:16px 0; }
  .quiz-actions button { padding:10px 14px; border:1px solid #ccc; border-radius:6px; background:#fff; cursor:pointer; }
  .quiz-actions button:disabled { opacity:.5; cursor:not-allowed; }
  .quiz-feedback { padding:12px; border-top:1px solid #eee; }
  .judge { font-weight:bold; margin-bottom:8px; }
  .judge.correct { color:#2e7d32; }
  .judge.wrong { color:#c62828; }
  .correct-ans { margin-bottom:8px; }
  .quiz-result { padding:16px; background:#f6f7f9; border-radius:8px; margin-top:12px; }
  `;
  const style = $el("style", { html: baseCss });
  document.head.appendChild(style);
})();
