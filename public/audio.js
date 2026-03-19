// ===== Audio System =====
// Synthesizes sound effects using Web Audio API to avoid external file dependencies

class SoundManager {
    constructor() {
        this.context = null;
        this.isMuted = false;
        this.masterGain = null;
    }

    init() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = 0.3; // Default volume
            this.masterGain.connect(this.context.destination);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : 0.3;
        }
        return this.isMuted;
    }

    play(soundName) {
        if (this.isMuted) return;
        if (!this.context) this.init();
        if (this.context.state === 'suspended') this.context.resume();

        switch (soundName) {
            case 'pop':
                this.playPop();
                break;
            case 'submit':
                this.playSubmit();
                break;
            case 'invalid':
                this.playInvalid();
                break;
            case 'gem':
                this.playGem();
                break;
            case 'win':
                this.playWin();
                break;
            case 'click':
                this.playClick();
                break;
        }
    }

    // --- Sound Generators ---

    playPop() {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.5, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.context.currentTime + 0.1);
    }

    playSubmit() {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.context.currentTime);
        osc.frequency.linearRampToValueAtTime(800, this.context.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.5, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.context.currentTime + 0.3);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.context.currentTime + 0.3);
        
        // Chord effect
        setTimeout(() => {
            const osc2 = this.context.createOscillator();
            const gain2 = this.context.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(600, this.context.currentTime);
            osc2.frequency.linearRampToValueAtTime(1000, this.context.currentTime + 0.1);
            gain2.gain.setValueAtTime(0.3, this.context.currentTime);
            gain2.gain.linearRampToValueAtTime(0.01, this.context.currentTime + 0.3);
            osc2.connect(gain2);
            gain2.connect(this.masterGain);
            osc2.start();
            osc2.stop(this.context.currentTime + 0.3);
        }, 50);
    }

    playInvalid() {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.context.currentTime);
        osc.frequency.linearRampToValueAtTime(150, this.context.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.context.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.context.currentTime + 0.2);
    }

    playGem() {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1800, this.context.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.context.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.context.currentTime + 0.4);
    }

    playWin() {
        const now = this.context.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio
        
        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            
            osc.type = 'square';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0.1, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.4);
        });
    }
    
    playClick() {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, this.context.currentTime);
        
        gain.gain.setValueAtTime(0.05, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.context.currentTime + 0.05);
    }
}

// Global instance
window.soundManager = new SoundManager();
