"""
Audio Validation Module for Engine Diagnostics
Validates if uploaded audio has engine-like characteristics
"""

import numpy as np
import librosa
from scipy import signal
from scipy.stats import kurtosis, skew

class AudioValidator:
    """Validates if audio file contains engine-like sounds"""
    
    def __init__(self, 
                 sample_rate=22050,
                 duration=5,
                 freq_range=(50, 4000),
                 min_energy_threshold=0.01,
                 max_silence_ratio=0.5):
        """
        Initialize validator with engine sound characteristics
        
        Args:
            sample_rate: Audio sample rate
            duration: Expected audio duration in seconds
            freq_range: Expected frequency range for engine sounds (Hz)
            min_energy_threshold: Minimum energy level
            max_silence_ratio: Maximum allowed silence ratio
        """
        self.sample_rate = sample_rate
        self.duration = duration
        self.freq_range = freq_range
        self.min_energy_threshold = min_energy_threshold
        self.max_silence_ratio = max_silence_ratio
    
    def validate(self, audio_path):
        """
        Validate if audio file contains engine-like sounds
        
        Returns:
            tuple: (is_valid, confidence, reason)
                is_valid: Boolean indicating if audio is engine-like
                confidence: Float 0-1 indicating confidence
                reason: String explaining validation result
        """
        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=self.sample_rate, duration=self.duration)
            
            # Run all validation checks
            checks = {
                'duration': self._check_duration(y, sr),
                'silence': self._check_silence(y),
                'frequency': self._check_frequency_range(y, sr),
                'periodicity': self._check_periodicity(y, sr),
                'energy': self._check_energy_distribution(y),
                'spectral': self._check_spectral_characteristics(y, sr),
                'music': self._check_not_music(y, sr)
            }
            
            # Calculate overall confidence
            passed_checks = sum(1 for v in checks.values() if v['passed'])
            total_checks = len(checks)
            confidence = passed_checks / total_checks
            
            # Determine if valid (need at least 5 out of 7 checks)
            is_valid = passed_checks >= 5
            
            # Generate reason
            if is_valid:
                reason = f"Audio validated as engine sound ({passed_checks}/{total_checks} checks passed)"
            else:
                failed = [k for k, v in checks.items() if not v['passed']]
                reason = f"Audio doesn't match engine characteristics. Failed: {', '.join(failed)}"
            
            return is_valid, confidence, reason, checks
            
        except Exception as e:
            return False, 0.0, f"Error processing audio: {str(e)}", {}
    
    def _check_duration(self, y, sr):
        """Check if audio has sufficient duration"""
        duration = len(y) / sr
        passed = duration >= self.duration * 0.8  # Allow 80% of target duration
        return {
            'passed': passed,
            'value': duration,
            'message': f"Duration: {duration:.2f}s (expected ~{self.duration}s)"
        }
    
    def _check_silence(self, y):
        """Check if audio is not mostly silent"""
        # Calculate RMS energy
        rms = librosa.feature.rms(y=y)[0]
        silence_threshold = np.max(rms) * 0.1
        silence_ratio = np.sum(rms < silence_threshold) / len(rms)
        
        passed = silence_ratio < self.max_silence_ratio
        return {
            'passed': passed,
            'value': silence_ratio,
            'message': f"Silence ratio: {silence_ratio:.2%} (max {self.max_silence_ratio:.0%})"
        }
    
    def _check_frequency_range(self, y, sr):
        """Check if dominant frequencies are in engine range"""
        # Compute FFT
        fft = np.fft.fft(y)
        frequencies = np.fft.fftfreq(len(fft), 1/sr)
        magnitude = np.abs(fft)
        
        # Focus on positive frequencies
        positive_freq_idx = frequencies > 0
        frequencies = frequencies[positive_freq_idx]
        magnitude = magnitude[positive_freq_idx]
        
        # Find dominant frequencies (top 80% of energy)
        energy_threshold = np.percentile(magnitude, 80)
        dominant_freqs = frequencies[magnitude > energy_threshold]
        
        # Check if dominant frequencies are in engine range
        in_range = np.sum((dominant_freqs >= self.freq_range[0]) & 
                         (dominant_freqs <= self.freq_range[1]))
        total_dominant = len(dominant_freqs)
        
        ratio = in_range / max(total_dominant, 1)
        passed = ratio > 0.6  # At least 60% of dominant frequencies in range
        
        return {
            'passed': passed,
            'value': ratio,
            'message': f"Frequency match: {ratio:.1%} in {self.freq_range[0]}-{self.freq_range[1]} Hz"
        }
    
    def _check_periodicity(self, y, sr):
        """Check if audio has periodic/repetitive patterns (engine cycling)"""
        # Use autocorrelation to detect periodicity
        autocorr = librosa.autocorrelate(y)
        
        # Find peaks in autocorrelation (excluding the first peak at lag 0)
        peaks, properties = signal.find_peaks(autocorr[1:], prominence=0.1*np.max(autocorr))
        
        # Engine sounds should have some periodicity
        passed = len(peaks) >= 3  # At least 3 cycles detected
        
        # Calculate average period if peaks found
        avg_period = np.mean(np.diff(peaks)) / sr if len(peaks) > 1 else 0
        frequency = 1 / avg_period if avg_period > 0 else 0
        
        return {
            'passed': passed,
            'value': frequency,
            'message': f"Periodicity: {len(peaks)} cycles detected (~{frequency:.1f} Hz)"
        }
    
    def _check_energy_distribution(self, y):
        """Check if energy distribution is consistent (not random noise)"""
        # Calculate short-time energy
        frame_length = int(0.1 * self.sample_rate)  # 100ms frames
        hop_length = frame_length // 2
        
        energy = []
        for i in range(0, len(y) - frame_length, hop_length):
            frame = y[i:i+frame_length]
            energy.append(np.sum(frame**2))
        
        energy = np.array(energy)
        
        # Check if energy is above minimum threshold
        mean_energy = np.mean(energy)
        passed = mean_energy > self.min_energy_threshold
        
        # Check consistency (low variance = consistent engine sound)
        std_energy = np.std(energy) / (mean_energy + 1e-6)
        
        return {
            'passed': passed,
            'value': mean_energy,
            'message': f"Energy: {mean_energy:.4f} (min {self.min_energy_threshold}), CV: {std_energy:.2f}"
        }
    
    def _check_spectral_characteristics(self, y, sr):
        """Check spectral characteristics typical of engine sounds"""
        # Compute mel spectrogram
        S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)
        S_db = librosa.power_to_db(S, ref=np.max)
        
        # Engine sounds have:
        # 1. Strong low-frequency components
        # 2. Harmonic structure
        # 3. Relatively stable spectral content
        
        # Check low-frequency energy (below 500 Hz)
        mel_freqs = librosa.mel_frequencies(n_mels=128, fmax=8000)
        low_freq_idx = mel_freqs < 500
        low_freq_energy = np.mean(S_db[low_freq_idx, :])
        total_energy = np.mean(S_db)
        
        low_freq_ratio = (low_freq_energy - np.min(S_db)) / (total_energy - np.min(S_db) + 1e-6)
        
        # Check spectral stability (low variance over time)
        spectral_variance = np.mean(np.var(S_db, axis=1))
        
        passed = low_freq_ratio > 0.3 and spectral_variance < 100
        
        return {
            'passed': passed,
            'value': low_freq_ratio,
            'message': f"Spectral: {low_freq_ratio:.2%} low-freq energy, variance: {spectral_variance:.1f}"
        }
    
    def _check_not_music(self, y, sr):
        """Check if audio is NOT music (music has more variety)"""
        # Extract chroma features (music has clear pitch/melody)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        
        # Music typically has:
        # 1. Clear tonal structure (high chroma values)
        # 2. Changing pitch patterns
        
        # Calculate chroma variance (music changes more than engine drones)
        chroma_variance = np.mean(np.var(chroma, axis=1))
        
        # Calculate spectral contrast (music has higher contrast)
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        mean_contrast = np.mean(contrast)
        
        # Engine sounds should have LOW variance and LOW contrast
        # Music has HIGH variance and HIGH contrast
        passed = chroma_variance < 0.05 and mean_contrast < 30
        
        return {
            'passed': passed,
            'value': chroma_variance,
            'message': f"Music check: chroma_var={chroma_variance:.3f}, contrast={mean_contrast:.1f}"
        }


def validate_engine_sound(audio_path, verbose=False):
    """
    Convenience function to validate engine sound
    
    Args:
        audio_path: Path to audio file
        verbose: If True, print detailed check results
        
    Returns:
        tuple: (is_valid, confidence, reason)
    """
    validator = AudioValidator()
    is_valid, confidence, reason, checks = validator.validate(audio_path)
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"Audio Validation Report: {audio_path}")
        print(f"{'='*60}")
        print(f"Result: {'✓ VALID' if is_valid else '✗ INVALID'}")
        print(f"Confidence: {confidence:.1%}")
        print(f"Reason: {reason}")
        print(f"\n{'Individual Checks:'}")
        for check_name, check_result in checks.items():
            status = '✓' if check_result['passed'] else '✗'
            print(f"  {status} {check_name.capitalize()}: {check_result['message']}")
        print(f"{'='*60}\n")
    
    return is_valid, confidence, reason