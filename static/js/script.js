// DOM Elements
const uploadForm = document.getElementById('uploadForm');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFile');
const analyzeBtn = document.getElementById('analyzeBtn');

// Recording elements
const recordBtn = document.getElementById('recordBtn');
const recordingControls = document.getElementById('recordingControls');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingTime = document.getElementById('recordingTime');

// Audio player elements
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const timelineSlider = document.getElementById('timelineSlider');
const timelineProgress = document.getElementById('timelineProgress');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const waveformCanvas = document.getElementById('waveformCanvas');

// Cut modal elements
const cutBtn = document.getElementById('cutBtn');
const cutModal = document.getElementById('cutModal');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
const modalOverlay = document.querySelector('.modal-overlay');
const cutWaveformCanvas = document.getElementById('cutWaveformCanvas');
const cutWaveformContainer = document.getElementById('cutWaveformContainer');
const handleStart = document.getElementById('handleStart');
const handleEnd = document.getElementById('handleEnd');
const cutSelectedRegion = document.getElementById('cutSelectedRegion');
const handleStartTime = document.getElementById('handleStartTime');
const handleEndTime = document.getElementById('handleEndTime');
const cutDurationDisplay = document.getElementById('cutDurationDisplay');
const cutWarning = document.getElementById('cutWarning');
const playSegmentBtn = document.getElementById('playSegmentBtn');
const playbackIndicator = document.getElementById('playbackIndicator');
const segmentSelectedInfo = document.getElementById('segmentSelectedInfo');
const selectedSegmentDisplay = document.getElementById('selectedSegmentDisplay');

// Help modal elements
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');

// Causes modal elements
const viewCausesBtn = document.getElementById('viewCausesBtn');
const causesModal = document.getElementById('causesModal');
const causesClose = document.getElementById('causesClose');
const causesTitle = document.getElementById('causesTitle');
const causesBody = document.getElementById('causesBody');

const uploadSection = document.getElementById('uploadSection');
const resultsSection = document.getElementById('resultsSection');
const loadingOverlay = document.getElementById('loadingOverlay');

const diagnosisValue = document.getElementById('diagnosisValue');
const confidenceValue = document.getElementById('confidenceValue');
const confidenceFill = document.getElementById('confidenceFill');
const resultFileName = document.getElementById('resultFileName');
const analysisTime = document.getElementById('analysisTime');
const newAnalysisBtn = document.getElementById('newAnalysis');

let selectedFile = null;
let audioDuration = 0;
let selectedStartTime = 0;
let audioContext = null;
let audioBuffer = null;
let startTime = null;

// Recording variables
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
const MAX_RECORDING_DURATION = 30; // 30 seconds max

// Cut modal variables
let cutStartTime = 0;
let cutEndTime = 5;
const MIN_CUT_DURATION = 5; // 5 seconds minimum
let isDraggingHandle = null;
let isPlayingSegment = false;

// ============================================
// File Upload Handling
// ============================================

// Click to browse
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight on drag
['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    uploadArea.classList.add('dragover');
}

function unhighlight() {
    uploadArea.classList.remove('dragover');
}

// Handle dropped files
uploadArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

// Handle file input change
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    
    // Validate file type - support multiple audio formats
    const allowedExtensions = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'wma'];
    const fileExt = file.name.toLowerCase().split('.').pop();
    
    if (!allowedExtensions.includes(fileExt)) {
        showError('Invalid File Type', 'Please upload an audio file (WAV, MP3, OGG, FLAC, M4A, AAC, WMA)');
        return;
    }
    
    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('File Too Large', 'File size must be less than 50MB');
        return;
    }
    
    selectedFile = file;
    displayFileInfo(file);
    setupAudioPlayer(file);
    analyzeBtn.disabled = false;
}

