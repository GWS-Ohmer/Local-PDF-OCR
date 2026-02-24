let jsPDF;
let dropZone, fileInput, fileList, startBtn, progressContainer, progressBar, statusText, previewText;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    // Wait until libraries are definitely loaded
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
        console.error("PDF.js library failed to load.");
    }

    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
    } else {
        console.error("jsPDF library failed to load.");
    }

    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    startBtn = document.getElementById('startBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    statusText = document.getElementById('statusText');
    previewText = document.getElementById('previewText');

    // Drag and Drop Handlers
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    dropZone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        dropZone.style.background = '#e9ecef'; 
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.background = '#fff';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = '#fff';
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    function handleFiles(files) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type === 'application/pdf') {
                selectedFiles.push(files[i]);
                const p = document.createElement('p');
                p.textContent = `📄 ${files[i].name}`;
                p.className = 'mb-1 font-monospace';
                fileList.appendChild(p);
            }
        }
        if (selectedFiles.length > 0) startBtn.disabled = false;
    }

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        dropZone.style.pointerEvents = 'none';
        progressContainer.style.display = 'block';

        for (let i = 0; i < selectedFiles.length; i++) {
            await processPDF(selectedFiles[i], i, selectedFiles.length);
        }

        statusText.innerText = "All PDFs processed successfully!";
        progressBar.style.width = '100%';
        progressBar.classList.remove('progress-bar-animated');
        startBtn.disabled = false;
        dropZone.style.pointerEvents = 'auto';
        selectedFiles = [];
        fileList.innerHTML = '';
        fileInput.value = ''; // Reset input
    });
});

async function processPDF(file, fileIndex, totalFiles) {
    statusText.innerText = `Loading ${file.name}...`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => console.log(m)
    });
    await worker.setParameters({
        tessedit_pageseg_mode: '1', // Auto segmentation with OSD
    });
    
    let outPdf = null;
    let totalText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusText.innerText = `File ${fileIndex + 1}/${totalFiles} | OCR Page ${pageNum}/${pdf.numPages}...`;
        const progress = (((fileIndex * pdf.numPages) + pageNum - 1) / (totalFiles * pdf.numPages)) * 100;
        progressBar.style.width = `${progress}%`;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        if (!outPdf) {
            outPdf = new jsPDF({
                orientation: viewport.width > viewport.height ? 'landscape' : 'portrait',
                unit: 'pt',
                format: [viewport.width, viewport.height]
            });
        } else {
            outPdf.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'landscape' : 'portrait');
            outPdf.setPage(pageNum);
        }

        // Render page to canvas at 2x scale for better OCR
        const ocrScale = 2.0;
        const ocrViewport = page.getViewport({ scale: ocrScale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = ocrViewport.width;
        canvas.height = ocrViewport.height;

        await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;

        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        outPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);

        // Run OCR
        const { data } = await worker.recognize(canvas);
        
        totalText += "\n--- Page " + pageNum + " ---\n";
        let hasText = false;

                // Flatten and sort words to ensure logical selection flow
        let allWords = [];
        if (data.blocks) {
            data.blocks.forEach(b => {
                if (b.paragraphs) b.paragraphs.forEach(p => {
                    if (p.lines) p.lines.forEach(l => {
                        if (l.words) allWords.push(...l.words);
                    });
                });
            });
        }
        if (allWords.length === 0 && data.words) allWords = data.words;

        if (allWords.length > 0) {
            // Sort words: Primary sort by Y (line-by-line), Secondary sort by X (left-to-right)
            // This is the "Secret Sauce" to smooth PDF text selection
            allWords.sort((a, b) => {
                const yDiff = a.bbox.y0 - b.bbox.y0;
                if (Math.abs(yDiff) < 15) return a.bbox.x0 - b.bbox.x0;
                return yDiff;
            });

            allWords.forEach(word => {
                const text = word.text.trim();
                if (!text) return;
                hasText = true;
                totalText += text + " ";

                // Coordinates in PDF points
                const x = word.bbox.x0 / ocrScale;
                const y = word.bbox.y0 / ocrScale;
                const w = (word.bbox.x1 - word.bbox.x0) / ocrScale;
                const h = (word.bbox.y1 - word.bbox.y0) / ocrScale;

                // Font size should match word height
                const fontSize = Math.max(1, Math.min(h, 80));
                outPdf.setFontSize(fontSize);

                const textWidth = outPdf.getTextWidth(text);
                
                // Use a safe horizontal scale to stretch the invisible text to the word box
                let scaleX = 100;
                if (textWidth > 1 && w > 1) {
                    scaleX = (w / textWidth) * 100;
                }
                
                // STATED FIX: Tight cap on scaling (60% to 180%) 
                // Any wider/narrower and PDF viewers start "randomly" highlighting surrounding areas
                scaleX = Math.max(60, Math.min(scaleX, 180));

                // Place text precisely at the word's baseline
                outPdf.text(text, x, y + (h * 0.85), {
                    renderingMode: "invisible",
                    horizontalScale: scaleX
                });
            });
        } else if (data.text) {
             totalText += data.text;
        }
        if(!hasText) totalText += "[No text found]";
        
        previewText.innerText = "Extracted Text Preview: \n" + totalText.substring(Math.max(0, totalText.length - 150)) + "...";
    }

    await worker.terminate();

    statusText.innerText = `Saving ${file.name.replace('.pdf', '_Searchable.pdf')}...`;
    outPdf.save(file.name.replace('.pdf', '_Searchable.pdf'));
}






