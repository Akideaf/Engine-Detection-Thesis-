import os
import json
import numpy as np
import librosa
import tensorflow as tf
from flask import Flask, request, render_template, jsonify
from skimage.transform import resize
import tempfile
import atexit
import time
from threading import Thread
from audio_validator import validate_engine_sound

app = Flask(__name__)

# --- CONFIGURATION ---
MODEL_PATH = "mobile_net_RGB_FULL_UNFREEZE.keras"
CLASS_MAP_PATH = "class_map_RGB.json"
IMG_SIZE = (224, 224)
SAMPLE_RATE = 22050
DURATION = 5

# Audio validation settings
ENABLE_VALIDATION = True  # Set to False to disable validation
MIN_CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence to accept audio

# Use system temp directory instead of persistent uploads folder
UPLOAD_FOLDER = tempfile.mkdtemp(prefix="engine_audio_")
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Allowed audio extensions
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'wma'}

# Load Model and Classes
model = tf.keras.models.load_model(MODEL_PATH)
with open(CLASS_MAP_PATH, 'r') as f:
    class_map = json.load(f)
classes = [k for k, v in sorted(class_map.items(), key=lambda x: x[1])]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def cleanup_old_files(folder, max_age_seconds=3600):
    """Remove files older than max_age_seconds (default 1 hour)"""
    if not os.path.exists(folder):
        return
    
    current_time = time.time()
    for filename in os.listdir(folder):
        filepath = os.path.join(folder, filename)
        try:
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.remove(filepath)
                    print(f"Cleaned up old file: {filename}")
        except Exception as e:
            print(f"Error cleaning up {filename}: {e}")

def scheduled_cleanup():
    """Run cleanup every 30 minutes"""
    while True:
        time.sleep(1800)  # 30 minutes
        cleanup_old_files(UPLOAD_FOLDER, max_age_seconds=3600)

# Start background cleanup thread
cleanup_thread = Thread(target=scheduled_cleanup, daemon=True)
cleanup_thread.start()

def cleanup_temp_folder():
    """Clean up temp folder on app shutdown"""
    try:
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                try:
                    os.remove(filepath)
                except:
                    pass
            os.rmdir(UPLOAD_FOLDER)
            print(f"Cleaned up temp folder: {UPLOAD_FOLDER}")
    except Exception as e:
        print(f"Error during cleanup: {e}")

# Register cleanup on exit
atexit.register(cleanup_temp_folder)

