(function () {
  "use strict";

  const DATA = window.EXAM_DATA.questions;
  const LETTERS = ["ก", "ข", "ค", "ง"];
  const STORAGE_KEY = "sobborihan-progress-v1";

  const state = {
    view: "home",
    navOpen: false,
    mode: "instant",
    source: "ทั้งหมด",
    count: 20,
    session: null,
    startedAt: null,
    elapsed: 0,
    timerId: null,
    saved: loadProgress(),
    sessions: JSON.parse(localStorage.getItem("sobborihan-sessions-v1")||"[]"),
  };

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        attempts: [],
        sessions: [],
        mistakes: {},
        bookmarks: {},
        topicStats: {},
      };
    } catch {
      return { attempts: [], sessions: [], mistakes: {}, bookmarks: {}, topicStats: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
  }

  function icon(name, cls = "") {
    return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function getSourceOptions() {
    return [
      "ทั้งหมด",
      ...new Set([
        ...DATA.map((question) => question.set),
        ...DATA.map((question) => question.topic),
      ]),
    ];
  }

  function filteredPool() {
    if (state.source === "ทั้งหมด") return DATA;
    if (state.source === "ข้อที่เคยผิด") {
      return DATA.filter((question) => state.saved.mistakes[question.id]);
    }
    if (state.source === "ข้อที่บันทึก") {
      return DATA.filter((question) => state.saved.bookmarks[question.id]);
    }
    return DATA.filter((question) => question.set === state.source || question.topic === state.source);
  }

  function startSession(customPool) {
    const pool = customPool || filteredPool();
    if (!pool.length) {
      alert("ยังไม่มีข้อสอบในหมวดนี้");
      return;
    }
    const selected = shuffle(pool).slice(0, Math.min(Number(state.count), pool.length));
    state.session = {
      questions: selected,
      index: 0,
      answers: {},
      revealed: {},
      complete: false,
    };
    state.startedAt = Date.now();
    state.elapsed = 0;
    state.view = "quiz";
    startTimer();
    render();
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (!state.startedAt || state.view !== "quiz") return;
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      const timer = document.querySelector("[data-timer]");
      if (timer) timer.textContent = formatTime(state.elapsed);
    }, 1000);
  }

  function answerQuestion(answerIndex) {
    const question = currentQuestion();
    if (!question || state.session.revealed[question.id]) return;
    state.session.answers[question.id] = answerIndex;
    if (state.mode === "instant") state.session.revealed[question.id] = true;
    render();
  }

  function currentQuestion() {
    return state.session?.questions[state.session.index];
  }

  function scoreSession() {
    const questions = state.session.questions;
    const answered = questions.filter((q) => state.session.answers[q.id] !== undefined);
    const correct = answered.filter((q) => state.session.answers[q.id] === q.answer);
    return { total: questions.length, answered: answered.length, correct: correct.length };
  }

  function nextQuestion() {
    if (state.session.index < state.session.questions.length - 1) {
      state.session.index += 1;
      render();
      return;
    }
    finishSession();
  }

  function finishSession() {
    clearInterval(state.timerId);
    state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    if (state.mode === "exam") {
      state.session.questions.forEach((q) => {
        state.session.revealed[q.id] = true;
      });
    }
    const score = scoreSession();
    const topicSummary = {};
    state.session.questions.forEach((question) => {
      const chosen = state.session.answers[question.id];
      const correct = chosen === question.answer;
      if (!topicSummary[question.topic]) topicSummary[question.topic] = { correct: 0, total: 0 };
      topicSummary[question.topic].total += 1;
      if (correct) topicSummary[question.topic].correct += 1;
      if (!state.saved.topicStats[question.topic]) state.saved.topicStats[question.topic] = { correct: 0, total: 0 };
      state.saved.topicStats[question.topic].total += 1;
      if (correct) {
        state.saved.topicStats[question.topic].correct += 1;
        delete state.saved.mistakes[question.id];
      } else {
        state.saved.mistakes[question.id] = {
          chosen,
          lastSeen: new Date().toISOString(),
        };
      }
    });
    state.saved.attempts.unshift({
      date: new Date().toISOString(),
      correct: score.correct,
      total: score.total,
      elapsed: state.elapsed,
      source: state.source,
      topics: topicSummary,
    });
    state.saved.attempts = state.saved.attempts.slice(0, 50);
    saveProgress();
    state.lastResult={score,elapsed:state.elapsed,date:new Date().toISOString(),source:state.source};
    state.session.complete = true;
    state.view = "results";
    render();
  }

  
  function saveNamedSession() {
    const name = prompt("ชื่อ Session (เช่น Pre-test ก่อนเรียน)");
    if (!name) return;
    const type = prompt("ประเภท Session","สอบจำลอง") || "อื่นๆ";
    const score = scoreSession();
    const percent = Math.round((score.correct / score.total) * 100);
    state.saved.sessions = state.saved.sessions || [];
    state.saved.sessions.unshift({name,type,percent,correct:score.correct,total:score.total,date:new Date().toISOString()});
    saveProgress();
    alert("บันทึก Session เรียบร้อย");
  }

  function deleteSession(index){
    if(!confirm("ลบ Session นี้?")) return;
    state.saved.sessions.splice(index,1);
    saveProgress();
    render();
  }

