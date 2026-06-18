console.log("KOTOBA VERSION RAILWAY TEST 999");
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  screen: 'dashboard',
  level: 'ALL',
  flashcards: [],
  current: 0,
  quiz: [],
  quizIndex: 0,
  kanaMode: 'hiragana',
  kanaCategory: 'basic',
  kanaTest: [],
  kanaTestIndex: 0,
  kanaScore: 0,
  kanaCurrent: null,
  listening: [],
  listeningIndex: 0,
  listeningScore: 0,
  speaking: [],
  speakingIndex: 0,
  speakingResult: '',
  kanjiLevel: 'N5',
  kanjiCategory: 'all',
  currentKanji: null,
  kanjiTest: [],
  kanjiTestIndex: 0,
  kanjiScore: 0,
  xp: Number(localStorage.getItem('kotoba_xp') || 0),
  streak: Number(localStorage.getItem('kotoba_streak') || 0),
  lastStudyDate: localStorage.getItem('kotoba_last_study') || '',
  waifu: localStorage.getItem('kotoba_waifu') || 'sakura',
  flashSessionWords: [],
  flashQueue: [],
  flashRepeatQueue: [],
  flashCompleted: [],
  flashRound: 1,
  flashStats: { remembered: 0, hard: 0, again: 0 },
  quizMode: 'random',
  sessionQuizScore: 0
};

async function api(path, opts={}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setScreen(name) {
  state.screen = name;
  $$('.screen').forEach(el => el.classList.toggle('active', el.id === name));
  $$('.nav').forEach(el => el.classList.toggle('active', el.dataset.screen === name));
  $('#pageTitle').textContent = {dashboard:'Dashboard',kana:'Kana',flashcard:'Flashcard',quiz:'Quiz',library:'Library',listening:'Listening',speaking:'Speaking',kanji:'Kanji Academy',waifu:'Waifu AI'}[name];
  closeMobileSidebar();
  if (name === 'dashboard') loadStats();
  if (name === 'library') loadWords();
  if (name === 'kana') renderKanaGrid();
  if (name === 'kanji') renderKanjiAcademy();
  if (name === 'waifu') renderWaifu();
}

async function loadStats(){
  const s = await api('/api/stats');
  $('#statTotal').textContent = s.total;
  $('#statStudied').textContent = s.studied;
  $('#statMastered').textContent = s.mastered;
  $('#statAccuracy').textContent = `${s.accuracy}%`;
}

function todayKey(){ return new Date().toISOString().slice(0,10); }
function touchStudy(addXp=5){
  const today = todayKey();
  if(state.lastStudyDate !== today){
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    state.streak = state.lastStudyDate === yesterday ? state.streak + 1 : 1;
    state.lastStudyDate = today;
    localStorage.setItem('kotoba_last_study', today);
    localStorage.setItem('kotoba_streak', String(state.streak));
  }
  state.xp += addXp;
  localStorage.setItem('kotoba_xp', String(state.xp));
  renderGamification();
}
function levelFromXp(xp){ return Math.floor(xp / 120) + 1; }
function renderGamification(){
  const xpEl = $('#xpValue');
  const levelEl = $('#levelValue');
  const streakEl = $('#streakValue');
  if(xpEl) xpEl.textContent = state.xp;
  if(levelEl) levelEl.textContent = levelFromXp(state.xp);
  if(streakEl) streakEl.textContent = `${state.streak} hari`;
}


/* =========================
   KOT0BA FLASHCARD
========================= */
function getKanaFront(item){
  const reading = String(item?.reading || '').trim();
  if (hasKana(reading)) return reading;

  const term = String(item?.term || '').trim();
  if (isKanaOnly(term)) return term;

  const kana = kanaOnly(term);
  if (kana) return kana;

  return term || '-';
}

function ensureFlashControls(){
  const actions = document.querySelector('#flashcard .actions');
  if(!actions) return;

  if(!$('#halfBtn')){
    const halfBtn = document.createElement('button');
    halfBtn.id = 'halfBtn';
    halfBtn.className = 'secondary';
    halfBtn.textContent = 'Agak Ingat';
    const wrongBtn = $('#wrongBtn');
    actions.insertBefore(halfBtn, wrongBtn || null);
    halfBtn.addEventListener('click', () => mark('half'));
  }

  if(!$('#sessionQuizBtn')){
    const btn = document.createElement('button');
    btn.id = 'sessionQuizBtn';
    btn.className = 'secondary hidden';
    btn.textContent = 'Mulai Quiz 25 Kotoba';
    actions.appendChild(btn);
    btn.addEventListener('click', startSessionQuiz);
  }
}

function setFlashButtonsDisabled(disabled){
  ['showAnswer','playAudio','correctBtn','halfBtn','wrongBtn'].forEach(id => {
    const el = $('#' + id);
    if(el) el.disabled = disabled;
  });
}

function currentFlashItem(){
  return state.flashQueue[state.current] || null;
}

function renderCard(){
  ensureFlashControls();
  const item = currentFlashItem();

  if(!item){
    renderFlashSessionComplete();
    return;
  }

  setFlashButtonsDisabled(false);
  $('#cardLevel').textContent = item.level || '';
  $('#cardTerm').textContent = getKanaFront(item);
  $('#cardReading').textContent = '';
  $('#cardAnswer').textContent = item.meaning || 'Arti belum tersedia';
  $('#cardAnswer').classList.add('hidden');

  const left = state.flashQueue.length - state.current;
  const repeat = state.flashRepeatQueue.length;
  $('#sessionInfo').textContent =
    `Round ${state.flashRound} • Sisa ${left} kartu • Review ulang ${repeat} • Mastery: ${item.mastery}/10`;
}

function renderFlashSessionComplete(){
  $('#cardLevel').textContent = '';
  $('#cardTerm').textContent = 'Session Complete 🎉';
  $('#cardReading').textContent = '';
  $('#cardAnswer').classList.remove('hidden');

  const total = state.flashSessionWords.length;
  $('#cardAnswer').textContent =
    `Kata sesi: ${total}\nIngat: ${state.flashStats.remembered}\nAgak ingat: ${state.flashStats.hard}\nSusah: ${state.flashStats.again}\n\nLanjut quiz dari kata yang baru dipelajari.`;

  $('#sessionInfo').textContent = `Semua kata sesi sudah selesai. Siap quiz ${total} kotoba.`;
  setFlashButtonsDisabled(true);
  const quizBtn = $('#sessionQuizBtn');
  if(quizBtn) quizBtn.classList.remove('hidden');
}

async function startFlash(){
  ensureFlashControls();
  const data = await api(`/api/study?level=${state.level}&limit=25`);
  state.flashSessionWords = data.items || [];
  state.flashQueue = [...state.flashSessionWords];
  state.flashRepeatQueue = [];
  state.flashCompleted = [];
  state.current = 0;
  state.flashRound = 1;
  state.flashStats = { remembered: 0, hard: 0, again: 0 };
  const quizBtn = $('#sessionQuizBtn');
  if(quizBtn) quizBtn.classList.add('hidden');
  setFlashButtonsDisabled(false);
  renderCard();
}

function showAnswer(){
  $('#cardAnswer').classList.remove('hidden');
}

function enqueueReview(item, result){
  const copy = {...item};
  copy._reviewCount = (copy._reviewCount || 0) + 1;
  copy._lastResult = result;
  state.flashRepeatQueue.push(copy);
}

async function mark(result){
  const item = currentFlashItem();
  if(!item) return;

  const apiResult = result === 'correct' ? 'correct' : 'wrong';
  await api('/api/review', { method:'POST', body:JSON.stringify({word_id:item.id,result:apiResult}) });

  if(result === 'correct'){
    state.flashStats.remembered++;
    state.flashCompleted.push(item);
    touchStudy(8);
  } else if(result === 'half'){
    state.flashStats.hard++;
    enqueueReview(item, result);
    touchStudy(4);
  } else {
    state.flashStats.again++;
    enqueueReview(item, result);
    touchStudy(2);
  }

  state.current++;

  if(state.current >= state.flashQueue.length){
    if(state.flashRepeatQueue.length){
      state.flashRound++;
      state.flashQueue = [...state.flashRepeatQueue];
      state.flashRepeatQueue = [];
      state.current = 0;
      shuffleInPlace(state.flashQueue);
    } else {
      state.flashQueue = [];
      state.current = 0;
    }
  }

  renderCard();
  loadStats();
}

async function playCurrentAudio(){
  const item = state.flashcards[state.current];
  if(!item) return;

  const btn = $('#playAudio');
  if(btn) {
    btn.disabled = true;
    btn.textContent = 'Loading...';
  }

  try {
    const data = await api(`/api/audio/${item.id}`);
    if(!data.ok || !data.url) throw new Error(data.error || 'Audio gagal dibuat');

    const audio = new Audio(data.url);
    await audio.play();
  } catch (err) {
    console.error(err);
    speakJapanese(getKanaFront(item));
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.textContent = '🔊 Suara';
    }
  }
}

