// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAE5oryZFJp6FJ3VG0gvtGQ5GNv3eUx4sM",
  authDomain: "crackthecode-game.firebaseapp.com",
  databaseURL: "https://crackthecode-game-default-rtdb.firebaseio.com",
  projectId: "crackthecode-game",
  storageBucket: "crackthecode-game.firebasestorage.app",
  messagingSenderId: "315686330556",
  appId: "1:315686330556:web:19fcb4a657493acd9670b9",
  measurementId: "G-Q3C72L19N2"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let gameState = {
    mode: null, 
    step: 'landing', 
    roomID: null,
    playerRole: null, 
    secret: null,    
    oppSecret: null, 
    turn: 'p1',       
    spSecret: null,   
    spAttempts: 0
};

let currentInput = "";
let roomListener = null; 

// --- DOM ELEMENTS ---
const keypad = document.getElementById('custom-keypad');
const screens = {
    landing: document.getElementById('landing-screen'),
    join: document.getElementById('join-room-screen'),
    lobby: document.getElementById('lobby-screen'),
    single: document.getElementById('single-screen'),
    onlineSetup: document.getElementById('online-setup-screen'),
    onlineGame: document.getElementById('online-game-screen')
};

// --- NAVIGATION ---
function showScreen(name) {
    if (name !== 'landing') {
        history.pushState({step: name}, null, "");
    }
    _internalShowScreen(name);
}

// Internal helper handles UI + Quitting Logic
function _internalShowScreen(name) {
    // CRITICAL: If we are going BACK to landing from an online game, we must QUIT.
    if (name === 'landing' && gameState.mode === 'online') {
        quitOnlineGame();
    }

    for (let s in screens) screens[s].classList.add('hidden');
    screens[name].classList.remove('hidden');
    
    gameState.step = name;

    // Toggle Keypad Visibility
    if (['landing', 'lobby'].includes(name)) {
        keypad.classList.add('hidden');
    } else {
        keypad.classList.remove('hidden');
        currentInput = ""; 
        updateDisplay();
    }
}

// --- KEYPAD & INPUT ---
function pressKey(num) {
    if (currentInput.length < 4) {
        currentInput += num;
        updateDisplay();
    }
}
function pressBackspace() {
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
}
function updateDisplay() {
    let el;
    if (gameState.step === 'single') el = document.getElementById('sp-display');
    else if (gameState.step === 'join') el = document.getElementById('room-code-display');
    else if (gameState.step === 'onlineSetup') el = document.getElementById('online-secret-display');
    else if (gameState.step === 'onlineGame') el = document.getElementById('online-display');

    if (el) {
        if (gameState.step === 'onlineSetup') el.textContent = '*'.repeat(currentInput.length);
        else el.textContent = currentInput;
    }
}
function submitCurrentInput() {
    if (currentInput.length === 0) return;
    if (gameState.step === 'single') handleSpGuess();
    else if (gameState.step === 'join') joinRoom(); 
    else if (gameState.step === 'onlineSetup') submitOnlineSecret();
    else if (gameState.step === 'onlineGame') handleOnlineGuess();
}

// ===============================
// --- ONLINE MULTIPLAYER LOGIC ---
// ===============================

function createRoom() {
    let roomCode = "";
    for(let i=0; i<4; i++) {
        roomCode += Math.floor(Math.random() * 9) + 1; 
    }

    gameState.roomID = roomCode;
    gameState.playerRole = 'p1';
    gameState.mode = 'online';

    db.ref('rooms/' + roomCode).set({
        status: 'waiting',
        turn: 'p1',
        created: Date.now()
    });

    // Handle Tab Close / Internet Loss
    db.ref('rooms/' + roomCode).onDisconnect().update({ status: 'abandoned' });

    document.getElementById('lobby-code').textContent = roomCode;
    showScreen('lobby');
    listenToRoom(roomCode);
}

function showJoinScreen() {
    gameState.step = 'join';
    showScreen('join');
}

function joinRoom() {
    const code = currentInput;
    if (code.length !== 4) return;

    db.ref('rooms/' + code).once('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val().status === 'waiting') {
            gameState.roomID = code;
            gameState.playerRole = 'p2';
            gameState.mode = 'online';
            
            db.ref('rooms/' + code).update({ status: 'setup' });
            
            // Handle Tab Close / Internet Loss
            db.ref('rooms/' + code).onDisconnect().update({ status: 'abandoned' });
            
            listenToRoom(code);
        } else {
            alert("Room not found or game already started!");
            currentInput = ""; updateDisplay();
        }
    });
}

