/**
 * player-core.js — Universeller, robuster Minimal-Audio-Player
 * Optimiert für mobile WebApps, Hintergrundwiedergabe und MediaSession API
 */

class ArchivAudioPlayer {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'archiv_last_played';
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.speed = 1.0;
    this.showName = options.showName || 'Hörspielarchiv';
    this.defaultCover = options.defaultCover || 'cover.jpg';
    
    // Callbacks
    this.onTrackChange = options.onTrackChange || (() => {});
    this.onPlayStateChange = options.onPlayStateChange || (() => {});
    this.onTimeUpdate = options.onTimeUpdate || (() => {});
    
    this.initAudioEvents();
    this.initMediaSession();
  }

  setPlaylist(tracks) {
    this.playlist = tracks;
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.onPlayStateChange(true);
      this.updateMediaSessionState();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.onPlayStateChange(false);
      this.updateMediaSessionState();
    });

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio.duration) return;
      this.onTimeUpdate(this.audio.currentTime, this.audio.duration);
      this.saveProgress();
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('ended', () => {
      this.next();
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
    return this.speed;
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
