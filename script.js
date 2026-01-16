const CONFIG = {
  tableWidth: 600,
  tableDepth: 1000,
  perspective: 0.7,
  puckRadius: 25,
  paddleRadius: 45,
  goalWidth: 260,
  friction: 0.993,
  wallRestitution: 0.85,
  paddleSpeedLimit: 55,
  aiSpeed: 11.0,
  winningScore: 7
};
const COLORS = {
  bg: '#050510',
  tableBorder: '#00f3ff',
  goalLines: '#ff0055',
  grid: 'rgba(0, 0, 0, 0.9)',
  puck: '#fff',
  puckGlow: '#fff',
  player: '#ff00de',
  ai: '#00f3ff'
};
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('message');
const pScoreEl = document.getElementById('p-score');
const aScoreEl = document.getElementById('a-score');
const gameInfoEl = document.getElementById('game-info');
let gameState = 'MENU';
let scores = {
  player: 0,
  ai: 0
};
let scaleFactor = 1;
let audioCtx;
let lastTime = 0;
let lastHitSoundTime = 0;
let puck = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0
};
let player = {
  x: 0,
  y: 400,
  vx: 0,
  vy: 0
};
let ai = {
  x: 0,
  y: -400,
  vx: 0,
  vy: 0
};
let input = {
  x: 0,
  y: 0
};

function initAudio() {
  if (!audioCtx) audioCtx = new(window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  if (type === 'hit') {
    if (now * 1000 - lastHitSoundTime < 80) return;
    lastHitSoundTime = now * 1000;
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  if (type === 'hit') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'wall') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.1);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'goal') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554, now + 0.1);
    osc.frequency.setValueAtTime(659, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const padding = 50;
  const scaleX = window.innerWidth / (CONFIG.tableWidth + padding);
  const scaleY = window.innerHeight / (CONFIG.tableDepth + padding);
  scaleFactor = Math.min(scaleX, scaleY) * 0.9;
}

function worldToScreen(x, y) {
  const halfDepth = CONFIG.tableDepth / 2;
  const z = (y + halfDepth) / CONFIG.tableDepth;
  const perspectiveScale = CONFIG.perspective + (z * (1 - CONFIG.perspective));
  const screenX = (canvas.width / 2) + (x * scaleFactor * perspectiveScale);
  const screenY = (canvas.height / 2) + (y * scaleFactor);
  return {
    x: screenX,
    y: screenY,
    scale: perspectiveScale
  };
}

function screenToWorldPlayer(sx, sy) {
  const centerY = canvas.height / 2;
  const centerX = canvas.width / 2;
  let wy = (sy - centerY) / scaleFactor;
  const halfDepth = CONFIG.tableDepth / 2;
  const z = (wy + halfDepth) / CONFIG.tableDepth;
  const perspectiveScale = CONFIG.perspective + (z * (1 - CONFIG.perspective));
  let wx = (sx - centerX) / (scaleFactor * perspectiveScale);
  return {
    x: wx,
    y: wy
  };
}

function resetPuck(winner) {
  puck.x = 0;
  puck.y = winner === 'player' ? -200 : 200;
  puck.vy = winner === 'player' ? -2 : 2;
  puck.vx = (Math.random() - 0.5) * 5;
}

