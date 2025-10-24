/* =========================================================
 *  common/quiz-core.js
 *  共通クイズロジック
 *  - JSON: ./data/<quizId>.json （{ "allQuizData": [...] } 形式）
 *  - URL:  quiz.html?id=<quizId>&n=all  または &n=10 など
 *  - ランク保存キー: localStorage.setItem('quizRank_' + quizId, rank)
 * =======================================================*/

/* ---------- ユーティリティ ---------- */
function getParam(name, defaultValue = null) {
  const u = new URL(location.href);
  return u.searchParams.get(name) ?? defaultValue;
}

function getQuizId() {
  return getParam('id', 'M1-1-2-1'); // デフォルトID（任意で変更）
}

async function loadQuizData(quizId) {
  const res = await fetch(`./data/${quizId}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ./data/${quizId}.json (${res.status})`);
  const json = await res.json();
  const arr = Array.isArray(json.allQuizData) ? json.allQuizData : [];
  return arr;
}

function shuffleArray(array) {
  const s = [...array];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function applySavedBackgroundPreference() {
  const storageKey = 'backgroundColorPreference';
  try {
    const saved = localStorage.getItem(storageKey);
    document.body.classList.remove('bg-light-blue', 'bg-light-green', 'bg-beige');
    if (saved && saved !== 'default') document.body.classList.add('bg-' + saved);
  } catch (e) {
    console.warn('背景色適用に失敗:', e);
  }
}

/* ---------- メイン ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // 背景色（トップと同じ設定を適用）
  applySavedBackgroundPreference();

  // KaTeXの区切り
  const katexDelimiters = [
    { left: '$$', right: '$$', display: true },
    { left: '$',  right: '$',  display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true }
  ];

  // DOM参照
  const pageTitle       = document.getElementById('page-title');
  const quizContainer   = document.getElementById('quiz-container');
  const resultsContainer= document.getElementById('results-container');
  const questionNumberEl= document.getElementById('question-number');
  const questionTextEl  = document.getElementById('question-text');
  const optionsContainer= document.getElementById('options-container');
  const feedbackEl      = document.getElementById('feedback');
  const nextBtn         = document.getElementById('next-btn');
  const resultsBtn      = document.getElementById('results-btn');
  const scoreTextEl     = document.getElementById('score-text');
  const finalMessageEl  = document.getElementById('final-message');

  // パラメータ
  const quizId = getQuizId();
  pageTitle.textContent = `クイズ: ${quizId}`;
  const nParam = getParam('n', '10'); // 'all' or 数値文字列

  // 状態
  let currentQuestionIndex = 0;
  let score = 0;
  let quizData = [];

  // データ読み込み
  try {
    const allQuizData = await loadQuizData(quizId);

    // 出題数の決定：&n=all で全問、&n=15 で15問、未指定は10
    const shuffled = shuffleArray(allQuizData);
    if (nParam === 'all') {
      quizData = shuffled;
    } else {
      const n = Math.max(1, parseInt(nParam, 10) || 10);
      quizData = shuffled.slice(0, Math.min(n, allQuizData.length));
    }

    if (quizData.length === 0) {
      throw new Error('問題データが空です。JSONの "allQuizData" を確認してください。');
    }
  } catch (e) {
    console.error(e);
    questionNumberEl.textContent = 'エラー';
    questionTextEl.innerHTML = '問題データの読み込みに失敗しました。<br>JSONの形式・パスを確認してください。';
    try { renderMathInElement(questionTextEl, { delimiters: katexDelimiters }); } catch {}
    return;
  }

  // レンダリング補助
  function renderMath(target) {
    try { renderMathInElement(target, { delimiters: katexDelimiters }); } catch (e) {
      console.warn('KaTeX render error:', e);
    }
  }

  // 問題ロード
  function loadQuestion() {
    if (currentQuestionIndex >= quizData.length) return;

    // 初期化
    feedbackEl.style.display = 'none';
    feedbackEl.className = '';
    nextBtn.style.display = 'none';
    resultsBtn.style.display = 'none';
    optionsContainer.innerHTML = '';

    // 表示
    const q = quizData[currentQuestionIndex];
    questionNumberEl.textContent = `問題 ${currentQuestionIndex + 1} / ${quizData.length}`;
    questionTextEl.innerHTML = q.question || '(問題文なし)';

    // 縦並び指定（必要なら question.layout === 'vertical'）
    if (q.layout === 'vertical') optionsContainer.classList.add('options-vertical');
    else optionsContainer.classList.remove('options-vertical');

    // 選択肢
    const opts = shuffleArray(q.options || []);
    if (!opts.length) {
      optionsContainer.innerHTML = '<p>(選択肢なし)</p>';
    } else {
      opts.forEach(text => {
        const el = document.createElement('div');
        el.className = 'option-box';
        el.dataset.value = text;
        el.innerHTML = text || '(選択肢なし)';
        el.addEventListener('click', () => selectAnswer(el, text, q.answer, q.rationale));
        optionsContainer.appendChild(el);
      });
    }

    // 数式レンダリング
    renderMath(questionTextEl);
    renderMath(optionsContainer);
  }

  // 回答選択
  function selectAnswer(selectedEl, selected, correct, rationale) {
    // 二度押し無効
    if (feedbackEl.style.display === 'block') return;

    // 全選択肢をdisable & 正誤スタイル
    Array.from(optionsContainer.querySelectorAll('.option-box'
