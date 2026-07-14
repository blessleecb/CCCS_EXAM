/* ===================== Storage helpers ===================== */
const LS_HISTORY = "cccs_history";
const LS_WRONGSET = "cccs_wrongset";
const LS_STREAK = "cccs_streak";
const LS_ATTEMPTED = "cccs_attempted";
const MASTERY_THRESHOLD = 5;
const WEAK_THRESHOLD = 2;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; }
  catch (e) { return []; }
}
function saveHistory(h) { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); }

function loadWrongSet() {
  try { return JSON.parse(localStorage.getItem(LS_WRONGSET)) || {}; }
  catch (e) { return {}; }
}
function saveWrongSet(w) { localStorage.setItem(LS_WRONGSET, JSON.stringify(w)); }

function loadStreaks() {
  try { return JSON.parse(localStorage.getItem(LS_STREAK)) || {}; }
  catch (e) { return {}; }
}
function saveStreaks(s) { localStorage.setItem(LS_STREAK, JSON.stringify(s)); }

function loadAttempted() {
  try { return JSON.parse(localStorage.getItem(LS_ATTEMPTED)) || {}; }
  catch (e) { return {}; }
}
function saveAttempted(a) { localStorage.setItem(LS_ATTEMPTED, JSON.stringify(a)); }
function markAttempted(qid) {
  const attempted = loadAttempted();
  attempted[qid] = true;
  saveAttempted(attempted);
}

function getMasteredIdSet() {
  const streaks = loadStreaks();
  const mastered = new Set();
  Object.keys(streaks).forEach(qid => {
    if (streaks[qid] >= MASTERY_THRESHOLD) mastered.add(Number(qid));
  });
  return mastered;
}
function getPoolIds() {
  const mastered = getMasteredIdSet();
  return QUESTIONS.map(q => q.id).filter(id => !mastered.has(id));
}
function getWeakIds() {
  const wrongSet = loadWrongSet();
  return Object.entries(wrongSet)
    .filter(([, val]) => (val.count || 0) >= WEAK_THRESHOLD)
    .map(([qid]) => Number(qid));
}
function getAttemptedIdSet() {
  const set = new Set();
  Object.keys(loadAttempted()).forEach(qid => set.add(Number(qid)));
  Object.keys(loadWrongSet()).forEach(qid => set.add(Number(qid)));
  Object.keys(loadStreaks()).forEach(qid => set.add(Number(qid)));
  loadHistory().forEach(entry => {
    Object.keys(entry.results || {}).forEach(qid => set.add(Number(qid)));
  });
  return set;
}
function updateStreak(qid, isCorrect) {
  const streaks = loadStreaks();
  streaks[qid] = isCorrect ? (streaks[qid] || 0) + 1 : 0;
  saveStreaks(streaks);
}

