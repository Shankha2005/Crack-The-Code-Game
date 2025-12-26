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
// (We use the global 'firebase' object because we loaded it in index.html)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let gameState = {
    mode: null, // 'single', 'online'
    step: 'landing', 
    roomID: null,
    playerRole: null, // 'p1' (Creator) or 'p2' (Joiner)
    secret: null,     // My secret number
    oppSecret: null,  // Opponent's secret (loaded later)
    turn: 'p1',       // Who's turn is it?
    spSecret: null,   // Single player secret
    spAttempts: 0
};

let currentInput = "";
let roomListener = null; // To stop listening when game ends

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
    for (let s in screens) screens[s].classList.add('hidden');
    screens[name].classList.remove('hidden');
    
    // Keypad Logic
    if (['landing', 'lobby'].includes(name)) {
        keypad.classList.add('hidden');
    } else {
        keypad.classList.remove('hidden');
        currentInput = ""; 
        updateDisplay();
    }
    gameState.step = name;
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
        // Mask inputs for Setup, show plain for others
        if (gameState.step === 'onlineSetup') el.textContent = '*'.repeat(currentInput.length);
        else el.textContent = currentInput;
    }
}
function submitCurrentInput() {
    if (currentInput.length === 0) return;
    if (gameState.step === 'single') handleSpGuess();
    else if (gameState.step === 'join') joinRoom(); // Confirm join
    else if (gameState.step === 'onlineSetup') submitOnlineSecret();
    else if (gameState.step === 'onlineGame') handleOnlineGuess();
}

// ===============================
// --- ONLINE MULTIPLAYER LOGIC ---
// ===============================

// 1. Create Room (Player 1)
function createRoom() {
    // Generate 4 digit code using ONLY 1-9
    let roomCode = "";
    for(let i=0; i<4; i++) {
        roomCode += Math.floor(Math.random() * 9) + 1; // Generates 1-9
    }

    gameState.roomID = roomCode;
    gameState.playerRole = 'p1';
    gameState.mode = 'online';

    // Set Initial State
    db.ref('rooms/' + roomCode).set({
        status: 'waiting',
        turn: 'p1',
        created: Date.now()
    });

    // NEW: If I close the tab/app, tell the DB the game is abandoned
    db.ref('rooms/' + roomCode).onDisconnect().update({ status: 'abandoned' });

    document.getElementById('lobby-code').textContent = roomCode;
    showScreen('lobby');
    listenToRoom(roomCode);
}

// 2. Join Room UI
function showJoinScreen() {
    gameState.step = 'join';
    showScreen('join');
}

