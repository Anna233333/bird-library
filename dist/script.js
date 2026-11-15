(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    scene: $('#scene'), bookshelf: $('#bookshelf'), botany: $('#bookBotany'), heavy: $('#bookHeavy'), secret: $('#bookSecret'),
    blue: $('#birdBlue'), green: $('#birdGreen'), owl: $('#birdOwl'), librarian: $('#birdPigeonLibrarian'), messenger: $('#birdPigeonMessenger'), cubby: $('#secretCubby'), teaCup: $('#teaCup'),
    volume: $('#volumeSlider'), volumeOutput: $('#volumeOutput'), meterFill: $('#meterFill'), threshold: $('#thresholdSlider'), thresholdOutput: $('#thresholdOutput'), thresholdLine: $('#thresholdLine'), manualTest: $('#manualTest'), rain: $('#rainToggle'), breeze: $('#breezeToggle'),
    mic: $('#micButton'), micStatus: $('#micStatus'), rainAudio: $('#rainAudio'), window: $('#windowLatch'), statusCard: $('#statusCard'),
    statusTitle: $('#statusTitle'), statusText: $('#statusText'), menu: $('#menuButton'), settings: $('#settingsPanel'),
    journalButton: $('#journalButton'), deskJournal: $('#deskJournal'), journal: $('#journalPanel'), discoveryCount: $('#discoveryCount'), deskDiscoveryCount: $('#deskDiscoveryCount'), clue: $('#clueText'), journalClue: $('#journalClue'),
    toast: $('#toast'), pause: $('#pauseButton'), reset: $('#resetButton'), teaNote: $('#teaNote')
  };

  const state = {
    roomVolume: 18,
    noiseThreshold: 35,
    rainOn: false,
    breezeOn: false,
    windowOpen: true,
    paused: false,
    micOn: false,
    pulledBooks: new Set(),
    discovered: new Set(),
    owlUnlocked: false,
    messengerUnlocked: false,
    bookSequence: [],
    librarianScolding: false,
    teaParty: false,
    startled: false,
    calmSince: Date.now(),
    audioContext: null,
    stream: null,
    analyser: null,
    micFrame: null,
    ambience: null,
    drag: null,
  };

  let toastTimer;
  let calmTimer;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function setStatus(title, text, alert = false) {
    elements.statusTitle.textContent = title;
    elements.statusText.textContent = text;
    elements.statusCard.classList.toggle('alert', alert);
  }

  function updateVolume(value, source = 'manual') {
    state.roomVolume = Math.max(0, Math.min(100, Math.round(value)));
    if (source !== 'mic') elements.volume.value = state.roomVolume;
    elements.volumeOutput.textContent = `${state.roomVolume}%`;
    elements.meterFill.style.width = `${state.roomVolume}%`;

    if (state.roomVolume > Math.min(100, state.noiseThreshold + 30)) {
      startleBirds('Too loud—the readers have flown outside.');
    } else if (state.roomVolume < state.noiseThreshold) {
      if (!state.calmSince) state.calmSince = Date.now();
      scheduleCalmReturn();
    } else {
      state.calmSince = null;
    }

    if (!state.startled) evaluateScene();
    if (source === 'manual' && state.micOn) stopMicrophone();
  }

  function updateThreshold(value) {
    state.noiseThreshold = Math.max(10, Math.min(90, Math.round(value)));
    elements.threshold.value = state.noiseThreshold;
    elements.thresholdOutput.textContent = `${state.noiseThreshold}%`;
    elements.thresholdLine.style.left = `${state.noiseThreshold}%`;
    state.calmSince = state.roomVolume < state.noiseThreshold ? (state.calmSince || Date.now()) : null;
    if (state.startled) scheduleCalmReturn();
    else evaluateScene();
  }

  function scheduleCalmReturn() {
    clearTimeout(calmTimer);
    if (!state.startled || !state.calmSince) return;
    const remaining = Math.max(0, 4000 - (Date.now() - state.calmSince));
    calmTimer = setTimeout(() => {
      if (state.roomVolume < state.noiseThreshold) {
        state.startled = false;
        state.librarianScolding = false;
        elements.librarian.classList.remove('scolding');
        state.calmSince = Date.now();
        showToast('Four calm seconds. Tiny footsteps return.');
        evaluateScene();
      }
    }, remaining);
  }

  function discover(name) {
    if (state.discovered.has(name)) return;
    state.discovered.add(name);
    const entry = $(`.journal-entry[data-bird="${name}"]`);
    entry.classList.remove('locked');
    entry.classList.add('discovered');
    entry.querySelector('.silhouette').textContent = '✦';
    elements.discoveryCount.textContent = `${state.discovered.size}/5`;
    elements.deskDiscoveryCount.textContent = `${state.discovered.size}/5`;
    showToast(`New field note: ${entry.querySelector('h3').textContent}`);
  }

  function positionBird(element, location, hidden = false) {
    element.classList.toggle('outside', location === 'outside');
    element.classList.toggle('inside', location === 'inside');
    element.classList.toggle('hidden', hidden);
    element.classList.toggle('idle', location === 'outside' && !hidden);
  }

  function updatePerches() {
    const sceneBox = elements.scene.getBoundingClientRect();
    const shelfBox = elements.bookshelf.getBoundingClientRect();
    if (!sceneBox.width || !shelfBox.width) return;
    const shelfX = shelfBox.left - sceneBox.left;
    const shelfY = shelfBox.top - sceneBox.top;
    const slots = [
      [elements.owl, .12, .08],
      [elements.librarian, .43, .07],
      [elements.green, .75, .12],
      [elements.messenger, -.20, .30],
      [elements.blue, -.06, .65],
    ];
    slots.forEach(([bird, x, y]) => {
      bird.style.setProperty('--perch-x', `${shelfX + shelfBox.width * x}px`);
      bird.style.setProperty('--perch-y', `${shelfY + shelfBox.height * y}px`);
    });
  }

  let perchFrame;
  function schedulePerchUpdate() {
    cancelAnimationFrame(perchFrame);
    perchFrame = requestAnimationFrame(updatePerches);
  }

  function evaluateScene() {
    elements.scene.classList.toggle('raining', state.rainOn);
    elements.scene.classList.toggle('breezy', state.breezeOn);
    elements.scene.classList.toggle('window-closed', !state.windowOpen);

    maybeUnlockMessenger();
    if (state.teaParty) return;
    const librarianChatty = state.pulledBooks.has('heavy') && state.roomVolume >= state.noiseThreshold && state.roomVolume <= Math.min(100, state.noiseThreshold + 20);
    const messengerInside = state.messengerUnlocked && state.breezeOn && state.pulledBooks.has('botany') && state.pulledBooks.has('secret');
    if (state.startled || !state.windowOpen) {
      positionBird(elements.blue, 'outside', true);
      positionBird(elements.green, 'outside', true);
      positionBird(elements.owl, 'outside', true);
      positionBird(elements.messenger, 'outside', true);
      const scoldingInside = state.librarianScolding && state.windowOpen;
      positionBird(elements.librarian, scoldingInside ? 'inside' : 'outside', !scoldingInside);
      if (scoldingInside) discover('librarian');
      return;
    }

    const blueInside = state.roomVolume < state.noiseThreshold && state.pulledBooks.has('botany');
    const greenInside = state.roomVolume < Math.max(5, state.noiseThreshold - 5) && state.pulledBooks.has('heavy');
    const owlInside = state.owlUnlocked && state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn && state.pulledBooks.has('secret');

    positionBird(elements.blue, blueInside ? 'inside' : 'outside', !blueInside);
    positionBird(elements.green, greenInside ? 'inside' : 'outside', !greenInside);
    positionBird(elements.owl, owlInside ? 'inside' : 'outside', !owlInside);
    positionBird(elements.librarian, librarianChatty ? 'inside' : 'outside', !librarianChatty);
    positionBird(elements.messenger, messengerInside ? 'inside' : 'outside', !messengerInside);

    if (blueInside) discover('blue');
    if (greenInside) discover('green');
    if (owlInside) discover('owl');
    if (librarianChatty) discover('librarian');
    if (messengerInside) discover('messenger');

    if (state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn && state.pulledBooks.has('secret')) {
      unlockOwl();
    }

    const indoor = [blueInside, greenInside, owlInside, librarianChatty, messengerInside].filter(Boolean).length;
    if (indoor === 0) setStatus('The room is listening', 'Try a book. Quiet hands help.');
    else if (indoor === 1) setStatus('A little flock feels brave', 'Move gently. Another may be nearby.');
    else setStatus(`${indoor} visiting flocks`, 'The library is beginning to trust you.');

    updateClue();
  }

  function updateClue() {
    let clue;
    if (!state.discovered.has('blue')) clue = 'A green spine, pulled forward in a hush, could become a doorstep.';
    else if (!state.discovered.has('green')) clue = 'The heaviest red story listens for patient hands moving downward.';
    else if (!state.owlUnlocked) clue = 'A gold moon remembers rain. Its reader wakes only for the softest room.';
    else if (!state.discovered.has('librarian')) clue = 'Someone important enjoys chatter—but not a red-book thud.';
    else if (!state.discovered.has('messenger')) clue = 'A breeze carries pressed flowers from green stories toward gold ones.';
    else if (!state.teaParty) clue = 'Five signatures. Rain. Breeze. Three ledges. A small cup of millet.';
    else clue = 'The last page is ringed with tiny millet crumbs.';
    elements.clue.textContent = clue;
    elements.journalClue.textContent = clue;
  }

  function toggleBook(name, element) {
    if (state.pulledBooks.has(name)) state.pulledBooks.delete(name);
    else state.pulledBooks.add(name);
    const pulled = state.pulledBooks.has(name);
    element.classList.toggle('pulled', pulled);
    element.setAttribute('aria-pressed', String(pulled));
    if (name === 'heavy') element.setAttribute('aria-label', pulled ? 'Slowly drag up to return the heavy red encyclopedia' : 'Slowly drag down to pull out the heavy red encyclopedia');
    if (pulled && (name === 'botany' || name === 'secret')) recordBookSequence(name);
    if (name === 'secret' && pulled && !(state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn)) {
      const owlLimit = Math.max(5, state.noiseThreshold - 10);
      if (!state.rainOn) {
        setStatus('The gold nook stays closed', 'The tiny rain-mark is a clue: turn on Soft Rain.', true);
        showToast('The gold book needs Soft Rain before the owl will appear.');
      } else {
        setStatus('The gold nook stays closed', `Current noise is ${state.roomVolume}%. The owl needs below ${owlLimit}%.`, true);
        showToast(`Too loud for the owl: ${state.roomVolume}% is above its ${owlLimit}% limit.`);
      }
    }
    evaluateScene();
  }

  function unlockOwl() {
    if (state.owlUnlocked) return;
    state.owlUnlocked = true;
    elements.cubby.classList.add('revealed');
    positionBird(elements.owl, 'inside');
    discover('owl');
    setStatus('A secret nook opens', 'The Sleepy Bookworm was here all along.');
  }

  function recordBookSequence(name) {
    state.bookSequence.push(name);
    state.bookSequence = state.bookSequence.slice(-2);
    if (state.bookSequence.length === 2 && state.bookSequence.join('>') !== 'botany>secret') {
      showToast('The flower bookmark slips away. Try green first, then gold.');
      state.bookSequence = [name];
    }
  }

  function maybeUnlockMessenger() {
    if (state.messengerUnlocked) return;
    if (state.breezeOn && state.bookSequence.join('>') === 'botany>secret') {
      state.messengerUnlocked = true;
      showToast('A pressed flower spins through the window…');
    }
  }

  function startleBirds(message, summonLibrarian = false) {
    if (state.teaParty) state.teaParty = false;
    state.startled = true;
    state.calmSince = state.roomVolume < state.noiseThreshold ? Date.now() : null;
    elements.scene.classList.remove('tea-party');
    [elements.blue, elements.green, elements.owl, elements.messenger].forEach((bird) => {
      bird.classList.add('flutter');
      positionBird(bird, 'outside', true);
    });
    state.librarianScolding = summonLibrarian;
    elements.librarian.classList.toggle('scolding', summonLibrarian);
    positionBird(elements.librarian, summonLibrarian ? 'inside' : 'outside', !summonLibrarian);
    if (summonLibrarian) discover('librarian');
    setTimeout(() => $$('.bird').forEach((bird) => bird.classList.remove('flutter')), 900);
    setStatus('The shelves went still', `Stay below your ${state.noiseThreshold}% threshold for four seconds.`, true);
    showToast(message);
    scheduleCalmReturn();
  }

  function heavyBookSuccess() {
    if (state.pulledBooks.has('heavy')) {
      toggleBook('heavy', elements.heavy);
      return;
    }
    if (state.roomVolume > Math.min(100, state.noiseThreshold + 10)) {
      elements.bookshelf.classList.remove('thud');
      void elements.bookshelf.offsetWidth;
      elements.bookshelf.classList.add('thud');
      startleBirds(`THUD! The Head Librarian heard that from across the room.`, true);
      return;
    }
    toggleBook('heavy', elements.heavy);
  }

  function tryTeaParty() {
    if (!state.owlUnlocked) return showToast('The millet cup is waiting for one more visitor.');
    const allBooks = ['botany', 'heavy', 'secret'].every((book) => state.pulledBooks.has(book));
    if (state.roomVolume < Math.max(5, state.noiseThreshold - 15) && state.rainOn && state.breezeOn && allBooks && !state.startled) {
      state.teaParty = true;
      elements.scene.classList.add('tea-party');
      const teaGuests = [elements.blue, elements.green, elements.owl];
      if (state.discovered.has('librarian')) teaGuests.push(elements.librarian);
      if (state.messengerUnlocked) teaGuests.push(elements.messenger);
      teaGuests.forEach((bird) => positionBird(bird, 'inside'));
      elements.teaNote.classList.add('complete');
      elements.teaNote.innerHTML = '<span>🌾</span><p><strong>The millet tea party is complete.</strong><br>The whole flock found a place at the tiny feast.</p>';
      setStatus('A millet tea party', 'Even the rain sounds like applause.');
      showToast('Secret ending unlocked: the whole flock came for millet!');
    } else {
      showToast('The millet cup whispers: rain, breeze, three ledges, and the softest hush.');
    }
  }

  function openPanel(panel, trigger) {
    $$('.panel').forEach((item) => { item.classList.remove('open'); item.setAttribute('aria-hidden', 'true'); });
    [elements.menu, elements.journalButton, elements.deskJournal].forEach((item) => item.setAttribute('aria-expanded', 'false'));
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closePanels() {
    $$('.panel').forEach((item) => { item.classList.remove('open'); item.setAttribute('aria-hidden', 'true'); });
    [elements.menu, elements.journalButton, elements.deskJournal].forEach((item) => item.setAttribute('aria-expanded', 'false'));
  }

  async function toggleMicrophone() {
    if (state.micOn) return stopMicrophone();
    if (!navigator.mediaDevices?.getUserMedia) return showToast('Microphone input is not supported here. The slider still works.');
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioContext = state.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const source = state.audioContext.createMediaStreamSource(state.stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 1024;
      source.connect(state.analyser);
      state.micOn = true;
      elements.volume.disabled = true;
      elements.manualTest.classList.add('disabled');
      elements.mic.setAttribute('aria-pressed', 'true');
      elements.micStatus.textContent = 'Listening locally—audio is never saved';
      const samples = new Uint8Array(state.analyser.fftSize);
      const read = () => {
        if (!state.micOn) return;
        state.analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / samples.length);
        const mapped = Math.min(100, Math.max(0, rms * 260));
        updateVolume(state.roomVolume * .78 + mapped * .22, 'mic');
        state.micFrame = requestAnimationFrame(read);
      };
      read();
    } catch (error) {
      elements.micStatus.textContent = 'Permission was not granted';
      showToast('No microphone access. You can keep using the room-hush slider.');
    }
  }

  function stopMicrophone() {
    state.micOn = false;
    cancelAnimationFrame(state.micFrame);
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    elements.volume.disabled = false;
    elements.manualTest.classList.remove('disabled');
    elements.mic.setAttribute('aria-pressed', 'false');
    elements.micStatus.textContent = 'Manual slider is active';
  }

  function ensureAmbience() {
    if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (state.ambience) return state.ambience;
    const length = state.audioContext.sampleRate * 2;
    const buffer = state.audioContext.createBuffer(1, length, state.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) { last = last * .985 + (Math.random() * 2 - 1) * .15; data[i] = last; }
    const source = state.audioContext.createBufferSource();
    const filter = state.audioContext.createBiquadFilter();
    const gain = state.audioContext.createGain();
    source.buffer = buffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 950; gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(state.audioContext.destination); source.start();
    state.ambience = { gain };
    return state.ambience;
  }

  function updateAmbience() {
    elements.rainAudio.volume = .32;
    if (state.rainOn) elements.rainAudio.play().catch(() => showToast('Tap Soft Rain once more to start the sound.'));
    else { elements.rainAudio.pause(); elements.rainAudio.currentTime = 0; }
    if (!state.breezeOn && !state.ambience) return;
    try {
      const ambience = ensureAmbience();
      const level = state.breezeOn ? .025 : 0;
      ambience.gain.gain.setTargetAtTime(level, state.audioContext.currentTime, .5);
    } catch { /* Visual ambience still works if audio cannot start. */ }
  }

  function resetScene() {
    stopMicrophone();
    state.roomVolume = 18; state.noiseThreshold = 35; state.rainOn = false; state.breezeOn = false; state.windowOpen = true;
    state.paused = false; state.pulledBooks.clear(); state.discovered.clear(); state.owlUnlocked = false; state.messengerUnlocked = false; state.bookSequence = []; state.librarianScolding = false;
    state.teaParty = false; state.startled = false; state.calmSince = Date.now();
    $$('.book.interactive').forEach((book) => { book.classList.remove('pulled'); book.setAttribute('aria-pressed', 'false'); });
    $$('.journal-entry').forEach((entry) => { entry.classList.add('locked'); entry.classList.remove('discovered'); entry.querySelector('.silhouette').textContent = '?'; });
    elements.cubby.classList.remove('revealed'); elements.scene.classList.remove('tea-party', 'paused', 'raining', 'breezy', 'window-closed');
    elements.rain.checked = false; elements.breeze.checked = false; elements.discoveryCount.textContent = '0/5'; elements.deskDiscoveryCount.textContent = '0/5';
    elements.librarian.classList.remove('scolding');
    elements.teaNote.classList.remove('complete'); elements.teaNote.innerHTML = '<span>🌾</span><p><strong>A millet gathering is still unwritten.</strong><br>Perhaps every visitor could share the same little feast.</p>';
    elements.pause.setAttribute('aria-pressed', 'false'); elements.pause.innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause';
    updateThreshold(35); updateVolume(18); updateAmbience(); closePanels(); showToast('The library has been reset.');
  }

  elements.botany.addEventListener('click', () => toggleBook('botany', elements.botany));
  elements.secret.addEventListener('click', () => toggleBook('secret', elements.secret));
  elements.teaCup.addEventListener('click', tryTeaParty);
  elements.volume.addEventListener('input', (event) => updateVolume(event.target.value));
  elements.threshold.addEventListener('input', (event) => updateThreshold(event.target.value));
  elements.rain.addEventListener('change', (event) => { state.rainOn = event.target.checked; updateAmbience(); evaluateScene(); });
  elements.breeze.addEventListener('change', (event) => { state.breezeOn = event.target.checked; updateAmbience(); evaluateScene(); });
  elements.mic.addEventListener('click', toggleMicrophone);
  elements.window.addEventListener('click', () => {
    state.windowOpen = !state.windowOpen;
    elements.window.setAttribute('aria-pressed', String(state.windowOpen));
    elements.window.setAttribute('aria-label', state.windowOpen ? 'Close the open window' : 'Open the closed window');
    if (!state.windowOpen) showToast('The window clicks shut. The birds wait outside.');
    evaluateScene();
  });

  elements.heavy.addEventListener('pointerdown', (event) => {
    elements.heavy.setPointerCapture(event.pointerId);
    state.drag = { y: event.clientY, time: performance.now(), lastY: event.clientY, lastTime: performance.now(), distance: 0, upDistance: 0, maxSpeed: 0 };
  });
  elements.heavy.addEventListener('pointermove', (event) => {
    if (!state.drag) return;
    const now = performance.now();
    const dy = event.clientY - state.drag.lastY;
    const dt = Math.max(1, now - state.drag.lastTime);
    state.drag.distance = Math.max(state.drag.distance, event.clientY - state.drag.y);
    state.drag.upDistance = Math.max(state.drag.upDistance, state.drag.y - event.clientY);
    state.drag.maxSpeed = Math.max(state.drag.maxSpeed, Math.abs(dy / dt));
    state.drag.lastY = event.clientY; state.drag.lastTime = now;
    const previewDistance = state.pulledBooks.has('heavy') ? -Math.min(34, state.drag.upDistance * .5) : Math.min(34, state.drag.distance * .5);
    elements.heavy.style.translate = `0 ${previewDistance}px`;
  });
  elements.heavy.addEventListener('pointerup', () => {
    if (!state.drag) return;
    const elapsed = performance.now() - state.drag.time;
    const { distance, upDistance, maxSpeed } = state.drag;
    state.drag = null; elements.heavy.style.translate = '';
    if (state.pulledBooks.has('heavy')) {
      if (upDistance < 32) return showToast('Drag the pulled red book slowly upward to return it.');
      if (elapsed < 430 || maxSpeed > 1.1) return showToast('That return was too quick. Try a slower upward drag.');
      return heavyBookSuccess();
    }
    if (distance < 32) return showToast('The red book will not move on a click. Drag it slowly downward.');
    if (elapsed < 430 || maxSpeed > 1.1) {
      elements.bookshelf.classList.remove('thud'); void elements.bookshelf.offsetWidth; elements.bookshelf.classList.add('thud');
      startleBirds('THUD! The Head Librarian has notes about your technique.', true);
      return;
    }
    heavyBookSuccess();
  });
  elements.heavy.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); heavyBookSuccess(); }
  });

  elements.menu.addEventListener('click', () => elements.settings.classList.contains('open') ? closePanels() : openPanel(elements.settings, elements.menu));
  elements.journalButton.addEventListener('click', () => elements.journal.classList.contains('open') ? closePanels() : openPanel(elements.journal, elements.journalButton));
  elements.deskJournal.addEventListener('click', () => elements.journal.classList.contains('open') ? closePanels() : openPanel(elements.journal, elements.deskJournal));
  $('#closeSettings').addEventListener('click', closePanels); $('#closeJournal').addEventListener('click', closePanels);
  elements.pause.addEventListener('click', () => {
    state.paused = !state.paused; elements.scene.classList.toggle('paused', state.paused); elements.pause.setAttribute('aria-pressed', String(state.paused));
    elements.pause.innerHTML = state.paused ? '<span aria-hidden="true">▶</span> Resume' : '<span aria-hidden="true">Ⅱ</span> Pause';
  });
  elements.reset.addEventListener('click', resetScene);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });

  updatePerches();
  window.addEventListener('resize', schedulePerchUpdate);
  if ('ResizeObserver' in window) new ResizeObserver(schedulePerchUpdate).observe(elements.bookshelf);
  updateThreshold(35);
  evaluateScene();
})();
