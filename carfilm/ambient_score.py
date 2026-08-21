# -*- coding: utf-8 -*-
"""
车拍短片的环境配乐合成器
---------------------------------------------------------
用纯 numpy 合成一段安静的北欧感 pad 音乐，避免引入外部音频素材。

声音构成：
1) 和弦 pad：每个音由 3 个轻微失谐的正弦叠加，慢起慢落，和弦之间交叉淡化
2) 低频衬底：根音低八度的正弦，给画面一点重量
3) 空气声：经过一阶低通的白噪声，音量极低，用来填补数字寂静
4) 混响：与指数衰减噪声做 FFT 卷积，得到一个廉价但自然的空间感

对外只暴露 render_score()，输出 (samples, 2) 的 float32 立体声数组。
"""

import numpy as np

SAMPLE_RATE = 44100

# A 小调：i - VI - III - VII，北欧民谣里最常见的忧郁又温暖的走向
CHORD_PROGRESSION = [
    ("Am", [57, 60, 64, 69, 72]),
    ("F", [53, 57, 60, 65, 69]),
    ("C", [48, 55, 60, 64, 67]),
    ("G", [55, 59, 62, 67, 71]),
    ("Am", [57, 60, 64, 69, 76]),
    ("F", [53, 60, 65, 69, 77]),
]

DETUNE_CENTS = (-7.0, 0.0, 6.0)


def midi_to_hz(note):
    """MIDI 音高转频率。"""
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def fast_lowpass(signal, cutoff_hz, sample_rate=SAMPLE_RATE):
    """频域低通：一阶 RC 的频响，比逐样本递归快得多。"""
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.shape[0], d=1.0 / sample_rate)
    # 一阶 RC 响应，避免生硬的砖墙滤波
    response = 1.0 / np.sqrt(1.0 + (freqs / cutoff_hz) ** 2)
    return np.fft.irfft(spectrum * response, n=signal.shape[0])


