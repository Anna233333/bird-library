(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    scene: $('#scene'), bookshelf: $('#bookshelf'), botany: $('#bookBotany'), heavy: $('#bookHeavy'), secret: $('#bookSecret'),
    blue: $('#birdBlue'), green: $('#birdGreen'), owl: $('#birdOwl'), librarian: $('#birdPigeonLibrarian'), messenger: $('#birdPigeonMessenger'), cubby: $('#secretCubby'), teaCup: $('#teaCup'),
    volume: $('#volumeSlider'), volumeOutput: $('#volumeOutput'), meterFill: $('#meterFill'), threshold: $('#thresholdSlider'), thresholdOutput: $('#thresholdOutput'), thresholdLine: $('#thresholdLine'), manualTest: $('#manualTest'), rain: $('#rainToggle'), breeze: $('#breezeToggle'),
    mic: $('#micButton'), micStatus: $('#micStatus'), rainAudio: $('#rainAudio'), window: $('#windowLatch'), windowLabel: $('#windowLabel'), statusCard: $('#statusCard'),
    statusTitle: $('#statusTitle'), statusText: $('#statusText'), menu: $('#menuButton'), settings: $('#settingsPanel'),
    journalButton: $('#journalButton'), deskJournal: $('#deskJournal'), journal: $('#journalPanel'), discoveryCount: $('#discoveryCount'), deskDiscoveryCount: $('#deskDiscoveryCount'), clue: $('#clueText'), journalClue: $('#journalClue'),
    desk: $('.desk'), flower: $('.room-flower'),
    toast: $('#toast'), pause: $('#pauseButton'), reset: $('#resetButton'), teaNote: $('#teaNote'),
    edit: $('#editButton'), editToolbar: $('#editToolbar'), editName: $('#editAssetName'), editPicker: $('#editAssetPicker'), editDone: $('#doneEditingButton'),
    editUndo: $('#undoLayoutButton'), editReset: $('#resetLayoutButton')
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
    editMode: false,
    layout: null,
    editorDrag: null,
    selectedLayoutId: null,
    layoutUndo: [],
  };

  let toastTimer;
  let calmTimer;

  const LAYOUT_STORAGE_KEY = 'shy-library-layout-v1';
  const layoutChannel = 'BroadcastChannel' in window ? new BroadcastChannel('shy-library-layout') : null;
  const layoutDefaults = {
    version: 1,
    birds: {
      owl: { x: 86, y: 34 },
      librarian: { x: 66, y: 39 },
      green: { x: 87, y: 54 },
      messenger: { x: 56, y: 63 },
      blue: { x: 73, y: 65 },
    },
    offsets: {
      desk: { x: 0, y: 0 },
      bookshelf: { x: 0, y: 0 },
      cubby: { x: 0, y: 0 },
      flower: { x: 0, y: 0 },
      journal: { x: 0, y: 0 },
      cup: { x: 0, y: 0 },
      botany: { x: 0, y: 0 },
      secret: { x: 0, y: 0 },
      heavy: { x: 0, y: 0 },
    },
  };

  const layoutElements = {
    desk: elements.desk,
    bookshelf: elements.bookshelf,
    cubby: elements.cubby,
    flower: elements.flower,
    journal: elements.deskJournal,
    cup: elements.teaCup,
    botany: elements.botany,
    secret: elements.secret,
    heavy: elements.heavy,
  };

  const birdElements = {
    blue: elements.blue,
    green: elements.green,
    owl: elements.owl,
    librarian: elements.librarian,
    messenger: elements.messenger,
  };

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

  function cloneLayout(layout = layoutDefaults) {
    return JSON.parse(JSON.stringify(layout));
  }

  function mergeSavedLayout(saved) {
    const layout = cloneLayout(layoutDefaults);
    if (!saved || saved.version !== layoutDefaults.version) return layout;
    Object.keys(layout.birds).forEach((id) => {
      const point = saved.birds?.[id];
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) layout.birds[id] = { x: point.x, y: point.y };
    });
    Object.keys(layout.offsets).forEach((id) => {
      const point = saved.offsets?.[id];
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) layout.offsets[id] = { x: point.x, y: point.y };
    });
    return layout;
  }

  function loadLayout() {
    try {
      return mergeSavedLayout(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)));
    } catch {
      return cloneLayout(layoutDefaults);
    }
  }

  function updateUndoButton() {
    elements.editUndo.disabled = state.layoutUndo.length === 0;
  }

  function saveLayout(broadcast = true) {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout)); } catch { /* The current layout still works for this visit. */ }
    if (broadcast) layoutChannel?.postMessage(state.layout);
  }

  function applyLayout() {
    const sceneBox = elements.scene.getBoundingClientRect();
    if (!sceneBox.width || !sceneBox.height || !state.layout) return;
    Object.entries(layoutElements).forEach(([id, element]) => {
      const point = state.layout.offsets[id] || { x: 0, y: 0 };
      element.style.translate = `${sceneBox.width * point.x / 100}px ${sceneBox.height * point.y / 100}px`;
    });
    updatePerches();
  }

  function selectLayoutAsset(element) {
    $$('[data-layout-id].layout-selected').forEach((item) => item.classList.remove('layout-selected'));
    if (!element) {
      state.selectedLayoutId = null;
      elements.editName.textContent = 'Choose an asset';
      elements.editPicker.value = '';
      return;
    }
    element.classList.add('layout-selected');
    state.selectedLayoutId = element.dataset.layoutId;
    elements.editName.textContent = element.dataset.layoutName || 'Selected asset';
    elements.editPicker.value = state.selectedLayoutId;
  }

  function pushLayoutUndo(snapshot) {
    state.layoutUndo.push(cloneLayout(snapshot));
    state.layoutUndo = state.layoutUndo.slice(-30);
    updateUndoButton();
  }

  function undoLayout() {
    const previous = state.layoutUndo.pop();
    if (!previous) return;
    state.layout = mergeSavedLayout(previous);
    applyLayout();
    saveLayout();
    updateUndoButton();
    showToast('The last layout move was undone.');
  }

  function resetLayout() {
    pushLayoutUndo(state.layout);
    state.layout = cloneLayout(layoutDefaults);
    applyLayout();
    saveLayout();
    selectLayoutAsset(null);
    showToast('The original asset positions are restored.');
  }

  function setEditMode(enabled) {
    state.editMode = enabled;
    state.editorDrag = null;
    elements.scene.classList.toggle('edit-mode', enabled);
    elements.editToolbar.hidden = !enabled;
    elements.edit.setAttribute('aria-pressed', String(enabled));
    elements.edit.innerHTML = enabled ? '<span aria-hidden="true">✦</span> Editing' : '<span aria-hidden="true">✎</span> Edit';
    closePanels();
    if (enabled) {
      applyLayout();
      showToast('Edit mode: drag an outlined asset to move it.');
    } else {
      selectLayoutAsset(null);
      saveLayout();
      evaluateScene();
      showToast('Layout saved. The library is interactive again.');
    }
  }

  function startEditorDrag(event) {
    if (!state.editMode) return;
    const target = event.target.closest('[data-layout-id]');
    if (!target || !elements.scene.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = target.dataset.layoutId;
    const group = birdElements[id] ? 'birds' : 'offsets';
    const point = state.layout[group][id];
    if (!point) return;
    selectLayoutAsset(target);
    state.editorDrag = {
      id,
      group,
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
      before: cloneLayout(state.layout),
      moved: false,
    };
    target.classList.add('layout-dragging');
    target.setPointerCapture?.(event.pointerId);
  }

  function moveEditorDrag(event) {
    const drag = state.editorDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const sceneBox = elements.scene.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / sceneBox.width * 100;
    const dy = (event.clientY - drag.startY) / sceneBox.height * 100;
    const limit = drag.group === 'birds' ? { min: 2, max: 98 } : { min: -70, max: 70 };
    state.layout[drag.group][drag.id] = {
      x: Math.max(limit.min, Math.min(limit.max, drag.originX + dx)),
      y: Math.max(limit.min, Math.min(limit.max, drag.originY + dy)),
    };
    drag.moved = drag.moved || Math.abs(dx) > .08 || Math.abs(dy) > .08;
    applyLayout();
  }

  function finishEditorDrag(event) {
    const drag = state.editorDrag;
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    drag.target.classList.remove('layout-dragging');
    drag.target.releasePointerCapture?.(drag.pointerId);
    if (drag.moved) {
      pushLayoutUndo(drag.before);
      saveLayout();
      showToast(`${drag.target.dataset.layoutName || 'Asset'} position saved.`);
    }
    state.editorDrag = null;
  }

  function nudgeSelectedAsset(event) {
    if (!state.editMode || !state.selectedLayoutId || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false;
    event.preventDefault();
    const id = state.selectedLayoutId;
    const group = birdElements[id] ? 'birds' : 'offsets';
    const before = cloneLayout(state.layout);
    const point = state.layout[group][id];
    const amount = event.shiftKey ? 2 : .5;
    if (event.key === 'ArrowLeft') point.x -= amount;
    if (event.key === 'ArrowRight') point.x += amount;
    if (event.key === 'ArrowUp') point.y -= amount;
    if (event.key === 'ArrowDown') point.y += amount;
    const min = group === 'birds' ? 2 : -70;
    const max = group === 'birds' ? 98 : 70;
    point.x = Math.max(min, Math.min(max, point.x));
    point.y = Math.max(min, Math.min(max, point.y));
    pushLayoutUndo(before);
    applyLayout();
    saveLayout();
    return true;
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
    if (!sceneBox.width || !sceneBox.height || !state.layout) return;
    const slots = [
      [elements.owl, 'owl'],
      [elements.librarian, 'librarian'],
      [elements.green, 'green'],
      [elements.messenger, 'messenger'],
      [elements.blue, 'blue'],
    ];
    slots.forEach(([bird, id]) => {
      const point = state.layout.birds[id];
      bird.style.setProperty('--perch-x', `${sceneBox.width * point.x / 100}px`);
      bird.style.setProperty('--perch-y', `${sceneBox.height * point.y / 100}px`);
    });
  }

  let perchFrame;
  function schedulePerchUpdate() {
    cancelAnimationFrame(perchFrame);
    perchFrame = requestAnimationFrame(applyLayout);
  }

  function evaluateScene() {
    elements.scene.classList.toggle('raining', state.rainOn);
    elements.scene.classList.toggle('breezy', state.breezeOn);
    elements.scene.classList.toggle('window-closed', !state.windowOpen);

    maybeUnlockMessenger();
    if (state.teaParty) return;
    const librarianChatty = state.windowOpen && state.pulledBooks.has('heavy') && state.roomVolume >= state.noiseThreshold && state.roomVolume <= Math.min(100, state.noiseThreshold + 20);
    const messengerInside = state.windowOpen && state.messengerUnlocked && state.breezeOn && state.pulledBooks.has('botany') && state.pulledBooks.has('secret');
    if (state.startled) {
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
    const owlInside = state.windowOpen && state.owlUnlocked && state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn && state.pulledBooks.has('secret');

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

    if (state.windowOpen && state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn && state.pulledBooks.has('secret')) {
      unlockOwl();
    }

    const indoor = [blueInside, greenInside, owlInside, librarianChatty, messengerInside].filter(Boolean).length;
    const houseBirds = [blueInside, greenInside].filter(Boolean).length;
    if (!state.windowOpen) setStatus(houseBirds ? `${houseBirds} house flock${houseBirds > 1 ? 's' : ''} staying cozy` : 'The window is closed', 'House birds can stay. Wild visitors wait outside.');
    else if (indoor === 0) setStatus('The room is listening', 'Try a book. Quiet hands help.');
    else if (indoor === 1) setStatus('A little flock feels brave', 'Move gently. Another may be nearby.');
    else setStatus(`${indoor} visiting flocks`, 'The library is beginning to trust you.');

    updateClue();
  }

  function updateClue() {
    let clue;
    if (!state.discovered.has('blue')) clue = 'A green spine, pulled forward in a hush, could become a doorstep.';
    else if (!state.discovered.has('green')) clue = 'The heaviest red story listens for patient hands moving downward.';
    else if (!state.owlUnlocked) clue = 'An open window, a gold moon, soft rain, and the softest room.';
    else if (!state.discovered.has('librarian')) clue = 'Someone beyond the open window enjoys chatter—but not a red-book thud.';
    else if (!state.discovered.has('messenger')) clue = 'Through an open window, a breeze carries pressed flowers from green stories toward gold ones.';
    else if (!state.teaParty) clue = 'Five signatures. Open window. Rain. Breeze. Three ledges. A small cup of millet.';
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
    if (name === 'secret' && pulled && !(state.windowOpen && state.roomVolume < Math.max(5, state.noiseThreshold - 10) && state.rainOn)) {
      const owlLimit = Math.max(5, state.noiseThreshold - 10);
      if (!state.windowOpen) {
        setStatus('The gold nook stays quiet', 'The owl cannot enter through a closed window.', true);
        showToast('Open the window to invite the owl inside.');
      } else if (!state.rainOn) {
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
    const librarianCanEnter = summonLibrarian && state.windowOpen;
    state.librarianScolding = librarianCanEnter;
    elements.librarian.classList.toggle('scolding', librarianCanEnter);
    positionBird(elements.librarian, librarianCanEnter ? 'inside' : 'outside', !librarianCanEnter);
    if (librarianCanEnter) discover('librarian');
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
    if (state.windowOpen && state.roomVolume < Math.max(5, state.noiseThreshold - 15) && state.rainOn && state.breezeOn && allBooks && !state.startled) {
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
      showToast('The millet cup whispers: open window, rain, breeze, three ledges, and the softest hush.');
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
    elements.window.setAttribute('aria-pressed', 'true'); elements.window.setAttribute('aria-label', 'Close the open window'); elements.windowLabel.textContent = 'Window open';
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
    elements.windowLabel.textContent = state.windowOpen ? 'Window open' : 'Window closed';
    if (!state.windowOpen) {
      state.breezeOn = false;
      elements.breeze.checked = false;
      updateAmbience();
      showToast('The window clicks shut, and the page-rustle breeze fades. House birds stay; wild visitors wait outside.');
    } else {
      state.breezeOn = true;
      elements.breeze.checked = true;
      updateAmbience();
      showToast('The window opens, bringing in a page-rustle breeze. Owls and pigeons may visit now.');
    }
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
    const sceneBox = elements.scene.getBoundingClientRect();
    const saved = state.layout?.offsets.heavy || { x: 0, y: 0 };
    elements.heavy.style.translate = `${sceneBox.width * saved.x / 100}px ${sceneBox.height * saved.y / 100 + previewDistance}px`;
  });
  elements.heavy.addEventListener('pointerup', () => {
    if (!state.drag) return;
    const elapsed = performance.now() - state.drag.time;
    const { distance, upDistance, maxSpeed } = state.drag;
    state.drag = null; applyLayout();
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
  elements.edit.addEventListener('click', () => setEditMode(!state.editMode));
  elements.editDone.addEventListener('click', () => setEditMode(false));
  elements.editUndo.addEventListener('click', undoLayout);
  elements.editReset.addEventListener('click', resetLayout);
  elements.editPicker.addEventListener('change', (event) => {
    const selected = event.target.value ? $(`[data-layout-id="${event.target.value}"]`) : null;
    selectLayoutAsset(selected);
  });
  elements.scene.addEventListener('pointerdown', startEditorDrag, true);
  document.addEventListener('pointermove', moveEditorDrag, { passive: false });
  document.addEventListener('pointerup', finishEditorDrag);
  elements.scene.addEventListener('click', (event) => {
    if (!state.editMode || !event.target.closest('[data-layout-id]')) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (nudgeSelectedAsset(event)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && state.editMode) {
      event.preventDefault();
      undoLayout();
      return;
    }
    if (event.key === 'Escape') {
      if (state.editMode) setEditMode(false);
      else closePanels();
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== LAYOUT_STORAGE_KEY || !event.newValue) return;
    try {
      state.layout = mergeSavedLayout(JSON.parse(event.newValue));
      applyLayout();
      showToast('Layout updated from another window.');
    } catch { /* Ignore incomplete storage events. */ }
  });
  if (layoutChannel) {
    layoutChannel.addEventListener('message', (event) => {
      state.layout = mergeSavedLayout(event.data);
      applyLayout();
    });
  }

  state.layout = loadLayout();
  applyLayout();
  window.addEventListener('resize', schedulePerchUpdate);
  if ('ResizeObserver' in window) new ResizeObserver(schedulePerchUpdate).observe(elements.scene);
  updateThreshold(35);
  evaluateScene();
})();