def prepare_rgb_image(file_path, start_time=0):
    """
    Exact 3-Channel RGB logic from your Colab
    
    Args:
        file_path: Path to audio file
        start_time: Start time in seconds for extracting 5-second segment
    """
    # Load audio with offset for segment selection
    y, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION, offset=start_time)
    
    # Pad/Trim to exactly 5 seconds
    target_len = SAMPLE_RATE * DURATION
    if len(y) < target_len:
        # Pad if needed
        y = np.tile(y, int(np.ceil(target_len/len(y))))[:target_len]
    else:
        # Trim to exact length
        y = y[:target_len]

    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)

    # Ch1: Log-Mel
    S_db = librosa.power_to_db(S, ref=np.max)
    S_db_norm = (S_db - S_db.min()) / (S_db.max() - S_db.min() + 1e-6)

    # Ch2: PCEN
    S_pcen = librosa.pcen(S * (2**31), sr=sr, gain=0.8, bias=10, power=0.25, time_constant=0.400, eps=1e-6)
    S_pcen_norm = (S_pcen - S_pcen.min()) / (S_pcen.max() - S_pcen.min() + 1e-6)

    # Ch3: Delta
    S_delta = librosa.feature.delta(S_db)
    S_delta_norm = (S_delta - S_delta.min()) / (S_delta.max() - S_delta.min() + 1e-6)

    ch1 = resize(S_db_norm, IMG_SIZE, anti_aliasing=True)
    ch2 = resize(S_pcen_norm, IMG_SIZE, anti_aliasing=True)
    ch3 = resize(S_delta_norm, IMG_SIZE, anti_aliasing=True)

    img_rgb = np.dstack((ch1, ch2, ch3)).astype(np.float32)
    return img_rgb[np.newaxis, ...]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    filepath = None
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                "error": "invalid_format",
                "message": "Invalid file format.",
                "details": f"Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS)).upper()}",
                "suggestion": "Please upload an audio file in one of the supported formats."
            }), 400

        # Get start time for segment selection (default 0)
        start_time = float(request.form.get('start_time', 0))

        # Generate unique filename to avoid conflicts
        timestamp = int(time.time() * 1000)
        original_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"audio_{timestamp}.{original_ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        file.save(filepath)

        # AUDIO VALIDATION - Check if it's engine sound
        if ENABLE_VALIDATION:
            print(f"Validating audio: {file.filename}")
            is_valid, confidence, reason = validate_engine_sound(filepath, verbose=True)
            
            if not is_valid or confidence < MIN_CONFIDENCE_THRESHOLD:
                return jsonify({
                    "error": "invalid_audio",
                    "message": "The uploaded audio doesn't appear to be an engine sound.",
                    "details": reason,
                    "validation_confidence": float(confidence),
                    "suggestion": "Please upload an audio file containing engine sounds (50-4000 Hz, continuous patterns)."
                }), 400
            
            print(f"✓ Audio validated: {confidence:.1%} confidence")

        # Predict - pass start_time for segment extraction
        print(f"Analyzing segment: {start_time:.2f}s - {start_time + DURATION:.2f}s")
        img = prepare_rgb_image(filepath, start_time=start_time)
        prediction = model.predict(img)
        result_idx = np.argmax(prediction)
        pred_confidence = np.max(prediction) * 100
        
        # ===== GENERATE SPECTROGRAM =====
        import matplotlib
        matplotlib.use('Agg')  # Non-interactive backend
        import matplotlib.pyplot as plt
        import librosa.display
        
        # Create spectrograms directory if it doesn't exist
        spectrograms_dir = os.path.join('static', 'spectrograms')
        os.makedirs(spectrograms_dir, exist_ok=True)
        
        # Load audio for spectrogram
        y, sr = librosa.load(filepath, sr=SAMPLE_RATE, duration=DURATION, offset=start_time)
        
        # Generate spectrogram
        D = librosa.stft(y)
        S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)
        
        # Create figure
        plt.figure(figsize=(10, 4))
        librosa.display.specshow(
            S_db, 
            sr=sr, 
            x_axis='time', 
            y_axis='hz',
            cmap='viridis'
        )
        plt.colorbar(format='%+2.0f dB')
        plt.title('Frequency Spectrogram Analysis')
        plt.tight_layout()
        
        # Save spectrogram
        spec_filename = f'spec_{timestamp}.png'
        spec_path = os.path.join(spectrograms_dir, spec_filename)
        plt.savefig(spec_path, dpi=100, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Spectrogram saved: {spec_filename}")
        # ===== END SPECTROGRAM =====
        
        return jsonify({
            "diagnosis": classes[result_idx],
            "confidence": float(pred_confidence),
            "filename": file.filename,
            "spectrogram_url": f'/static/spectrograms/{spec_filename}',  # ← Fixed!
            "segment_start": float(start_time),
            "segment_end": float(start_time + DURATION),
            "validation_passed": True,
            "validation_confidence": float(confidence) if ENABLE_VALIDATION else 1.0
        })
        
    except Exception as e:
        print(f"Error processing audio: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "processing_error",
            "message": "An error occurred while processing your audio file.",
            "details": str(e)
        }), 500
        
    finally:
        # CRITICAL: Always clean up the file immediately after processing
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"Cleaned up: {filepath}")
            except Exception as e:
                print(f"Error removing file: {e}")

if __name__ == '__main__':
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print("Background cleanup: Running every 30 minutes")
    print(f"Audio validation: {'Enabled' if ENABLE_VALIDATION else 'Disabled'}")
    print(f"Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS)).upper()}")
    app.run(host='0.0.0.0', port=5000)