function displayFileInfo(file) {
    // Show file info
    uploadArea.style.display = 'none';
    recordBtn.style.display = 'none';
    fileInfo.style.display = 'flex';
    
    // Set file details
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    // Show analyze button
    analyzeBtn.style.display = 'flex';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================
// Audio Recording
// ============================================

recordBtn.addEventListener('click', async () => {
    try {
        // Request microphone access with NO processing (completely raw)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,      // NO echo cancellation
                noiseSuppression: false,      // NO noise reduction
                autoGainControl: false,       // NO automatic volume adjustment
                sampleRate: 44100,            // CD quality sample rate
                channelCount: 1               // Mono recording (saves space)
            }
        });
        
        // Create media recorder - RAW audio only
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            // Stop all audio tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Create blob from recorded audio
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            
            // Create File object from blob
            const recordedFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
            
            // Handle as uploaded file
            selectedFile = recordedFile;
            displayFileInfo(recordedFile);
            setupAudioPlayer(recordedFile);
            analyzeBtn.disabled = false;
            
            // Hide recording controls
            recordingControls.style.display = 'none';
            uploadArea.style.display = 'none';
            recordBtn.style.display = 'none';
        };
        
        // Start recording
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Show recording controls
        uploadArea.style.display = 'none';
        recordBtn.style.display = 'none';
        recordingControls.style.display = 'flex';
        
        // Disable stop button initially (need 5 seconds minimum)
        stopRecordBtn.disabled = true;
        stopRecordBtn.textContent = 'Recording... (min 5s)';
        stopRecordBtn.style.opacity = '0.5';
        stopRecordBtn.style.cursor = 'not-allowed';
        
        // Update timer
        updateRecordingTime();
        recordingInterval = setInterval(updateRecordingTime, 100);
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        showError('Microphone Access Denied', 'Please allow microphone access to record audio.');
    }
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        clearInterval(recordingInterval);
    }
});

function updateRecordingTime() {
    const elapsed = (Date.now() - recordingStartTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    recordingTime.textContent = `${mins}:${secs.toString().padStart(2, '0')} / 0:30`;
    
    // Enable stop button only after 5 seconds
    if (elapsed >= 5) {
        stopRecordBtn.disabled = false;
        stopRecordBtn.textContent = 'Stop Recording';
        stopRecordBtn.style.opacity = '1';
        stopRecordBtn.style.cursor = 'pointer';
    } else {
        stopRecordBtn.disabled = true;
        stopRecordBtn.textContent = 'Recording... (min 5s)';
        stopRecordBtn.style.opacity = '0.5';
        stopRecordBtn.style.cursor = 'not-allowed';
    }
    
    // Auto-stop at 30 seconds
    if (elapsed >= MAX_RECORDING_DURATION) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            clearInterval(recordingInterval);
        }
    }
}

// ============================================
// Audio Player Setup
// ============================================

function setupAudioPlayer(file) {
    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    
    audioPlayer.addEventListener('loadedmetadata', () => {
        audioDuration = audioPlayer.duration;
        
        // Validate audio duration (max 30 seconds)
        if (audioDuration > 30) {
            // Audio too long
            showError(
                'Audio Too Long',
                `Audio duration is ${formatTime(audioDuration)}. Maximum allowed is 30 seconds. Please upload a shorter audio file or use the trim feature.`
            );
            
            // Reset upload
            resetUpload();
            return;
        }
        
        totalTimeEl.textContent = formatTime(audioDuration);
        
        // Show cut button if audio > 5 seconds
        showCutButton();
        
        // Draw waveform
        drawWaveform(file);
    });
    
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', () => {
        playBtn.classList.remove('playing');
    });
}

// Show cut button if audio > 5 seconds
function showCutButton() {
    if (audioDuration > 5.5) {
        cutBtn.style.display = 'flex';
    } else {
        cutBtn.style.display = 'none';
        // If audio is <= 5 seconds, analyze entire file
        selectedStartTime = 0;
    }
}

// Play/Pause control
playBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
        audioPlayer.play();
        playBtn.classList.add('playing');
    } else {
        audioPlayer.pause();
        playBtn.classList.remove('playing');
    }
});

// Timeline slider
timelineSlider.addEventListener('input', (e) => {
    const time = (e.target.value / 100) * audioDuration;
    audioPlayer.currentTime = time;
});

// Update progress
function updateProgress() {
    const progress = (audioPlayer.currentTime / audioDuration) * 100;
    timelineProgress.style.width = progress + '%';
    timelineSlider.value = progress;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// Waveform Visualization
// ============================================

async function drawWaveform(file) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const canvas = waveformCanvas;
        const ctx = canvas.getContext('2d');
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        
        ctx.fillStyle = 'rgba(10, 14, 26, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        
        ctx.stroke();
        
    } catch (error) {
        console.error('Error drawing waveform:', error);
    }
}

// ============================================
// Cut Modal - Two Draggable Handles
// ============================================

// Open modal
cutBtn.addEventListener('click', () => {
    cutStartTime = 0;
    cutEndTime = Math.min(5, audioDuration);
    cutModal.style.display = 'flex';
    drawCutWaveform();
    updateCutHandles();
});

