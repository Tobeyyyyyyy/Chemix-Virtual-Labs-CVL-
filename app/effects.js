export class LabEffects {
  constructor(root) {
    this.root = root;
    this.audio = null;
  }

  play(name) {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      this.audio ||= new AudioCtor();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.frequency.value = name === 'heat' ? 440 : 220;
      gain.gain.setValueAtTime(0.0001, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, this.audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + 0.12);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start();
      oscillator.stop(this.audio.currentTime + 0.13);
    } catch (_) {
      // Audio is an optional enhancement and may be blocked until user input.
    }
  }

  flash(element, className) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    setTimeout(() => element.classList.remove(className), 500);
  }
}
