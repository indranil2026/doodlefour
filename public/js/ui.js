// public/js/ui.js
// Screen management and UI updates

import { GameState } from './gameState.js';

const screens = {
  home: document.getElementById('screen-home'),
  matchmaking: document.getElementById('screen-matchmaking'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
};

let countdownEl = null;
let notifTimeout = null;

export const UI = {
  showScreen(name) {
    GameState.screen = name;
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('active', key === name);
    });
  },

  showCountdown(count) {
    if (!countdownEl) {
      countdownEl = document.getElementById('countdown-overlay');
    }
    if (!countdownEl) return;
    countdownEl.textContent = count;
    countdownEl.style.display = 'flex';
    countdownEl.style.opacity = '1';
    
    // Play soothing ascending countdown chime
    import('./soundManager.js').then(m => m.sound.playCountdownBeep(count));

    // Animate pulse
    countdownEl.style.transform = 'scale(1.4)';
    requestAnimationFrame(() => {
      countdownEl.style.transition = 'transform 0.8s ease, opacity 0.8s ease';
      countdownEl.style.transform = 'scale(1)';
    });
  },

  hideCountdown() {
    if (!countdownEl) return;
    countdownEl.textContent = 'GO!';
    countdownEl.style.transform = 'scale(1.6)';
    
    // Play warm GO chime chord
    import('./soundManager.js').then(m => m.sound.playCountdownBeep('GO!'));

    setTimeout(() => {
      countdownEl.style.opacity = '0';
      setTimeout(() => {
        countdownEl.style.display = 'none';
        countdownEl.style.transition = '';
      }, 500);
    }, 600);
  },

  showResult(isWinner, timeMs) {
    this.showScreen('result');

    const titleEl = document.getElementById('result-title');
    const timeEl = document.getElementById('result-time');
    const iconEl = document.getElementById('result-icon');

    if (titleEl) {
      titleEl.textContent = isWinner ? 'YOU WIN!' : 'YOU LOST';
      titleEl.style.color = '#1F1F1F';
    }
    
    if (timeEl && timeMs) {
      const secs = (timeMs / 1000).toFixed(2);
      timeEl.textContent = `Match time: ${secs}s`;
    }

    // Reset rematch button state
    const btnRematch = document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.disabled = false;
      const textSpan = btnRematch.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = 'Play again';
      const iconSvg = btnRematch.querySelector('.btn-play-icon');
      if (iconSvg) {
        iconSvg.innerHTML = '<path d="M 6,4 C 11,8 17,11 19,12 C 17,13 11,16 6,20 C 5,12 5,8 6,4 Z" />';
      }
    }

    if (isWinner) {
      if (iconEl) {
        iconEl.src = '/images/win/trophy.png';
        iconEl.style.width = '100%';
        iconEl.style.height = '100%';
        const wrap = iconEl.closest('.result-icon-wrap');
        if (wrap) { wrap.style.width = '150px'; wrap.style.height = '150px'; }
      }
      triggerConfettiBlast();
      initWinQuotes();
    } else {
      if (iconEl) {
        const loseImages = [
          '/svg/looses/Tracing (13).svg',
          '/svg/looses/Tracing (14).svg',
          '/svg/looses/Tracing (15).svg',
          '/svg/looses/Tracing (16).svg',
          '/svg/looses/Tracing (17).svg',
          '/svg/looses/Tracing (18).svg',
          '/svg/looses/Tracing (19).svg',
          '/svg/looses/Tracing (20).svg',
          '/svg/looses/Tracing (21).svg',
          '/svg/looses/Tracing (22).svg',
          '/svg/looses/Tracing (23).svg',
          '/svg/looses/Tracing (24).svg',
        ];
        const randomImg = loseImages[Math.floor(Math.random() * loseImages.length)];
        iconEl.src = randomImg;
        iconEl.style.width = '100%';
        iconEl.style.height = '100%';
        iconEl.style.objectFit = 'contain';
        const wrap = iconEl.closest('.result-icon-wrap');
        if (wrap) { wrap.style.width = '110px'; wrap.style.height = '110px'; }
      }
      initLoseQuotes();
    }
  },

  showOpponentDisconnected() {
    this._showNotif('Opponent disconnected 😢', 4000);
    this.showScreen('home');
  },

  showOpponentWantsRematch() {
    const btn = document.getElementById('btn-rematch');
    if (btn) {
      const textSpan = btn.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = 'Accept Rematch';
      
      const iconSvg = btn.querySelector('.btn-play-icon');
      if (iconSvg) {
        // Hand-drawn circular checkmark matching the reference image
        iconSvg.innerHTML = `
          <circle cx="12" cy="12" r="9.5" stroke="#fdfdfd" stroke-width="2" fill="none" />
          <path d="M 7.5,12.2 L 10.5,15.2 L 16.5,9" stroke="#fdfdfd" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        `;
      }
    }
  },

  _showNotif(msg, duration = 3000) {
    let notif = document.getElementById('notif-bar');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'notif-bar';
      notif.className = 'notif-bar';
      document.body.appendChild(notif);
    }
    notif.textContent = msg;
    notif.style.opacity = '1';
    if (notifTimeout) clearTimeout(notifTimeout);
    notifTimeout = setTimeout(() => { notif.style.opacity = '0'; }, duration);
  }
};

