'use client'

import { useState, useRef, useEffect } from 'react';
import Button from '../ui/Button';
import { Paperclip, X } from 'lucide-react';

export default function MessageInput({ onSendMessage, disabled, isStreaming }) {
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState(null); // State untuk URL pratinjau
  const [imageData, setImageData] = useState(null); // State untuk data gambar { base64: string, mimeType: string }
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null); //Ref untuk pinput file
;

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if ( file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result
          .replace('data:', '')
          .replace(/^.+,/, '');
        
        setImageData({
          base64: base64String,
          mimeType: file.type,
        });
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImageData(null);
      setImagePreview(null);
      console.warn("File yang dipilih bukan gambar atau tidak ada file.");
    }

    if(fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  }

  const handleRemoveImage = () => {
    setImageData(null);
    setImagePreview(null);
  };

  /**
   * Handle send message (termasuk gambar jika ada)
   */
  const handleSend = () => {
    // Bisa kirim jika ada teks ATAU gambar, dan tidak sedang disabled/streaming
    if ((message.trim() || imageData) && !disabled && !isStreaming) {
      onSendMessage({
          content: message,
          image: imageData // Kirim data gambar
      });
      setMessage('');
      handleRemoveImage(); // Hapus gambar setelah dikirim

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset tinggi textarea
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleComposition = (e) => {
    if (e.type === 'compositionstart') {
      setIsComposing(true);
    }
    if (e.type === 'compositionend') {
      setIsComposing(false);
    }
  };

  /**
   * Auto-resize textarea
   */
  const handleInput = (e) => {
    setMessage(e.target.value);
    
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const canSend = message.trim() && !disabled && !isStreaming;

  const getPlaceholder = () => {
    if (isStreaming) return "AI is thinking...";
    if (disabled) return "Please select or create a chat to start messaging...";
    return "Message TmaChat... (Press Enter to send)";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="flex space-x-3 items-end">

        {/* Tombol Attach */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }} // Sembunyikan input file asli
        />
        <Button
            variant="outline"
            onClick={handleAttachClick}
            disabled={disabled || isStreaming || !!imageData} // Disable jika sudah ada gambar
            className={`p-3 rounded-full flex-shrink-0 ${disabled || isStreaming || !!imageData ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Lampirkan Gambar"
        >
          <Paperclip className="w-5 h-5 text-gray-600" />
        </Button>

        {/* Area Input & Pratinjau Gambar */}
        <div className={`flex-1 flex flex-col rounded-2xl border transition-all duration-200 ${
          disabled || isStreaming
            ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
            : 'bg-white border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200'
        }`}>
          {/* Pratinjau Gambar */}
          {imagePreview && (
            <div className="relative p-2 border-b border-gray-200">
              <img src={imagePreview} alt="Pratinjau" className="max-h-20 rounded" />
              <button
                onClick={handleRemoveImage}
                className="absolute top-1 right-1 bg-gray-700 bg-opacity-50 text-white rounded-full p-0.5 hover:bg-opacity-75"
                title="Hapus Gambar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleComposition}
            onCompositionEnd={handleComposition}
            placeholder={getPlaceholder()}
            disabled={disabled || isStreaming}
            rows="1"
            className="w-full bg-transparent border-none resize-none py-3 px-4 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-0 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px' }} // Pastikan tinggi minimal
          />
        </div>

        {/* Tombol Kirim */}
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className={`px-6 py-3 transition-all duration-200 flex-shrink-0 ${
            canSend
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title={canSend ? "Kirim pesan" :
                disabled ? "Pilih chat dulu" :
                isStreaming ? "AI sedang merespons..." : "Ketik pesan atau lampirkan gambar"}
        >
          {/* ... (ikon loading atau send tetap sama) ... */}
           {isStreaming ? (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send</span>
            </div>
          )}
        </Button>
      </div>

      {/* Helper Text */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        {isStreaming ? "AI sedang menghasilkan respons... Mohon tunggu" :
         disabled ? "💡 Buat chat baru atau pilih dari sidebar untuk memulai" :
         "Tekan Enter untuk kirim, Shift+Enter untuk baris baru"}
      </div>
    </div>
  );
}