// Close modal
function closeModal() {
    cutModal.style.display = 'none';
    playbackIndicator.style.display = 'none';
    if (isPlayingSegment) {
        audioPlayer.pause();
        playSegmentBtn.classList.remove('playing');
        isPlayingSegment = false;
    }
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

// Draw waveform in modal
async function drawCutWaveform() {
    if (!audioBuffer) return;
    
    const canvas = cutWaveformCanvas;
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    
    ctx.fillStyle = 'rgba(10, 14, 26, 1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let i = 0; i < canvas.width; i++) {
        let min = 1.0;
        let max = -1.0;
        
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    
    ctx.stroke();
}

// Handle dragging - Mouse events
handleStart.addEventListener('mousedown', (e) => {
    isDraggingHandle = 'start';
    e.preventDefault();
});

handleEnd.addEventListener('mousedown', (e) => {
    isDraggingHandle = 'end';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingHandle) return;
    
    const rect = cutWaveformContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * audioDuration;
    
    if (isDraggingHandle === 'start') {
        // Can't go past end - MIN_CUT_DURATION
        const maxStart = cutEndTime - MIN_CUT_DURATION;
        cutStartTime = Math.max(0, Math.min(time, maxStart));
    } else if (isDraggingHandle === 'end') {
        // Can't go before start + MIN_CUT_DURATION
        const minEnd = cutStartTime + MIN_CUT_DURATION;
        cutEndTime = Math.max(minEnd, Math.min(time, audioDuration));
    }
    
    updateCutHandles();
});

document.addEventListener('mouseup', () => {
    isDraggingHandle = null;
});

// Handle dragging - Touch events
handleStart.addEventListener('touchstart', (e) => {
    isDraggingHandle = 'start';
    e.preventDefault();
});

handleEnd.addEventListener('touchstart', (e) => {
    isDraggingHandle = 'end';
    e.preventDefault();
});

document.addEventListener('touchmove', (e) => {
    if (!isDraggingHandle) return;
    
    const touch = e.touches[0];
    const rect = cutWaveformContainer.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * audioDuration;
    
    if (isDraggingHandle === 'start') {
        const maxStart = cutEndTime - MIN_CUT_DURATION;
        cutStartTime = Math.max(0, Math.min(time, maxStart));
    } else if (isDraggingHandle === 'end') {
        const minEnd = cutStartTime + MIN_CUT_DURATION;
        cutEndTime = Math.max(minEnd, Math.min(time, audioDuration));
    }
    
    updateCutHandles();
});

document.addEventListener('touchend', () => {
    isDraggingHandle = null;
});

// Update handle positions
function updateCutHandles() {
    const startPercent = (cutStartTime / audioDuration) * 100;
    const endPercent = (cutEndTime / audioDuration) * 100;
    
    handleStart.style.left = startPercent + '%';
    handleEnd.style.left = endPercent + '%';
    
    cutSelectedRegion.style.left = startPercent + '%';
    cutSelectedRegion.style.width = (endPercent - startPercent) + '%';
    
    handleStartTime.textContent = formatTime(cutStartTime);
    handleEndTime.textContent = formatTime(cutEndTime);
    
    const duration = cutEndTime - cutStartTime;
    cutDurationDisplay.textContent = duration.toFixed(1) + 's';
    
    // Show warning if too short (shouldn't happen with constraints)
    if (duration < MIN_CUT_DURATION) {
        cutWarning.style.display = 'inline';
    } else {
        cutWarning.style.display = 'none';
    }
}

// Preview segment
playSegmentBtn.addEventListener('click', () => {
    if (isPlayingSegment) {
        audioPlayer.pause();
        playSegmentBtn.classList.remove('playing');
        playbackIndicator.style.display = 'none';
        isPlayingSegment = false;
    } else {
        audioPlayer.currentTime = cutStartTime;
        audioPlayer.play();
        playSegmentBtn.classList.add('playing');
        playbackIndicator.style.display = 'block';
        isPlayingSegment = true;
        
        // Update playback indicator position
        const updateIndicator = setInterval(() => {
            if (audioPlayer.currentTime >= cutEndTime || audioPlayer.paused) {
                audioPlayer.pause();
                playSegmentBtn.classList.remove('playing');
                playbackIndicator.style.display = 'none';
                isPlayingSegment = false;
                clearInterval(updateIndicator);
            } else {
                // Calculate position WITHIN the segment (not full audio)
                const segmentDuration = cutEndTime - cutStartTime;
                const progressInSegment = (audioPlayer.currentTime - cutStartTime) / segmentDuration;
                
                // Calculate position within container (starts at segment start, ends at segment end)
                const startPercent = (cutStartTime / audioDuration) * 100;
                const segmentWidthPercent = (segmentDuration / audioDuration) * 100;
                const indicatorPercent = startPercent + (progressInSegment * segmentWidthPercent);
                
                playbackIndicator.style.left = indicatorPercent + '%';
            }
        }, 50); // Update every 50ms for smooth animation
    }
});

