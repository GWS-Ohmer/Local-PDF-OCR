import fitz # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
import numpy as np

pdf_path = r"C:\Users\OhmerSulit\Downloads\0213202613feb_kashiv_limits152557.pdf"

print("Loading RapidOCR...")
engine = RapidOCR()

print("Opening original PDF...")
doc = fitz.open(pdf_path)

out_pdf = fitz.open()

for page_num in range(min(1, len(doc))):
    print(f"Processing page {page_num+1}...")
    page = doc[page_num]
    
    # We want to extract image of the page to pass to OCR
    zoom = 3.0 # ~216 DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    
    # Convert pix to RGB numpy array for OCR
    if pix.n == 4:
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 4)[:,:,:3]
    elif pix.n == 1:
        img_gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w)
        img_array = np.stack((img_gray,)*3, axis=-1)
    else:
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
        
    result, _ = engine(img_array)
    
    # Create a new page with the exact dimensions of the original
    out_page = out_pdf.new_page(width=page.rect.width, height=page.rect.height)
    
    # Insert the image into the new page, covering the entire page
    out_page.insert_image(page.rect, pixmap=pix)
    
    if result:
        for item in result:
            box = item[0]
            text = item[1]
            
            # Scale coordinates back to original PDF space
            x0 = box[0][0] / zoom
            y0 = box[0][1] / zoom
            x1 = box[1][0] / zoom
            y1 = box[2][1] / zoom
            
            # Ensure proper rectangle coordinates
            x_min = min(x0, x1)
            x_max = max(x0, x1)
            y_min = min(y0, y1)
            y_max = max(y0, y1)
            
            # Minimum dimension to avoid errors
            if x_max - x_min < 1: x_max = x_min + 1
            if y_max - y_min < 1: y_max = y_min + 1
            
            rect = fitz.Rect(x_min, y_min, x_max, y_max)
            try:
                # render_mode=3 is invisible text
                out_page.insert_textbox(rect, text, render_mode=3)
            except Exception as e:
                pass
                
print("Saving searchable PDF...")
out_pdf.save("test_searchable.pdf")
print("Done!")
