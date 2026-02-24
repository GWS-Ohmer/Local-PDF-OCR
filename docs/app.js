let jsPDF;
let dropZone, fileInput, fileList, startBtn, progressContainer, progressBar, statusText, previewText, debugMode;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
    }

    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    startBtn = document.getElementById('startBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    statusText = document.getElementById('statusText');
    previewText = document.getElementById('previewText');
    debugMode = document.getElementById('debugMode');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = '#e9ecef'; });
    dropZone.addEventListener('dragleave', () => dropZone.style.background = '#fff');
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = '#fff';
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFiles(e.target.files);
    });

    function handleFiles(files) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type === 'application/pdf') {
                selectedFiles.push(files[i]);
                const p = document.createElement('p');
                p.textContent = "?? " + files[i].name;
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
        startBtn.disabled = false;
        dropZone.style.pointerEvents = 'auto';
        selectedFiles = [];
        fileList.innerHTML = '';
        fileInput.value = '';
    });
});

async function processPDF(file, fileIndex, totalFiles) {
    statusText.innerText = "Loading " + file.name + "...";
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const worker = await Tesseract.createWorker('eng');

    let outPdf = null;
    let totalText = "";
    const isDebug = debugMode && debugMode.checked;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusText.innerText = "File " + (fileIndex + 1) + "/" + totalFiles + " | OCR Page " + pageNum + "/" + pdf.numPages + "...";
        progressBar.style.width = (((fileIndex * pdf.numPages) + pageNum - 1) / (totalFiles * pdf.numPages) * 100) + "%";

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        if (!outPdf) {
            outPdf = new jsPDF({
                orientation: viewport.width > viewport.height ? 'l' : 'p',
                unit: 'pt',
                format: [viewport.width, viewport.height]
            });
        } else {
            outPdf.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'l' : 'p');
            outPdf.setPage(pageNum);
        }

        const ocrScale = 2.0;
        // CRITICAL FIX: Base viewport scale on un-rotated dimensions to prevent skewing
        // PDF.js can auto-rotate viewports, which misaligns OCR coordinates. 
        // We force it to 0 rotation to get the raw page image.
        const baseViewport = page.getViewport({ scale: ocrScale, rotation: 0 });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = baseViewport.width;
        canvas.height = baseViewport.height;

        // Render the raw, un-rotated page
        await page.render({ canvasContext: ctx, viewport: baseViewport }).promise;
        
        // We still need to add the image to the PDF in its proper intended orientation
        const displayViewport = page.getViewport({ scale: 1.0 });
        
        // Run OCR on the RAW canvas. Tesseract will handle script detection natively.
        const { data } = await worker.recognize(canvas);

        // If the original PDF page was rotated (e.g. 90, 180, 270), we must rotate our OCR coordinates 
        // to match the final display viewport.
        const pageRotation = page.rotate || 0;
        
        // Add the base image to the PDF, handling PDF.js's built-in rotation display
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        if (pageRotation === 0) {
            outPdf.addImage(imgData, 'JPEG', 0, 0, displayViewport.width, displayViewport.height);
        } else {
             // For rotated pages, the simplest approach in jsPDF is to add the raw image 
             // and let the bounding box math handle the transformation.
             // However, to keep it simple, we use the displayViewport dims and apply matrix transforms later.
             // Since jsPDF addImage rotation is tricky, we'll draw the canvas upright.
             const rotCanvas = document.createElement('canvas');
             rotCanvas.width = displayViewport.width * ocrScale;
             rotCanvas.height = displayViewport.height * ocrScale;
             const rotCtx = rotCanvas.getContext('2d');
             
             rotCtx.translate(rotCanvas.width/2, rotCanvas.height/2);
             rotCtx.rotate(pageRotation * Math.PI / 180);
             rotCtx.drawImage(canvas, -canvas.width/2, -canvas.height/2);
             
             outPdf.addImage(rotCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, displayViewport.width, displayViewport.height);
        }
        
        let words = [];
        if (data.words) {
            words = data.words;
        } else if (data.blocks) {
            data.blocks.forEach(b => {
                if (b.paragraphs) b.paragraphs.forEach(p => {
                    if (p.lines) p.lines.forEach(l => {
                        if (l.words) words.push(...l.words);
                    });
                });
            });
        }

        totalText += "\n--- Page " + pageNum + " ---\n";
        let hasPageText = false;

        if (words.length > 0) {
            // Sort words by Y primarily, then X. This ensures the text stream in the PDF is logical.
            words.sort((a, b) => {
                const yDiff = a.bbox.y0 - b.bbox.y0;
                if (Math.abs(yDiff) < 15) return a.bbox.x0 - b.bbox.x0;
                return yDiff;
            });

            words.forEach(word => {
                let text = word.text.trim();
                // Strip non-printable characters to prevent width calculation errors
                text = text.replace(/[^\x20-\x7E]/g, '');
                if (!text) return;
                
                hasPageText = true;
                totalText += text + " ";

                let x = word.bbox.x0 / ocrScale;
                let y = word.bbox.y0 / ocrScale;
                let w = (word.bbox.x1 - word.bbox.x0) / ocrScale;
                let h = (word.bbox.y1 - word.bbox.y0) / ocrScale;

                // Transform coordinates if the page was originally rotated
                if (pageRotation === 90) {
                    const tempX = x;
                    x = displayViewport.width - (y + h);
                    y = tempX;
                    const tempW = w;
                    w = h;
                    h = tempW;
                } else if (pageRotation === 180) {
                    x = displayViewport.width - (x + w);
                    y = displayViewport.height - (y + h);
                } else if (pageRotation === 270) {
                    const tempX = x;
                    x = y;
                    y = displayViewport.height - (tempX + w);
                    const tempW = w;
                    w = h;
                    h = tempW;
                }

                // Set font size to match box height, capped for safety
                const fontSize = Math.max(1, Math.min(h, 72));
                outPdf.setFontSize(fontSize);
                outPdf.setFont("Helvetica");

                if (isDebug) {
                    outPdf.setDrawColor(255, 0, 0);
                    outPdf.rect(x, y, w, h);
                    outPdf.setTextColor(255, 0, 0);
                    outPdf.text(text, x, y + (h * 0.8), { renderingMode: "visible" });
                } else {
                    const textWidth = outPdf.getTextWidth(text);
                    let scaleX = 100;
                    if (textWidth > 1 && w > 1) {
                        scaleX = (w / textWidth) * 100;
                    }
                    // STRICT CAP: Scale between 50% and 150%. 
                    // Values outside this cause the "whole page highlight" bug.
                    scaleX = Math.max(50, Math.min(scaleX, 150));

                    // Use charSpace as a fallback or if scaleX is near 100
                    let charSpace = 0;
                    if (scaleX === 150 && text.length > 1) {
                        const remainingW = w - (textWidth * 1.5);
                        if (remainingW > 0) charSpace = remainingW / (text.length - 1);
                    }

                    outPdf.text(text, x, y + (h * 0.85), {
                        renderingMode: "invisible",
                        horizontalScale: scaleX,
                        charSpace: Math.min(charSpace, 5)
                    });
                }
            });
        }
        if (!hasPageText) totalText += "[No text found]";
        previewText.innerText = "Preview: \n" + totalText.substring(Math.max(0, totalText.length - 200));
    }

    await worker.terminate();

    statusText.innerText = "Saving " + file.name.replace('.pdf', '_Searchable.pdf') + "...";
    outPdf.save(file.name.replace('.pdf', '_Searchable.pdf'));
}