/* ===================== Backup export / import ===================== */
function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    history: loadHistory(),
    wrongSet: loadWrongSet(),
    streaks: loadStreaks(),
    attempted: loadAttempted(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `cccs_backup_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function mergeHistory(a, b) {
  const seen = new Set();
  const result = [];
  [...a, ...b].forEach(entry => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    result.push(entry);
  });
  result.sort((x, y) => new Date(x.date) - new Date(y.date));
  return result;
}
function mergeWrongSet(a, b) {
  const merged = { ...a };
  Object.entries(b).forEach(([qid, val]) => {
    const prev = merged[qid];
    if (!prev || (val.count || 0) > (prev.count || 0)) merged[qid] = val;
  });
  return merged;
}
function mergeStreaks(a, b) {
  const merged = { ...a };
  Object.entries(b).forEach(([qid, val]) => {
    merged[qid] = Math.max(merged[qid] || 0, val || 0);
  });
  return merged;
}
function mergeAttempted(a, b) {
  return { ...a, ...b };
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      alert("올바른 백업 파일이 아닙니다.");
      return;
    }
    if (!data || typeof data !== "object") {
      alert("올바른 백업 파일이 아닙니다.");
      return;
    }
    const addedHistory = (data.history || []).length;
    saveHistory(mergeHistory(loadHistory(), data.history || []));
    saveWrongSet(mergeWrongSet(loadWrongSet(), data.wrongSet || {}));
    saveStreaks(mergeStreaks(loadStreaks(), data.streaks || {}));
    saveAttempted(mergeAttempted(loadAttempted(), data.attempted || {}));
    renderHome();
    alert(`가져오기 완료: 백업 속 기록 ${addedHistory}건을 현재 기록과 병합했습니다.`);
  };
  reader.readAsText(file);
}

/* ===================== Utilities ===================== */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join(",");
  const sb = [...b].sort().join(",");
  return sa === sb;
}
function byId(id) { return QUESTIONS.find(q => q.id === id); }

const MODE_LABELS = {
  exam: "실전 모의고사",
  random: "랜덤 테스트",
  all: "전체 문제 풀이",
  wrong: "오답노트",
  review: "오답 복습",
  weak: "Weak Point",
};

/* ===================== App state ===================== */
let session = null; // { mode, ids, index, selected, results, immediate }

/* ===================== DOM refs ===================== */
const viewHome = document.getElementById("view-home");
const viewQuiz = document.getElementById("view-quiz");
const viewResult = document.getElementById("view-result");

const totalCountEl = document.getElementById("totalCount");
const wrongCountEl = document.getElementById("wrongCount");
const historyListEl = document.getElementById("historyList");
const poolCountEl = document.getElementById("poolCount");
const poolTotalEl = document.getElementById("poolTotal");
const attemptedCountEl = document.getElementById("attemptedCount");
const masteredCountEl = document.getElementById("masteredCount");
const weakCountEl = document.getElementById("weakCount");
const weakThresholdDescEl = document.getElementById("weakThresholdDesc");
const examCountDesc = document.getElementById("examCountDesc");
const randomCountDesc = document.getElementById("randomCountDesc");
const allCountDesc = document.getElementById("allCountDesc");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const liveScore = document.getElementById("liveScore");
const qBadge = document.getElementById("qBadge");
const qMultiHint = document.getElementById("qMultiHint");
const qText = document.getElementById("qText");
const optionsList = document.getElementById("optionsList");
const feedbackBox = document.getElementById("feedbackBox");
const feedbackResult = document.getElementById("feedbackResult");
const feedbackKwQ = document.getElementById("feedbackKwQ");
const feedbackKwA = document.getElementById("feedbackKwA");
const feedbackQuestionKo = document.getElementById("feedbackQuestionKo");
const feedbackExplanationEn = document.getElementById("feedbackExplanationEn");
const feedbackExplanationKo = document.getElementById("feedbackExplanationKo");
const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");

const resultScore = document.getElementById("resultScore");
const resultText = document.getElementById("resultText");
const resultDetailList = document.getElementById("resultDetailList");
const reviewWrongBtn = document.getElementById("reviewWrongBtn");

/* ===================== View switching ===================== */
function showView(view) {
  [viewHome, viewQuiz, viewResult].forEach(v => v.hidden = true);
  view.hidden = false;
  window.scrollTo(0, 0);
}

/* ===================== Home rendering ===================== */
function renderHome() {
  totalCountEl.textContent = QUESTIONS.length;
  const wrongSet = loadWrongSet();
  wrongCountEl.textContent = Object.keys(wrongSet).length;

  const poolIds = getPoolIds();
  const masteredCount = QUESTIONS.length - poolIds.length;
  poolCountEl.textContent = poolIds.length;
  poolTotalEl.textContent = QUESTIONS.length;
  masteredCountEl.textContent = masteredCount;
  examCountDesc.textContent = Math.min(60, poolIds.length);
  randomCountDesc.textContent = Math.min(20, poolIds.length);
  allCountDesc.textContent = poolIds.length;
  attemptedCountEl.textContent = getAttemptedIdSet().size;
  weakThresholdDescEl.textContent = WEAK_THRESHOLD;
  weakCountEl.textContent = getWeakIds().length;

  const history = loadHistory();
  if (history.length === 0) {
    historyListEl.innerHTML = '<p class="empty-msg">아직 응시 기록이 없습니다.</p>';
  } else {
    historyListEl.innerHTML = "";
    history.slice().reverse().forEach(entry => {
      const div = document.createElement("div");
      div.className = "history-item";
      const dt = new Date(entry.date);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
      const scoreClass = entry.score >= 70 ? "good" : "bad";
      div.innerHTML = `
        <span class="h-mode">${MODE_LABELS[entry.mode] || entry.mode}</span>
        <span class="h-date">${dateStr}</span>
        <span>${entry.correct}/${entry.total}</span>
        <span class="h-score ${scoreClass}">${entry.score}%</span>
      `;
      div.addEventListener("click", () => showHistoryDetail(entry));
      historyListEl.appendChild(div);
    });
  }
}

document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    const mode = card.dataset.mode;
    if (mode === "wrong") {
      const wrongSet = loadWrongSet();
      const ids = Object.keys(wrongSet).map(Number);
      if (ids.length === 0) {
        alert("오답노트가 비어 있습니다. 문제를 풀다가 틀리면 자동으로 여기에 쌓입니다.");
        return;
      }
      startSession("wrong", shuffle(ids));
      return;
    }
    if (mode === "weak") {
      const ids = getWeakIds();
      if (ids.length === 0) {
        alert(`Weak Point 문제가 없습니다. 같은 문제를 ${WEAK_THRESHOLD}회 이상 틀리면 자동으로 여기에 쌓입니다.`);
        return;
      }
      startSession("weak", shuffle(ids));
      return;
    }
    const poolIds = getPoolIds();
    if (poolIds.length === 0) {
      alert("학습 풀의 모든 문제를 마스터했습니다! 다시 풀려면 '마스터리 초기화'를 눌러주세요.");
      return;
    }
    if (mode === "exam") {
      startSession("exam", shuffle(poolIds).slice(0, 60));
    } else if (mode === "random") {
      startSession("random", shuffle(poolIds).slice(0, 20));
    } else if (mode === "all") {
      startSession("all", shuffle(poolIds));
    }
  });
});

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  if (confirm("모든 응시 기록을 삭제할까요? (오답노트는 유지됩니다)")) {
    saveHistory([]);
    renderHome();
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  exportBackup();
});

const importFileInput = document.getElementById("importFileInput");
document.getElementById("importBtn").addEventListener("click", () => {
  importFileInput.click();
});
importFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  e.target.value = "";
});

document.getElementById("resetMasteryBtn").addEventListener("click", () => {
  if (confirm("마스터리 기록을 초기화하면 모든 문제가 학습 풀로 돌아옵니다. 계속할까요?")) {
    saveStreaks({});
    renderHome();
  }
});

/* ===================== Session / Quiz ===================== */
function startSession(mode, ids) {
  session = {
    mode,
    ids,
    index: 0,
    selected: {},   // qid -> [letters]
    results: {},    // qid -> {selected, isCorrect}
    immediate: mode !== "exam",
  };
  showView(viewQuiz);
  renderQuestion();
}

function currentQuestion() {
  return byId(session.ids[session.index]);
}

function renderQuestion() {
  const q = currentQuestion();
  const idx = session.index;
  const total = session.ids.length;

  progressText.textContent = `${idx + 1} / ${total}`;
  progressFill.style.width = `${((idx) / total) * 100}%`;

  const gradedCount = Object.keys(session.results).length;
  const correctCount = Object.values(session.results).filter(r => r.isCorrect).length;
  liveScore.textContent = gradedCount > 0 ? `현재 ${correctCount}/${gradedCount} 정답` : "";

  qBadge.textContent = `문제 ${q.id}`;
  qMultiHint.hidden = q.answer.length <= 1;
  qText.textContent = q.question;

  optionsList.innerHTML = "";
  const isMulti = q.answer.length > 1;
  const prevSelected = session.selected[q.id] || [];

  Object.entries(q.options).forEach(([letter, text]) => {
    const item = document.createElement("label");
    item.className = "option-item";
    item.dataset.letter = letter;
    const input = document.createElement("input");
    input.type = isMulti ? "checkbox" : "radio";
    input.name = "opt";
    input.value = letter;
    input.checked = prevSelected.includes(letter);
    if (input.checked) item.classList.add("selected");
    input.addEventListener("change", () => onOptionChange(letter, isMulti));
    const letterSpan = document.createElement("span");
    letterSpan.className = "option-letter";
    letterSpan.textContent = letter + ".";
    const textSpan = document.createElement("span");
    textSpan.className = "option-text";
    textSpan.textContent = text;
    item.appendChild(input);
    item.appendChild(letterSpan);
    item.appendChild(textSpan);
    optionsList.appendChild(item);
  });

  const alreadyGraded = session.results[q.id];
  feedbackBox.hidden = true;
  submitBtn.hidden = false;
  nextBtn.hidden = true;
  submitBtn.disabled = prevSelected.length === 0;

  if (session.mode === "exam") {
    submitBtn.textContent = (idx === total - 1) ? "제출하고 채점하기" : "다음 문제";
  } else {
    submitBtn.textContent = "제출";
    if (alreadyGraded) {
      showFeedback(q, alreadyGraded.selected, alreadyGraded.isCorrect);
    }
  }
}

function onOptionChange(letter, isMulti) {
  const q = currentQuestion();
  let sel = session.selected[q.id] || [];
  if (isMulti) {
    if (sel.includes(letter)) sel = sel.filter(l => l !== letter);
    else sel = [...sel, letter];
  } else {
    sel = [letter];
  }
  session.selected[q.id] = sel;

  optionsList.querySelectorAll(".option-item").forEach(el => {
    el.classList.toggle("selected", sel.includes(el.dataset.letter));
  });
  submitBtn.disabled = sel.length === 0;
}

function updateWrongSet(qid, isCorrect) {
  const wrongSet = loadWrongSet();
  if (!isCorrect) {
    const prev = wrongSet[qid] || { count: 0 };
    wrongSet[qid] = { count: prev.count + 1, lastDate: new Date().toISOString() };
  } else {
    delete wrongSet[qid];
  }
  saveWrongSet(wrongSet);
}

function gradeCurrent() {
  const q = currentQuestion();
  const sel = session.selected[q.id] || [];
  const isCorrect = sameSet(sel, q.answer);
  session.results[q.id] = { selected: sel, isCorrect };
  updateWrongSet(q.id, isCorrect);
  updateStreak(q.id, isCorrect);
  markAttempted(q.id);
  return isCorrect;
}

const NO_EXPLANATION_MSG = "이 문제는 원본 자료에 별도의 해설이 제공되지 않습니다.";

function showFeedback(q, sel, isCorrect) {
  feedbackBox.hidden = false;
  feedbackResult.className = "feedback-result " + (isCorrect ? "good" : "bad");
  feedbackResult.textContent = isCorrect
    ? "정답입니다!"
    : `오답입니다. 정답: ${q.answer.join(", ")}`;
  feedbackKwQ.textContent = q.kw_q || "-";
  feedbackKwA.textContent = q.kw_a || "-";
  feedbackQuestionKo.textContent = (q.question_ko && q.question_ko.trim()) ? q.question_ko : NO_EXPLANATION_MSG;
  feedbackExplanationEn.textContent = (q.explanation_en && q.explanation_en.trim()) ? q.explanation_en : NO_EXPLANATION_MSG;
  feedbackExplanationKo.textContent = (q.explanation_ko && q.explanation_ko.trim()) ? q.explanation_ko : NO_EXPLANATION_MSG;

  optionsList.querySelectorAll(".option-item").forEach(el => {
    const letter = el.dataset.letter;
    if (q.answer.includes(letter)) el.classList.add("correct");
    else if (sel.includes(letter)) el.classList.add("incorrect");
  });

  submitBtn.hidden = true;
  const isLast = session.index === session.ids.length - 1;
  nextBtn.hidden = false;
  nextBtn.textContent = isLast ? "결과 보기" : "다음 문제";

  const gradedCount = Object.keys(session.results).length;
  const correctCount = Object.values(session.results).filter(r => r.isCorrect).length;
  liveScore.textContent = `현재 ${correctCount}/${gradedCount} 정답`;
}

submitBtn.addEventListener("click", () => {
  if (session.mode === "exam") {
    gradeCurrent();
    const isLast = session.index === session.ids.length - 1;
    if (isLast) finishSession();
    else { session.index++; renderQuestion(); }
  } else {
    const isCorrect = gradeCurrent();
    const q = currentQuestion();
    showFeedback(q, session.selected[q.id] || [], isCorrect);
  }
});

nextBtn.addEventListener("click", () => {
  const isLast = session.index === session.ids.length - 1;
  if (isLast) finishSession();
  else { session.index++; renderQuestion(); }
});

document.getElementById("quitQuizBtn").addEventListener("click", () => {
  if (confirm("풀이를 그만두고 홈으로 이동할까요? 현재 진행 상황은 저장되지 않습니다.")) {
    session = null;
    renderHome();
    showView(viewHome);
  }
});

/* ===================== Result ===================== */
function finishSession() {
  const total = session.ids.length;
  const gradedIds = session.ids.filter(id => session.results[id]);
  const correct = gradedIds.filter(id => session.results[id].isCorrect).length;
  const score = total > 0 ? Math.round((correct / gradedIds.length || 0) * 100) : 0;

  const entry = {
    id: Date.now(),
    mode: session.mode,
    date: new Date().toISOString(),
    total,
    correct,
    score,
    ids: session.ids,
    results: session.results,
  };
  const history = loadHistory();
  history.push(entry);
  saveHistory(history);

  session = null;
  renderResult(entry);
}

function renderResult(entry) {
  showView(viewResult);
  resultScore.textContent = `${entry.score}%`;
  resultText.textContent = `${MODE_LABELS[entry.mode] || entry.mode} · ${entry.correct} / ${entry.total} 문제 정답`;

  const wrongIds = entry.ids.filter(id => !entry.results[id] || !entry.results[id].isCorrect);
  reviewWrongBtn.hidden = wrongIds.length === 0;
  reviewWrongBtn.onclick = () => startSession("review", shuffle(wrongIds));

  resultDetailList.innerHTML = "";
  entry.ids.forEach(id => {
    const q = byId(id);
    const r = entry.results[id];
    const isCorrect = r ? r.isCorrect : false;
    const selected = r ? r.selected : [];

    const explEn = (q.explanation_en && q.explanation_en.trim()) ? q.explanation_en : NO_EXPLANATION_MSG;
    const explKo = (q.explanation_ko && q.explanation_ko.trim()) ? q.explanation_ko : NO_EXPLANATION_MSG;
    const questionKo = (q.question_ko && q.question_ko.trim()) ? q.question_ko : NO_EXPLANATION_MSG;

    const item = document.createElement("div");
    item.className = "result-detail-item";
    item.innerHTML = `
      <div class="rd-head">
        <span class="rd-icon ${isCorrect ? "good" : "bad"}">${isCorrect ? "✓" : "✗"}</span>
        <span class="rd-q">문제 ${q.id}. ${q.question}</span>
      </div>
      <div class="rd-body">
        <div class="rd-answer-line"><b>내 답:</b> ${selected.length ? selected.join(", ") : "(미응답)"}</div>
        <div class="rd-answer-line"><b>정답:</b> ${q.answer.join(", ")}</div>
        <div class="keyword-row">
          <span class="keyword-tag kw-q"><b>문제 키워드</b> ${q.kw_q || "-"}</span>
          <span class="keyword-tag kw-a"><b>답변 키워드</b> ${q.kw_a || "-"}</span>
        </div>
        <div class="feedback-explanation">
          <h3>문제 (한글)</h3>
          <p>${questionKo}</p>
          <h3>해설 (EN)</h3>
          <p>${explEn}</p>
          <h3>해설 (한글)</h3>
          <p>${explKo}</p>
        </div>
      </div>
    `;
    item.addEventListener("click", () => item.classList.toggle("open"));
    resultDetailList.appendChild(item);
  });
}

function showHistoryDetail(entry) {
  renderResult(entry);
}

document.getElementById("backHomeBtn").addEventListener("click", () => {
  renderHome();
  showView(viewHome);
});

/* ===================== Init ===================== */
renderHome();
showView(viewHome);
