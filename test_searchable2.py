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
    
    # Extract image of the page to pass to OCR
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
    
    out_page = out_pdf.new_page(width=page.rect.width, height=page.rect.height)
    out_page.insert_image(page.rect, pixmap=pix)
    
    if result:
        for item in result:
            box = item[0]
            text = item[1]
            
            # RapidOCR box: [top-left, top-right, bottom-right, bottom-left]
            x_top_left = box[0][0] / zoom
            y_top_left = box[0][1] / zoom
            y_bottom_left = box[3][1] / zoom
            
            # Calculate font size based on the height of the bounding box
            fontsize = y_bottom_left - y_top_left
            if fontsize < 1:
                fontsize = 10 # fallback
                
            # PyMuPDF insert_text expects the bottom-left point of the text
            # We add a little offset to y_bottom_left so it sits properly
            point = fitz.Point(x_top_left, y_bottom_left)
            
            try:
                # render_mode=3 makes text invisible
                out_page.insert_text(point, text, fontsize=fontsize, render_mode=3)
            except Exception as e:
                print(f"Failed to insert text '{text}': {e}")
                pass
                
print("Saving searchable PDF...")
out_pdf.save("test_searchable2.pdf")
print("Done!")
