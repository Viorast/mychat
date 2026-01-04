'use client';

/**
 * SuggestedQuestions Component
 * Features: 
 * - Pill Design
 * - Text Truncation (Short preview)
 * - Custom Elegant Tooltip on Hover (Full text)
 */
export default function SuggestedQuestions({ suggestions, onQuestionClick }) {
    if (!suggestions || suggestions.length === 0) {
        return null;
    }

    return (
        <div className="suggested-questions">
            <div className="suggestions-list">
                {suggestions.map((question, index) => (
                    <button
                        key={index}
                        className="suggestion-item group" /* group class for potential tailwind usage, though using style jsx */
                        onClick={() => onQuestionClick(question)}
                    >
                        <span className="suggestion-text">{question}</span>

                        {/* Custom Tooltip Container */}
                        <div className="custom-tooltip">
                            {question}
                            {/* Arrow Pointer */}
                            <div className="tooltip-arrow"></div>
                        </div>
                    </button>
                ))}
            </div>

            <style jsx>{`
                .suggested-questions {
                    margin-bottom: 8px;
                    padding: 0 4px;
                }

                .suggestions-list {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    justify-content: flex-start;
                    gap: 8px;
                }

                .suggestion-item {
                    position: relative; /* Anchor for absolute tooltip */
                    display: inline-flex;
                    align-items: center;
                    padding: 6px 16px;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 9999px;
                    color: #64748b;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    max-width: 200px;
                    overflow: visible; /* Allow tooltip to overflow */
                }

                .suggestion-item:hover {
                    background: #f1f5f9;
                    border-color: #cbd5e1;
                    color: #334155;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    z-index: 10; /* Bring to front on hover */
                }

                .suggestion-item:active {
                    transform: translateY(0);
                    background: #e2e8f0;
                }

                .suggestion-text {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                }

                /* --- CUSTOM TOOLTIP STYLES --- */
                .custom-tooltip {
                    position: absolute;
                    bottom: 100%;      /* Above the item */
                    left: 50%;         /* Center horizontally */
                    transform: translateX(-50%) translateY(8px); /* Start slightly down for animation */
                    margin-bottom: 10px; /* Gap from item */
                    
                    background-color: #1e293b; /* Slate-800 nicely dark */
                    color: #f8fafc;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    line-height: 1.4;
                    font-weight: 400;
                    text-align: center;
                    
                    /* Size constraints */
                    width: max-content;
                    max-width: 280px;  /* Limit width for reading comfort */
                    white-space: normal; /* Allow text wrapping inside tooltip */
                    
                    /* Design details */
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                    pointer-events: none; /* Mouse passes through to button */
                    
                    /* Animation Defaults */
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }

                /* Arrow Element */
                .tooltip-arrow {
                    position: absolute;
                    top: 100%; /* Bottom of tooltip */
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0; 
                    height: 0; 
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 6px solid #1e293b; /* Match tooltip bg */
                }

                /* Hover Effects to Show Tooltip */
                .suggestion-item:hover .custom-tooltip {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0); /* Float up to position */
                }

                /* Responsive Mobile */
                @media (max-width: 640px) {
                    .suggestion-item {
                        padding: 5px 12px;
                        font-size: 11px;
                        max-width: 150px;
                    }
                    /* Hide tooltip on mobile if desired, or keep generic */
                    .custom-tooltip {
                        max-width: 200px;
                        display: none; /* Native touch logic handles clicks differently, remove hover tooltips on mobile to prevent obstruction */
                    }
                }
            `}</style>
        </div>
    );
}
