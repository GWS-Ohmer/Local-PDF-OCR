let PDFDocument;
let dropZone, fileInput, fileList, startBtn, progressContainer, progressBar, statusText, previewText;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    if (window.PDFLib) {
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

        statusText.innerText = "Processing Complete!";
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
    
    // Use the latest Tesseract worker
    const worker = await Tesseract.createWorker('eng', 1);
    
    // Create the master PDF using pdf-lib
    const masterPdf = await PDFDocument.create();
    let totalText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusText.innerText = "File " + (fileIndex+1) + "/" + totalFiles + " | OCR Page " + pageNum + "/" + pdf.numPages + "...";
        progressBar.style.width = (((fileIndex * pdf.numPages) + pageNum - 1) / (totalFiles * pdf.numPages) * 100) + "%";

        const page = await pdf.getPage(pageNum);
        
        // CRITICAL: Render at 1.0 scale (72 DPI) to match PDF point coordinates exactly
        // This eliminates the "random highlighting" caused by coordinate mismatch.
        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // Generate searchable PDF natively in Tesseract
        // This is the most accurate way to handle the text layer.
        const { data } = await worker.recognize(imgData, {}, { pdf: true });
        
        totalText += "\n--- Page " + pageNum + " ---\n" + (data.text || "");
        previewText.innerText = "Preview: \n" + totalText.substring(Math.max(0, totalText.length - 200));

        if (data.pdf) {
            const pageDoc = await PDFDocument.load(new Uint8Array(data.pdf));
            const [copiedPage] = await masterPdf.copyPages(pageDoc, [0]);
            
            // Ensure the page size is exactly the same as the original PDF points
            copiedPage.setSize(viewport.width, viewport.height);
            masterPdf.addPage(copiedPage);
        }
    }

    await worker.terminate();

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
