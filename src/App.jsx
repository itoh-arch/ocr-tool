import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Trash2, 
  Type, 
  Loader2, 
  MousePointer,
  Maximize,
  FileJson,
  FileText,
  ChevronLeft,
  ChevronRight,
  Layers,
  RefreshCw,
  Move
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

// Helper: Check if point is near a handle
const HANDLE_SIZE = 8;
const getResizeHandle = (x, y, rect, scale) => {
  const handles = [
    { type: 'tl', cx: rect.x, cy: rect.y },
    { type: 'tr', cx: rect.x + rect.w, cy: rect.y },
    { type: 'bl', cx: rect.x, cy: rect.y + rect.h },
    { type: 'br', cx: rect.x + rect.w, cy: rect.y + rect.h },
  ];

  // Check within HANDLE_SIZE pixels (in screen coordinates logic)
  const threshold = HANDLE_SIZE / scale; 

  for (const h of handles) {
    if (Math.abs(x - h.cx) <= threshold && Math.abs(y - h.cy) <= threshold) {
      return h.type;
    }
  }
  return null;
};

export default function App() {
  const tesseractLoaded = useTesseract();
  
  // State Structure
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentImageElem, setCurrentImageElem] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isOcrEnabled, setIsOcrEnabled] = useState(true);

  // Interaction State
  const [interactionMode, setInteractionMode] = useState('IDLE'); // 'IDLE', 'DRAWING', 'MOVING', 'RESIZING'
  const [startPos, setStartPos] = useState({ x: 0, y: 0 }); // Mouse start pos
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Offset for moving
  const [activeHandle, setActiveHandle] = useState(null); // 'tl', 'tr', etc.
  
  const [currentRect, setCurrentRect] = useState(null); // Temporary rect while creating
  const [selectedRectId, setSelectedRectId] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Helpers
  const currentPage = pages[currentPageIndex];
  const rects = currentPage ? currentPage.rects : [];
  const selectedRect = rects.find(r => r.id === selectedRectId);

  // Update Rects Wrapper
  const setRects = useCallback((newRectsOrUpdater) => {
    setPages(prevPages => {
        if (!prevPages[currentPageIndex]) return prevPages;
        
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
  }, [currentPageIndex]);

  // --- Load Images ---
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newPages = files.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        src: URL.createObjectURL(file),
        name: file.name,
        rects: [],
        width: 0,
        height: 0
    }));

    setPages(prev => [...prev, ...newPages]);
    
    if (pages.length === 0) {
        setCurrentPageIndex(0);
        setScale(1.0);
    }
  };

  useEffect(() => {
    if (!currentPage) {
        setCurrentImageElem(null);
        return;
    }
    const img = new Image();
    img.onload = () => setCurrentImageElem(img);
    img.src = currentPage.src;
  }, [currentPage?.src]);

  // --- OCR Logic ---
  const runOcr = async (rectItem, imgElem = currentImageElem) => {
    if (!window.Tesseract || !imgElem) return;

    // Set loading state
    setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, isOcrRunning: true } : r));

    try {
        const canvas = document.createElement('canvas');
        // Add slight padding for better OCR? keeping it strict for now
        canvas.width = rectItem.w;
        canvas.height = rectItem.h;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(
            imgElem,
            rectItem.x, rectItem.y, rectItem.w, rectItem.h,
            0, 0, rectItem.w, rectItem.h
        );

        const result = await window.Tesseract.recognize(canvas, 'jpn+eng', {});
        const text = result.data.text.trim();

        setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, text: text, isOcrRunning: false } : r));
    } catch (err) {
        console.error("OCR Error", err);
        setRects(prev => prev.map(r => r.id === rectItem.id ? { ...r, text: "Error", isOcrRunning: false } : r));
    }
  };

  // --- Canvas Drawing ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImageElem) return;

    const ctx = canvas.getContext('2d');
    const displayWidth = Math.floor(currentImageElem.naturalWidth * scale);
    const displayHeight = Math.floor(currentImageElem.naturalHeight * scale);
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // 1. Draw Image
    ctx.drawImage(currentImageElem, 0, 0, displayWidth, displayHeight);

    // 2. Draw Rects
    const allRects = currentRect ? [...rects, currentRect] : rects;

    allRects.forEach(rect => {
      const x = rect.x * scale;
      const y = rect.y * scale;
      const w = rect.w * scale;
      const h = rect.h * scale;
      const isSelected = rect.id === selectedRectId;

      // Fill
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(x, y, w, h);

      // Stroke
      ctx.lineWidth = 2;
      ctx.strokeStyle = isSelected ? '#ef4444' : '#3b82f6';
      
      if (isSelected) {
          // Dashed line for selected
          ctx.setLineDash([4, 2]); 
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);

          // Draw Resize Handles
          ctx.fillStyle = '#ef4444'; // Red handles
          const handleSize = HANDLE_SIZE; 
          const half = handleSize / 2;

          // Corners: TL, TR, BL, BR
          const coords = [
              { x: x - half, y: y - half },
              { x: x + w - half, y: y - half },
              { x: x - half, y: y + h - half },
              { x: x + w - half, y: y + h - half },
          ];

          coords.forEach(c => {
             ctx.fillRect(c.x, c.y, handleSize, handleSize);
          });

      } else {
          ctx.strokeRect(x, y, w, h);
      }
    });
  }, [currentImageElem, scale, rects, currentRect, selectedRectId]);

  useEffect(() => {
    draw();
  }, [draw]);

  // --- Mouse Interaction Logic ---

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale
    };
  };

  const handleMouseDown = (e) => {
    if (!currentImageElem) return;
    const pos = getMousePos(e);
    
    // 1. Check if clicking on a handle of the selected rect
    if (selectedRectId) {
        const rect = rects.find(r => r.id === selectedRectId);
        if (rect) {
            const handle = getResizeHandle(pos.x, pos.y, rect, scale);
            if (handle) {
                setInteractionMode('RESIZING');
                setActiveHandle(handle);
                setStartPos(pos); // Store initial click for diff calculations? Or just use absolute pos in move
                return;
            }
        }
    }

    // 2. Check if clicking INSIDE a rect (Selection / Move)
    // Iterate in reverse to select top-most
    const clickedRect = [...rects].reverse().find(r => 
        pos.x >= r.x && pos.x <= r.x + r.w &&
        pos.y >= r.y && pos.y <= r.y + r.h
    );

    if (clickedRect) {
        setSelectedRectId(clickedRect.id);
        setInteractionMode('MOVING');
        setDragOffset({
            x: pos.x - clickedRect.x,
            y: pos.y - clickedRect.y
        });
    } else {
        // 3. Start Drawing New Rect
        setSelectedRectId(null);
        setInteractionMode('DRAWING');
        setStartPos(pos);
    }
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);

    // Cursor styling logic
    if (interactionMode === 'IDLE') {
         if (selectedRectId) {
             const rect = rects.find(r => r.id === selectedRectId);
             if (rect && getResizeHandle(pos.x, pos.y, rect, scale)) {
                 canvasRef.current.style.cursor = 'nwse-resize'; // Simplify cursor for now
             } else if (rect && pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h) {
                 canvasRef.current.style.cursor = 'move';
             } else {
                 canvasRef.current.style.cursor = 'crosshair';
             }
         } else {
             canvasRef.current.style.cursor = 'crosshair';
         }
    }

    if (interactionMode === 'DRAWING') {
        setCurrentRect({
          x: Math.min(startPos.x, pos.x),
          y: Math.min(startPos.y, pos.y),
          w: Math.abs(pos.x - startPos.x),
          h: Math.abs(pos.y - startPos.y),
          id: 'temp'
        });
    } 
    else if (interactionMode === 'MOVING' && selectedRectId) {
        setRects(prev => prev.map(r => {
            if (r.id !== selectedRectId) return r;
            return {
                ...r,
                x: pos.x - dragOffset.x,
                y: pos.y - dragOffset.y
            };
        }));
    }
    else if (interactionMode === 'RESIZING' && selectedRectId && activeHandle) {
        setRects(prev => prev.map(r => {
            if (r.id !== selectedRectId) return r;
            
            let { x, y, w, h } = r;
            
            // Simple resize logic based on handle
            if (activeHandle.includes('l')) { // Left
                const newW = (x + w) - pos.x;
                if (newW > 5) { x = pos.x; w = newW; }
            }
            if (activeHandle.includes('r')) { // Right
                const newW = pos.x - x;
                if (newW > 5) { w = newW; }
            }
            if (activeHandle.includes('t')) { // Top
                const newH = (y + h) - pos.y;
                if (newH > 5) { y = pos.y; h = newH; }
            }
            if (activeHandle.includes('b')) { // Bottom
                const newH = pos.y - y;
                if (newH > 5) { h = newH; }
            }

            return { ...r, x, y, w, h };
        }));
    }
  };

  const handleMouseUp = () => {
    if (interactionMode === 'DRAWING') {
        if (currentRect && currentRect.w > 5 && currentRect.h > 5) {
            const newRect = {
                ...currentRect,
                id: Date.now(),
                text: '',
                isOcrRunning: false
            };
            setRects(prev => [...prev, newRect]);
            setSelectedRectId(newRect.id); // Auto-select new rect
            if (isOcrEnabled) runOcr(newRect);
        }
        setCurrentRect(null);
    }
    // Moving/Resizing done: no special action needed, state already updated
    // Should we auto-OCR on resize? Maybe not, it might overwrite manual text. 
    // We'll rely on the manual "Re-OCR" button for existing rects.

    setInteractionMode('IDLE');
    setActiveHandle(null);
  };


  // --- Actions ---
  const handleDeleteRect = (id) => {
    setRects(prev => prev.filter(r => r.id !== id));
    if (selectedRectId === id) setSelectedRectId(null);
  };

  const handleTextChange = (id, newText) => {
    setRects(prev => prev.map(r => r.id === id ? { ...r, text: newText } : r));
  };

  // Batch Export CSV
  const handleExportAllCSV = () => {
    if (pages.length === 0) return;

    let csvContent = "page_index,file_name,rect_id,x,y,width,height,text\n";
    
    pages.forEach((page, pIndex) => {
        page.rects.forEach(r => {
            const safeText = (r.text || "").replace(/"/g, '""');
            csvContent += `${pIndex + 1},"${page.name}",${r.id},${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)},"${safeText}"\n`;
        });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'all_annotations.csv';
    link.click();
  };

  // Batch Export JSON
  const handleExportAllJSON = () => {
    if (pages.length === 0) return;

    const exportData = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        pages: pages.map((page, index) => ({
            page_index: index + 1,
            file_name: page.name,
            annotations: page.rects.map(r => ({
                id: r.id,
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.w),
                height: Math.round(r.h),
                text: r.text
            }))
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'all_annotations.json';
    link.click();
  };

  // Standard controls
  const handleZoomSlider = (e) => setScale(parseFloat(e.target.value));
  const handleZoomStep = (step) => setScale(prev => Math.min(Math.max(0.1, prev + step), 5.0));
  const handlePrevPage = () => { setCurrentPageIndex(prev => Math.max(0, prev - 1)); setSelectedRectId(null); };
  const handleNextPage = () => { setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1)); setSelectedRectId(null); };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* Header */}
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
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        {/* Pagination */}
        {pages.length > 0 && (
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1 mx-4">
                <button onClick={handlePrevPage} disabled={currentPageIndex === 0} className="p-1.5 rounded hover:bg-white disabled:opacity-30">
                    <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-mono w-20 text-center">{currentPageIndex + 1} / {pages.length}</span>
                <button onClick={handleNextPage} disabled={currentPageIndex === pages.length - 1} className="p-1.5 rounded hover:bg-white disabled:opacity-30">
                    <ChevronRight size={20} />
                </button>
            </div>
        )}

        <div className="flex items-center space-x-4">
            {/* Zoom */}
            <div className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded-lg hidden md:flex">
                <button onClick={() => handleZoomStep(-0.05)} className="p-1 hover:bg-gray-200 rounded"><ZoomOut size={18} /></button>
                <input type="range" min="0.1" max="3.0" step="0.05" value={scale} onChange={handleZoomSlider} className="w-20 lg:w-32 h-2 mx-2" />
                <button onClick={() => handleZoomStep(0.05)} className="p-1 hover:bg-gray-200 rounded"><ZoomIn size={18} /></button>
            </div>

            <button 
                onClick={() => setIsOcrEnabled(!isOcrEnabled)}
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${isOcrEnabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            >
                <Type size={16} />
                <span className="hidden lg:inline">OCR: {isOcrEnabled ? "ON" : "OFF"}</span>
            </button>

            <div className="flex space-x-2">
                <button 
                    onClick={handleExportAllCSV}
                    disabled={pages.length === 0}
                    className="flex items-center gap-1 bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                    title="全ページをCSV出力"
                >
                    <FileText size={16} />
                </button>
                <button 
                    onClick={handleExportAllJSON}
                    disabled={pages.length === 0}
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                    title="全ページをJSON出力"
                >
                    <FileJson size={16} />
                </button>
            </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Canvas Container */}
        <div 
            ref={containerRef}
            className="flex-1 bg-gray-200 overflow-auto flex relative select-none"
        >
          <div className="m-auto p-8">
            {pages.length === 0 ? (
                <div className="text-center text-gray-400">
                    <Layers className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">画像を追加してください</p>
                </div>
            ) : (
                currentImageElem ? (
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
                ) : (
                    <div className="flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" /> Loading...</div>
                )
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
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{rects.length}</span>
                </div>
                {currentPage && <div className="text-xs text-gray-500 truncate">{currentPage.name}</div>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {rects.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center mt-10">ドラッグして矩形を作成</p>
                ) : (
                    rects.map((rect, index) => (
                        <div 
                            key={rect.id} 
                            className={`p-3 rounded-lg border transition-all ${selectedRectId === rect.id ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                            onClick={() => setSelectedRectId(rect.id)}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{index + 1}</span>
                                <div className="flex gap-1">
                                    {/* Re-OCR Button */}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); runOcr(rect); }}
                                        className="text-gray-400 hover:text-blue-500 p-0.5 rounded transition-colors"
                                        title="この矩形を再OCR"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteRect(rect.id); }}
                                        className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"
                                        title="削除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="relative">
                                {rect.isOcrRunning ? (
                                    <div className="flex items-center gap-2 text-xs text-blue-600 h-9 bg-blue-50/50 rounded px-2">
                                        <Loader2 size={14} className="animate-spin" /> Reading...
                                    </div>
                                ) : (
                                    <textarea
                                        value={rect.text}
                                        onChange={(e) => handleTextChange(rect.id, e.target.value)}
                                        className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[60px] resize-y"
                                        placeholder="テキスト..."
                                    />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="p-2 border-t bg-gray-50 text-xs text-gray-500 text-center">
                ヒント: 矩形を選択してドラッグで移動、四隅でリサイズ可能
            </div>
        </div>
      </div>
    </div>
  );
}
