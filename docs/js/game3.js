// /js/game3.js - Waveform Match Game
(function() {
  'use strict';

  // ====== 설정 (APP_CONFIG/ASSETS 사용) ======
  const LABELS = (window.APP_CONFIG?.LABELS) || ["thump", "miro", "whee", "track", "echo", "portal"];

  // ASSETS API 대기 함수
  function waitForAssets(fn) {
    if (window.ASSETS) return fn();
    window.addEventListener("ASSETS:ready", fn, { once: true });
  }

  // 오디오 경로 (ASSETS API 사용)
  function getAudioPath(label) {
    return window.ASSETS?.getLabelAudio?.(label) || `./asset/${label}.mp3`;
  }

  // 이미지 경로 (선택지 아이콘용)
  function getImagePath(label) {
    return window.ASSETS?.getLabelImg?.(label) || `./asset/${label}.png`;
  }

  // ====== 게임 상태 ======
  let currentLabel = null;      // 정답 라벨
  let choiceLabels = [];        // 선택지 라벨들 (3개)
  let points = [];              // 파형 데이터
  let audioCtx = null;
  let analyser = null;
  let animationId = null;
  let currentAudio = null;

  // ====== DOM 요소 ======
  let canvas, ctx, scanLine, statusMsg;
  let playBtn, choiceArea, choiceButtons;
  let resultArea, resultIcon, resultTitle, resultDesc;
  let howtoModal;

  // ====== 배열 셔플 (Fisher-Yates) ======
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ====== 초기화 ======
  function init() {
    canvas = document.getElementById('mainCanvas');
    ctx = canvas.getContext('2d');
    scanLine = document.getElementById('scanLine');
    statusMsg = document.getElementById('statusMsg');
    playBtn = document.getElementById('playBtn');
    choiceArea = document.getElementById('choiceArea');
    choiceButtons = document.getElementById('choiceButtons');
    resultArea = document.getElementById('resultArea');
    resultIcon = document.getElementById('resultIcon');
    resultTitle = document.getElementById('resultTitle');
    resultDesc = document.getElementById('resultDesc');
    howtoModal = document.getElementById('howtoModal');

    // 캔버스 크기 설정
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 이벤트 바인딩
    playBtn.addEventListener('click', startGame);
    document.getElementById('playAgainBtn')?.addEventListener('click', resetGame);
    document.getElementById('backToGamesBtn')?.addEventListener('click', () => {
      location.href = './game.html';
    });

    // How to Play 모달
    document.getElementById('openHowtoBtn')?.addEventListener('click', openHowto);
    document.getElementById('closeHowtoBtn')?.addEventListener('click', closeHowto);
    howtoModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeHowto);
  }

  // ====== How to Play 모달 ======
  function openHowto() {
    if (howtoModal) {
      howtoModal.classList.add('is-open');
      howtoModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeHowto() {
    if (howtoModal) {
      howtoModal.classList.remove('is-open');
      howtoModal.setAttribute('aria-hidden', 'true');
    }
  }

  // ====== 캔버스 크기 설정 ======
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  // ====== 게임 시작 ======
  async function startGame() {
    // 정답 라벨 랜덤 선택
    currentLabel = LABELS[Math.floor(Math.random() * LABELS.length)];

    // 선택지 생성 (정답 + 랜덤 2개)
    const otherLabels = LABELS.filter(l => l !== currentLabel);
    const randomOthers = shuffle(otherLabels).slice(0, 2);
    choiceLabels = shuffle([currentLabel, ...randomOthers]);

    // UI 초기화
    playBtn.style.display = 'none';
    choiceArea.style.display = 'none';
    resultArea.style.display = 'none';
    statusMsg.textContent = 'Scanning...';
    statusMsg.style.display = 'block';

    // 캔버스 초기화
    const displayWidth = canvas.width / (window.devicePixelRatio || 1);
    const displayHeight = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    points = [];

    // 오디오 생성 및 Web Audio API 설정
    currentAudio = new Audio(getAudioPath(currentLabel));
    currentAudio.crossOrigin = 'anonymous';

    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;

      const source = audioCtx.createMediaElementSource(currentAudio);
      source.connect(analyser);
      // 스피커에 연결하지 않음 (무음 재생)

      scanLine.style.display = 'block';
      scanLine.style.left = '0px';

      currentAudio.play();
      draw();
    } catch (err) {
      console.error('Audio error:', err);
      statusMsg.textContent = 'Audio error';
    }
  }

  // ====== 파형 그리기 ======
  function draw() {
    if (!currentAudio || currentAudio.paused || currentAudio.ended) {
      cancelAnimationFrame(animationId);
      scanLine.style.display = 'none';
      statusMsg.style.display = 'none';
      showChoices();
      return;
    }

    const displayWidth = canvas.width / (window.devicePixelRatio || 1);
    const displayHeight = canvas.height / (window.devicePixelRatio || 1);

    // 현재 재생 위치에 따른 X 좌표
    const x = (currentAudio.currentTime / currentAudio.duration) * displayWidth;
    scanLine.style.left = `${x}px`;

    // 진폭 데이터 가져오기
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // 최대 진폭 찾기
    let maxV = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = Math.abs(dataArray[i] - 128);
      if (v > maxV) maxV = v;
    }

    // 파형 좌표 계산
    const yCenter = displayHeight / 2;
    const amplitude = (maxV / 128) * yCenter * 1.5;
    const point = { x, yUp: yCenter - amplitude, yDown: yCenter + amplitude };
    points.push(point);

    // 선 그리기
    ctx.beginPath();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    if (points.length > 1) {
      const prev = points[points.length - 2];
      ctx.moveTo(prev.x, prev.yUp);
      ctx.lineTo(point.x, point.yUp);
      ctx.moveTo(prev.x, prev.yDown);
      ctx.lineTo(point.x, point.yDown);
    }
    ctx.stroke();

    animationId = requestAnimationFrame(draw);
  }

  // ====== 선택지 표시 ======
  function showChoices() {
    choiceButtons.innerHTML = '';

    choiceLabels.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.dataset.label = label;

      const iconBox = document.createElement('div');
      iconBox.className = 'icon-box';
      const img = document.createElement('img');
      img.src = getImagePath(label);
      img.alt = label;
      iconBox.appendChild(img);

      const span = document.createElement('span');
      span.textContent = label.toUpperCase();

      btn.appendChild(iconBox);
      btn.appendChild(span);
      btn.addEventListener('click', () => checkAnswer(label));

      choiceButtons.appendChild(btn);
    });

    choiceArea.style.display = 'block';
  }

  // ====== 정답 확인 ======
  function checkAnswer(selectedLabel) {
    const isCorrect = selectedLabel === currentLabel;

    choiceArea.style.display = 'none';
    resultArea.style.display = 'block';

    if (isCorrect) {
      resultIcon.innerHTML = '🎉';
      resultTitle.textContent = 'Correct!';
      resultTitle.style.color = '#2D5AFE';
      resultDesc.textContent = 'You have a great ear for sound patterns!';
    } else {
      resultIcon.innerHTML = '😢';
      resultTitle.textContent = 'Wrong...';
      resultTitle.style.color = '#FF4D4D';
      resultDesc.textContent = `The answer was "${currentLabel.toUpperCase()}". The orange line shows the correct waveform.`;

      // 오답 시 정답 파형 오버레이 (같은 데이터를 다른 색으로)
      drawOverlay();
    }
  }

  // ====== 오버레이 그리기 ======
  function drawOverlay() {
    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#FFA765';
    ctx.lineWidth = 3;

    // 상단 파형
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].yUp);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].yUp);
    }
    ctx.stroke();

    // 하단 파형
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].yDown);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].yDown);
    }
    ctx.stroke();

    ctx.restore();
  }

  // ====== 게임 리셋 ======
  function resetGame() {
    // 오디오 정리
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // 상태 초기화
    currentLabel = null;
    choiceLabels = [];
    points = [];

    // UI 초기화
    const displayWidth = canvas.width / (window.devicePixelRatio || 1);
    const displayHeight = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    playBtn.style.display = 'block';
    choiceArea.style.display = 'none';
    resultArea.style.display = 'none';
    statusMsg.textContent = 'Ready';
    statusMsg.style.display = 'block';
    scanLine.style.display = 'none';
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
