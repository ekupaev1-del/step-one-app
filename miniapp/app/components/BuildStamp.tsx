'use client';

import { useState, useEffect } from 'react';

export default function BuildStamp() {
  const [version, setVersion] = useState<{ gitSha?: string; env?: string; deployedAt?: string } | null>(null);
  
  useEffect(() => {
    // Fetch version from API
    fetch('/api/version')
      .then(res => res.json())
      .then(data => setVersion(data))
      .catch(() => {
        // Fallback to env vars if API fails
        setVersion({
          gitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local',
          env: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
        });
      });
  }, []);
  
  const gitSha = version?.gitSha || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local';
  const env = version?.env || process.env.NEXT_PUBLIC_VERCEL_ENV || 'development';
  const buildDate = version?.deployedAt ? new Date(version.deployedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  
  return (
    <div 
      id="build-stamp" 
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        right: 0, 
        padding: '4px 8px', 
        fontSize: '10px', 
        color: '#666', 
        backgroundColor: '#f0f0f0',
        zIndex: 9999,
        fontFamily: 'monospace',
        opacity: 0.7,
        pointerEvents: 'none',
        borderTop: '1px solid #ddd',
        borderLeft: '1px solid #ddd',
        borderRadius: '4px 0 0 0'
      }}
    >
      build: {gitSha.substring(0, 7)} | env: {env} | {buildDate}
    </div>
  );
}