// 3. Confirm Join (Player 2)
function joinRoom() {
    const code = currentInput;
    if (code.length !== 4) return;

    db.ref('rooms/' + code).once('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val().status === 'waiting') {
            gameState.roomID = code;
            gameState.playerRole = 'p2';
            gameState.mode = 'online';
            
            // Update Status
            db.ref('rooms/' + code).update({ status: 'setup' });
            
            // NEW: If I disconnect, mark game as abandoned
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

        // --- NEW: HANDLE OPPONENT QUITTING ---
        if (data.status === 'abandoned') {
            alert("Opponent left the game. returning to menu...");
            window.location.reload(); // Restarts the app
            return;
        }

        // --- WINNER LOGIC ---
        if (data.status === 'finished') {
             keypad.classList.add('hidden'); // Hide keypad immediately
             
             // Force UI update to show the winning move BEFORE showing modal
             if (data.moves) updateOnlineUI(data);

             // Slight delay so you can see the move that won
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

// 5. Submit Secret Number
function submitOnlineSecret() {
    const val = currentInput;
    if (!isValid(val, 'online-secret-display')) return; // Re-use validation logic

    gameState.secret = val;
    
    // Save to DB
    const update = {};
    update[gameState.playerRole + 'Secret'] = val;
    db.ref('rooms/' + gameState.roomID).update(update);

    // Wait UI
    document.getElementById('setup-title').textContent = "Waiting for Opponent...";
    currentInput = ""; updateDisplay();
    keypad.classList.add('hidden');

    // Check if both are ready (handled by cloud trigger or client check)
    // Simple client check:
    db.ref('rooms/' + gameState.roomID).once('value', (snap) => {
        const d = snap.val();
        if (d.p1Secret && d.p2Secret) {
            db.ref('rooms/' + gameState.roomID).update({ status: 'playing' });
        }
    });
}

// 6. Handle Guessing
function handleOnlineGuess() {
    const guess = currentInput;
    if (gameState.turn !== gameState.playerRole) {
        showError(document.getElementById('online-error'), "Not your turn!");
        return;
    }
    if (!isValid(guess, 'online-error')) return;

    // Calculate Result
    const res = calculateResults(guess, gameState.oppSecret);

    // Push Move to DB
    const move = {
        player: gameState.playerRole,
        guess: guess,
        pos: res.pos,
        num: res.num
    };

    // Add move to history array in DB
    const newRef = db.ref('rooms/' + gameState.roomID + '/moves').push();
    newRef.set(move);

    // Check Win
    if (res.pos === 4) {
        db.ref('rooms/' + gameState.roomID).update({ 
            status: 'finished', 
            winner: gameState.playerRole 
        });
    } else {
        // Switch Turn
        const nextTurn = gameState.playerRole === 'p1' ? 'p2' : 'p1';
        db.ref('rooms/' + gameState.roomID).update({ turn: nextTurn });
    }

    currentInput = ""; updateDisplay();
}

// 7. Update UI from DB Data
function updateOnlineUI(data) {
    gameState.turn = data.turn;
    const turnText = document.getElementById('online-turn-text');
    turnText.textContent = (gameState.turn === gameState.playerRole) ? "Your Turn" : "Opponent's Turn";
    turnText.style.color = (gameState.turn === gameState.playerRole) ? "var(--accent)" : "var(--text-sec)";

    // Clear and Rebuild History
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

// 8. Share on WhatsApp
function shareCode() {
    const text = `Let's play Crack The Code! Join my room: ${gameState.roomID}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// --- UTILITIES (Reused) ---
function generateSecret() { /* Keep existing */ 
    // ... (Use your existing generateSecret logic) ...
    let digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 4).join('');
}

function calculateResults(guess, secret) { /* Keep existing */ 
    let pos = 0; let num = 0;
    for (let i = 0; i < 4; i++) { if (guess[i] === secret[i]) pos++; }
    for (let i = 0; i < 4; i++) { if (secret.includes(guess[i])) num++; }
    return { pos, num };
}

function isValid(val, errorElId) { /* Keep existing */ 
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

// --- SINGLE PLAYER LOGIC (Simplified wrapper) ---
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
    if (res.pos === 4) endGame(`🎉 Won in ${gameState.spAttempts} tries!`, gameState.spSecret, "-");
}

function endGame(msg, p1s, p2s) {
    // 1. Set the main message (e.g., "Won in 5 tries")
    const titleEl = document.getElementById('winner-text');
    titleEl.textContent = msg;
    
    // Reset colors then add the correct one (Green for Win, Red for Loss)
    titleEl.className = ""; 
    if (type === 'win') titleEl.classList.add('win-msg');
    else if (type === 'loss') titleEl.classList.add('loss-msg');

    // Reveal Secrets
    document.getElementById('reveal-p1').textContent = p1s || "???";
    document.getElementById('reveal-p2').textContent = p2s || "???";
    
    // Show Modal
    document.getElementById('result-modal').classList.remove('hidden');
    keypad.classList.add('hidden');
    
    // Stop listening to DB so it doesn't loop
    if (roomListener) {
        db.ref('rooms/' + gameState.roomID).off();
        roomListener = null;
    }
}

// ==========================================
// --- NEW: BACK BUTTON HANDLING ---
// ==========================================

// 1. When the page first loads, save the "landing" state
history.replaceState({step: 'landing'}, null, "");

// 2. Listen for the Back Button press
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.step) {
        // If we have a saved step, go to it WITHOUT pushing new history
        // (We manually toggle visibility to avoid loops)
        _internalShowScreen(event.state.step);
    } else {
        // Default fallback
        _internalShowScreen('landing');
    }
});

// 3. Update showScreen to Push History
// (REPLACE your existing showScreen function with this one)
function showScreen(name) {
    // Save this new screen to browser history so "Back" works
    if (name !== 'landing') {
        history.pushState({step: name}, null, "");
    }
    _internalShowScreen(name);
}

// Internal helper that just switches UI (doesn't mess with history)
function _internalShowScreen(name) {
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