// Cut audio segment and create new audio file
async function cutAudioSegment() {
    if (!audioBuffer) return null;
    
    try {
        const sampleRate = audioBuffer.sampleRate;
        const numberOfChannels = audioBuffer.numberOfChannels;
        
        // Calculate samples
        const startSample = Math.floor(cutStartTime * sampleRate);
        const endSample = Math.floor(cutEndTime * sampleRate);
        const segmentLength = endSample - startSample;
        
        // Create new buffer for the segment
        const segmentBuffer = audioContext.createBuffer(
            numberOfChannels,
            segmentLength,
            sampleRate
        );
        
        // Copy audio data for each channel
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = audioBuffer.getChannelData(channel);
            const segmentData = segmentBuffer.getChannelData(channel);
            
            for (let i = 0; i < segmentLength; i++) {
                segmentData[i] = sourceData[startSample + i];
            }
        }
        
        // Convert buffer to WAV blob
        const wavBlob = bufferToWave(segmentBuffer, segmentLength);
        
        // Create File object
        const originalName = selectedFile.name;
        const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        const newFileName = `${baseName}_cut.wav`;
        const cutFile = new File([wavBlob], newFileName, { type: 'audio/wav' });
        
        return cutFile;
        
    } catch (error) {
        console.error('Error cutting audio:', error);
        return null;
    }
}

// Convert AudioBuffer to WAV Blob
function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let offset = 0;
    let pos = 0;
    
    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length
    
    // Write interleaved data
    for (let i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }
    
    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            const sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true); // convert to 16-bit
            pos += 2;
        }
        offset++;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
    
    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }
    
    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

// Confirm selection - CUT the audio
modalConfirm.addEventListener('click', async () => {
    // Show loading state
    modalConfirm.disabled = true;
    modalConfirm.textContent = 'Cutting audio...';
    
    // Cut the audio segment
    const cutFile = await cutAudioSegment();
    
    if (cutFile) {
        // Replace the selected file with cut version
        selectedFile = cutFile;
        selectedStartTime = 0; // Reset since we now have a cut file
        
        // Close modal
        closeModal();
        
        // Update file info with new cut file
        fileName.textContent = cutFile.name;
        fileSize.textContent = formatFileSize(cutFile.size);
        
        // Setup audio player with cut file
        const url = URL.createObjectURL(cutFile);
        audioPlayer.src = url;
        
        // Wait for metadata to load
        audioPlayer.addEventListener('loadedmetadata', () => {
            audioDuration = audioPlayer.duration;
            totalTimeEl.textContent = formatTime(audioDuration);
            
            // Keep trim button visible for multiple trims
            // Only hide if audio is too short to trim further (< 5 seconds)
            if (audioDuration <= 5) {
                cutBtn.style.display = 'none';
            } else {
                cutBtn.style.display = 'flex';
            }
            
            // Show selected segment info
            selectedSegmentDisplay.textContent = `Cut to ${formatTime(audioDuration)}`;
            segmentSelectedInfo.style.display = 'flex';
            
            // Redraw waveform with cut audio
            drawWaveform(cutFile);
        }, { once: true });
        
        // Reset audio player position
        audioPlayer.currentTime = 0;
        playBtn.classList.remove('playing');
        timelineProgress.style.width = '0%';
        timelineSlider.value = 0;
        currentTimeEl.textContent = '0:00';
        
    } else {
        // Error cutting audio
        alert('Error cutting audio. Please try again.');
    }
    
    // Reset button
    modalConfirm.disabled = false;
    modalConfirm.textContent = '✓ Use This Segment';
});

// ============================================
// Remove File
// ============================================

removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
});