function update(dt) {
  if (gameState !== 'PLAYING') return;
  let aiTargetX = puck.x;
  const aiDefensiveY = -CONFIG.tableDepth / 2 + 150;
  const puckSpeed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
  let aiTargetY = aiDefensiveY;
  if (puck.y < -400 && puck.y < ai.y + 10 && puckSpeed < 10) {
    aiTargetY = puck.y - CONFIG.puckRadius - 5;
    if (Math.abs(puck.x) < 100) {
      aiTargetX = puck.x + (puck.x < 0 ? 80 : -80);
    } else {
      aiTargetX = puck.x * 0.8;
    }
  } else if (puck.y < 200 && puck.vy < -8) {
    let framesTillImpact = Math.abs((puck.y - (-CONFIG.tableDepth / 2)) / puck.vy);
    let interceptX = puck.x + (puck.vx * framesTillImpact);
    aiTargetX = Math.max(-CONFIG.goalWidth / 2, Math.min(interceptX, CONFIG.goalWidth / 2));
    aiTargetY = -CONFIG.tableDepth / 2 + 60;
  } else if (puck.y < ai.y) {
    if (puck.x < ai.x) aiTargetX = puck.x + 160;
    else aiTargetX = puck.x - 160;
    aiTargetY = aiDefensiveY;
  } else if (puck.y < -50 && puck.y > ai.y) {
    aiTargetY = puck.y + 30;
    aiTargetX = puck.x;
  } else {
    aiTargetX = puck.x * 0.5;
    aiTargetY = aiDefensiveY - 30;
  }
  aiTargetY = Math.min(-CONFIG.paddleRadius, Math.max(aiTargetY, -CONFIG.tableDepth / 2 + CONFIG.paddleRadius));
  aiTargetX = Math.max(-CONFIG.tableWidth / 2 + CONFIG.paddleRadius, Math.min(aiTargetX, CONFIG.tableWidth / 2 + CONFIG.paddleRadius));
  const dx = aiTargetX - ai.x;
  const dy = aiTargetY - ai.y;
  let aiMoveX = dx * 0.20;
  let aiMoveY = dy * 0.20;
  const aiMax = CONFIG.aiSpeed * dt;
  const moveLen = Math.sqrt(aiMoveX ** 2 + aiMoveY ** 2);
  if (moveLen > aiMax) {
    aiMoveX = (aiMoveX / moveLen) * aiMax;
    aiMoveY = (aiMoveY / moveLen) * aiMax;
  }
  ai.x += aiMoveX;
  ai.y += aiMoveY;
  ai.x = Math.max(-CONFIG.tableWidth / 2 + CONFIG.paddleRadius, Math.min(ai.x, CONFIG.tableWidth / 2 + CONFIG.paddleRadius));
  ai.y = Math.max(-CONFIG.tableDepth / 2 + CONFIG.paddleRadius, Math.min(ai.y, -CONFIG.paddleRadius));
  ai.vx = aiMoveX;
  ai.vy = aiMoveY;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  puck.vx *= Math.pow(CONFIG.friction, dt);
  puck.vy *= Math.pow(CONFIG.friction, dt);
  const oldX = player.x;
  const oldY = player.y;
  let targetX = input.x;
  let targetY = input.y;
  targetY = Math.max(0 + CONFIG.paddleRadius, Math.min(targetY, CONFIG.tableDepth / 2 - CONFIG.paddleRadius));
  targetX = Math.max(-CONFIG.tableWidth / 2 + CONFIG.paddleRadius, Math.min(targetX, CONFIG.tableWidth / 2 - CONFIG.paddleRadius));
  const playerDX = targetX - oldX;
  const playerDY = targetY - oldY;
  const distToTarget = Math.sqrt(playerDX * playerDX + playerDY * playerDY);
  const maxMoveDist = CONFIG.paddleSpeedLimit * dt;
  let moveAmount = Math.min(distToTarget, maxMoveDist);
  let finalX = oldX;
  let finalY = oldY;
  if (distToTarget > 0) {
    finalX = oldX + (playerDX / distToTarget) * moveAmount;
    finalY = oldY + (playerDY / distToTarget) * moveAmount;
  }
  player.x = finalX;
  player.y = finalY;
  player.vx = (player.x - oldX);
  player.vy = (player.y - oldY);
  if (puck.x > CONFIG.tableWidth / 2 - CONFIG.puckRadius) {
    puck.x = CONFIG.tableWidth / 2 - CONFIG.puckRadius;
    puck.vx *= -CONFIG.wallRestitution;
    playSound('wall');
  } else if (puck.x < -CONFIG.tableWidth / 2 + CONFIG.puckRadius) {
    puck.x = -CONFIG.tableWidth / 2 + CONFIG.puckRadius;
    puck.vx *= -CONFIG.wallRestitution;
    playSound('wall');
  }
  const goalHalf = CONFIG.goalWidth / 2;
  if (puck.y < -CONFIG.tableDepth / 2 + CONFIG.puckRadius) {
    if (Math.abs(puck.x) >= goalHalf) {
      puck.y = -CONFIG.tableDepth / 2 + CONFIG.puckRadius;
      puck.vy *= -CONFIG.wallRestitution;
      playSound('wall');
    }
  }
  if (puck.y > CONFIG.tableDepth / 2 - CONFIG.puckRadius) {
    if (Math.abs(puck.x) >= goalHalf) {
      puck.y = CONFIG.tableDepth / 2 - CONFIG.puckRadius;
      puck.vy *= -CONFIG.wallRestitution;
      playSound('wall');
    }
  }
  checkPaddleCollision(ai, dt);
  checkPaddleCollision(player, dt);
  if (puck.y < -CONFIG.tableDepth / 2 - CONFIG.puckRadius) score('player');
  else if (puck.y > CONFIG.tableDepth / 2 + CONFIG.puckRadius) score('ai');
}

