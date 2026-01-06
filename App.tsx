
import React, { useState, useRef, useMemo } from 'react';
import { 
  History as HistoryIcon, 
  Sparkles, 
  Trash2, 
  Camera,
  ChevronRight,
  Droplets,
  X,
  Scan,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Download,
  ArrowRight,
  Upload,
  AlertCircle,
  Copy,
  Check,
  TableProperties,
  Layers
} from 'lucide-react';
import { Constants, CalculationResult } from './types';
import { getFragranceInsights, analyzePerfumeScaleImage, analyzeBatchDocument, BatchItem } from './services/geminiService';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [inputWeight, setInputWeight] = useState<string>('');
  const [inputLabel, setInputLabel] = useState<string>('');
  const [history, setHistory] = useState<CalculationResult[]>([]);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [scannerMode, setScannerMode] = useState<'single' | 'batch'>('single');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format price with thousands separator (comma)
  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US');
  };

  const resolvedWeight = useMemo(() => {
    let raw = inputWeight.trim();
    if (!raw) return 0;
    try {
      let cleaned = raw.toLowerCase().replace(/,/g, '');
      cleaned = cleaned.replace(/(\d+)kg(\d+)/g, (_, kg, g) => (parseInt(kg) * 1000 + parseInt(g)).toString());
      cleaned = cleaned.replace(/(\d*\.?\d+)\s*kg/g, (_, n) => (parseFloat(n) * 1000).toString());
      cleaned = cleaned.replace(/(\d*\.?\d+)\s*g/g, "$1");
      if (!/^[0-9.+\-*/\s()]+$/.test(cleaned)) return NaN;
      // eslint-disable-next-line no-new-func
      const result = new Function(`return ${cleaned}`)();
      return typeof result === 'number' && isFinite(result) ? result : NaN;
    } catch {
      return NaN;
    }
  }, [inputWeight]);

  const calculatePrice = (weight: number) => {
    const netWeight = Math.max(0, weight - Constants.BOTTLE_GROSS_WEIGHT);
    const price = netWeight * Constants.PRICE_PER_UNIT;
    return { netWeight, price };
  };

  const handleCalculate = (weightValue?: number, labelValue?: string) => {
    const weight = weightValue !== undefined ? weightValue : resolvedWeight;
    const label = labelValue !== undefined ? labelValue : (inputLabel || `Item ${history.length + 1}`);
    
    if (isNaN(weight) || weight <= 0) return;

    const { netWeight, price } = calculatePrice(weight);
    const newResult: CalculationResult = {
      id: Math.random().toString(36).substr(2, 9) + Date.now(),
      timestamp: Date.now(),
      grossWeight: weight,
      netWeight,
      price,
      label,
    };

    // Add to pending history list
    setHistory(prev => [newResult, ...prev]);
    
    // Clear inputs for next entry
    if (weightValue === undefined) {
      setInputWeight('');
      setInputLabel('');
    }
  };

  const askAi = async (query: string) => {
    setIsAiLoading(true);
    try {
      const response = await getFragranceInsights(query);
      setAiResponse(response);
    } catch (error) {
      console.error("AI Assistant Error:", error);
      setAiResponse("I'm having trouble providing insights right now. Please try again later.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const copyAsText = (item?: CalculationResult) => {
    let text = "";
    if (item) {
      text = `${item.label} | Gross: ${item.grossWeight}g | Total: ${formatPrice(item.price)} ${Constants.CURRENCY}`;
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      text = history.map((i, idx) => `${history.length - idx}. ${i.label} - ${formatPrice(i.price)} ${Constants.CURRENCY}`).join('\n');
      text += `\n\nTotal Batch Value: ${formatPrice(history.reduce((a, b) => a + b.price, 0))} ${Constants.CURRENCY}`;
      setCopiedId('batch-text');
      setTimeout(() => setCopiedId(null), 2000);
    }
    navigator.clipboard.writeText(text);
  };

  const copyAsCSV = () => {
    if (history.length === 0) return;
    const header = "Fragrance Name,Gross Weight (g),Net (ml),Total Price (TSh)\n";
    const rows = history.map(item => 
      `${item.label},${item.grossWeight},${item.netWeight.toFixed(2)},${item.price}`
    ).join('\n');
    navigator.clipboard.writeText(header + rows);
    setCopiedId('batch-csv');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const processImageContent = async (base64: string, mode: 'single' | 'batch') => {
    setIsAiLoading(true);
    setAiResponse("Scanning document for names and weights...");
    try {
      if (mode === 'single') {
        const weight = await analyzePerfumeScaleImage(base64);
        if (weight > 0) setInputWeight(weight.toString());
        setAiResponse(`Detected Weight: ${weight}g`);
      } else {
        const items = await analyzeBatchDocument(base64);
        if (items.length > 0) {
          items.forEach((item: BatchItem) => handleCalculate(item.weight, item.name));
          setAiResponse(`Successfully found ${items.length} items in document. Added to pending batch.`);
        } else {
          setAiResponse("No valid data found in the image. Please try a clearer photo.");
        }
      }
    } catch (err) {
      setAiResponse("Processing error. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1];
      await processImageContent(base64, 'batch');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const exportToExcel = () => {
    if (history.length === 0) return;
    // Removed Timestamp column per request
    const data = history.map((item) => ({
      'Fragrance Name': item.label,
      'Gross Weight (g)': item.grossWeight,
      'Net Weight (ml)': item.netWeight.toFixed(2),
      'Total Amount (TSh)': item.price
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Batch");
    XLSX.writeFile(wb, `ScentValue_BatchExport_${Date.now()}.xlsx`);
  };

  const exportToPDF = () => {
    if (history.length === 0) return;
    const doc = new jsPDF() as any;
    doc.setFontSize(22);
    doc.text("Inventory Valuation Batch", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Pricing Rate: ${Constants.PRICE_PER_UNIT} TSh/g | Bottle Tare: ${Constants.BOTTLE_GROSS_WEIGHT}g`, 14, 30);
    
    const tableData = history.map((item) => [
      item.label,
      `${item.grossWeight.toLocaleString()}g`,
      `${item.netWeight.toFixed(2)}ml`,
      `${formatPrice(item.price)} TSh`
    ]);

    doc.autoTable({
      startY: 40,
      head: [['Fragrance Name', 'Gross Wt', 'Net Vol', 'Total Price']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillStyle: [20, 20, 20] },
    });

    const totalValue = history.reduce((acc, curr) => acc + curr.price, 0);
    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Total Batch Value: ${formatPrice(totalValue)} TSh`, 14, finalY + 15);
    doc.save(`ScentValue_BatchReport_${Date.now()}.pdf`);
  };

  const startCamera = (mode: 'single' | 'batch' = 'single') => {
    setScannerMode(mode);
    setCameraError(null);
    navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
    }).then(stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    }).catch(() => {
      setCameraError("Camera blocked. Please use the Upload button below to scan your document.");
    });
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const base64 = canvasRef.current.toDataURL('image/jpeg', 0.9).split(',')[1];
        await processImageContent(base64, scannerMode);
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#F8F7F4]">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

      {/* Navbar */}
      <nav className="w-full border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-stone-900 rounded-full flex items-center justify-center">
              <Droplets className="text-stone-100 w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold font-serif text-stone-900 uppercase tracking-tighter">ScentValue Pro</h1>
              <p className="text-[9px] uppercase tracking-widest font-bold text-stone-400">Professional Batch Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={() => askAi("How do I use the batch feature to export multiple items to Excel?")}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 bg-white hover:border-stone-900 transition-all shadow-sm text-xs font-bold text-stone-600 uppercase"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-pulse text-amber-500' : 'text-stone-400'}`} />
              Help
            </button>
          </div>
        </div>
      </nav>

      <main className="w-full max-w-7xl px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Entry Interface */}
        <div className="lg:col-span-8 space-y-6">
          
          {cameraError && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-3 text-amber-800 animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-xs font-medium">{cameraError}</p>
              <button onClick={() => setCameraError(null)} className="ml-auto p-1 hover:bg-amber-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <section className="bg-white rounded-[2rem] p-8 sm:p-12 shadow-sm border border-stone-100 relative overflow-hidden">
            <header className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-stone-50 pb-8 gap-4">
              <div>
                <h2 className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.3em] mb-2">Manual Entry</h2>
                <h3 className="text-4xl font-serif text-stone-800 leading-none">New Entry</h3>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => startCamera('single')} 
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-4 rounded-2xl bg-stone-50 hover:bg-stone-900 hover:text-white transition-all border border-stone-200 font-bold text-[10px] uppercase tracking-widest"
                >
                  <Camera className="w-4 h-4" /> Scan Scale
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-4 rounded-2xl bg-stone-50 hover:bg-stone-900 hover:text-white transition-all border border-stone-200 font-bold text-[10px] uppercase tracking-widest"
                >
                  <Upload className="w-4 h-4" /> Import List
                </button>
              </div>
            </header>

            <div className="space-y-8">
              <div className="space-y-6">
                <div className="relative group">
                   <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-3">Fragrance Name (Sauvage Dior, etc.)</label>
                   <input 
                    type="text"
                    value={inputLabel}
                    onChange={(e) => setInputLabel(e.target.value)}
                    placeholder="Enter name"
                    className="w-full text-2xl sm:text-4xl font-serif bg-transparent border-b-2 border-stone-100 focus:border-stone-900 outline-none pb-2 transition-all placeholder:text-stone-100"
                   />
                </div>

                <div className="relative group">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">Gross Weight Reading</label>
                    {inputWeight && !isNaN(resolvedWeight) && (
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-widest">
                        {resolvedWeight.toLocaleString()}g (Verified)
                      </span>
                    )}
                  </div>
                  <div className="flex items-end border-b-2 border-stone-100 focus-within:border-stone-900 transition-all pb-2">
                    <input 
                      type="text"
                      value={inputWeight}
                      onChange={(e) => setInputWeight(e.target.value)}
                      placeholder="1kg136"
                      className="w-full text-5xl sm:text-7xl font-serif bg-transparent outline-none text-stone-900 placeholder:text-stone-100"
                    />
                    <span className="text-xl font-serif text-stone-300 mb-2">g</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl bg-stone-50 border border-stone-100 flex flex-col gap-1">
                   <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tare Deduction</span>
                   <span className="text-xl font-serif text-stone-700">-{Constants.BOTTLE_GROSS_WEIGHT}g</span>
                </div>
                <div className="p-6 rounded-2xl bg-stone-50 border border-stone-100 flex flex-col gap-1">
                   <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Pricing Rate</span>
                   <span className="text-xl font-serif text-stone-700">{Constants.PRICE_PER_UNIT} {Constants.CURRENCY}/g</span>
                </div>
              </div>

              <button 
                onClick={() => handleCalculate()}
                disabled={!inputWeight || isNaN(resolvedWeight) || resolvedWeight <= 0}
                className="w-full h-20 bg-stone-900 text-white rounded-2xl font-bold uppercase tracking-[0.3em] text-xs hover:bg-black transition-all disabled:opacity-20 flex items-center justify-center gap-3 active:scale-95 shadow-xl"
              >
                Add to Pending Batch <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Pending Batch & Export Options */}
          <section className="bg-white rounded-[2rem] p-8 sm:p-10 shadow-sm border border-stone-100">
            <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.3em] mb-1">Batch Management</h4>
                <h5 className="text-2xl font-serif text-stone-800">Export All Pending</h5>
              </div>
              <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scroll-smooth no-scrollbar">
                <button 
                  onClick={() => copyAsText()}
                  disabled={history.length === 0}
                  className="flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 bg-white"
                >
                  {copiedId === 'batch-text' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-stone-400" />}
                  Copy TXT
                </button>
                <button 
                  onClick={() => copyAsCSV()}
                  disabled={history.length === 0}
                  className="flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 bg-white"
                >
                  {copiedId === 'batch-csv' ? <Check className="w-4 h-4 text-emerald-500" /> : <TableProperties className="w-4 h-4 text-stone-400" />}
                  Excel TXT (CSV)
                </button>
                <button 
                  onClick={exportToExcel}
                  disabled={history.length === 0}
                  className="flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-900 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 bg-white shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:text-white" />
                  Save Excel
                </button>
                <button 
                  onClick={exportToPDF}
                  disabled={history.length === 0}
                  className="flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 bg-white"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  Save PDF
                </button>
              </div>
            </header>
            
            <div className="p-8 rounded-[2rem] bg-stone-900 text-white relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
               <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] pointer-events-none" />
               <div className="relative z-10 text-center sm:text-left">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] block mb-2">Current Batch Valuation</span>
                  <div className="flex items-end gap-3 justify-center sm:justify-start">
                    <span className="text-6xl font-serif text-white tracking-tight">
                      {formatPrice(history.reduce((a, b) => a + b.price, 0))}
                    </span>
                    <span className="text-xl font-serif text-amber-500 mb-2 uppercase tracking-widest">{Constants.CURRENCY}</span>
                  </div>
               </div>
               <div className="relative z-10 flex flex-col items-center sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-white/10 pt-6 sm:pt-0 sm:pl-8">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">{history.length} ITEMS READY FOR EXPORT</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Bulk Export Active</span>
                  </div>
               </div>
            </div>
          </section>
        </div>

        {/* Sidebar Pending Logs */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Pending Batch Items */}
          <div className="bg-white rounded-[2rem] p-8 border border-stone-100 shadow-sm flex flex-col max-h-[850px]">
            <header className="flex items-center justify-between mb-8 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-stone-400" />
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">Pending Batch</h4>
              </div>
              <button 
                onClick={() => setHistory([])}
                className="p-2 text-stone-200 hover:text-red-400 transition-all"
                title="Clear Batch"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </header>
            
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {history.length === 0 ? (
                <div className="text-center py-24 grayscale opacity-20">
                  <HistoryIcon className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No pending items</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="group p-5 rounded-2xl bg-stone-50 border border-stone-100 hover:border-stone-900 transition-all animate-in slide-in-from-bottom-2 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="max-w-[70%]">
                        <h6 className="text-sm font-bold text-stone-800 line-clamp-1">{item.label}</h6>
                        <span className="text-[9px] text-stone-400 uppercase font-bold tracking-widest">
                          {item.grossWeight}g Reading
                        </span>
                      </div>
                      <button 
                        onClick={() => copyAsText(item)}
                        className="p-2 rounded-lg bg-white border border-stone-100 text-stone-400 hover:text-stone-900 shadow-sm transition-all"
                        title="Copy Item Info"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-[10px] font-bold text-stone-500 uppercase flex gap-2">
                        <span>Net: {item.netWeight.toFixed(1)}ml</span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-serif text-stone-900">{formatPrice(item.price)}</span>
                        <span className="text-[9px] font-bold text-stone-300 ml-1">TSH</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assistant Info */}
          <div className="bg-stone-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-xl">
             <div className="absolute top-0 right-0 p-8 opacity-5">
               <Sparkles className="w-32 h-32" />
             </div>
             <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-1 h-4 bg-amber-500 rounded-full" />
                   <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Lab Insights</h4>
                </div>
                <div className="text-xs leading-relaxed text-stone-300 italic min-h-[100px] max-h-[300px] overflow-y-auto custom-scrollbar">
                  {isAiLoading ? (
                    <div className="flex flex-col gap-2">
                      <div className="h-2 bg-stone-800 rounded-full w-full animate-pulse" />
                      <div className="h-2 bg-stone-800 rounded-full w-4/5 animate-pulse" />
                      <div className="h-2 bg-stone-800 rounded-full w-2/3 animate-pulse" />
                    </div>
                  ) : (
                    aiResponse || "Your pending batch collects all entries here. You can then export them as a single Excel or CSV file for bulk processing."
                  )}
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Fullscreen Camera Scanner */}
      {isCameraActive && (
        <div className="fixed inset-0 bg-stone-950/98 backdrop-blur-3xl z-50 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="relative w-full max-w-4xl bg-black rounded-[3rem] overflow-hidden shadow-2xl border border-white/5">
            <video ref={videoRef} autoPlay playsInline className="w-full h-[70vh] object-cover scale-x-[-1]" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-10">
              <div className={`transition-all duration-700 border-[0.5px] border-white/20 rounded-3xl flex items-center justify-center ${scannerMode === 'batch' ? 'w-full h-full' : 'w-80 h-40'}`}>
                 <div className="w-8 h-8 border-t-2 border-l-2 border-amber-500 absolute top-0 left-0 rounded-tl-3xl" />
                 <div className="w-8 h-8 border-t-2 border-r-2 border-amber-500 absolute top-0 right-0 rounded-tr-3xl" />
                 <div className="w-8 h-8 border-b-2 border-l-2 border-amber-500 absolute bottom-0 left-0 rounded-bl-3xl" />
                 <div className="w-8 h-8 border-b-2 border-r-2 border-amber-500 absolute bottom-0 right-0 rounded-br-3xl" />
                 {scannerMode === 'batch' && (
                    <div className="flex flex-col items-center gap-2">
                      <Scan className="w-12 h-12 text-white/10" />
                      <span className="text-[9px] text-white/20 uppercase tracking-[0.5em] font-bold">Document Scanner</span>
                    </div>
                 )}
              </div>
            </div>

            <div className="absolute top-8 left-8 right-8 flex justify-between items-center">
              <div className="bg-black/80 px-5 py-2.5 rounded-full border border-white/10 flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                 <span className="text-[10px] font-bold text-white uppercase tracking-widest">{scannerMode === 'batch' ? 'AI Batch Import' : 'Digital Scale Scanner'} Active</span>
              </div>
              <button onClick={stopCamera} className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center border border-white/10 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center px-10">
               <button 
                  onClick={captureImage}
                  className="group relative w-24 h-24 rounded-full bg-white p-1.5 shadow-[0_0_50px_rgba(255,255,255,0.2)] transition-all active:scale-90"
                >
                  <div className="w-full h-full rounded-full border-4 border-stone-200 flex items-center justify-center">
                     <div className="w-16 h-16 rounded-full bg-stone-900 group-hover:bg-amber-600 transition-all duration-500" />
                  </div>
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
