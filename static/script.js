let selectedFile = null;
let currentLevel = 'crops'; // 'crops' | 'folders' | 'images'
let activeCrop = null;
let activeFolder = null;
let mediaStream = null;

const defaultImgPath = '/static/images/default-crop.png';

// =========================================================
// 0. UTILITY FUNCTIONS & NAVIGATION CONTROLS
// =========================================================

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getGridContainer() {
    return document.getElementById('contentGrid') || 
           document.getElementById('crops-container') || 
           document.querySelector('.card-grid');
}

function handleImageError(img) {
    img.onerror = null;
    img.src = defaultImgPath;
}

function showBackButton() {
    const btn = document.getElementById('backBtn');
    if (btn) btn.style.display = 'inline-block';
}

function hideBackButton() {
    const btn = document.getElementById('backBtn');
    if (btn) btn.style.display = 'none';
}

function updateNavigationHeader(titleText, showBack = false) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.innerHTML = titleText;
    if (showBack) showBackButton(); else hideBackButton();
}

function goBack() {
    if (currentLevel === 'images') {
        openCrop(activeCrop);
    } else if (currentLevel === 'folders') {
        loadCrops();
    } else {
        window.location.href = '/'; 
    }
}

// =========================================================
// 1. PLANTVILLAGE KNOWLEDGE BASE (39 Classes Matched to Python Backend)
// =========================================================

