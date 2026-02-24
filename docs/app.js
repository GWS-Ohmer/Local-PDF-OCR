let PDFDocument;
let dropZone, fileInput, fileList, startBtn, progressContainer, progressBar, statusText, previewText;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    if (window.PDFLib && window.PDFLib.PDFDocument) {
        PDFDocument = window.PDFLib.PDFDocument;
    }

    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    startBtn = document.getElementById('startBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    statusText = document.getElementById('statusText');
    previewText = document.getElementById('previewText');
    
    // Hide debug mode since we don't need it with native PDF
    const debugToggle = document.getElementById('debugMode');
    if(debugToggle) debugToggle.parentElement.style.display = 'none';

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
    
    const worker = await Tesseract.createWorker('eng', 1);
    await worker.setParameters({
        tessedit_pageseg_mode: '1',
    });
    
    // We will use pdf-lib ONLY to stitch the native Tesseract PDFs together
    const masterPdf = await PDFDocument.create();
    let totalText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusText.innerText = "File " + (fileIndex+1) + "/" + totalFiles + " | OCR Page " + pageNum + "/" + pdf.numPages + "...";
        progressBar.style.width = (((fileIndex * pdf.numPages) + pageNum - 1) / (totalFiles * pdf.numPages) * 100) + "%";

        const page = await pdf.getPage(pageNum);
        
        // 1.5 scale is the sweet spot. Tesseract will internally map coordinates
        // back to standard dimensions when generating its PDF.
        const ocrViewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = ocrViewport.width;
        canvas.height = ocrViewport.height;

        await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.9);

        // Native PDF generation!
        const { data } = await worker.recognize(imgData, { pdfTitle: 'Scanned Document' }, { pdf: true });
        
        totalText += "\n--- Page " + pageNum + " ---\n" + (data.text || "");
        previewText.innerText = "Preview: \n" + totalText.substring(Math.max(0, totalText.length - 200));

        if (data.pdf) {
            // Load the Tesseract-generated page
            const pageDoc = await PDFDocument.load(new Uint8Array(data.pdf));
            
            // Embed the Tesseract page into our master document as a "template"
            const [embeddedPage] = await masterPdf.embedPdf(pageDoc, [0]);
            
            // Create a brand new page in the master PDF that matches the original size exactly
            const originalViewport = page.getViewport({ scale: 1.0 });
            const newPage = masterPdf.addPage([originalViewport.width, originalViewport.height]);
            
            // Draw the OCR'd content onto the new page, stretched/shrunk to fit exactly
            newPage.drawPage(embeddedPage, {
                x: 0,
                y: 0,
                width: originalViewport.width,
                height: originalViewport.height,
            });
        }
    }

    await worker.terminate();
    statusText.innerText = "Saving " + file.name.replace('.pdf', '_Searchable.pdf') + "...";

    const pdfBytes = await masterPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace('.pdf', '_Searchable.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


