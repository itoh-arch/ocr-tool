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
  FileText,
  ChevronLeft,
  ChevronRight,
  Layers
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
  
  // State Structure Changed for Multi-page
  // pages: Array of { id, file, src, rects: [], name, width, height }
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  // Current Image Element (for Canvas drawing)
  const [currentImageElem, setCurrentImageElem] = useState(null);
  
  const [scale, setScale] = useState(1.0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState(null); // Temporary rect while dragging
  const [selectedRectId, setSelectedRectId] = useState(null);
  const [isOcrEnabled, setIsOcrEnabled] = useState(true);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Helper to get current page data
  const currentPage = pages[currentPageIndex];
  const rects = currentPage ? currentPage.rects : [];

  // Wrapper to update rects for the current page
  const setRects = (newRectsOrUpdater) => {
    setPages(prevPages => {
        const newPages = [...prevPages];
        const currentRects = newPages[currentPageIndex].rects;
        
        let updatedRects;
        if (typeof newRectsOrUpdater === 'function') {
            updatedRects = newRectsOrUpdater(currentRects);
        } else {
            updatedRects = newRectsOrUpdater;
        }
        
        newPages[currentPageIndex] = {
            ...newPages[currentPageIndex],
            rects: updatedRects
        };
        return newPages;
    });
  };

  // Load Images (Multiple)
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newPages = files.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        src: URL.createObjectURL(file),
        name: file.name,
        rects: [], // Each page has its own annotations
        width: 0,  // Will be set when loaded
        height: 0
    }));

    setPages(prev => [...prev, ...newPages]);
    
    // If it's the first upload, ensure we start at index 0 (or keep current if appending)
    if (pages.length === 0) {
        setCurrentPageIndex(0);
        setScale(1.0);
    }
  };

  // Load current image element when page index changes
  useEffect(() => {
    if (!currentPage) {
        setCurrentImageElem(null);
        return;
    }

    const img = new Image();
    img.onload = () => {
        setCurrentImageElem(img);
        // Optional: update page dimensions in state if needed, 
        // but we mostly need them for display.
        
        // Fit to screen initially if new page and scale is default? 
        // Keeping scale persistent across page turns is usually better UX.
    };
    img.src = currentPage.src;
    
    // Cleanup URL objects is tricky with history, usually done on unmount.
    // For simplicity in this scope, we rely on browser GC or page refresh.

  }, [currentPage?.src]); // Only re-run if source changes

  // Draw Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImageElem) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size based on zoom
    const displayWidth = Math.floor(currentImageElem.naturalWidth * scale);
    const displayHeight = Math.floor(currentImageElem.naturalHeight * scale);
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Draw Image
    ctx.drawImage(currentImageElem, 0, 0, displayWidth, displayHeight);

    // Draw Rects
    [...rects, currentRect].forEach(rect => {
      if (!rect) return;
      
      // Convert stored coordinates (original scale) to display scale
      const x = rect.x * scale;
      const y = rect.y * scale;
      const w = rect.w * scale;
      const h = rect.h * scale;

      ctx.strokeStyle = rect.id === selectedRectId ? '#ef4444' : '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      
      // Draw background for text readability
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(x, y, w, h);
    });

  }, [currentImageElem, scale, rects, currentRect, selectedRectId]);

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
    if (!currentImageElem) return;
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
    if (!window.Tesseract || !isOcrEnabled || !currentImageElem) return;

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
            currentImageElem,
            rectItem.x, rectItem.y, rectItem.w, rectItem.h, // Source
            0, 0, rectItem.w, rectItem.h // Destination
        );

        const result = await window.Tesseract.recognize(
            canvas,
            'jpn+eng', 
            {}
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
      
      // Add to list first
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
    // Export CURRENT PAGE only (Can be modified to export all)
    if (!currentPage) return;

    const header = "page_name,id,x,y,width,height,text\n";
    const rows = rects.map(r => `"${currentPage.name}",${r.id},${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)},"${r.text.replace(/"/g, '""')}"`).join("\n");
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentPage.name}_annotations.csv`;
    link.click();
  };

  const handleExportJSON = () => {
     // Export ALL PAGES for JSON usually makes more sense, but let's stick to current for consistency or all?
     // Let's export Current Page to match button label context, or maybe ALL pages structure.
     // For now: Current Page JSON.
    if (!currentPage) return;

    const data = JSON.stringify({
        image: currentPage.name,
        annotations: rects.map(r => ({
            id: r.id,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.w),
            height: Math.round(r.h),
            text: r.text
        }))
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentPage.name}_annotations.json`;
    link.click();
  };

  // Zoom Controls
  const handleZoomSlider = (e) => {
      setScale(parseFloat(e.target.value));
  };

  const handleZoomStep = (step) => {
      setScale(prev => {
          const next = prev + step;
          return Math.min(Math.max(0.1, next), 5.0); 
      });
  };

  // Pagination Controls
  const handlePrevPage = () => {
      setCurrentPageIndex(prev => Math.max(0, prev - 1));
      setSelectedRectId(null);
  };

  const handleNextPage = () => {
      setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1));
      setSelectedRectId(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* Header / Toolbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0 overflow-x-auto">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-700 flex items-center gap-2 whitespace-nowrap">
            <Maximize className="w-6 h-6 text-blue-600" />
            OCR Tool
          </h1>
          
          <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-md transition-colors whitespace-nowrap">
            <Upload size={18} />
            <span className="text-sm font-medium">画像追加</span>
            {/* Added 'multiple' attribute */}
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        {/* Pagination Controls (Center) */}
        {pages.length > 0 && (
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1 mx-4">
                <button 
                    onClick={handlePrevPage}
                    disabled={currentPageIndex === 0}
                    className="p-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-mono w-20 text-center">
                    {currentPageIndex + 1} / {pages.length}
                </span>
                <button 
                    onClick={handleNextPage}
                    disabled={currentPageIndex === pages.length - 1}
                    className="p-1.5 rounded hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        )}

        <div className="flex items-center space-x-4">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded-lg hidden md:flex">
                <button 
                    onClick={() => handleZoomStep(-0.05)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600"
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
                    className="w-20 lg:w-32 h-2 mx-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
                
                <button 
                    onClick={() => handleZoomStep(0.05)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600"
                >
                    <ZoomIn size={18} />
                </button>
                
                <span className="text-xs w-10 text-right font-mono font-medium text-gray-600 ml-1">
                    {Math.round(scale * 100)}%
                </span>
            </div>

            <div className="h-6 w-px bg-gray-300 hidden md:block"></div>

            <button 
                onClick={() => setIsOcrEnabled(!isOcrEnabled)}
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${isOcrEnabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            >
                <Type size={16} />
                <span className="hidden lg:inline">OCR: {isOcrEnabled ? "ON" : "OFF"}</span>
            </button>

            <div className="flex space-x-2">
                <button 
                    onClick={handleExportCSV}
                    disabled={rects.length === 0}
                    className="flex items-center gap-1 bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="現在のページをCSV出力"
                >
                    <FileText size={16} />
                </button>
                <button 
                    onClick={handleExportJSON}
                    disabled={rects.length === 0}
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="現在のページをJSON出力"
                >
                    <FileJson size={16} />
                </button>
            </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Main Canvas Area */}
        <div 
            ref={containerRef}
            className="flex-1 bg-gray-200 overflow-auto flex relative"
            style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
        >
          <div className="m-auto p-8">
            {pages.length === 0 ? (
                <div className="text-center text-gray-400">
                    <Layers className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">画像をアップロードしてください<br/>（複数選択可）</p>
                </div>
            ) : (
                <>
                    {currentImageElem && (
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
                    {!currentImageElem && (
                         <div className="flex items-center gap-2 text-gray-500">
                             <Loader2 className="animate-spin" /> 読み込み中...
                         </div>
                    )}
                </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl z-10 shrink-0">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                     <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                        <MousePointer size={16} />
                        アノテーション
                    </h2>
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                        {rects.length}
                    </span>
                </div>
                {currentPage && (
                    <div className="text-xs text-gray-500 truncate" title={currentPage.name}>
                        File: {currentPage.name}
                    </div>
                )}
                {!tesseractLoaded && (
                    <div className="mt-2 text-xs text-orange-600 flex items-center gap-1 bg-orange-50 p-2 rounded">
                        <Loader2 size={12} className="animate-spin" />
                        OCR準備中...
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {pages.length === 0 ? (
                     <p className="text-sm text-gray-400 text-center mt-10">
                        画像がありません
                     </p>
                ) : rects.length === 0 ? (
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
                                    #{index + 1}
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
                                        解析中...
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <textarea
                                            value={rect.text}
                                            onChange={(e) => handleTextChange(rect.id, e.target.value)}
                                            className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[60px] resize-y"
                                            placeholder="テキスト..."
                                        />
                                        {rect.text === '' && !rect.isOcrRunning && isOcrEnabled && (
                                            <div className="absolute top-2 left-2 text-xs text-gray-300 pointer-events-none">
                                                (空)
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
               {pages.length > 0 ? `${currentPageIndex + 1} / ${pages.length} ページ目` : "待機中"}
            </div>
        </div>

      </div>
    </div>
  );
}