def chord_envelope(length, attack, release):
    """慢起慢落的包络，让和弦像呼吸一样进出。"""
    env = np.ones(length)
    a = min(int(attack * SAMPLE_RATE), length // 2)
    r = min(int(release * SAMPLE_RATE), length // 2)
    if a > 0:
        ramp = np.linspace(0.0, 1.0, a)
        env[:a] = ramp * ramp * (3.0 - 2.0 * ramp)
    if r > 0:
        ramp = np.linspace(1.0, 0.0, r)
        env[-r:] = ramp * ramp * (3.0 - 2.0 * ramp)
    return env


def render_pad(duration, seed=7):
    """铺满整段时长的和弦 pad。"""
    rng = np.random.default_rng(seed)
    total = int(duration * SAMPLE_RATE)
    left = np.zeros(total)
    right = np.zeros(total)

    chords = CHORD_PROGRESSION
    chord_len = duration / len(chords)
    overlap = min(2.6, chord_len * 0.55)

    for index, (_, notes) in enumerate(chords):
        start = max(0.0, index * chord_len - overlap * 0.5)
        end = min(duration, (index + 1) * chord_len + overlap * 0.5)
        seg_start = int(start * SAMPLE_RATE)
        seg_len = int((end - start) * SAMPLE_RATE)
        if seg_len <= 0:
            continue

        t = np.arange(seg_len) / SAMPLE_RATE
        env = chord_envelope(seg_len, overlap, overlap)
        voice_l = np.zeros(seg_len)
        voice_r = np.zeros(seg_len)

        for voice_index, note in enumerate(notes):
            base = midi_to_hz(note)
            # 高音轻、低音重，避免高频堆叠刺耳
            weight = 1.0 / (1.0 + voice_index * 0.55)
            # 每个声部在立体声里稍微错开
            pan = 0.5 + 0.32 * np.sin(voice_index * 1.7 + index * 0.6)
            for cents in DETUNE_CENTS:
                freq = base * (2.0 ** (cents / 1200.0))
                phase = rng.uniform(0.0, 2.0 * np.pi)
                # 极慢的振幅颤动，让 pad 不至于是死板的持续音
                tremolo = 1.0 + 0.06 * np.sin(
                    2.0 * np.pi * rng.uniform(0.05, 0.13) * t + phase
                )
                osc = np.sin(2.0 * np.pi * freq * t + phase) * tremolo * weight
                voice_l += osc * (1.0 - pan)
                voice_r += osc * pan

        left[seg_start:seg_start + seg_len] += voice_l * env
        right[seg_start:seg_start + seg_len] += voice_r * env

    return left, right


def render_sub(duration, seed=11):
    """低频衬底，跟随和弦根音走。"""
    rng = np.random.default_rng(seed)
    total = int(duration * SAMPLE_RATE)
    out = np.zeros(total)
    chords = CHORD_PROGRESSION
    chord_len = duration / len(chords)

    for index, (_, notes) in enumerate(chords):
        root = notes[0] - 12
        start = index * chord_len
        end = min(duration, (index + 1) * chord_len + 1.5)
        seg_start = int(start * SAMPLE_RATE)
        seg_len = int((end - start) * SAMPLE_RATE)
        if seg_len <= 0:
            continue
        t = np.arange(seg_len) / SAMPLE_RATE
        phase = rng.uniform(0.0, 2.0 * np.pi)
        tone = np.sin(2.0 * np.pi * midi_to_hz(root) * t + phase)
        out[seg_start:seg_start + seg_len] += tone * chord_envelope(seg_len, 1.8, 1.8)

    return out * 0.5


def render_air(duration, seed=23):
    """低通白噪声，模拟室内与街道的空气感。"""
    rng = np.random.default_rng(seed)
    total = int(duration * SAMPLE_RATE)
    noise = rng.normal(0.0, 1.0, total)
    filtered = fast_lowpass(noise, 900.0)
    # 缓慢起伏，像远处的风
    t = np.arange(total) / SAMPLE_RATE
    swell = 0.6 + 0.4 * np.sin(2.0 * np.pi * 0.017 * t)
    return filtered * swell


def make_reverb_impulse(decay=2.4, seed=31):
    """指数衰减噪声当作简易混响脉冲。"""
    rng = np.random.default_rng(seed)
    length = int(decay * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    envelope = np.exp(-t * (5.0 / decay))
    impulse = rng.normal(0.0, 1.0, length) * envelope
    impulse = fast_lowpass(impulse, 3500.0)
    # 前 15ms 留白，避免糊住直达声
    impulse[: int(0.015 * SAMPLE_RATE)] = 0.0
    return impulse / (np.abs(impulse).sum() + 1e-9)


def convolve_fft(signal, impulse):
    """FFT 卷积，长音频下比 np.convolve 快几个数量级。"""
    n = signal.shape[0] + impulse.shape[0] - 1
    size = 1 << (n - 1).bit_length()
    spectrum = np.fft.rfft(signal, size) * np.fft.rfft(impulse, size)
    return np.fft.irfft(spectrum, size)[: signal.shape[0]]


def normalize(stereo, peak=0.72):
    """峰值归一化，留出足够的余量。"""
    maximum = np.max(np.abs(stereo))
    if maximum < 1e-9:
        return stereo
    return stereo * (peak / maximum)


def apply_fades(stereo, fade_in=2.5, fade_out=4.0):
    """整段音乐的淡入淡出。"""
    total = stereo.shape[0]
    a = min(int(fade_in * SAMPLE_RATE), total // 2)
    r = min(int(fade_out * SAMPLE_RATE), total // 2)
    if a > 0:
        stereo[:a] *= np.linspace(0.0, 1.0, a)[:, None] ** 1.6
    if r > 0:
        stereo[-r:] *= np.linspace(1.0, 0.0, r)[:, None] ** 1.6
    return stereo


def render_score(duration):
    """合成整段配乐，返回 float32 立体声数组。"""
    pad_l, pad_r = render_pad(duration)
    sub = render_sub(duration)
    air = render_air(duration)

    pad_l = fast_lowpass(pad_l, 2200.0)
    pad_r = fast_lowpass(pad_r, 2200.0)

    dry_l = pad_l * 0.55 + sub * 0.30 + air * 0.010
    dry_r = pad_r * 0.55 + sub * 0.30 + air * 0.010

    impulse = make_reverb_impulse()
    wet_l = convolve_fft(dry_l, impulse)
    wet_r = convolve_fft(dry_r, impulse)

    mix_l = dry_l * 0.72 + wet_l * 0.55
    mix_r = dry_r * 0.72 + wet_r * 0.55

    stereo = np.stack([mix_l, mix_r], axis=1)
    stereo = normalize(stereo)
    return apply_fades(stereo).astype(np.float32)


def write_wav(path, stereo, sample_rate=SAMPLE_RATE):
    """写 16bit PCM WAV，不依赖第三方库。"""
    import wave

    pcm = np.clip(stereo, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return path