function listenToRoom(roomCode) {
    roomListener = db.ref('rooms/' + roomCode).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // --- 1. HANDLE OPPONENT QUITTING ---
        if (data.status === 'abandoned') {
            // Only alert if *I* am still in the game (not if I was the one who quit)
            if (gameState.mode === 'online') {
                alert("Opponent left the game. Returning to menu...");
                window.location.reload(); 
            }
            return;
        }

        // --- 2. WINNER LOGIC ---
        if (data.status === 'finished') {
             keypad.classList.add('hidden'); 
             
             if (data.moves) updateOnlineUI(data);

             setTimeout(() => {
                 if (data.winner === gameState.playerRole) {
                     endGame("🏆 VICTORY!", data.p1Secret, data.p2Secret, "win");
                 } else {
                     endGame("💔 DEFEAT!", data.p1Secret, data.p2Secret, "loss");
                 }
             }, 500);
             return; 
        }

        // Standard State Changes
        if (data.status === 'setup') showScreen('onlineSetup');
        if (data.status === 'playing') {
            gameState.oppSecret = (gameState.playerRole === 'p1') ? data.p2Secret : data.p1Secret;
            if (gameState.step !== 'onlineGame') showScreen('onlineGame');
            updateOnlineUI(data);
        }
    });
}

// --- NEW: QUIT FUNCTION ---
function quitOnlineGame() {
    if (gameState.roomID) {
        // Tell DB I am leaving
        db.ref('rooms/' + gameState.roomID).update({ status: 'abandoned' });
        // Stop listening
        db.ref('rooms/' + gameState.roomID).off();
    }
    // Reset Local State
    gameState.mode = null;
    gameState.roomID = null;
    roomListener = null;
}

function submitOnlineSecret() {
    const val = currentInput;
    if (!isValid(val, 'online-secret-display')) return; 

    gameState.secret = val;
    
    const update = {};
    update[gameState.playerRole + 'Secret'] = val;
    db.ref('rooms/' + gameState.roomID).update(update);

    document.getElementById('setup-title').textContent = "Waiting for Opponent...";
    currentInput = ""; updateDisplay();
    keypad.classList.add('hidden');

    db.ref('rooms/' + gameState.roomID).once('value', (snap) => {
        const d = snap.val();
        if (d.p1Secret && d.p2Secret) {
            db.ref('rooms/' + gameState.roomID).update({ status: 'playing' });
        }
    });
}

function handleOnlineGuess() {
    const guess = currentInput;
    if (gameState.turn !== gameState.playerRole) {
        showError(document.getElementById('online-error'), "Not your turn!");
        return;
    }
    if (!isValid(guess, 'online-error')) return;

    const res = calculateResults(guess, gameState.oppSecret);

    const move = {
        player: gameState.playerRole,
        guess: guess,
        pos: res.pos,
        num: res.num
    };

    db.ref('rooms/' + gameState.roomID + '/moves').push(move);

    if (res.pos === 4) {
        db.ref('rooms/' + gameState.roomID).update({ 
            status: 'finished', 
            winner: gameState.playerRole 
        });
    } else {
        const nextTurn = gameState.playerRole === 'p1' ? 'p2' : 'p1';
        db.ref('rooms/' + gameState.roomID).update({ turn: nextTurn });
    }

    currentInput = ""; updateDisplay();
}

function updateOnlineUI(data) {
    gameState.turn = data.turn;
    const turnText = document.getElementById('online-turn-text');
    turnText.textContent = (gameState.turn === gameState.playerRole) ? "Your Turn" : "Opponent's Turn";
    turnText.style.color = (gameState.turn === gameState.playerRole) ? "var(--accent)" : "var(--text-sec)";

    const myHist = document.getElementById('my-history');
    const oppHist = document.getElementById('opp-history');
    myHist.innerHTML = ""; oppHist.innerHTML = "";

    if (data.moves) {
        Object.values(data.moves).forEach(move => {
            const container = (move.player === gameState.playerRole) ? myHist : oppHist;
            addHistoryItemDOM(container, move.guess, {pos: move.pos, num: move.num});
        });
    }
}

