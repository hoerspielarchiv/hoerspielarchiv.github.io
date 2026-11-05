/**
 * player-core.js — Universeller, robuster Minimal-Audio-Player
 * Optimiert für mobile WebApps, Hintergrundwiedergabe und MediaSession API
 */

const FALLBACK_COVER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%2318181c'/%3E%3C/svg%3E";

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
      this.saveProgress();
      this.saveToHistory();
    });

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio.duration) return;
      this.onTimeUpdate(this.audio.currentTime, this.audio.duration);
      this.updateNowPlayingTime(this.audio.currentTime, this.audio.duration);
      this.saveProgress();
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('ended', () => {
      this.saveToHistory();
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
          <button class="np-history-btn" id="npHistoryBtn" aria-label="Hörverlauf anzeigen" title="Hörverlauf">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
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

        <!-- History Drawer inside Card -->
        <div class="np-history-panel" id="npHistoryPanel" aria-hidden="true">
          <div class="np-hist-header">
            <div class="np-hist-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>Hörverlauf</span>
            </div>
            <div class="np-hist-actions">
              <button id="npClearHistBtn" class="np-hist-clear-btn" title="Verlauf leeren">Leeren</button>
              <button id="npCloseHistBtn" class="np-hist-close-btn" title="Zurück zur Wiedergabe" aria-label="Schließen">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="np-hist-list" id="npHistList"></div>
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

    // History drawer controls
    const histBtn = document.getElementById('npHistoryBtn');
    if (histBtn) {
      histBtn.addEventListener('click', () => this.openHistoryPanel());
    }
    const closeHistBtn = document.getElementById('npCloseHistBtn');
    if (closeHistBtn) {
      closeHistBtn.addEventListener('click', () => this.closeHistoryPanel());
    }
    const clearHistBtn = document.getElementById('npClearHistBtn');
    if (clearHistBtn) {
      clearHistBtn.addEventListener('click', () => {
        ArchivAudioPlayer.clearHistory();
        this.renderNowPlayingHistory();
      });
    }

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
    } else {
      const coverEl = document.getElementById('npCover');
      if (coverEl) coverEl.src = this.defaultCover;
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
    this.closeHistoryPanel();
  }

  openHistoryPanel() {
    const panel = document.getElementById('npHistoryPanel');
    if (!panel) return;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    this.renderNowPlayingHistory();
  }

  closeHistoryPanel() {
    const panel = document.getElementById('npHistoryPanel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  renderNowPlayingHistory() {
    const container = document.getElementById('npHistList');
    if (!container) return;
    container.innerHTML = '';

    const list = ArchivAudioPlayer.getHistory();
    if (list.length === 0) {
      container.innerHTML = `
        <div class="np-hist-empty">
          <div class="np-hist-empty-title">Kein Verlauf vorhanden</div>
          <div class="np-hist-empty-desc">Deine angehörten Folgen erscheinen automatisch hier.</div>
        </div>
      `;
      return;
    }

    const currentContext = ArchivAudioPlayer.getCurrentContext();

    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'np-hist-item';
      const coverSrc = ArchivAudioPlayer.resolveCoverPath(item.cover, item.showId, currentContext);
      const resumeUrl = ArchivAudioPlayer.getResumeUrl(item);

      el.innerHTML = `
        <div class="np-hist-thumb-wrap">
          <img src="${coverSrc}" class="np-hist-thumb" alt="" onerror="this.src='${FALLBACK_COVER_SVG}';">
          <div class="np-hist-progress-bar">
            <div class="np-hist-progress-fill" style="width: ${item.progressPct}%"></div>
          </div>
        </div>
        <div class="np-hist-info">
          <div class="np-hist-item-title" title="${item.title}">${item.title}</div>
          <div class="np-hist-item-sub">${item.showName} • ${ArchivAudioPlayer.formatTimeAgo(item.timestamp)}</div>
          <div class="np-hist-item-time">${ArchivAudioPlayer.formatTime(item.currentTime)} / ${ArchivAudioPlayer.formatTime(item.duration)} (${item.progressPct}%)</div>
        </div>
        <div class="np-hist-actions-right">
          <a href="${resumeUrl}" class="np-hist-play-btn" title="Fortsetzen" aria-label="Fortsetzen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </a>
          <button class="np-hist-del-btn" data-url="${item.url}" title="Entfernen" aria-label="Entfernen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      el.querySelector('.np-hist-del-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ArchivAudioPlayer.removeFromHistory(item.url);
        this.renderNowPlayingHistory();
      });

      container.appendChild(el);
    });
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
    const now = Date.now();
    try {
      const state = {
        index: this.currentIndex,
        time: this.audio.currentTime,
        updatedAt: now
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {}

    // Throttle history save to once every 4 seconds during active playback
    if (!this._lastHistorySave || now - this._lastHistorySave > 4000) {
      this._lastHistorySave = now;
      this.saveToHistory();
    }
  }

  saveToHistory() {
    if (this.currentIndex < 0 || !this.playlist || !this.playlist[this.currentIndex]) return;
    if (!this.audio.duration || this.audio.currentTime < 2) return;

    try {
      const track = this.playlist[this.currentIndex];
      const cur = Math.floor(this.audio.currentTime);
      const dur = Math.floor(this.audio.duration);
      const pct = Math.min(100, Math.max(1, Math.round((cur / dur) * 100)));

      let showId = 'ddf';
      const loc = window.location.pathname.toLowerCase();
      if (loc.includes('/hp') || this.showName.toLowerCase().includes('harry')) {
        showId = 'hp';
      } else if (loc.includes('/alf') || this.showName.toLowerCase().includes('alf')) {
        showId = 'alf';
      }

      const item = {
        id: track.url || `${showId}_${this.currentIndex}`,
        showId: showId,
        showName: this.showName,
        title: track.episodeTitle || track.title || 'Unbekannte Folge',
        subtitle: track.partTitle || track.bookTitle || track.album || track.artist || this.showName,
        cover: track.cover || this.defaultCover || 'cover.jpg',
        url: track.url,
        currentTime: cur,
        duration: dur,
        progressPct: pct,
        timestamp: Date.now(),
        bandId: track.bandId || (typeof currentBandId !== 'undefined' ? currentBandId : null)
      };

      let history = ArchivAudioPlayer.getHistory();
      history = history.filter(h => h.url !== item.url);
      history.unshift(item);
      if (history.length > 30) history = history.slice(0, 30);

      localStorage.setItem('archiv_listening_history', JSON.stringify(history));
      window.dispatchEvent(new CustomEvent('archiv_history_updated', { detail: history }));
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

  static getHistory() {
    try {
      const data = localStorage.getItem('archiv_listening_history');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  static removeFromHistory(url) {
    try {
      let list = ArchivAudioPlayer.getHistory();
      list = list.filter(item => item.url !== url);
      localStorage.setItem('archiv_listening_history', JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('archiv_history_updated', { detail: list }));
      return list;
    } catch (_) {
      return [];
    }
  }

  static clearHistory() {
    try {
      localStorage.removeItem('archiv_listening_history');
      window.dispatchEvent(new CustomEvent('archiv_history_updated', { detail: [] }));
    } catch (_) {}
  }

  static formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Gerade eben';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Gestern';
    if (days < 7) return `vor ${days} Tagen`;
    const d = new Date(timestamp);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.`;
  }

  static getCurrentContext() {
    const p = window.location.pathname.toLowerCase();
    if (p.includes('/hp')) return 'hp';
    if (p.includes('/ddf')) return 'ddf';
    if (p.includes('/alf')) return 'alf';
    return 'root';
  }

  static resolveCoverPath(cover, showId, context = 'root') {
    if (!cover) return FALLBACK_COVER_SVG;
    if (cover.startsWith('http://') || cover.startsWith('https://') || cover.startsWith('data:')) {
      return cover;
    }
    let clean = cover.replace(/^(\.\/|\/)/, '');
    if (clean.startsWith(showId + '/')) {
      clean = clean.substring(showId.length + 1);
    }

    if (context === 'root') {
      return `${showId}/${clean}`;
    } else if (context === showId) {
      return clean;
    } else {
      return `../${showId}/${clean}`;
    }
  }

  static getResumeUrl(item) {
    const ctx = ArchivAudioPlayer.getCurrentContext();
    const params = new URLSearchParams();
    if (item.url) params.set('url', item.url);
    if (item.currentTime) params.set('time', item.currentTime);
    if (item.bandId) params.set('band', item.bandId);

    const query = params.toString();
    if (ctx === 'root') {
      return `${item.showId}/index.html?${query}`;
    } else if (ctx === item.showId) {
      return `index.html?${query}`;
    } else {
      return `../${item.showId}/index.html?${query}`;
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
