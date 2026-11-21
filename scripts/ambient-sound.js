/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */
(function () {
    'use strict';
    const types = Object.freeze(['rain', 'thunder', 'ocean', 'stream', 'wind', 'forest', 'night', 'campfire', 'whitenoise', 'pink', 'brown']);
    // Balance the volume-1 Chromium baseline before the unchanged master limiter.
    const typeGains = Object.freeze({
        rain: 1, thunder: 1, ocean: .45, stream: .8, wind: 1.1,
        forest: 3.5, night: 3, campfire: .5, whitenoise: .4, pink: .4, brown: .35
    });
    const buffers = new Map(), voices = new Set();
    let audioCtx, masterGain, limiter, currentVoice, playRevision = 0, isPlaying = false;
    const savedType = localStorage.getItem('myntAmbientType');
    let currentType = types.includes(savedType) ? savedType : 'rain';
    // While stopped the panel/float choice lives only in storage; read it so state and toggle follow it.
    const storedType = () => { try { const v = localStorage.getItem('myntAmbientType'); return types.includes(v) ? v : currentType; } catch (_) { return currentType; } };
    const random = (min, max) => min + Math.random() * (max - min);
    function volume() {
        const raw = localStorage.getItem('myntAmbientVolume'), value = raw === null ? .5 : Number(raw);
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;
    }
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        return audioCtx;
    }
    function output(ctx) {
        if (masterGain) return;
        masterGain = ctx.createGain(); masterGain.gain.setValueAtTime(volume(), ctx.currentTime);
        limiter = ctx.createDynamicsCompressor();
        for (const [key, value] of Object.entries({ threshold: -12, knee: 6, ratio: 20, attack: .003, release: .25 })) limiter[key].setValueAtTime(value, ctx.currentTime);
        masterGain.connect(limiter); limiter.connect(ctx.destination);
    }
    function noise(ctx, colour) {
        if (buffers.has(colour)) return buffers.get(colour);
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 12), ctx.sampleRate), data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0, sum = 0;
        for (let i = 0; i < data.length; i++) {
            const white = random(-1, 1);
            if (colour === 'pink') {
                b0 = .99886 * b0 + white * .0555179; b1 = .99332 * b1 + white * .0750759;
                b2 = .969 * b2 + white * .153852; b3 = .8665 * b3 + white * .3104856;
                b4 = .55 * b4 + white * .5329522; b5 = -.7616 * b5 - white * .016898;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11;
                b6 = white * .115926;
            } else if (colour === 'brown') {
                brown = (brown + .02 * white) / 1.02; data[i] = brown * 3.5;
            } else data[i] = white * .5;
            sum += data[i];
        }
        const mean = sum / data.length;
        for (let i = 0; i < data.length; i++) data[i] = Math.max(-.9, Math.min(.9, data[i] - mean));
        // Crossfade the tail into the first 100ms; looping resumes after that head.
        const overlap = Math.floor(ctx.sampleRate * .1);
        for (let i = 0; i < overlap; i++) {
            const mix = i / (overlap - 1), tail = data.length - overlap + i;
            data[tail] = data[tail] * (1 - mix) + data[i] * mix;
        }
        buffers.set(colour, buffer); return buffer;
    }
    function track(voice, node) { voice.nodes.add(node); return node; }
    function release(voice, nodes) {
        for (const node of nodes) {
            node.onended = null;
            try { node.stop?.(); } catch (_) { /* already ended */ }
            node.disconnect(); voice.nodes.delete(node);
        }
    }
    function dispose(voice) {
        clearTimeout(voice.timer); clearTimeout(voice.fadeTimer);
        release(voice, [...voice.nodes]); voices.delete(voice);
        if (!voices.size && masterGain) { masterGain.disconnect(); limiter.disconnect(); masterGain = limiter = null; }
    }
    function gainAt(voice, now) {
        const f = voice.fade;
        return f ? f.from + (f.to - f.from) * Math.max(0, Math.min(1, (now - f.start) / (f.end - f.start))) : 0;
    }
    function fade(voice, target, seconds) {
        const now = audioCtx.currentTime, from = gainAt(voice, now);
        voice.bus.gain.cancelScheduledValues(now); voice.bus.gain.setValueAtTime(from, now);
        voice.bus.gain.linearRampToValueAtTime(target, now + seconds);
        voice.fade = { from, to: target, start: now, end: now + seconds };
    }
    function retire(voice, seconds) {
        clearTimeout(voice.timer); clearTimeout(voice.fadeTimer);
        if (gainAt(voice, audioCtx.currentTime) === 0) { dispose(voice); return; }
        fade(voice, 0, seconds); voice.fadeTimer = setTimeout(() => dispose(voice), seconds * 1000 + 20);
    }
    function filter(voice, type, hz, q = .7, at = audioCtx.currentTime) {
        const node = track(voice, audioCtx.createBiquadFilter()); node.type = type;
        node.frequency.setValueAtTime(hz, at); node.Q.setValueAtTime(q, at); return node;
    }
    function layer(voice, colour, level, kind = 'lowpass', hz = 6000, q = .7) {
        const source = track(voice, audioCtx.createBufferSource()), tone = filter(voice, kind, hz, q), amp = track(voice, audioCtx.createGain());
        source.buffer = noise(audioCtx, colour); source.loop = true; source.loopStart = .1; source.loopEnd = source.buffer.duration;
        amp.gain.setValueAtTime(level, audioCtx.currentTime); source.connect(tone); tone.connect(amp); amp.connect(voice.bus);
        source.start(audioCtx.currentTime, random(.1, source.buffer.duration - .1)); return { source, tone, amp };
    }
    function envelope(param, at, duration, peak, attack) {
        param.setValueAtTime(0, at); param.linearRampToValueAtTime(peak, at + attack); param.linearRampToValueAtTime(0, at + duration);
    }
    function burst(voice, at, duration, level, kind, hz, attack = .003, colour = 'white', q = .7) {
        const source = track(voice, audioCtx.createBufferSource()), tone = filter(voice, kind, hz, q, at), amp = track(voice, audioCtx.createGain());
        source.buffer = noise(audioCtx, colour); envelope(amp.gain, at, duration, level, attack);
        source.connect(tone); tone.connect(amp); amp.connect(voice.bus); source.onended = () => release(voice, [source, tone, amp]);
        source.start(at, random(.1, 4)); source.stop(at + duration); return tone;
    }
    function chirp(voice, at, duration, hz, endHz, level) {
        const source = track(voice, audioCtx.createOscillator()), amp = track(voice, audioCtx.createGain());
        source.type = 'sine'; source.frequency.setValueAtTime(hz, at); source.frequency.exponentialRampToValueAtTime(endHz, at + duration);
        envelope(amp.gain, at, duration, level, Math.min(.012, duration / 3));
        source.connect(amp); amp.connect(voice.bus); source.onended = () => release(voice, [source, amp]);
        source.start(at); source.stop(at + duration);
    }
    function every(voice, first, schedule) { voice.events.push({ next: audioCtx.currentTime + first, schedule }); }
    function drift(voice, bed, low, high, minSeconds = 3, maxSeconds = 7) {
        every(voice, 0, at => {
            const duration = random(minSeconds, maxSeconds); bed.amp.gain.linearRampToValueAtTime(random(low, high), at + duration); return duration;
        });
    }
    function rain(voice) {
        const bed = layer(voice, 'pink', .62, 'bandpass', 1800, .45);
        layer(voice, 'white', .09, 'highpass', 6500); drift(voice, bed, .43, .75);
        every(voice, .05, at => {
            burst(voice, at, random(.012, .045), random(.04, .13), 'bandpass', random(1800, 6000)); return random(.045, .24);
        });
    }
    function synthesize(voice, type) {
        if (type === 'rain' || type === 'thunder') {
            rain(voice);
            if (type === 'thunder') every(voice, random(4, 9), at => {
                const duration = random(4, 7), tone = burst(voice, at, duration, random(.8, 1.3), 'lowpass', 180, 1.1, 'brown');
                tone.frequency.linearRampToValueAtTime(65, at + duration); return random(13, 28);
            });
        } else if (type === 'ocean') {
            const surf = layer(voice, 'brown', .4, 'lowpass', 450), foam = layer(voice, 'pink', .12, 'bandpass', 1600, .45);
            layer(voice, 'white', .035, 'lowpass', 4500);
            every(voice, 0, at => {
                const duration = random(6, 12), crest = at + duration * .45;
                for (const [param, low, high] of [[surf.amp.gain, .25, random(1.1, 1.6)], [surf.tone.frequency, 250, random(1200, 2200)], [foam.amp.gain, .08, random(.35, .55)]]) {
                    param.setValueAtTime(low, at); param.linearRampToValueAtTime(high, crest); param.linearRampToValueAtTime(low, at + duration);
                }
                return duration;
            });
        } else if (type === 'campfire') {
            const bed = layer(voice, 'brown', .7, 'lowpass', 420); drift(voice, bed, .5, .9, 2, 5);
            layer(voice, 'pink', .09, 'bandpass', 1300);
            every(voice, .02, at => {
                burst(voice, at, random(.018, .1), random(.2, .6), 'highpass', random(1200, 2600));
                if (Math.random() < .22) for (let i = 1; i <= 3; i++) burst(voice, at + i * .025, .025, random(.12, .35), 'highpass', 2200);
                return random(.07, .6);
            });
        } else if (type === 'stream') {
            const bed = layer(voice, 'pink', .65, 'bandpass', 2200, .5); drift(voice, bed, .5, .75, 2, 4); layer(voice, 'brown', .25, 'lowpass', 700);
            every(voice, .02, at => {
                const tone = burst(voice, at, random(.04, .13), random(.12, .3), 'bandpass', random(600, 2400), .01, 'white', 5);
                tone.frequency.exponentialRampToValueAtTime(random(400, 900), at + .08); return random(.025, .12);
            });
        } else if (type === 'wind' || type === 'forest') {
            const bed = layer(voice, 'pink', type === 'wind' ? .7 : .15, 'bandpass', 500, .55);
            every(voice, 0, at => {
                const duration = random(4, 9), level = type === 'wind' ? random(.35, .9) : random(.08, .18);
                bed.amp.gain.linearRampToValueAtTime(level, at + duration); bed.tone.frequency.linearRampToValueAtTime(random(300, 1400), at + duration); return duration;
            });
            if (type === 'forest') every(voice, random(.3, 1.5), at => {
                const hz = random(1800, 3600), count = Math.floor(random(2, 5));
                for (let i = 0; i < count; i++) chirp(voice, at + i * .16, random(.08, .14), hz, hz * random(1.2, 1.8), random(.045, .09));
                return random(1.6, 5);
            });
        } else if (type === 'night') {
            layer(voice, 'pink', .08, 'lowpass', 1700);
            every(voice, .1, at => {
                const hz = random(4200, 4900), count = Math.floor(random(3, 6));
                for (let i = 0; i < count; i++) chirp(voice, at + i * .07, .035, hz, hz * .98, random(.035, .065));
                return random(.65, 1.5);
            });
        } else if (type === 'whitenoise') layer(voice, 'white', .65, 'lowpass', 8500);
        else if (type === 'pink') layer(voice, 'pink', .8, 'lowpass', 14000);
        else if (type === 'brown') layer(voice, 'brown', 1.2, 'lowpass', 2000);
    }
    function schedule(voice) {
        const now = audioCtx.currentTime;
        for (const event of voice.events) {
            // Skip missed events in a throttled tab rather than replaying the backlog.
            event.next = Math.max(event.next, now + .015);
            while (event.next < now + .35) event.next += event.schedule(event.next);
        }
        if (voice.events.length) voice.timer = setTimeout(() => schedule(voice), 100);
    }
    function notify(error = false) {
        document.dispatchEvent(new CustomEvent('mynt:ambient-state', { detail: { isPlaying, type: currentType, ...(error ? { error: true } : {}) } }));
    }
    function stop(immediate = false) {
        playRevision++; currentVoice = null; isPlaying = false;
        for (const voice of [...voices]) immediate ? dispose(voice) : retire(voice, .3);
        notify();
    }
    async function play(type = currentType, gate) {
        if (!types.includes(type)) return false;
        const revision = ++playRevision; let voice;
        try {
            gate?.(); const ctx = getAudioContext(); if (!ctx) throw Error('Audio unavailable');
            if (ctx.state !== 'running') await ctx.resume();
            if (revision !== playRevision) return false;
            gate?.(); if (ctx.state !== 'running') throw Error('Browser gesture required');
            if (currentVoice && type === currentType && isPlaying) return true;
            localStorage.setItem('myntAmbientType', type); output(ctx);
            voice = { nodes: new Set(), events: [], timer: null, fadeTimer: null };
            voice.bus = track(voice, ctx.createGain()); voice.bus.gain.setValueAtTime(0, ctx.currentTime); voice.bus.connect(masterGain); voices.add(voice);
            synthesize(voice, type); schedule(voice);
            for (const previous of [...voices]) if (previous !== voice && previous.fade?.to !== 0) retire(previous, .45);
            fade(voice, typeGains[type], .45); currentVoice = voice; currentType = type; isPlaying = true; notify(); return true;
        } catch (error) {
            if (voice) dispose(voice);
            if (revision !== playRevision) return false;
            if (!currentVoice) { isPlaying = false; notify(true); }
            if (gate) throw error;
            return false;
        }
    }
    function setVolume(value) {
        const parsed = Number.parseFloat(value); if (!Number.isFinite(parsed)) return;
        const clamped = Math.max(0, Math.min(1, parsed)); localStorage.setItem('myntAmbientVolume', String(clamped));
        if (masterGain) {
            masterGain.gain.cancelScheduledValues(audioCtx.currentTime); masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
            masterGain.gain.linearRampToValueAtTime(clamped, audioCtx.currentTime + .03);
        }
    }
    globalThis.myntAmbientAudio = {
        types, play, stop, setVolume,
        getState: () => ({ type: isPlaying ? currentType : storedType(), playing: isPlaying && audioCtx?.state === 'running', volume: volume() }),
        async playRemote(type, gate) {
            if (!types.includes(type) || typeof gate !== 'function') throw Error('Invalid ambient operation');
            if (!await play(type, gate)) throw Error('Browser gesture required');
        },
        toggle: type => isPlaying ? stop() : play(type || storedType()),
        getType: () => currentType, isPlaying: () => isPlaying
    };
    window.addEventListener('pagehide', () => stop(true));
})();