function shareCode() {
    const text = `Let's play Crack The Code! Join my room: ${gameState.roomID}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// --- UTILITIES ---
function generateSecret() { 
    let digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 4).join('');
}

function calculateResults(guess, secret) { 
    let pos = 0; let num = 0;
    for (let i = 0; i < 4; i++) { if (guess[i] === secret[i]) pos++; }
    for (let i = 0; i < 4; i++) { if (secret.includes(guess[i])) num++; }
    return { pos, num };
}

function isValid(val, errorElId) { 
     const errorEl = document.getElementById(errorElId);
     if(val.length !== 4) { showError(errorEl, "4 Digits!"); return false; }
     if(new Set(val).size !== 4) { showError(errorEl, "Unique only!"); return false; }
     showError(errorEl, ""); return true;
}

function showError(el, msg) { el.textContent = msg; }

function addHistoryItemDOM(container, guess, res) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<span class="guess-val">${guess}</span><div class="badges"><span class="badge b-pos">P:${res.pos}</span><span class="badge b-num">N:${res.num}</span></div>`;
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
}

// --- SINGLE PLAYER ---
function startSinglePlayer() {
    gameState.mode = 'single';
    gameState.spSecret = generateSecret();
    gameState.spAttempts = 0;
    document.getElementById('sp-history').innerHTML = '';
    showScreen('single');
}

function handleSpGuess() {
    const guess = currentInput;
    if (!isValid(guess, 'sp-error')) return;
    gameState.spAttempts++;
    const res = calculateResults(guess, gameState.spSecret);
    addHistoryItemDOM(document.getElementById('sp-history'), guess, res);
    currentInput = ""; updateDisplay();
    if (res.pos === 4) endGame(`🎉 Won in ${gameState.spAttempts} tries!`, gameState.spSecret, "-", "win");
}

// FIX: Added 'type' parameter so the modal knows which color to show
function endGame(msg, p1s, p2s, type) {
    const titleEl = document.getElementById('winner-text');
    titleEl.textContent = msg;
    
    // Reset colors then add the correct one (Green for Win, Red for Loss)
    titleEl.className = ""; 
    if (type === 'win') titleEl.classList.add('win-msg');
    else if (type === 'loss') titleEl.classList.add('loss-msg');

    document.getElementById('reveal-p1').textContent = p1s || "???";
    document.getElementById('reveal-p2').textContent = p2s || "???";
    
    document.getElementById('result-modal').classList.remove('hidden');
    keypad.classList.add('hidden');
    
    if (roomListener) {
        db.ref('rooms/' + gameState.roomID).off();
        roomListener = null;
    }
}

// --- BACK BUTTON HANDLING ---
history.replaceState({step: 'landing'}, null, "");

window.addEventListener('popstate', (event) => {
    // If user tries to go back WHILE in an online game...
    if (gameState.mode === 'online' && gameState.step === 'onlineGame') {
        // A. Stop them! Push the "onlineGame" state back onto the history stack.
        // This keeps the browser on the same page visually.
        history.pushState({step: 'onlineGame'}, null, "");

        // B. Show the "Are you sure?" modal
        document.getElementById('exit-modal').classList.remove('hidden');
        return; 
    }

    // Normal navigation for other screens
    if (event.state && event.state.step) {
        _internalShowScreen(event.state.step);
    } else {
        _internalShowScreen('landing');
    }
});

window.addEventListener('popstate', (event) => {
    // If user tries to go back WHILE in an online game...
    if (gameState.mode === 'online' && gameState.step === 'onlineGame') {
        // A. Stop them! Push the "onlineGame" state back onto the history stack.
        // This keeps the browser on the same page visually.
        history.pushState({step: 'onlineGame'}, null, "");

        // B. Show the "Are you sure?" modal
        document.getElementById('exit-modal').classList.remove('hidden');
        return; 
    }

    // Normal navigation for other screens
    if (event.state && event.state.step) {
        _internalShowScreen(event.state.step);
    } else {
        _internalShowScreen('landing');
    }
});

// 3. Handle the Exit Modal Choices
function confirmExit(shouldExit) {
    document.getElementById('exit-modal').classList.add('hidden');

    if (shouldExit) {
        // User clicked YES -> Quit Game
        quitOnlineGame(); 
        showScreen('landing'); // Manually go to landing
    } 
    // If NO: Do nothing. (We already kept them on the page in step 2A)
}