const diseaseKnowledgeBase = {
    "Apple___Apple_scab": {
        description: "Caused by Venturia inaequalis. Thrives in cool, wet spring weather.",
        treatment: "Apply fungicides, prune trees for better air circulation, and clear leaf litter."
    },
    "Apple___Black_rot": {
        description: "Caused by Botryosphaeria obtusa. Causes frog-eye leaf spot and fruit decay.",
        treatment: "Prune infected wood and mummified fruit; apply protective fungicides."
    },
    "Apple___Cedar_apple_rust": {
        description: "Fungal infection requiring Eastern red cedar as an alternate host.",
        treatment: "Remove nearby cedar trees and use rust-resistant cultivars or fungicides."
    },
    "Apple___healthy": {
        description: "No disease detected. Leaf shows healthy green coloration.",
        treatment: "Maintain proper irrigation and fertilization."
    },
    "Background_without_leaves": {
        description: "No leaf or crop detected in the image.",
        treatment: "Please re-upload a clear image showing a crop leaf."
    },
    "Blueberry___healthy": {
        description: "No disease detected.",
        treatment: "Maintain optimal soil pH (4.5–5.5) and good cultural practices."
    },
    "Cherry___Powdery_mildew": {
        description: "Caused by Podosphaera clandestina, causing white powdery coating on leaves.",
        treatment: "Apply sulfur-based fungicides and improve canopy air circulation."
    },
    "Cherry___healthy": {
        description: "No disease detected.",
        treatment: "Continue standard orchard management."
    },
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": {
        description: "Fungus Cercospora zeae-maydis causing rectangular necrotic lesions.",
        treatment: "Use resistant crop hybrids and spray recommended foliar fungicides."
    },
    "Corn_(maize)___Common_rust": {
        description: "Caused by Puccinia sorghi, producing reddish-brown pustules on leaf surfaces.",
        treatment: "Plant resistant varieties and apply fungicides if infection occurs early."
    },
    "Corn_(maize)___Northern_Leaf_Blight": {
        description: "Caused by Exserohilum turcicum, leading to long grayish-green lesions.",
        treatment: "Use crop rotation, resistant hybrids, and foliar fungicide treatments."
    },
    "Corn_(maize)___healthy": {
        description: "No leaf spots or lesions detected.",
        treatment: "Maintain balanced nitrogen supply and standard maintenance."
    },
    "Grape___Black_rot": {
        description: "Caused by Guignardia bidwellii, forming dark lesions on leaves and fruit.",
        treatment: "Prune infected vines and apply targeted copper or chemical fungicides."
    },
    "Grape___Esca_(Black_Measles)": {
        description: "Complex fungal trunk disease causing tiger-stripe leaf symptoms.",
        treatment: "Remove infected wood and seal pruning wounds against fungal entry."
    },
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": {
        description: "Fungal leaf spot causing premature defoliation in grapevines.",
        treatment: "Apply fungicides post-harvest and maintain vineyard sanitation."
    },
    "Grape___healthy": {
        description: "Healthy grapevine canopy.",
        treatment: "Maintain canopy pruning for sun exposure."
    },
    "Orange___Haunglongbing_(Citrus_greening)": {
        description: "Bacterial infection (Candidatus Liberibacter) spread by Asian citrus psyllid.",
        treatment: "Control psyllid vectors with insecticides and remove infected trees."
    },
    "Peach___Bacterial_spot": {
        description: "Caused by Xanthomonas campestris, leaving shot-hole spots on leaves.",
        treatment: "Apply copper sprays during dormancy and select resistant peach cultivars."
    },
    "Peach___healthy": {
        description: "No signs of bacterial or fungal infection.",
        treatment: "Maintain standard crop care."
    },
    "Pepper,_bell___Bacterial_spot": {
        description: "Caused by Xanthomonas bacteria, creating dark water-soaked spots.",
        treatment: "Use copper bactericides, seed treatment, and avoid overhead watering."
    },
    "Pepper,_bell___healthy": {
        description: "Healthy leaf tissue.",
        treatment: "Maintain balanced irrigation."
    },
    "Potato___Early_blight": {
        description: "Caused by Alternaria solani, characterized by concentric dark rings on leaves.",
        treatment: "Apply protectant fungicides and practice 3-year crop rotation."
    },
    "Potato___Late_blight": {
        description: "Severe pathogen Phytophthora infestans causing rapid dark water-soaked lesions.",
        treatment: "Destroy infected foliage immediately; apply systemic fungicides."
    },
    "Potato___healthy": {
        description: "Healthy foliage.",
        treatment: "Ensure adequate hilling and soil drainage."
    },
    "Raspberry___healthy": {
        description: "Healthy plant.",
        treatment: "Maintain proper pruning and air flow."
    },
    "Soybean___healthy": {
        description: "Healthy leaf structure.",
        treatment: "Practice standard field rotation."
    },
    "Squash___Powdery_mildew": {
        description: "Fungal infection creating white powdery coating on upper leaf surfaces.",
        treatment: "Apply potassium bicarbonate or sulfur sprays; avoid shaded plantings."
    },
    "Strawberry___Leaf_scorch": {
        description: "Caused by Diplocarpon earlianum, forming purplish spots on leaves.",
        treatment: "Remove old foliage post-harvest and use fungicide sprays."
    },
    "Strawberry___healthy": {
        description: "Healthy plant.",
        treatment: "Keep soil well-drained and weed-free."
    },
    "Tomato___Bacterial_spot": {
        description: "Caused by Xanthomonas bacteria, causing small, dark, water-soaked spots.",
        treatment: "Apply copper bactericides mixed with mancozeb; practice crop rotation."
    },
    "Tomato___Early_blight": {
        description: "Fungus Alternaria solani causing target-like brown spots on lower leaves.",
        treatment: "Prune lower leaves near soil level and apply fungicides like copper or chlorothalonil."
    },
    "Tomato___Late_blight": {
        description: "Devastating oomycete Phytophthora infestans causing pale green to brown lesions.",
        treatment: "Apply protective copper-based or systemic fungicides promptly."
    },
    "Tomato___Leaf_Mold": {
        description: "Caused by Passalora fulva; yellow spots appear on upper side with olive mold beneath.",
        treatment: "Reduce humidity in greenhouses and increase ventilation."
    },
    "Tomato___Septoria_leaf_spot": {
        description: "Caused by Septoria lycopersici; small circular spots with dark borders and gray centers.",
        treatment: "Remove lower infected leaves and avoid overhead foliage irrigation."
    },
    "Tomato___Spider_mites Two-spotted_spider_mite": {
        description: "Pest damage causing yellow speckled stippling and fine webbing.",
        treatment: "Apply insecticidal soap, neem oil, or specific miticides."
    },
    "Tomato___Target_Spot": {
        description: "Caused by Corynespora cassiicola, creating double-ring dark brown spots.",
        treatment: "Maintain plant spacing for airflow and apply foliage fungicides."
    },
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": {
        description: "Viral disease spread by whiteflies causing leaf curling and severe stunting.",
        treatment: "Control whitefly populations with yellow sticky traps and net covers."
    },
    "Tomato___Tomato_mosaic_virus": {
        description: "Highly contagious virus causing light and dark green mottled patterns on leaves.",
        treatment: "Remove infected plants immediately and sanitize tools in a 10% bleach solution."
    },
    "Tomato___healthy": {
        description: "Healthy leaf tissue with no disease symptoms.",
        treatment: "Provide consistent watering and balanced fertilization."
    }
};