// ─── Button bindings ────────────────────────────────────────────────────────

export function initUI() {
  // Home → Matchmaking
  const btnPlay = document.getElementById('btn-play');
  if (btnPlay) {
    btnPlay.addEventListener('click', async () => {
      UI.showScreen('matchmaking');
      const { joinMatchmaking } = await import('./network.js');
      joinMatchmaking();
    });
  }

  // Cancel matchmaking
  const btnCancel = document.getElementById('btn-cancel-mm');
  if (btnCancel) {
    btnCancel.addEventListener('click', async () => {
      const { cancelMatchmaking } = await import('./network.js');
      cancelMatchmaking();
      UI.showScreen('home');
    });
  }

  // Result → Home
  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      GameState.reset();
      UI.showScreen('home');
    });
  }

  // Result → Rematch
  const btnRematch = document.getElementById('btn-rematch');
  if (btnRematch) {
    btnRematch.addEventListener('click', async () => {
      const { sendRematchRequest } = await import('./network.js');
      sendRematchRequest();
      btnRematch.querySelector('.btn-text').textContent = 'Waiting...';
      btnRematch.disabled = true;
    });
  }

  // Sound Toggle Button
  const btnSound = document.getElementById('btn-sound-toggle');
  const soundIcon = document.getElementById('sound-icon');
  if (btnSound && soundIcon) {
    import('./soundManager.js').then(m => {
      soundIcon.textContent = m.sound.isMuted() ? '🔇' : '🔊';
    });

    btnSound.addEventListener('click', async () => {
      const { sound } = await import('./soundManager.js');
      const isMuted = sound.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
    });
  }

  initQuotes();
  initMatchmakingQuotes();
}

const QUOTES = [
  "Finish line in sight. Good luck getting there.",
  "Two dots enter. One wins.",
  "Your friend found the gap. You found the wall.",
  "Every gap looks possible.",
  "Simple race. Sure.",
  "The walls don't move. You still lose.",
  "Find the gap. Beat your friend.",
  "Tiny dot. Big mistakes.",
  "Race your friend. Avoid embarrassment.",
  "There's a path. Probably.",
  "Too tiny to quit.",
  "You. Your friend. Too many walls.",
  "Shortest path? Definitely blocked.",
  "See the finish? Try reaching it."
];

function initQuotes() {
  const quoteEl = document.getElementById('random-quote');
  if (!quoteEl) return;
  setInterval(() => {
    quoteEl.style.opacity = '0';
    setTimeout(() => {
      const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      quoteEl.textContent = q;
      quoteEl.style.opacity = '1';
    }, 500);
  }, 4000);
}

const MM_QUOTES = [
  "Start at the same point.",
  "Move with the joystick.",
  "Dodge the obstacles.",
  "Find the perfect gap.",
  "Choose your path.",
  "Reach the finish.",
  "Beat your opponent.",
  "Win the race!"
];

let mmQuoteIndex = 0;