function resetUpload() {
    selectedFile = null;
    selectedStartTime = 0;
    audioDuration = 0;
    fileInput.value = '';
    
    // Reset audio player
    audioPlayer.pause();
    audioPlayer.src = '';
    playBtn.classList.remove('playing');
    timelineProgress.style.width = '0%';
    timelineSlider.value = 0;
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = '0:00';
    
    // Clear waveform
    const ctx = waveformCanvas.getContext('2d');
    ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    
    // Reset recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    clearInterval(recordingInterval);
    
    // Hide/show elements
    uploadArea.style.display = '';
    recordBtn.style.display = '';
    fileInfo.style.display = 'none';
    cutBtn.style.display = 'none';
    segmentSelectedInfo.style.display = 'none';
    recordingControls.style.display = 'none';
    analyzeBtn.style.display = 'none';
    analyzeBtn.disabled = true;
}

// ============================================
// Form Submission
// ============================================

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!selectedFile) return;
    
    // Pause audio if playing
    if (!audioPlayer.paused) {
        audioPlayer.pause();
        playBtn.classList.remove('playing');
    }
    
    // Show loading
    showLoading();
    startTime = Date.now();
    
    // Prepare form data
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('start_time', selectedStartTime.toString());
    
    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Handle validation or processing errors
            hideLoading();
            
            if (data.error === 'invalid_audio') {
                showError(
                    'Not an Engine Sound',
                    data.message + '\n\n' + data.details,
                    'warning'
                );
            } else {
                showError(
                    'Processing Error',
                    data.message || 'An error occurred while analyzing your file.',
                    'error'
                );
            }
            return;
        }
        
        // Calculate processing time
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        // Show results
        showResults(data, processingTime);
        
    } catch (error) {
        hideLoading();
        showError(
            'Connection Error',
            'Unable to connect to the server. Please try again.',
            'error'
        );
        console.error('Error:', error);
    }
});

// ============================================
// Display Results
// ============================================

function showResults(data, processingTime) {
    // Hide loading
    hideLoading();
    
    // Set result values
    diagnosisValue.textContent = data.diagnosis;
    currentDiagnosis = data.diagnosis;  // Store for causes modal
    currentSpectrogramUrl = data.spectrogram_url || '';  // Store spectrogram if provided by backend
    confidenceValue.textContent = data.confidence.toFixed(2) + '%';
    resultFileName.textContent = data.filename;
    analysisTime.textContent = processingTime + 's';
    
    // Hide "View Possible Causes" button if diagnosis is Normal
    const diagnosisLower = data.diagnosis.toLowerCase();
    if (diagnosisLower.includes('normal') || diagnosisLower.includes('no fault') || diagnosisLower.includes('healthy')) {
        viewCausesBtn.style.display = 'none';
    } else {
        viewCausesBtn.style.display = 'flex';
    }
    
    // Animate confidence meter
    setTimeout(() => {
        confidenceFill.style.width = data.confidence + '%';
        
        // Change color based on confidence
        if (data.confidence >= 80) {
            confidenceFill.style.background = 'linear-gradient(90deg, var(--color-success) 0%, var(--color-primary) 100%)';
        } else if (data.confidence >= 60) {
            confidenceFill.style.background = 'linear-gradient(90deg, var(--color-warning) 0%, var(--color-primary) 100%)';
        } else {
            confidenceFill.style.background = 'linear-gradient(90deg, var(--color-error) 0%, var(--color-accent) 100%)';
        }
    }, 100);
    
    // Hide upload section, show results
    uploadSection.style.display = 'none';
    resultsSection.style.display = 'block';
}

// ============================================
// Error Display
// ============================================

