import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Trash2, 
  Type, 
  Loader2, 
  MousePointer,
  Maximize,
  FileJson,
  FileText
} from 'lucide-react';

// Tesseract.js CDN Loading Helper
const useTesseract = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (window.Tesseract) {
      setIsLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => setIsLoaded(true);
    document.body.appendChild(script);
  }, []);

  return isLoaded;
};

export default function App() {
  const tesseractLoaded = useTesseract();
  
  // State
  const [image, setImage] = useState(null); // Image object
  const [imageSrc, setImageSrc] = useState(null); // URL string
  const [scale, setScale] = useState(1.0);
  const [rects, setRects] = useState([]); // { id, x, y, w, h, text, isOcrRunning }
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState(null); // Temporary rect while dragging
  const [selectedRectId, setSelectedRectId] = useState(null);
  const [isOcrEnabled, setIsOcrEnabled] = useState(true);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Load Image
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setImageSrc(img.src);
        setRects([]);
        setScale(1.0); // Reset scale
        // Fit to screen initially if too large
        if (img.width > 800) {
           setScale(parseFloat((800 / img.width).toFixed(2)));
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Draw Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size based on zoom
    const displayWidth = Math.floor(image.naturalWidth * scale);
    const displayHeight = Math.floor(image.naturalHeight * scale);
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Draw Image
    ctx.drawImage(image, 0, 0, displayWidth, displayHeight);

    // Draw Rects
    [...rects, currentRect].forEach(rect => {
      if (!rect) return;
      
      // Convert stored coordinates (original scale) to display scale
      const x = rect.x * scale;
      const y = rect.y * scale;
      const w = rect.w * scale;
      const h = rect.h * scale;

      ctx.strokeStyle = rect.id === selectedRectId ? '#ef4444' : '#3b82f6'; // Red if selected, Blue otherwise
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      
      // Draw background for text readability
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(x, y, w, h);
    });

  }, [image, scale, rects, currentRect, selectedRectId]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse Events for Drawing
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale, // Store in original image coordinates
      y: (e.clientY - rect.top) / scale
    };
  };

  const handleMouseDown = (e) => {
    if (!image) return;
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setSelectedRectId(null);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
      id: 'temp'
    });
  };

  const runOcr = async (rectItem) => {
    if (!window.Tesseract || !isOcrEnabled) return;

    // Update state to loading
    setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, isOcrRunning: true } : r));

    try {
        // Crop image for OCR
        const canvas = document.createElement('canvas');
        canvas.width = rectItem.w;
        canvas.height = rectItem.h;
        const ctx = canvas.getContext('2d');
        
        // Draw only the cropped part
        ctx.drawImage(
            image,
            rectItem.x, rectItem.y, rectItem.w, rectItem.h, // Source
            0, 0, rectItem.w, rectItem.h // Destination
        );

        const result = await window.Tesseract.recognize(
            canvas,
            'jpn+eng', // Japanese and English
            { 
                // logger: m => console.log(m) // Optional logger
            }
        );

        const text = result.data.text.trim();

        setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, text: text, isOcrRunning: false } : r));

    } catch (err) {
        console.error("OCR Error", err);
        setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, text: "Error", isOcrRunning: false } : r));
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentRect && currentRect.w > 5 && currentRect.h > 5) {
      const newRect = {
        ...currentRect,
        id: Date.now(),
        text: '',
        isOcrRunning: false
      };
      
      setRects(prev => [...prev, newRect]);
      setCurrentRect(null);
      
      // Trigger OCR
      runOcr(newRect);
    } else {
        setCurrentRect(null);
    }
  };

  // Actions
  const handleDeleteRect = (id) => {
    setRects(prev => prev.filter(r => r.id !== id));
  };

  const handleTextChange = (id, newText) => {
    setRects(prev => prev.map(r => r.id === id ? { ...r, text: newText } : r));
  };

  const handleExportCSV = () => {
    const header = "id,x,y,width,height,text\n";
    const rows = rects.map(r => `${r.id},${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)},"${r.text.replace(/"/g, '""')}"`).join("\n");
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'annotations.csv';
    link.click();
  };

  const handleExportJSON = () => {
    const data = JSON.stringify(rects.map(r => ({
        id: r.id,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.w),
        height: Math.round(r.h),
        text: r.text
    })), null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'annotations.json';
    link.click();
  };

  // Zoom Controls
  const handleZoomSlider = (e) => {
      setScale(parseFloat(e.target.value));
  };

  const handleZoomStep = (step) => {
      setScale(prev => {
          const next = prev + step;
          return Math.min(Math.max(0.1, next), 5.0); // Limit between 10% and 500%
      });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* Header / Toolbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-700 flex items-center gap-2">
            <Maximize className="w-6 h-6 text-blue-600" />
            OCR Annotation Tool
          </h1>
          
          <div className="h-6 w-px bg-gray-300 mx-2"></div>

          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-md transition-colors">
            <Upload size={18} />
            <span className="text-sm font-medium">画像を開く</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        <div className="flex items-center space-x-4">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded-lg">
                <button 
                    onClick={() => handleZoomStep(-0.05)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600"
                    title="5%縮小"
                >
                    <ZoomOut size={18} />
                </button>
                
                <input 
                    type="range" 
                    min="0.1" 
                    max="3.0" 
                    step="0.05" 
                    value={scale} 
                    onChange={handleZoomSlider}
                    className="w-32 h-2 mx-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
                
                <button 
                    onClick={() => handleZoomStep(0.05)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600"
                    title="5%拡大"
                >
                    <ZoomIn size={18} />
                </button>
                
                <span className="text-xs w-12 text-right font-mono font-medium text-gray-600 border-l border-gray-300 ml-2 pl-2">
                    {Math.round(scale * 100)}%
                </span>
            </div>

            <div className="h-6 w-px bg-gray-300"></div>

            <button 
                onClick={() => setIsOcrEnabled(!isOcrEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${isOcrEnabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                title="OCR機能のON/OFF"
            >
                <Type size={16} />
                OCR: {isOcrEnabled ? "ON" : "OFF"}
            </button>

            <div className="flex space-x-2">
                <button 
                    onClick={handleExportCSV}
                    disabled={rects.length === 0}
                    className="flex items-center gap-1 bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="CSVとして保存"
                >
                    <FileText size={16} />
                    <span className="text-sm">CSV</span>
                </button>
                <button 
                    onClick={handleExportJSON}
                    disabled={rects.length === 0}
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="JSONとして保存"
                >
                    <FileJson size={16} />
                    <span className="text-sm">JSON</span>
                </button>
            </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Main Canvas Area - Scroll container */}
        <div 
            ref={containerRef}
            className="flex-1 bg-gray-200 overflow-auto flex relative"
            style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
        >
          {/* Inner wrapper with margin: auto for safe centering */}
          <div className="m-auto p-8">
            {!image && (
                <div className="text-center text-gray-400">
                    <Upload className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">画像をアップロードしてください</p>
                </div>
            )}
            
            {image && (
                <div className="shadow-2xl border border-gray-300 bg-white relative" style={{ lineHeight: 0 }}>
                    <canvas 
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        className="block"
                    />
                </div>
            )}
          </div>
        </div>

        {/* Sidebar / Annotation List */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl z-10 shrink-0">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <MousePointer size={16} />
                    アノテーション一覧
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{rects.length}</span>
                </h2>
                {!tesseractLoaded && (
                    <div className="mt-2 text-xs text-orange-600 flex items-center gap-1 bg-orange-50 p-2 rounded">
                        <Loader2 size={12} className="animate-spin" />
                        OCRエンジンをロード中...
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {rects.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center mt-10">
                        画像上をドラッグして<br/>矩形を選択してください。
                    </p>
                ) : (
                    rects.map((rect, index) => (
                        <div 
                            key={rect.id} 
                            className={`p-3 rounded-lg border transition-all ${selectedRectId === rect.id ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                            onClick={() => setSelectedRectId(rect.id)}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                    #{index + 1} (x:{Math.round(rect.x)}, y:{Math.round(rect.y)})
                                </span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteRect(rect.id); }}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    title="削除"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            
                            <div className="relative">
                                {rect.isOcrRunning ? (
                                    <div className="flex items-center gap-2 text-xs text-blue-600 h-9 bg-blue-50/50 rounded px-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        文字を読み取り中...
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <textarea
                                            value={rect.text}
                                            onChange={(e) => handleTextChange(rect.id, e.target.value)}
                                            className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[60px] resize-y"
                                            placeholder="テキストを入力..."
                                        />
                                        {rect.text === '' && !rect.isOcrRunning && isOcrEnabled && (
                                            <div className="absolute top-2 left-2 text-xs text-gray-300 pointer-events-none">
                                                文字なし
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 text-center">
               矩形作成時に自動でOCRが実行されます
            </div>
        </div>

      </div>
    </div>
  );
}