// =========================================================
// 2. DYNAMIC NAVIGATION (CROPS -> FOLDERS -> IMAGES)
// =========================================================

async function loadCrops() {
    currentLevel = 'crops';
    activeCrop = null;
    activeFolder = null;

    updateNavigationHeader('Showing <span class="breadcrumb-current">All Crops</span>', false);

    const gridContainer = getGridContainer();
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div class="empty-msg">Loading crops...</div>';

    try {
        const res = await fetch('/api/crops');
        const crops = await res.json();

        gridContainer.innerHTML = '';
        if (!crops || crops.length === 0) {
            gridContainer.innerHTML = '<div class="empty-msg">No crop directories found in static/crops.</div>';
            return;
        }

        crops.forEach(crop => {
            const card = document.createElement('div');
            card.className = 'item-card crop-card';
            card.dataset.cropName = crop.name;

            let imageSrc = crop.icon || defaultImgPath;
            const iconHtml = `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(crop.name)}" onerror="handleImageError(this)">`;

            card.innerHTML = `
                <div class="media-container">${iconHtml}</div>
                <div class="card-title">${escapeHTML(crop.name)}</div>
            `;
            gridContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading crops:", err);
        gridContainer.innerHTML = '<div class="empty-msg">Error connecting to server backend.</div>';
    }
}

async function openCrop(cropName) {
    currentLevel = 'folders';
    activeCrop = cropName;
    activeFolder = null;
    updateNavigationHeader(`Crops &gt; <span class="breadcrumb-current">${escapeHTML(cropName)}</span>`, true);

    const gridContainer = getGridContainer();
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div class="empty-msg">Loading disease categories...</div>';

    try {
        const res = await fetch(`/api/crops/${encodeURIComponent(cropName)}/folders`);
        const folders = await res.json();

        gridContainer.innerHTML = '';
        if (!folders || folders.length === 0) {
            gridContainer.innerHTML = `<div class="empty-msg">No folders found for ${escapeHTML(cropName)}.</div>`;
            return;
        }

        folders.forEach(folder => {
            const card = document.createElement('div');
            card.className = 'item-card folder-card';
            card.dataset.cropName = cropName;
            card.dataset.folderId = folder.id;

            const imageSrc = folder.icon || defaultImgPath;
            const mediaHtml = `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(folder.name)}" onerror="handleImageError(this)">`;

            card.innerHTML = `
                <div class="media-container">${mediaHtml}</div>
                <div class="card-title">${escapeHTML(folder.name)}</div>
            `;
            gridContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading folders:", err);
        gridContainer.innerHTML = '<div class="empty-msg">Error loading disease categories.</div>';
    }
}

async function openFolder(cropName, folderId) {
    currentLevel = 'images';
    activeCrop = cropName;
    activeFolder = folderId;

    const folderDisplayName = folderId.replace(/___/g, ' - ').replace(/_/g, ' ');
    updateNavigationHeader(`Crops &gt; ${escapeHTML(cropName)} &gt; <span class="breadcrumb-current">${escapeHTML(folderDisplayName)}</span>`, true);

    const gridContainer = getGridContainer();
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div class="empty-msg">Loading images...</div>';

    try {
        const res = await fetch(`/api/crops/${encodeURIComponent(cropName)}/folders/${encodeURIComponent(folderId)}/images`);
        const images = await res.json();

        gridContainer.innerHTML = '';
        if (!images || images.length === 0) {
            gridContainer.innerHTML = `<div class="empty-msg">No images found in folder: <strong>${escapeHTML(folderDisplayName)}</strong></div>`;
            return;
        }

        images.forEach(imageItem => {
            const card = document.createElement('div');
            card.className = 'item-card image-card';

            const imgSrc = imageItem.url || defaultImgPath;
            const filename = imageItem.name || 'image.jpg';

            card.dataset.imageUrl = imgSrc;
            card.innerHTML = `
                <div class="media-container">
                    <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(filename)}" onerror="handleImageError(this)">
                </div>
                <div class="card-title">${escapeHTML(filename)}</div>
            `;
            gridContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading images:", err);
        gridContainer.innerHTML = '<div class="empty-msg">Error loading image directory.</div>';
    }
}

function selectImageForAnalysis(imageUrl) {
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = 'block';

    const validUrl = (imageUrl.startsWith('http') || imageUrl.startsWith('/')) ? imageUrl : `/${imageUrl}`;

    fetch(validUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to load image from path: ${validUrl}`);
            }
            return res.blob();
        })
        .then(blob => {
            if (spinner) spinner.style.display = 'none';

            const filename = validUrl.split('/').pop() || "sample_leaf.jpg";
            const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

            processFile(file, validUrl);

            const dropZone = document.getElementById('dropZone') || document.querySelector('.card');
            if (dropZone) {
                dropZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        })
        .catch(err => {
            if (spinner) spinner.style.display = 'none';
            console.error("Error fetching image for analysis:", err);
            alert("Could not load image file from path: " + validUrl);
        });
}

// =========================================================
// 3. EVENT LISTENERS & DELEGATION
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = 'none';

    const fileInput = document.getElementById('fileInput') || document.getElementById('imageInput');
    const dropZone = document.getElementById('dropZone');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resetBtn = document.getElementById('resetBtn');

    const cameraBtn = document.getElementById('cameraBtn');
    const openCamBtn = document.getElementById('openCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const closeCameraBtn = document.getElementById("closeCameraBtn");

    if (cameraBtn) {
        cameraBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startWebcam();
        });
    }

    if (openCamBtn) openCamBtn.addEventListener('click', startWebcam);
    if (closeCameraBtn) closeCameraBtn.addEventListener('click', stopWebcam);
    if (captureBtn) captureBtn.addEventListener('click', captureWebcamPhoto);

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', (e) => {
            if (e.target.closest('#resetBtn') || e.target.closest('#cameraBtn') || e.target.closest('#openCameraBtn')) return;
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const analyzeImageUrl = urlParams.get('analyze_image');

    if (analyzeImageUrl) {
        selectImageForAnalysis(analyzeImageUrl);
    } else {
        if (getGridContainer()) {
            loadCrops();
        }
    }

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            goBack();
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', uploadLeafImage);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetForm);
    }

    document.body.addEventListener('click', (e) => {
        const cropCard = e.target.closest('.crop-card:not(.folder-card)');
        if (cropCard) {
            const cropName = cropCard.dataset.cropName;
            if (cropName) openCrop(cropName);
            return;
        }

        const folderCard = e.target.closest('.folder-card');
        if (folderCard) {
            const cropName = folderCard.dataset.cropName || activeCrop;
            if (cropName && folderCard.dataset.folderId) openFolder(cropName, folderCard.dataset.folderId);
            return;
        }

        const imageCard = e.target.closest('.image-card');
        if (imageCard) {
            const imgEl = imageCard.querySelector('img');
            const imageUrl = imageCard.dataset.imageUrl || (imgEl ? imgEl.src : null);
            if (imageUrl) selectImageForAnalysis(imageUrl);
            return;
        }

        const customBackBtn = e.target.closest('.back-btn');
        if (customBackBtn && !e.target.closest('#backBtn')) {
            goBack();
            return;
        }
    });

    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files[0]) {
                if (fileInput) {
                    fileInput.files = files;
                }
                processFile(files[0]);
            }
        });
    }
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

// =========================================================
// 4. FILE PREVIEW & PREDICTION API
// =========================================================

function processFile(file, previewUrl = null) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please upload a valid image file (PNG, JPG, JPEG).');
        return;
    }

    selectedFile = file;

    const preview = document.getElementById('imagePreview') || document.getElementById('previewImage');
    const content = document.getElementById('dropZoneContent') || document.getElementById('uploadPlaceholder');
    const resultsPanel = document.getElementById('resultsPanel') || document.getElementById('resultContainer');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (preview) {
        preview.src = previewUrl || URL.createObjectURL(file);
        preview.style.display = 'block';
    }

    if (content) content.style.display = 'none';
    if (analyzeBtn) analyzeBtn.disabled = false;
    if (resetBtn) resetBtn.style.display = 'inline-block';

    if (resultsPanel) {
        resultsPanel.classList.remove('active');
        const card = document.querySelector('.card');
        if (card) card.classList.remove('has-results');
        setTimeout(() => {
            resultsPanel.style.display = 'none';
        }, 400);
    }
}

async function analyzeImage(imageFile) {
    const spinner = document.getElementById('spinner');
    const analyzeBtn = document.getElementById('analyzeBtn');

    if (spinner) spinner.style.display = 'block';
    if (analyzeBtn) analyzeBtn.disabled = true;

    // Send under 'file' matching Flask endpoint request.files['file']
    const formData = new FormData();
    formData.append('file', imageFile);

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            alert(`Error: ${data.error || "Unknown server error"}`);
        } else {
            console.log("Detection Success:", data);
            displayResults(data);
        }
    } catch (err) {
        console.error("Error analyzing image:", err);
        alert("Failed to connect to server. Check server terminal logs.");
    } finally {
        if (spinner) spinner.style.display = 'none';
        if (analyzeBtn) analyzeBtn.disabled = false;
    }
}

function uploadLeafImage() {
    const fileInput = document.getElementById('fileInput') || document.getElementById('imageInput');

    let imageToUpload = selectedFile;
    if (!imageToUpload && fileInput && fileInput.files && fileInput.files.length > 0) {
        imageToUpload = fileInput.files[0];
    }

    if (!imageToUpload) {
        alert("Please select or capture an image first.");
        return;
    }

    analyzeImage(imageToUpload);
}

function displayResults(data) {
    const resultsPanel = document.getElementById('resultsPanel') || document.getElementById('resultContainer');
    const detectionsContainer = document.getElementById('detectionsContainer');
    const resultStatus = document.getElementById('resultStatus');

    if (resultsPanel) {
        resultsPanel.style.display = 'block';
        const card = document.querySelector('.card');
        if (card) card.classList.add('has-results');
        setTimeout(() => {
            resultsPanel.classList.add('active');
        }, 10);
    }

    if (detectionsContainer) detectionsContainer.innerHTML = '';

    const rawClassName = data.class_name || data.prediction || data.disease || '';

    if (data && rawClassName) {
        const className = String(rawClassName).trim();
        const cleanName = data.clean_name || className.replace(/___/g, ' - ').replace(/_/g, ' ');

        // Use real percentage returned from Flask backend (e.g., 98.81)
        let displayScore = '0.00';
        if (data.percentage !== undefined && data.percentage !== null) {
            displayScore = Number(data.percentage).toFixed(2);
        } else if (data.confidence !== undefined && data.confidence !== null) {
            const rawVal = Number(data.confidence);
            displayScore = (rawVal <= 1 ? rawVal * 100 : rawVal).toFixed(2);
        }
        const percentage = `${displayScore}%`;

        // Knowledge base fallbacks
        const fallback = diseaseKnowledgeBase[className] || {};
        const description = data.description || fallback.description || "No specific details available for this condition.";
        const treatment = data.treatment || fallback.treatment || fallback.action || "Consult an agricultural extension specialist for treatment options.";

        if (resultStatus) resultStatus.innerText = `Diagnosis: ${cleanName}`;

        // Create single prediction display card
        const resultCard = document.createElement('div');
        resultCard.className = 'result-item';
        resultCard.style.cssText = `
            background-color: #1b201d;
            color: #ffffff;
            border: 1px solid #2a332d;
            border-radius: 8px;
            padding: 18px;
            margin-top: 12px;
            text-align: left;
        `;

        resultCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="color: #61c08e; font-weight: bold; font-size: 18px;">
                    ${escapeHTML(cleanName)}
                </span>
                <span style="background-color: #1b2e25; color: #85dfa9; font-size: 13px; font-weight: bold; padding: 4px 12px; border-radius: 12px; border: 1px solid #233e31;">
                    ${escapeHTML(percentage)} Confidence
                </span>
            </div>
            <div style="font-size: 14px; line-height: 1.6; color: #a0aab0;">
                <p style="margin: 0 0 10px 0;">
                    <strong style="color: #ffffff;">Description:</strong> ${escapeHTML(description)}
                </p>
                <p style="margin: 0;">
                    <strong style="color: #ffffff;">Recommended Action:</strong> ${escapeHTML(treatment)}
                </p>
            </div>
        `;
        
        if (detectionsContainer) detectionsContainer.appendChild(resultCard);
    } else if (detectionsContainer) {
        detectionsContainer.innerHTML = '<p style="color: #88928c; font-size: 14px;">Could not identify disease on leaf.</p>';
    }
}

function resetForm(e) {
    if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
    }

    stopWebcam();

    selectedFile = null;
    const fileInput = document.getElementById('fileInput') || document.getElementById('imageInput');
    if (fileInput) fileInput.value = '';

    const preview = document.getElementById('imagePreview') || document.getElementById('previewImage');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }

    const dropZoneContent = document.getElementById('dropZoneContent') || document.getElementById('uploadPlaceholder');
    if (dropZoneContent) dropZoneContent.style.display = 'block';

    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) analyzeBtn.disabled = true;

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.style.display = 'none';

    const resultsPanel = document.getElementById('resultsPanel') || document.getElementById('resultContainer');
    if (resultsPanel) {
        resultsPanel.classList.remove('active');
        const card = document.querySelector('.card');
        if (card) card.classList.remove('has-results');
        setTimeout(() => {
            resultsPanel.style.display = 'none';
        }, 400);
    }

    const detectionsContainer = document.getElementById('detectionsContainer');
    if (detectionsContainer) detectionsContainer.innerHTML = '';
}

// =========================================================
// 5. WEBCAM CONTROLS
// =========================================================

async function startWebcam() {
    const video = document.getElementById('webcamVideo');
    const cameraContainer = document.getElementById('cameraContainer') || document.getElementById('cameraModal');
    const closeCameraBtn = document.getElementById("closeCameraBtn");

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });

        if (video) {
            video.srcObject = mediaStream;
        }
        if (cameraContainer) {
            cameraContainer.style.display = 'block';
        }
        if (closeCameraBtn) {
            closeCameraBtn.style.display = "inline-block";
        }
    } catch (err) {
        console.error("Camera access error:", err);
        alert("Unable to access camera. Please check permissions.");
    }
}

function stopWebcam() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    const cameraContainer = document.getElementById('cameraContainer') || document.getElementById('cameraModal');
    const closeCameraBtn = document.getElementById("closeCameraBtn");

    if (cameraContainer) {
        cameraContainer.style.display = 'none';
    }
    if (closeCameraBtn) {
        closeCameraBtn.style.display = "none";
    }
}

function captureWebcamPhoto() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    const fileInput = document.getElementById('fileInput') || document.getElementById('imageInput');

    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        if (!blob) return;

        const capturedFile = new File([blob], `webcam_capture_${Date.now()}.jpg`, {
            type: 'image/jpeg'
        });

        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(capturedFile);
            fileInput.files = dataTransfer.files;
        }

        stopWebcam();
        processFile(capturedFile);
    }, 'image/jpeg', 0.95);
}