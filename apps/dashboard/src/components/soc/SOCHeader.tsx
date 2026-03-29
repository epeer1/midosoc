"use client";
import { useEffect, useState } from "react";

interface SOCHeaderProps {
  queueLength: number;
  user: any;
  isAuthenticated: boolean;
  apiUrl: string;
}

export function SOCHeader({ queueLength, user, isAuthenticated, apiUrl }: SOCHeaderProps) {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' }) + " Local");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  let hostStr = "";
  try { hostStr = new URL(apiUrl).host; } catch(e) {}

  return (
    <header className="border-b border-neutral-900 bg-black/50 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${queueLength > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
          <span className={`relative inline-flex rounded-full h-3 w-3 ${queueLength > 0 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`}></span>
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-[0.2em] text-white uppercase">MIDOSOC Command Center</h1>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-0.5">Powered by Auth0 Token Vault</p>
        </div>
        {queueLength > 0 && (
          <span className="ml-2 px-2.5 py-1 rounded bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse">
            {queueLength} {queueLength === 1 ? 'Threat' : 'Threats'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-8 text-xs text-neutral-500">
         {isAuthenticated && user && (
          <div className="hidden md:flex flex-col items-end">
            <span className="uppercase tracking-widest text-[9px] mb-0.5 text-emerald-500/70">Authenticated SOC Analyst</span>
            <span className="text-white font-semibold flex items-center gap-2">
                {user.picture && <img src={user.picture} alt={user.name} className="w-4 h-4 rounded-full border border-neutral-700" />}
                {user.email || user.name}
                {!process.env.NEXT_PUBLIC_SKIP_AUTH && <a href="/auth/logout" className="ml-2 text-[9px] text-neutral-500 hover:text-red-400 uppercase tracking-widest transition-colors">Sign Out</a>}
            </span>
          </div>
        )}
        <div className="hidden md:flex flex-col items-end">
          <span className="uppercase tracking-widest text-[9px] mb-0.5">Proxy Gateway</span>
          <span className="text-neutral-300 font-semibold tracking-wider">{hostStr}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="uppercase tracking-widest text-[9px] mb-0.5">System Time</span>
          <span className="text-emerald-400 font-bold tracking-widest">{currentTime}</span>
        </div>
      </div>
    </header>
  );
}