function initMatchmakingQuotes() {
  const quoteEl = document.getElementById('mm-random-quote');
  const dotsEl = document.getElementById('mm-dots');

  if (dotsEl) {
    let dotCount = 0;
    setInterval(() => {
      dotCount = (dotCount % 3) + 1;
      dotsEl.textContent = '.'.repeat(dotCount);
    }, 500);
  }

  if (quoteEl) {
    setInterval(() => {
      quoteEl.style.opacity = '0';
      setTimeout(() => {
        mmQuoteIndex = (mmQuoteIndex + 1) % MM_QUOTES.length;
        quoteEl.textContent = MM_QUOTES[mmQuoteIndex];
        quoteEl.style.opacity = '1';
      }, 500);
    }, 4000);
  }
}

const WIN_QUOTES = [
  "You absolutely crushed it!",
  "That was an incredible run!",
  "You nailed it!",
  "What a finish!",
  "You were unstoppable!",
  "You made it look easy!",
  "That was seriously impressive!",
  "You owned that maze!",
  "You found your way to victory!",
  "You just conquered the maze!",
  "Victory looks good on you!",
  "That finish was legendary!",
  "You beat the maze. You beat the competition.",
  "You were born to dodge!",
  "The maze never stood a chance!",
  "You found the way when it mattered!",
  "You dodged. You raced. You conquered.",
  "That was one smooth escape!",
  "You just pulled off a masterpiece!",
  "The finish line belongs to you!"
];

let winQuoteIndex = 0;
let winQuoteInterval = null;
let loseQuoteInterval = null;

export function initWinQuotes() {
  const quoteEl = document.getElementById('result-random-quote');
  if (!quoteEl) return;
  if (winQuoteInterval) clearInterval(winQuoteInterval);
  if (loseQuoteInterval) { clearInterval(loseQuoteInterval); loseQuoteInterval = null; }
  
  winQuoteInterval = setInterval(() => {
    quoteEl.style.opacity = '0';
    setTimeout(() => {
      winQuoteIndex = Math.floor(Math.random() * WIN_QUOTES.length);
      quoteEl.textContent = WIN_QUOTES[winQuoteIndex];
      quoteEl.style.opacity = '1';
    }, 500);
  }, 4000);
}

const LOSE_QUOTES = [
  "So Close!",
  "Not This Time!",
  "Almost There!",
  "Nice Try!",
  "Keep Fighting!",
  "The Rematch Is Waiting.",
  "One More Round?",
  "The Maze Won This One.",
  "Your Turn Is Coming.",
  "Not Over Yet.",
  "Round Lost. Game On.",
  "You'll Get It Next Time.",
  "So Close, Yet So Far.",
];

export function initLoseQuotes() {
  const quoteEl = document.getElementById('result-random-quote');
  if (!quoteEl) return;
  if (loseQuoteInterval) clearInterval(loseQuoteInterval);
  if (winQuoteInterval) { clearInterval(winQuoteInterval); winQuoteInterval = null; }

  // Show a random quote immediately
  quoteEl.textContent = LOSE_QUOTES[Math.floor(Math.random() * LOSE_QUOTES.length)];
  quoteEl.style.opacity = '1';

  loseQuoteInterval = setInterval(() => {
    quoteEl.style.opacity = '0';
    setTimeout(() => {
      quoteEl.textContent = LOSE_QUOTES[Math.floor(Math.random() * LOSE_QUOTES.length)];
      quoteEl.style.opacity = '1';
    }, 500);
  }, 4000);
}

export function triggerConfettiBlast() {
  const container = document.getElementById('result-particles');
  if (!container) return;
  container.innerHTML = '';
  
  const particles = [
    '/images/win/particle1.png',
    '/images/win/particle2.png',
    '/images/win/particle3.png',
    '/images/win/particle4.png'
  ];

  for (let i = 0; i < 24; i++) {
    const p = document.createElement('img');
    p.src = particles[Math.floor(Math.random() * particles.length)];
    p.className = 'win-particle';
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 200;
    
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const rot = Math.random() * 360;
    
    p.style.setProperty('--tx', `${tx}px`);
    p.style.setProperty('--ty', `${ty}px`);
    p.style.setProperty('--rot', `${rot}deg`);
    
    container.appendChild(p);
  }
}
