import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
from tkinter import ttk
import fitz # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
import numpy as np
import threading
import os
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color

class PDFExtractorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Local PDF Searchable Converter (OCR)")
        self.root.geometry("700x550")
        self.engine = RapidOCR()
        self.pdf_paths = []
        self.setup_ui()

    def setup_ui(self):
        file_frame = tk.Frame(self.root, pady=10, padx=10)
        file_frame.pack(fill=tk.X)
        self.btn_add = tk.Button(file_frame, text="Add PDF(s)", command=self.add_pdfs, width=15, bg="#4CAF50", fg="white", font=("Arial", 10, "bold"))
        self.btn_add.pack(side=tk.LEFT, padx=5)
        self.btn_clear = tk.Button(file_frame, text="Clear List", command=self.clear_pdfs, width=15, bg="#f44336", fg="white", font=("Arial", 10, "bold"))
        self.btn_clear.pack(side=tk.LEFT, padx=5)
        self.listbox = tk.Listbox(self.root, height=5)
        self.listbox.pack(fill=tk.X, padx=10, pady=5)
        action_frame = tk.Frame(self.root, pady=10)
        action_frame.pack(fill=tk.X, padx=10)
        self.btn_extract = tk.Button(action_frame, text="Make PDF(s) Searchable", command=self.start_extraction, width=25, bg="#2196F3", fg="white", font=("Arial", 10, "bold"))
        self.btn_extract.pack(side=tk.RIGHT, padx=5)
        self.progress_var = tk.DoubleVar()
        self.progress = ttk.Progressbar(self.root, variable=self.progress_var, maximum=100)
        self.progress.pack(fill=tk.X, padx=10, pady=10)
        self.status_label = tk.Label(self.root, text="Ready", fg="gray")
        self.status_label.pack()
        tk.Label(self.root, text="Extracted Text Preview:").pack(anchor=tk.W, padx=10)
        self.text_output = scrolledtext.ScrolledText(self.root, height=15, wrap=tk.WORD)
        self.text_output.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

    def add_pdfs(self):
        files = filedialog.askopenfilenames(filetypes=[("PDF Files", "*.pdf")])
        for f in files:
            if f not in self.pdf_paths:
                self.pdf_paths.append(f)
                self.listbox.insert(tk.END, os.path.basename(f))

    def clear_pdfs(self):
        self.pdf_paths.clear()
        self.listbox.delete(0, tk.END)
        self.text_output.delete(1.0, tk.END)
        self.status_label.config(text="Ready")
        self.progress_var.set(0)

    def start_extraction(self):
        if not self.pdf_paths:
            messagebox.showwarning("Warning", "Please add at least one PDF file first.")
            return
        self.btn_extract.config(state=tk.DISABLED)
        self.btn_add.config(state=tk.DISABLED)
        self.text_output.delete(1.0, tk.END)
        self.progress_var.set(0)
        thread = threading.Thread(target=self.run_ocr_process, daemon=True)
        thread.start()

    def run_ocr_process(self):
        total_files = len(self.pdf_paths)
        try:
            for i, pdf_path in enumerate(self.pdf_paths):
                self.update_status(f"Processing file {i+1} of {total_files}: {os.path.basename(pdf_path)}")
                
                doc = fitz.open(pdf_path)
                total_pages = len(doc)
                
                out_filename = os.path.splitext(pdf_path)[0] + "_Searchable.pdf"
                c = canvas.Canvas(out_filename)
                
                self.root.after(0, self.append_preview, f"\n=== File: {os.path.basename(pdf_path)} ===\n")
                
                for page_num in range(total_pages):
                    self.update_status(f"Processing file {i+1}/{total_files} | Page {page_num+1}/{total_pages}...")
                    
                    page = doc[page_num]
                    # PDF dimensions in points
                    width = page.rect.width
                    height = page.rect.height
                    c.setPageSize((width, height))
                    
                    # Zoom factor for OCR quality (approx 216 DPI)
                    zoom = 3.0
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    
                    # Save image temporarily to draw it with reportlab
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
                        temp_img_path = tf.name
                    pix.save(temp_img_path)
                    
                    # Draw the original page image
                    c.drawImage(temp_img_path, 0, 0, width=width, height=height)
                    try:
                        os.remove(temp_img_path)
                    except:
                        pass
                    
                    # Convert to numpy array for OCR
                    if pix.n == 4:
                        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 4)[:,:,:3]
                    elif pix.n == 1:
                        img_gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w)
                        img_array = np.stack((img_gray,)*3, axis=-1)
                    else:
                        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
                    
                    # Run RapidOCR
                    result, elapse = self.engine(img_array)
                    
                    page_text = f"\n--- Page {page_num+1} ---\n"
                    if result:
                        for item in result:
                            box = item[0]
                            text = item[1]
                            page_text += text + "\n"
                            
                            # RapidOCR box: [top-left, top-right, bottom-right, bottom-left]
                            # Coordinates in image space (zoomed) -> scale back to PDF points
                            x_tl = box[0][0] / zoom
                            y_tl = box[0][1] / zoom
                            x_br = box[2][0] / zoom
                            y_br = box[2][1] / zoom
                            
                            box_width = x_br - x_tl
                            box_height = y_br - y_tl
                            
                            if box_height < 1 or box_width < 1:
                                continue
                                
                            # ReportLab Y-axis is from bottom up!
                            # PyMuPDF/Image Y-axis is from top down.
                            # So, Y-coord in ReportLab = page.height - image_y
                            # The text baseline is near the bottom of the bounding box.
                            pdf_y = height - y_br
                            pdf_x = x_tl
                            
                            # Get the unscaled width of the text in our base font
                            base_width = c.stringWidth(text, "Helvetica", box_height)
                            if base_width == 0:
                                base_width = 1
                            
                            # How much we need to stretch the text horizontally to match the image box exactly (percentage)
                            scale_x = (box_width / base_width) * 100
                            
                            # Use text object for render mode and scaling
                            textobject = c.beginText(pdf_x, pdf_y)
                            textobject.setFont("Helvetica", box_height)
                            textobject.setTextRenderMode(3) # 3 = invisible text
                            textobject.setHorizScale(scale_x)
                            textobject.textOut(text)
                            c.drawText(textobject)
                    else:
                        page_text += "[No text found on this page]\n"
                    
                    c.showPage()
                    
                    progress_percent = ((i * total_pages) + (page_num + 1)) / (total_files * total_pages) * 100
                    self.root.after(0, self.progress_var.set, progress_percent)
                    self.root.after(0, self.append_preview, page_text)

                c.save()
                doc.close()

            self.update_status("Processing Complete!")
            self.root.after(0, messagebox.showinfo, "Success", "All PDFs have been converted to highly accurate Searchable PDFs!")
            
        except Exception as e:
            self.update_status("Error occurred.")
            self.root.after(0, messagebox.showerror, "Error", str(e))
        finally:
            self.root.after(0, self.enable_buttons)

    def update_status(self, msg):
        self.root.after(0, self.status_label.config, {"text": msg})

    def append_preview(self, text):
        self.text_output.insert(tk.END, text)
        self.text_output.see(tk.END)

    def enable_buttons(self):
        self.btn_extract.config(state=tk.NORMAL)
        self.btn_add.config(state=tk.NORMAL)

if __name__ == "__main__":
    root = tk.Tk()
    app = PDFExtractorApp(root)
    root.mainloop()