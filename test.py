import sys
import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR
import numpy as np

def test_ocr(pdf_path):
    print("Loading OCR engine...")
    engine = RapidOCR()
    
    print("Opening PDF: " + pdf_path)
    pdf = pdfium.PdfDocument(pdf_path)
    
    for i in range(min(2, len(pdf))): # Test first 2 pages
        page = pdf[i]
        # Render page to a numpy array (scale 3 for 216 DPI)
        bitmap = page.render(scale=3)
        pil_image = bitmap.to_pil()
        # Convert PIL Image to RGB Numpy array, which RapidOCR expects
        img_array = np.array(pil_image)
        
        print("\n--- Page " + str(i+1) + " ---")
        # Run OCR
        result, elapse = engine(img_array)
        
        if result:
            text = "\n".join([item[1] for item in result])
            print("Extracted characters: " + str(len(text)))
            print("Preview:")
            print(text[:200] + "...")
        else:
            print("No text found.")

if __name__ == "__main__":
    test_ocr(r"C:\Users\OhmerSulit\Downloads\0213202613feb_kashiv_limits152557.pdf")
