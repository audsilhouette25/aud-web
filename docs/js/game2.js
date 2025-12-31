// /js/game2.js - ASMR Sequence Game
(function() {
  'use strict';

  // ====== 설정 (APP_CONFIG/ASSETS 사용) ======
  const LABELS = (window.APP_CONFIG?.LABELS) || ["thump", "miro", "whee", "track", "echo", "portal"];

  // ASSETS API 대기 함수
  function waitForAssets(fn) {
    if (window.ASSETS) return fn();
    window.addEventListener("ASSETS:ready", fn, { once: true });
  }

  // 이미지/오디오 경로 (ASSETS API 사용)
  function getImagePath(label) {
    return window.ASSETS?.getLabelImg?.(label) || `./asset/${label}.png`;
  }

  function getAudioPath(label) {
    return window.ASSETS?.getLabelAudio?.(label) || `./asset/${label}.mp3`;
  }

  // ====== 게임 상태 ======
  let stackCount = 4;
  let answerSequence = [];  // 정답 순서 (label 배열)
  let userSequence = [];    // 사용자 입력 순서
  let replaysLeft = 3;
  let isPlaying = false;
  let audioCache = {};      // 오디오 캐시

  // ====== DOM 요소 ======
  let setupArea, gameArea, stackBoard, sourceItems;
  let replayText, checkBtn, playAudioBtn;
  let resultModal, resultIcon, resultTitle, resultMessage;
  let howtoModal;

  // ====== 초기화 ======
  function init() {
    setupArea = document.getElementById('setup-area');
    gameArea = document.getElementById('game-area');
    stackBoard = document.getElementById('stack-board');
    sourceItems = document.getElementById('source-items');
    replayText = document.getElementById('replay-count');
    checkBtn = document.getElementById('check-answer-btn');
    playAudioBtn = document.getElementById('play-audio-btn');
    resultModal = document.getElementById('result-modal');
    resultIcon = document.getElementById('result-icon');
    resultTitle = document.getElementById('result-title');
    resultMessage = document.getElementById('result-message');
    howtoModal = document.getElementById('howto-modal');

    // 이벤트 바인딩
    document.getElementById('start-btn')?.addEventListener('click', startGame);
    playAudioBtn?.addEventListener('click', playSequence);
    checkBtn?.addEventListener('click', checkAnswer);
    document.getElementById('reset-game-btn')?.addEventListener('click', resetGame);
    document.getElementById('play-again-btn')?.addEventListener('click', () => {
      closeModal();
      resetGame();
    });
    document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
    resultModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

    // How to Play 모달
    document.getElementById('open-howto-btn')?.addEventListener('click', openHowto);
    document.getElementById('close-howto-btn')?.addEventListener('click', closeHowto);
    howtoModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeHowto);

    // 오디오 미리 로드 시도
    preloadAudio();
  }

  // ====== 오디오 미리 로드 ======
  function preloadAudio() {
    LABELS.forEach(label => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = getAudioPath(label);
      audioCache[label] = audio;
    });
  }

  // ====== 게임 시작 ======
  function startGame() {
    stackCount = parseInt(document.getElementById('stack-count').value) || 4;
    stackCount = Math.max(2, Math.min(10, stackCount)); // 2-10 제한

    // 랜덤 시퀀스 생성 (LABELS에서 stackCount개 선택, 중복 허용)
    answerSequence = [];
    for (let i = 0; i < stackCount; i++) {
      const randomLabel = LABELS[Math.floor(Math.random() * LABELS.length)];
      answerSequence.push(randomLabel);
    }

    userSequence = Array(stackCount).fill(null);
    replaysLeft = 3;
    updateReplayCount();

    // UI 전환
    setupArea.style.display = 'none';
    gameArea.style.display = 'block';

    // 보드 초기화
    initBoard();
    initSourceItems();

    // 버튼 상태 초기화
    playAudioBtn.disabled = false;
    checkBtn.disabled = true;
  }

  // ====== 슬롯 보드 초기화 ======
  function initBoard() {
    stackBoard.innerHTML = '';
    for (let i = 0; i < stackCount; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = i;

      // 슬롯 번호 표시
      const number = document.createElement('span');
      number.className = 'slot-number';
      number.textContent = i + 1;
      slot.appendChild(number);

      // 드래그 앤 드롭 이벤트
      slot.addEventListener('dragover', handleDragOver);
      slot.addEventListener('dragenter', handleDragEnter);
      slot.addEventListener('dragleave', handleDragLeave);
      slot.addEventListener('drop', handleDrop);

      // 클릭으로 슬롯 비우기
      slot.addEventListener('click', () => clearSlot(slot, i));

      stackBoard.appendChild(slot);
    }
  }

  // ====== 배열 셔플 (Fisher-Yates) ======
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ====== 소스 아이템 초기화 ======
  function initSourceItems() {
    sourceItems.innerHTML = '';

    // 시퀀스에 사용된 유니크 라벨들을 셔플해서 랜덤 순서로 표시
    const uniqueLabels = shuffle([...new Set(answerSequence)]);

    uniqueLabels.forEach(label => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.draggable = true;
      item.dataset.label = label;

      const img = document.createElement('img');
      img.src = getImagePath(label);
      img.alt = label;
      img.draggable = false;

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = label;

      item.appendChild(img);
      item.appendChild(name);

      // 드래그 이벤트
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);

      sourceItems.appendChild(item);
    });
  }

  // ====== 드래그 앤 드롭 핸들러 ======
  function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.label);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('over');
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('over');
  }

  function handleDrop(e) {
    e.preventDefault();
    const slot = e.currentTarget;
    slot.classList.remove('over');

    const label = e.dataTransfer.getData('text/plain');
    if (!label) return;

    const index = parseInt(slot.dataset.index);

    // 슬롯에 아이템 배치
    placeItem(slot, label, index);
  }

  function placeItem(slot, label, index) {
    // 기존 아이템 제거 (번호는 유지)
    const existing = slot.querySelector('.placed-item');
    if (existing) existing.remove();

    // 새 아이템 생성
    const item = document.createElement('div');
    item.className = 'placed-item';

    const img = document.createElement('img');
    img.src = getImagePath(label);
    img.alt = label;

    item.appendChild(img);
    slot.appendChild(item);
    slot.classList.add('filled');

    // 사용자 시퀀스 업데이트
    userSequence[index] = label;

    // 모든 슬롯이 채워졌는지 확인
    checkBtn.disabled = userSequence.includes(null);
  }

  // ====== 슬롯 비우기 ======
  function clearSlot(slot, index) {
    const existing = slot.querySelector('.placed-item');
    if (!existing) return;

    existing.remove();
    slot.classList.remove('filled');
    userSequence[index] = null;

    // 버튼 상태 업데이트
    checkBtn.disabled = userSequence.includes(null);
  }

  // ====== 오디오 재생 ======
  async function playSequence() {
    if (isPlaying || replaysLeft <= 0) return;

    isPlaying = true;
    playAudioBtn.disabled = true;
    playAudioBtn.classList.add('playing');
    replaysLeft--;
    updateReplayCount();

    for (let i = 0; i < answerSequence.length; i++) {
      const label = answerSequence[i];

      // 비공개: 재생 중 어떤 슬롯인지 시각적으로 표시하지 않음
      await playSound(label);

      // 다음 소리 전 0.5초 정적
      if (i < answerSequence.length - 1) {
        await delay(500);
      }
    }

    isPlaying = false;
    playAudioBtn.classList.remove('playing');
    if (replaysLeft > 0) {
      playAudioBtn.disabled = false;
    }
  }

  function playSound(label) {
    return new Promise(resolve => {
      const audio = audioCache[label];
      if (!audio) {
        // 오디오 파일이 없으면 짧은 딜레이 후 완료
        setTimeout(resolve, 500);
        return;
      }

      audio.currentTime = 0;
      audio.play().then(() => {
        audio.onended = resolve;
      }).catch(() => {
        // 오디오 재생 실패 시 딜레이 후 완료
        setTimeout(resolve, 500);
      });
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function updateReplayCount() {
    if (replayText) {
      replayText.textContent = `${replaysLeft} / 3`;
      replayText.classList.toggle('low', replaysLeft <= 1);
    }
  }

  // ====== 정답 확인 ======
  function checkAnswer() {
    const isCorrect = answerSequence.every((label, i) => userSequence[i] === label);

    if (isCorrect) {
      showResult(true);
    } else {
      showResult(false);
    }
  }

  function showResult(isCorrect) {
    resultIcon.innerHTML = isCorrect ? '🎉' : '😢';
    resultTitle.textContent = isCorrect ? 'Correct!' : 'Wrong...';
    resultMessage.textContent = isCorrect
      ? 'Perfect! You have great ears!'
      : `The correct order was: ${answerSequence.join(' → ')}`;

    resultModal.classList.add('is-open');
    resultModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    resultModal.classList.remove('is-open');
    resultModal.setAttribute('aria-hidden', 'true');
  }

  // ====== How to Play 모달 ======
  function openHowto() {
    howtoModal.classList.add('is-open');
    howtoModal.setAttribute('aria-hidden', 'false');
  }

  function closeHowto() {
    howtoModal.classList.remove('is-open');
    howtoModal.setAttribute('aria-hidden', 'true');
  }

  // ====== 게임 리셋 ======
  function resetGame() {
    // 상태 초기화
    answerSequence = [];
    userSequence = [];
    replaysLeft = 3;
    isPlaying = false;

    // UI 초기화
    setupArea.style.display = 'block';
    gameArea.style.display = 'none';
    stackBoard.innerHTML = '';
    sourceItems.innerHTML = '';

    updateReplayCount();
  }

  // ====== DOMContentLoaded ======
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    waitForAssets(init);
  });
})();
