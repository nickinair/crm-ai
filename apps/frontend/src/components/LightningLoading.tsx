import React from 'react';
import './LightningLoading.css';

const LightningLoading: React.FC = () => (
  <div className="lightning-loading-wrapper">
    <svg 
      className="lightning-icon"
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="boltFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <filter id="edgeGlow">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="edgeGlowStrong">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* 闪电填充 */}
      <path 
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
        fill="url(#boltFillGrad)" 
        opacity="0.9"
      />
      {/* 拖尾层4 - 最暗 */}
      <path 
        className="bolt-trail bolt-trail-4"
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
        fill="none"
        stroke="rgba(168, 130, 255, 0.15)"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* 拖尾层3 - 较暗 */}
      <path 
        className="bolt-trail bolt-trail-3"
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
        fill="none"
        stroke="rgba(190, 170, 255, 0.3)"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* 拖尾层2 - 较亮 */}
      <path 
        className="bolt-trail bolt-trail-2"
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
        fill="none"
        stroke="rgba(220, 210, 255, 0.55)"
        strokeWidth="0.6"
        strokeLinejoin="round"
        filter="url(#edgeGlow)"
      />
      {/* 头部层1 - 最亮（白色光头） */}
      <path 
        className="bolt-trail bolt-trail-1"
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
        fill="none"
        stroke="rgba(255, 255, 255, 0.95)"
        strokeWidth="0.7"
        strokeLinejoin="round"
        filter="url(#edgeGlowStrong)"
      />
    </svg>
  </div>
);

export default LightningLoading;
