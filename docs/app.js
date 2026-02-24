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
        const ocrViewport = page.getViewport({ scale: ocrScale });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = ocrViewport.width;
        canvas.height = ocrViewport.height;

        await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        outPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);

        const { data } = await worker.recognize(canvas);
        
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
            words.sort((a, b) => {
                const yDiff = a.bbox.y0 - b.bbox.y0;
                if (Math.abs(yDiff) < 15) return a.bbox.x0 - b.bbox.x0;
                return yDiff;
            });

            words.forEach(word => {
                let text = word.text.trim();
                text = text.replace(/[^\x20-\x7E]/g, '');
                if (!text) return;
                
                hasPageText = true;
                totalText += text + " ";

                const x = word.bbox.x0 / ocrScale;
                const y = word.bbox.y0 / ocrScale;
                const w = (word.bbox.x1 - word.bbox.x0) / ocrScale;
                const h = (word.bbox.y1 - word.bbox.y0) / ocrScale;

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
                    scaleX = Math.max(50, Math.min(scaleX, 150));

                    let charSpace = 0;
                    if (scaleX === 150 && text.length > 1) {
                        const remainingW = w - (textWidth * 1.5);
                        if (remainingW > 0) charSpace = remainingW / (text.length - 1);
                    }

                    let angle = 0;
                    if (word.baseline && word.baseline.angle !== undefined) {
                        angle = word.baseline.angle;
                    } else if (h > (w * 1.5) && text.length > 2) {
                        angle = 90;
                    }

                    if (angle !== 0) {
                         if (Math.abs(angle) === 90) {
                             outPdf.setFontSize(Math.max(1, Math.min(w, 72)));
                         }
                    }

                    outPdf.text(text, x, y + (h * 0.85), {
                        renderingMode: "invisible",
                        horizontalScale: scaleX,
                        charSpace: Math.min(charSpace, 5),
                        angle: angle 
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
