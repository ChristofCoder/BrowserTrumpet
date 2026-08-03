  // ==========================================
    // 1. GRUNDFREQUENZEN DER TASTEN 1-9 
    // ==========================================
    // Hier kannst du für die Tasten 1 bis 9 beliebige Grundfrequenzen  eintragen:
    const SQUARE_BASE_FREQUENCIES = {
      1: 261.63, // c' (C4)
      2: 392.00, // g' (G4)
      3: 523.25, // c'' (C5)
      4: 659.25, // e''
      5: 783.99, // g'' 
      6: 1046.50, // c''' 
      7: 1318.51, // e''' 
      8: 1567.98, // g''' 
      9: 2093.00  // c'''' 
    };

    // Modifikatoren der Pfeiltasten in Halbtönen
    const SEMITONE_MODIFIERS = {
      left: -2,  // Pfeil links: 1 Ganzton tiefer (-2 Halbtöne)
      down: -1,  // Pfeil runter: 1 Halbton tiefer (-1 Halbton)
      right: -3  // Pfeil rechts: 1,5 Töne tiefer (-3 Halbtöne)
    };

    // ==========================================
    // 2. AUDIO ENGINE (Web Audio API)
    // ==========================================
    class AudioEngine {
      constructor() {
        this.ctx = null;
        this.oscillator = null;
        this.gainNode = null;
        this.currentFreq = null;
        this.soundType = 'sine'; // 'sine' oder 'trumpet'
      }

      init() {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
      }

      setSoundType(type) {
        this.soundType = type;
      }

      playFrequency(freq) {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        if (this.currentFreq === freq) return;
        this.stopSound();

        const now = this.ctx.currentTime;
        this.oscillator = this.ctx.createOscillator();
        this.gainNode = this.ctx.createGain();

        if (this.soundType === 'trumpet') {
          // --- TROMPE-SOUND (Sägezahn + Anblas-Hüllkurve) ---
          this.oscillator.type = 'sawtooth';
          this.oscillator.frequency.setValueAtTime(freq, now);

          // Attack: Kurzes Anschwellen der Lautstärke
          this.gainNode.gain.setValueAtTime(0, now);
          this.gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
        } else {
          // --- SINUS-SOUND (Klassisch & Sanft) ---
          this.oscillator.type = 'sine';
          this.oscillator.frequency.setValueAtTime(freq, now);

          this.gainNode.gain.setValueAtTime(0.3, now);
        }

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);

        this.oscillator.start(now);
        this.currentFreq = freq;
      }

      stopSound() {
        if (this.oscillator && this.gainNode) {
          const now = this.ctx.currentTime;

          if (this.soundType === 'trumpet') {
            // Sanftes Ausklingen bei der Trompete
            this.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.08);
            this.oscillator.stop(now + 0.08);
          } else {
            // Sofortiges Stoppen bei Sinus
            this.gainNode.gain.setValueAtTime(0, now);
            this.oscillator.stop(now);
          }

          this.oscillator = null;
          this.gainNode = null;
          this.currentFreq = null;
        }
      }
    }

    // ==========================================
    // 3. ZUSTAND & DOM ELEMENTS
    // ==========================================
    const audioEngine = new AudioEngine();

    const state = {
      round: new Set(),
      square: null,
      isBb: false
    };

    const KEY_MAP_ROUND = {
      "ArrowLeft": "left",
      "ArrowDown": "down",
      "ArrowRight": "right"
    };

    const UI_ELEMENTS = {
      round: {
        left: document.getElementById("round-left"),
        down: document.getElementById("round-down"),
        right: document.getElementById("round-right")
      },
      square: {},
      toggleBb: document.getElementById("key-toggle"),
      labelC: document.getElementById("label-c"),
      labelBb: document.getElementById("label-bb"),
      toggleSound: document.getElementById("sound-toggle"),
      labelSine: document.getElementById("label-sine"),
      labelTrumpet: document.getElementById("label-trumpet")
    };

    for (let i = 1; i <= 9; i++) {
      UI_ELEMENTS.square[i] = document.getElementById(`square-${i}`);
    }

    // Toggle-Switch Stimmung (C / Bb)
    UI_ELEMENTS.toggleBb.addEventListener("change", (e) => {
      state.isBb = e.target.checked;
      UI_ELEMENTS.labelC.classList.toggle("active", !state.isBb);
      UI_ELEMENTS.labelBb.classList.toggle("active", state.isBb);
      updateApp();
    });

    // Toggle-Switch Sound (Sinus / Trompete)
    UI_ELEMENTS.toggleSound.addEventListener("change", (e) => {
      const isTrumpet = e.target.checked;
      audioEngine.setSoundType(isTrumpet ? 'trumpet' : 'sine');
      UI_ELEMENTS.labelSine.classList.toggle("active", !isTrumpet);
      UI_ELEMENTS.labelTrumpet.classList.toggle("active", isTrumpet);
      
      // Falls während des Umschaltens ein Ton gehalten wird, Sound neu auslösen
      if (audioEngine.currentFreq) {
        const freq = audioEngine.currentFreq;
        audioEngine.stopSound();
        audioEngine.playFrequency(freq);
      }
    });

    // Keydown Listener
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      let stateChanged = false;

      if (KEY_MAP_ROUND[e.code]) {
        const key = KEY_MAP_ROUND[e.code];
        if (!state.round.has(key)) {
          state.round.add(key);
          stateChanged = true;
        }
      }

      if (e.key >= "1" && e.key <= "9") {
        const num = parseInt(e.key, 10);
        if (state.square !== num) {
          state.square = num;
          stateChanged = true;
        }
      }

      if (stateChanged) updateApp();
    });

    // Keyup Listener
    window.addEventListener("keyup", (e) => {
      let stateChanged = false;

      if (KEY_MAP_ROUND[e.code]) {
        const key = KEY_MAP_ROUND[e.code];
        if (state.round.has(key)) {
          state.round.delete(key);
          stateChanged = true;
        }
      }

      if (e.key >= "1" && e.key <= "9") {
        const num = parseInt(e.key, 10);
        if (state.square === num) {
          state.square = null;
          stateChanged = true;
        }
      }

      if (stateChanged) updateApp();
    });

    // ==========================================
    // 4. EVALUATOR & TRANSPOSITION LOGIK
    // ==========================================
    let soundTimer = null; // Speichert den Timer für die Verzögerung
    const INPUT_DELAY_MS = 45; // Pause in Millisekunden (30-50ms ist ideal)

    function updateApp() {
      // 1. UI Aktualisieren (das Feedback auf den Knöpfen bleibt sofort!)
      Object.keys(UI_ELEMENTS.round).forEach(key => {
        UI_ELEMENTS.round[key].classList.toggle("active", state.round.has(key));
      });

      Object.keys(UI_ELEMENTS.square).forEach(num => {
        UI_ELEMENTS.square[num].classList.toggle("active", state.square === parseInt(num, 10));
      });

      // 2. Laufenden Timer abbrechen, falls sich der Zustand innerhalb der Pause erneut ändert
      if (soundTimer) {
        clearTimeout(soundTimer);
        soundTimer = null;
      }

// 2. Ton berechnen (Nur wenn ein quadratischer Knopf gedrückt ist)
      if (state.square !== null && SQUARE_BASE_FREQUENCIES[state.square]) {
        let baseFreq = SQUARE_BASE_FREQUENCIES[state.square];

        // Summe aller aktiven Halbton-Veränderungen berechnen
        let totalSemitoneShift = 0;
        state.round.forEach(key => {
          if (SEMITONE_MODIFIERS[key] !== undefined) {
            totalSemitoneShift += SEMITONE_MODIFIERS[key];
          }
        });

        // B♭ Transposition (-2 Halbtöne)
        if (state.isBb) {
          totalSemitoneShift -= 2;
        }

        // Mathematische Formel: f_neu = f_basis * 2^(Halbtöne / 12)
        const finalFreq = baseFreq * Math.pow(2, totalSemitoneShift / 12);

        // Ton mit minimaler Verzögerung starten
        soundTimer = setTimeout(() => {
          audioEngine.playFrequency(finalFreq);
        }, INPUT_DELAY_MS);

      } else {
        // Kein quadratischer Knopf aktiv -> Ton aus
        audioEngine.stopSound();
      }
    }


    /*
// ==========================================
// 5. ERWEITERTE TOUCH / POINTER EVENTS (MULTITOUCH)
// ==========================================

// Verhindert Kontextmenü (Rechtsklick/Langes Drücken auf Mobilgeräten)
document.addEventListener('contextmenu', e => e.preventDefault());

// Pointer-Events für runde Knöpfe (Ventile)
Object.entries(UI_ELEMENTS.round).forEach(([key, element]) => {
  element.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // Element an den Pointer binden, damit auch Bewegungen/Release exakt getrackt werden
    element.setPointerCapture(e.pointerId);
    state.round.add(key);
    updateApp();
  });

  const releaseRound = (e) => {
    e.preventDefault();
    if (state.round.has(key)) {
      state.round.delete(key);
      updateApp();
    }
  };

  element.addEventListener("pointerup", releaseRound);
  element.addEventListener("pointercancel", releaseRound);
});

// Pointer-Events für quadratische Knöpfe (Naturtöne)
Object.entries(UI_ELEMENTS.square).forEach(([numStr, element]) => {
  const num = parseInt(numStr, 10);

  element.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    element.setPointerCapture(e.pointerId);
    state.square = num;
    updateApp();
  });

  const releaseSquare = (e) => {
    e.preventDefault();
    if (state.square === num) {
      state.square = null;
      updateApp();
    }
  };

  element.addEventListener("pointerup", releaseSquare);
  element.addEventListener("pointercancel", releaseSquare);
});

*/