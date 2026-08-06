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
    // ==========================================
// AUDIO ENGINE MIT COMPLETER EFFEKT-KETTE
// ==========================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.oscillator = null;
    this.gainNode = null;
    
    // Nodes
    this.filterNode = null;
    this.driveNode = null;
    this.delayNode = null;
    this.delayFeedbackNode = null;
    this.reverbNode = null;
    this.tremoloOsc = null;
    this.tremoloGain = null;

    // Parameter State
    this.currentBaseFreq = null;
    this.soundType = 'sine';
    
    this.pitchBendSemitones = 0;
    this.vibratoFreq = 5;
    this.vibratoDepth = 0;
    this.filterCutoff = 8000;
    this.driveAmount = 0;
    this.breathAmount = 0;
    this.tremoloSpeed = 0;
    this.delayMix = 0;
    this.reverbMix = 0;
    this.glideTime = 0; // ms

    // Vibrato Steuerung
    this.isVibratoActive = false; // Steuert, ob das Vibrato gerade eingeschaltet ist
    this.vibratoOsc = null;
    this.vibratoGain = null;

  }
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.buildStaticReverbBuffer();
    }
  }

  setSoundType(type) {
    this.soundType = type;
  }

  // Erzeugt einen künstlichen Hall-Impuls für den Reverb
  buildStaticReverbBuffer() {
    const rate = this.ctx.sampleRate;
    const length = rate * 2.0; // 2 Sekunden Hall
    const decay = 2.0;
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const channelData = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    this.reverbBuffer = impulse;
  }

  // Formel für Pitch Bend & Grundfrequenz
  calcTargetFrequency(baseFreq) {
    return baseFreq * Math.pow(2, this.pitchBendSemitones / 12);
  }

  // --- NEUE HELFER-METHODEN FÜR DAS VIBRATO ---
    startVibrato() {
      if (this.vibratoOsc || !this.oscillator || this.vibratoDepth <= 0) return;
      const now = this.ctx.currentTime;
      
      this.vibratoOsc = this.ctx.createOscillator();
      this.vibratoGain = this.ctx.createGain();
      
      this.vibratoOsc.frequency.setValueAtTime(this.vibratoFreq, now);
      this.vibratoGain.gain.setValueAtTime(this.vibratoDepth, now);
      
      this.vibratoOsc.connect(this.vibratoGain);
      this.vibratoGain.connect(this.oscillator.frequency);
      
      this.vibratoOsc.start(now);
    }

    stopVibrato() {
      if (this.vibratoOsc) {
        this.vibratoOsc.stop();
        this.vibratoOsc.disconnect();
        this.vibratoOsc = null;
        this.vibratoGain = null;
      }
    }

    setVibratoState(active) {
      this.isVibratoActive = active;
      if (active) {
        this.startVibrato();
      } else {
        this.stopVibrato();
      }
    }


  playFrequency(freq) {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const targetFreq = this.calcTargetFrequency(freq);

    // Portamento / Glide wenn bereits ein Ton klingt
    if (this.oscillator && this.currentBaseFreq) {
      const now = this.ctx.currentTime;
      const glideDuration = this.glideTime / 1000;
      this.oscillator.frequency.cancelScheduledValues(now);
      this.oscillator.frequency.setValueAtTime(this.oscillator.frequency.value, now);
      this.oscillator.frequency.exponentialRampToValueAtTime(targetFreq, now + Math.max(0.01, glideDuration));
      this.currentBaseFreq = freq;
      return;
    }

    this.stopSound();
    const now = this.ctx.currentTime;

    // 1. Haupt-Oszillator
    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = this.soundType === 'trumpet' ? 'sawtooth' : 'sine';
    this.oscillator.frequency.setValueAtTime(targetFreq, now);

    // 2. Vibrato (LFO) - Wird nur gestartet, wenn isVibratoActive true ist
    if (this.vibratoDepth > 0 && this.isVibratoActive) {
      this.startVibrato();
    }

    
    // 3. Envelope / Gain
    this.gainNode = this.ctx.createGain();
    const targetGain = this.soundType === 'trumpet' ? 0.2 : 0.3;
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.04);

    // 4. Overdrive / Distortion
    this.driveNode = this.ctx.createWaveShaper();
    this.updateDriveCurve();

    // 5. Filter (Wah-Wah / Lowpass)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(this.filterCutoff, now);

    // 6. Tremolo (Lautstärken-Modulation)
    this.tremoloGainNode = this.ctx.createGain();
    if (this.tremoloSpeed > 0) {
      this.tremoloOsc = this.ctx.createOscillator();
      const tremoloLfoGain = this.ctx.createGain();
      this.tremoloOsc.frequency.setValueAtTime(this.tremoloSpeed, now);
      tremoloLfoGain.gain.setValueAtTime(0.15, now);
      this.tremoloOsc.connect(tremoloLfoGain);
      tremoloLfoGain.connect(this.tremoloGainNode.gain);
      this.tremoloOsc.start(now);
    }

    // 7. Delay (Echo)
    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.setValueAtTime(0.3, now);
    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.setValueAtTime(this.delayMix * 0.6, now);
    this.delayMixGain = this.ctx.createGain();
    this.delayMixGain.gain.setValueAtTime(this.delayMix, now);

    // Delay Feedback Loop
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);

    // 8. Reverb (Hall)
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.reverbBuffer;
    this.reverbMixGain = this.ctx.createGain();
    this.reverbMixGain.gain.setValueAtTime(this.reverbMix, now);

    // --- SIGNAL-VERBINDUNGEN SCHALTEN ---
    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.driveNode);
    this.driveNode.connect(this.filterNode);
    this.filterNode.connect(this.tremoloGainNode);

    // Direct / Dry Out
    this.tremoloGainNode.connect(this.ctx.destination);

    // Delay Wet
    if (this.delayMix > 0) {
      this.tremoloGainNode.connect(this.delayNode);
      this.delayNode.connect(this.delayMixGain);
      this.delayMixGain.connect(this.ctx.destination);
    }

    // Reverb Wet
    if (this.reverbMix > 0) {
      this.tremoloGainNode.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbMixGain);
      this.reverbMixGain.connect(this.ctx.destination);
    }

    // 9. Breath (Anblas-Rauschen)
    if (this.breathAmount > 0) {
      this.playBreathNoise(now);
    }

    this.oscillator.start(now);
    this.currentBaseFreq = freq;
  }

  playBreathNoise(now) {
    const bufferSize = this.ctx.sampleRate * 0.1; // 100ms Geräusch
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1200;

    const noiseGain = this.ctx.createGain();
    const gainVal = (this.breathAmount / 100) * 0.15;
    noiseGain.gain.setValueAtTime(gainVal, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);
  }

  updateDriveCurve() {
    if (!this.driveNode) return;
    const k = this.driveAmount;
    if (k === 0) {
      this.driveNode.curve = null;
      return;
    }
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      let x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.driveNode.curve = curve;
  }

  stopSound() {
    if (this.oscillator) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.05);
      
      this.oscillator.stop(now + 0.05);

      if (this.vibratoOsc) this.vibratoOsc.stop(now + 0.05);
      if (this.tremoloOsc) this.tremoloOsc.stop(now + 0.05);

      this.oscillator = null;
      this.currentBaseFreq = null;
      this.stopVibrato();
    }
  }

  // --- SETTER FÜR DREHKNÖPFE (Echtzeit-Updates) ---
  setPitchBend(semitones) {
    this.pitchBendSemitones = semitones;
    if (this.oscillator && this.currentBaseFreq && this.ctx) {
      const target = this.calcTargetFrequency(this.currentBaseFreq);
      this.oscillator.frequency.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  setFilter(freq) {
    this.filterCutoff = freq;
    if (this.filterNode && this.ctx) {
      this.filterNode.frequency.setValueAtTime(freq, this.ctx.currentTime);
    }
  }

  setDrive(val) {
    this.driveAmount = val;
    this.updateDriveCurve();
  }
}

// ==========================================
// REGISTRIERUNG ALLER DREHKNÖPFE
// ==========================================
setupKnob("knob-pitch", "val-pitch", " ST", (val) => audioEngine.setPitchBend(val));
setupKnob("knob-vib-freq", "val-vib-freq", " Hz", (val) => audioEngine.vibratoFreq = val);
setupKnob("knob-vib-depth", "val-vib-depth", "", (val) => audioEngine.vibratoDepth = val);

setupKnob("knob-filter", "val-filter", " Hz", (val) => audioEngine.setFilter(val));
setupKnob("knob-drive", "val-drive", "%", (val) => audioEngine.setDrive(val));
setupKnob("knob-breath", "val-breath", "%", (val) => audioEngine.breathAmount = val);

setupKnob("knob-tremolo", "val-tremolo", " Hz", (val) => audioEngine.tremoloSpeed = val);
setupKnob("knob-delay", "val-delay", "%", (val) => audioEngine.delayMix = val / 100);
setupKnob("knob-reverb", "val-reverb", "%", (val) => audioEngine.reverbMix = val / 100);
setupKnob("knob-glide", "val-glide", " ms", (val) => audioEngine.glideTime = val);

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
      slider: document.getElementById("tone-slider"),
      sliderValue: document.getElementById("slider-value"),
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

      // Plus-Taste für Vibrato abfangen
      if (e.key === "+" || e.code === "NumpadAdd") {
        audioEngine.setVibratoState(true);
      }

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

      // Plus-Taste loslassen -> Vibrato deaktivieren
      if (e.key === "+" || e.code === "NumpadAdd") {
        audioEngine.setVibratoState(false);
      }

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
      //const isToneSelected = state.square !== null && SQUARE_BASE_FREQUENCIES[state.square];
      //const isAirAvailable = !audioEngine.isMicActive || window.isBlowing;

      if (state.square !== null && SQUARE_BASE_FREQUENCIES[state.square]) {
      //if (isToneSelected && isAirAvailable) {
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

    // ==========================================
// 7. DREHKNOPF (KNOB) STEUERUNG
// ==========================================

function setupKnob(knobId, valId, unit, onChange) {
  const knob = document.getElementById(knobId);
  const valDisplay = document.getElementById(valId);
  
  const min = parseFloat(knob.dataset.min);
  const max = parseFloat(knob.dataset.max);
  let value = parseFloat(knob.dataset.value);

  // Aktualisiert die grafische Drehung (von -135deg bis +135deg)
  function updateKnobUI() {
    const pct = (value - min) / (max - min);
    const angle = -135 + pct * 270; // 270 Grad Gesamt-Drehwinkel
    knob.style.transform = `rotate(${angle}deg)`;
    valDisplay.textContent = `${value.toFixed(1)}${unit}`;
  }

  let startY = 0;
  let startVal = 0;

  knob.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startVal = value;

    const onPointerMove = (moveEv) => {
      // Nach oben ziehen = Wert erhöhen, nach unten = verringern
      const deltaY = startY - moveEv.clientY;
      const sensitivity = (max - min) / 200; // 200px entspricht voller Spanne
      
      let newVal = startVal + deltaY * sensitivity;
      newVal = Math.max(min, Math.min(max, newVal));
      
      value = newVal;
      knob.dataset.value = value;
      updateKnobUI();
      onChange(value);
    };

    const onPointerUp = (upEv) => {
      knob.releasePointerCapture(upEv.pointerId);
      knob.removeEventListener("pointermove", onPointerMove);
      knob.removeEventListener("pointerup", onPointerUp);
    };

    knob.addEventListener("pointermove", onPointerMove);
    knob.addEventListener("pointerup", onPointerUp);
  });

  // Initiale Darstellung setzen
  updateKnobUI();
}

// Drehknöpfe initialisieren
setupKnob("knob-freq", "val-freq", " Hz", (val) => {
  audioEngine.setVibratoFreq(val);
});

setupKnob("knob-gain", "val-gain", "", (val) => {
  audioEngine.setVibratoDepth(val);
});