function checkPaddleCollision(paddle, dt) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = CONFIG.puckRadius + CONFIG.paddleRadius;
  if (dist < minDist) {
    playSound('hit');
    const nx = dx / dist; // Normal vector x
    const ny = dy / dist; // Normal vector y
    const overlap = minDist - dist;
    puck.x += nx * overlap;
    puck.y += ny * overlap;
    const relativeVX = puck.vx - paddle.vx;
    const relativeVY = puck.vy - paddle.vy;
    const V_norm = relativeVX * nx + relativeVY * ny;
    if (V_norm < 0) {
      const e = 0.9;
      const J = -(1 + e) * V_norm;
      puck.vx += J * nx;
      puck.vy += J * ny;
      if (paddle === ai && puck.vy > 0) {
        puck.vy += 2;
      }
    }
    const speed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
    const maxPuckSpeed = 60;
    if (speed > maxPuckSpeed) {
      const r = maxPuckSpeed / speed;
      puck.vx *= r;
      puck.vy *= r;
    }
  }
}

function score(winner) {
  gameState = 'SCORED';
  playSound('goal');
  if (winner === 'player') scores.player++;
  else scores.ai++;
  pScoreEl.innerText = scores.player;
  aScoreEl.innerText = scores.ai;
  if (scores.player >= CONFIG.winningScore || scores.ai >= CONFIG.winningScore) {
    endGame();
  } else {
    setTimeout(() => {
      resetPuck(winner);
      lastTime = performance.now();
      gameState = 'PLAYING';
    }, 1000);
  }
}

function endGame() {
  gameState = 'GAMEOVER';
  const winnerText = scores.player > scores.ai ? "YOU WIN!" : "GAME OVER";
  msgBox.style.display = 'flex';
  msgBox.querySelector('h1').innerText = winnerText;
  gameInfoEl.innerText = `${scores.player} - ${scores.ai}`;
  const optionsDiv = document.getElementById('difficulty-options');
  optionsDiv.innerHTML = '<button id="reset-btn">PLAY AGAIN</button>';
  document.getElementById('reset-btn').addEventListener('click', resetToMenu, {
    once: true
  });
}

function resetToMenu() {
  msgBox.querySelector('h1').innerText = "Neon Shufflepuck";
  gameInfoEl.innerText = "First to 7 points wins.";
  const optionsDiv = document.getElementById('difficulty-options');
  optionsDiv.innerHTML = `
        <button class="difficulty-btn" data-speed="8.0">Beginner</button>
        <button class="difficulty-btn" data-speed="11.0">Expert</button>
    `;
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', startGameWithDifficulty, {
      once: true
    });
  });
  scores.player = 0;
  scores.ai = 0;
  pScoreEl.innerText = '0';
  aScoreEl.innerText = '0';
  gameState = 'MENU';
}

