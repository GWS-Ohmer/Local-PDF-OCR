let PDFDocument;
let dropZone, fileInput, fileList, startBtn, progressContainer, progressBar, statusText, previewText;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
        console.error("PDF.js library failed to load.");
    }

    if (window.PDFLib && window.PDFLib.PDFDocument) {
        PDFDocument = window.PDFLib.PDFDocument;
    } else {
        console.error("pdf-lib library failed to load.");
    }

    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    startBtn = document.getElementById('startBtn');
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    statusText = document.getElementById('statusText');
    previewText = document.getElementById('previewText');

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
                p.textContent = ??  + files[i].name;
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
        fileInput.value = ''; 
    });
});

async function processPDF(file, fileIndex, totalFiles) {
    statusText.innerText = Loading  + file.name + ...;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const worker = await Tesseract.createWorker('eng');

    const masterPdf = await PDFDocument.create();
    let totalText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusText.innerText = File  + (fileIndex + 1) + / + totalFiles +  | OCR Page  + pageNum + / + pdf.numPages + ...;
        const progress = (((fileIndex * pdf.numPages) + pageNum - 1) / (totalFiles * pdf.numPages)) * 100;
        progressBar.style.width = progress + '%';

        const page = await pdf.getPage(pageNum);
        
        // Render page to canvas at 2x scale for better OCR accuracy
        const ocrScale = 2.0;
        const ocrViewport = page.getViewport({ scale: ocrScale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = ocrViewport.width;
        canvas.height = ocrViewport.height;

        await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;

        // Convert canvas to a Base64 image
        const imgData = canvas.toDataURL('image/jpeg', 0.8);

        // Tell Tesseract to generate a searchable PDF for this image natively
        const { data } = await worker.recognize(imgData, { pdfTitle: 'Page ' + pageNum }, { pdf: true });
        
        totalText += "\n--- Page " + pageNum + " ---\n";
        if (data.text && data.text.trim()) {
            totalText += data.text.trim();
        } else {
            totalText += "[No text found]";
        }
        previewText.innerText = "Extracted Text Preview: \n" + totalText.substring(Math.max(0, totalText.length - 150)) + "...";

        // Parse the PDF byte array returned by Tesseract
        if (data.pdf) {
            const pageDoc = await PDFDocument.load(new Uint8Array(data.pdf));
            const [copiedPage] = await masterPdf.copyPages(pageDoc, [0]);
            masterPdf.addPage(copiedPage);
        }
    }

    await worker.terminate();

    statusText.innerText = Saving  + file.name.replace('.pdf', '_Searchable.pdf') + ...;
    
    // Serialize the PDFDocument to bytes (a Uint8Array)
    const pdfBytes = await masterPdf.save();
    
    // Trigger download
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