function showError(title, message, type = 'error') {
    // Create error modal
    const modal = document.createElement('div');
    modal.className = 'error-modal';
    modal.innerHTML = `
        <div class="error-content ${type}">
            <div class="error-icon">
                ${type === 'warning' ? 
                    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' :
                    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                }
            </div>
            <h3 class="error-title">${title}</h3>
            <p class="error-message">${message.replace(/\n/g, '<br>')}</p>
            <button class="error-close" onclick="this.closest('.error-modal').remove()">
                Got it
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animate in
    setTimeout(() => modal.classList.add('show'), 10);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (modal.parentNode) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    }, 10000);
}

// ============================================
// New Analysis
// ============================================

newAnalysisBtn.addEventListener('click', () => {
    // Reset everything
    resetUpload();
    
    // Reset results
    diagnosisValue.textContent = '---';
    confidenceValue.textContent = '0%';
    confidenceFill.style.width = '0%';
    resultFileName.textContent = '---';
    analysisTime.textContent = '---';
    
    // Show upload section, hide results
    resultsSection.style.display = 'none';
    uploadSection.style.display = 'block';
});

// ============================================
// Loading State
// ============================================

function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

// ============================================
// Help Modal
// ============================================

// Open help modal
helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'flex';
});

// Close help modal
helpClose.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// Close on overlay click
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal || e.target.classList.contains('modal-overlay')) {
        helpModal.style.display = 'none';
    }
});

// ============================================
// Possible Causes Modal
// ============================================

// Causes database - PLAIN ENGLISH for everyone, backed by research
const possibleCauses = {
    "timing_belt": {
        title: "Timing Belt / Chain Noise",
        symptom: "Whirring, slapping, or high-pitched squealing from the front of the engine.",
        causes: [
            {
                title: "Belt is Worn or Loose",
                description: "The timing belt has stretched or the teeth are worn down, causing it to slip and squeal.",
                reference: 1
            },
            {
                title: "Belt Tensioner Bearing Failed",
                description: "The part that keeps the belt tight has a bad bearing, making grinding or chirping sounds.",
                reference: 2
            },
            {
                title: "Timing Chain is Stretched",
                description: "The metal chain has stretched from use and now slaps against the timing cover.",
                reference: 1
            }
        ],
        spectrogramEvidence: {
            caption: "High-pitched squealing or whirring sounds that change speed with the engine.",
            highlights: [
                "🔍 High-frequency squealing",
                "⚡ Speed changes with RPM",
                "📈 Constant, not pulsing"
            ]
        },
        references: [
            {
                title: "Timing Belt Failure Detection System",
                source: "Int. J. Automotive Engineering",
                finding: "Identifies frequency patterns of worn belt teeth and stretch before failure."
            },
            {
                title: "Acoustic Analysis of Belt Drives",
                source: "SAE Paper 2005-01-2287",
                finding: "Documents misalignment and tensioner wear noise characteristics."
            }
        ]
    },
    "clicking": {
        title: "Clicking / Ticking Sound",
        symptom: "Fast, light clicking or ticking from the top of the engine.",
        causes: [
            {
                title: "Valve Clearance Too Large",
                description: "The gap between the valve and rocker arm is too big, making a ticking sound when they hit each other.",
                reference: 1
            },
            {
                title: "Hydraulic Lifters are Worn",
                description: "The small parts that push the valves have lost pressure and make clicking noises.",
                reference: 2
            },
            {
                title: "Engine Oil is Low or Old",
                description: "Not enough oil or dirty oil means valve parts aren't lubricated properly and click together.",
                reference: 1
            }
        ],
        spectrogramEvidence: {
            caption: "Fast clicking sounds that get faster when you rev the engine, coming from the valve cover.",
            highlights: [
                "🔊 Rapid clicking/tapping",
                "⚙️ Speeds up with engine RPM",
                "📊 Light, high-pitched ticks"
            ]
        },
        references: [
            {
                title: "Engine Valve Clearance Fault Diagnosis",
                source: "MDPI Sensors (2017)",
                finding: "Valve clearance faults create unique high-frequency impacts distinct from normal noise."
            },
            {
                title: "Valve Fault Diagnosis Using Acoustic Emission",
                source: "Shock and Vibration (2014)",
                finding: "Acoustic sensors detect the specific 'slap' of excessive valve clearance."
            }
        ]
    },
    "rod_knock": {
        title: "Rod Knock",
        symptom: "Deep, heavy hammering or clunking sound low in the engine.",
        causes: [
            {
                title: "Bearing Wear (Too Much Gap)",
                description: "The bearing between the connecting rod and crankshaft is worn, creating a gap that causes hammering.",
                reference: 1
            },
            {
                title: "Oil Pressure Too Low",
                description: "Not enough oil pressure means bearings aren't protected, causing metal-on-metal contact.",
                reference: 2
            },
            {
                title: "Engine Ran Too Hot",
                description: "Overheating warped the connecting rod, causing it to hit the crankshaft.",
                reference: 1
            }
        ],
        spectrogramEvidence: {
            caption: "Deep, heavy knocking that happens once per engine revolution, gets louder when accelerating.",
            highlights: [
                "🔨 Deep, heavy knocks",
                "💥 Louder under acceleration",
                "⚠️ Once per engine rotation"
            ]
        },
        references: [
            {
                title: "Connecting Rod Analysis for Heavy Vehicles",
                source: "Int. J. Engineering (2017)",
                finding: "Structural failures create characteristic knocking sound."
            },
            {
                title: "Vibration Analysis for Engine Fault Diagnosis",
                source: "J. Low Frequency Noise",
                finding: "Worn bearings create impacts at rotation frequency and harmonics."
            }
        ]
    },
    "engine_knocking": {
        title: "Engine Knocking (Detonation)",
        symptom: "Metallic 'pinging' or 'marbles rattling' sound during acceleration.",
        causes: [
            {
                title: "Using Wrong Fuel (Octane Too Low)",
                description: "Your engine needs higher octane fuel (like 91) but you're using regular (87), causing pinging.",
                reference: 1
            },
            {
                title: "Carbon Buildup in Engine",
                description: "Carbon deposits on pistons and valves make the compression higher, causing knocking.",
                reference: 2
            },
            {
                title: "Ignition Timing is Wrong",
                description: "The spark plugs are firing too early, making the fuel explode instead of burn smoothly.",
                reference: 2
            },
            {
                title: "Engine is Overheating",
                description: "Too much heat causes the fuel to ignite too early, creating a pinging sound.",
                reference: 1
            }
        ],
        spectrogramEvidence: {
            caption: "High-pitched 'ping' or rattling sound that happens when accelerating, especially going uphill.",
            highlights: [
                "💥 Sharp pinging noise",
                "🔥 Happens during acceleration",
                "⚡ High-pitched rattle"
            ]
        },
        references: [
            {
                title: "Knock: A Century of Research",
                source: "SAE Int. J. Engines (2021)",
                finding: "Defines pressure wave frequencies that create audible 'ping' sound."
            },
            {
                title: "Acoustic Spectrums of Combustion Process",
                source: "MATEC Web Conf. (2018)",
                finding: "Knock generates high-frequency noise (>4kHz) from rapid pressure waves."
            },
            {
                title: "IC Engine Fundamentals, 2nd Ed.",
                source: "Heywood (2018)",
                finding: "Knock mechanisms and fuel octane effects on detonation resistance."
            }
        ]
    },
    "normal": {
        title: "Normal Operation",
        symptom: "No concerning sounds detected. Engine appears to be operating within normal parameters.",
        causes: [
            {
                title: "Normal Engine Sounds",
                description: "Healthy engines make some noise from fuel injectors clicking and valves opening and closing.",
                reference: 1
            },
            {
                title: "Fuel Injectors Clicking",
                description: "The fuel injectors make a normal clicking sound when they spray fuel into the engine.",
                reference: 1
            },
            {
                title: "Belt and Pulley Sounds",
                description: "The belts running the alternator and AC make some normal whirring sounds.",
                reference: 1
            }
        ],
        spectrogramEvidence: {
            caption: "Normal, balanced engine sounds with no unusual patterns or loud noises.",
            highlights: [
                "✅ Smooth, even sounds",
                "🔋 Normal operating noise",
                "🎵 No unusual patterns"
            ]
        },
        references: [
            {
                title: "Engine Condition Monitoring",
                source: "Mech. Syst. Signal Process. (2018)",
                finding: "Baseline acoustic patterns for healthy engine operation."
            }
        ]
    }
};

// Store current diagnosis for causes modal
let currentDiagnosis = '';
let currentSpectrogramUrl = '';  // Store spectrogram image URL from backend

// Open causes modal with appropriate content
viewCausesBtn.addEventListener('click', () => {
    if (currentDiagnosis) {
        showPossibleCauses(currentDiagnosis);
    }
});

// Close causes modal
causesClose.addEventListener('click', () => {
    causesModal.style.display = 'none';
});

// Close on overlay click
causesModal.addEventListener('click', (e) => {
    if (e.target === causesModal || e.target.classList.contains('modal-overlay')) {
        causesModal.style.display = 'none';
    }
});

// Show possible causes based on diagnosis
function showPossibleCauses(diagnosis) {
    // Normalize diagnosis to match database keys
    let diagnosisKey = diagnosis.toLowerCase()
        .replace(/ /g, '_')
        .replace(/[^a-z_]/g, '');
    
    // Handle common diagnosis variations and aliases
    const diagnosisAliases = {
        'knocking': 'engine_knocking',
        'knock': 'engine_knocking',
        'engine_knock': 'engine_knocking',
        'detonation': 'engine_knocking',
        'pinging': 'engine_knocking',
        'timing_belt_issue': 'timing_belt',
        'belt_issue': 'timing_belt',
        'belt': 'timing_belt',
        'timing': 'timing_belt',
        'click': 'clicking',
        'clicking_sound': 'clicking',
        'valve_noise': 'clicking',
        'tapping': 'clicking',
        'rod': 'rod_knock',
        'connecting_rod': 'rod_knock',
        'bearing': 'rod_knock',
        'bearing_knock': 'rod_knock',
        'no_fault': 'normal',
        'healthy': 'normal',
        'good': 'normal'
    };
    
    // Check if we need to use an alias
    if (diagnosisAliases[diagnosisKey]) {
        diagnosisKey = diagnosisAliases[diagnosisKey];
    }
    
    const causes = possibleCauses[diagnosisKey] || possibleCauses.normal;
    
    // Update title - clean title without emoji
    const cleanTitle = causes.title.replace(/[⚙️🔊🔨💥✅]/g, '').trim();
    causesTitle.textContent = cleanTitle;
    
    // Build card-based layout
    let html = `
        <div class="reported-symptom">
            <h5>🔍 Reported Symptom</h5>
            <p>"${causes.symptom}"</p>
        </div>
        
        <div class="causes-section">
            <h5>Potential Causes & Research Evidence</h5>
            <div class="cause-cards">
    `;
    
    // Add cause cards
    causes.causes.forEach(cause => {
        html += `
            <div class="cause-card">
                <div class="card-title">${cause.title}</div>
                <div class="card-description">${cause.description}</div>
                <div class="card-reference">
                    <span class="reference-icon">🔬</span>
                    <span class="reference-label">Scientific Basis:</span>
                    <button class="reference-btn" data-ref="${cause.reference}">
                        [${cause.reference}]
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    causesBody.innerHTML = html;
    
    // Add click handlers for reference buttons
    const refButtons = causesBody.querySelectorAll('.reference-btn');
    refButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const refSection = document.getElementById('referencesSection');
            if (refSection.style.display === 'none') {
                refSection.style.display = 'block';
                refSection.setAttribute('open', '');
            }
            // Scroll to references
            refSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });
    
    // Display references with full details
    const referencesSection = document.getElementById('referencesSection');
    const referencesList = document.getElementById('referencesList');
    
    if (causes.references && causes.references.length > 0) {
        let refsHTML = '<ol class="research-references">';
        causes.references.forEach((ref, index) => {
            refsHTML += `
                <li class="research-ref-item">
                    <div class="ref-title">${ref.title}</div>
                    <div class="ref-source">${ref.source}</div>
                    <div class="ref-finding">
                        <strong>Key Finding:</strong> ${ref.finding}
                    </div>
                </li>
            `;
        });
        refsHTML += '</ol>';
        referencesList.innerHTML = refsHTML;
        referencesSection.style.display = 'block';
        // Close by default
        referencesSection.removeAttribute('open');
    } else {
        referencesSection.style.display = 'none';
    }
    
    // Handle spectrogram display
    const spectrogramSection = document.getElementById('spectrogramSection');
    const spectrogramImage = document.getElementById('spectrogramImage');
    const spectrogramCaption = document.getElementById('spectrogramCaption');
    
    if (currentSpectrogramUrl && currentSpectrogramUrl.length > 0) {
        // Backend provided a spectrogram - show it!
        spectrogramImage.src = currentSpectrogramUrl;
        spectrogramCaption.textContent = causes.spectrogramEvidence?.caption || 'Acoustic frequency analysis of the detected sound pattern.';
        spectrogramSection.style.display = 'block';
        
        // Add evidence highlights if available
        if (causes.spectrogramEvidence?.highlights) {
            // Remove old highlights if any
            const oldHighlights = spectrogramSection.querySelector('.evidence-highlights');
            if (oldHighlights) oldHighlights.remove();
            
            let highlightsHTML = '<div class="evidence-highlights">';
            causes.spectrogramEvidence.highlights.forEach(highlight => {
                highlightsHTML += `<span class="evidence-badge">${highlight}</span>`;
            });
            highlightsHTML += '</div>';
            spectrogramCaption.insertAdjacentHTML('afterend', highlightsHTML);
        }
    } else {
        // No spectrogram available - hide section
        spectrogramSection.style.display = 'none';
    }
    
    causesModal.style.display = 'flex';
}

// ============================================
// Prevent accidental navigation
// ============================================

window.addEventListener('beforeunload', (e) => {
    if (selectedFile && !resultsSection.style.display) {
        e.preventDefault();
        e.returnValue = '';
    }
});