function overallStats() {
    const attempts = state.saved.attempts;
    const total = attempts.reduce((sum, item) => sum + item.total, 0);
    const correct = attempts.reduce((sum, item) => sum + item.correct, 0);
    return {
      attempts: attempts.length,
      total,
      correct,
      percent: total ? Math.round((correct / total) * 100) : 0,
    };
  }

  function topicBars(stats, limit = 8) {
    const entries = Object.entries(stats)
      .map(([topic, value]) => ({
        topic,
        ...value,
        percent: value.total ? Math.round((value.correct / value.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
    if (!entries.length) return `<div class="empty-state">ทำข้อสอบอย่างน้อย 1 ชุดเพื่อดูผลรายหัวข้อ</div>`;
    return `<div class="topic-list">${entries
      .map(
        (item) => `
          <div>
            <div class="topic-line-head"><span>${escapeHtml(item.topic)}</span><strong>${item.percent}%</strong></div>
            <div class="topic-track"><div class="topic-bar" style="width:${item.percent}%;${item.percent < 50 ? "background:var(--red)" : ""}"></div></div>
          </div>`,
      )
      .join("")}</div>`;
  }

  function shell(content) {
    const progress = state.session && state.view === "quiz"
      ? Math.round(((state.session.index + 1) / state.session.questions.length) * 100)
      : 0;
    const title = state.view === "quiz" ? state.source : "เตรียมสอบ ป.โท บริหารการศึกษา";
    return `
      <div class="app-shell">
        <header class="topbar">
          <button class="menu-button" data-action="toggle-nav" aria-label="เปิดเมนู">${icon("menu")}</button>
          <div class="brand">สอบบริหาร</div>
          <div class="topbar-context">
            <div class="topbar-title">${escapeHtml(title)}</div>
            ${state.view === "quiz" ? `
              <div class="top-progress">
                <strong>${state.session.index + 1}/${state.session.questions.length}</strong>
                <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
                <span>${progress}%</span>
              </div>
              <div class="timer">${icon("clock")}<span>เวลาที่ใช้</span> <strong data-timer>${formatTime(state.elapsed)}</strong></div>
            ` : ""}
          </div>
        </header>
        <aside class="sidebar ${state.navOpen ? "open" : ""}">
          ${navButton("home", "home", "หน้าหลัก")}
          ${navButton("practice", "edit", "ฝึกทำข้อสอบ")}
          ${navButton("mistakes", "x", "ข้อที่ทำผิด", Object.keys(state.saved.mistakes).length)}
          ${navButton("analytics", "chart", "วิเคราะห์ผล")}${navButton("sessions", "bookmark", "Sessions")}${navButton("sessions", "bookmark", "Sessions")}
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }

  function navButton(view, iconName, label, count = "") {
    const active = (view === "practice" && state.view === "quiz") || state.view === view;
    return `<button class="nav-button ${active ? "active" : ""}" data-view="${view}">
      ${icon(iconName)}<span>${label}</span>${count !== "" ? `<span class="nav-count">${count}</span>` : ""}
    </button>`;
  }

  function homeView() {
    const stats = overallStats();
    const sources = getSourceOptions();
    return shell(`
      <div class="page">
        <h1 class="page-title">วันนี้จะฝึกเรื่องไหนดี</h1>
        <p class="page-lead">ข้อสอบทั้งหมด ${DATA.length.toLocaleString("th-TH")} ข้อ จากเอกสารที่นำเข้า พร้อมเฉลยและบันทึกจุดที่ต้องทบทวน</p>
        <div class="dashboard-grid">
          <section class="panel start-panel">
            <h2 class="section-title">ตั้งค่าชุดฝึก</h2>
            <div class="form-grid">
              <div class="field">
                <label for="source">เลือกชุดหรือหัวข้อ</label>
                <select id="source" data-setting="source">
                  ${sources.map((item) => `<option ${state.source === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
                  <option ${state.source === "ข้อที่เคยผิด" ? "selected" : ""}>ข้อที่เคยผิด</option>
                  <option ${state.source === "ข้อที่บันทึก" ? "selected" : ""}>ข้อที่บันทึก</option>
                </select>
              </div>
              <div class="field">
                <label for="count">จำนวนข้อ</label>
                <select id="count" data-setting="count">
                  ${[10, 20, 30, 50, 100, 560].map((count) => `<option value="${count}" ${Number(state.count) === count ? "selected" : ""}>${count} ข้อ</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="mode-group">
              <button class="mode-option ${state.mode === "instant" ? "selected" : ""}" data-mode="instant">
                <strong>เรียนรู้ทันที</strong><span>ตอบแล้วเห็นเฉลย เคล็ดลับ และจุดที่สับสน</span>
              </button>
              <button class="mode-option ${state.mode === "exam" ? "selected" : ""}" data-mode="exam">
                <strong>จำลองสอบจริง</strong><span>เก็บเฉลยไว้ดูพร้อมกันเมื่อทำเสร็จ</span>
              </button>
            </div>
            <button class="primary-button start-button" data-action="start">เริ่มทำข้อสอบ ${icon("edit")}</button>
          </section>
          <aside class="panel">
            <h2 class="section-title">ภาพรวมของคุณ</h2>
            <div class="stat-stack">
              <div class="stat-row"><div><div class="stat-label">ความแม่นยำสะสม</div><div class="stat-value">${stats.percent}%</div></div><strong>${stats.correct}/${stats.total}</strong></div>
              <div class="stat-row"><div><div class="stat-label">ทำข้อสอบแล้ว</div><div class="stat-value">${stats.attempts}</div></div><strong>ครั้ง</strong></div>
              <div class="stat-row"><div><div class="stat-label">รอทบทวน</div><div class="stat-value">${Object.keys(state.saved.mistakes).length}</div></div><strong>ข้อ</strong></div>
            </div>
          </aside>
        </div>
        <section class="panel" style="margin-top:22px">
          <h2 class="section-title">ความแม่นยำรายหัวข้อ</h2>
          ${topicBars(state.saved.topicStats)}
        </section>
      </div>`);
  }

  function quizView() {
    const question = currentQuestion();
    const chosen = state.session.answers[question.id];
    const revealed = state.session.revealed[question.id];
    const score = scoreSession();
    const percent = score.answered ? Math.round((score.correct / score.answered) * 100) : 0;
    const visiblePercent = state.mode === "exam" ? 0 : percent;
    const isLast = state.session.index === state.session.questions.length - 1;
    const bookmarked = state.saved.bookmarks[question.id];

    return shell(`
      <div class="quiz-layout">
        <section class="question-column">
          <div class="question-meta">
            <div class="question-number">ข้อ ${state.session.index + 1} <span>/ ${state.session.questions.length}</span></div>
            <button class="bookmark-button ${bookmarked ? "saved" : ""}" data-action="bookmark">${icon("bookmark")} ${bookmarked ? "บันทึกแล้ว" : "บันทึกข้อนี้"}</button>
          </div>
          <h1 class="question-text">${escapeHtml(question.question)}</h1>
          <div class="choices">
            ${question.options.map((option, index) => {
              let cls = "";
              let status = "";
              if (revealed && index === question.answer) {
                cls = "correct";
                status = icon("check");
              } else if (revealed && index === chosen && chosen !== question.answer) {
                cls = "incorrect";
                status = icon("x");
              }
              return `<button class="choice ${cls}" data-answer="${index}" ${revealed ? "disabled" : ""}>
                <span class="choice-key">${LETTERS[index]}</span>
                <span>${escapeHtml(option)}</span>
                <span class="choice-status">${status}</span>
              </button>`;
            }).join("")}
          </div>
          ${revealed ? feedback(question, chosen) : ""}
          <div class="question-actions">
            <button class="secondary-button" data-action="previous" ${state.session.index === 0 ? "disabled" : ""}>← ข้อก่อนหน้า</button>
            ${state.mode === "exam" && chosen !== undefined && !revealed ? `<button class="secondary-button" data-action="clear-answer">ล้างคำตอบ</button>` : ""}
            <button class="primary-button" data-action="next" ${chosen === undefined ? "disabled" : ""}>${isLast ? "ดูสรุปคะแนน" : "ข้อต่อไป"} →</button>
          </div>
        </section>
        <aside class="score-column">
          <div class="score-card">
            <h3>ภาพรวมชุดนี้</h3>
            <div class="score-ring" style="--score:${visiblePercent}%"><div class="score-ring-inner"><span>${state.mode === "exam" ? "ความคืบหน้า" : "คะแนนปัจจุบัน"}</span><strong>${state.mode === "exam" ? score.answered : `${percent}%`}</strong><span>${state.mode === "exam" ? `ตอบแล้ว ${score.answered} ข้อ` : `${score.correct} / ${score.answered} ข้อ`}</span></div></div>
            <div class="score-details">
              <div><strong style="color:var(--green)">${state.mode === "exam" ? "–" : score.correct}</strong>ถูก</div>
              <div><strong style="color:var(--red)">${state.mode === "exam" ? "–" : score.answered - score.correct}</strong>ผิด</div>
              <div><strong>${score.total - score.answered}</strong>ยังไม่ทำ</div>
            </div>
          </div>
          <div class="score-card">
            <h3>หัวข้อของข้อนี้</h3>
            <strong>${escapeHtml(question.topic)}</strong>
            <p style="color:var(--muted);font-size:14px;margin-bottom:0">${escapeHtml(question.set)} · ข้อเดิมที่ ${question.number}</p>
          </div>
        </aside>
      </div>`);
  }

  function feedback(question, chosen) {
    const correct = chosen === question.answer;
    return `
      <div class="feedback ${correct ? "" : "wrong"}">
        <div class="feedback-title">${correct ? "ตอบถูกต้อง" : `ยังไม่ถูก คำตอบคือ ${LETTERS[question.answer]}`}</div>
        <p>${escapeHtml(question.explanation)}</p>
      </div>
      <div class="tips">
        <div class="tip"><div class="tip-title">${icon("light")} เคล็ดลับจำ</div><p>${escapeHtml(question.memoryTip)}</p></div>
        <div class="tip confusion"><div class="tip-title">${icon("alert")} มักสับสนกับ</div><p>${escapeHtml(question.confusionTip)}</p></div>
      </div>`;
  }

  function resultsView() {
    const score = scoreSession();
    const percent = Math.round((score.correct / score.total) * 100);
    const localStats = {};
    state.session.questions.forEach((q) => {
      if (!localStats[q.topic]) localStats[q.topic] = { correct: 0, total: 0 };
      localStats[q.topic].total += 1;
      if (state.session.answers[q.id] === q.answer) localStats[q.topic].correct += 1;
    });
    const weakest = Object.entries(localStats)
      .map(([topic, value]) => ({ topic, ...value, percent: Math.round((value.correct / value.total) * 100) }))
      .sort((a, b) => a.percent - b.percent);
    return shell(`
      <div class="page results">
        <section class="panel result-hero">
          <div class="result-score">${percent}<small>%</small></div>
          <div class="result-summary">
            <h1 style="margin:0 0 8px">สรุปผลการทำข้อสอบ</h1>
            <p>ตอบถูก ${score.correct} จาก ${score.total} ข้อ · ใช้เวลา ${formatTime(state.elapsed)}</p>
            <div class="result-actions">
              <button class="primary-button" data-action="save-session">💾 บันทึกผล</button><button class="secondary-button" data-action="retry-mistakes">ฝึกเฉพาะข้อที่ผิด</button>
              <button class="secondary-button" data-view="home">กลับหน้าหลัก</button>
            </div>
          </div>
        </section>
        <div class="analysis-grid">
          <section class="panel">
            <h2 class="section-title">ผลรายหัวข้อ</h2>
            ${topicBars(localStats, 20)}
          </section>
          <section class="panel">
            <h2 class="section-title">ควรอ่านอะไรเพิ่ม</h2>
            ${weakest.slice(0, 5).map((item) => `
              <div class="recommendation">
                <strong>${escapeHtml(item.topic)} · ${item.percent}%</strong>
                <span>${item.percent < 50 ? "ควรทบทวนเนื้อหาพื้นฐานและทำข้อที่เคยผิดซ้ำ" : item.percent < 75 ? "ทบทวนจุดที่สับสนและฝึกเพิ่มอีกหนึ่งรอบ" : "ทำได้ดี รักษาความแม่นยำด้วยการสุ่มทบทวน"}</span>
              </div>`).join("")}
          </section>
        </div>
      </div>`);
  }

  function mistakesView() {
    const mistakes = DATA.filter((q) => state.saved.mistakes[q.id]);
    return shell(`
      <div class="page">
        <h1 class="page-title">ข้อที่ทำผิด</h1>
        <p class="page-lead">ระบบจะนำข้อออกจากรายการเมื่อคุณตอบถูกในการฝึกครั้งถัดไป</p>
        <section class="panel">
          ${mistakes.length ? `
            <div class="mistake-list">
              ${mistakes.slice(0, 100).map((q) => `<div class="mistake-row"><div><p>${escapeHtml(q.question)}</p><small>${escapeHtml(q.topic)} · ${escapeHtml(q.set)}</small></div><button class="secondary-button" data-practice-id="${q.id}">ฝึกข้อนี้</button></div>`).join("")}
            </div>
            <button class="primary-button" data-action="practice-all-mistakes" style="margin-top:20px">ฝึกข้อที่ผิดทั้งหมด</button>
          ` : `<div class="empty-state">ยังไม่มีข้อที่ทำผิด เริ่มทำชุดแรกได้เลย</div>`}
        </section>
      </div>`);
  }

  function analyticsView() {
    const stats = overallStats();
    return shell(`
      <div class="page">
        <h1 class="page-title">วิเคราะห์ผล</h1>
        <p class="page-lead">ใช้ผลสะสมเพื่อดูเรื่องที่ถนัดและเรื่องที่ควรอ่านเพิ่ม</p>
        <div class="analysis-grid">
          <section class="panel">
            <h2 class="section-title">ภาพรวม</h2>
            <div class="stat-stack">
              <div class="stat-row"><span>ความแม่นยำ</span><div class="stat-value">${stats.percent}%</div></div>
              <div class="stat-row"><span>จำนวนข้อที่ทำ</span><div class="stat-value">${stats.total}</div></div>
              <div class="stat-row"><span>จำนวนรอบ</span><div class="stat-value">${stats.attempts}</div></div>
            </div>
          </section>
          <section class="panel"><h2 class="section-title">รายหัวข้อ</h2>${topicBars(state.saved.topicStats, 20)}</section>
        </div>
        <section class="panel" style="margin-top:20px">
          <h2 class="section-title">ประวัติล่าสุด</h2>
          ${state.saved.attempts.length ? state.saved.attempts.slice(0, 10).map((item) => {
            const p = Math.round((item.correct / item.total) * 100);
            return `<div class="mistake-row"><div><p>${escapeHtml(item.source)} · ${item.correct}/${item.total} ข้อ</p><small>${new Date(item.date).toLocaleString("th-TH")} · ${formatTime(item.elapsed)}</small></div><strong>${p}%</strong></div>`;
          }).join("") : `<div class="empty-state">ยังไม่มีประวัติการทำข้อสอบ</div>`}
        </section>
      </div>`);
  }

  
  function sessionsView() {
    const items = state.saved.sessions || [];
    return shell(`<div class="page"><h1 class="page-title">Sessions</h1><section class="panel">${items.length ? items.map((s,i)=>`<div class="mistake-row"><div><p><strong>${escapeHtml(s.name)}</strong> (${escapeHtml(s.type)})</p><small>${new Date(s.date).toLocaleString("th-TH")}</small></div><div><strong>${s.percent}%</strong> <button class="danger-button" data-delete-session="${i}">ลบ</button></div></div>`).join("") : '<div class="empty-state">ยังไม่มี Session</div>'}</section></div>`);
  }

function sessionsView(){return shell(`<div class="page"><h1 class="page-title">Sessions</h1><section class="panel">${state.sessions.length?state.sessions.map((s,i)=>`<div class="mistake-row"><div><p>${s.name}</p><small>${s.type} · ${s.score}%</small></div><button class="danger-button" data-delete-session="${i}">ลบ</button></div>`).join(""):`<div class="empty-state">ยังไม่มี Session</div>`}</section></div>`);} 

function render() {
    const app = document.getElementById("app");
    if (state.view === "quiz") app.innerHTML = quizView();
    else if (state.view === "results") app.innerHTML = resultsView();
    else if (state.view === "mistakes") app.innerHTML = mistakesView();
    else if (state.view === "analytics") app.innerHTML = analyticsView();
    else if (state.view === "sessions") app.innerHTML = sessionsView();
    else if (state.view === "sessions") app.innerHTML = sessionsView();
    else app.innerHTML = homeView();
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      state.view = viewButton.dataset.view === "practice" ? "home" : viewButton.dataset.view;
      state.navOpen = false;
      render();
      return;
    }
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      state.mode = modeButton.dataset.mode;
      render();
      return;
    }
    const answer = event.target.closest("[data-answer]");
    if (answer) {
      answerQuestion(Number(answer.dataset.answer));
      return;
    }
    const practice = event.target.closest("[data-practice-id]");
    const delSession = event.target.closest("[data-delete-session]"); if(delSession){ deleteSession(Number(delSession.dataset.deleteSession)); return; }
    if (practice) {
      const question = DATA.find((item) => item.id === practice.dataset.practiceId);
      state.count = 1;
      startSession([question]);
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "toggle-nav") {
      state.navOpen = !state.navOpen;
      render();
    } else if (action === "start") {
      startSession();
    } else if (action === "previous") {
      state.session.index = Math.max(0, state.session.index - 1);
      render();
    } else if (action === "next") {
      nextQuestion();
    } else if (action === "clear-answer") {
      delete state.session.answers[currentQuestion().id];
      render();
    } else if (action === "bookmark") {
      const id = currentQuestion().id;
      if (state.saved.bookmarks[id]) delete state.saved.bookmarks[id];
      else state.saved.bookmarks[id] = true;
      saveProgress();
      render();
    } else if (action === "save-session") {
      saveNamedSession();
    } else if (action === "retry-mistakes" || action === "practice-all-mistakes") {
      const pool = DATA.filter((q) => state.saved.mistakes[q.id]);
      state.count = pool.length || 10;
      state.mode = "instant";
      startSession(pool);
    }
  });

  document.addEventListener("change", (event) => {
    const setting = event.target.dataset.setting;
    if (!setting) return;
    state[setting] = setting === "count" ? Number(event.target.value) : event.target.value;
  });

  render();
})();
