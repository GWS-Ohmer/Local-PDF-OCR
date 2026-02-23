# Local PDF Searchable Converter (OCR)

A powerful, 100% offline desktop application that converts scanned or image-based PDFs into fully searchable PDFs. It automatically detects text, calculates exact font sizes, and embeds invisible text layers perfectly aligned with the original images, allowing for highly accurate text highlighting, copying, and pasting.

## Features
- **100% Local & Private:** No data is sent to the cloud. All processing happens on your machine.
- **Orientation-Aware:** Uses advanced mathematical analysis to handle sideways or upside-down pages.
- **Accurate Selection:** Dynamically stretches and shrinks the invisible text layer to perfectly match the original image text width, solving the common "bad highlight" issue in standard OCR tools.
- **Batch Processing:** Drag and drop multiple PDFs to convert them all at once.

---

## How to Install & Use (For New Users)

Because this tool uses Python, you will need to install Python and a few code libraries for it to work. 

### Step 1: Install Python
1. Download and install **Python 3.10 or newer** from [python.org](https://www.python.org/downloads/).
2. **Important:** During the installation on Windows, make sure to check the box that says **"Add Python to PATH"** before clicking Install.

### Step 2: Download the Tool
1. Clone or download this repository to your computer.
2. Extract the folder to a location like your Desktop or Documents.

### Step 3: Setup the Environment
You need to install the required libraries. Open a Terminal (Command Prompt or PowerShell), navigate to the folder where you saved this tool, and run the following commands:

```bash
# Optional but recommended: Create a virtual environment
python -m venv venv

# Activate the virtual environment (Windows)
.\venv\Scripts\activate

# Install the required libraries
pip install -r requirements.txt
```

### Step 4: Run the Tool
Once the libraries are installed, you can start the application:

```bash
python main.py
```

*Tip for Windows Users:* You can create a simple `.bat` file containing `python main.py` and place a shortcut to it on your Desktop for easy double-click access!

---

## Technical Details (Dependencies)
This tool relies on the following incredible open-source libraries:
- `pypdfium2` & `PyMuPDF` - For fast, high-quality PDF rendering and manipulation.
- `rapidocr-onnxruntime` - A lightning-fast, highly accurate, offline OCR engine.
- `reportlab` - For advanced, mathematically precise PDF generation and text embedding.
- `numpy` - For image array processing.