/* =========================
   KOTOBA QUIZ
========================= */
async function startQuiz(){
  state.quizMode = 'random';
  const data = await api(`/api/quiz?level=${state.level}&count=10`);
  state.quiz = data.items;
  state.quizIndex = 0;
  state.sessionQuizScore = 0;
  $('#quizFeedback').textContent='';
  renderQuiz();
}

function buildSessionQuizItems(words){
  const pool = words && words.length ? words : [];
  return shuffle(pool).slice(0, Math.min(25, pool.length)).map(item => {
    const distractors = shuffle(pool.filter(w => w.id !== item.id && w.meaning && w.meaning !== item.meaning))
      .slice(0, 3)
      .map(w => w.meaning);

    const fallback = ['tidak tahu', 'belum tersedia', 'arti lain'].filter(x => x !== item.meaning);
    const choices = shuffle([...distractors, ...fallback].slice(0, 3).concat([item.meaning || 'Arti belum tersedia']));

    return {
      id: item.id,
      level: item.level,
      term: item.term,
      reading: item.reading,
      answer: item.meaning || 'Arti belum tersedia',
      choices
    };
  });
}

function startSessionQuiz(){
  if(!state.flashSessionWords.length){
    alert('Belum ada sesi flashcard. Klik Start Session dulu.');
    return;
  }
  state.quizMode = 'session';
  state.quiz = buildSessionQuizItems(state.flashSessionWords);
  state.quizIndex = 0;
  state.sessionQuizScore = 0;
  $('#quizFeedback').textContent='';
  setScreen('quiz');
  renderQuiz();
}