function startGameWithDifficulty(e) {
  const speed = parseFloat(e.target.dataset.speed);
  CONFIG.aiSpeed = speed;
  initAudio();
  msgBox.style.display = 'none';
  scores.player = 0;
  scores.ai = 0;
  pScoreEl.innerText = '0';
  aScoreEl.innerText = '0';
  resetPuck('player');
  lastTime = performance.now();
  gameState = 'PLAYING';
  requestAnimationFrame(loop);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const halfW = CONFIG.tableWidth / 2;
  const halfD = CONFIG.tableDepth / 2;
  const goalHalf = CONFIG.goalWidth / 2;
  const tl = worldToScreen(-halfW, -halfD);
  const tr = worldToScreen(halfW, -halfD);
  const bl = worldToScreen(-halfW, halfD);
  const br = worldToScreen(halfW, halfD);
  const aiGoalL = worldToScreen(-goalHalf, -halfD);
  const aiGoalR = worldToScreen(goalHalf, -halfD);
  const plGoalL = worldToScreen(-goalHalf, halfD);
  const plGoalR = worldToScreen(goalHalf, halfD);
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = COLORS.tableBorder;
  ctx.strokeStyle = COLORS.tableBorder;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.lineTo(plGoalL.x, plGoalL.y);
  ctx.moveTo(plGoalR.x, plGoalR.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(aiGoalR.x, aiGoalR.y);
  ctx.moveTo(aiGoalL.x, aiGoalL.y);
  ctx.lineTo(tl.x, tl.y);
  ctx.stroke();
  ctx.shadowColor = COLORS.goalLines;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = COLORS.goalLines;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(aiGoalL.x, aiGoalL.y);
  ctx.lineTo(aiGoalR.x, aiGoalR.y);
  ctx.moveTo(plGoalL.x, plGoalL.y);
  ctx.lineTo(plGoalR.x, plGoalR.y);
  ctx.stroke();
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ff00de';
  ctx.strokeStyle = 'rgba(255, 0, 222, 0.4)';
  ctx.lineWidth = 2;
  const ml = worldToScreen(-halfW, 0);
  const mr = worldToScreen(halfW, 0);
  ctx.beginPath();
  ctx.moveTo(ml.x, ml.y);
  ctx.lineTo(mr.x, mr.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.grid;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.fill();
  ctx.restore();
  drawPaddle(ai, COLORS.ai);
  drawPuck();
  drawPaddle(player, COLORS.player);
}

function drawPaddle(obj, color) {
  const pos = worldToScreen(obj.x, obj.y);
  const r = CONFIG.paddleRadius * scaleFactor * pos.scale;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.beginPath();
  ctx.arc(0, r * 0.2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * pos.scale;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawPuck() {
  const pos = worldToScreen(puck.x, puck.y);
  const r = CONFIG.puckRadius * scaleFactor * pos.scale;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.shadowBlur = 15;
  ctx.shadowColor = COLORS.puckGlow;
  ctx.strokeStyle = COLORS.puck;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();
  ctx.restore();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = (timestamp - lastTime) / 16.666;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
window.addEventListener('resize', resize);
window.addEventListener('mousemove', e => {
  const worldPos = screenToWorldPlayer(e.clientX, e.clientY);
  input.x = worldPos.x;
  input.y = worldPos.y;
});
window.addEventListener('touchmove', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const worldPos = screenToWorldPlayer(touch.clientX, touch.clientY);
  input.x = worldPos.x;
  input.y = worldPos.y;
}, {
  passive: false
});
document.querySelectorAll('.difficulty-btn').forEach(button => {
  button.addEventListener('click', startGameWithDifficulty, {
    once: true
  });
});
resize();
draw();