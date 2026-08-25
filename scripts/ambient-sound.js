/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

(function () {
    let audioCtx = null;
    let masterGain = null;
    let activeNodes = [];
    let currentType = "rain";
    let isPlaying = false;

    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
                masterGain = audioCtx.createGain();
                const savedVol = parseFloat(localStorage.getItem("myntAmbientVolume") || "0.5");
                masterGain.gain.setValueAtTime(savedVol, audioCtx.currentTime);
                masterGain.connect(audioCtx.destination);
            }
        }
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function createNoiseBuffer(durationSec = 5, type = "pink") {
        const ctx = getAudioContext();
        if (!ctx) return null;
        const bufferSize = ctx.sampleRate * durationSec;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === "white") {
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.15;
            }
        } else if (type === "pink") {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
                b6 = white * 0.115926;
            }
        } else if (type === "brown") {
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = data[i];
                data[i] *= 0.5;
            }
        }
        return buffer;
    }

    function startRain(ctx) {
        const buffer = createNoiseBuffer(5, "pink");
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1000, ctx.currentTime);

        source.connect(filter);
        filter.connect(masterGain);
        source.start();
        activeNodes.push(source, filter);
    }

    function startOcean(ctx) {
        const buffer = createNoiseBuffer(6, "brown");
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(400, ctx.currentTime);

        // LFO for wave modulation
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // ~8 sec wave period
        lfoGain.gain.setValueAtTime(300, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        source.connect(filter);
        filter.connect(masterGain);

        source.start();
        lfo.start();
        activeNodes.push(source, filter, lfo, lfoGain);
    }

    function startWhiteNoise(ctx) {
        const buffer = createNoiseBuffer(4, "pink");
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(3000, ctx.currentTime);

        source.connect(filter);
        filter.connect(masterGain);
        source.start();
        activeNodes.push(source, filter);
    }

    function startCampfire(ctx) {
        const buffer = createNoiseBuffer(5, "brown");
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(600, ctx.currentTime);

        source.connect(filter);
        filter.connect(masterGain);
        source.start();
        activeNodes.push(source, filter);
    }

    function cleanupNodes() {
        if (activeNodes.length) {
            activeNodes.forEach(node => {
                try {
                    if (typeof node.stop === "function") node.stop();
                    if (typeof node.disconnect === "function") node.disconnect();
                } catch (e) {}
            });
            activeNodes = [];
        }
    }

    function stop(immediate = false) {
        if (!isPlaying && activeNodes.length === 0) return;
        const ctx = getAudioContext();
        if (!ctx || immediate) {
            cleanupNodes();
            isPlaying = false;
            document.dispatchEvent(new CustomEvent("mynt:ambient-state", { detail: { isPlaying: false, type: currentType } }));
            return;
        }

        if (masterGain) {
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
            masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
            setTimeout(() => {
                cleanupNodes();
                isPlaying = false;
                document.dispatchEvent(new CustomEvent("mynt:ambient-state", { detail: { isPlaying: false, type: currentType } }));
            }, 520);
        } else {
            cleanupNodes();
            isPlaying = false;
            document.dispatchEvent(new CustomEvent("mynt:ambient-state", { detail: { isPlaying: false, type: currentType } }));
        }
    }

    function play(type = currentType) {
        cleanupNodes();
        const ctx = getAudioContext();
        if (!ctx) return;

        currentType = type;
        localStorage.setItem("myntAmbientType", type);

        const targetVol = parseFloat(localStorage.getItem("myntAmbientVolume") || "0.5");
        if (masterGain) {
            masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
            masterGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.8);
        }

        if (type === "rain") startRain(ctx);
        else if (type === "ocean") startOcean(ctx);
        else if (type === "whitenoise") startWhiteNoise(ctx);
        else if (type === "campfire") startCampfire(ctx);

        isPlaying = true;
        document.dispatchEvent(new CustomEvent("mynt:ambient-state", { detail: { isPlaying: true, type: currentType } }));
    }

    function setVolume(vol) {
        const clamped = Math.max(0, Math.min(1, parseFloat(vol)));
        localStorage.setItem("myntAmbientVolume", String(clamped));
        if (masterGain && audioCtx) {
            masterGain.gain.setValueAtTime(clamped, audioCtx.currentTime);
        }
    }

    function toggle(type) {
        if (isPlaying) stop();
        else play(type || currentType);
    }

    // Expose global API
    globalThis.myntAmbientAudio = {
        play,
        stop,
        toggle,
        setVolume,
        getType: () => currentType,
        isPlaying: () => isPlaying
    };
})();
