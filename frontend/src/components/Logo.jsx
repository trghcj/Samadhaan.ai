import React, { useId } from 'react';

// The Samadhaan.ai mark (speech bubble + microphone + sound waves); same drawing as public/logo.svg.
const Logo = ({ size = 32, title }) => {
  const gid = useId().replace(/:/g, '');
  const fill = `url(#${gid})`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#FF4D12" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="31" r="20" fill={fill} />
      <path d="M9 41 L5 58 L21 50 Z" fill={fill} />
      <rect x="19.5" y="16" width="9" height="16.5" rx="4.5" fill="#fff" />
      <path d="M14.5 27.5 a9.5 9.5 0 0 0 19 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 37 v5.5 M19.5 43.5 h9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 22.5 A11 11 0 0 1 48 39.5" fill="none" stroke={fill} strokeWidth="4" strokeLinecap="round" />
      <path d="M53.5 17 A17.5 17.5 0 0 1 53.5 45" fill="none" stroke={fill} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

export default Logo;
