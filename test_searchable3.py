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
            x_bottom_right = box[2][0] / zoom
            y_bottom_right = box[2][1] / zoom
            
            # Create a rectangle for the text
            rect = fitz.Rect(x_top_left, y_top_left, x_bottom_right, y_bottom_right)
            
            try:
                # render_mode=3 makes text invisible
                # fontsize=-1 makes PyMuPDF calculate the best font size to fit the rect exactly
                out_page.insert_textbox(rect, text, fontsize=-1, render_mode=3, align=fitz.TEXT_ALIGN_LEFT)
            except Exception as e:
                print(f"Failed to insert text '{text}': {e}")
                pass
                
print("Saving searchable PDF...")
out_pdf.save("test_searchable3.pdf")
print("Done!")