function renderQuiz(){
  const q = state.quiz[state.quizIndex];

  if(!q){
    if(state.quizMode === 'session' && state.quiz.length){
      const total = state.quiz.length;
      const percent = Math.round((state.sessionQuizScore / total) * 100);
      $('#quizTerm').textContent='Session Quiz selesai 🎉';
      $('#quizReading').textContent=`Skor: ${state.sessionQuizScore}/${total} • Akurasi ${percent}%`;
      $('#choices').innerHTML='';
      $('#quizFeedback').textContent = percent >= 80
        ? 'Mantap! Kotoba sesi ini sudah cukup kuat 🔥'
        : 'Masih perlu review. Ulangi flashcard sesi ini lagi ya.';
      $('#quizFeedback').style.color = percent >= 80 ? 'var(--good)' : 'var(--warn)';
      touchStudy(percent >= 80 ? 40 : 15);
      return;
    }

    $('#quizTerm').textContent='Quiz selesai 🎉';
    $('#quizReading').textContent='Cek dashboard untuk progress.';
    $('#choices').innerHTML='';
    return;
  }

  $('#quizTerm').textContent = getKanaFront(q);
  $('#quizReading').textContent = state.quizMode === 'session'
    ? `Quiz sesi • Soal ${state.quizIndex + 1}/${state.quiz.length}`
    : (q.level || '');

  $('#choices').innerHTML = q.choices.map(c => `<button class="choice">${escapeHtml(c)}</button>`).join('');
  $$('.choice').forEach(btn => btn.addEventListener('click', async () => {
    const correct = btn.textContent === q.answer;
    if(state.quizMode === 'session' && correct) state.sessionQuizScore++;

    $('#quizFeedback').textContent = correct ? 'Benar. Mantap 🔥' : `Kurang tepat. Jawaban: ${q.answer}`;
    $('#quizFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';
    await api('/api/review', { method:'POST', body:JSON.stringify({word_id:q.id,result:correct?'correct':'wrong'}) });
    touchStudy(correct ? 10 : 2);
    setTimeout(()=>{ state.quizIndex++; renderQuiz(); loadStats(); }, 850);
  }));
}

async function loadWords(){
  const q = encodeURIComponent($('#searchInput').value || '');
  const data = await api(`/api/words?level=${state.level}&q=${q}&limit=150`);
  $('#wordList').innerHTML = data.items.map(w => `
    <div class="word-item">
      <div class="lvl">${escapeHtml(w.level || '')}</div>
      <div>
        <div class="jp">${escapeHtml(getKanaFront(w))}</div>
        <div class="rd">${escapeHtml(w.term && w.term !== getKanaFront(w) ? w.term : '')}</div>
      </div>
      <div class="meaning">${escapeHtml(w.meaning || '')}</div>
      <div class="pill">${w.mastery}/10</div>
    </div>`).join('') || '<p class="muted">Tidak ada hasil.</p>';
}

/* =========================
   KANA DATA
========================= */
const KANA_DATA = {
  hiragana: {
    basic: [
      ['あ','a'],['い','i'],['う','u'],['え','e'],['お','o'],
      ['か','ka'],['き','ki'],['く','ku'],['け','ke'],['こ','ko'],
      ['さ','sa'],['し','shi'],['す','su'],['せ','se'],['そ','so'],
      ['た','ta'],['ち','chi'],['つ','tsu'],['て','te'],['と','to'],
      ['な','na'],['に','ni'],['ぬ','nu'],['ね','ne'],['の','no'],
      ['は','ha'],['ひ','hi'],['ふ','fu'],['へ','he'],['ほ','ho'],
      ['ま','ma'],['み','mi'],['む','mu'],['め','me'],['も','mo'],
      ['や','ya'],['ゆ','yu'],['よ','yo'],
      ['ら','ra'],['り','ri'],['る','ru'],['れ','re'],['ろ','ro'],
      ['わ','wa'],['を','wo/o'],['ん','n']
    ],
    dakuten: [
      ['が','ga'],['ぎ','gi'],['ぐ','gu'],['げ','ge'],['ご','go'],
      ['ざ','za'],['じ','ji'],['ず','zu'],['ぜ','ze'],['ぞ','zo'],
      ['だ','da'],['ぢ','ji/di'],['づ','zu/du'],['で','de'],['ど','do'],
      ['ば','ba'],['び','bi'],['ぶ','bu'],['べ','be'],['ぼ','bo']
    ],
    handakuten: [
      ['ぱ','pa'],['ぴ','pi'],['ぷ','pu'],['ぺ','pe'],['ぽ','po']
    ],
    yoon: [
      ['きゃ','kya'],['きゅ','kyu'],['きょ','kyo'],
      ['しゃ','sha'],['しゅ','shu'],['しょ','sho'],
      ['ちゃ','cha'],['ちゅ','chu'],['ちょ','cho'],
      ['にゃ','nya'],['にゅ','nyu'],['にょ','nyo'],
      ['ひゃ','hya'],['ひゅ','hyu'],['ひょ','hyo'],
      ['みゃ','mya'],['みゅ','myu'],['みょ','myo'],
      ['りゃ','rya'],['りゅ','ryu'],['りょ','ryo'],
      ['ぎゃ','gya'],['ぎゅ','gyu'],['ぎょ','gyo'],
      ['じゃ','ja'],['じゅ','ju'],['じょ','jo'],
      ['びゃ','bya'],['びゅ','byu'],['びょ','byo'],
      ['ぴゃ','pya'],['ぴゅ','pyu'],['ぴょ','pyo']
    ],
    long: [
      ['おばあさん','obaasan','nenek'],['おじいさん','ojiisan','kakek'],
      ['おねえさん','oneesan','kakak perempuan'],['おにいさん','oniisan','kakak laki-laki'],
      ['ゆうめい','yuumei','terkenal'],['がっこう','gakkou','sekolah'],
      ['きょう','kyou','hari ini'],['りょうり','ryouri','masakan'],
      ['ありがとう','arigatou','terima kasih'],['おおきい','ookii','besar']
    ]
  },
  katakana: {
    basic: [
      ['ア','a'],['イ','i'],['ウ','u'],['エ','e'],['オ','o'],
      ['カ','ka'],['キ','ki'],['ク','ku'],['ケ','ke'],['コ','ko'],
      ['サ','sa'],['シ','shi'],['ス','su'],['セ','se'],['ソ','so'],
      ['タ','ta'],['チ','chi'],['ツ','tsu'],['テ','te'],['ト','to'],
      ['ナ','na'],['ニ','ni'],['ヌ','nu'],['ネ','ne'],['ノ','no'],
      ['ハ','ha'],['ヒ','hi'],['フ','fu'],['ヘ','he'],['ホ','ho'],
      ['マ','ma'],['ミ','mi'],['ム','mu'],['メ','me'],['モ','mo'],
      ['ヤ','ya'],['ユ','yu'],['ヨ','yo'],
      ['ラ','ra'],['リ','ri'],['ル','ru'],['レ','re'],['ロ','ro'],
      ['ワ','wa'],['ヲ','wo/o'],['ン','n']
    ],
    dakuten: [
      ['ガ','ga'],['ギ','gi'],['グ','gu'],['ゲ','ge'],['ゴ','go'],
      ['ザ','za'],['ジ','ji'],['ズ','zu'],['ゼ','ze'],['ゾ','zo'],
      ['ダ','da'],['ヂ','ji/di'],['ヅ','zu/du'],['デ','de'],['ド','do'],
      ['バ','ba'],['ビ','bi'],['ブ','bu'],['ベ','be'],['ボ','bo'],
      ['ヴ','vu']
    ],
    handakuten: [
      ['パ','pa'],['ピ','pi'],['プ','pu'],['ペ','pe'],['ポ','po']
    ],
    yoon: [
      ['キャ','kya'],['キュ','kyu'],['キョ','kyo'],
      ['シャ','sha'],['シュ','shu'],['ショ','sho'],
      ['チャ','cha'],['チュ','chu'],['チョ','cho'],
      ['ニャ','nya'],['ニュ','nyu'],['ニョ','nyo'],
      ['ヒャ','hya'],['ヒュ','hyu'],['ヒョ','hyo'],
      ['ミャ','mya'],['ミュ','myu'],['ミョ','myo'],
      ['リャ','rya'],['リュ','ryu'],['リョ','ryo'],
      ['ギャ','gya'],['ギュ','gyu'],['ギョ','gyo'],
      ['ジャ','ja'],['ジュ','ju'],['ジョ','jo'],
      ['ビャ','bya'],['ビュ','byu'],['ビョ','byo'],
      ['ピャ','pya'],['ピュ','pyu'],['ピョ','pyo']
    ],
    long: [
      ['コーヒー','koohii','kopi'],['スーパー','suupaa','supermarket'],
      ['タクシー','takushii','taksi'],['コンピューター','konpyuutaa','komputer'],
      ['ケーキ','keeki','kue'],['ノート','nooto','buku catatan'],
      ['テーブル','teeburu','meja'],['ボールペン','boorupen','pulpen'],
      ['ゲーム','geemu','game'],['メール','meeru','email']
    ]
  }
};

const CATEGORY_LABELS = {
  basic: 'Basic',
  dakuten: 'Dakuten',
  handakuten: 'Handakuten',
  yoon: 'Yoon',
  long: 'Kata Panjang'
};

function normalizeKanaEntry(row, mode, category){
  return {
    kana: row[0],
    romaji: row[1],
    meaning: row[2] || '',
    mode,
    category
  };
}

function getKanaPool(mode='mixed', category='all'){
  const modes = mode === 'mixed' ? ['hiragana', 'katakana'] : [mode];
  const cats = category === 'all' ? ['basic','dakuten','handakuten','yoon','long'] : [category];
  const pool = [];
  modes.forEach(m => {
    cats.forEach(c => {
      (KANA_DATA[m]?.[c] || []).forEach(row => pool.push(normalizeKanaEntry(row, m, c)));
    });
  });
  return pool;
}

function renderKanaGrid(){
  const mode = state.kanaMode;
  const cat = state.kanaCategory;
  const rows = (KANA_DATA[mode]?.[cat] || []).map(row => normalizeKanaEntry(row, mode, cat));
  $('#kanaGrid').innerHTML = rows.map(item => `
    <button class="kana-card" data-kana="${escapeHtml(item.kana)}">
      <span class="kana-char">${escapeHtml(item.kana)}</span>
      <span class="kana-romaji">${escapeHtml(item.romaji)}</span>
      ${item.meaning ? `<span class="kana-meaning">${escapeHtml(item.meaning)}</span>` : ''}
    </button>
  `).join('');
  $$('.kana-card').forEach(card => card.addEventListener('click', () => speakJapanese(card.dataset.kana)));
}

function startKanaTest(){
  const mode = $('#kanaTestMode').value;
  const cat = $('#kanaTestCat').value;
  const pool = shuffle(getKanaPool(mode, cat));
  state.kanaTest = pool.slice(0, Math.min(20, pool.length));
  state.kanaTestIndex = 0;
  state.kanaScore = 0;
  $('#kanaFeedback').textContent = '';
  renderKanaQuestion();
}

function renderKanaQuestion(){
  const q = state.kanaTest[state.kanaTestIndex];
  state.kanaCurrent = q || null;

  if(!q){
    const total = state.kanaTest.length;
    $('#kanaQuestion').textContent = '完了';
    $('#kanaQuestionHint').textContent = total ? `Ujian selesai. Skor kamu ${state.kanaScore}/${total}.` : 'Tekan Mulai Ujian.';
    $('#kanaChoices').innerHTML = '';
    $('#kanaScore').textContent = total ? `Skor akhir: ${state.kanaScore}/${total}` : 'Skor: -';
    return;
  }

  $('#kanaQuestion').textContent = q.kana;
  $('#kanaQuestionHint').textContent = `${q.mode === 'hiragana' ? 'Hiragana' : 'Katakana'} • ${CATEGORY_LABELS[q.category]}`;
  $('#kanaScore').textContent = `Soal ${state.kanaTestIndex + 1}/${state.kanaTest.length} • Skor: ${state.kanaScore}`;
  $('#kanaFeedback').textContent = '';

  const pool = getKanaPool(q.mode, q.category).filter(x => x.romaji !== q.romaji);
  const wrong = shuffle(pool).slice(0, 3).map(x => x.romaji);
  const choices = shuffle([...wrong, q.romaji]);

  $('#kanaChoices').innerHTML = choices.map(c => `<button class="choice kana-choice">${escapeHtml(c)}</button>`).join('');
  $$('.kana-choice').forEach(btn => btn.addEventListener('click', () => answerKana(btn.textContent, q)));
}

function answerKana(answer, q){
  const correct = answer === q.romaji;
  if(correct) state.kanaScore++;

  $('#kanaFeedback').textContent = correct ? 'Benar! すごい 🌸' : `Kurang tepat. Jawaban: ${q.romaji}`;
  $('#kanaFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';

  setTimeout(() => {
    state.kanaTestIndex++;
    renderKanaQuestion();
  }, 800);
}


/* =========================
   LISTENING LEARN / TEST
========================= */
async function startListeningLearn(){
  const data = await api(`/api/study?level=${state.level}&limit=12`);
  state.listening = data.items;
  state.listeningIndex = 0;
  renderListeningLearn();
}
function renderListeningLearn(){
  const item = state.listening[state.listeningIndex];
  if(!item){
    $('#listeningLearnTerm').textContent = 'Sesi listening selesai 🎧';
    $('#listeningLearnMeaning').textContent = 'Mantap. Ulangi lagi besok supaya telinga makin peka.';
    return;
  }
  $('#listeningLearnTerm').textContent = getKanaFront(item);
  $('#listeningLearnMeaning').textContent = item.meaning || '';
  $('#listeningLearnInfo').textContent = `Kartu ${state.listeningIndex + 1}/${state.listening.length}`;
}
function playListeningLearn(){
  const item = state.listening[state.listeningIndex];
  if(item) speakJapanese(getKanaFront(item));
}
function nextListeningLearn(){
  if(!state.listening.length) return;
  touchStudy(3);
  state.listeningIndex++;
  renderListeningLearn();
}
async function startListeningTest(){
  const data = await api(`/api/quiz?level=${state.level}&count=10`);
  state.listening = data.items;
  state.listeningIndex = 0;
  state.listeningScore = 0;
  $('#listeningFeedback').textContent = '';
  renderListeningQuestion();
}
function renderListeningQuestion(){
  const q = state.listening[state.listeningIndex];
  if(!q){
    $('#listeningQuestion').textContent = 'Listening selesai 🎉';
    $('#listeningChoices').innerHTML = '';
    $('#listeningScore').textContent = state.listening.length ? `Skor akhir: ${state.listeningScore}/${state.listening.length}` : 'Skor: -';
    return;
  }
  $('#listeningQuestion').textContent = 'Dengarkan audio, lalu pilih artinya';
  $('#listeningScore').textContent = `Soal ${state.listeningIndex + 1}/${state.listening.length} • Skor: ${state.listeningScore}`;
  $('#listeningFeedback').textContent = '';
  $('#listeningChoices').innerHTML = q.choices.map(c => `<button class="choice listening-choice">${escapeHtml(c)}</button>`).join('');
  $$('.listening-choice').forEach(btn => btn.addEventListener('click', () => answerListening(btn.textContent, q)));
  setTimeout(() => speakJapanese(getKanaFront(q)), 200);
}
function replayListeningQuestion(){
  const q = state.listening[state.listeningIndex];
  if(q) speakJapanese(getKanaFront(q));
}
function answerListening(answer, q){
  const correct = answer === q.answer;
  if(correct) state.listeningScore++;
  $('#listeningFeedback').textContent = correct ? 'Benar! Telinga kamu makin tajam 🎧' : `Kurang tepat. Jawaban: ${q.answer}`;
  $('#listeningFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';
  touchStudy(correct ? 12 : 3);
  setTimeout(() => { state.listeningIndex++; renderListeningQuestion(); }, 950);
}

/* =========================
   SPEAKING TEST
========================= */
async function startSpeaking(){
  const data = await api(`/api/study?level=${state.level}&limit=10`);
  state.speaking = data.items;
  state.speakingIndex = 0;
  renderSpeakingPrompt();
}
function renderSpeakingPrompt(){
  const item = state.speaking[state.speakingIndex];
  if(!item){
    $('#speakingTerm').textContent = 'Speaking selesai 🎤';
    $('#speakingMeaning').textContent = 'Sugoi. Latihan pengucapan selesai untuk sesi ini.';
    $('#speakingResult').textContent = '';
    return;
  }
  $('#speakingTerm').textContent = getKanaFront(item);
  $('#speakingMeaning').textContent = item.meaning || '';
  $('#speakingProgress').textContent = `Kata ${state.speakingIndex + 1}/${state.speaking.length}`;
  $('#speakingResult').textContent = '';
}
function playSpeakingPrompt(){
  const item = state.speaking[state.speakingIndex];
  if(item) speakJapanese(getKanaFront(item));
}
function nextSpeaking(){
  if(!state.speaking.length) return;
  state.speakingIndex++;
  renderSpeakingPrompt();
}
function startSpeechRecognition(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const item = state.speaking[state.speakingIndex];
  if(!SpeechRecognition){
    $('#speakingResult').textContent = 'Browser belum support SpeechRecognition. Coba pakai Chrome desktop/mobile.';
    $('#speakingResult').style.color = 'var(--bad)';
    return;
  }
  if(!item) return;
  const rec = new SpeechRecognition();
  rec.lang = 'ja-JP';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  $('#speakingResult').textContent = 'Mendengarkan... ucapkan kata Jepangnya 🎤';
  $('#speakingResult').style.color = 'var(--muted)';
  rec.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    const target = getKanaFront(item);
    const score = simpleSpeechScore(spoken, target);
    $('#speakingResult').innerHTML = `Kamu mengucapkan: <b>${escapeHtml(spoken)}</b><br>Target: <b>${escapeHtml(target)}</b><br>Skor perkiraan: <b>${score}/100</b>`;
    $('#speakingResult').style.color = score >= 70 ? 'var(--good)' : 'var(--warn)';
    touchStudy(score >= 70 ? 14 : 4);
  };
  rec.onerror = () => {
    $('#speakingResult').textContent = 'Mic gagal dibaca. Pastikan permission microphone aktif.';
    $('#speakingResult').style.color = 'var(--bad)';
  };
  rec.start();
}
function simpleSpeechScore(spoken, target){
  const a = String(spoken || '').replace(/\s/g,'');
  const b = String(target || '').replace(/\s/g,'');
  if(!a || !b) return 0;
  if(a === b) return 100;
  let same = 0;
  [...b].forEach(ch => { if(a.includes(ch)) same++; });
  return Math.max(10, Math.min(95, Math.round((same / b.length) * 100)));
}

/* =========================
   KANJI ACADEMY N5/N4
========================= */
const KANJI_DATA = [
  {
    "level": "N5",
    "kanji": "日",
    "meaning": "hari, matahari",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "平日（へいじつ） = hari kerja",
      "日にち（ひにち） = tanggal"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "一",
    "meaning": "satu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "一生懸命（いっしょうけんめい） = sungguh-sungguh"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "国",
    "meaning": "negara",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "国会議事堂（こっかいぎじどう） = gedung parlemen",
      "国際（こくさい） = internasional",
      "国連（こくれん） = perserikatan bangsa-bangsa"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "人",
    "meaning": "orang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "主人公（しゅじんこう） = pelaku utama",
      "人気（にんき） = populer\ndisenangi",
      "人形（にんぎょう） = boneka\norang-orangan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "年",
    "meaning": "tahun",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "５年生（ごねんせい） = kelas lima",
      "年齢（ねんれい） = usia\numur",
      "忘年会（ぼうねんかい） = pesta akhir tahun"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "大",
    "meaning": "besar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "大好き（だいすき） = kesukaan",
      "大学院（だいがくいん） = program s2 s3",
      "適当な大きさに（てきとうなおおきさに） = ukuran sedang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "十",
    "meaning": "sepuluh",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "十分（じゅうぶん） = dengan cukup"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "二",
    "meaning": "dua",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "二次会（にじかい） = pesta untuk kedua kali"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "本",
    "meaning": "buku, asal",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "本棚（ほんだな） = lemari buku",
      "本社（ほんしゃ） = kantor pusat",
      "本物（ほんもの） = asli"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "中",
    "meaning": "dalam, tengah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "真ん中（まんなか） = tengah",
      "懐中電灯（かいちゅうでんとう） = lampu senter",
      "使用中（しようちゅう） = sedang dipakai"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "長",
    "meaning": "panjang, pemimpin",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "長さ（ながさ） = panjangnya",
      "長生き（ながいき） = panjang umur"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "出",
    "meaning": "keluar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "出します（だします） = mengeluarkan\nmengirimkan\nmenghasilkan\nmenjadi",
      "引き出し（ひきだし） = laci",
      "出ます（でます） = keluar\nberangkat\nhadir\nmuncul\nlulus"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "三",
    "meaning": "tiga",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "三"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "時",
    "meaning": "waktu, jam",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "非常時（ひじょうじ） = saat darurat",
      "時間がたちます（じかんがたちます） = waktu berlalu"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "行",
    "meaning": "pergi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "徐行（じょこう） = berjalan perlahan",
      "夜行バス（やこうばす） = bus malam",
      "旅行社（りょこうしゃ） = agen perjalanan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "見",
    "meaning": "melihat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "見ます（みます） = melihat\nmemeriksa",
      "見えます（みえます） = terlihat",
      "夢を見ます（ゆめをみます） = bermimpi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "月",
    "meaning": "bulan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "月に（つきに） = dalam sebulan",
      "さ来月（さらいげつ） = dua bulan lagi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "後",
    "meaning": "belakang, setelah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "～後（～ご） = setelah~\nsesudah~",
      "その後（そのご） = setelah\nsesudah"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "前",
    "meaning": "depan, sebelum",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "前"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "生",
    "meaning": "hidup, lahir",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "生活します（せいかつします） = hidup",
      "先生（せんせい） = dokter",
      "一生懸命（いっしょうけんめい） = sungguh-sungguh"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "五",
    "meaning": "lima",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "五"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "間",
    "meaning": "jarak, ruang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "間に合います（まにあいます） = sempat\nkeburu",
      "間違えます（まちがえます） = bersalah",
      "仲間（なかま） = rekan\nteman"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "上",
    "meaning": "atas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "屋上（おくじょう） = loteng",
      "上手に（じょうずに） = dengan pandai",
      "以上（いじょう） = di atas\nlebih dari"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "東",
    "meaning": "timur",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "東"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "四",
    "meaning": "empat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "四"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "今",
    "meaning": "sekarang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "今度（こんど） = kali ini\nlain kali",
      "今夜（こんや） = nanti malam\nmalam ini",
      "今でも（いまでも） = sampai sekarang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "金",
    "meaning": "emas, uang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "罰金（ばっきん） = denda",
      "貯金します（ちょきんします） = menabung",
      "金色（きんいろ） = warna emas"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "九",
    "meaning": "sembilan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "九"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "入",
    "meaning": "masuk",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "入学試験（にゅうがくしけん） = ujian masuk",
      "入口（いりぐち） = pintu masuk",
      "入力します（にゅうりょくします） = mengisi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "学",
    "meaning": "belajar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "大学院（だいがくいん） = program s2 s3",
      "入学試験（にゅうがくしけん） = ujian masuk",
      "小学校（しょうがっこう） = SD"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "高",
    "meaning": "tinggi, mahal",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "高さ（たかさ） = tingginya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "円",
    "meaning": "yen, lingkaran",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "円"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "子",
    "meaning": "anak",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "子供たち（こどもたち） = anak-anak",
      "息子（むすこ） = anak (lk)",
      "息子さん（むすこさん） = putra"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "外",
    "meaning": "luar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "外れます（はずれます） = terlepas",
      "外します（はずします） = meninggalkan",
      "海外（かいがい） = luar negeri"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "八",
    "meaning": "delapan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "八"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "六",
    "meaning": "enam",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "六"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "下",
    "meaning": "bawah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "廊下（ろうか） = gang\nkoridor",
      "以下（いか） = di bawah\nkurang dari",
      "下げます（さげます） = menurunkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "来",
    "meaning": "datang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "将来（しょうらい） = masa depan",
      "帰って来ます（かえってきます） = pulang",
      "出来事（できごと） = peristiwa"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "気",
    "meaning": "perasaan, semangat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "気分がいい（きぶんがいい） = rasa enak\nsegar",
      "気分が悪い（きぶんがわるい） = rasa tidak enak",
      "人気（にんき） = populer\ndisenangi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "小",
    "meaning": "kecil",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "小説（しょうせつ） = novel",
      "小説家（しょうせつか） = novelis",
      "小学校（しょうがっこう） = SD"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "七",
    "meaning": "tujuh",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "七"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "山",
    "meaning": "gunung",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "山登り（やまのぼり） = mendaki gunung"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "話",
    "meaning": "bicara, cerita",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "会話（かいわ） = percakapan",
      "世話をします（せわをします） = merawat\nmenjaga\nmembantu",
      "昔話（むかしはなし） = cerita dongeng"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "女",
    "meaning": "perempuan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "女性（じょせい） = wanita"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "北",
    "meaning": "utara",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "北"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "午",
    "meaning": "siang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "午"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "百",
    "meaning": "ratus",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "百"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "書",
    "meaning": "menulis",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "書類（しょるい） = dokumen",
      "説明書（せつめいしょ） = petunjuk",
      "保証書（ほしょうしょ） = surat garansi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "先",
    "meaning": "sebelum, depan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "先生（せんせい） = dokter",
      "お先に（おさきに） = duluan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "名",
    "meaning": "nama",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "名"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "川",
    "meaning": "sungai",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "川"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "千",
    "meaning": "ribu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "千"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "水",
    "meaning": "air",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "水道（すいどう） = air pam",
      "水泳（すいえい） = berenang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "半",
    "meaning": "setengah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "半年（はんとし） = setengah tahun"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "男",
    "meaning": "laki-laki",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "男性（だんせい） = pria"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "西",
    "meaning": "barat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "西洋化します（せいようかします） = kebarat-baratan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "電",
    "meaning": "listrik",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "懐中電灯（かいちゅうでんとう） = lampu senter",
      "電源（でんげん） = power suply"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "校",
    "meaning": "sekolah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "小学校（しょうがっこう） = SD",
      "中学校（ちゅうがっこう） = SMP"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "語",
    "meaning": "bahasa, kata",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "語"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "土",
    "meaning": "tanah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "土"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "木",
    "meaning": "pohon, kayu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "木"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "聞",
    "meaning": "mendengar, bertanya",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "聞こえます（きこえます） = terdengar"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "食",
    "meaning": "makan, makanan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "和食（わしょく） = makanan jepang",
      "洋食（ようしょく） = makanan barat"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "車",
    "meaning": "mobil, kendaraan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "駐車違反（ちゅうしゃいはん） = pelanggaran lalu lintas",
      "汽車（きしゃ） = kereta api",
      "救急車（きゅうきゅうしゃ） = mobil ambulan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "何",
    "meaning": "apa",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "何でも（なんでも） = apa saja"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "南",
    "meaning": "selatan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "南"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "万",
    "meaning": "sepuluh ribu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "万"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "毎",
    "meaning": "setiap",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "毎"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "白",
    "meaning": "putih",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "白（しろ） = putih",
      "真っ白（まっしろ） = putih"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "天",
    "meaning": "langit",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "天気予報（てんきよほう） = prakiraan cuaca"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "母",
    "meaning": "ibu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "祖母（そぼ） = nenek"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "火",
    "meaning": "api",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "花火（はなび） = kembang api",
      "火（ひ） = api",
      "火にかけます（ひにかけます） = memasak\nmemanaskan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "右",
    "meaning": "kanan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "右"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "読",
    "meaning": "membaca",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "読"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "友",
    "meaning": "teman",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "友"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "左",
    "meaning": "kiri",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "左"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "休",
    "meaning": "istirahat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "休憩します（きゅうけいします） = beristirahat",
      "連休（れんきゅう） = libur berurutan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "父",
    "meaning": "ayah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "祖父（そふ） = kakek"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N5",
    "kanji": "雨",
    "meaning": "hujan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "雨"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "会",
    "meaning": "bertemu, pertemuan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "運動会（うんどうかい） = lomba olahraga",
      "国会議事堂（こっかいぎじどう） = gedung parlemen",
      "会話（かいわ） = percakapan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "同",
    "meaning": "sama",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "同じ（おなじ） = sama"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "事",
    "meaning": "hal, urusan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "国会議事堂（こっかいぎじどう） = gedung parlemen",
      "返事（へんじ） = jawaban",
      "火事（かじ） = kebakaran"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "自",
    "meaning": "diri sendiri",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "自由に（じゆうに） = dengan bebas",
      "自分（じぶん） = diri sendiri",
      "自然（しぜん） = alam\nalami"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "社",
    "meaning": "perusahaan, kuil",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "本社（ほんしゃ） = kantor pusat",
      "旅行社（りょこうしゃ） = agen perjalanan",
      "社会（しゃかい） = sosial"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "発",
    "meaning": "berangkat, mulai",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "発表（はっぴょう） = presentasi",
      "発明します（はつめいします） = menciptakan",
      "発見します（はっけんします） = menemukan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "者",
    "meaning": "orang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "者"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "地",
    "meaning": "tanah, daerah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "地震（じしん） = gempa bumi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "業",
    "meaning": "pekerjaan, bisnis",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "授業（じゅぎょう） = kelas\npelajaran",
      "卒業します（そつぎょうします） = lulus\ntamat",
      "営業（えいぎょう） = perdagangan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "方",
    "meaning": "arah, cara, orang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "方づきます（かたづきます） = membereskan",
      "方（かた） = orang (sopan)\ncara (metode)",
      "～の方（～のほう） = sebelah~"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "新",
    "meaning": "baru",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "新年会（しんねんかい） = pesta tahun baru"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "場",
    "meaning": "tempat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "場所（ばしょ） = tempat",
      "置き場（おきば） = tempat menaruh sampah",
      "スキー場（スキーじょう） = lapangan ski"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "員",
    "meaning": "anggota, pegawai",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "駅員（えきいん） = petugas stasiun",
      "係員（かかりいん） = staf\npetugas"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "立",
    "meaning": "berdiri",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "組み立てます（くみたてます） = memasang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "開",
    "meaning": "membuka",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "開きます（ひらきます） = membuka\nmengadakan",
      "開発します（かいはつします） = mengembangkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "手",
    "meaning": "tangan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "歌手（かしゅ） = penyanyi",
      "相手（あいて） = kawan\npasangan\nlawan",
      "上手に（じょうずに） = dengan pandai"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "力",
    "meaning": "kekuatan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "力（ちから） = tenaga",
      "入力します（にゅうりょくします） = mengisi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "問",
    "meaning": "bertanya, masalah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "質問します（しつもんします） = bertanya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "代",
    "meaning": "pengganti, zaman, biaya",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "代"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "明",
    "meaning": "terang, jelas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "説明書（せつめいしょ） = petunjuk",
      "発明します（はつめいします） = menciptakan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "動",
    "meaning": "bergerak",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "運動会（うんどうかい） = lomba olahraga",
      "動物園（どうぶつえん） = kebun binatang",
      "運動します（うんどうします） = berolahraga"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "京",
    "meaning": "ibu kota",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "京"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "目",
    "meaning": "mata",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "目が覚めます（めがさめます） = sadar\nbangun",
      "目的（もくてき） = tujuan",
      "目覚まし（めざまし） = weker"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "通",
    "meaning": "lewat, lalu lintas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "通います（かよいます） = pergi",
      "通ります（とおります） = lewat\nmelalui",
      "普通（ふつう） = biasa"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "言",
    "meaning": "berkata",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "言い伝え（いいつたえ） = tradisi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "理",
    "meaning": "alasan, logika",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "無理をします（むりをします） = memaksakan diri",
      "整理します（せいりします） = mengatur",
      "管理人（かんりにん） = penjaga\npengelola"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "体",
    "meaning": "tubuh",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "体育館（たいいくかん） = gedung olahraga",
      "体温計（たいおんけい） = termometer"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "田",
    "meaning": "sawah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "田"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "主",
    "meaning": "utama, tuan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "主人公（しゅじんこう） = pelaku utama"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "題",
    "meaning": "topik, judul",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "飲み放題（のみほうだい） = minum sepuasnya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "意",
    "meaning": "pikiran, maksud",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "注意します（ちゅういします） = memperhatikan\nberhati-hati\nmenasihati",
      "用意します（よういします） = menyediakan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "不",
    "meaning": "tidak, buruk",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "不思議（ふしぎ） = aneh\nmisterius\nmenakjubkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "作",
    "meaning": "membuat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "作文（さくぶん） = karangan",
      "操作（そうさ） = operasi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "用",
    "meaning": "menggunakan, urusan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "使用禁止（しようきんし） = dilarang pakai",
      "使用中（しようちゅう） = sedang dipakai",
      "利用します（りようします） = menggunakan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "度",
    "meaning": "derajat, kali",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "今度（こんど） = kali ini\nlain kali",
      "温度（おんど） = suhu"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "強",
    "meaning": "kuat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "気が強い（きがつよい） = galak\nbersifat keras"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "公",
    "meaning": "publik, resmi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "主人公（しゅじんこう） = pelaku utama"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "持",
    "meaning": "membawa, memiliki",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "気持ち（きもち） = perasaan",
      "気持ちがいい（きもちがいい） = rasa enak",
      "気持ちが悪い（きもちがわるい） = jijik\nrasa tidak enak"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "野",
    "meaning": "lapangan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "野"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "以",
    "meaning": "dengan, sejak",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "以上（いじょう） = di atas\nlebih dari",
      "以下（いか） = di bawah\nkurang dari",
      "以上です（いじょうです） = sekian"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "思",
    "meaning": "berpikir",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "不思議（ふしぎ） = aneh\nmisterius\nmenakjubkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "家",
    "meaning": "rumah, keluarga",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "家（いえ） = rumah",
      "家具（かぐ） = mebel\nperabot rumah",
      "小説家（しょうせつか） = novelis"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "世",
    "meaning": "dunia, generasi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "世紀（せいき） = abad",
      "世界中（せかいじゅう） = seluruh dunia",
      "世界遺産（せかいいさん） = situs warisan dunia unesco"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "多",
    "meaning": "banyak",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "多"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "正",
    "meaning": "benar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "正しい（ただしい） = benar"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "安",
    "meaning": "murah, tenang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "安心します（あんしんします） = lega\ntenang",
      "安全（あんぜん） = aman"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "院",
    "meaning": "institusi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "美容院（びよういん） = salon kecantikan",
      "大学院（だいがくいん） = program s2 s3",
      "入院します（にゅういんします） = masuk opname"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "心",
    "meaning": "hati, pikiran",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "心配（しんぱい） = khawatir",
      "熱心（ねっしん） = tekun",
      "安心します（あんしんします） = lega\ntenang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "界",
    "meaning": "dunia",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "世界中（せかいじゅう） = seluruh dunia",
      "世界遺産（せかいいさん） = situs warisan dunia unesco",
      "世界初（せかいはつ） = pertama di dunia"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "教",
    "meaning": "mengajar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "～教室（～きょうしつ） = les~\nkelas~",
      "教会（きょうかい） = gereja",
      "教育（きょういく） = pendidikan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "文",
    "meaning": "kalimat, budaya",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "作文（さくぶん） = karangan",
      "文法（ぶんぽう） = tata bahasa",
      "文化（ぶんか） = budaya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "元",
    "meaning": "asal, awal",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "元の所（もとのところ） = tempat semula",
      "お元気でいらっしゃいますか（おげんきでいらっしゃいますか） = bagaimana kabarnya\n(kata hormat)"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "重",
    "meaning": "berat, penting",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "重さ（おもさ） = beratnya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "近",
    "meaning": "dekat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "近所（きんじょ） = tetangga"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "考",
    "meaning": "memikirkan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "考"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "画",
    "meaning": "gambar, rencana",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "画"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "海",
    "meaning": "laut",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "海外（かいがい） = luar negeri",
      "海岸（かいがん） = pantai\npesisir"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "売",
    "meaning": "menjual",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "売れます（うれます） = terjual"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "知",
    "meaning": "tahu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "お知らせ（おしらせ） = pengumuman\npemberitahuan",
      "知り合います（しりあいます） = berkenalan",
      "知らせます（しらせます） = memberitau"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "道",
    "meaning": "jalan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "道具（どうぐ） = alat",
      "水道（すいどう） = air pam",
      "茶道（さどう） = upacara teh"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "集",
    "meaning": "mengumpulkan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "募集中（ぼしゅうちゅう） = sedang dicari",
      "集まります（あつまります） = berkumpul"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "別",
    "meaning": "berbeda, pisah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "特別（とくべつ） = spesial\nkhusus",
      "別れます（わかれます） = berpisah"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "物",
    "meaning": "benda",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "品物（しなもの） = barang",
      "忘れ物（わすれもの） = barang tertinggal",
      "動物園（どうぶつえん） = kebun binatang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "使",
    "meaning": "menggunakan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "使用禁止（しようきんし） = dilarang pakai",
      "使用中（しようちゅう） = sedang dipakai"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "品",
    "meaning": "barang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "品物（しなもの） = barang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "計",
    "meaning": "mengukur, rencana",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "計算します（けいさんします） = menghitung",
      "体温計（たいおんけい） = termometer"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "死",
    "meaning": "mati",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "死にます（しにます） = mati\nmeninggal"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "特",
    "meaning": "khusus",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "特別（とくべつ） = spesial\nkhusus"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "私",
    "meaning": "saya, pribadi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "私（わたくし） = saya\nkata merendah dari\nわたし"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "始",
    "meaning": "mulai",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "始まります（はじまります） = dimulai"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "朝",
    "meaning": "pagi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "朝"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "運",
    "meaning": "membawa, nasib",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "運動会（うんどうかい） = lomba olahraga",
      "運動します（うんどうします） = berolahraga",
      "運びます（はこびます） = mengangkut"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "終",
    "meaning": "selesai",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "終"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "台",
    "meaning": "panggung, mesin",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "台所（だいどころ） = dapur",
      "台風（たいふう） = angin topan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "広",
    "meaning": "luas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "広めます（ひろめます） = menyebarluaskan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "住",
    "meaning": "tinggal",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "住"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "真",
    "meaning": "benar, nyata",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "真ん中（まんなか） = tengah",
      "真っ白（まっしろ） = putih"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "有",
    "meaning": "ada, memiliki",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "有"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "口",
    "meaning": "mulut",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "入口（いりぐち） = pintu masuk",
      "出口（でぐち） = pintu keluar",
      "非常口（ひじょうぐち） = pintu darurat"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "少",
    "meaning": "sedikit",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "少"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "町",
    "meaning": "kota",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "町"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "料",
    "meaning": "biaya, bahan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "給料（きゅうりょう） = gaji",
      "無料（むりょう） = gratis",
      "材料（ざいりょう） = bahan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "工",
    "meaning": "kerja, konstruksi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "工場（こうじょう） = pabrik"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "建",
    "meaning": "membangun",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "建てます（たてます） = membangun"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "空",
    "meaning": "langit, kosong",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "空（そら） = langit",
      "空気（くうき） = udara"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "急",
    "meaning": "cepat, darurat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "急に（きゅうに） = mendadak\ntiba-tiba",
      "救急車（きゅうきゅうしゃ） = mobil ambulan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "止",
    "meaning": "berhenti",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "止まります（とまります） = berhenti",
      "使用禁止（しようきんし） = dilarang pakai",
      "中止（ちゅうし） = batal"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "送",
    "meaning": "mengirim",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "送"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "切",
    "meaning": "memotong",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "締め切り（しめきり） = batas waktu",
      "切ります（きります） = mematikan\nmemotong\nmemutuskan\nmengakhiri",
      "親切にします（しんせつにします） = berbaik hati"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "転",
    "meaning": "berputar, berubah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "運転手（うんてんしゅ） = sopir",
      "転びます（ころびます） = jatuh"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "研",
    "meaning": "mengasah, riset",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "研究室（けんきゅうしつ） = laboratorium"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "足",
    "meaning": "kaki, cukup",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "足"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "究",
    "meaning": "meneliti",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "研究室（けんきゅうしつ） = laboratorium"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "楽",
    "meaning": "musik, nyaman",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "音楽家（おんがくか） = musisi",
      "楽しみ（たのしみ） = kesenangan",
      "楽（らく） = ringan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "起",
    "meaning": "bangun, terjadi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "起きます（おきます） = terjadi",
      "縁起が悪い（えんぎがわるい） = tidak menyenangkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "着",
    "meaning": "memakai, tiba",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "到着します（とうちゃくします） = tiba"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "店",
    "meaning": "toko",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "支店（してん） = kantor cabang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "病",
    "meaning": "sakit",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "病"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "質",
    "meaning": "kualitas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "質問します（しつもんします） = bertanya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "待",
    "meaning": "menunggu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "招待します（しょうたいします） = mengundang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "試",
    "meaning": "mencoba, ujian",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "入学試験（にゅうがくしけん） = ujian masuk"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "族",
    "meaning": "keluarga, suku",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "族"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "銀",
    "meaning": "perak",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "銀"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "早",
    "meaning": "cepat, pagi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "早"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "映",
    "meaning": "memantulkan, menayangkan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "映"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "親",
    "meaning": "orang tua, dekat",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "親子どんぶり（おやこどんぶり） = oyakodonburi\n(nama makanan)",
      "親切にします（しんせつにします） = berbaik hati",
      "親（おや） = orang tua"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "験",
    "meaning": "tes, pengalaman",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "経験（けいけん） = pengalaman",
      "入学試験（にゅうがくしけん） = ujian masuk",
      "実験（じっけん） = percobaan\neksperimen"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "英",
    "meaning": "Inggris",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "英"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "医",
    "meaning": "dokter, medis",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "医学（いがく） = ilmu kedokteran",
      "医学部（いがくぶ） = fakultas kedokteran"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "仕",
    "meaning": "melayani, bekerja",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "仕舞います（しまいます） = menyimpan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "去",
    "meaning": "pergi, masa lalu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "去"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "味",
    "meaning": "rasa",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "味（あじ） = rasa",
      "興味（きょうみ） = minat\nketertarikan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "写",
    "meaning": "menyalin, memotret",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "写"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "字",
    "meaning": "huruf",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "習字（しゅうじ） = kaligrafi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "答",
    "meaning": "jawaban",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "答えます（こたえます） = menjawab",
      "回答（かいとう） = jawaban"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "夜",
    "meaning": "malam",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "今夜（こんや） = nanti malam\nmalam ini",
      "夜行バス（やこうばす） = bus malam"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "音",
    "meaning": "suara",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "発音（はつおん） = ungkapan",
      "音楽家（おんがくか） = musisi",
      "録音します（ろくおんします） = merekam"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "注",
    "meaning": "menuang, catatan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "注意します（ちゅういします） = memperhatikan\nberhati-hati\nmenasihati",
      "注ぎます（そそぎます） = menyiram"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "帰",
    "meaning": "pulang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "帰り（かえり） = pulang",
      "帰って来ます（かえってきます） = pulang"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "古",
    "meaning": "lama, tua",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "古"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "歌",
    "meaning": "lagu, bernyanyi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "歌手（かしゅ） = penyanyi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "買",
    "meaning": "membeli",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "買"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "悪",
    "meaning": "buruk",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "気分が悪い（きぶんがわるい） = rasa tidak enak",
      "気持ちが悪い（きもちがわるい） = jijik\nrasa tidak enak",
      "縁起が悪い（えんぎがわるい） = tidak menyenangkan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "図",
    "meaning": "peta, gambar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "図（ず） = gambar"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "週",
    "meaning": "minggu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "さ来週（さらいしゅう） = dua minggu lagi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "室",
    "meaning": "ruangan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "～教室（～きょうしつ） = les~\nkelas~",
      "研究室（けんきゅうしつ） = laboratorium"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "歩",
    "meaning": "berjalan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "歩"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "風",
    "meaning": "angin",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "風（かぜ） = angin",
      "台風（たいふう） = angin topan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "紙",
    "meaning": "kertas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "紙"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "黒",
    "meaning": "hitam",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "黒（くろ） = hitam"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "花",
    "meaning": "bunga",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "花火（はなび） = kembang api",
      "花瓶（かびん） = vas bunga"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "春",
    "meaning": "musim semi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "春"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "赤",
    "meaning": "merah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "赤（あか） = merah",
      "赤ちゃん（あかちゃん） = bayi"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "青",
    "meaning": "biru, hijau",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "青（あお） = biru"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "館",
    "meaning": "gedung",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "体育館（たいいくかん） = gedung olahraga",
      "旅館（りょかん） = penginapan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "屋",
    "meaning": "toko, rumah",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "屋上（おくじょう） = loteng"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "色",
    "meaning": "warna",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "景色（けしき） = pemandangan",
      "色（いろ） = warna",
      "黄色（きいろ） = kuning"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "走",
    "meaning": "berlari",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "走ります（はしります） = berlari"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "秋",
    "meaning": "musim gugur",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "秋"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "夏",
    "meaning": "musim panas",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "夏"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "習",
    "meaning": "belajar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "予習します（よしゅうします） = mempersiapkan pelajaran\nbelajar sebelumnya",
      "復習します（ふくしゅうします） = mengulang pelajaran\nmempelajari kembali",
      "習慣（しゅうかん） = kebiasaan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "駅",
    "meaning": "stasiun",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "駅員（えきいん） = petugas stasiun"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "洋",
    "meaning": "barat, samudra",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "洋服（ようふく） = baju",
      "西洋化します（せいようかします） = kebarat-baratan",
      "洋食（ようしょく） = makanan barat"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "旅",
    "meaning": "perjalanan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "旅行社（りょこうしゃ） = agen perjalanan",
      "旅館（りょかん） = penginapan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "服",
    "meaning": "pakaian",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "洋服（ようふく） = baju"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "夕",
    "meaning": "sore",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "夕方（ゆうがた） = sore\nsenja"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "借",
    "meaning": "meminjam",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "借"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "曜",
    "meaning": "hari dalam minggu",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "曜"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "飲",
    "meaning": "minum",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "飲み放題（のみほうだい） = minum sepuasnya"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "肉",
    "meaning": "daging",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "肉"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "貸",
    "meaning": "meminjamkan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "貸"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "堂",
    "meaning": "aula",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "国会議事堂（こっかいぎじどう） = gedung parlemen"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "鳥",
    "meaning": "burung",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "鳥（とり） = burung\nayam"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "飯",
    "meaning": "nasi, makanan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "炊飯器（すいはんき） = rice cooker"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "勉",
    "meaning": "usaha/belajar",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "勉"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "冬",
    "meaning": "musim dingin",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "冬"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "昼",
    "meaning": "siang",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "昼"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "茶",
    "meaning": "teh",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "茶色（ちゃいろ） = coklat",
      "茶道（さどう） = upacara teh"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "弟",
    "meaning": "adik laki-laki",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "弟"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "牛",
    "meaning": "sapi",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "牛"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "魚",
    "meaning": "ikan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "魚"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "兄",
    "meaning": "kakak laki-laki",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "兄"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "犬",
    "meaning": "anjing",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "犬"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "妹",
    "meaning": "adik perempuan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "姉妹（しまい） = saudara perempuan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "姉",
    "meaning": "kakak perempuan",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "姉妹（しまい） = saudara perempuan"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  },
  {
    "level": "N4",
    "kanji": "漢",
    "meaning": "China, kanji",
    "onyomi": "-",
    "kunyomi": "-",
    "words": [
      "漢"
    ],
    "note": "Bacaan on/kun bisa dipelajari lewat contoh kosakata."
  }
];

function currentKanjiPool(){
  const level = $('#kanjiLevel')?.value || state.kanjiLevel || 'N5';
  state.kanjiLevel = level;
  return KANJI_DATA.filter(k => level === 'ALL' || k.level === level);
}
function renderKanjiAcademy(){
  const data = currentKanjiPool();
  $('#kanjiCount').textContent = `${data.length} kanji`;
  $('#kanjiGrid').innerHTML = data.map(k => `
    <button class="kanji-card" data-kanji-index="${KANJI_DATA.indexOf(k)}">
      <span class="kanji-big">${escapeHtml(k.kanji)}</span>
      <span>${escapeHtml(k.meaning)}</span>
      <small>${escapeHtml(k.level)}</small>
    </button>`).join('');
  $$('.kanji-card').forEach(btn => btn.addEventListener('click', () => showKanjiDetail(Number(btn.dataset.kanjiIndex))));
  if(data[0]) showKanjiDetail(KANJI_DATA.indexOf(data[0]));
}
function showKanjiDetail(index){
  const k = KANJI_DATA[index];
  if(!k) return;
  state.currentKanji = k;
  $('#kanjiDetail').innerHTML = `
    <div class="kanji-detail-symbol">${escapeHtml(k.kanji)}</div>
    <h3>${escapeHtml(k.meaning)}</h3>
    <p><b>Level:</b> ${escapeHtml(k.level)}</p>
    <p><b>Onyomi:</b> ${escapeHtml(k.onyomi || '-')}</p>
    <p><b>Kunyomi:</b> ${escapeHtml(k.kunyomi || '-')}</p>
    <p class="muted">${escapeHtml(k.note || 'Pelajari kanji ini lewat contoh kosakata.')}</p>
    <div class="kanji-words">${(k.words || []).map(w => `<span>${escapeHtml(w)}</span>`).join('')}</div>
    <div class="actions center-actions">
      <button id="kanjiSoundBtn" class="secondary">🔊 Suara contoh</button>
      <button id="kanjiPickTestBtn">Mulai Tes Kanji</button>
    </div>
  `;
  $('#kanjiSoundBtn').addEventListener('click', () => speakJapanese((k.words?.[0] || k.kanji).replace(/（.*?）/g,'').split('=')[0].trim()));
  $('#kanjiPickTestBtn').addEventListener('click', startKanjiTest);
}
function startKanjiTest(){
  const pool = shuffle(currentKanjiPool());
  state.kanjiTest = pool.slice(0, Math.min(20, pool.length));
  state.kanjiTestIndex = 0;
  state.kanjiScore = 0;
  $('#kanjiTestFeedback').textContent = '';
  renderKanjiQuestion();
}
function renderKanjiQuestion(){
  const q = state.kanjiTest?.[state.kanjiTestIndex];
  if(!q){
    const total = state.kanjiTest?.length || 0;
    $('#kanjiTestQuestion').textContent = '完了';
    $('#kanjiTestHint').textContent = total ? `Tes selesai. Skor kamu ${state.kanjiScore}/${total}.` : 'Tekan Mulai Tes.';
    $('#kanjiTestChoices').innerHTML = '';
    $('#kanjiTypeInput').value = '';
    $('#kanjiTypeInput').disabled = true;
    $('#kanjiTypeSubmit').disabled = true;
    $('#kanjiTestScore').textContent = total ? `Skor akhir: ${state.kanjiScore}/${total}` : 'Skor: -';
    return;
  }
  $('#kanjiTypeInput').disabled = false;
  $('#kanjiTypeSubmit').disabled = false;
  $('#kanjiTypeInput').value = '';
  $('#kanjiTestFeedback').textContent = '';
  $('#kanjiTestScore').textContent = `Soal ${state.kanjiTestIndex + 1}/${state.kanjiTest.length} • Skor: ${state.kanjiScore}`;

  const mode = $('#kanjiTestMode').value;
  if(mode === 'meaning_to_kanji'){
    $('#kanjiTestQuestion').textContent = q.meaning;
    $('#kanjiTestHint').textContent = 'Pilih kanji yang sesuai dengan arti ini.';
    const wrong = shuffle(currentKanjiPool().filter(x => x.kanji !== q.kanji)).slice(0,3).map(x => x.kanji);
    const choices = shuffle([...wrong, q.kanji]);
    $('#kanjiTestChoices').innerHTML = choices.map(c => `<button class="choice kanji-test-choice">${escapeHtml(c)}</button>`).join('');
    $('#kanjiTypeInput').placeholder = 'Atau ketik kanjinya di sini...';
  } else {
    $('#kanjiTestQuestion').textContent = q.kanji;
    $('#kanjiTestHint').textContent = 'Pilih arti yang benar.';
    const wrong = shuffle(currentKanjiPool().filter(x => x.kanji !== q.kanji)).slice(0,3).map(x => x.meaning);
    const choices = shuffle([...wrong, q.meaning]);
    $('#kanjiTestChoices').innerHTML = choices.map(c => `<button class="choice kanji-test-choice">${escapeHtml(c)}</button>`).join('');
    $('#kanjiTypeInput').placeholder = 'Atau ketik arti Indonesia singkat...';
  }
  $$('.kanji-test-choice').forEach(btn => btn.addEventListener('click', () => answerKanjiTest(btn.textContent, q, mode)));
}
function answerKanjiTest(answer, q, mode){
  const a = String(answer || '').trim().toLowerCase();
  const correct = mode === 'meaning_to_kanji'
    ? a === q.kanji.toLowerCase()
    : q.meaning.toLowerCase().split(',').map(x => x.trim()).includes(a) || q.meaning.toLowerCase().includes(a);
  if(correct) state.kanjiScore++;
  $('#kanjiTestFeedback').textContent = correct ? 'Benar! Kanji makin nempel 🈶' : `Kurang tepat. Jawaban: ${q.kanji} = ${q.meaning}`;
  $('#kanjiTestFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';
  touchStudy(correct ? 12 : 3);
  setTimeout(() => { state.kanjiTestIndex++; renderKanjiQuestion(); }, 950);
}
function submitKanjiTyping(){
  const q = state.kanjiTest?.[state.kanjiTestIndex];
  if(!q) return;
  answerKanjiTest($('#kanjiTypeInput').value, q, $('#kanjiTestMode').value);
}
/* =========================
   WAIFU AI LOCAL COACH
========================= */
const WAIFUS = {
  sakura:{name:'Sakura',emoji:'🌸',tone:'lembut'},
  yuki:{name:'Yuki',emoji:'❄️',tone:'tegas'},
  aoi:{name:'Aoi',emoji:'🍵',tone:'kalem'}
};
function renderWaifu(){
  const w = WAIFUS[state.waifu] || WAIFUS.sakura;
  $('#waifuAvatar').textContent = w.emoji;
  $('#waifuName').textContent = `${w.name} Sensei`;
  $('#waifuMessage').textContent = makeWaifuMessage();
}
function setWaifu(name){
  state.waifu = name;
  localStorage.setItem('kotoba_waifu', name);
  renderWaifu();
}
function makeWaifuMessage(){
  const w = WAIFUS[state.waifu] || WAIFUS.sakura;
  const lvl = levelFromXp(state.xp);
  const messages = [
    `${w.name}: Sugoi! Level kamu sekarang ${lvl}. Hari ini minimal 20 kotoba ya.`,
    `${w.name}: Streak kamu ${state.streak} hari. Jangan putus, Sanz-san!`,
    `${w.name}: Untuk hari ini, coba 1 sesi Listening + 1 sesi Kanji Academy.`,
    `${w.name}: Kalau salah, daijoubu. Yang penting review lagi sampai nempel.`
  ];
  return messages[Math.floor(Math.random()*messages.length)];
}

/* =========================
   HELPERS
========================= */
function speakJapanese(text){
  const clean = String(text || '').trim();
  if(!clean) return;

  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } else {
    alert('Browser belum mendukung suara.');
  }
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function hasKana(text){
  return /[ぁ-んァ-ンー]/.test(String(text || ''));
}

function isKanaOnly(text){
  const s = String(text || '').trim();
  return !!s && /^[ぁ-んァ-ンー\s・]+$/.test(s);
}

function kanaOnly(text){
  const s = String(text || '');
  const kana = s.match(/[ぁ-んァ-ンー]+/g);
  return kana ? kana.join('') : '';
}

function shuffle(arr){
  return [...arr].sort(() => Math.random() - 0.5);
}

function shuffleInPlace(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function openMobileSidebar(){
  $('#sidebar').classList.add('open');
  $('#sidebarOverlay').classList.add('show');
}

function closeMobileSidebar(){
  $('#sidebar').classList.remove('open');
  $('#sidebarOverlay').classList.remove('show');
}

/* =========================
   EVENTS
========================= */
$$('.nav').forEach(btn => btn.addEventListener('click', () => setScreen(btn.dataset.screen)));
$('#levelSelect').addEventListener('change', e => { state.level = e.target.value; if(state.screen==='library') loadWords(); });
$('#startFlash').addEventListener('click', startFlash);
$('#showAnswer').addEventListener('click', showAnswer);
$('#playAudio').addEventListener('click', playCurrentAudio);
$('#flashcardBox').addEventListener('click', showAnswer);
ensureFlashControls();
$('#correctBtn').addEventListener('click', () => mark('correct'));
$('#wrongBtn').addEventListener('click', () => mark('wrong'));
$('#startQuiz').addEventListener('click', startQuiz);
$('#searchInput').addEventListener('input', () => loadWords());
$('#resetBtn').addEventListener('click', async () => {
  if(confirm('Reset semua progress belajar?')) {
    await api('/api/reset-progress', {method:'POST'});
    loadStats();
    if(state.screen==='library') loadWords();
  }
});

$$('.kana-tab').forEach(btn => btn.addEventListener('click', () => {
  state.kanaMode = btn.dataset.kanaMode;
  $$('.kana-tab').forEach(b => b.classList.toggle('active', b === btn));
  renderKanaGrid();
}));

$$('.kana-cat').forEach(btn => btn.addEventListener('click', () => {
  state.kanaCategory = btn.dataset.kanaCat;
  $$('.kana-cat').forEach(b => b.classList.toggle('active', b === btn));
  renderKanaGrid();
}));

$('#startKanaTest').addEventListener('click', startKanaTest);
$('#kanaSound').addEventListener('click', () => state.kanaCurrent && speakJapanese(state.kanaCurrent.kana));
$('#mobileMenuBtn').addEventListener('click', openMobileSidebar);
$('#sidebarOverlay').addEventListener('click', closeMobileSidebar);


$('#startListeningLearn').addEventListener('click', startListeningLearn);
$('#playListeningLearn').addEventListener('click', playListeningLearn);
$('#nextListeningLearn').addEventListener('click', nextListeningLearn);
$('#startListeningTest').addEventListener('click', startListeningTest);
$('#replayListening').addEventListener('click', replayListeningQuestion);
$('#startSpeaking').addEventListener('click', startSpeaking);
$('#playSpeaking').addEventListener('click', playSpeakingPrompt);
$('#recordSpeaking').addEventListener('click', startSpeechRecognition);
$('#nextSpeaking').addEventListener('click', nextSpeaking);
$('#kanjiLevel').addEventListener('change', renderKanjiAcademy);
$('#startKanjiTest').addEventListener('click', startKanjiTest);
$('#kanjiTestMode').addEventListener('change', () => { if(state.kanjiTest?.length) renderKanjiQuestion(); });
$('#kanjiTypeSubmit').addEventListener('click', submitKanjiTyping);
$('#kanjiTypeInput').addEventListener('keydown', e => { if(e.key === 'Enter') submitKanjiTyping(); });
$$('.waifu-pick').forEach(btn => btn.addEventListener('click', () => setWaifu(btn.dataset.waifu)));
$('#waifuTalk').addEventListener('click', renderWaifu);

loadStats();
renderGamification();
renderKanaGrid();
