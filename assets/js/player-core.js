/**
 * player-core.js — Universeller, robuster Minimal-Audio-Player
 * Optimiert für mobile WebApps, Hintergrundwiedergabe und MediaSession API
 */

class ArchivAudioPlayer {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'archiv_last_played';
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    // Restore saved volume
    try {
      const savedVol = localStorage.getItem('archiv_volume');
      if (savedVol !== null) {
        this.audio.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      }
    } catch (_) {}

    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.speed = 1.0;
    this.showName = options.showName || 'Hörspielarchiv';
    this.defaultCover = options.defaultCover || 'cover.jpg';
    this.isNowPlayingOpen = false;
    this.isScrubbing = false;
    
    // Callbacks
    this.onTrackChange = options.onTrackChange || (() => {});
    this.onPlayStateChange = options.onPlayStateChange || (() => {});
    this.onTimeUpdate = options.onTimeUpdate || (() => {});
    
    this.initAudioEvents();
    this.initMediaSession();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initNowPlaying());
    } else {
      setTimeout(() => this.initNowPlaying(), 0);
    }
  }

  setPlaylist(tracks) {
    this.playlist = tracks;
    this.updateNextBtnState();
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.onPlayStateChange(true);
      this.updateMediaSessionState();
      this.updateNowPlayingState(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.onPlayStateChange(false);
      this.updateMediaSessionState();
      this.updateNowPlayingState(false);
    });

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio.duration) return;
      this.onTimeUpdate(this.audio.currentTime, this.audio.duration);
      this.updateNowPlayingTime(this.audio.currentTime, this.audio.duration);
      this.saveProgress();
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('ended', () => {
      this.next();
    });

    this.audio.addEventListener('volumechange', () => {
      this.updateVolumeUI();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn("Audio Fehler:", e);
    });
  }

  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skip = details.seekOffset || 15;
      this.seek(Math.max(0, this.audio.currentTime - skip));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skip = details.seekOffset || 15;
      this.seek(Math.min(this.audio.duration || Infinity, this.audio.currentTime + skip));
    });
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.seek(details.seekTime);
        }
      });
    } catch (e) {}
  }

  updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator)) return;

    const coverUrl = new URL(track.cover || this.defaultCover, window.location.href).href;
    const ext = coverUrl.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unbekannte Folge',
      artist: track.artist || this.showName,
      album: track.album || this.showName,
      artwork: [
        { src: coverUrl, sizes: '512x512', type: mime }
      ]
    });
  }

  updateMediaSessionState() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
    }
  }

  updateMediaSessionPosition() {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && this.audio.duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate,
          position: this.audio.currentTime
        });
      } catch (e) {}
    }
  }

  loadTrack(index, autoPlay = true, seekTo = 0) {
    if (index < 0 || index >= this.playlist.length) return;
    
    this.currentIndex = index;
    const track = this.playlist[index];
    
    this.audio.src = track.url;
    this.audio.playbackRate = this.speed;
    
    this.updateMediaSessionMetadata(track);
    this.updateNowPlayingTrack(track);
    this.onTrackChange(track, index);
    
    const onLoaded = () => {
      if (seekTo > 0 && seekTo < this.audio.duration) {
        this.audio.currentTime = seekTo;
      }
      if (autoPlay) {
        this.play();
      }
      this.audio.removeEventListener('canplay', onLoaded);
    };
    
    this.audio.addEventListener('canplay', onLoaded);
    this.audio.load();
  }

  play() {
    if (this.currentIndex === -1 && this.playlist.length > 0) {
      this.loadTrack(0, true);
      return;
    }
    this.audio.play().catch(err => {
      console.warn("Wiedergabe erfordert Benutzerinteraktion:", err);
    });
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  prev() {
    if (this.audio.currentTime > 5) {
      this.seek(0);
      return;
    }
    if (this.currentIndex > 0) {
      this.loadTrack(this.currentIndex - 1, true);
    }
  }

  next() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.loadTrack(this.currentIndex + 1, true);
    }
  }

  seek(seconds) {
    if (isFinite(seconds) && this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  skip(seconds) {
    this.seek(this.audio.currentTime + seconds);
  }

  cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(this.speed) + 1) % speeds.length;
    this.speed = speeds[nextIdx];
    this.audio.playbackRate = this.speed;
    this.updateSpeedUI(this.speed);
    return this.speed;
  }

  initNowPlaying() {
    if (document.getElementById('nowPlayingOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'nowPlayingOverlay';
    overlay.className = 'now-playing-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
      <div class="now-playing-backdrop" id="npBackdrop"></div>
      <div class="now-playing-card" id="npCard">
        <div class="np-pull-bar"></div>
        <div class="np-header">
          <button class="np-close-btn" id="npCloseBtn" aria-label="Schließen" title="Schließen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="np-header-meta">
            <span class="np-label">Aktuelle Wiedergabe</span>
            <span class="np-show-name" id="npShowName">${this.showName}</span>
          </div>
          <div class="np-header-placeholder"></div>
        </div>

        <div class="np-artwork-wrap">
          <div class="np-artwork-glow"></div>
          <img id="npCover" class="np-cover" src="${this.defaultCover}" alt="Cover Artwork">
        </div>

        <div class="np-details">
          <div class="np-title" id="npTitle">Keine Folge ausgewählt</div>
          <div class="np-subtitle" id="npSubtitle">${this.showName}</div>
        </div>

        <div class="np-progress-section">
          <div class="np-scrub-wrap" id="npScrubWrap">
            <div class="np-scrub-track">
              <div class="np-scrub-fill" id="npScrubFill"></div>
              <div class="np-scrub-handle" id="npScrubHandle"></div>
            </div>
          </div>
          <div class="np-time-row">
            <span id="npCurTime" class="np-time">0:00</span>
            <span id="npTotalTime" class="np-time">0:00</span>
          </div>
        </div>

        <div class="np-controls">
          <button id="npSpeedBtn" class="np-speed-btn" title="Geschwindigkeit">1.0x</button>
          
          <button id="npSkipBackBtn" class="np-btn" title="15s zurück" aria-label="15 Sekunden zurück">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 4v6h6"></path>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              <text x="12" y="14.5" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">15</text>
            </svg>
          </button>

          <button id="npPlayPauseBtn" class="np-play-pause-btn" title="Abspielen / Pause" aria-label="Abspielen / Pause">
            <svg id="npPlayIcon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <svg id="npPauseIcon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>

          <button id="npSkipFwdBtn" class="np-btn" title="15s vor" aria-label="15 Sekunden vor">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              <text x="12" y="14.5" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">15</text>
            </svg>
          </button>

          <button id="npNextBtn" class="np-btn" title="Nächste Folge" aria-label="Nächste Folge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line>
            </svg>
          </button>
        </div>

        <div class="np-footer">
          <div class="np-volume-wrap">
            <button id="npMuteBtn" class="np-volume-icon-btn" title="Stumm schalten" aria-label="Lautstärke">
              <svg id="npVolHighIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <svg id="npVolMuteIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            </button>
            <div class="np-vol-bar-wrap" id="npVolWrap">
              <div class="np-vol-bar-track">
                <div class="np-vol-bar-fill" id="npVolFill" style="width: ${this.audio.volume * 100}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind mini player bar triggers
    const attachMiniBarTriggers = () => {
      const trackInfos = document.querySelectorAll('.player-track-info');
      trackInfos.forEach(ti => {
        if (!ti.dataset.npBound) {
          ti.dataset.npBound = 'true';
          ti.title = 'Aktuelle Wiedergabe öffnen';
          ti.addEventListener('click', () => this.openNowPlaying());
        }
      });

      const controls = document.querySelector('.player-controls');
      if (controls && !document.getElementById('expandPlayerBtn')) {
        const expBtn = document.createElement('button');
        expBtn.id = 'expandPlayerBtn';
        expBtn.className = 'expand-player-btn';
        expBtn.title = 'Vollbild öffnen';
        expBtn.setAttribute('aria-label', 'Aktuelle Wiedergabe öffnen');
        expBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        `;
        expBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openNowPlaying();
        });
        controls.appendChild(expBtn);
      }
    };

    attachMiniBarTriggers();
    setTimeout(attachMiniBarTriggers, 400);

    // Close actions
    document.getElementById('npCloseBtn').addEventListener('click', () => this.closeNowPlaying());
    document.getElementById('npBackdrop').addEventListener('click', () => this.closeNowPlaying());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isNowPlayingOpen) {
        this.closeNowPlaying();
      } else if (e.code === 'Space' && this.isNowPlayingOpen) {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          this.togglePlay();
        }
      }
    });

    // Touch pull-down gesture on mobile
    let touchStartY = 0;
    let touchDiff = 0;
    const card = document.getElementById('npCard');
    const pullBar = card.querySelector('.np-pull-bar');
    const header = card.querySelector('.np-header');

    [pullBar, header].forEach(el => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchDiff = 0;
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        touchDiff = currentY - touchStartY;
        if (touchDiff > 0) {
          card.style.transform = `translateY(${touchDiff}px)`;
        }
      }, { passive: true });

      el.addEventListener('touchend', () => {
        if (touchDiff > 70) {
          this.closeNowPlaying();
        } else {
          card.style.transform = '';
        }
        touchStartY = 0;
        touchDiff = 0;
      });
    });

    // Controls
    document.getElementById('npPlayPauseBtn').addEventListener('click', () => this.togglePlay());
    document.getElementById('npSkipBackBtn').addEventListener('click', () => this.skip(-15));
    document.getElementById('npSkipFwdBtn').addEventListener('click', () => this.skip(15));
    document.getElementById('npNextBtn').addEventListener('click', () => this.next());
    
    document.getElementById('npSpeedBtn').addEventListener('click', () => {
      const sp = this.cycleSpeed();
      this.updateSpeedUI(sp);
    });

    // Scrubber
    const scrubWrap = document.getElementById('npScrubWrap');
    const scrubFill = document.getElementById('npScrubFill');
    const scrubHandle = document.getElementById('npScrubHandle');
    const curTime = document.getElementById('npCurTime');

    const handleScrub = (clientX) => {
      const rect = scrubWrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      scrubFill.style.width = (pct * 100) + '%';
      scrubHandle.style.left = (pct * 100) + '%';
      if (this.audio.duration) {
        curTime.textContent = ArchivAudioPlayer.formatTime(pct * this.audio.duration);
      }
      return pct;
    };

    scrubWrap.addEventListener('pointerdown', (e) => {
      this.isScrubbing = true;
      scrubWrap.classList.add('active');
      const pct = handleScrub(e.clientX);

      const onPointerMove = (me) => {
        if (!this.isScrubbing) return;
        handleScrub(me.clientX);
      };

      const onPointerUp = (ue) => {
        if (!this.isScrubbing) return;
        this.isScrubbing = false;
        scrubWrap.classList.remove('active');
        const finalPct = handleScrub(ue.clientX);
        if (this.audio.duration) {
          this.seek(finalPct * this.audio.duration);
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    // Volume
    const volWrap = document.getElementById('npVolWrap');
    const volFill = document.getElementById('npVolFill');
    const muteBtn = document.getElementById('npMuteBtn');

    const handleVol = (clientX) => {
      const rect = volWrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      volFill.style.width = (pct * 100) + '%';
      this.audio.volume = pct;
      this.audio.muted = false;
      this.updateVolumeUI();
      try {
        localStorage.setItem('archiv_volume', pct.toString());
      } catch (_) {}
    };

    volWrap.addEventListener('pointerdown', (e) => {
      handleVol(e.clientX);
      const onMove = (me) => handleVol(me.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    muteBtn.addEventListener('click', () => {
      this.audio.muted = !this.audio.muted;
      this.updateVolumeUI();
    });

    this.updateSpeedUI(this.speed);
    this.updateVolumeUI();
    this.updateNextBtnState();
  }

  openNowPlaying() {
    this.initNowPlaying();
    const overlay = document.getElementById('nowPlayingOverlay');
    const card = document.getElementById('npCard');
    if (!overlay) return;

    this.isNowPlayingOpen = true;
    overlay.classList.add('open');
    if (card) card.style.transform = '';
    document.body.style.overflow = 'hidden';

    if (this.currentIndex >= 0 && this.playlist[this.currentIndex]) {
      this.updateNowPlayingTrack(this.playlist[this.currentIndex]);
    }
    this.updateNowPlayingState(this.isPlaying);
    this.updateNowPlayingTime(this.audio.currentTime, this.audio.duration);
    this.updateSpeedUI(this.speed);
    this.updateVolumeUI();
    this.updateNextBtnState();
  }

  closeNowPlaying() {
    const overlay = document.getElementById('nowPlayingOverlay');
    const card = document.getElementById('npCard');
    if (!overlay) return;

    this.isNowPlayingOpen = false;
    overlay.classList.remove('open');
    if (card) card.style.transform = '';
    document.body.style.overflow = '';
  }

  updateNowPlayingTrack(track) {
    if (!track) return;
    const titleEl = document.getElementById('npTitle');
    const subEl = document.getElementById('npSubtitle');
    const coverEl = document.getElementById('npCover');
    const showNameEl = document.getElementById('npShowName');

    if (titleEl) titleEl.textContent = track.episodeTitle || track.title || 'Unbekannte Folge';
    if (subEl) subEl.textContent = track.partTitle || track.bookTitle || track.album || track.artist || this.showName;
    if (showNameEl) showNameEl.textContent = this.showName;
    if (coverEl) {
      coverEl.src = track.cover || this.defaultCover;
      coverEl.onerror = () => { coverEl.src = this.defaultCover; };
    }
    this.updateNextBtnState();
  }

  updateNowPlayingState(isPlaying) {
    const playIcon = document.getElementById('npPlayIcon');
    const pauseIcon = document.getElementById('npPauseIcon');
    if (playIcon && pauseIcon) {
      playIcon.style.display = isPlaying ? 'none' : 'block';
      pauseIcon.style.display = isPlaying ? 'block' : 'none';
    }
  }

  updateNowPlayingTime(current, duration) {
    if (this.isScrubbing) return;
    const curTime = document.getElementById('npCurTime');
    const totalTime = document.getElementById('npTotalTime');
    const scrubFill = document.getElementById('npScrubFill');
    const scrubHandle = document.getElementById('npScrubHandle');

    if (curTime) curTime.textContent = ArchivAudioPlayer.formatTime(current);
    if (totalTime) totalTime.textContent = ArchivAudioPlayer.formatTime(duration);

    const pct = duration ? (current / duration) * 100 : 0;
    if (scrubFill) scrubFill.style.width = pct + '%';
    if (scrubHandle) scrubHandle.style.left = pct + '%';
  }

  updateSpeedUI(speed) {
    const npSpeedBtn = document.getElementById('npSpeedBtn');
    if (npSpeedBtn) npSpeedBtn.textContent = speed.toFixed(1) + 'x';
    const miniSpeedBtn = document.getElementById('speedBtn');
    if (miniSpeedBtn) miniSpeedBtn.textContent = speed.toFixed(1) + 'x';
  }

  updateVolumeUI() {
    const highIcon = document.getElementById('npVolHighIcon');
    const muteIcon = document.getElementById('npVolMuteIcon');
    const volFill = document.getElementById('npVolFill');

    const isMuted = this.audio.muted || this.audio.volume === 0;
    if (highIcon && muteIcon) {
      highIcon.style.display = isMuted ? 'none' : 'block';
      muteIcon.style.display = isMuted ? 'block' : 'none';
    }
    if (volFill) {
      volFill.style.width = (isMuted ? 0 : this.audio.volume * 100) + '%';
    }
  }

  updateNextBtnState() {
    const nextBtn = document.getElementById('npNextBtn');
    if (!nextBtn) return;
    const hasNext = this.playlist.length > 1 && this.currentIndex < this.playlist.length - 1;
    nextBtn.style.opacity = hasNext ? '1' : '0.3';
    nextBtn.style.pointerEvents = hasNext ? 'auto' : 'none';
  }

  saveProgress() {
    if (this.currentIndex < 0) return;
    try {
      const state = {
        index: this.currentIndex,
        time: this.audio.currentTime,
        updatedAt: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {}
  }

  getSavedProgress() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  static formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

window.ArchivAudioPlayer = ArchivAudioPlayer;
